import { Dialog } from "@dust-tt/sparkle";
import type {
  LightAgentConfigurationType,
  PostOrPatchAgentConfigurationRequestBody,
} from "@dust-tt/types";
import type { WorkspaceType } from "@dust-tt/types";
import { useContext } from "react";

import { SendNotificationsContext } from "@app/components/sparkle/Notification";
import { useAgentConfiguration } from "@app/lib/swr";
import type { PostAgentListStatusRequestBody } from "@app/pages/api/w/[wId]/members/me/agent_list_status";

export function DeleteAssistantDialog({
  owner,
  agentConfigurationId,
  show,
  onClose,
  onDelete,
  isPrivateAssistant,
}: {
  owner: WorkspaceType;
  agentConfigurationId: string;
  show: boolean;
  onClose: () => void;
  onDelete: () => void;
  isPrivateAssistant?: boolean;
}) {
  const sendNotification = useContext(SendNotificationsContext);

  return (
    <Dialog
      isOpen={show}
      title={`Deleting assistant`}
      onCancel={onClose}
      validateLabel={isPrivateAssistant ? "Delete" : "Delete for Everyone"}
      validateVariant="primaryWarning"
      onValidate={async () => {
        try {
          const res = await fetch(
            `/api/w/${owner.sId}/assistant/agent_configurations/${agentConfigurationId}`,
            {
              method: "DELETE",
            }
          );
          if (!res.ok) {
            const data = await res.json();
            sendNotification({
              title: "Error deleting Assistant",
              description: data.error.message,
              type: "error",
            });
          } else {
            sendNotification({
              title: "Assistant deleted",
              type: "success",
            });
            onDelete();
          }
        } catch (e) {
          sendNotification({
            title: "Error deleting Assistant",
            description: (e as Error).message,
            type: "error",
          });
        }

        onClose();
      }}
    >
      <div className="flex flex-col gap-2">
        <div className="font-bold">Are you sure you want to delete?</div>

        <div>
          {isPrivateAssistant
            ? "This will delete your personal assistant permanently."
            : "This will be permanent and delete the assistant for everyone."}
        </div>
      </div>
    </Dialog>
  );
}

export function RemoveAssistantFromListDialog({
  owner,
  agentConfiguration,
  show,
  onClose,
  onRemove,
}: {
  owner: WorkspaceType;
  agentConfiguration: LightAgentConfigurationType;
  show: boolean;
  onClose: () => void;
  onRemove: () => void;
}) {
  const sendNotification = useContext(SendNotificationsContext);

  return (
    <Dialog
      isOpen={show}
      title={`Remove from my list`}
      onCancel={onClose}
      validateLabel="Remove"
      validateVariant="primaryWarning"
      onValidate={async () => {
        const body: PostAgentListStatusRequestBody = {
          agentId: agentConfiguration.sId,
          listStatus: "not-in-list",
        };

        const res = await fetch(
          `/api/w/${owner.sId}/members/me/agent_list_status`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify(body),
          }
        );
        if (!res.ok) {
          const data = await res.json();
          sendNotification({
            title: `Error removing Assistant`,
            description: data.error.message,
            type: "error",
          });
        } else {
          sendNotification({
            title: `Assistant removed from your list`,
            type: "success",
          });
          onRemove();
        }

        onClose();
      }}
    >
      <div>
        This will remove the assistant from your list. You can add it back to
        your list at any time from the assistant gallery.
      </div>
    </Dialog>
  );
}

export function RemoveAssistantFromWorkspaceDialog({
  owner,
  agentConfiguration,
  show,
  onClose,
  onRemove,
}: {
  owner: WorkspaceType;
  agentConfiguration: LightAgentConfigurationType;
  show: boolean;
  onClose: () => void;
  onRemove: () => void;
}) {
  const sendNotification = useContext(SendNotificationsContext);

  const { agentConfiguration: detailedConfig } = useAgentConfiguration({
    workspaceId: owner.sId,
    agentConfigurationId: agentConfiguration.sId,
  });

  return (
    <Dialog
      isOpen={show}
      title={`Remove from Workspace list`}
      onCancel={onClose}
      validateLabel="Remove"
      validateVariant="primaryWarning"
      onValidate={async () => {
        if (!detailedConfig) {
          throw new Error("Agent configuration not found");
        }
        const body: PostOrPatchAgentConfigurationRequestBody = {
          assistant: {
            name: agentConfiguration.name,
            description: agentConfiguration.description,
            pictureUrl: agentConfiguration.pictureUrl,
            status: "active",
            scope: "published",
            action: detailedConfig.action,
            generation: agentConfiguration.generation,
          },
        };

        const res = await fetch(
          `/api/w/${owner.sId}/assistant/agent_configurations/${agentConfiguration.sId}`,
          {
            method: "PATCH",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify(body),
          }
        );
        if (!res.ok) {
          const data = await res.json();
          sendNotification({
            title: `Error removing from Workspace list`,
            description: data.error.message,
            type: "error",
          });
        } else {
          sendNotification({
            title: `Assistant removed from Workspace list`,
            type: "success",
          });
          onRemove();
        }

        onClose();
      }}
    >
      <div className="flex flex-col gap-2">
        <div>
          Removing the assistant from the workspace list will move it back to
          the gallery. The assistant won't be automatically active for members
          anymore.
        </div>
        <div>Any workspace member will be able to modify the assistant.</div>
      </div>
    </Dialog>
  );
}
