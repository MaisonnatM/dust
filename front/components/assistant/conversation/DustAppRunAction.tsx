import {
  ChevronDownIcon,
  ChevronRightIcon,
  Chip,
  Icon,
  Spinner,
  Tooltip,
} from "@dust-tt/sparkle";
import { useState } from "react";

import { DustAppRunActionType } from "@app/types/assistant/actions/dust_app_run";

export default function DustAppRunAction({
  dustAppRunAction,
}: {
  dustAppRunAction: DustAppRunActionType;
}) {
  const [outputVisible, setOutputVisible] = useState(false);

  function shortText(text: string, maxLength = 20) {
    const t = text.replaceAll("\n", " ");
    return t.length > maxLength ? t.substring(0, maxLength) + "..." : t;
  }

  function formatOutput(output: unknown): string {
    let nbRecords = 1;

    if (!output) {
      nbRecords = 0;
    } else if (Array.isArray(output)) {
      nbRecords = output.length;
    } else if (typeof output === "object" && output !== null) {
      nbRecords = Object.keys(output).length;
    }
    return `${nbRecords} record${nbRecords !== 1 ? "s" : ""}`;
  }

  return (
    <>
      {dustAppRunAction.params &&
        Object.keys(dustAppRunAction.params).length > 0 && (
          <div className="flex flex-row items-center gap-2 pb-2">
            <div className="flex flex-col items-start text-xs font-bold text-element-600">
              <div className="flex">Generated&nbsp;parameters:</div>
            </div>
            <Chip.List isWrapping={true}>
              {Object.keys(dustAppRunAction.params).map((k) => {
                return (
                  <Tooltip
                    key={k}
                    label={`${k}: ${dustAppRunAction.params[k]}`}
                  >
                    <Chip
                      color="slate"
                      label={shortText(`${k}: ${dustAppRunAction.params[k]}`)}
                    />
                  </Tooltip>
                );
              })}
            </Chip.List>
          </div>
        )}
      <div className="grid grid-cols-[auto,1fr] gap-2">
        <div className="grid-cols-auto grid items-center">
          {!dustAppRunAction.output ? (
            <div>
              {dustAppRunAction.runningBlock ? (
                <div className="pb-2 text-xs font-bold text-element-600">
                  Executing app {dustAppRunAction.appName}: running block{" "}
                  {dustAppRunAction.runningBlock.name}...
                </div>
              ) : (
                <div className="pb-2 text-xs font-bold text-element-600">
                  Executing app {dustAppRunAction.appName}...
                </div>
              )}
              <Spinner size="sm" />
            </div>
          ) : (
            <div className="text-xs font-bold text-element-600">
              <span>Execution output:</span>
            </div>
          )}
        </div>
        {!!dustAppRunAction.output && (
          <div className="row-span-1 select-none">
            <div
              className="cursor-pointer"
              onClick={() => {
                setOutputVisible(!outputVisible);
              }}
            >
              <Chip color="violet">
                {formatOutput(dustAppRunAction.output)}
                <Icon
                  visual={outputVisible ? ChevronDownIcon : ChevronRightIcon}
                  size="xs"
                />
              </Chip>
            </div>
          </div>
        )}
        {outputVisible && (
          <div className="col-start-2 row-span-1 max-h-48 overflow-y-auto rounded-md bg-structure-100">
            <pre className="font-mono whitespace-pre-wrap break-words px-2 py-2 text-xs text-element-700">
              #!/dust/{dustAppRunAction.appName}
              {"\n\n"}
              {JSON.stringify(dustAppRunAction.output, null, 2)}
            </pre>
          </div>
        )}
      </div>
    </>
  );
}