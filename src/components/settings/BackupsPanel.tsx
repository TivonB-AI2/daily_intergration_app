import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  AlertTriangle,
  DatabaseBackup,
  DownloadCloud,
  RotateCcw,
} from "lucide-react";
import {
  createBackup,
  listBackups,
  restoreBackup,
  type RestoreMode,
} from "@/services/db/backupService";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { Skeleton } from "@/components/ui/skeleton";
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function BackupsPanel({ enabled }: { enabled: boolean }) {
  const queryClient = useQueryClient();
  const [restoringId, setRestoringId] = useState<number | null>(null);
  const [restoreMode, setRestoreMode] = useState<RestoreMode>("merge");

  const { data: backups = [], isLoading } = useQuery({
    queryKey: ["dbBackups"],
    queryFn: () => listBackups(),
    enabled,
  });

  const backupMutation = useMutation({
    mutationFn: () => createBackup(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["dbBackups"] });
      toast.success("Backup created.");
    },
    onError: () => toast.error("Failed to create backup."),
  });

  const restoreMutation = useMutation({
    mutationFn: (input: { id: number; mode: RestoreMode }) =>
      restoreBackup({ data: input }),
    onSuccess: (result) => {
      toast.success(
        result.mode === "replace"
          ? `Replaced all data with ${result.restoredRows} rows from backup.`
          : `Restored ${result.restoredRows} rows from backup.`,
      );
      queryClient.invalidateQueries();
    },
    onError: () => toast.error("Failed to restore backup."),
    onSettled: () => {
      setRestoringId(null);
      setRestoreMode("merge");
    },
  });

  if (!enabled) {
    return (
      <Card>
        <CardContent className="pt-6 text-sm text-muted-foreground">
          Database not configured — backups can't be created yet.
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <DatabaseBackup className="h-4 w-4" />
          Backups
        </CardTitle>
        <CardDescription>
          Snapshot all app data (to-dos, changelog, inventory, chat history, and
          more) to storage. Keep at least one backup so data can be restored if
          it's ever lost — for example after a republish.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-6">
        <div>
          <Button
            onClick={() => backupMutation.mutate()}
            disabled={backupMutation.isPending}
          >
            <DatabaseBackup className="h-4 w-4" />
            {backupMutation.isPending ? "Backing up..." : "Backup now"}
          </Button>
        </div>

        {isLoading ? (
          <div className="flex flex-col gap-2">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </div>
        ) : backups.length === 0 ? (
          <Empty>
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <DatabaseBackup />
              </EmptyMedia>
              <EmptyTitle>No backups yet</EmptyTitle>
              <EmptyDescription>
                Click "Backup now" to create your first snapshot.
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Created</TableHead>
                <TableHead>Tables</TableHead>
                <TableHead>Rows</TableHead>
                <TableHead>Size</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {backups.map((backup) => (
                <TableRow key={backup.id}>
                  <TableCell className="font-medium">
                    {new Date(backup.createdAt).toLocaleString()}
                  </TableCell>
                  <TableCell>{backup.tableCount}</TableCell>
                  <TableCell>{backup.rowCount}</TableCell>
                  <TableCell>{formatSize(backup.sizeBytes)}</TableCell>
                  <TableCell className="text-right">
                    <AlertDialog>
                      <AlertDialogTrigger
                        render={
                          <Button
                            variant="ghost"
                            size="sm"
                            disabled={restoreMutation.isPending}
                            onClick={() => setRestoringId(backup.id)}
                          >
                            <RotateCcw className="h-4 w-4" />
                            Restore
                          </Button>
                        }
                      />
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle className="flex items-center gap-2">
                            <AlertTriangle className="h-4 w-4 text-destructive" />
                            Restore this backup?
                          </AlertDialogTitle>
                          <AlertDialogDescription>
                            Choose how to restore the{" "}
                            {new Date(backup.createdAt).toLocaleString()}{" "}
                            snapshot.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <RadioGroup
                          value={restoreMode}
                          onValueChange={(v) =>
                            setRestoreMode((v as RestoreMode) ?? "merge")
                          }
                          className="gap-3"
                        >
                          <div className="flex items-start gap-2.5 rounded-md border p-3">
                            <RadioGroupItem value="merge" id="restore-merge" />
                            <Label
                              htmlFor="restore-merge"
                              className="flex flex-col gap-1 font-normal"
                            >
                              <span className="font-medium">
                                Merge (add on top)
                              </span>
                              <span className="text-xs text-muted-foreground">
                                Inserts every row from the snapshot. Rows
                                already present are not removed, so this may
                                create duplicates.
                              </span>
                            </Label>
                          </div>
                          <div className="flex items-start gap-2.5 rounded-md border border-destructive/40 bg-destructive/5 p-3">
                            <RadioGroupItem
                              value="replace"
                              id="restore-replace"
                            />
                            <Label
                              htmlFor="restore-replace"
                              className="flex flex-col gap-1 font-normal"
                            >
                              <span className="font-medium text-destructive">
                                Replace all data
                              </span>
                              <span className="text-xs text-muted-foreground">
                                Deletes every row currently in every backed-up
                                table, then inserts the snapshot. This cannot be
                                undone — anything created after this backup was
                                made will be permanently lost.
                              </span>
                            </Label>
                          </div>
                        </RadioGroup>
                        <AlertDialogFooter>
                          <AlertDialogCancel
                            onClick={() => {
                              setRestoringId(null);
                              setRestoreMode("merge");
                            }}
                          >
                            Cancel
                          </AlertDialogCancel>
                          <AlertDialogAction
                            variant={
                              restoreMode === "replace"
                                ? "destructive"
                                : "default"
                            }
                            onClick={() => {
                              if (restoringId != null)
                                restoreMutation.mutate({
                                  id: restoringId,
                                  mode: restoreMode,
                                });
                            }}
                          >
                            <DownloadCloud className="h-4 w-4" />
                            {restoreMode === "replace"
                              ? "Replace all data"
                              : "Restore"}
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
