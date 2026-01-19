import React from "react";
import { cn } from "../lib/utils";

interface BashWidgetProps {
  command: string;
  description?: string;
  result?: any;
  isRunning?: boolean;
}

// Terminal 图标 SVG
const TerminalIcon = ({ className }: { className?: string }) => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    className={className}
  >
    <rect x="2" y="4" width="20" height="16" rx="2" />
    <path d="M6 8l4 4-4 4M12 16h6" />
  </svg>
);

// ChevronRight 图标 SVG
const ChevronRightIcon = ({ className }: { className?: string }) => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    className={className}
  >
    <path d="M9 18l6-6-6-6" />
  </svg>
);

export const BashWidget: React.FC<BashWidgetProps> = ({
  command,
  description,
  result,
  isRunning = false,
}) => {
  // Extract result content if available
  let resultContent = "";
  let isError = false;

  if (result) {
    isError = result.is_error || false;
    if (typeof result.content === "string") {
      resultContent = result.content;
    } else if (result.content && typeof result.content === "object") {
      if (result.content.text) {
        resultContent = result.content.text;
      } else if (Array.isArray(result.content)) {
        resultContent = result.content
          .map((c: any) => (typeof c === "string" ? c : c.text || JSON.stringify(c)))
          .join("\n");
      } else {
        resultContent = JSON.stringify(result.content, null, 2);
      }
    }
  }

  const showRunning = isRunning || (!result && command);

  return (
    <div className="rounded-lg border border-ink-900/10 bg-surface overflow-hidden">
      <div className="px-4 py-2 bg-surface-secondary flex items-center gap-2 border-b border-ink-900/5">
        <TerminalIcon className="h-3.5 w-3.5 text-success" />
        <span className="text-xs font-mono text-muted">Terminal</span>
        {description && (
          <>
            <ChevronRightIcon className="h-3 w-3 text-muted" />
            <span className="text-xs text-muted">{description}</span>
          </>
        )}
        {/* Show loading indicator when running or no result yet */}
        {showRunning && (
          <div className="ml-auto flex items-center gap-1 text-xs text-muted">
            <div className="h-2 w-2 bg-success rounded-full animate-pulse" />
            <span>Running...</span>
          </div>
        )}
      </div>
      <div className="p-4 space-y-3">
        <code className="text-xs font-mono text-success block">
          $ {command}
        </code>

        {/* Show result if available */}
        {result && (
          <div
            className={cn(
              "mt-3 p-3 rounded-md border text-xs font-mono whitespace-pre-wrap overflow-x-auto",
              isError
                ? "border-error/20 bg-error-light text-error"
                : "border-success/20 bg-success-light text-success"
            )}
          >
            {resultContent || (isError ? "Command failed" : "Command completed")}
          </div>
        )}
      </div>
    </div>
  );
};
