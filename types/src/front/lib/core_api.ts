import { createParser } from "eventsource-parser";

import {
  CoreAPIDataSource,
  CoreAPIDataSourceConfig,
  CoreAPIDataSourceDocumentSection,
  CoreAPIDocument,
  CoreAPILightDocument,
} from "../../core/data_source";
import { dustManagedCredentials } from "../../front/lib/api/credentials";
import { Err, Ok, Result } from "../../front/lib/result";
import { Project } from "../../front/project";
import { CredentialsType } from "../../front/provider";
import {
  BlockType,
  RunConfig,
  RunRunType,
  RunStatus,
  TraceType,
} from "../../front/run";
import { LoggerInterface } from "../../shared/logger";

const { CORE_API = "http://127.0.0.1:3001" } = process.env;

export const EMBEDDING_CONFIG = {
  model_id: "text-embedding-ada-002",
  provider_id: "openai",
  splitter_id: "base_v0",
  max_chunk_size: 512,
};

export type CoreAPIErrorResponse = {
  message: string;
  code: string;
};
export type CoreAPIResponse<T> = Result<T, CoreAPIErrorResponse>;

export type CoreAPIDatasetVersion = {
  hash: string;
  created: number;
};

export type CoreAPIDatasetWithoutData = CoreAPIDatasetVersion & {
  dataset_id: string;
  keys: string[];
};

export type CoreAPIDataset = CoreAPIDatasetWithoutData & {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  data: { [key: string]: any }[];
};

export type CoreAPIRun = {
  run_id: string;
  created: number;
  run_type: RunRunType;
  app_hash?: string | null;
  specification_hash?: string | null;
  config: RunConfig;
  status: RunStatus;
  traces: Array<[[BlockType, string], Array<Array<TraceType>>]>;
};

export type CoreAPITokenType = [number, string];

type CoreAPICreateRunParams = {
  projectId: string;
  runAsWorkspaceId: string;
  runType: RunRunType;
  specification?: string | null;
  specificationHash?: string | null;
  datasetId?: string | null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  inputs?: any[] | null;
  config: RunConfig;
  credentials: CredentialsType;
};

type GetDatasetResponse = {
  dataset: CoreAPIDataset;
};

type GetDatasetsResponse = {
  datasets: { [key: string]: CoreAPIDatasetVersion[] };
};

export type CoreAPITableSchema = Record<
  string,
  "int" | "float" | "text" | "bool" | "datetime"
>;

export type CoreAPITable = {
  created: number;
  table_id: string;
  data_source_id: string;
  name: string;
  description: string;
  schema: CoreAPITableSchema;
};

export type CoreAPIRow = {
  row_id: string;
  value: Record<string, unknown>;
};

export type CoreAPIQueryResult = {
  value: Record<string, unknown>;
};

export class CoreAPI {
  declare _logger: LoggerInterface;
  constructor(logger: LoggerInterface) {
    this._logger = logger;
  }
  async createProject(): Promise<CoreAPIResponse<{ project: Project }>> {
    const response = await fetch(`${CORE_API}/projects`, {
      method: "POST",
    });
    return _resultFromResponse(response);
  }

  async deleteProject({
    projectId,
  }: {
    projectId: string;
  }): Promise<CoreAPIResponse<{ success: true }>> {
    const response = await fetch(`${CORE_API}/projects/${projectId}`, {
      method: "DELETE",
    });

    return _resultFromResponse(response);
  }

  async getDatasets({
    projectId,
  }: {
    projectId: string;
  }): Promise<CoreAPIResponse<GetDatasetsResponse>> {
    const response = await fetch(`${CORE_API}/projects/${projectId}/datasets`, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
      },
    });

    return _resultFromResponse(response);
  }

  async getDataset({
    projectId,
    datasetName,
    datasetHash,
  }: {
    projectId: string;
    datasetName: string;
    datasetHash: string;
  }): Promise<CoreAPIResponse<GetDatasetResponse>> {
    const response = await fetch(
      `${CORE_API}/projects/${projectId}/datasets/${datasetName}/${datasetHash}`,
      {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
        },
      }
    );

    return _resultFromResponse(response);
  }

  async createDataset({
    projectId,
    datasetId,
    data,
  }: {
    projectId: string;
    datasetId: string;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    data: any[];
  }): Promise<CoreAPIResponse<{ dataset: CoreAPIDatasetWithoutData }>> {
    const response = await fetch(`${CORE_API}/projects/${projectId}/datasets`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        dataset_id: datasetId,
        data,
      }),
    });

    return _resultFromResponse(response);
  }

  async cloneProject({
    projectId,
  }: {
    projectId: string;
  }): Promise<CoreAPIResponse<{ project: Project }>> {
    const response = await fetch(`${CORE_API}/projects/${projectId}/clone`, {
      method: "POST",
    });

    return _resultFromResponse(response);
  }

  async createRun({
    projectId,
    runAsWorkspaceId,
    runType,
    specification,
    specificationHash,
    datasetId,
    inputs,
    config,
    credentials,
  }: CoreAPICreateRunParams): Promise<CoreAPIResponse<{ run: CoreAPIRun }>> {
    const response = await fetch(`${CORE_API}/projects/${projectId}/runs`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Dust-Workspace-Id": runAsWorkspaceId,
      },
      body: JSON.stringify({
        run_type: runType,
        specification: specification,
        specification_hash: specificationHash,
        dataset_id: datasetId,
        inputs: inputs,
        config: config,
        credentials: credentials,
      }),
    });

    return _resultFromResponse(response);
  }

  async createRunStream({
    projectId,
    runAsWorkspaceId,
    runType,
    specification,
    specificationHash,
    datasetId,
    inputs,
    config,
    credentials,
  }: CoreAPICreateRunParams): Promise<
    CoreAPIResponse<{
      chunkStream: AsyncGenerator<Uint8Array, void, unknown>;
      dustRunId: Promise<string>;
    }>
  > {
    const response = await fetch(
      `${CORE_API}/projects/${projectId}/runs/stream`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Dust-Workspace-Id": runAsWorkspaceId,
        },
        body: JSON.stringify({
          run_type: runType,
          specification: specification,
          specification_hash: specificationHash,
          dataset_id: datasetId,
          inputs: inputs,
          config: config,
          credentials: credentials,
        }),
      }
    );

    if (!response.ok || !response.body) {
      return _resultFromResponse(response);
    }

    let hasRunId = false;
    let rejectDustRunIdPromise: (err: Error) => void;
    let resolveDustRunIdPromise: (runId: string) => void;
    const dustRunIdPromise = new Promise<string>((resolve, reject) => {
      rejectDustRunIdPromise = reject;
      resolveDustRunIdPromise = resolve;
    });

    const parser = createParser((event) => {
      if (event.type === "event") {
        if (event.data) {
          try {
            const data = JSON.parse(event.data);
            if (data.content?.run_id && !hasRunId) {
              hasRunId = true;
              resolveDustRunIdPromise(data.content.run_id);
            }
          } catch (err) {
            this._logger.error(
              { error: err },
              "Failed parsing chunk from Core API"
            );
          }
        }
      }
    });

    const reader = response.body.getReader();
    const logger = this._logger;

    const streamChunks = async function* () {
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) {
            break;
          }
          parser.feed(new TextDecoder().decode(value));
          yield value;
        }
        if (!hasRunId) {
          // once the stream is entirely consumed, if we haven't received a run id, reject the promise
          setImmediate(() => {
            logger.error({}, "No run id received");
            rejectDustRunIdPromise(new Error("No run id received"));
          });
        }
      } catch (e) {
        logger.error(
          {
            error: e,
          },
          "Error streaming chunks"
        );
      } finally {
        reader.releaseLock();
      }
    };

    return new Ok({ chunkStream: streamChunks(), dustRunId: dustRunIdPromise });
  }

  async deleteRun({
    projectId,
    runId,
  }: {
    projectId: string;
    runId: string;
  }): Promise<CoreAPIResponse<{ success: true }>> {
    const response = await fetch(
      `${CORE_API}/projects/${projectId}/runs/${runId}`,
      {
        method: "DELETE",
      }
    );

    return _resultFromResponse(response);
  }

  async getRunsBatch({
    projectId,
    dustRunIds,
  }: {
    projectId: string;
    dustRunIds: string[];
  }): Promise<CoreAPIResponse<{ runs: { [key: string]: CoreAPIRun } }>> {
    const response = await fetch(
      `${CORE_API}/projects/${projectId}/runs/batch`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          run_ids: dustRunIds,
        }),
      }
    );

    return _resultFromResponse(response);
  }

  async getRun({
    projectId,
    runId,
  }: {
    projectId: string;
    runId: string;
  }): Promise<CoreAPIResponse<{ run: CoreAPIRun }>> {
    const response = await fetch(
      `${CORE_API}/projects/${projectId}/runs/${runId}`,
      {
        method: "GET",
      }
    );

    return _resultFromResponse(response);
  }

  async getRunStatus({
    projectId,
    runId,
  }: {
    projectId: string;
    runId: string;
  }): Promise<CoreAPIResponse<{ run: CoreAPIRun }>> {
    const response = await fetch(
      `${CORE_API}/projects/${projectId}/runs/${runId}/status`,
      {
        method: "GET",
      }
    );

    return _resultFromResponse(response);
  }

  async getSpecification({
    projectId,
    specificationHash,
  }: {
    projectId: string;
    specificationHash: string;
  }): Promise<
    CoreAPIResponse<{ specification: { created: number; data: string } }>
  > {
    const response = await fetch(
      `${CORE_API}/projects/${projectId}/specifications/${specificationHash}`,
      {
        method: "GET",
      }
    );

    return _resultFromResponse(response);
  }

  async getRunBlock({
    projectId,
    runId,
    blockType,
    blockName,
  }: {
    projectId: string;
    runId: string;
    blockType: BlockType;
    blockName: string;
  }): Promise<CoreAPIResponse<{ run: CoreAPIRun }>> {
    const response = await fetch(
      `${CORE_API}/projects/${projectId}/runs/${runId}/blocks/${blockType}/${blockName}`,
      {
        method: "GET",
      }
    );

    return _resultFromResponse(response);
  }

  async createDataSource({
    projectId,
    dataSourceId,
    config,
    credentials,
  }: {
    projectId: string;
    dataSourceId: string;
    config: CoreAPIDataSourceConfig;
    credentials: CredentialsType;
  }): Promise<CoreAPIResponse<{ data_source: CoreAPIDataSource }>> {
    const response = await fetch(
      `${CORE_API}/projects/${projectId}/data_sources`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          data_source_id: dataSourceId,
          config: config,
          credentials: credentials,
        }),
      }
    );

    return _resultFromResponse(response);
  }

  async getDataSource({
    projectId,
    dataSourceId,
  }: {
    projectId: string;
    dataSourceId: string;
  }): Promise<CoreAPIResponse<{ data_source: CoreAPIDataSource }>> {
    const response = await fetch(
      `${CORE_API}/projects/${projectId}/data_sources/${dataSourceId}`,
      {
        headers: {
          "Content-Type": "application/json",
        },
      }
    );

    return _resultFromResponse(response);
  }

  async deleteDataSource({
    projectId,
    dataSourceName,
  }: {
    projectId: string;
    dataSourceName: string;
  }): Promise<CoreAPIResponse<{ data_source: CoreAPIDataSource }>> {
    const response = await fetch(
      `${CORE_API}/projects/${projectId}/data_sources/${dataSourceName}`,
      {
        method: "DELETE",
      }
    );

    return _resultFromResponse(response);
  }

  async searchDataSource(
    projectId: string,
    dataSourceName: string,
    payload: {
      query: string;
      topK: number;
      filter?: {
        tags: {
          in?: string[] | null;
          not?: string[] | null;
        };
        parents?: {
          in?: string[] | null;
          not?: string[] | null;
        };
        timestamp?: {
          gt?: number | null;
          lt?: number | null;
        };
      } | null;
      fullText: boolean;
      credentials: { [key: string]: string };
      target_document_tokens?: number | null;
    }
  ): Promise<CoreAPIResponse<{ documents: CoreAPIDocument[] }>> {
    const response = await fetch(
      `${CORE_API}/projects/${projectId}/data_sources/${dataSourceName}/search`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          query: payload.query,
          top_k: payload.topK,
          filter: payload.filter,
          full_text: payload.fullText,
          credentials: payload.credentials,
          target_document_tokens: payload.target_document_tokens,
        }),
      }
    );

    return _resultFromResponse(response);
  }

  async getDataSourceDocuments({
    projectId,
    dataSourceName,
    limit,
    offset,
  }: {
    projectId: string;
    dataSourceName: string;
    limit: number;
    offset: number;
  }): Promise<
    CoreAPIResponse<{
      offset: number;
      limit: number;
      total: number;
      documents: CoreAPIDocument[];
    }>
  > {
    const response = await fetch(
      `${CORE_API}/projects/${projectId}/data_sources/${dataSourceName}/documents?limit=${limit}&offset=${offset}`,
      {
        method: "GET",
      }
    );
    return _resultFromResponse(response);
  }

  async getDataSourceDocument({
    projectId,
    dataSourceName,
    documentId,
    versionHash,
  }: {
    projectId: string;
    dataSourceName: string;
    documentId: string;
    versionHash?: string | null;
  }): Promise<
    CoreAPIResponse<{
      document: CoreAPIDocument;
      data_source: CoreAPIDataSource;
    }>
  > {
    const qs = versionHash ? `?version_hash=${versionHash}` : "";
    const response = await fetch(
      `${CORE_API}/projects/${projectId}/data_sources/${dataSourceName}/documents/${encodeURIComponent(
        documentId
      )}${qs}`,
      {
        method: "GET",
      }
    );

    return _resultFromResponse(response);
  }

  async getDataSourceDocumentVersions({
    projectId,
    dataSourceName,
    documentId,
    latest_hash,
    limit = 10,
    offset = 0,
  }: {
    projectId: string;
    dataSourceName: string;
    documentId: string;
    limit: number;
    offset: number;
    latest_hash?: string | null;
  }): Promise<
    CoreAPIResponse<{
      versions: { hash: string; created: number }[];
      offset: number;
      limit: number;
      total: number;
    }>
  > {
    const params = new URLSearchParams({
      limit: String(limit),
      offset: String(offset),
    });

    if (latest_hash) {
      params.append("latest_hash", latest_hash);
    }

    const response = await fetch(
      `${CORE_API}/projects/${projectId}/data_sources/${dataSourceName}/documents/${encodeURIComponent(
        documentId
      )}/versions?${params.toString()}`,
      {
        method: "GET",
      }
    );

    return _resultFromResponse(response);
  }

  async upsertDataSourceDocument({
    projectId,
    dataSourceName,
    documentId,
    timestamp,
    tags,
    parents,
    sourceUrl,
    section,
    credentials,
    lightDocumentOutput = false,
  }: {
    projectId: string;
    dataSourceName: string;
    documentId: string;
    timestamp?: number | null;
    tags: string[];
    parents: string[];
    sourceUrl?: string | null;
    section: CoreAPIDataSourceDocumentSection;
    credentials: CredentialsType;
    lightDocumentOutput?: boolean;
  }): Promise<
    CoreAPIResponse<{
      document:
        | CoreAPIDocument
        // if lightDocumentOutput is true, we return this type
        | CoreAPILightDocument;

      data_source: CoreAPIDataSource;
    }>
  > {
    const response = await fetch(
      `${CORE_API}/projects/${projectId}/data_sources/${dataSourceName}/documents`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          document_id: documentId,
          timestamp,
          section,
          tags,
          parents,
          source_url: sourceUrl,
          credentials,
          light_document_output: lightDocumentOutput,
        }),
      }
    );

    return _resultFromResponse(response);
  }

  async updateDataSourceDocumentTags({
    projectId,
    dataSourceName,
    documentId,
    addTags,
    removeTags,
  }: {
    projectId: string;
    dataSourceName: string;
    documentId: string;
    addTags?: string[];
    removeTags?: string[];
  }): Promise<
    CoreAPIResponse<{
      data_source: CoreAPIDataSource;
    }>
  > {
    const response = await fetch(
      `${CORE_API}/projects/${projectId}/data_sources/${dataSourceName}/documents/${encodeURIComponent(
        documentId
      )}/tags`,
      {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          add_tags: addTags,
          remove_tags: removeTags,
        }),
      }
    );

    return _resultFromResponse(response);
  }

  async updateDataSourceDocumentParents({
    projectId,
    dataSourceName,
    documentId,
    parents,
  }: {
    projectId: string;
    dataSourceName: string;
    documentId: string;
    parents: string[];
  }): Promise<
    CoreAPIResponse<{
      data_source: CoreAPIDataSource;
    }>
  > {
    const response = await fetch(
      `${CORE_API}/projects/${projectId}/data_sources/${dataSourceName}/documents/${encodeURIComponent(
        documentId
      )}/parents`,
      {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          parents: parents,
        }),
      }
    );

    return _resultFromResponse(response);
  }

  async deleteDataSourceDocument({
    projectId,
    dataSourceName,
    documentId,
  }: {
    projectId: string;
    dataSourceName: string;
    documentId: string;
  }): Promise<CoreAPIResponse<{ data_source: CoreAPIDataSource }>> {
    const response = await fetch(
      `${CORE_API}/projects/${projectId}/data_sources/${dataSourceName}/documents/${encodeURIComponent(
        documentId
      )}`,
      {
        method: "DELETE",
      }
    );

    return _resultFromResponse(response);
  }

  async tokenize({
    text,
    modelId,
    providerId,
  }: {
    text: string;
    modelId: string;
    providerId: string;
  }): Promise<CoreAPIResponse<{ tokens: CoreAPITokenType[] }>> {
    const credentials = dustManagedCredentials();
    const response = await fetch(`${CORE_API}/tokenize`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        text,
        model_id: modelId,
        provider_id: providerId,
        credentials,
      }),
    });

    return _resultFromResponse(response);
  }

  async dataSourceTokenize({
    text,
    projectId,
    dataSourceName,
  }: {
    text: string;
    projectId: string;
    dataSourceName: string;
  }): Promise<CoreAPIResponse<{ tokens: CoreAPITokenType[] }>> {
    const response = await fetch(
      `${CORE_API}/projects/${projectId}/data_sources/${dataSourceName}/tokenize`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ text }),
      }
    );
    return _resultFromResponse(response);
  }

  async upsertTable({
    projectId,
    dataSourceName,
    tableId,
    name,
    description,
  }: {
    projectId: string;
    dataSourceName: string;
    tableId: string;
    name: string;
    description: string;
  }): Promise<CoreAPIResponse<{ table: CoreAPITable }>> {
    const response = await fetch(
      `${CORE_API}/projects/${projectId}/data_sources/${dataSourceName}/tables`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          table_id: tableId,
          name: name,
          description: description,
        }),
      }
    );

    return _resultFromResponse(response);
  }

  async getTable({
    projectId,
    dataSourceName,
    tableId,
  }: {
    projectId: string;
    dataSourceName: string;
    tableId: string;
  }): Promise<CoreAPIResponse<{ table: CoreAPITable }>> {
    const response = await fetch(
      `${CORE_API}/projects/${projectId}/data_sources/${dataSourceName}/tables/${tableId}`,
      {
        method: "GET",
      }
    );

    return _resultFromResponse(response);
  }

  async getTables({
    projectId,
    dataSourceName,
  }: {
    projectId: string;
    dataSourceName: string;
  }): Promise<
    CoreAPIResponse<{
      tables: CoreAPITable[];
    }>
  > {
    const response = await fetch(
      `${CORE_API}/projects/${projectId}/data_sources/${dataSourceName}/tables`,
      {
        method: "GET",
      }
    );

    return _resultFromResponse(response);
  }

  async deleteTable({
    projectId,
    dataSourceName,
    tableId,
  }: {
    projectId: string;
    dataSourceName: string;
    tableId: string;
  }): Promise<CoreAPIResponse<{ success: true }>> {
    const response = await fetch(
      `${CORE_API}/projects/${projectId}/data_sources/${dataSourceName}/tables/${tableId}`,
      {
        method: "DELETE",
      }
    );

    return _resultFromResponse(response);
  }

  async upsertTableRows({
    projectId,
    dataSourceName,
    tableId,
    rows,
    truncate,
  }: {
    projectId: string;
    dataSourceName: string;
    tableId: string;
    rows: CoreAPIRow[];
    truncate?: boolean;
  }): Promise<CoreAPIResponse<{ success: true }>> {
    const response = await fetch(
      `${CORE_API}/projects/${projectId}/data_sources/${dataSourceName}/tables/${tableId}/rows`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          rows,
          truncate: truncate || false,
        }),
      }
    );

    return _resultFromResponse(response);
  }

  async getTableRow({
    projectId,
    dataSourceName,
    tableId,
    rowId,
  }: {
    projectId: string;
    dataSourceName: string;
    tableId: string;
    rowId: string;
  }): Promise<CoreAPIResponse<{ row: CoreAPIRow }>> {
    const response = await fetch(
      `${CORE_API}/projects/${projectId}/data_sources/${dataSourceName}/tables/${tableId}/rows/${rowId}`,
      {
        method: "GET",
      }
    );

    return _resultFromResponse(response);
  }

  async getTableRows({
    projectId,
    dataSourceName,
    tableId,
    limit,
    offset,
  }: {
    projectId: string;
    dataSourceName: string;
    tableId: string;
    limit: number;
    offset: number;
  }): Promise<
    CoreAPIResponse<{
      rows: CoreAPIRow[];
      offset: number;
      limit: number;
      total: number;
    }>
  > {
    const response = await fetch(
      `${CORE_API}/projects/${projectId}/data_sources/${dataSourceName}/tables/${tableId}/rows?limit=${limit}&offset=${offset}`,
      {
        method: "GET",
      }
    );

    return _resultFromResponse(response);
  }

  async queryDatabase({
    tables,
    query,
  }: {
    tables: Array<{
      project_id: string;
      data_source_id: string;
      table_id: string;
    }>;
    query: string;
  }): Promise<
    CoreAPIResponse<{
      schema: CoreAPITableSchema;
      results: CoreAPIQueryResult[];
    }>
  > {
    const response = await fetch(`${CORE_API}/query_database`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        query: query,
        tables: tables,
      }),
    });

    return _resultFromResponse(response);
  }
}

async function _resultFromResponse<T>(
  response: Response
): Promise<CoreAPIResponse<T>> {
  const jsonResponse = await response.json();
  if (jsonResponse.error) {
    return new Err(jsonResponse.error);
  }
  return new Ok(jsonResponse.response);
}
