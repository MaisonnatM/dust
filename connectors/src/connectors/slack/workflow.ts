import { proxyActivities } from '@temporalio/workflow';
import type * as activities from './slack.js'; // purely for type safety
import type { Channel } from "@slack/web-api/dist/response/ConversationsListResponse.js";

const { getChannels } = proxyActivities<typeof activities>({
  startToCloseTimeout: '1 minute',
});

/**
 * Here only for show casing.
 */
export async function printSlackChannelsWorkflow(nangoConnectionId: string): Promise<void> {
  const channels = await getChannels(nangoConnectionId);
  console.log('channels:', channels)
  return ;
  
}
