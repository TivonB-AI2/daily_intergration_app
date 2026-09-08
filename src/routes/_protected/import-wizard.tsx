import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { useCapabilities } from "@/hooks/useCapabilities";
import { useActivityLog } from "@/hooks/useActivityLog";
import { uploadStorageFile } from "@/services/db/storageService";
import {
  previewCsvImport,
  importCsv,
  getAllCsvRows,
  listCsvImportBatches,
  getCsvImportBatchRows,
  deleteCsvImportBatch,
  type CsvPreview,
} from "@/services/db/csvImportService";
import { useAiModel } from "@/hooks/useAiModel";
import { AiProviderSelect } from "@/components/ai/AiProviderSelect";
import {
  DEFAULT_AI_PROVIDER_ID,
  extractProviderText,
  type AiProviderId,
} from "@/lib/aiProviders";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Empty,
  EmptyHeader,
  EmptyTitle,
  EmptyDescription,
  EmptyMedia,
} from "@/components/ui/empty";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
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
  Upload,
  FileSpreadsheet,
  DatabaseZap,
  Trash2,
  Eye,
  Package,
  Layers,
  Sparkles,
} from "lucide-react";

export const Route = createFileRoute("/_protected/import-wizard")({
  component: ImportWizardPage,
});

function TargetBadge({ target }: { target: "inventory" | "generic" }) {
  return target === "inventory" ? (
    <Badge variant="default" className="gap-1">
      <Package className="size-3" />
      Inventory
    </Badge>
  ) : (
    <Badge variant="secondary" className="gap-1">
      <Layers className="size-3" />
      Generic Import
    </Badge>
  );
}

function ImportWizardPage() {
  const queryClient = useQueryClient();
  const { logAudit } = useActivityLog();
  const { data: caps, isLoading: capsLoading } = useCapabilities();
  const enabled = caps?.databaseEnabled === true && caps?.s3Enabled === true;
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [uploadedKey, setUploadedKey] = useState<string | null>(null);
  const [uploadedFileName, setUploadedFileName] = useState<string | null>(null);
  const [preview, setPreview] = useState<CsvPreview | null>(null);
  const [selectedTarget, setSelectedTarget] = useState<"inventory" | "generic">(
    "generic",
  );
  const [viewingBatchId, setViewingBatchId] = useState<number | null>(null);
  const [editedRows, setEditedRows] = useState<Record<string, string>[] | null>(
    null,
  );
  const [aiProvider, setAiProvider] = useState<AiProviderId>(
    DEFAULT_AI_PROVIDER_ID,
  );
  const executeModel = useAiModel();

  const { data: batches, isLoading: batchesLoading } = useQuery({
    queryKey: ["csvImportBatches"],
    queryFn: () => listCsvImportBatches(),
    enabled,
    staleTime: 30_000,
  });

  const { data: batchRows, isLoading: batchRowsLoading } = useQuery({
    queryKey: ["csvImportBatchRows", viewingBatchId],
    queryFn: () => getCsvImportBatchRows({ data: viewingBatchId as number }),
    enabled: viewingBatchId !== null,
  });

  const uploadMutation = useMutation({
    mutationFn: (formData: FormData) => uploadStorageFile({ data: formData }),
  });

  const previewMutation = useMutation({
    mutationFn: (key: string) => previewCsvImport({ data: key }),
    onSuccess: (result) => {
      setPreview(result);
      setSelectedTarget(result.detectedTarget);
    },
    onError: () => {
      toast.error("Couldn't read that CSV file.");
      resetUpload();
    },
  });

  const importMutation = useMutation({
    mutationFn: () =>
      importCsv({
        data: {
          key: uploadedKey as string,
          fileName: uploadedFileName as string,
          targetTable: selectedTarget,
          rows: editedRows ?? undefined,
        },
      }),
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["csvImportBatches"] });
      if (selectedTarget === "inventory") {
        queryClient.invalidateQueries({ queryKey: ["inventoryItems"] });
      }
      toast.success(
        selectedTarget === "inventory"
          ? `Imported: ${result.insertedRows} added, ${result.updatedRows} updated, ${result.skippedRows} skipped.`
          : `Captured ${result.totalRows} row(s) from the CSV.`,
      );
      logAudit({
        action: "Imported CSV file",
        resource: uploadedFileName ?? undefined,
        page: "/import-wizard",
        category: "import",
        status: "success",
      });
      resetUpload();
    },
    onError: () => toast.error("Import failed. See Error Log for details."),
  });

  const deleteMutation = useMutation({
    mutationFn: (batchId: number) => deleteCsvImportBatch({ data: batchId }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["csvImportBatches"] });
      toast.success("Import record removed.");
    },
  });

  function resetUpload() {
    setUploadedKey(null);
    setUploadedFileName(null);
    setPreview(null);
    setSelectedTarget("generic");
    setEditedRows(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  async function handleSuggestCategories() {
    if (!uploadedKey) return;
    try {
      const allRows =
        editedRows ?? (await getAllCsvRows({ data: uploadedKey }));
      const missing = allRows
        .map((row, index) => ({ row, index }))
        .filter(({ row }) => !row.category?.trim());
      if (missing.length === 0) {
        toast.info("Every row already has a category.");
        setEditedRows(allRows);
        return;
      }
      const listing = missing
        .map(
          ({ row }, i) =>
            `${i + 1}. ${row.name || "(unnamed)"}${row.description ? ` — ${row.description}` : ""}`,
        )
        .join("\n");

      executeModel.mutate(
        {
          connectorId: aiProvider,
          messages: [
            {
              role: "user",
              content: `These are inventory items missing a category:\n${listing}\n\nRespond with exactly ${missing.length} line(s), one short category per item, in the same order, and nothing else (no numbering, no extra text).`,
            },
          ],
          instructions:
            "You are an inventory categorization assistant. Reply with only the requested category names, one per line, in order.",
        },
        {
          onSuccess: (res) => {
            const text = extractProviderText(res?.data);
            const suggestions = text
              .split("\n")
              .map((l) => l.replace(/^[\s\-*\d.]+/, "").trim())
              .filter((l) => l.length > 0);
            if (suggestions.length !== missing.length) {
              toast.error(
                "The AI's suggestions didn't match the number of rows — please try again.",
              );
              return;
            }
            const next = [...allRows];
            missing.forEach(({ index }, i) => {
              next[index] = { ...next[index], category: suggestions[i] };
            });
            setEditedRows(next);
            toast.success(`Suggested categories for ${missing.length} row(s).`);
          },
          onError: () => {
            toast.error("Failed to get AI category suggestions.");
          },
        },
      );
    } catch {
      toast.error("Couldn't read the full CSV for suggestions.");
    }
  }

  async function handleFileSelected(file: File) {
    if (!file.name.toLowerCase().endsWith(".csv")) {
      toast.error("Please choose a .csv file.");
      return;
    }
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("folder", "uploads");
      const row = await uploadMutation.mutateAsync(fd);
      setUploadedKey(row.key);
      setUploadedFileName(row.fileName);
      previewMutation.mutate(row.key);
    } catch {
      toast.error(`Failed to upload ${file.name}`);
    }
  }

  if (capsLoading) {
    return (
      <div className="p-6 space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (!enabled) {
    return (
      <div className="p-6">
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <DatabaseZap />
            </EmptyMedia>
            <EmptyTitle>Import Wizard unavailable</EmptyTitle>
            <EmptyDescription>
              This page needs both a database and file storage to be connected
              before CSV files can be imported.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      </div>
    );
  }

  const isBusy =
    uploadMutation.isPending ||
    previewMutation.isPending ||
    importMutation.isPending;

  return (
    <div className="flex flex-col gap-6 p-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Import Wizard</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Upload a CSV file. If its columns match Inventory (name, SKU,
          category), rows are added or updated there; otherwise the rows are
          captured as a new import you can browse below.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Upload a CSV</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {!preview ? (
            <div className="flex flex-col items-center justify-center gap-3 rounded-md border border-dashed p-10 text-center">
              <Upload className="size-8 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">
                Choose a .csv file to preview and import.
              </p>
              <Button
                onClick={() => fileInputRef.current?.click()}
                disabled={isBusy}
              >
                {isBusy ? "Working..." : "Choose CSV File"}
              </Button>
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv,text/csv"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) handleFileSelected(file);
                }}
              />
            </div>
          ) : (
            <div className="flex flex-col gap-4">
              <div className="flex flex-wrap items-center gap-2">
                <FileSpreadsheet className="size-4 text-muted-foreground" />
                <span className="text-sm font-medium">{uploadedFileName}</span>
                <span className="sidebar-surface inline-flex rounded-md">
                  <Badge variant="outline">{preview.rowCount} rows</Badge>
                </span>
              </div>

              <div className="sidebar-surface overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      {preview.headers.map((h) => (
                        <TableHead key={h}>{h}</TableHead>
                      ))}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(editedRows ?? preview.sampleRows)
                      .slice(0, 5)
                      .map((row, i) => (
                        // biome-ignore lint/suspicious/noArrayIndexKey: static preview sample
                        <TableRow key={i}>
                          {preview.headers.map((h) => (
                            <TableCell key={h} className="max-w-48 truncate">
                              {row[h]}
                            </TableCell>
                          ))}
                        </TableRow>
                      ))}
                  </TableBody>
                </Table>
                {editedRows && (
                  <p className="px-3 py-2 text-xs text-muted-foreground border-t">
                    Showing AI-updated rows ({editedRows.length} total).
                  </p>
                )}
              </div>

              <div className="flex flex-wrap items-center gap-3">
                <span className="text-sm text-muted-foreground">
                  Import into:
                </span>
                <Select
                  value={selectedTarget}
                  onValueChange={(v) => {
                    if (v === "inventory" || v === "generic")
                      setSelectedTarget(v);
                  }}
                >
                  <SelectTrigger className="w-56">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="inventory">
                      Inventory (match by SKU)
                    </SelectItem>
                    <SelectItem value="generic">
                      Generic import (browse only)
                    </SelectItem>
                  </SelectContent>
                </Select>
                {preview.detectedTarget === "inventory" && (
                  <span className="text-xs text-muted-foreground">
                    Detected Inventory columns automatically.
                  </span>
                )}
              </div>

              {selectedTarget === "inventory" && (
                <div className="flex flex-wrap items-center gap-2 rounded-md border border-dashed p-3">
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={handleSuggestCategories}
                    disabled={executeModel.isPending}
                  >
                    <Sparkles
                      className={executeModel.isPending ? "animate-pulse" : ""}
                    />
                    {executeModel.isPending
                      ? "Suggesting..."
                      : "Suggest missing categories with AI"}
                  </Button>
                  <AiProviderSelect
                    value={aiProvider}
                    onChange={setAiProvider}
                  />
                </div>
              )}

              <div className="flex items-center gap-2">
                <Button
                  onClick={() => importMutation.mutate()}
                  disabled={importMutation.isPending}
                >
                  {importMutation.isPending ? "Importing..." : "Import Rows"}
                </Button>
                <Button
                  variant="outline"
                  onClick={resetUpload}
                  disabled={importMutation.isPending}
                >
                  Cancel
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <div>
        <h2 className="text-lg font-semibold tracking-tight mb-3">
          Import History
        </h2>
        {batchesLoading ? (
          <Skeleton className="h-48 w-full" />
        ) : !batches || batches.length === 0 ? (
          <Empty>
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <FileSpreadsheet />
              </EmptyMedia>
              <EmptyTitle>No imports yet</EmptyTitle>
              <EmptyDescription>
                Upload a CSV above to see it listed here.
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          <div className="sidebar-surface overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>File</TableHead>
                  <TableHead>Target</TableHead>
                  <TableHead>Rows</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {batches.map((batch) => (
                  <TableRow key={batch.id}>
                    <TableCell className="max-w-56 truncate">
                      {batch.fileName}
                    </TableCell>
                    <TableCell>
                      <TargetBadge target={batch.targetTable} />
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {batch.targetTable === "inventory"
                        ? `${batch.insertedRows} added, ${batch.updatedRows} updated, ${batch.skippedRows} skipped`
                        : `${batch.totalRows} rows`}
                    </TableCell>
                    <TableCell>
                      {new Date(batch.createdAt).toLocaleString()}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        {batch.targetTable === "generic" && (
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => setViewingBatchId(batch.id)}
                          >
                            <Eye />
                          </Button>
                        )}
                        <AlertDialog>
                          <AlertDialogTrigger
                            render={
                              <Button variant="ghost" size="icon">
                                <Trash2 />
                              </Button>
                            }
                          />
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>
                                Remove this import record?
                              </AlertDialogTitle>
                              <AlertDialogDescription>
                                This removes the import history entry
                                {batch.targetTable === "generic"
                                  ? " and its captured rows"
                                  : ""}
                                . Rows already added to Inventory are not
                                affected.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Cancel</AlertDialogCancel>
                              <AlertDialogAction
                                onClick={() => deleteMutation.mutate(batch.id)}
                              >
                                Remove
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
          </div>
        )}
      </div>

      <Dialog
        open={viewingBatchId !== null}
        onOpenChange={(open) => !open && setViewingBatchId(null)}
      >
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>Imported Rows</DialogTitle>
          </DialogHeader>
          {batchRowsLoading ? (
            <Skeleton className="h-64 w-full" />
          ) : !batchRows || batchRows.length === 0 ? (
            <p className="text-sm text-muted-foreground">No rows found.</p>
          ) : (
            <div className="sidebar-surface max-h-[60vh] overflow-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    {Object.keys(batchRows[0].data).map((h) => (
                      <TableHead key={h}>{h}</TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {batchRows.map((row) => (
                    <TableRow key={row.id}>
                      {Object.keys(batchRows[0].data).map((h) => (
                        <TableCell key={h} className="max-w-48 truncate">
                          {row.data[h]}
                        </TableCell>
                      ))}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
