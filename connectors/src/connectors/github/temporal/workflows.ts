import {
  executeChild,
  ParentClosePolicy,
  proxyActivities,
  setHandler,
  sleep,
  workflowInfo,
} from "@temporalio/workflow";
import PQueue from "p-queue";

import type * as activities from "@connectors/connectors/github/temporal/activities";
import type { DataSourceConfig } from "@connectors/types/data_source_config";

import { newWebhookSignal } from "./signals";
import { getFullSyncWorkflowId, getReposSyncWorkflowId } from "./utils";

const { githubSaveStartSyncActivity, githubSaveSuccessSyncActivity } =
  proxyActivities<typeof activities>({
    startToCloseTimeout: "1 minute",
  });

const {
  githubGetReposResultPageActivity,
  githubGetRepoIssuesResultPageActivity,
  githubGetRepoDiscussionsResultPageActivity,
  githubIssueGarbageCollectActivity,
  githubDiscussionGarbageCollectActivity,
} = proxyActivities<typeof activities>({
  startToCloseTimeout: "5 minute",
});

const { githubRepoGarbageCollectActivity } = proxyActivities<typeof activities>(
  {
    startToCloseTimeout: "20 minute",
  }
);

const { githubUpsertIssueActivity, githubUpsertDiscussionActivity } =
  proxyActivities<typeof activities>({
    startToCloseTimeout: "60 minute",
  });

const { githubCodeSyncActivity } = proxyActivities<typeof activities>({
  startToCloseTimeout: "120 minute",
});

const MAX_CONCURRENT_REPO_SYNC_WORKFLOWS = 3;
const MAX_CONCURRENT_ISSUE_SYNC_ACTIVITIES_PER_WORKFLOW = 3;

export async function githubFullSyncWorkflow(
  dataSourceConfig: DataSourceConfig,
  githubInstallationId: string,
  connectorId: string,
  // Used to re-trigger a code-only full-sync after code syncing is enabled/disabled.
  syncCodeOnly: boolean
) {
  await githubSaveStartSyncActivity(dataSourceConfig);
  const loggerArgs = {
    dataSourceName: dataSourceConfig.dataSourceName,
    workspaceId: dataSourceConfig.workspaceId,
    githubInstallationId,
    syncCodeOnly: syncCodeOnly.toString(),
  };

  const queue = new PQueue({ concurrency: MAX_CONCURRENT_REPO_SYNC_WORKFLOWS });
  const promises: Promise<void>[] = [];

  let pageNumber = 1; // 1-indexed

  for (;;) {
    const resultsPage = await githubGetReposResultPageActivity(
      githubInstallationId,
      pageNumber,
      loggerArgs
    );
    if (!resultsPage.length) {
      break;
    }
    pageNumber += 1;

    for (const repo of resultsPage) {
      const fullSyncWorkflowId = getFullSyncWorkflowId(dataSourceConfig);
      const childWorkflowId = `${fullSyncWorkflowId}-repo-${repo.id}-syncCodeOnly-${syncCodeOnly}`;
      promises.push(
        queue.add(() =>
          executeChild(githubRepoSyncWorkflow, {
            workflowId: childWorkflowId,
            searchAttributes: {
              connectorId: [parseInt(connectorId)],
            },
            args: [
              dataSourceConfig,
              githubInstallationId,
              repo.name,
              repo.id,
              repo.login,
              syncCodeOnly,
            ],
            parentClosePolicy: ParentClosePolicy.PARENT_CLOSE_POLICY_TERMINATE,
            memo: workflowInfo().memo,
          })
        )
      );
    }
  }

  await Promise.all(promises);

  await githubSaveSuccessSyncActivity(dataSourceConfig);
}

export async function githubReposSyncWorkflow(
  dataSourceConfig: DataSourceConfig,
  githubInstallationId: string,
  orgLogin: string,
  repos: { name: string; id: number }[],
  connectorId: string
) {
  const queue = new PQueue({ concurrency: MAX_CONCURRENT_REPO_SYNC_WORKFLOWS });
  const promises: Promise<void>[] = [];

  for (const repo of repos) {
    const reposSyncWorkflowId = getReposSyncWorkflowId(dataSourceConfig);
    const childWorkflowId = `${reposSyncWorkflowId}-repo-${repo.id}`;
    promises.push(
      queue.add(() =>
        executeChild(githubRepoSyncWorkflow, {
          workflowId: childWorkflowId,
          searchAttributes: {
            connectorId: [parseInt(connectorId)],
          },
          args: [
            dataSourceConfig,
            githubInstallationId,
            repo.name,
            repo.id,
            orgLogin,
            false,
          ],
          parentClosePolicy: ParentClosePolicy.PARENT_CLOSE_POLICY_TERMINATE,
          memo: workflowInfo().memo,
        })
      )
    );
  }

  await Promise.all(promises);
  await githubSaveSuccessSyncActivity(dataSourceConfig);
}

export async function githubRepoSyncWorkflow(
  dataSourceConfig: DataSourceConfig,
  githubInstallationId: string,
  repoName: string,
  repoId: number,
  repoLogin: string,
  syncCodeOnly: boolean
) {
  const loggerArgs = {
    dataSourceName: dataSourceConfig.dataSourceName,
    workspaceId: dataSourceConfig.workspaceId,
    githubInstallationId,
    repoName,
    repoLogin,
    syncCodeOnly: syncCodeOnly ? "true" : "false",
  };

  if (!syncCodeOnly) {
    const queue = new PQueue({
      concurrency: MAX_CONCURRENT_ISSUE_SYNC_ACTIVITIES_PER_WORKFLOW,
    });
    const promises: Promise<void>[] = [];

    let pageNumber = 1; // 1-indexed
    for (;;) {
      const resultsPage = await githubGetRepoIssuesResultPageActivity(
        githubInstallationId,
        repoName,
        repoLogin,
        pageNumber,
        loggerArgs
      );
      if (!resultsPage.length) {
        break;
      }
      pageNumber += 1;
      for (const issueNumber of resultsPage) {
        promises.push(
          queue.add(() =>
            githubUpsertIssueActivity(
              githubInstallationId,
              repoName,
              repoId,
              repoLogin,
              issueNumber,
              dataSourceConfig,
              loggerArgs,
              true // isBatchSync
            )
          )
        );
      }
    }

    let nextCursor: string | null = null;
    for (;;) {
      const { cursor, discussionNumbers } =
        await githubGetRepoDiscussionsResultPageActivity(
          githubInstallationId,
          repoName,
          repoLogin,
          nextCursor,
          loggerArgs
        );
      for (const discussionNumber of discussionNumbers) {
        promises.push(
          queue.add(() =>
            githubUpsertDiscussionActivity(
              githubInstallationId,
              repoName,
              repoId,
              repoLogin,
              discussionNumber,
              dataSourceConfig,
              loggerArgs,
              true // isBatchSync
            )
          )
        );
      }
      if (!cursor) {
        break;
      }
      nextCursor = cursor;
    }

    await Promise.all(promises);
  }

  // Start code syncing activity.
  await githubCodeSyncActivity({
    dataSourceConfig,
    installationId: githubInstallationId,
    repoLogin,
    repoName,
    repoId,
    loggerArgs,
    isBatchSync: true,
  });
}

export async function githubCodeSyncWorkflow(
  dataSourceConfig: DataSourceConfig,
  githubInstallationId: string,
  repoName: string,
  repoId: number,
  repoLogin: string
) {
  const loggerArgs = {
    dataSourceName: dataSourceConfig.dataSourceName,
    workspaceId: dataSourceConfig.workspaceId,
    githubInstallationId,
    repoName,
    repoLogin,
  };

  let signaled = false;
  let debounceCount = 0;

  setHandler(newWebhookSignal, () => {
    signaled = true;
  });

  while (signaled) {
    signaled = false;
    // The main motivation for debouncing here is to ensure that concurrent PR merges don't launch
    // multiple workflows. In the webhook for PR merge we send a signal after updating the
    // GithubCodeRepository.lastSeenAt (if was older than the sync interval), but we can still race
    // at this layer for a few seconds, hence the use of signals here.
    await sleep(10000);
    if (signaled) {
      debounceCount += 1;
      continue;
    }
    await githubCodeSyncActivity({
      dataSourceConfig,
      installationId: githubInstallationId,
      repoLogin,
      repoName,
      repoId,
      loggerArgs: { ...loggerArgs, debounceCount, activity: "githubCodeSync" },
      isBatchSync: true,
    });
    await githubSaveSuccessSyncActivity(dataSourceConfig);
  }
}

export async function githubIssueSyncWorkflow(
  dataSourceConfig: DataSourceConfig,
  githubInstallationId: string,
  repoName: string,
  repoId: number,
  repoLogin: string,
  issueNumber: number
) {
  const loggerArgs = {
    dataSourceName: dataSourceConfig.dataSourceName,
    workspaceId: dataSourceConfig.workspaceId,
    githubInstallationId,
    repoName,
    repoLogin,
    issueNumber,
  };

  let signaled = false;
  let debounceCount = 0;

  setHandler(newWebhookSignal, () => {
    signaled = true;
  });

  while (signaled) {
    signaled = false;
    await sleep(10000);
    if (signaled) {
      debounceCount += 1;
      continue;
    }
    await githubUpsertIssueActivity(
      githubInstallationId,
      repoName,
      repoId,
      repoLogin,
      issueNumber,
      dataSourceConfig,
      { ...loggerArgs, debounceCount }
    );
    await githubSaveSuccessSyncActivity(dataSourceConfig);
  }
}

export async function githubDiscussionSyncWorkflow(
  dataSourceConfig: DataSourceConfig,
  githubInstallationId: string,
  repoName: string,
  repoId: number,
  repoLogin: string,
  discussionNumber: number
) {
  const loggerArgs = {
    dataSourceName: dataSourceConfig.dataSourceName,
    workspaceId: dataSourceConfig.workspaceId,
    githubInstallationId,
    repoName,
    repoLogin,
    discussionNumber,
  };

  let signaled = false;
  let debounceCount = 0;

  setHandler(newWebhookSignal, () => {
    signaled = true;
  });

  while (signaled) {
    signaled = false;
    await sleep(10000);
    if (signaled) {
      debounceCount += 1;
      continue;
    }
    await githubUpsertDiscussionActivity(
      githubInstallationId,
      repoName,
      repoId,
      repoLogin,
      discussionNumber,
      dataSourceConfig,
      { ...loggerArgs, debounceCount },
      false // isBatchSync
    );

    await githubSaveSuccessSyncActivity(dataSourceConfig);
  }
}

export async function githubIssueGarbageCollectWorkflow(
  dataSourceConfig: DataSourceConfig,
  githubInstallationId: string,
  repoId: string,
  issueNumber: number
) {
  const loggerArgs = {
    dataSourceName: dataSourceConfig.dataSourceName,
    workspaceId: dataSourceConfig.workspaceId,
    githubInstallationId,
    issueNumber,
  };

  await githubIssueGarbageCollectActivity(
    dataSourceConfig,
    githubInstallationId,
    repoId,
    issueNumber,
    loggerArgs
  );
  await githubSaveSuccessSyncActivity(dataSourceConfig);
}

export async function githubDiscussionGarbageCollectWorkflow(
  dataSourceConfig: DataSourceConfig,
  githubInstallationId: string,
  repoId: string,
  discussionNumber: number
) {
  const loggerArgs = {
    dataSourceName: dataSourceConfig.dataSourceName,
    workspaceId: dataSourceConfig.workspaceId,
    githubInstallationId,
    discussionNumber,
  };

  await githubDiscussionGarbageCollectActivity(
    dataSourceConfig,
    githubInstallationId,
    repoId,
    discussionNumber,
    loggerArgs
  );
  await githubSaveSuccessSyncActivity(dataSourceConfig);
}

export async function githubRepoGarbageCollectWorkflow(
  dataSourceConfig: DataSourceConfig,
  githubInstallationId: string,
  repoId: string
) {
  const loggerArgs = {
    dataSourceName: dataSourceConfig.dataSourceName,
    workspaceId: dataSourceConfig.workspaceId,
    githubInstallationId,
  };

  await githubRepoGarbageCollectActivity(
    dataSourceConfig,
    githubInstallationId,
    repoId,
    loggerArgs
  );
  await githubSaveSuccessSyncActivity(dataSourceConfig);
}
