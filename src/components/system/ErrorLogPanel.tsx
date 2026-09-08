import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { Trash2 } from "lucide-react";
import { useCapabilities } from "@/hooks/useCapabilities";
import {
  listErrorLogsPaged,
  getErrorLogSummary,
  createErrorLog,
  resolveErrorLog,
  deleteErrorLog,
  clearResolvedErrorLogs,
  type ErrorLogInput,
} from "@/services/db/errorLogService";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Empty,
  EmptyHeader,
  EmptyTitle,
  EmptyDescription,
  EmptyMedia,
} from "@/components/ui/empty";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogTrigger,
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
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { AlertCircle, ChevronLeft, ChevronRight } from "lucide-react";

const PAGE_SIZE = 25;

type Severity = "info" | "warning" | "error" | "critical";
type ErrorLog = {
  id: number;
  message: string;
  severity: Severity;
  source: string | null;
  stackTrace: string | null;
  resolved: boolean;
  createdAt: string | Date;
};

const severityOptions: { value: Severity; label: string }[] = [
  { value: "info", label: "Info" },
  { value: "warning", label: "Warning" },
  { value: "error", label: "Error" },
  { value: "critical", label: "Critical" },
];

function severityBadgeVariant(severity: Severity) {
  switch (severity) {
    case "info":
      return "outline" as const;
    case "warning":
      return "secondary" as const;
    case "error":
    case "critical":
      return "destructive" as const;
  }
}

export function ErrorLogPage() {
  const queryClient = useQueryClient();
  const { data: caps, isLoading: capsLoading } = useCapabilities();

  const [createOpen, setCreateOpen] = useState(false);
  const [message, setMessage] = useState("");
  const [severity, setSeverity] = useState<Severity>("error");
  const [source, setSource] = useState("");
  const [stackTrace, setStackTrace] = useState("");

  const [severityFilter, setSeverityFilter] = useState<Severity | "all">("all");
  const [selectedError, setSelectedError] = useState<ErrorLog | null>(null);
  const [statusFilter, setStatusFilter] = useState<
    "all" | "unresolved" | "resolved"
  >("all");
  const [page, setPage] = useState(1);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());

  const dbEnabled = caps?.databaseEnabled === true;

  const { data: pagedResult, isLoading: errorsLoading } = useQuery({
    queryKey: ["error-logs", severityFilter, statusFilter, page],
    queryFn: () =>
      listErrorLogsPaged({
        data: {
          severity: severityFilter,
          status: statusFilter,
          page,
          perPage: PAGE_SIZE,
        },
      }) as Promise<{ rows: ErrorLog[]; total: number }>,
    enabled: dbEnabled,
  });

  const { data: summaryData } = useQuery({
    queryKey: ["error-logs-summary"],
    queryFn: () => getErrorLogSummary(),
    enabled: dbEnabled,
    staleTime: 30_000,
  });

  const paged = pagedResult?.rows ?? [];
  const totalFiltered = pagedResult?.total ?? 0;
  const pageCount = Math.max(1, Math.ceil(totalFiltered / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount);

  const createMut = useMutation({
    mutationFn: (input: ErrorLogInput) => createErrorLog({ data: input }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["error-logs"] });
      queryClient.invalidateQueries({ queryKey: ["error-logs-summary"] });
      toast.success("Error logged");
      setCreateOpen(false);
      setMessage("");
      setSeverity("error");
      setSource("");
      setStackTrace("");
    },
  });

  const resolveMut = useMutation({
    mutationFn: (id: number) => resolveErrorLog({ data: id }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["error-logs"] });
      queryClient.invalidateQueries({ queryKey: ["error-logs-summary"] });
      toast.success("Marked as resolved");
    },
  });

  const deleteMut = useMutation({
    mutationFn: (id: number) => deleteErrorLog({ data: id }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["error-logs"] });
      queryClient.invalidateQueries({ queryKey: ["error-logs-summary"] });
      toast.success("Error log deleted");
    },
  });

  const clearResolvedMut = useMutation({
    mutationFn: () => clearResolvedErrorLogs(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["error-logs"] });
      queryClient.invalidateQueries({ queryKey: ["error-logs-summary"] });
      toast.success("Resolved errors cleared");
    },
  });

  const summary = summaryData ?? {
    total: 0,
    unresolved: 0,
    critical: 0,
    resolved: 0,
  };

  const allOnPageSelected =
    paged.length > 0 && paged.every((e) => selectedIds.has(e.id));

  function toggleSelectAllOnPage() {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (allOnPageSelected) {
        for (const e of paged) next.delete(e.id);
      } else {
        for (const e of paged) next.add(e.id);
      }
      return next;
    });
  }

  function toggleSelectOne(id: number) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const bulkResolveMut = useMutation({
    mutationFn: (ids: number[]) =>
      Promise.all(ids.map((id) => resolveErrorLog({ data: id }))),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["error-logs"] });
      queryClient.invalidateQueries({ queryKey: ["error-logs-summary"] });
      toast.success("Selected errors marked as resolved");
      setSelectedIds(new Set());
    },
  });

  const bulkDeleteMut = useMutation({
    mutationFn: (ids: number[]) =>
      Promise.all(ids.map((id) => deleteErrorLog({ data: id }))),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["error-logs"] });
      queryClient.invalidateQueries({ queryKey: ["error-logs-summary"] });
      toast.success("Selected errors deleted");
      setSelectedIds(new Set());
    },
  });

  if (capsLoading) {
    return (
      <div className="p-6 space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (!caps?.databaseEnabled) {
    return (
      <div className="p-6">
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <AlertCircle />
            </EmptyMedia>
            <EmptyTitle>Database required</EmptyTitle>
            <EmptyDescription>
              Error logging requires a database connection. Ask to enable the
              database to start tracking errors.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Error Log</h1>
          <p className="text-muted-foreground text-sm">
            Track, filter, and resolve application errors.
          </p>
        </div>
        <Dialog open={createOpen} onOpenChange={setCreateOpen}>
          <DialogTrigger render={<Button>Create Error</Button>} />
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Create Error</DialogTitle>
              <DialogDescription>
                Manually log an error entry.
              </DialogDescription>
            </DialogHeader>
            <form
              className="space-y-4"
              onSubmit={(e) => {
                e.preventDefault();
                if (!message.trim()) return;
                createMut.mutate({
                  message: message.trim(),
                  severity,
                  source: source.trim() || undefined,
                  stackTrace: stackTrace.trim() || undefined,
                });
              }}
            >
              <div className="space-y-2">
                <Label htmlFor="message">Message</Label>
                <Textarea
                  id="message"
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  required
                  placeholder="Describe the error"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="severity">Severity</Label>
                <Select
                  value={severity}
                  onValueChange={(v) => setSeverity(v as Severity)}
                >
                  <SelectTrigger id="severity" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {severityOptions.map((opt) => (
                      <SelectItem key={opt.value} value={opt.value}>
                        {opt.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="source">Source (optional)</Label>
                <Input
                  id="source"
                  value={source}
                  onChange={(e) => setSource(e.target.value)}
                  placeholder="e.g. checkout-service"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="stackTrace">Stack Trace (optional)</Label>
                <Textarea
                  id="stackTrace"
                  value={stackTrace}
                  onChange={(e) => setStackTrace(e.target.value)}
                  placeholder="Paste stack trace"
                  className="font-mono text-xs"
                />
              </div>
              <DialogFooter>
                <Button
                  type="submit"
                  disabled={createMut.isPending || !message.trim()}
                >
                  {createMut.isPending ? "Saving..." : "Save"}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Total
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-semibold">{summary.total}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Unresolved
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-semibold">{summary.unresolved}</p>
          </CardContent>
        </Card>
        <Card
          className={summary.critical > 0 ? "border-destructive" : undefined}
        >
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Critical
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p
              className={
                summary.critical > 0
                  ? "text-2xl font-semibold text-destructive"
                  : "text-2xl font-semibold"
              }
            >
              {summary.critical}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Resolved
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-semibold">{summary.resolved}</p>
          </CardContent>
        </Card>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <Select
            value={severityFilter}
            onValueChange={(v) => {
              setSeverityFilter(v as Severity | "all");
              setPage(1);
            }}
          >
            <SelectTrigger className="w-40">
              <SelectValue placeholder="Severity" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Severities</SelectItem>
              {severityOptions.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select
            value={statusFilter}
            onValueChange={(v) => {
              setStatusFilter(v as "all" | "unresolved" | "resolved");
              setPage(1);
            }}
          >
            <SelectTrigger className="w-40">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Statuses</SelectItem>
              <SelectItem value="unresolved">Unresolved</SelectItem>
              <SelectItem value="resolved">Resolved</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <AlertDialog>
          <AlertDialogTrigger
            render={
              <Button variant="outline" disabled={summary.resolved === 0}>
                Clear Resolved
              </Button>
            }
          />
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Clear resolved errors?</AlertDialogTitle>
              <AlertDialogDescription>
                This will permanently delete all resolved error log entries.
                This action cannot be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={() => clearResolvedMut.mutate()}>
                Clear
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>

      {selectedIds.size > 0 && (
        <div className="flex items-center gap-3 rounded-md border bg-muted/40 px-4 py-2.5">
          <span className="text-sm font-medium">
            {selectedIds.size} selected
          </span>
          <div className="flex items-center gap-2 ml-auto">
            <Button
              variant="outline"
              size="sm"
              onClick={() => bulkResolveMut.mutate(Array.from(selectedIds))}
              disabled={bulkResolveMut.isPending}
            >
              Resolve selected
            </Button>
            <AlertDialog>
              <AlertDialogTrigger
                render={
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={bulkDeleteMut.isPending}
                  >
                    <Trash2 className="size-4" />
                    Delete selected
                  </Button>
                }
              />
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>
                    Delete {selectedIds.size} error log
                    {selectedIds.size === 1 ? "" : "s"}?
                  </AlertDialogTitle>
                  <AlertDialogDescription>
                    This will permanently delete the selected entries. This
                    action cannot be undone.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={() =>
                      bulkDeleteMut.mutate(Array.from(selectedIds))
                    }
                  >
                    Delete
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setSelectedIds(new Set())}
            >
              Clear
            </Button>
          </div>
        </div>
      )}

      {errorsLoading ? (
        <Skeleton className="h-64 w-full" />
      ) : paged.length === 0 ? (
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <AlertCircle />
            </EmptyMedia>
            <EmptyTitle>No errors found</EmptyTitle>
            <EmptyDescription>
              {summary.total > 0
                ? "No errors match the current filters."
                : "No errors have been logged yet."}
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <Card>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10">
                  <Checkbox
                    checked={allOnPageSelected}
                    onCheckedChange={toggleSelectAllOnPage}
                    aria-label="Select all on this page"
                  />
                </TableHead>
                <TableHead>Message</TableHead>
                <TableHead>Severity</TableHead>
                <TableHead>Source</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Time</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {paged.map((err) => (
                <TableRow
                  key={err.id}
                  className="cursor-pointer"
                  onClick={() => setSelectedError(err)}
                >
                  <TableCell onClick={(e) => e.stopPropagation()}>
                    <Checkbox
                      checked={selectedIds.has(err.id)}
                      onCheckedChange={() => toggleSelectOne(err.id)}
                      aria-label={`Select error ${err.id}`}
                    />
                  </TableCell>
                  <TableCell className="max-w-xs truncate" title={err.message}>
                    {err.message}
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant={severityBadgeVariant(err.severity)}
                      className={
                        err.severity === "critical" ? "font-bold" : undefined
                      }
                    >
                      {err.severity}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {err.source ?? "—"}
                  </TableCell>
                  <TableCell>
                    <Badge variant={err.resolved ? "outline" : "secondary"}>
                      {err.resolved ? "Resolved" : "Unresolved"}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-muted-foreground text-sm">
                    {new Date(err.createdAt).toLocaleString()}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-2">
                      {!err.resolved && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={(e) => {
                            e.stopPropagation();
                            resolveMut.mutate(err.id);
                          }}
                          disabled={resolveMut.isPending}
                        >
                          Resolve
                        </Button>
                      )}
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={(e) => {
                          e.stopPropagation();
                          deleteMut.mutate(err.id);
                        }}
                        disabled={deleteMut.isPending}
                      >
                        <Trash2 className="size-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <div className="flex items-center justify-between gap-4 border-t p-4">
            <p className="text-sm text-muted-foreground">
              Showing {(currentPage - 1) * PAGE_SIZE + 1}–
              {Math.min(currentPage * PAGE_SIZE, totalFiltered)} of{" "}
              {totalFiltered}
            </p>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={currentPage <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
              >
                <ChevronLeft className="h-4 w-4" />
                Previous
              </Button>
              <span className="text-sm text-muted-foreground">
                Page {currentPage} of {pageCount}
              </span>
              <Button
                variant="outline"
                size="sm"
                disabled={currentPage >= pageCount}
                onClick={() => setPage((p) => Math.min(pageCount, p + 1))}
              >
                Next
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </Card>
      )}

      <Dialog
        open={selectedError !== null}
        onOpenChange={(open) => {
          if (!open) setSelectedError(null);
        }}
      >
        <DialogContent className="sm:max-w-2xl">
          {selectedError && (
            <>
              <DialogHeader>
                <DialogTitle className="flex flex-wrap items-center gap-2">
                  <Badge
                    variant={severityBadgeVariant(selectedError.severity)}
                    className={
                      selectedError.severity === "critical"
                        ? "font-bold"
                        : undefined
                    }
                  >
                    {selectedError.severity}
                  </Badge>
                  <Badge
                    variant={selectedError.resolved ? "outline" : "secondary"}
                  >
                    {selectedError.resolved ? "Resolved" : "Unresolved"}
                  </Badge>
                  <span className="text-sm font-normal text-muted-foreground">
                    #{selectedError.id}
                  </span>
                </DialogTitle>
                <DialogDescription>
                  {selectedError.source ? `${selectedError.source} · ` : ""}
                  {new Date(selectedError.createdAt).toLocaleString()}
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-4 max-h-[60vh] overflow-y-auto">
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">
                    Message
                  </Label>
                  <p className="text-sm whitespace-pre-wrap break-words rounded-md border bg-muted/40 p-3">
                    {selectedError.message}
                  </p>
                </div>

                {selectedError.stackTrace && (
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">
                      Stack Trace
                    </Label>
                    <pre className="text-xs whitespace-pre-wrap break-words rounded-md border bg-muted/40 p-3 font-mono max-h-72 overflow-y-auto">
                      {selectedError.stackTrace}
                    </pre>
                  </div>
                )}
              </div>

              <DialogFooter className="gap-2 sm:justify-between">
                <Button
                  variant="ghost"
                  onClick={() => {
                    deleteMut.mutate(selectedError.id);
                    setSelectedError(null);
                  }}
                  disabled={deleteMut.isPending}
                >
                  <Trash2 className="size-4" />
                  Delete
                </Button>
                {!selectedError.resolved && (
                  <Button
                    onClick={() => {
                      resolveMut.mutate(selectedError.id);
                      setSelectedError(null);
                    }}
                    disabled={resolveMut.isPending}
                  >
                    Mark Resolved
                  </Button>
                )}
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
