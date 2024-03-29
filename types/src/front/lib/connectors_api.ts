import { ConnectorProvider } from "../../front/data_source";
import { Err, Ok, Result } from "../../front/lib/result";
import { LoggerInterface } from "../../shared/logger";

export type ConnectorsAPIErrorResponse = {
  error: {
    message: string;
    type?: string;
  };
};

const {
  CONNECTORS_API = "http://127.0.0.1:3002",
  DUST_CONNECTORS_SECRET = "",
} = process.env;

export type ConnectorsAPIResponse<T> = Result<T, ConnectorsAPIErrorResponse>;
export type ConnectorSyncStatus = "succeeded" | "failed";
export type ConnectorErrorType = "oauth_token_revoked";

export const CONNECTOR_PROVIDERS_USING_NANGO = [
  "confluence",
  "google_drive",
  "intercom",
  "notion",
  "slack",
] as const;
type ConnectorProviderUsingNango =
  (typeof CONNECTOR_PROVIDERS_USING_NANGO)[number];

export function connectorIsUsingNango(
  provider: string
): provider is ConnectorProviderUsingNango {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return CONNECTOR_PROVIDERS_USING_NANGO.includes(provider as any);
}

export type ConnectorType = {
  id: string;
  type: ConnectorProvider;

  lastSyncStatus?: ConnectorSyncStatus;
  lastSyncStartTime?: number;
  lastSyncFinishTime?: number;
  lastSyncSuccessfulTime?: number;
  firstSuccessfulSyncTime?: number;
  firstSyncProgress?: string;
  errorType?: ConnectorErrorType;
};

export type ConnectorPermission = "read" | "write" | "read_write" | "none";
export type ConnectorResourceType = "file" | "folder" | "database" | "channel";

export type ConnectorResource = {
  provider: ConnectorProvider;
  internalId: string;
  parentInternalId: string | null;
  type: ConnectorResourceType;
  title: string;
  sourceUrl: string | null;
  expandable: boolean;
  permission: ConnectorPermission;
  dustDocumentId: string | null;
  lastUpdatedAt: number | null;
};

export type GoogleDriveFolderType = {
  id: string;
  name: string;
  parent: string | null;
  children: string[];
};

export type GoogleDriveSelectedFolderType = GoogleDriveFolderType & {
  selected: boolean;
};

export class ConnectorsAPI {
  _logger: LoggerInterface;
  constructor(logger: LoggerInterface) {
    this._logger = logger;
  }

  async createConnector(
    provider: ConnectorProvider,
    workspaceId: string,
    workspaceAPIKey: string,
    dataSourceName: string,
    connectorParams:
      | {
          connectionId: string;
        }
      | {
          url: string;
        }
  ): Promise<ConnectorsAPIResponse<ConnectorType>> {
    const res = await fetch(`${CONNECTORS_API}/connectors/create/${provider}`, {
      method: "POST",
      headers: this.getDefaultHeaders(),
      body: JSON.stringify({
        workspaceId,
        workspaceAPIKey,
        dataSourceName,
        connectorParams,
      }),
    });

    return this._resultFromResponse(res);
  }

  async updateConnector({
    connectorId,
    params: { connectionId },
  }: {
    connectorId: string;
    params: {
      connectionId?: string | null;
    };
  }): Promise<ConnectorsAPIResponse<{ connectorId: string }>> {
    const res = await fetch(
      `${CONNECTORS_API}/connectors/update/${connectorId}`,
      {
        method: "POST",
        headers: this.getDefaultHeaders(),
        body: JSON.stringify({
          connectionId,
        }),
      }
    );

    return this._resultFromResponse(res);
  }

  async pauseConnector(
    connectorId: string
  ): Promise<ConnectorsAPIResponse<{ connectorId: string }>> {
    const res = await fetch(
      `${CONNECTORS_API}/connectors/pause/${connectorId}`,
      {
        method: "POST",
        headers: this.getDefaultHeaders(),
      }
    );

    return this._resultFromResponse(res);
  }

  async resumeConnector(
    connectorId: string
  ): Promise<ConnectorsAPIResponse<{ connectorId: string }>> {
    const res = await fetch(
      `${CONNECTORS_API}/connectors/resume/${connectorId}`,
      {
        method: "POST",
        headers: this.getDefaultHeaders(),
      }
    );

    return this._resultFromResponse(res);
  }

  async syncConnector(
    connectorId: string
  ): Promise<ConnectorsAPIResponse<{ connectorId: string }>> {
    const res = await fetch(
      `${CONNECTORS_API}/connectors/sync/${connectorId}`,
      {
        method: "POST",
        headers: this.getDefaultHeaders(),
      }
    );

    return this._resultFromResponse(res);
  }

  async deleteConnector(
    connectorId: string,
    force = false
  ): Promise<ConnectorsAPIResponse<{ success: true }>> {
    const res = await fetch(
      `${CONNECTORS_API}/connectors/delete/${connectorId}?force=${
        force ? "true" : "false"
      }`,
      {
        method: "DELETE",
        headers: this.getDefaultHeaders(),
      }
    );

    return this._resultFromResponse(res);
  }

  async getConnectorPermissions({
    connectorId,
    parentId,
    filterPermission,
  }: {
    connectorId: string;
    parentId?: string;
    filterPermission?: ConnectorPermission;
  }): Promise<ConnectorsAPIResponse<{ resources: ConnectorResource[] }>> {
    let url = `${CONNECTORS_API}/connectors/${connectorId}/permissions?`;
    if (parentId) {
      url += `&parentId=${parentId}`;
    }
    if (filterPermission) {
      url += `&filterPermission=${filterPermission}`;
    }

    const res = await fetch(url, {
      method: "GET",
      headers: this.getDefaultHeaders(),
    });

    return this._resultFromResponse(res);
  }

  async setConnectorPermissions({
    connectorId,
    resources,
  }: {
    connectorId: string;
    resources: { internalId: string; permission: ConnectorPermission }[];
  }): Promise<ConnectorsAPIResponse<void>> {
    const res = await fetch(
      `${CONNECTORS_API}/connectors/${connectorId}/permissions`,
      {
        method: "POST",
        headers: this.getDefaultHeaders(),
        body: JSON.stringify({
          resources: resources.map(({ internalId, permission }) => ({
            internal_id: internalId,
            permission,
          })),
        }),
      }
    );

    return this._resultFromResponse(res);
  }

  async getConnector(
    connectorId: string
  ): Promise<ConnectorsAPIResponse<ConnectorType>> {
    const res = await fetch(`${CONNECTORS_API}/connectors/${connectorId}`, {
      method: "GET",
      headers: this.getDefaultHeaders(),
    });

    return this._resultFromResponse(res);
  }

  async setConnectorConfig(
    connectorId: string,
    configKey: string,
    configValue: string
  ): Promise<ConnectorsAPIResponse<void>> {
    const res = await fetch(
      `${CONNECTORS_API}/connectors/${connectorId}/config/${configKey}`,
      {
        method: "POST",
        headers: this.getDefaultHeaders(),
        body: JSON.stringify({
          configValue,
        }),
      }
    );

    return this._resultFromResponse(res);
  }

  async getConnectorConfig(
    connectorId: string,
    configKey: string
  ): Promise<
    ConnectorsAPIResponse<{
      connectorId: number;
      configKey: string;
      configValue: string;
    }>
  > {
    const res = await fetch(
      `${CONNECTORS_API}/connectors/${connectorId}/config/${configKey}`,
      {
        method: "GET",
        headers: this.getDefaultHeaders(),
      }
    );

    return this._resultFromResponse(res);
  }

  async getResourcesParents({
    connectorId,
    resourceInternalIds,
  }: {
    connectorId: string;
    resourceInternalIds: string[];
  }): Promise<
    ConnectorsAPIResponse<{
      resources: {
        internalId: string;
        parents: string[];
      }[];
    }>
  > {
    const res = await fetch(
      `${CONNECTORS_API}/connectors/${connectorId}/resources/parents`,
      {
        method: "POST",
        headers: this.getDefaultHeaders(),
        body: JSON.stringify({
          resourceInternalIds,
        }),
      }
    );

    return this._resultFromResponse(res);
  }

  async getResourcesTitles({
    connectorId,
    resourceInternalIds,
  }: {
    connectorId: string;
    resourceInternalIds: string[];
  }): Promise<
    ConnectorsAPIResponse<{
      resources: {
        internalId: string;
        title: string;
      }[];
    }>
  > {
    const res = await fetch(
      `${CONNECTORS_API}/connectors/${connectorId}/resources/titles`,
      {
        method: "POST",
        headers: this.getDefaultHeaders(),
        body: JSON.stringify({
          resourceInternalIds,
        }),
      }
    );

    return this._resultFromResponse(res);
  }

  async linkSlackChannelsWithAgent({
    connectorId,
    slackChannelIds,
    agentConfigurationId,
  }: {
    connectorId: string;
    slackChannelIds: string[];
    agentConfigurationId: string;
  }): Promise<ConnectorsAPIResponse<{ success: true }>> {
    const res = await fetch(
      `${CONNECTORS_API}/slack/channels/linked_with_agent`,
      {
        method: "PATCH",
        headers: this.getDefaultHeaders(),
        body: JSON.stringify({
          connector_id: connectorId,
          agent_configuration_id: agentConfigurationId,
          slack_channel_ids: slackChannelIds,
        }),
      }
    );

    return this._resultFromResponse(res);
  }

  async getSlackChannelsLinkedWithAgent({
    connectorId,
  }: {
    connectorId: string;
  }): Promise<
    ConnectorsAPIResponse<{
      slackChannels: {
        slackChannelId: string;
        slackChannelName: string;
        agentConfigurationId: string;
      }[];
    }>
  > {
    const res = await fetch(
      `${CONNECTORS_API}/slack/channels/linked_with_agent?connector_id=${connectorId}`,
      {
        method: "GET",
        headers: this.getDefaultHeaders(),
      }
    );

    return this._resultFromResponse(res);
  }

  getDefaultHeaders() {
    return {
      "Content-Type": "application/json",
      Authorization: `Bearer ${DUST_CONNECTORS_SECRET}`,
    };
  }
  async _resultFromResponse<T>(
    response: Response
  ): Promise<ConnectorsAPIResponse<T>> {
    if (!response.ok) {
      if (response.headers.get("Content-Type") === "application/json") {
        const jsonError = await response.json();
        this._logger.error(
          { jsonError },
          "Unexpected response from ConnectorAPI"
        );
        return new Err(jsonError);
      } else {
        const textError = await response.text();
        try {
          const errorResponse = JSON.parse(textError);
          const errorMessage = errorResponse?.error?.message;
          const errorType = errorResponse?.error?.type;

          if (
            typeof errorMessage !== "string" ||
            typeof errorType !== "string"
          ) {
            throw new Error("Unexpected response from ConnectorAPI");
          }

          return new Err({
            error: {
              message: errorMessage,
              type: errorType,
            },
          });
        } catch (error) {
          this._logger.error(
            {
              statusCode: response.status,
              error,
              textError,
            },
            "Unexpected response from ConnectorAPI"
          );
          return new Err({
            error: {
              message: `Unexpected response status: ${response.status} ${response.statusText}`,
              type: "unexpected_response",
            },
          });
        }
      }
    }
    const jsonResponse = await response.json();

    return new Ok(jsonResponse);
  }
}
