import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { useCapabilities } from "@/hooks/useCapabilities";
import { useActivityLog } from "@/hooks/useActivityLog";
import {
  EXPORT_TABLES,
  runExport,
  listExportHistory,
  deleteExport,
  getExportDownloadUrl,
  type ExportTableKey,
} from "@/services/db/exportCenterService";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
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
  Empty,
  EmptyHeader,
  EmptyTitle,
  EmptyDescription,
  EmptyMedia,
} from "@/components/ui/empty";
import { Download, FileDown, Trash2, FolderOutput } from "lucide-react";

export const Route = createFileRoute("/_protected/export-center")({
  component: ExportCenterPage,
});

function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(value: string | Date | null) {
  if (!value) return "—";
  return new Date(value).toLocaleString();
}

function ExportCenterPage() {
  const queryClient = useQueryClient();
  const { logAudit } = useActivityLog();
  const { data: caps, isLoading: capsLoading } = useCapabilities();
  const enabled = caps?.databaseEnabled === true && caps?.s3Enabled === true;

  const [table, setTable] = useState<ExportTableKey>(EXPORT_TABLES[0].key);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  const { data: history, isLoading: historyLoading } = useQuery({
    queryKey: ["exportCenterHistory"],
    queryFn: () => listExportHistory(),
    enabled,
    staleTime: 30_000,
  });

  const exportMutation = useMutation({
    mutationFn: () =>
      runExport({ data: { table, from: from || null, to: to || null } }),
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["exportCenterHistory"] });
      toast.success(
        `Exported ${result.rowCount} row(s) from ${result.tableLabel}.`,
      );
      logAudit({
        action: "Exported data table to CSV",
        resource: result.tableLabel,
        page: "/export-center",
        category: "export",
        status: "success",
      });
    },
    onError: () => {
      toast.error("Failed to generate the export. See Error Log for details.");
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (input: { id: number; key: string }) =>
      deleteExport({ data: input }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["exportCenterHistory"] });
      toast.success("Export removed.");
    },
  });

  async function handleDownload(key: string) {
    try {
      const { url } = await getExportDownloadUrl({ data: key });
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
            Export Center
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

  const selectedMeta = EXPORT_TABLES.find((t) => t.key === table);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Export Center</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Export any data table to CSV, optionally narrowed to a date range.
          Every export is saved to Storage and listed below for download later.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">New export</CardTitle>
          <CardDescription>
            Choose a table and, optionally, a date range on its creation date.
            Leave both dates blank to export everything.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="flex flex-wrap items-end gap-3">
            <div className="flex flex-col gap-1">
              <Label className="text-xs font-normal text-muted-foreground">
                Table
              </Label>
              <Select
                value={table}
                onValueChange={(v) => v && setTable(v as ExportTableKey)}
              >
                <SelectTrigger className="w-[260px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {EXPORT_TABLES.map((t) => (
                    <SelectItem key={t.key} value={t.key}>
                      {t.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {selectedMeta && (
                <span className="text-xs text-muted-foreground">
                  {selectedMeta.description}
                </span>
              )}
            </div>
            <div className="flex flex-col gap-1">
              <Label className="text-xs font-normal text-muted-foreground">
                From
              </Label>
              <Input
                type="date"
                value={from}
                onChange={(e) => setFrom(e.target.value)}
                className="w-[160px]"
              />
            </div>
            <div className="flex flex-col gap-1">
              <Label className="text-xs font-normal text-muted-foreground">
                To
              </Label>
              <Input
                type="date"
                value={to}
                onChange={(e) => setTo(e.target.value)}
                className="w-[160px]"
              />
            </div>
            <Button
              onClick={() => exportMutation.mutate()}
              disabled={exportMutation.isPending}
            >
              <FileDown />
              {exportMutation.isPending ? "Exporting..." : "Export to CSV"}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            Export history{" "}
            {history && history.length > 0 ? `(${history.length})` : ""}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {historyLoading ? (
            <div className="flex flex-col gap-2">
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-12 w-full" />
            </div>
          ) : !history || history.length === 0 ? (
            <Empty>
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <FolderOutput />
                </EmptyMedia>
                <EmptyTitle>No exports yet</EmptyTitle>
                <EmptyDescription>
                  Generate one above to see it here.
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Table</TableHead>
                  <TableHead>Date range</TableHead>
                  <TableHead>Rows</TableHead>
                  <TableHead>Size</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {history.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell className="font-medium">
                      {row.tableLabel}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {row.fromDate || row.toDate
                        ? `${formatDate(row.fromDate)} → ${formatDate(row.toDate)}`
                        : "All time"}
                    </TableCell>
                    <TableCell>{row.rowCount}</TableCell>
                    <TableCell>{formatSize(row.size)}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {formatDate(row.createdAt)}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleDownload(row.key)}
                          aria-label="Download"
                        >
                          <Download className="size-4" />
                        </Button>
                        <AlertDialog>
                          <AlertDialogTrigger
                            render={
                              <Button
                                variant="ghost"
                                size="icon"
                                aria-label="Delete"
                              >
                                <Trash2 className="size-4 text-destructive" />
                              </Button>
                            }
                          />
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>
                                Delete this export?
                              </AlertDialogTitle>
                              <AlertDialogDescription>
                                This removes the CSV file from Storage and its
                                entry here. The original data is unaffected.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Cancel</AlertDialogCancel>
                              <AlertDialogAction
                                onClick={() =>
                                  deleteMutation.mutate({
                                    id: row.id,
                                    key: row.key,
                                  })
                                }
                              >
                                Delete
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
