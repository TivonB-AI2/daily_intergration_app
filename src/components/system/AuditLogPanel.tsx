import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useCapabilities } from "@/hooks/useCapabilities";
import {
  listAuditLogsPaged,
  listAuditLogsFiltered,
  getAuditLogSummary,
  clearAuditLogs,
} from "@/services/db/auditLogService";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Empty,
  EmptyHeader,
  EmptyTitle,
  EmptyDescription,
  EmptyMedia,
} from "@/components/ui/empty";
import { Card, CardDescription, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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
  RefreshCw,
  ShieldAlert,
  ClipboardList,
  Trash2,
  Download,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { downloadCsv } from "@/lib/csvExport";

const PAGE_SIZE = 25;

export function AuditLogPage() {
  const queryClient = useQueryClient();
  const { data: caps, isLoading: capsLoading } = useCapabilities();

  const [search, setSearch] = useState("");
  const [category, setCategory] = useState<string>("all");
  const [status, setStatus] = useState<"all" | "success" | "failure">("all");
  const [page, setPage] = useState(1);

  const dbEnabled = caps?.databaseEnabled === true;

  const {
    data: pagedResult,
    isLoading: logsLoading,
    refetch,
    isFetching,
  } = useQuery({
    queryKey: ["auditLogs", category, status, search, page],
    queryFn: () =>
      listAuditLogsPaged({
        data: { category, status, search, page, perPage: PAGE_SIZE },
      }),
    enabled: dbEnabled,
    refetchInterval: 30000,
  });

  const { data: summaryData, refetch: refetchSummary } = useQuery({
    queryKey: ["auditLogs-summary"],
    queryFn: () => getAuditLogSummary(),
    enabled: dbEnabled,
    staleTime: 30_000,
  });

  const clearMutation = useMutation({
    mutationFn: () => clearAuditLogs(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["auditLogs"] });
      queryClient.invalidateQueries({ queryKey: ["auditLogs-summary"] });
    },
  });

  const categories = summaryData?.categories ?? [];
  const pagedLogs = pagedResult?.rows ?? [];
  const totalFiltered = pagedResult?.total ?? 0;
  const pageCount = Math.max(1, Math.ceil(totalFiltered / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount);

  const totalCount = summaryData?.total ?? 0;
  const successCount = summaryData?.success ?? 0;
  const failureCount = summaryData?.failure ?? 0;

  function handleRefresh() {
    refetch();
    refetchSummary();
  }

  const exportMutation = useMutation({
    mutationFn: () =>
      listAuditLogsFiltered({ data: { category, status, search } }),
    onSuccess: (rows) => {
      downloadCsv("audit-log", rows, [
        { key: "id", label: "ID" },
        { key: "action", label: "Action" },
        { key: "resource", label: "Resource" },
        { key: "page", label: "Page" },
        { key: "category", label: "Category" },
        { key: "status", label: "Status" },
        { key: "createdAt", label: "Created At" },
      ]);
    },
  });

  if (capsLoading) {
    return (
      <div className="flex flex-col gap-6 p-6">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-32 w-full" />
      </div>
    );
  }

  if (!caps?.databaseEnabled) {
    return (
      <div className="flex flex-col gap-6 p-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Audit Log</h1>
          <p className="text-sm text-muted-foreground mt-1">
            A record of activity across your app.
          </p>
        </div>
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <ShieldAlert />
            </EmptyMedia>
            <EmptyTitle>Database required</EmptyTitle>
            <EmptyDescription>
              Audit logging requires a database. Connect a database to start
              recording activity.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6 p-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Audit Log</h1>
          <p className="text-sm text-muted-foreground mt-1">
            A record of activity across your app.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={handleRefresh}
            disabled={isFetching}
          >
            <RefreshCw className={isFetching ? "animate-spin" : undefined} />
            Refresh
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={totalFiltered === 0 || exportMutation.isPending}
            onClick={() => exportMutation.mutate()}
          >
            <Download />
            Download CSV
          </Button>
          <AlertDialog>
            <AlertDialogTrigger
              render={
                <Button variant="destructive" size="sm">
                  <Trash2 />
                  Clear All
                </Button>
              }
            />
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Clear all audit logs?</AlertDialogTitle>
                <AlertDialogDescription>
                  This will permanently delete all recorded entries. This action
                  cannot be undone.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction onClick={() => clearMutation.mutate()}>
                  Clear All
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <Card>
          <CardHeader>
            <CardDescription>Total Entries</CardDescription>
            <p className="text-3xl font-bold">{totalCount}</p>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader>
            <CardDescription>Success</CardDescription>
            <p className="text-3xl font-bold">{successCount}</p>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader>
            <CardDescription>Failure</CardDescription>
            <p className="text-3xl font-bold">{failureCount}</p>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader>
            <CardDescription>Categories</CardDescription>
            <p className="text-3xl font-bold">{categories.length}</p>
          </CardHeader>
        </Card>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <Input
          placeholder="Search action, resource, or page..."
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(1);
          }}
          className="sm:max-w-xs"
        />
        <Select
          value={category}
          onValueChange={(v) => {
            setCategory(v ?? "all");
            setPage(1);
          }}
        >
          <SelectTrigger className="sm:w-48">
            <SelectValue placeholder="Category" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Categories</SelectItem>
            {categories.map((c) => (
              <SelectItem key={c} value={c}>
                {c}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select
          value={status}
          onValueChange={(v) => {
            setStatus(v ?? "all");
            setPage(1);
          }}
        >
          <SelectTrigger className="sm:w-40">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Statuses</SelectItem>
            <SelectItem value="success">Success</SelectItem>
            <SelectItem value="failure">Failure</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {logsLoading ? (
        <Skeleton className="h-64 w-full" />
      ) : pagedLogs.length === 0 ? (
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <ClipboardList />
            </EmptyMedia>
            <EmptyTitle>No entries found</EmptyTitle>
            <EmptyDescription>
              {totalCount === 0
                ? "No activity has been recorded yet."
                : "No entries match your current filters."}
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <>
          <div className="sidebar-surface overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Status</TableHead>
                  <TableHead>Action</TableHead>
                  <TableHead>Resource</TableHead>
                  <TableHead>Page</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead>Timestamp</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pagedLogs.map((log) => (
                  <TableRow key={log.id}>
                    <TableCell>
                      <Badge
                        variant={
                          log.status === "success" ? "secondary" : "destructive"
                        }
                      >
                        {log.status}
                      </Badge>
                    </TableCell>
                    <TableCell>{log.action}</TableCell>
                    <TableCell>{log.resource ?? "—"}</TableCell>
                    <TableCell>{log.page ?? "—"}</TableCell>
                    <TableCell>
                      <Badge variant="outline">{log.category}</Badge>
                    </TableCell>
                    <TableCell>
                      {new Date(log.createdAt).toLocaleString()}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          <div className="flex items-center justify-between gap-4">
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
        </>
      )}
    </div>
  );
}
