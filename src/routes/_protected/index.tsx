import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  AlertTriangle,
  ListTodo,
  MessageSquare,
  HardDrive,
  ServerCog,
  CheckCircle2,
  XCircle,
  Workflow as WorkflowIcon,
  ClipboardList,
  Activity,
  Plus,
  Play,
  BookOpenText,
} from "lucide-react";
import { useCapabilities } from "@/hooks/useCapabilities";
import { getDashboardSummary } from "@/services/db/dashboardService";
import { createTodo } from "@/services/db/todoService";
import { listRegisteredWorkflows } from "@/services/db/workflowRegistryService";
import { useActivityLog } from "@/hooks/useActivityLog";
import { useQuerySource } from "@/hooks/useConnectors";
import { WorkflowRunDialog } from "@/components/workflows/WorkflowRunDialog";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_protected/")({
  component: DashboardPage,
});

const quickLinks = [
  { title: "To-Do", url: "/todo", icon: ListTodo },
  { title: "AI Chat", url: "/chat", icon: MessageSquare },
  { title: "Storage", url: "/storage", icon: HardDrive },
  { title: "System Monitor", url: "/system", icon: ServerCog },
] as const;

function formatSize(bytes: number) {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// The AI Squared Vector Store connector confirmed for the Knowledge Base
// page (see routes/AGENTS.md) — reused here just to surface a summary
// stat, not to browse/search documents.
const KB_CONNECTOR_ID = 1142;
const KB_TABLES = [
  "document_vector_embeddings",
  "lightning_embedding",
  "seemore_embedding",
] as const;

type KnowledgeBaseStats = {
  docCount: number;
  chunkCount: number;
  lastUpload: string | null;
};

function formatTimestamp(date: string | Date) {
  const d = new Date(date);
  return d.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function DashboardPage() {
  const queryClient = useQueryClient();
  const { logAudit } = useActivityLog();
  const { data: caps, isLoading: capsLoading } = useCapabilities();
  const dbEnabled = caps?.databaseEnabled === true;
  const s3Enabled = caps?.s3Enabled === true;

  // Single round-trip for everything this page needs (previously 5
  // separate requests fired in parallel from the client).
  const { data: summary, isLoading: summaryLoading } = useQuery({
    queryKey: ["dashboardSummary", s3Enabled],
    queryFn: () => getDashboardSummary({ data: { includeStorage: s3Enabled } }),
    enabled: dbEnabled,
    // Avoid re-fetching every time the user navigates back to the
    // dashboard within a short window — the manual Refresh action (and
    // any mutation on this page) still invalidates this key explicitly.
    staleTime: 30_000,
  });

  const [quickTaskOpen, setQuickTaskOpen] = useState(false);
  const [quickRunOpen, setQuickRunOpen] = useState(false);
  const [runDialogOpen, setRunDialogOpen] = useState(false);
  const [selectedWorkflow, setSelectedWorkflow] = useState<{
    id: string;
    name: string;
  } | null>(null);

  const [quickTaskTitle, setQuickTaskTitle] = useState("");

  const { data: registeredWorkflows } = useQuery({
    queryKey: ["registeredWorkflows"],
    queryFn: () => listRegisteredWorkflows(),
    enabled: dbEnabled && quickRunOpen,
    staleTime: 30_000,
  });

  // Knowledge Base summary — a lightweight COUNT/MAX query across the same
  // 3 document tables the Knowledge Base page itself searches, purely for
  // this one dashboard stat (not fetching/browsing any document content).
  const [kbStats, setKbStats] = useState<KnowledgeBaseStats | null>(null);
  const [kbLoading, setKbLoading] = useState(true);
  const [kbError, setKbError] = useState(false);
  const kbQuerySource = useQuerySource();

  useEffect(() => {
    // Skip firing this extra connector round-trip entirely until we know
    // the database is actually enabled — otherwise it's a wasted network
    // request competing with the page's real content on every first load,
    // including for apps where this card can never show real data anyway.
    if (capsLoading || !dbEnabled) {
      setKbLoading(false);
      return;
    }
    const unionSelect = KB_TABLES.map(
      (table) => `SELECT metadata, created_at FROM ${table}`,
    ).join(" UNION ALL ");
    kbQuerySource.mutate(
      {
        connectorId: KB_CONNECTOR_ID,
        payload: {
          query: `SELECT COUNT(*) AS chunk_count, COUNT(DISTINCT metadata::jsonb->>'filename') AS doc_count, MAX(created_at) AS last_upload FROM (${unionSelect}) t`,
        },
      },
      {
        onSuccess: (res) => {
          const row = (res?.data ?? [])[0] as
            | {
                chunk_count?: string | number;
                doc_count?: string | number;
                last_upload?: string | null;
              }
            | undefined;
          setKbStats({
            chunkCount: Number(row?.chunk_count ?? 0),
            docCount: Number(row?.doc_count ?? 0),
            lastUpload: row?.last_upload ?? null,
          });
          setKbLoading(false);
        },
        onError: () => {
          setKbError(true);
          setKbLoading(false);
        },
      },
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function refreshDashboard() {
    queryClient.invalidateQueries({ queryKey: ["dashboardSummary"] });
  }

  const createTaskMutation = useMutation({
    mutationFn: (title: string) => createTodo({ data: { title } }),
    onSuccess: () => {
      refreshDashboard();
      setQuickTaskOpen(false);
      setQuickTaskTitle("");
      toast.success("Task added.");
      logAudit({
        action: "Created task",
        resource: "quick action",
        page: "/",
        category: "todo",
      });
    },
    onError: () => toast.error("Failed to add task."),
  });

  function handleQuickTaskSubmit() {
    if (!quickTaskTitle.trim()) return;
    createTaskMutation.mutate(quickTaskTitle.trim());
  }

  function handlePickWorkflow(workflowId: string) {
    const wf = registeredWorkflows?.find((w) => w.workflowId === workflowId);
    if (!wf) return;
    setSelectedWorkflow({ id: wf.workflowId, name: wf.name });
    setQuickRunOpen(false);
    setRunDialogOpen(true);
  }

  const todos = summary?.todos;
  const errorLogs = summary?.errorLogs;
  const auditLogs = summary?.auditLogs;
  const storageFiles = summary?.storageFiles;
  const workflowRuns = summary?.workflowRuns;

  const todosLoading = summaryLoading;
  const errorsLoading = summaryLoading;
  const auditLoading = summaryLoading;
  const storageLoading = summaryLoading;
  const runsLoading = summaryLoading;

  // These hooks must run on every render (including while capabilities are
  // still loading, below) — React requires the same hooks in the same order
  // every time, so they can't sit after the `capsLoading` early return.
  const todoCounts = useMemo(() => {
    const list = todos ?? [];
    return {
      total: list.length,
      pending: list.filter(
        (t) => t.status === "pending" || t.status === "in_progress",
      ).length,
      done: list.filter((t) => t.status === "done").length,
      inProgress: list.filter((t) => t.status === "in_progress").length,
      pendingOnly: list.filter((t) => t.status === "pending").length,
    };
  }, [todos]);
  const totalTodos = todoCounts.total;
  const pendingTodos = todoCounts.pending;
  const doneTodos = todoCounts.done;
  const inProgressTodos = todoCounts.inProgress;
  const pendingOnlyTodos = todoCounts.pendingOnly;

  const unresolvedErrors = useMemo(
    () => errorLogs?.filter((e) => !e.resolved) ?? [],
    [errorLogs],
  );
  const hasCriticalUnresolved = useMemo(
    () => unresolvedErrors.some((e) => e.severity === "critical"),
    [unresolvedErrors],
  );

  const totalStorageSize = useMemo(
    () => storageFiles?.reduce((sum, f) => sum + f.size, 0) ?? 0,
    [storageFiles],
  );

  const recentAudit = auditLogs ?? [];
  const recentRuns = workflowRuns ?? [];

  if (capsLoading) {
    return (
      <div className="flex flex-col gap-6">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-32 w-full" />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
          <p className="text-sm text-muted-foreground mt-1">
            An overview of tasks, activity, and system health.
          </p>
        </div>
        {dbEnabled && (
          <div className="flex flex-wrap gap-2">
            <Button size="sm" onClick={() => setQuickTaskOpen(true)}>
              <Plus className="size-4" />
              New Task
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => setQuickRunOpen(true)}
            >
              <Play className="size-4" />
              Run Workflow
            </Button>
          </div>
        )}
      </div>

      {!dbEnabled ? (
        <Alert variant="destructive">
          <AlertTriangle />
          <AlertTitle>Database not configured</AlertTitle>
          <AlertDescription>
            Metrics are unavailable because no database connection is set up for
            this app.
          </AlertDescription>
        </Alert>
      ) : (
        <>
          {/* Primary metrics — the two numbers that most need attention at
           * a glance get their own larger row. */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Card>
              <CardHeader>
                <CardDescription>Pending Tasks</CardDescription>
              </CardHeader>
              <CardContent>
                {todosLoading ? (
                  <Skeleton className="h-11 w-20" />
                ) : (
                  <span className="text-4xl font-bold">{pendingTodos}</span>
                )}
                <p className="text-xs text-muted-foreground mt-1">
                  {totalTodos} total task{totalTodos === 1 ? "" : "s"}
                </p>
              </CardContent>
            </Card>

            <Card
              className={cn(
                unresolvedErrors.length > 0 &&
                  hasCriticalUnresolved &&
                  "border-destructive",
              )}
            >
              <CardHeader>
                <CardDescription>Unresolved Errors</CardDescription>
              </CardHeader>
              <CardContent>
                {errorsLoading ? (
                  <Skeleton className="h-11 w-20" />
                ) : (
                  <span
                    className={cn(
                      "text-4xl font-bold",
                      unresolvedErrors.length > 0 &&
                        hasCriticalUnresolved &&
                        "text-destructive",
                    )}
                  >
                    {unresolvedErrors.length}
                  </span>
                )}
                <p className="text-xs text-muted-foreground mt-1">
                  {hasCriticalUnresolved
                    ? "Includes critical severity"
                    : "Across all severities"}
                </p>
              </CardContent>
            </Card>
          </div>

          {/* Secondary metrics — smaller supporting stats, denser row. */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>Storage Used</CardDescription>
              </CardHeader>
              <CardContent className="pt-0">
                {!s3Enabled ? (
                  <span className="text-sm text-muted-foreground">
                    Not Configured
                  </span>
                ) : storageLoading ? (
                  <Skeleton className="h-7 w-16" />
                ) : (
                  <span className="text-xl font-semibold">
                    {formatSize(totalStorageSize)}
                  </span>
                )}
              </CardContent>
            </Card>

            <Link to="/knowledge-base" className="block">
              <Card className="h-full transition-colors hover:border-primary/40">
                <CardHeader className="pb-2">
                  <CardDescription className="flex items-center gap-1.5">
                    <BookOpenText className="size-3.5" />
                    Knowledge Base
                  </CardDescription>
                </CardHeader>
                <CardContent className="pt-0">
                  {kbLoading ? (
                    <Skeleton className="h-7 w-16" />
                  ) : kbError ? (
                    <span className="text-sm text-muted-foreground">
                      Unavailable
                    </span>
                  ) : (
                    <>
                      <span className="text-xl font-semibold">
                        {kbStats?.docCount ?? 0} doc
                        {kbStats?.docCount === 1 ? "" : "s"}
                      </span>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {kbStats?.chunkCount ?? 0} chunks
                        {kbStats?.lastUpload
                          ? ` · updated ${formatTimestamp(kbStats.lastUpload)}`
                          : ""}
                      </p>
                    </>
                  )}
                </CardContent>
              </Card>
            </Link>

            <Card>
              <CardHeader className="pb-2">
                <CardDescription>Tasks Done</CardDescription>
              </CardHeader>
              <CardContent className="pt-0">
                {todosLoading ? (
                  <Skeleton className="h-7 w-16" />
                ) : (
                  <span className="text-xl font-semibold">
                    {doneTodos} / {totalTodos}
                  </span>
                )}
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Task Breakdown</CardTitle>
              <CardDescription>Distribution of tasks by status</CardDescription>
            </CardHeader>
            <CardContent>
              {todosLoading ? (
                <div className="flex flex-col gap-4">
                  <Skeleton className="h-8 w-full" />
                  <Skeleton className="h-8 w-full" />
                  <Skeleton className="h-8 w-full" />
                </div>
              ) : totalTodos === 0 ? (
                <Empty className="border-none p-2">
                  <EmptyHeader>
                    <EmptyMedia variant="icon">
                      <ClipboardList />
                    </EmptyMedia>
                    <EmptyTitle>No tasks yet</EmptyTitle>
                    <EmptyDescription>
                      Add your first task to start tracking work.
                    </EmptyDescription>
                  </EmptyHeader>
                  <Button size="sm" onClick={() => setQuickTaskOpen(true)}>
                    <Plus className="size-4" />
                    New Task
                  </Button>
                </Empty>
              ) : (
                <div className="flex flex-col gap-4">
                  {[
                    { label: "Pending", count: pendingOnlyTodos },
                    { label: "In Progress", count: inProgressTodos },
                    { label: "Done", count: doneTodos },
                  ].map((s) => (
                    <div key={s.label} className="flex flex-col gap-1.5">
                      <div className="flex items-center justify-between text-sm">
                        <span className="font-medium">{s.label}</span>
                        <span className="text-muted-foreground">
                          {s.count} / {totalTodos}
                        </span>
                      </div>
                      <Progress value={(s.count / totalTodos) * 100} />
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Recent Activity</CardTitle>
              <CardDescription>Latest audit log entries</CardDescription>
            </CardHeader>
            <CardContent>
              {auditLoading ? (
                <div className="flex flex-col gap-3">
                  <Skeleton className="h-6 w-full" />
                  <Skeleton className="h-6 w-full" />
                  <Skeleton className="h-6 w-full" />
                </div>
              ) : recentAudit.length === 0 ? (
                <Empty className="border-none p-2">
                  <EmptyHeader>
                    <EmptyMedia variant="icon">
                      <Activity />
                    </EmptyMedia>
                    <EmptyTitle>No activity yet</EmptyTitle>
                    <EmptyDescription>
                      Actions across the app will show up here.
                    </EmptyDescription>
                  </EmptyHeader>
                </Empty>
              ) : (
                <div className="flex flex-col divide-y divide-border">
                  {recentAudit.map((log) => (
                    <div
                      key={log.id}
                      className="flex items-center justify-between gap-4 py-2.5 first:pt-0 last:pb-0"
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        {log.status === "success" ? (
                          <CheckCircle2 className="size-4 text-primary shrink-0" />
                        ) : (
                          <XCircle className="size-4 text-destructive shrink-0" />
                        )}
                        <div className="min-w-0">
                          <p className="text-sm font-medium truncate">
                            {log.action}
                          </p>
                          <p className="text-xs text-muted-foreground truncate">
                            {log.resource || log.page || "—"}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-3 shrink-0">
                        <Badge variant="secondary">{log.category}</Badge>
                        <span className="text-xs text-muted-foreground">
                          {formatTimestamp(log.createdAt)}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Latest Workflow Runs</CardTitle>
              <CardDescription>Most recent workflow executions</CardDescription>
            </CardHeader>
            <CardContent>
              {runsLoading ? (
                <div className="flex flex-col gap-3">
                  <Skeleton className="h-6 w-full" />
                  <Skeleton className="h-6 w-full" />
                  <Skeleton className="h-6 w-full" />
                </div>
              ) : recentRuns.length === 0 ? (
                <Empty className="border-none p-2">
                  <EmptyHeader>
                    <EmptyMedia variant="icon">
                      <WorkflowIcon />
                    </EmptyMedia>
                    <EmptyTitle>No workflow runs yet</EmptyTitle>
                    <EmptyDescription>
                      Run a workflow to see its result here.
                    </EmptyDescription>
                  </EmptyHeader>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setQuickRunOpen(true)}
                  >
                    <Play className="size-4" />
                    Run Workflow
                  </Button>
                </Empty>
              ) : (
                <div className="flex flex-col divide-y divide-border">
                  {recentRuns.map((run) => (
                    <div
                      key={run.id}
                      className="flex items-center justify-between gap-4 py-2.5 first:pt-0 last:pb-0"
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        {run.status === "success" ? (
                          <CheckCircle2 className="size-4 text-primary shrink-0" />
                        ) : (
                          <XCircle className="size-4 text-destructive shrink-0" />
                        )}
                        <div className="min-w-0">
                          <p className="text-sm font-medium truncate">
                            {run.workflowName || `Workflow #${run.workflowId}`}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-3 shrink-0">
                        <Badge
                          variant={
                            run.status === "success" ? "default" : "destructive"
                          }
                        >
                          {run.status}
                        </Badge>
                        <span className="text-xs text-muted-foreground">
                          {formatTimestamp(run.createdAt)}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
              <div className="mt-4">
                <Button
                  variant="outline"
                  size="sm"
                  render={<Link to="/workflows" />}
                >
                  <WorkflowIcon className="size-4" />
                  View Workflows
                </Button>
              </div>
            </CardContent>
          </Card>
        </>
      )}

      <div>
        <h2 className="text-sm font-medium text-muted-foreground mb-3">
          Quick Access
        </h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          {quickLinks.map((link) => (
            <Button
              key={link.url}
              variant="outline"
              className="h-auto flex-col gap-2 py-4"
              render={<Link to={link.url} />}
            >
              <link.icon className="size-5" />
              <span className="text-xs">{link.title}</span>
            </Button>
          ))}
        </div>
      </div>

      <Dialog open={quickTaskOpen} onOpenChange={setQuickTaskOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New Task</DialogTitle>
            <DialogDescription>
              Quickly add a task to your To-Do list.
            </DialogDescription>
          </DialogHeader>
          <Field>
            <FieldLabel htmlFor="quick-task-title">Title</FieldLabel>
            <Input
              id="quick-task-title"
              placeholder="Task title"
              value={quickTaskTitle}
              onChange={(e) => setQuickTaskTitle(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleQuickTaskSubmit();
              }}
            />
          </Field>
          <Button
            onClick={handleQuickTaskSubmit}
            disabled={!quickTaskTitle.trim() || createTaskMutation.isPending}
          >
            <Plus className="size-4" />
            Add Task
          </Button>
        </DialogContent>
      </Dialog>

      <Dialog open={quickRunOpen} onOpenChange={setQuickRunOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Run Workflow</DialogTitle>
            <DialogDescription>
              Choose a workflow to run right now.
            </DialogDescription>
          </DialogHeader>
          {!registeredWorkflows || registeredWorkflows.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No workflows registered yet. Add one from the Workflows page.
            </p>
          ) : (
            <Select onValueChange={(v) => v && handlePickWorkflow(v as string)}>
              <SelectTrigger>
                <SelectValue placeholder="Choose a workflow" />
              </SelectTrigger>
              <SelectContent>
                {registeredWorkflows.map((wf) => (
                  <SelectItem key={wf.workflowId} value={wf.workflowId}>
                    {wf.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </DialogContent>
      </Dialog>

      {selectedWorkflow && (
        <WorkflowRunDialog
          workflowId={selectedWorkflow.id}
          workflowName={selectedWorkflow.name}
          open={runDialogOpen}
          onOpenChange={setRunDialogOpen}
          onFinished={() => {
            refreshDashboard();
          }}
        />
      )}
    </div>
  );
}
