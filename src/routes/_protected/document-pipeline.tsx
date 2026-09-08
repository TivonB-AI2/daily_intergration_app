import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { useCapabilities } from "@/hooks/useCapabilities";
import { useActivityLog } from "@/hooks/useActivityLog";
import {
  uploadStorageFile,
  getStorageFileUrl,
} from "@/services/db/storageService";
import {
  listPipelineConfigs,
  createPipelineConfig,
  deletePipelineConfig,
  createDocumentJob,
  listDocumentJobs,
  runPipelineStage,
  deleteDocumentJob,
  PIPELINE_STAGES,
  ACCEPTED_FILE_EXTENSIONS,
  type PipelineStage,
  type DocumentJobWithStages,
} from "@/services/db/documentPipelineService";
import { AiProviderSelect } from "@/components/ai/AiProviderSelect";
import { DEFAULT_AI_PROVIDER_ID, type AiProviderId } from "@/lib/aiProviders";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Separator } from "@/components/ui/separator";
import { Markdown } from "@/components/ui/markdown";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  Empty,
  EmptyHeader,
  EmptyTitle,
  EmptyDescription,
  EmptyMedia,
} from "@/components/ui/empty";
import {
  Upload,
  FileText,
  CircleCheck,
  CircleX,
  CircleDashed,
  Loader2,
  RotateCcw,
  Trash2,
  Download,
  Save,
  Eye,
  Workflow,
  Square,
  Play,
} from "lucide-react";
import type { PipelineStageResult } from "@/server/db/schema";

export const Route = createFileRoute("/_protected/document-pipeline")({
  component: DocumentPipelinePage,
});

const STATUS_ICON: Record<
  "pending" | "running" | "done" | "failed",
  React.ReactNode
> = {
  pending: <CircleDashed className="size-3.5 text-muted-foreground" />,
  running: <Loader2 className="size-3.5 animate-spin text-primary" />,
  done: <CircleCheck className="size-3.5 text-emerald-600" />,
  failed: <CircleX className="size-3.5 text-destructive" />,
};

const STATUS_LABEL: Record<"pending" | "running" | "done" | "failed", string> =
  {
    pending: "Pending",
    running: "Running",
    done: "Done",
    failed: "Failed",
  };

function StatusBadge({
  status,
}: {
  status: "pending" | "running" | "done" | "failed";
}) {
  return (
    <Badge
      variant={
        status === "done"
          ? "default"
          : status === "failed"
            ? "destructive"
            : "outline"
      }
      className="gap-1"
    >
      {STATUS_ICON[status]}
      {STATUS_LABEL[status]}
    </Badge>
  );
}

function DocumentPipelinePage() {
  const { data: caps, isLoading: capsLoading } = useCapabilities();
  const { logAudit, logError } = useActivityLog();
  const queryClient = useQueryClient();
  const enabled = caps?.databaseEnabled === true && caps?.s3Enabled === true;
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [selectedStages, setSelectedStages] = useState<Set<PipelineStage>>(
    new Set(PIPELINE_STAGES.map((s) => s.key)),
  );
  const [provider, setProvider] = useState<AiProviderId>(
    DEFAULT_AI_PROVIDER_ID,
  );
  const [presetName, setPresetName] = useState("");
  const [runningJobId, setRunningJobId] = useState<number | null>(null);
  const [runningLabel, setRunningLabel] = useState<string | null>(null);
  const [isUploadingFile, setIsUploadingFile] = useState(false);
  const [retryingStage, setRetryingStage] = useState<{
    jobId: number;
    stage: PipelineStage;
  } | null>(null);
  const [detailJob, setDetailJob] = useState<DocumentJobWithStages | null>(
    null,
  );
  // Cooperative cancellation: aborting the signal stops the in-flight HTTP
  // request to the server function immediately, and the orchestration loops
  // below check the same controller between phases so no further stages get
  // started. A stage that had *already* reached the server before Stop was
  // clicked may still finish running there (there's no server-side job
  // queue to cancel mid-execution) and record its own result — the same
  // documented tradeoff as the existing per-stage Retry design.
  const uploadAbortRef = useRef<AbortController | null>(null);
  const runAbortRef = useRef<AbortController | null>(null);
  const retryAbortRef = useRef<AbortController | null>(null);

  const { data: presets, isLoading: presetsLoading } = useQuery({
    queryKey: ["pipelineConfigs"],
    queryFn: () => listPipelineConfigs(),
    enabled,
    staleTime: 30_000,
  });

  const { data: jobs, isLoading: jobsLoading } = useQuery({
    queryKey: ["documentJobs"],
    queryFn: () => listDocumentJobs(),
    enabled,
  });

  const uploadMutation = useMutation({
    mutationFn: ({
      formData,
      signal,
    }: {
      formData: FormData;
      signal?: AbortSignal;
    }) => uploadStorageFile({ data: formData, signal }),
  });

  const createJobMutation = useMutation({
    mutationFn: createDocumentJob,
  });

  const runStageMutation = useMutation({
    mutationFn: runPipelineStage,
  });

  const savePresetMutation = useMutation({
    mutationFn: createPipelineConfig,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["pipelineConfigs"] });
      setPresetName("");
      toast.success("Pipeline preset saved.");
    },
  });

  const deletePresetMutation = useMutation({
    mutationFn: (id: number) => deletePipelineConfig({ data: id }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["pipelineConfigs"] });
      toast.success("Preset removed.");
    },
  });

  const deleteJobMutation = useMutation({
    mutationFn: (id: number) => deleteDocumentJob({ data: id }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["documentJobs"] });
      toast.success("Job removed.");
      setDetailJob(null);
    },
  });

  /** Every stage except `extract` reads `extract`'s own output as its input
   * (see `documentPipelineService.ts`'s `runPipelineStage`) — so a job
   * created without `extract` selected but with e.g. `summarize` selected
   * always fails immediately with "The Extract text stage must complete
   * successfully...". Enforcing the dependency here, instead of only in
   * the server error message, stops that failure from ever happening: any
   * other stage automatically pulls `extract` in with it, and `extract`
   * can't be unchecked while a dependent stage is still checked. */
  function toggleStage(stage: PipelineStage) {
    setSelectedStages((prev) => {
      const next = new Set(prev);
      if (next.has(stage)) {
        if (stage === "extract") {
          // Extract is required by every other selected stage — clear
          // everything instead of leaving them in a state that's
          // guaranteed to fail.
          return new Set();
        }
        next.delete(stage);
      } else {
        next.add(stage);
        if (stage !== "extract") next.add("extract");
      }
      return next;
    });
  }

  function applyPreset(presetId: string | null) {
    const preset = presets?.find((p) => String(p.id) === presetId);
    if (!preset) return;
    const stages = new Set(preset.stages as PipelineStage[]);
    // A preset saved before the extract-dependency rule existed could still
    // have other stages without "extract" — repair it on load rather than
    // reproducing the same guaranteed-to-fail run.
    if (stages.size > 0) stages.add("extract");
    setSelectedStages(stages);
    setProvider(preset.provider as AiProviderId);
  }

  /** `summarize`/`tags`/`classify` each only depend on `extract`'s output —
   * not on each other — so once `extract` finishes they can all run
   * concurrently instead of one-at-a-time, which is the single biggest
   * lever on wall-clock time for the default 5-stage pipeline (roughly
   * halving it, since those 3 independent AI calls overlap instead of
   * queuing). `extract` must still run first (nothing else has input yet)
   * and `report` must run last (it needs every other stage's output). */
  async function runStagesSequentially(jobId: number, stages: PipelineStage[]) {
    setRunningJobId(jobId);
    const controller = new AbortController();
    runAbortRef.current = controller;
    const stageSet = new Set(stages);
    const independentStages = stages.filter(
      (s) => s !== "extract" && s !== "report",
    );
    try {
      if (stageSet.has("extract")) {
        setRunningLabel("Extracting text...");
        await runStageMutation.mutateAsync({
          data: { jobId, stage: "extract" },
          signal: controller.signal,
        });
        queryClient.invalidateQueries({ queryKey: ["documentJobs"] });
      }
      if (controller.signal.aborted) throw new DOMException("", "AbortError");
      if (independentStages.length > 0) {
        setRunningLabel(
          `Running ${independentStages.length} stage${independentStages.length === 1 ? "" : "s"} in parallel...`,
        );
        await Promise.all(
          independentStages.map((stage) =>
            runStageMutation.mutateAsync({
              data: { jobId, stage },
              signal: controller.signal,
            }),
          ),
        );
        queryClient.invalidateQueries({ queryKey: ["documentJobs"] });
      }
      if (controller.signal.aborted) throw new DOMException("", "AbortError");
      if (stageSet.has("report")) {
        setRunningLabel("Generating report...");
        await runStageMutation.mutateAsync({
          data: { jobId, stage: "report" },
          signal: controller.signal,
        });
      }
      toast.success("Pipeline finished.");
    } catch (err) {
      const wasStopped =
        controller.signal.aborted ||
        (err instanceof DOMException && err.name === "AbortError");
      if (wasStopped) {
        toast.info(
          "Pipeline stopped. Already-started stages may still finish in the background — resume anytime with Retry.",
        );
      } else {
        toast.error(
          `Pipeline stopped: ${err instanceof Error ? err.message : "a stage failed"}`,
        );
        if (enabled) {
          logError({
            message: `Document Pipeline job ${jobId} failed: ${err instanceof Error ? err.message : "unknown error"}`,
            severity: "error",
            source: "Document Pipeline",
          });
        }
      }
    } finally {
      queryClient.invalidateQueries({ queryKey: ["documentJobs"] });
      setRunningJobId(null);
      runAbortRef.current = null;
      setRunningLabel(null);
    }
  }

  /** A stage still needs to run if it never finished, or (for `extract`
   * specifically) if it's marked "done" but with no real output — the same
   * "done but empty" edge case documented in `documentPipelineService.ts`'s
   * `findStageOutput`. Used by Resume to figure out exactly what's left to
   * do, instead of assuming the whole pipeline needs to restart. */
  function stageNeedsRun(stage: PipelineStageResult) {
    if (stage.status !== "done") return true;
    return stage.stage === "extract" && !stage.output?.trim();
  }

  /** Continues a job from wherever it was left — e.g. if the browser tab
   * was closed mid-run. Reuses `runStagesSequentially` (which already knows
   * how to run any given stage list: extract first, summarize/tags/classify
   * in parallel, report last) with just the stages that still need it,
   * instead of re-running stages that already completed successfully. */
  function handleResumeJob(jobId: number, stages: PipelineStageResult[]) {
    const remaining = stages
      .filter(stageNeedsRun)
      .map((s) => s.stage as PipelineStage);
    if (remaining.length === 0) {
      toast.info("This job has no stages left to run.");
      return;
    }
    runStagesSequentially(jobId, remaining);
  }

  async function handleFileSelected(file: File) {
    const ext = `.${file.name.split(".").pop()?.toLowerCase()}`;
    if (!ACCEPTED_FILE_EXTENSIONS.includes(ext)) {
      toast.error(
        `Unsupported file type. Accepted: ${ACCEPTED_FILE_EXTENSIONS.join(", ")}`,
      );
      return;
    }
    if (selectedStages.size === 0) {
      toast.error("Select at least one pipeline stage before uploading.");
      return;
    }
    if (selectedStages.size > 1 && !selectedStages.has("extract")) {
      // Belt-and-suspenders: toggleStage/applyPreset already prevent this
      // combination, but guard the actual run too in case selectedStages
      // was ever set some other way.
      toast.error(
        'The "Extract text" stage is required by the other selected stages.',
      );
      return;
    }
    const controller = new AbortController();
    uploadAbortRef.current = controller;
    setIsUploadingFile(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("folder", "uploads");
      const stored = await uploadMutation.mutateAsync({
        formData: fd,
        signal: controller.signal,
      });
      const stages = PIPELINE_STAGES.map((s) => s.key).filter((s) =>
        selectedStages.has(s),
      );
      const job = await createJobMutation.mutateAsync({
        data: {
          storageFileId: stored.id,
          fileName: stored.fileName,
          stages,
          provider,
        },
        signal: controller.signal,
      });
      queryClient.invalidateQueries({ queryKey: ["documentJobs"] });
      logAudit({
        action: "Started document pipeline",
        resource: stored.fileName,
        page: "/document-pipeline",
        category: "pipeline",
        status: "success",
      });
      if (fileInputRef.current) fileInputRef.current.value = "";
      runStagesSequentially(job.id, stages);
    } catch {
      if (controller.signal.aborted) {
        toast.info("Upload cancelled.");
      } else {
        toast.error(`Failed to upload ${file.name}`);
      }
    } finally {
      setIsUploadingFile(false);
      uploadAbortRef.current = null;
    }
  }

  function stopUpload() {
    uploadAbortRef.current?.abort();
  }

  function stopRun() {
    runAbortRef.current?.abort();
  }

  function stopRetry() {
    retryAbortRef.current?.abort();
  }

  async function handleRetryStage(jobId: number, stage: PipelineStage) {
    const controller = new AbortController();
    retryAbortRef.current = controller;
    setRetryingStage({ jobId, stage });
    try {
      await runStageMutation.mutateAsync({
        data: { jobId, stage },
        signal: controller.signal,
      });
      toast.success("Stage completed.");
    } catch (err) {
      if (controller.signal.aborted) {
        toast.info(
          "Retry stopped. The stage may still finish in the background.",
        );
        return;
      }
      toast.error(
        `Stage failed: ${err instanceof Error ? err.message : "unknown error"}`,
      );
    } finally {
      queryClient.invalidateQueries({ queryKey: ["documentJobs"] });
      setDetailJob((prev) => {
        if (!prev || prev.job.id !== jobId) return prev;
        const updated = jobs?.find((j) => j.job.id === jobId);
        return updated ?? prev;
      });
      setRetryingStage(null);
      retryAbortRef.current = null;
    }
  }

  async function handleDownloadReport(key: string) {
    try {
      const { url } = await getStorageFileUrl({ data: key });
      window.open(url, "_blank", "noopener,noreferrer");
    } catch {
      toast.error("Couldn't generate a download link.");
    }
  }

  if (capsLoading) {
    return (
      <div className="flex flex-col gap-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-48 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (!enabled) {
    return (
      <div className="flex flex-col gap-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            Document Intelligence Pipeline
          </h1>
        </div>
        <Alert>
          <AlertTitle>Database and Storage required</AlertTitle>
          <AlertDescription>
            This page needs both a database and file storage to be configured.
            Ask in chat to set those up.
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          Document Intelligence Pipeline
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Upload a document, run it through a multi-stage AI pipeline (extract,
          summarize, tag, classify, report), and track every stage's status and
          output.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Upload &amp; run</CardTitle>
          <CardDescription>
            Accepted formats: {ACCEPTED_FILE_EXTENSIONS.join(", ")}. PDF/DOCX/
            ODT use a lightweight built-in text extractor (no external library)
            — it works well for simple documents but can struggle with
            scanned/image-only PDFs or unusual fonts; legacy binary .doc isn't
            supported.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="flex flex-wrap items-end gap-3">
            <div className="flex flex-col gap-1">
              <Label className="text-xs font-normal text-muted-foreground">
                Load a saved preset
              </Label>
              <Select onValueChange={applyPreset}>
                <SelectTrigger className="w-[220px]">
                  <SelectValue placeholder="Custom selection" />
                </SelectTrigger>
                <SelectContent>
                  {presetsLoading ? (
                    <SelectItem value="loading" disabled>
                      Loading...
                    </SelectItem>
                  ) : presets && presets.length > 0 ? (
                    presets.map((p) => (
                      <SelectItem key={p.id} value={String(p.id)}>
                        {p.name}
                      </SelectItem>
                    ))
                  ) : (
                    <SelectItem value="none" disabled>
                      No presets saved yet
                    </SelectItem>
                  )}
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-1">
              <Label className="text-xs font-normal text-muted-foreground">
                AI provider
              </Label>
              <AiProviderSelect value={provider} onChange={setProvider} />
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <Label className="text-xs font-normal text-muted-foreground">
              Pipeline stages
            </Label>
            <div className="flex flex-wrap gap-3">
              {PIPELINE_STAGES.map((stage) => (
                <div
                  key={stage.key}
                  className="flex items-start gap-2 rounded-md border p-2.5 text-sm"
                >
                  <Checkbox
                    id={`stage-${stage.key}`}
                    checked={selectedStages.has(stage.key)}
                    onCheckedChange={() => toggleStage(stage.key)}
                  />
                  <label
                    htmlFor={`stage-${stage.key}`}
                    className="flex cursor-pointer flex-col"
                  >
                    <span className="font-medium">{stage.label}</span>
                    <span className="text-xs text-muted-foreground">
                      {stage.description}
                      {stage.key === "extract" &&
                        selectedStages.size > 1 &&
                        " Required by the other selected stages."}
                    </span>
                  </label>
                </div>
              ))}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Input
              placeholder="Preset name (optional, to save this selection)"
              value={presetName}
              onChange={(e) => setPresetName(e.target.value)}
              className="w-[280px]"
            />
            <Button
              variant="outline"
              size="sm"
              disabled={!presetName.trim() || selectedStages.size === 0}
              onClick={() =>
                savePresetMutation.mutate({
                  data: {
                    name: presetName.trim(),
                    stages: PIPELINE_STAGES.map((s) => s.key).filter((s) =>
                      selectedStages.has(s),
                    ),
                    provider,
                  },
                })
              }
            >
              <Save /> Save as preset
            </Button>
          </div>

          <Separator />

          <div className="flex items-center gap-3">
            <Button
              onClick={() => fileInputRef.current?.click()}
              disabled={isUploadingFile}
            >
              <Upload />
              {isUploadingFile ? "Uploading..." : "Upload document"}
            </Button>
            {isUploadingFile && (
              <Button variant="outline" size="sm" onClick={stopUpload}>
                <Square className="fill-current" /> Stop
              </Button>
            )}
            <input
              ref={fileInputRef}
              type="file"
              accept={ACCEPTED_FILE_EXTENSIONS.join(",")}
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) handleFileSelected(file);
              }}
            />
            <p className="text-xs text-muted-foreground">
              Uploading starts the pipeline automatically with the stages
              selected above.
            </p>
          </div>

          {presets && presets.length > 0 && (
            <div className="flex flex-col gap-1.5">
              <span className="text-xs font-medium text-muted-foreground">
                Saved presets:
              </span>
              <div className="flex flex-wrap gap-1.5">
                {presets.map((p) => (
                  <Badge key={p.id} variant="secondary" className="gap-1.5">
                    {p.name}
                    <button
                      type="button"
                      onClick={() => deletePresetMutation.mutate(p.id)}
                      className="text-muted-foreground hover:text-destructive"
                      aria-label={`Delete preset ${p.name}`}
                    >
                      <Trash2 className="size-3" />
                    </button>
                  </Badge>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            Jobs {jobs && jobs.length > 0 ? `(${jobs.length})` : ""}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {jobsLoading ? (
            <div className="flex flex-col gap-2">
              <Skeleton className="h-16 w-full" />
              <Skeleton className="h-16 w-full" />
            </div>
          ) : !jobs || jobs.length === 0 ? (
            <Empty>
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <Workflow />
                </EmptyMedia>
                <EmptyTitle>No documents processed yet</EmptyTitle>
                <EmptyDescription>
                  Upload a document above to run it through the pipeline.
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : (
            <div className="flex flex-col gap-3">
              {jobs.map(({ job, stages, reportStorageFile }) => {
                const doneCount = stages.filter(
                  (s) => s.status === "done",
                ).length;
                const isRunning = runningJobId === job.id;
                const progressPct =
                  stages.length > 0 ? (doneCount / stages.length) * 100 : 0;
                // A job left over from a closed tab (or one that simply
                // hasn't finished) can be continued from wherever it
                // stopped instead of only being retryable stage-by-stage.
                const canResume =
                  !isRunning &&
                  job.status !== "done" &&
                  stages.some(stageNeedsRun);
                return (
                  <div
                    key={job.id}
                    className="flex flex-col gap-2 rounded-lg border p-3"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div className="flex min-w-0 items-center gap-2.5">
                        <div className="flex size-8 shrink-0 items-center justify-center rounded-md bg-muted">
                          <FileText className="size-4 text-muted-foreground" />
                        </div>
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium">
                            {job.fileName}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {isRunning && runningLabel
                              ? runningLabel
                              : `${doneCount}/${stages.length} stages complete`}
                          </p>
                        </div>
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        <StatusBadge
                          status={isRunning ? "running" : job.status}
                        />
                        {isRunning && (
                          <Button variant="outline" size="sm" onClick={stopRun}>
                            <Square className="fill-current" /> Stop
                          </Button>
                        )}
                        {canResume && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleResumeJob(job.id, stages)}
                            title="Continue this job from wherever it last stopped"
                          >
                            <Play /> Resume
                          </Button>
                        )}
                        {reportStorageFile && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() =>
                              handleDownloadReport(reportStorageFile.key)
                            }
                          >
                            <Download /> Report
                          </Button>
                        )}
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() =>
                            setDetailJob({
                              job,
                              stages,
                              reportStorageFile,
                              storageFile: null,
                            })
                          }
                        >
                          <Eye /> Details
                        </Button>
                        <AlertDialog>
                          <AlertDialogTrigger
                            render={
                              <Button variant="ghost" size="sm">
                                <Trash2 className="text-destructive" />
                              </Button>
                            }
                          />
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>
                                Delete this job?
                              </AlertDialogTitle>
                              <AlertDialogDescription>
                                This removes the job and its stage history. The
                                uploaded file itself stays in Storage.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Cancel</AlertDialogCancel>
                              <AlertDialogAction
                                onClick={() => deleteJobMutation.mutate(job.id)}
                              >
                                Delete
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </div>
                    </div>
                    {(isRunning ||
                      (job.status !== "pending" && stages.length > 0)) && (
                      <Progress value={progressPct} className="h-1.5" />
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog
        open={detailJob != null}
        onOpenChange={(open) => !open && setDetailJob(null)}
      >
        <DialogContent className="max-w-2xl">
          {detailJob && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center justify-between gap-3 pr-6">
                  {detailJob.job.fileName}
                  {(() => {
                    const liveStagesForHeader =
                      jobs?.find((j) => j.job.id === detailJob.job.id)
                        ?.stages ?? detailJob.stages;
                    const isRunningHeader = runningJobId === detailJob.job.id;
                    const canResumeHeader =
                      !isRunningHeader &&
                      detailJob.job.status !== "done" &&
                      liveStagesForHeader.some(stageNeedsRun);
                    return (
                      canResumeHeader && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() =>
                            handleResumeJob(
                              detailJob.job.id,
                              liveStagesForHeader,
                            )
                          }
                        >
                          <Play /> Resume
                        </Button>
                      )
                    );
                  })()}
                </DialogTitle>
              </DialogHeader>
              {(() => {
                const liveStages =
                  jobs?.find((j) => j.job.id === detailJob.job.id)?.stages ??
                  detailJob.stages;
                const isRunning = runningJobId === detailJob.job.id;
                const doneCount = liveStages.filter(
                  (s) => s.status === "done",
                ).length;
                return (
                  <div className="flex flex-col gap-1">
                    <Progress
                      value={
                        liveStages.length > 0
                          ? (doneCount / liveStages.length) * 100
                          : 0
                      }
                      className="h-1.5"
                    />
                    <p className="text-xs text-muted-foreground">
                      {isRunning && runningLabel
                        ? runningLabel
                        : `${doneCount}/${liveStages.length} stages complete`}
                    </p>
                  </div>
                );
              })()}
              <div className="flex flex-col gap-3 max-h-[70vh] overflow-y-auto">
                {(() => {
                  const liveDetailStages =
                    jobs?.find((j) => j.job.id === detailJob.job.id)?.stages ??
                    detailJob.stages;
                  const extractDone = liveDetailStages.some(
                    (s) =>
                      s.stage === "extract" &&
                      s.status === "done" &&
                      !!s.output?.trim(),
                  );
                  return liveDetailStages.map((stage) => {
                    const meta = PIPELINE_STAGES.find(
                      (s) => s.key === stage.stage,
                    );
                    // Summarize/tags/classify/report all read the "extract"
                    // stage's own recorded output as their input (see
                    // documentPipelineService.ts's runPipelineStage) — retrying
                    // one of them before extract has actually completed is
                    // guaranteed to fail with the same error every time, so
                    // the Retry button is disabled with an explanation
                    // instead of letting the user hit that failure again.
                    const retryBlocked =
                      stage.stage !== "extract" && !extractDone;
                    // A job run before the empty-extraction guard existed
                    // could have its Extract stage stuck showing "done"
                    // with no real output — offer Retry for it too, not
                    // just for "failed", so it isn't a dead end.
                    const isStuckEmptyExtract =
                      stage.stage === "extract" &&
                      stage.status === "done" &&
                      !stage.output?.trim();
                    const showRetry =
                      stage.status === "failed" || isStuckEmptyExtract;
                    return (
                      <div
                        key={stage.id}
                        className="rounded-lg border p-3 flex flex-col gap-2"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-sm font-medium">
                            {meta?.label ?? stage.stage}
                          </span>
                          <div className="flex items-center gap-2">
                            {(() => {
                              const isRetrying =
                                retryingStage?.jobId === detailJob.job.id &&
                                retryingStage?.stage === stage.stage;
                              return (
                                <StatusBadge
                                  status={isRetrying ? "running" : stage.status}
                                />
                              );
                            })()}
                            {retryingStage?.jobId === detailJob.job.id &&
                            retryingStage?.stage === stage.stage ? (
                              <Button
                                variant="outline"
                                size="sm"
                                className="h-7 gap-1 px-2 text-xs"
                                onClick={stopRetry}
                              >
                                <Square className="size-3 fill-current" /> Stop
                              </Button>
                            ) : (
                              showRetry &&
                              (retryBlocked ? (
                                <Button
                                  variant="outline"
                                  size="sm"
                                  disabled
                                  className="h-7 gap-1 px-2 text-xs"
                                  title='Retry "Extract text" first — this stage needs its output.'
                                >
                                  <RotateCcw className="size-3" /> Retry
                                </Button>
                              ) : (
                                <Button
                                  variant="outline"
                                  size="sm"
                                  className="h-7 gap-1 px-2 text-xs"
                                  onClick={() =>
                                    handleRetryStage(
                                      detailJob.job.id,
                                      stage.stage,
                                    )
                                  }
                                >
                                  <RotateCcw className="size-3" /> Retry
                                </Button>
                              ))
                            )}
                          </div>
                        </div>
                        {isStuckEmptyExtract && (
                          <p className="text-xs text-destructive">
                            This stage produced no usable text. Retry it, or try
                            a different file.
                          </p>
                        )}
                        {stage.status === "failed" && stage.errorMessage && (
                          <p className="text-xs text-destructive">
                            {retryBlocked
                              ? 'The "Extract text" stage must complete successfully before this stage can run. Retry "Extract text" first.'
                              : stage.errorMessage}
                          </p>
                        )}
                        {stage.output && (
                          <div
                            className={cn(
                              "rounded-md bg-muted/50 p-2.5 text-xs",
                              "max-h-56 overflow-y-auto",
                            )}
                          >
                            <Markdown className="[&_*]:text-xs">
                              {stage.output}
                            </Markdown>
                          </div>
                        )}
                      </div>
                    );
                  });
                })()}
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
