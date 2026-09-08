import { useState } from "react";
import { toast } from "sonner";
import { Play } from "lucide-react";
import { useRunWorkflow } from "@/hooks/useWorkflows";
import { useWorkflowDataAppConfig } from "@/hooks/useDataAppSessions";
import { extractAssistantContent } from "@/hooks/useChatAssistant";
import { getOrCreateSessionId } from "@/lib/sessionManager";
import { useCapabilities } from "@/hooks/useCapabilities";
import { useActivityLog } from "@/hooks/useActivityLog";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";

export type WorkflowRunResult = {
  output: string;
  durationMs: number;
  status: "success" | "failure";
};

/**
 * Runs a single registered workflow. Mounted per-dialog (not per-row) because
 * `useRunWorkflow` is a hook bound to one workflow id.
 */
export function WorkflowRunDialog({
  workflowId,
  workflowName,
  open,
  onOpenChange,
  onFinished,
}: {
  workflowId: string;
  workflowName: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onFinished: (result: WorkflowRunResult, input: string) => void;
}) {
  const [input, setInput] = useState("");
  const [output, setOutput] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  const { data: caps } = useCapabilities();
  const dbEnabled = caps?.databaseEnabled === true;
  const { logError } = useActivityLog();

  const { data: config, isLoading: configLoading } =
    useWorkflowDataAppConfig(workflowId);
  const runWorkflow = useRunWorkflow(workflowId);

  const dataAppId = config?.data?.attributes.configuration.interface?.dataAppId;
  const dataAppToken =
    config?.data?.attributes.configuration.interface?.dataAppToken;
  const isPublished = config?.data?.attributes.status === "published";
  // Only a published workflow can be run from here — verified live that the
  // platform's run endpoint works fine WITHOUT a data-app id/token pair (most
  // workflows don't have one), so that pair is sent when present (for chat
  // session continuity) but is never required to allow running.
  const canRun = !configLoading && isPublished;

  function handleRun() {
    if (!input.trim()) {
      toast.error("Please enter an input message for the workflow.");
      return;
    }

    const startedAt = Date.now();
    setOutput(null);
    setFailed(false);
    const sessionId = dataAppId ? getOrCreateSessionId(dataAppId) : undefined;

    runWorkflow.mutate(
      {
        // The platform's chat trigger expects the input keyed as `text`
        // (verified against live workflow runs) — not `message`.
        workflow: { inputs: { text: input.trim() } },
        ...(dataAppId ? { dataAppId } : {}),
        ...(dataAppToken ? { dataAppToken } : {}),
        ...(sessionId ? { dataAppSessionId: sessionId } : {}),
      },
      {
        onSuccess: (res) => {
          const durationMs = Date.now() - startedAt;
          const content =
            extractAssistantContent(res as Record<string, unknown>) ||
            JSON.stringify(res, null, 2);
          setOutput(content);
          setFailed(false);
          onFinished(
            { output: content, durationMs, status: "success" },
            input.trim(),
          );
          toast.success(`"${workflowName}" finished.`);
        },
        onError: (error) => {
          const durationMs = Date.now() - startedAt;
          const message = error.message || "The workflow failed to run.";
          setOutput(message);
          setFailed(true);
          onFinished(
            { output: message, durationMs, status: "failure" },
            input.trim(),
          );
          toast.error(`"${workflowName}" failed.`);
          if (dbEnabled) {
            logError({
              message: `Workflow "${workflowName}" failed to run: ${message}`,
              severity: "error",
              source: "Workflows",
            });
          }
        },
      },
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Run “{workflowName}”</DialogTitle>
          <DialogDescription>
            Send an input message to this workflow and see what it returns.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          {configLoading ? (
            <Skeleton className="h-24 w-full" />
          ) : !canRun ? (
            <Alert variant="destructive">
              <AlertDescription>
                This workflow is still a draft, so it can't be run from here.
                Publish it in the platform first.
              </AlertDescription>
            </Alert>
          ) : (
            <div className="flex flex-col gap-2">
              <Label htmlFor="workflow-input">Input message</Label>
              <Textarea
                id="workflow-input"
                rows={4}
                placeholder="Ask the workflow something..."
                value={input}
                onChange={(e) => setInput(e.target.value)}
              />
            </div>
          )}

          <Button
            onClick={handleRun}
            disabled={!canRun || runWorkflow.isPending}
          >
            {runWorkflow.isPending ? (
              <Spinner className="h-4 w-4" />
            ) : (
              <Play className="h-4 w-4" />
            )}
            {runWorkflow.isPending ? "Running..." : "Run Workflow"}
          </Button>

          {output !== null && (
            <div className="flex flex-col gap-2">
              <Label>Result</Label>
              <div
                className={
                  failed
                    ? "max-h-72 overflow-y-auto rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm whitespace-pre-wrap text-destructive"
                    : "max-h-72 overflow-y-auto rounded-lg border bg-muted p-3 text-sm whitespace-pre-wrap"
                }
              >
                {output}
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
