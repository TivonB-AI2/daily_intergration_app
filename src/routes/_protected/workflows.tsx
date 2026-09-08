import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  XAxis,
  YAxis,
} from "recharts";
import {
  Plus,
  Play,
  Trash2,
  Workflow as WorkflowIcon,
  CheckCircle2,
  XCircle,
  History,
} from "lucide-react";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import { useCapabilities } from "@/hooks/useCapabilities";
import {
  clearWorkflowRuns,
  listRegisteredWorkflows,
  listWorkflowRuns,
  recordWorkflowRun,
  registerWorkflow,
  unregisterWorkflow,
} from "@/services/db/workflowRegistryService";
import { listRegistrySyncStatus } from "@/services/db/registrySyncService";
import {
  WorkflowRunDialog,
  type WorkflowRunResult,
} from "@/components/workflows/WorkflowRunDialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export const Route = createFileRoute("/_protected/workflows")({
  component: WorkflowsPage,
});

type ActiveRun = { workflowId: string; name: string } | null;

const STATUS_FILTERS: { key: "published" | "all" | "draft"; label: string }[] =
  [
    { key: "published", label: "Published" },
    { key: "all", label: "All statuses" },
    { key: "draft", label: "Draft" },
  ];

const runsChartConfig = {
  runs: { label: "Runs", color: "var(--chart-1)" },
} satisfies ChartConfig;

const durationChartConfig = {
  avgDurationS: { label: "Avg duration (s)", color: "var(--chart-2)" },
} satisfies ChartConfig;

function WorkflowsPage() {
  const queryClient = useQueryClient();
  const { data: caps, isLoading: capsLoading } = useCapabilities();
  const dbEnabled = caps?.databaseEnabled === true;

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<
    "published" | "all" | "draft"
  >("published");
  const [activeRun, setActiveRun] = useState<ActiveRun>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [newId, setNewId] = useState("");
  const [newName, setNewName] = useState("");

  const { data: workflows = [], isLoading: workflowsLoading } = useQuery({
    queryKey: ["registeredWorkflows"],
    queryFn: () => listRegisteredWorkflows(),
    enabled: dbEnabled,
    staleTime: 30_000,
  });
  const { data: runs = [], isLoading: runsLoading } = useQuery({
    queryKey: ["workflowRuns"],
    queryFn: () => listWorkflowRuns(),
    enabled: dbEnabled,
    staleTime: 15_000,
  });
  const { data: syncStatus } = useQuery({
    queryKey: ["registrySyncStatus"],
    queryFn: () => listRegistrySyncStatus(),
    enabled: dbEnabled,
    staleTime: 30_000,
  });
  const workflowsSyncedAt = syncStatus?.find(
    (s) => s.registryName === "workflows",
  )?.lastSyncedAt;

  function invalidate() {
    queryClient.invalidateQueries({ queryKey: ["registeredWorkflows"] });
    queryClient.invalidateQueries({ queryKey: ["workflowRuns"] });
  }

  const registerMutation = useMutation({
    mutationFn: registerWorkflow,
    onSuccess: () => {
      invalidate();
      setAddOpen(false);
      setNewId("");
      setNewName("");
      toast.success("Workflow added.");
    },
  });
  const unregisterMutation = useMutation({
    mutationFn: unregisterWorkflow,
    onSuccess: () => {
      invalidate();
      toast.success("Workflow removed.");
    },
  });
  const recordRunMutation = useMutation({
    mutationFn: recordWorkflowRun,
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ["workflowRuns"] }),
  });
  const clearRunsMutation = useMutation({
    mutationFn: clearWorkflowRuns,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["workflowRuns"] });
      toast.success("Run history cleared.");
    },
  });

  const filtered = useMemo(() => {
    const byStatus =
      statusFilter === "all"
        ? workflows
        : workflows.filter((w) => w.status === statusFilter);
    const term = search.trim().toLowerCase();
    if (!term) return byStatus;
    return byStatus.filter(
      (w) =>
        w.name.toLowerCase().includes(term) ||
        (w.description ?? "").toLowerCase().includes(term),
    );
  }, [workflows, search, statusFilter]);

  const publishedCount = workflows.filter(
    (w) => w.status === "published",
  ).length;

  // `runs` is already ordered by createdAt desc (see listWorkflowRuns), so
  // the first match per workflow id is its latest run — used to show
  // inline run history/status directly on each workflow card.
  const latestRunByWorkflowId = useMemo(() => {
    const map = new Map<string, (typeof runs)[number]>();
    for (const run of runs) {
      if (!map.has(run.workflowId)) map.set(run.workflowId, run);
    }
    return map;
  }, [runs]);

  const runCountByWorkflowId = useMemo(() => {
    const map = new Map<string, number>();
    for (const run of runs) {
      map.set(run.workflowId, (map.get(run.workflowId) ?? 0) + 1);
    }
    return map;
  }, [runs]);

  // Last-14-days trend, computed client-side from the same `runs` query
  // already loaded for the Run History tab — no extra request.
  const runTrend = useMemo(() => {
    const days: {
      date: string;
      label: string;
      runs: number;
      avgDurationS: number;
    }[] = [];
    const buckets = new Map<
      string,
      { count: number; totalDurationMs: number }
    >();
    for (let i = 13; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const key = d.toISOString().slice(0, 10);
      buckets.set(key, { count: 0, totalDurationMs: 0 });
      days.push({
        date: key,
        label: d.toLocaleDateString(undefined, {
          month: "short",
          day: "numeric",
        }),
        runs: 0,
        avgDurationS: 0,
      });
    }
    for (const run of runs) {
      const key = new Date(run.createdAt).toISOString().slice(0, 10);
      const bucket = buckets.get(key);
      if (bucket) {
        bucket.count += 1;
        bucket.totalDurationMs += run.durationMs;
      }
    }
    for (const day of days) {
      const bucket = buckets.get(day.date);
      if (bucket) {
        day.runs = bucket.count;
        day.avgDurationS =
          bucket.count > 0
            ? Number((bucket.totalDurationMs / bucket.count / 1000).toFixed(1))
            : 0;
      }
    }
    return days;
  }, [runs]);

  function handleAdd() {
    if (!newId.trim() || !newName.trim()) {
      toast.error("Please provide both a workflow ID and a name.");
      return;
    }
    registerMutation.mutate({
      data: { workflowId: newId.trim(), name: newName.trim() },
    });
  }

  function handleRunFinished(result: WorkflowRunResult, input: string) {
    if (!activeRun) return;
    recordRunMutation.mutate({
      data: {
        workflowId: activeRun.workflowId,
        workflowName: activeRun.name,
        input,
        output: result.output,
        status: result.status,
        durationMs: result.durationMs,
      },
    });
  }

  if (capsLoading) {
    return (
      <div className="flex flex-col gap-4 p-6">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6 p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-semibold tracking-tight">Workflows</h1>
          <p className="text-sm text-muted-foreground">
            Every workflow connected to this app — run one and see its result.
          </p>
          {workflowsSyncedAt && (
            <p
              className="text-xs text-muted-foreground"
              title="This list is a snapshot re-synced on request, not a live feed — ask in chat to refresh it if a workflow looks missing, renamed, or has the wrong status."
            >
              List synced{" "}
              {formatDistanceToNow(new Date(workflowsSyncedAt), {
                addSuffix: true,
              })}
              . Ask in chat to refresh if this looks out of date.
            </p>
          )}
        </div>
        <Button onClick={() => setAddOpen(true)} disabled={!dbEnabled}>
          <Plus className="h-4 w-4" />
          Add Workflow
        </Button>
      </div>

      {!dbEnabled ? (
        <Card>
          <CardContent className="pt-6 text-sm text-muted-foreground">
            Database not configured — the workflow list can't be stored yet.
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>Connected Workflows</CardDescription>
              </CardHeader>
              <CardContent>
                <p className="text-3xl font-bold">{workflows.length}</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>Published</CardDescription>
              </CardHeader>
              <CardContent>
                <p className="text-3xl font-bold">{publishedCount}</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>Total Runs</CardDescription>
              </CardHeader>
              <CardContent>
                <p className="text-3xl font-bold">{runs.length}</p>
              </CardContent>
            </Card>
          </div>

          <Tabs defaultValue="all">
            <TabsList>
              <TabsTrigger value="all">All Workflows</TabsTrigger>
              <TabsTrigger value="history">Run History</TabsTrigger>
            </TabsList>

            <TabsContent value="all" className="flex flex-col gap-4">
              <div className="flex flex-wrap items-center gap-2">
                <Input
                  placeholder="Search workflows..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="max-w-sm"
                />
                <Select
                  value={statusFilter}
                  onValueChange={(v) =>
                    setStatusFilter(v as "published" | "all" | "draft")
                  }
                >
                  <SelectTrigger className="w-40">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {STATUS_FILTERS.map((s) => (
                      <SelectItem key={s.key} value={s.key}>
                        {s.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {workflowsLoading ? (
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
                  {Array.from({ length: 6 }).map((_, i) => (
                    // biome-ignore lint/suspicious/noArrayIndexKey: static skeleton grid
                    <Skeleton key={i} className="h-40 w-full" />
                  ))}
                </div>
              ) : filtered.length === 0 ? (
                <Empty>
                  <EmptyHeader>
                    <EmptyMedia variant="icon">
                      <WorkflowIcon />
                    </EmptyMedia>
                    <EmptyTitle>No workflows found</EmptyTitle>
                    <EmptyDescription>
                      {search
                        ? "No workflow matches your search."
                        : statusFilter !== "all"
                          ? `No ${statusFilter} workflows. Try "All statuses" or add a workflow by ID.`
                          : "Add a workflow by ID to get started."}
                    </EmptyDescription>
                  </EmptyHeader>
                </Empty>
              ) : (
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
                  {filtered.map((workflow) => {
                    const latestRun = latestRunByWorkflowId.get(
                      workflow.workflowId,
                    );
                    const runCount =
                      runCountByWorkflowId.get(workflow.workflowId) ?? 0;
                    return (
                      <Card key={workflow.id} className="flex flex-col">
                        <CardHeader className="pb-3">
                          <div className="flex items-start justify-between gap-2">
                            <CardTitle className="text-base">
                              {workflow.name}
                            </CardTitle>
                            <Badge
                              variant={
                                workflow.status === "published"
                                  ? "default"
                                  : "secondary"
                              }
                            >
                              {workflow.status}
                            </Badge>
                          </div>
                          <CardDescription className="line-clamp-2">
                            {workflow.description || "No description provided."}
                          </CardDescription>
                        </CardHeader>
                        <CardContent className="mt-auto flex flex-col gap-3">
                          {workflow.triggerType && (
                            <Badge variant="outline" className="w-fit">
                              {workflow.triggerType.replace(/_/g, " ")}
                            </Badge>
                          )}
                          <div className="flex items-center justify-between gap-2 rounded-md border border-border bg-muted/40 px-2.5 py-2 text-xs">
                            {latestRun ? (
                              <div className="flex items-center gap-1.5 min-w-0">
                                {latestRun.status === "success" ? (
                                  <CheckCircle2 className="size-3.5 shrink-0 text-primary" />
                                ) : (
                                  <XCircle className="size-3.5 shrink-0 text-destructive" />
                                )}
                                <span className="truncate text-muted-foreground">
                                  Last run{" "}
                                  {new Date(latestRun.createdAt).toLocaleString(
                                    undefined,
                                    {
                                      month: "short",
                                      day: "numeric",
                                      hour: "2-digit",
                                      minute: "2-digit",
                                    },
                                  )}
                                </span>
                              </div>
                            ) : (
                              <span className="flex items-center gap-1.5 text-muted-foreground">
                                <History className="size-3.5" />
                                Never run
                              </span>
                            )}
                            {runCount > 0 && (
                              <Badge
                                variant="outline"
                                className="shrink-0 text-[10px]"
                              >
                                {runCount} run{runCount === 1 ? "" : "s"}
                              </Badge>
                            )}
                          </div>
                          <div className="flex items-center gap-2">
                            <Button
                              size="sm"
                              className="flex-1"
                              onClick={() =>
                                setActiveRun({
                                  workflowId: workflow.workflowId,
                                  name: workflow.name,
                                })
                              }
                            >
                              <Play className="h-4 w-4" />
                              Run
                            </Button>
                            <Button
                              size="icon"
                              variant="ghost"
                              aria-label="Remove workflow"
                              onClick={() =>
                                unregisterMutation.mutate({
                                  data: workflow.id,
                                })
                              }
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>
              )}
            </TabsContent>

            <TabsContent value="history" className="flex flex-col gap-4">
              {!runsLoading && runs.length > 0 && (
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-base">
                        Runs per day (last 14 days)
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <ChartContainer
                        config={runsChartConfig}
                        className="h-56 w-full"
                      >
                        <BarChart data={runTrend}>
                          <CartesianGrid vertical={false} />
                          <XAxis
                            dataKey="label"
                            tickLine={false}
                            axisLine={false}
                            tickMargin={8}
                          />
                          <YAxis
                            tickLine={false}
                            axisLine={false}
                            width={28}
                            allowDecimals={false}
                          />
                          <ChartTooltip content={<ChartTooltipContent />} />
                          <Bar
                            dataKey="runs"
                            fill="var(--color-runs)"
                            radius={4}
                          />
                        </BarChart>
                      </ChartContainer>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader>
                      <CardTitle className="text-base">
                        Average run duration (last 14 days)
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <ChartContainer
                        config={durationChartConfig}
                        className="h-56 w-full"
                      >
                        <LineChart data={runTrend}>
                          <CartesianGrid vertical={false} />
                          <XAxis
                            dataKey="label"
                            tickLine={false}
                            axisLine={false}
                            tickMargin={8}
                          />
                          <YAxis tickLine={false} axisLine={false} width={28} />
                          <ChartTooltip content={<ChartTooltipContent />} />
                          <Line
                            dataKey="avgDurationS"
                            stroke="var(--color-avgDurationS)"
                            strokeWidth={2}
                            dot={false}
                          />
                        </LineChart>
                      </ChartContainer>
                    </CardContent>
                  </Card>
                </div>
              )}

              <div className="flex justify-end">
                <AlertDialog>
                  <AlertDialogTrigger
                    render={
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={runs.length === 0}
                      >
                        Clear History
                      </Button>
                    }
                  />
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Clear run history?</AlertDialogTitle>
                      <AlertDialogDescription>
                        This will permanently delete all recorded workflow runs.
                        This action cannot be undone.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                      <AlertDialogAction
                        onClick={() => clearRunsMutation.mutate({})}
                      >
                        Clear History
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </div>
              {runsLoading ? (
                <div className="flex flex-col gap-2">
                  <Skeleton className="h-10 w-full" />
                  <Skeleton className="h-10 w-full" />
                </div>
              ) : runs.length === 0 ? (
                <Empty>
                  <EmptyHeader>
                    <EmptyMedia variant="icon">
                      <Play />
                    </EmptyMedia>
                    <EmptyTitle>No runs yet</EmptyTitle>
                    <EmptyDescription>
                      Run a workflow to see its history here.
                    </EmptyDescription>
                  </EmptyHeader>
                </Empty>
              ) : (
                <Card>
                  <CardContent className="p-0">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Workflow</TableHead>
                          <TableHead>Input</TableHead>
                          <TableHead>Result</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead>Duration</TableHead>
                          <TableHead>When</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {runs.map((run) => (
                          <TableRow key={run.id}>
                            <TableCell className="font-medium">
                              {run.workflowName}
                            </TableCell>
                            <TableCell className="max-w-40 truncate text-xs text-muted-foreground">
                              {run.input}
                            </TableCell>
                            <TableCell className="max-w-60 truncate text-xs text-muted-foreground">
                              {run.output}
                            </TableCell>
                            <TableCell>
                              <Badge
                                variant={
                                  run.status === "success"
                                    ? "default"
                                    : "destructive"
                                }
                              >
                                {run.status}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-xs">
                              {(run.durationMs / 1000).toFixed(1)}s
                            </TableCell>
                            <TableCell className="text-xs text-muted-foreground">
                              {new Date(run.createdAt).toLocaleString()}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </CardContent>
                </Card>
              )}
            </TabsContent>
          </Tabs>
        </>
      )}

      {activeRun && (
        <WorkflowRunDialog
          key={activeRun.workflowId}
          workflowId={activeRun.workflowId}
          workflowName={activeRun.name}
          open
          onOpenChange={(open) => {
            if (!open) setActiveRun(null);
          }}
          onFinished={handleRunFinished}
        />
      )}

      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add a Workflow</DialogTitle>
            <DialogDescription>
              Connect another workflow by pasting its ID from the platform.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="new-workflow-name">Name</Label>
              <Input
                id="new-workflow-name"
                placeholder="e.g. Support Assistant"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="new-workflow-id">Workflow ID</Label>
              <Input
                id="new-workflow-id"
                placeholder="00000000-0000-0000-0000-000000000000"
                value={newId}
                onChange={(e) => setNewId(e.target.value)}
                className="font-mono text-xs"
              />
            </div>
            <Button onClick={handleAdd} disabled={registerMutation.isPending}>
              Add Workflow
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
