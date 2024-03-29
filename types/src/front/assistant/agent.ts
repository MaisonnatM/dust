import { DustAppRunConfigurationType } from "../../front/assistant/actions/dust_app_run";
import { RetrievalConfigurationType } from "../../front/assistant/actions/retrieval";
import { TablesQueryConfigurationType } from "../../front/assistant/actions/tables_query";
import { SupportedModel } from "../../front/lib/assistant";
import { ModelId } from "../../shared/model_id";

/**
 * Agent Action configuration
 */

// New AgentActionConfigurationType checklist:
// - Add the type to the union type below
// - Add model rendering support in `renderConversationForModel`
export type AgentActionConfigurationType =
  | TablesQueryConfigurationType
  | RetrievalConfigurationType
  | DustAppRunConfigurationType;

// Each AgentActionConfigurationType is capable of generating this type at runtime to specify which
// inputs should be generated by the model. As an example, to run the retrieval action for which the
// `relativeTimeFrame` has been specified in the configuration but for which the `query` is "auto",
// it would generate:
//
// ```
// { inputs: [{ name: "query", description: "...", type: "string" }]
// ```
//
// The params generator model for this action would be tasked to generate that query. If the
// retrieval configuration sets `relativeTimeFrame` to "auto" as well we would get:
//
// ```
// {
//   inputs: [
//     { name: "query", description: "...", type: "string" },
//     { name: "relativeTimeFrame", description: "...", type: "string" },
//   ]
// }
// ```
export type AgentActionSpecification = {
  name: string;
  description: string;
  inputs: {
    name: string;
    description: string;
    type: "string" | "number" | "boolean";
  }[];
};

/**
 * Agent Message configuration
 */

export type AgentGenerationConfigurationType = {
  id: ModelId;
  prompt: string;
  model: SupportedModel;
  temperature: number;
};

/**
 * Agent configuration
 */

export type GlobalAgentStatus =
  | "active"
  | "disabled_by_admin"
  | "disabled_missing_datasource"
  | "disabled_free_workspace";
export type AgentStatus = "active" | "archived";
export type AgentConfigurationStatus = AgentStatus | GlobalAgentStatus;

/**
 * Agent configuration scope
 * - 'global' scope are Dust assistants, not editable, inside-list for all, cannot be overriden
 * - 'workspace' scope are editable by builders only,  inside-list by default but user can change it
 * - 'published' scope are editable by everybody, outside-list by default
 * - 'private' scope are editable by author only, inside-list for author, cannot be overriden (so no
 *   entry in the table
 */
export type AgentConfigurationScope =
  | "global"
  | "workspace"
  | "published"
  | "private";

/* By default, agents with scope 'workspace' are in users' assistants list, whereeas agents with
 * scope 'published' aren't. A user can override the default behaviour by adding / removing from
 * their list. List status is enforced by the type below. */
export type AgentUserListStatus = "in-list" | "not-in-list";

/**
 * Agents can be retrieved according to different 'views':
 * - list: all agents in the user's list
 * - conversation: all agents in the user's list + agents in the current conversation (requries a
 *   conversation sId)
 * - all: workspace + published agents (not private ones), eg. for agent gallery
 * - admin_internal: all agents, including private ones => CAREFUL, this is only for internal use.
 * Global agents enabled for the workspace are always returned with all the views.
 */
export type AgentsGetViewType =
  | { agentId: string; allVersions?: boolean }
  | "list"
  | { conversationId: string }
  | "all"
  | "workspace"
  | "published"
  | "global"
  | "admin_internal";

export type AgentUsageType = {
  userCount: number;
  messageCount: number;

  // userCount and messageCount are over the last `timePeriodSec` seconds
  timePeriodSec: number;
};

export type AgentRecentAuthors = readonly string[];

export type LightAgentConfigurationType = {
  id: ModelId;

  versionCreatedAt: string | null;

  sId: string;
  version: number;
  // Global agents have a null authorId, others have a non-null authorId
  versionAuthorId: ModelId | null;

  // If undefined, no text generation.
  generation: AgentGenerationConfigurationType | null;

  status: AgentConfigurationStatus;
  scope: AgentConfigurationScope;

  // Set to null if not in the context of a user (API query). Otherwise, set to the list status for
  // the current user.
  userListStatus: AgentUserListStatus | null;

  name: string;
  description: string;
  pictureUrl: string;

  // `lastAuthors` is expensive to compute, so we only compute it when needed.
  lastAuthors?: AgentRecentAuthors;
  // Usage is expensive to compute, so we only compute it when needed.
  usage?: AgentUsageType;
};

export type AgentConfigurationType = LightAgentConfigurationType & {
  // If undefined, no action performed, otherwise the action is
  // performed (potentially NoOp eg autoSkip above).
  action: AgentActionConfigurationType | null;
};
