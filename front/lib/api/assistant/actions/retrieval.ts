import { generateActionInputs } from "@app/lib/api/assistant/agent";
import { ModelMessageType } from "@app/lib/api/assistant/conversation";
import { Authenticator } from "@app/lib/auth";
import { Err, Ok, Result } from "@app/lib/result";
import logger from "@app/logger/logger";
import {
  DataSourceConfiguration,
  isRetrievalConfiguration,
  RetrievalActionType,
  RetrievalConfigurationType,
  RetrievalDocumentType,
  TimeFrame,
} from "@app/types/assistant/actions/retrieval";
import {
  AgentActionSpecification,
  AgentConfigurationType,
} from "@app/types/assistant/agent";
import {
  AssistantAgentMessageType,
  AssistantConversationType,
  AssistantUserMessageType,
} from "@app/types/assistant/conversation";

/**
 * TimeFrame parsing
 */

// Attempts to parse a string representation of the time frame of the form `{k}{unit}` or `all`
// where {k} is a number and {unit} is one of `d`, `w`, `m`, `y` for day, week, month, year.
export function parseTimeFrame(raw: string): TimeFrame | null {
  const r = raw.trim().toLowerCase();
  if (r === "all") {
    return null;
  }

  const m = r.match(/^(\d+)([dwmy])$/);
  if (!m) {
    return null;
  }

  const count = parseInt(m[1], 10);
  if (isNaN(count)) {
    return null;
  }

  let duration: TimeFrame["duration"];
  switch (m[2]) {
    case "d":
      duration = "day";
      break;
    case "w":
      duration = "week";
      break;
    case "m":
      duration = "month";
      break;
    case "y":
      duration = "year";
      break;
    default:
      return null;
  }

  return {
    count,
    duration,
  };
}

/**
 * Model rendering of retrievals.
 */

export function renderRetrievalActionForModel(
  action: RetrievalActionType
): ModelMessageType {
  let content = "";
  for (const d of action.documents) {
    let title = d.documentId;
    for (const t of d.tags) {
      if (t.startsWith("title:")) {
        title = t.substring(6);
        break;
      }
    }

    let dataSourceName = d.dataSourceId;
    if (d.dataSourceId.startsWith("managed-")) {
      dataSourceName = d.dataSourceId.substring(8);
    }

    content += `TITLE: ${title} (data source: ${dataSourceName})\n`;
    content += `REFERENCE: ${d.reference}\n`;

    content += `EXTRACTS:\n`;
    for (const c of d.chunks) {
      content += `${c.text}\n`;
    }

    content += "\n";
  }

  return {
    role: "action" as const,
    name: "search_data_sources",
    content,
  };
}

/**
 * Params generation.
 */

export async function retrievalActionSpecification(
  configuration: RetrievalConfigurationType
): Promise<AgentActionSpecification> {
  const inputs = [];

  if (configuration.query === "auto") {
    inputs.push({
      name: "query",
      description:
        "The string used to retrieve relevant chunks of information using semantic similarity" +
        " based on the user request and conversation context.",
      type: "string" as const,
    });
  }
  if (configuration.relativeTimeFrame === "auto") {
    inputs.push({
      name: "relativeTimeFrame",
      description:
        "The time frame (relative to now) to restrict the search based on the user request and past conversation context." +
        " Possible values are: `all`, `{k}d`, `{k}w`, `{k}m`, `{k}y` where {k} is a number.",
      type: "string" as const,
    });
  }

  return {
    name: "search_data_sources",
    description:
      "Search the data sources specified by the user for information to answer their request." +
      " The search is based on semantic similarity between the query and chunks of information from the data sources.",
    inputs,
  };
}

/// Generates retrieval parameters given the agent configuration and the conversation context,
/// potentially generating the query and relative time frame.
export async function generateRetrievalParams(
  auth: Authenticator,
  configuration: RetrievalConfigurationType,
  conversation: AssistantConversationType,
  userMessage: AssistantUserMessageType
): Promise<
  Result<
    { query: string | null; relativeTimeFrame: TimeFrame | null; topK: number },
    Error
  >
> {
  let query: string | null = null;
  let relativeTimeFrame: TimeFrame | null = null;

  if (
    configuration.relativeTimeFrame !== "none" &&
    configuration.relativeTimeFrame !== "auto"
  ) {
    relativeTimeFrame = configuration.relativeTimeFrame;
  }

  if (configuration.query !== "none" && configuration.query !== "auto") {
    query = configuration.query.template.replace(
      "_USER_MESSAGE_",
      userMessage.message
    );
  }

  const spec = await retrievalActionSpecification(configuration);

  if (spec.inputs.length > 0) {
    const now = Date.now();

    const rawInputsRes = await generateActionInputs(auth, spec, conversation);

    if (rawInputsRes.isOk()) {
      const rawInputs = rawInputsRes.value;

      logger.info(
        {
          elapsed: Date.now() - now,
        },
        "[ASSISTANT_STATS] retrieval action inputs generation"
      );

      if (configuration.query === "auto") {
        if (!rawInputs.query || typeof rawInputs.query !== "string") {
          return new Err(
            new Error("Failed to genreate a valid retrieval query.")
          );
        }
        query = rawInputs.query as string;
      }

      if (configuration.relativeTimeFrame === "auto") {
        if (
          rawInputs.relativeTimeFrame &&
          typeof rawInputs.relativeTimeFrame === "string"
        ) {
          relativeTimeFrame = parseTimeFrame(rawInputs.relativeTimeFrame);
        }
      }
    } else {
      logger.info(
        {
          elapsed: Date.now() - now,
          error: rawInputsRes.error,
        },
        "Error generating retrieval action inputs"
      );

      // We fail the rerieval only if we had to generate a query but failed to do so, if the
      // relativeTimeFrame failed, we'll just use `null`.
      if (configuration.query === "auto") {
        return rawInputsRes;
      }
    }
  }

  return new Ok({
    query,
    relativeTimeFrame,
    topK: configuration.topK,
  });
}

/**
 * Action execution.
 */

// Event sent during retrieval with the finalized query used to retrieve documents.
export type RetrievalParamsEvent = {
  type: "retrieval_params";
  created: number;
  dataSources: "all" | DataSourceConfiguration[];
  query: string | null;
  relativeTimeFrame: TimeFrame | null;
  topK: number;
};

// Event sent during retrieval once the retrieved documents have been generated.
export type RetrievalDocumentsEvent = {
  type: "retrieval_documents";
  created: number;
  configurationId: string;
  messageId: string;
  documents: RetrievalDocumentType[];
};

export type RetrievalErrorEvent = {
  type: "retrieval_error";
  created: number;
  configurationId: string;
  messageId: string;
  error: {
    code: string;
    message: string;
  };
};

export type RetrievalSuccessEvent = {
  type: "retrieval_success";
  created: number;
  configurationId: string;
  messageId: string;
  action: RetrievalActionType;
};

// This method is in charge of running the retrieval and creating an AssistantAgentRetrieval DB
// object in the database (along with the RetrievedDocument objects). It does not create any generic
// model related to the conversation.
export async function* runRetrieval(
  auth: Authenticator,
  configuration: AgentConfigurationType,
  conversation: AssistantConversationType,
  userMessage: AssistantUserMessageType,
  agentMessage: AssistantAgentMessageType
): AsyncGenerator<
  | RetrievalParamsEvent
  | RetrievalDocumentsEvent
  | RetrievalSuccessEvent
  | RetrievalErrorEvent
> {
  const c = configuration.action;
  if (!isRetrievalConfiguration(c)) {
    return yield {
      type: "retrieval_error",
      created: Date.now(),
      configurationId: configuration.sId,
      messageId: agentMessage.sId,
      error: {
        code: "internal_server_error",
        message: "Unexpected action configuration received in `runRetrieval`",
      },
    };
  }

  const paramsRes = await generateRetrievalParams(
    auth,
    c,
    conversation,
    userMessage
  );

  if (paramsRes.isErr()) {
    return yield {
      type: "retrieval_error",
      created: Date.now(),
      configurationId: configuration.sId,
      messageId: agentMessage.sId,
      error: {
        code: "retrieval_parameters_generation_error",
        message: `Error generating parameters for retrieval: ${paramsRes.error.message}`,
      },
    };
  }

  const params = paramsRes.value;

  yield {
    type: "retrieval_params",
    created: Date.now(),
    dataSources: c.dataSources,
    query: params.query,
    relativeTimeFrame: params.relativeTimeFrame,
    topK: params.topK,
  };

  // TODO(spolu): Implement the retrieval.
}