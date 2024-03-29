import type { ConnectorProvider } from "@dust-tt/types";

import {
  createConfluenceConnector,
  retrieveConfluenceConnectorPermissions,
  retrieveConfluenceObjectsTitles,
  setConfluenceConnectorPermissions,
  updateConfluenceConnector,
} from "@connectors/connectors/confluence";
import {
  cleanupGithubConnector,
  createGithubConnector,
  fullResyncGithubConnector,
  getGithubConfig,
  resumeGithubConnector,
  retrieveGithubConnectorPermissions,
  retrieveGithubReposTitles,
  setGithubConfig,
  stopGithubConnector,
  updateGithubConnector,
} from "@connectors/connectors/github";
import {
  cleanupGoogleDriveConnector,
  createGoogleDriveConnector,
  getGoogleDriveConfig,
  googleDriveGarbageCollect,
  retrieveGoogleDriveConnectorPermissions,
  retrieveGoogleDriveObjectsParents,
  retrieveGoogleDriveObjectsTitles,
  setGoogleDriveConfig,
  setGoogleDriveConnectorPermissions,
  updateGoogleDriveConnector,
} from "@connectors/connectors/google_drive";
import { launchGoogleDriveFullSyncWorkflow } from "@connectors/connectors/google_drive/temporal/client";
import {
  cleanupIntercomConnector,
  createIntercomConnector,
  fullResyncIntercomConnector,
  resumeIntercomConnector,
  retrieveIntercomConnectorPermissions,
  retrieveIntercomResourcesTitles,
  stopIntercomConnector,
  updateIntercomConnector,
} from "@connectors/connectors/intercom";
import type {
  ConnectorBatchResourceTitleRetriever,
  ConnectorCleaner,
  ConnectorConfigGetter,
  ConnectorConfigSetter,
  ConnectorCreatorOAuth,
  ConnectorCreatorUrl,
  ConnectorGarbageCollector,
  ConnectorPermissionRetriever,
  ConnectorPermissionSetter,
  ConnectorResourceParentsRetriever,
  ConnectorResumer,
  ConnectorStopper,
  ConnectorUpdater,
  SyncConnector,
} from "@connectors/connectors/interface";
import {
  cleanupNotionConnector,
  createNotionConnector,
  fullResyncNotionConnector,
  resumeNotionConnector,
  retrieveNotionConnectorPermissions,
  retrieveNotionResourceParents,
  retrieveNotionResourcesTitles,
  stopNotionConnector,
  updateNotionConnector,
} from "@connectors/connectors/notion";
import {
  cleanupSlackConnector,
  createSlackConnector,
  getSlackConfig,
  retrieveSlackChannelsTitles,
  retrieveSlackConnectorPermissions,
  setSlackConfig,
  setSlackConnectorPermissions,
  updateSlackConnector,
} from "@connectors/connectors/slack";
import { launchSlackSyncWorkflow } from "@connectors/connectors/slack/temporal/client";
import { Err, Ok } from "@connectors/lib/result";
import logger from "@connectors/logger/logger";

import {
  cleanupWebcrawlerConnector,
  createWebcrawlerConnector,
  retrieveWebcrawlerConnectorPermissions,
  retrieveWebCrawlerObjectsParents,
  retrieveWebCrawlerObjectsTitles,
  stopWebcrawlerConnector,
} from "./webcrawler";
import { launchCrawlWebsiteWorkflow } from "./webcrawler/temporal/client";

export const CREATE_CONNECTOR_BY_TYPE: Record<
  ConnectorProvider,
  ConnectorCreatorOAuth | ConnectorCreatorUrl
> = {
  confluence: createConfluenceConnector,
  github: createGithubConnector,
  google_drive: createGoogleDriveConnector,
  intercom: createIntercomConnector,
  notion: createNotionConnector,
  slack: createSlackConnector,
  webcrawler: createWebcrawlerConnector,
};

export const UPDATE_CONNECTOR_BY_TYPE: Record<
  ConnectorProvider,
  ConnectorUpdater
> = {
  confluence: updateConfluenceConnector,
  slack: updateSlackConnector,
  notion: updateNotionConnector,
  github: updateGithubConnector,
  google_drive: updateGoogleDriveConnector,
  intercom: updateIntercomConnector,
  webcrawler: () => {
    throw new Error("Not implemented");
  },
};

export const STOP_CONNECTOR_BY_TYPE: Record<
  ConnectorProvider,
  ConnectorStopper
> = {
  confluence: () => {
    throw new Error("Not yet implemented!");
  },
  slack: async (connectorId: string) => {
    logger.info({ connectorId }, `Stopping Slack connector is a no-op.`);
    return new Ok(connectorId);
  },
  github: stopGithubConnector,
  notion: stopNotionConnector,
  google_drive: async (connectorId: string) => {
    logger.info({ connectorId }, `Stopping Google Drive connector is a no-op.`);
    return new Ok(connectorId);
  },
  intercom: stopIntercomConnector,
  webcrawler: async (connectorId: string) => {
    return stopWebcrawlerConnector(connectorId);
  },
};

export const DELETE_CONNECTOR_BY_TYPE: Record<
  ConnectorProvider,
  ConnectorCleaner
> = {
  confluence: () => {
    throw new Error("Not yet implemented!");
  },
  slack: cleanupSlackConnector,
  notion: cleanupNotionConnector,
  github: cleanupGithubConnector,
  google_drive: cleanupGoogleDriveConnector,
  intercom: cleanupIntercomConnector,
  webcrawler: cleanupWebcrawlerConnector,
};

export const RESUME_CONNECTOR_BY_TYPE: Record<
  ConnectorProvider,
  ConnectorResumer
> = {
  confluence: () => {
    throw new Error("Not yet implemented!");
  },
  slack: async (connectorId: string) => {
    logger.info({ connectorId }, `Resuming Slack connector is a no-op.`);
    return new Ok(connectorId);
  },
  notion: resumeNotionConnector,
  github: resumeGithubConnector,
  google_drive: async (connectorId: string) => {
    throw new Error(`Not implemented ${connectorId}`);
  },
  intercom: resumeIntercomConnector,
  webcrawler: () => {
    throw new Error("Not implemented");
  },
};

export const SYNC_CONNECTOR_BY_TYPE: Record<ConnectorProvider, SyncConnector> =
  {
    confluence: () => {
      throw new Error("Not yet implemented!");
    },
    slack: launchSlackSyncWorkflow,
    notion: fullResyncNotionConnector,
    github: fullResyncGithubConnector,
    google_drive: launchGoogleDriveFullSyncWorkflow,
    intercom: fullResyncIntercomConnector,
    webcrawler: (connectorId: string) =>
      launchCrawlWebsiteWorkflow(parseInt(connectorId)),
  };

export const RETRIEVE_CONNECTOR_PERMISSIONS_BY_TYPE: Record<
  ConnectorProvider,
  ConnectorPermissionRetriever
> = {
  confluence: retrieveConfluenceConnectorPermissions,
  slack: retrieveSlackConnectorPermissions,
  github: retrieveGithubConnectorPermissions,
  notion: retrieveNotionConnectorPermissions,
  google_drive: retrieveGoogleDriveConnectorPermissions,
  intercom: retrieveIntercomConnectorPermissions,
  webcrawler: retrieveWebcrawlerConnectorPermissions,
};

export const SET_CONNECTOR_PERMISSIONS_BY_TYPE: Record<
  ConnectorProvider,
  ConnectorPermissionSetter
> = {
  confluence: setConfluenceConnectorPermissions,
  slack: setSlackConnectorPermissions,
  notion: async () => {
    return new Err(
      new Error(`Setting Notion connector permissions is not implemented yet.`)
    );
  },
  github: async () => {
    return new Err(
      new Error(`Setting Github connector permissions is not implemented yet.`)
    );
  },
  google_drive: setGoogleDriveConnectorPermissions,
  intercom: async () => {
    return new Err(
      new Error(
        `Setting Intercom connector permissions is not implemented yet.`
      )
    );
  },
  webcrawler: async () => {
    return new Err(
      new Error(`Setting Webcrawler connector permissions is not applicable.`)
    );
  },
};

export const BATCH_RETRIEVE_RESOURCE_TITLE_BY_TYPE: Record<
  ConnectorProvider,
  ConnectorBatchResourceTitleRetriever
> = {
  confluence: retrieveConfluenceObjectsTitles,
  slack: retrieveSlackChannelsTitles,
  notion: retrieveNotionResourcesTitles,
  github: retrieveGithubReposTitles,
  google_drive: retrieveGoogleDriveObjectsTitles,
  intercom: retrieveIntercomResourcesTitles,
  webcrawler: retrieveWebCrawlerObjectsTitles,
};

export const RETRIEVE_RESOURCE_PARENTS_BY_TYPE: Record<
  ConnectorProvider,
  ConnectorResourceParentsRetriever
> = {
  confluence: async () => new Ok([]), // Confluence is flat.
  notion: retrieveNotionResourceParents,
  google_drive: retrieveGoogleDriveObjectsParents,
  slack: async () => new Ok([]), // Slack is flat
  github: async () => new Ok([]), // Github is flat,
  intercom: async () => new Ok([]), // Intercom is not truly flat as we can put articles & collections inside collections but will handle this later
  webcrawler: retrieveWebCrawlerObjectsParents,
};

export const SET_CONNECTOR_CONFIG_BY_TYPE: Record<
  ConnectorProvider,
  ConnectorConfigSetter
> = {
  confluence: () => {
    throw new Error("Not implemented");
  },
  slack: setSlackConfig,
  notion: async () => {
    throw new Error("Not implemented");
  },
  github: setGithubConfig,
  google_drive: setGoogleDriveConfig,
  intercom: async () => {
    throw new Error("Not implemented");
  },
  webcrawler: async () => {
    throw new Error("Not implemented");
  },
};

export const GET_CONNECTOR_CONFIG_BY_TYPE: Record<
  ConnectorProvider,
  ConnectorConfigGetter
> = {
  confluence: () => {
    throw new Error("Not implemented");
  },
  slack: getSlackConfig,
  notion: async () => {
    throw new Error("Not implemented");
  },
  github: getGithubConfig,
  google_drive: getGoogleDriveConfig,
  intercom: async () => {
    throw new Error("Not implemented");
  },
  webcrawler: () => {
    throw new Error("Not implemented");
  },
};

export const GARBAGE_COLLECT_BY_TYPE: Record<
  ConnectorProvider,
  ConnectorGarbageCollector
> = {
  confluence: () => {
    throw new Error("Not implemented");
  },
  slack: () => {
    throw new Error("Not implemented");
  },
  notion: async () => {
    throw new Error("Not implemented");
  },
  github: async () => {
    throw new Error("Not implemented");
  },
  google_drive: googleDriveGarbageCollect,
  intercom: async () => {
    throw new Error("Not implemented");
  },
  webcrawler: () => {
    throw new Error("Not implemented");
  },
};
