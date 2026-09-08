import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { useCapabilities } from "@/hooks/useCapabilities";
import {
  listAllStorageObjects,
  uploadStorageFile,
  getStorageFileUrl,
  getStorageFileText,
  deleteStorageFile,
  deleteUntrackedStorageObject,
  updateStorageFileMeta,
  findExistingStorageFile,
  findDuplicateStorageFiles,
  type StorageFolder,
} from "@/services/db/storageService";
import { useActivityLog } from "@/hooks/useActivityLog";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Empty,
  EmptyHeader,
  EmptyTitle,
  EmptyDescription,
  EmptyMedia,
} from "@/components/ui/empty";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";
import { Card, CardDescription, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Upload,
  Image as ImageIcon,
  File as FileIcon,
  Download,
  Trash2,
  DatabaseZap,
  FolderOpen,
  Eye,
  Tag,
  X,
  Copy,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  FilePreviewDialog,
  type PreviewFile,
} from "@/components/storage/FilePreviewDialog";

export const Route = createFileRoute("/_protected/storage")({
  component: StoragePage,
});

function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024)
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

type TypeFilter = "all" | "documents" | "images";

function StoragePage() {
  const queryClient = useQueryClient();
  const { logAudit } = useActivityLog();
  const { data: caps, isLoading: capsLoading } = useCapabilities();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [search, setSearch] = useState("");
  const [folderFilter, setFolderFilter] = useState<string>("all");
  const [typeFilter, setTypeFilter] = useState<TypeFilter>("all");
  const [uploadFolder, setUploadFolder] = useState<StorageFolder>("uploads");
  const [isDragging, setIsDragging] = useState(false);
  const [previewFile, setPreviewFile] = useState<PreviewFile | null>(null);
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set());
  const [bulkTagInput, setBulkTagInput] = useState("");
  const [editingDoc, setEditingDoc] = useState<{
    id: number;
    fileName: string;
    tags: string[];
    extractedText: string;
  } | null>(null);
  const [tagInput, setTagInput] = useState("");
  const [conflict, setConflict] = useState<{
    file: File;
    existing: { id: number; fileName: string };
  } | null>(null);
  const conflictResolverRef = useRef<
    ((action: "replace" | "copy" | "skip") => void) | null
  >(null);
  const [duplicatesOpen, setDuplicatesOpen] = useState(false);
  const [duplicateSelection, setDuplicateSelection] = useState<Set<string>>(
    new Set(),
  );

  const canUse = caps?.databaseEnabled === true && caps?.s3Enabled === true;

  const { data: files, isLoading: filesLoading } = useQuery({
    queryKey: ["storageAllObjects"],
    queryFn: () => listAllStorageObjects(),
    enabled: canUse,
    staleTime: 30_000,
  });

  const uploadMutation = useMutation({
    mutationFn: (formData: FormData) => uploadStorageFile({ data: formData }),
    onSuccess: (row) => {
      queryClient.invalidateQueries({ queryKey: ["storageAllObjects"] });
      logAudit({
        action: "Uploaded file",
        resource: row.fileName,
        page: "/storage",
        category: "storage",
        status: "success",
      });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (input: { id: number | null; key: string }) =>
      input.id !== null
        ? deleteStorageFile({ data: { id: input.id, key: input.key } })
        : deleteUntrackedStorageObject({ data: input.key }),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["storageAllObjects"] });
      logAudit({
        action: "Deleted file",
        resource: variables.key,
        page: "/storage",
        category: "storage",
        status: "success",
      });
    },
  });

  const metaMutation = useMutation({
    mutationFn: (input: {
      id: number;
      tags?: string[];
      extractedText?: string | null;
    }) => updateStorageFileMeta({ data: input }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["storageAllObjects"] });
      toast.success("File updated");
    },
    onError: () => toast.error("Failed to update file"),
  });

  const bulkDeleteMutation = useMutation({
    mutationFn: (files: { id: number | null; key: string }[]) =>
      Promise.all(
        files.map((f) =>
          f.id !== null
            ? deleteStorageFile({ data: { id: f.id, key: f.key } })
            : deleteUntrackedStorageObject({ data: f.key }),
        ),
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["storageAllObjects"] });
      toast.success("Selected files deleted");
      setSelectedKeys(new Set());
    },
    onError: () => toast.error("Failed to delete selected files"),
  });

  const bulkTagMutation = useMutation({
    mutationFn: (
      items: { id: number; existingTags: string[]; tag: string }[],
    ) =>
      Promise.all(
        items.map(({ id, existingTags, tag }) =>
          updateStorageFileMeta({
            data: {
              id,
              tags: existingTags.includes(tag)
                ? existingTags
                : [...existingTags, tag],
            },
          }),
        ),
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["storageAllObjects"] });
      toast.success("Tag added to selected files");
      setSelectedKeys(new Set());
      setBulkTagInput("");
    },
    onError: () => toast.error("Failed to tag selected files"),
  });

  // Uploads are processed one at a time (rather than fired all at once) so
  // a name conflict can pause the sequence and wait for the user's choice
  // before continuing to the next file.
  async function uploadOneFile(file: File) {
    const existing = await findExistingStorageFile({
      data: { fileName: file.name, folder: uploadFolder },
    });

    let replaceId: number | null = null;
    if (existing) {
      const action = await new Promise<"replace" | "copy" | "skip">(
        (resolve) => {
          setConflict({ file, existing });
          conflictResolverRef.current = resolve;
        },
      );
      setConflict(null);
      if (action === "skip") return;
      if (action === "replace") replaceId = existing.id;
    }

    const formData = new FormData();
    formData.append("file", file);
    formData.append("folder", uploadFolder);
    if (replaceId !== null) formData.append("replaceId", String(replaceId));
    await uploadMutation.mutateAsync(formData);
  }

  const handleFiles = async (fileList: FileList | null) => {
    if (!fileList || fileList.length === 0) return;
    for (const file of Array.from(fileList)) {
      await uploadOneFile(file);
    }
  };

  const { data: duplicateGroups, isLoading: duplicatesLoading } = useQuery({
    queryKey: ["storageDuplicates"],
    queryFn: () => findDuplicateStorageFiles(),
    enabled: canUse && duplicatesOpen,
    staleTime: 30_000,
  });

  const deleteDuplicatesMutation = useMutation({
    mutationFn: (targets: { id: number | null; key: string }[]) =>
      Promise.all(
        targets.map((t) =>
          t.id !== null
            ? deleteStorageFile({ data: { id: t.id, key: t.key } })
            : deleteUntrackedStorageObject({ data: t.key }),
        ),
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["storageAllObjects"] });
      queryClient.invalidateQueries({ queryKey: ["storageDuplicates"] });
      toast.success("Duplicate files deleted");
      setDuplicateSelection(new Set());
    },
    onError: () => toast.error("Failed to delete duplicates"),
  });

  const handleDownload = async (key: string) => {
    // Open the tab synchronously, in direct response to the click, then
    // navigate it once the presigned URL resolves. Opening only after the
    // `await` (the old code) fires outside the original click's user-gesture
    // window in some browsers (notably Safari), so the popup gets silently
    // blocked instead of ever opening.
    const tab = window.open("", "_blank");
    try {
      const { url } = await getStorageFileUrl({ data: key });
      if (tab) tab.location.href = url;
      else window.open(url, "_blank");
    } catch {
      tab?.close();
      toast.error("Couldn't generate a download link.");
    }
  };

  function openEditor(doc: {
    id: number | null;
    fileName: string;
    tags: string[] | null;
    extractedText: string | null;
  }) {
    if (doc.id === null) return;
    setEditingDoc({
      id: doc.id,
      fileName: doc.fileName,
      tags: doc.tags ?? [],
      extractedText: doc.extractedText ?? "",
    });
    setTagInput("");
  }

  function addTag() {
    const value = tagInput.trim();
    if (!value || !editingDoc) return;
    if (editingDoc.tags.includes(value)) {
      setTagInput("");
      return;
    }
    setEditingDoc({ ...editingDoc, tags: [...editingDoc.tags, value] });
    setTagInput("");
  }

  function removeTag(tag: string) {
    if (!editingDoc) return;
    setEditingDoc({
      ...editingDoc,
      tags: editingDoc.tags.filter((t) => t !== tag),
    });
  }

  function saveEditor() {
    if (!editingDoc) return;
    metaMutation.mutate(
      {
        id: editingDoc.id,
        tags: editingDoc.tags,
        extractedText: editingDoc.extractedText || null,
      },
      { onSuccess: () => setEditingDoc(null) },
    );
  }

  const availableFolders = useMemo(() => {
    // Always offer the three canonical folders (even ones with zero files
    // right now, so the filter doesn't appear to "lose" an option), plus
    // whatever other folders actually exist in storage (e.g. "themes").
    const folders = new Set<string>(["uploads", "exports", "assets"]);
    for (const f of files ?? []) folders.add(f.folder);
    return Array.from(folders).sort();
  }, [files]);

  const filteredFiles = useMemo(() => {
    const term = search.trim().toLowerCase();
    return (files ?? []).filter((f) => {
      if (folderFilter !== "all" && f.folder !== folderFilter) return false;
      const isImage = f.contentType?.startsWith("image/") ?? false;
      if (typeFilter === "documents" && isImage) return false;
      if (typeFilter === "images" && !isImage) return false;
      if (!term) return true;
      const matchesName = f.fileName.toLowerCase().includes(term);
      const matchesTags = (f.tags ?? []).some((t) =>
        t.toLowerCase().includes(term),
      );
      const matchesContent = f.extractedText?.toLowerCase().includes(term);
      return matchesName || matchesTags || Boolean(matchesContent);
    });
  }, [files, folderFilter, typeFilter, search]);

  const totalCount = files?.length ?? 0;
  const totalSize = useMemo(
    () => (files ?? []).reduce((sum, f) => sum + f.size, 0),
    [files],
  );
  const uploadsCount = useMemo(
    () => (files ?? []).filter((f) => f.folder === "uploads").length,
    [files],
  );
  const exportsCount = useMemo(
    () => (files ?? []).filter((f) => f.folder === "exports").length,
    [files],
  );
  const assetsCount = useMemo(
    () => (files ?? []).filter((f) => f.folder === "assets").length,
    [files],
  );
  const otherFoldersCount = useMemo(
    () =>
      (files ?? []).filter(
        (f) => !["uploads", "exports", "assets"].includes(f.folder),
      ).length,
    [files],
  );

  if (capsLoading) {
    return (
      <div className="flex flex-col gap-6 p-6">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-32 w-full" />
      </div>
    );
  }

  if (!canUse) {
    return (
      <div className="flex flex-col gap-6 p-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Storage</h1>
          <p className="text-sm text-muted-foreground mt-1">
            The shared file store used by this app, including documents and
            images.
          </p>
        </div>
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <DatabaseZap />
            </EmptyMedia>
            <EmptyTitle>Database and storage required</EmptyTitle>
            <EmptyDescription>
              This page needs both a database and file storage to be connected
              before files can be managed.
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
          <h1 className="text-2xl font-semibold tracking-tight">Storage</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Every file in this project's storage, across every folder — tag and
            search documents, or filter down to just images.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={() => setDuplicatesOpen(true)}>
            <Copy />
            Find Duplicates
          </Button>
          <Select
            value={uploadFolder}
            onValueChange={(v) => setUploadFolder(v as StorageFolder)}
          >
            <SelectTrigger className="w-32">
              <SelectValue placeholder="Folder" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="uploads">Uploads</SelectItem>
              <SelectItem value="exports">Exports</SelectItem>
              <SelectItem value="assets">Assets</SelectItem>
            </SelectContent>
          </Select>
          <Button
            onClick={() => fileInputRef.current?.click()}
            disabled={uploadMutation.isPending}
          >
            <Upload />
            {uploadMutation.isPending ? "Uploading..." : "Upload"}
          </Button>
          <input
            ref={fileInputRef}
            type="file"
            multiple
            className="hidden"
            onChange={(e) => {
              handleFiles(e.target.files);
              e.target.value = "";
            }}
          />
        </div>
      </div>

      <div
        onDragOver={(e) => {
          e.preventDefault();
          setIsDragging(true);
        }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setIsDragging(false);
          handleFiles(e.dataTransfer.files);
        }}
        className={cn(
          "flex flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed p-8 text-center transition-colors",
          isDragging ? "border-primary bg-accent" : "border-border bg-muted/30",
        )}
      >
        <Upload className="size-6 text-muted-foreground" />
        <p className="text-sm text-muted-foreground">
          Drag and drop files here, or use the Upload button. Files will be
          added to the{" "}
          <span className="font-medium text-foreground">{uploadFolder}</span>{" "}
          folder.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <Card>
          <CardHeader>
            <CardDescription>Total Files</CardDescription>
            <p className="text-3xl font-bold">{totalCount}</p>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader>
            <CardDescription>Total Size</CardDescription>
            <p className="text-3xl font-bold">{formatSize(totalSize)}</p>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader>
            <CardDescription>Uploads / Exports</CardDescription>
            <p className="text-3xl font-bold">
              {uploadsCount} / {exportsCount}
            </p>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader>
            <CardDescription>Assets / Other</CardDescription>
            <p className="text-3xl font-bold">
              {assetsCount} / {otherFoldersCount}
            </p>
          </CardHeader>
        </Card>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <Input
          placeholder="Search by name, tag, or content..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="sm:max-w-xs"
        />
        <Select
          value={typeFilter}
          onValueChange={(v) => setTypeFilter((v as TypeFilter) ?? "all")}
        >
          <SelectTrigger className="sm:w-40">
            <SelectValue placeholder="Type" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Files</SelectItem>
            <SelectItem value="documents">Documents</SelectItem>
            <SelectItem value="images">Images</SelectItem>
          </SelectContent>
        </Select>
        <Select
          value={folderFilter}
          onValueChange={(v) => setFolderFilter(v ?? "all")}
        >
          <SelectTrigger className="sm:w-44">
            <SelectValue placeholder="Folder" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Folders</SelectItem>
            {availableFolders.map((folder) => (
              <SelectItem key={folder} value={folder}>
                {folder}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {filesLoading ? (
        <Skeleton className="h-64 w-full" />
      ) : filteredFiles.length === 0 ? (
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <FolderOpen />
            </EmptyMedia>
            <EmptyTitle>No files found</EmptyTitle>
            <EmptyDescription>
              {totalCount === 0
                ? "No files have been uploaded yet."
                : "No files match your current filters."}
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <div className="flex flex-col gap-3">
          {selectedKeys.size > 0 && (
            <div className="flex flex-wrap items-center gap-3 rounded-md border bg-muted/40 px-4 py-2.5">
              <span className="text-sm font-medium">
                {selectedKeys.size} selected
              </span>
              <div className="flex flex-wrap items-center gap-2 ml-auto">
                <Input
                  placeholder="Add tag to selected..."
                  value={bulkTagInput}
                  onChange={(e) => setBulkTagInput(e.target.value)}
                  className="h-8 w-40"
                />
                <Button
                  variant="outline"
                  size="sm"
                  disabled={!bulkTagInput.trim() || bulkTagMutation.isPending}
                  onClick={() => {
                    const tag = bulkTagInput.trim();
                    if (!tag) return;
                    const items = filteredFiles
                      .filter((f) => selectedKeys.has(f.key) && f.id !== null)
                      .map((f) => ({
                        id: f.id as number,
                        existingTags: f.tags ?? [],
                        tag,
                      }));
                    bulkTagMutation.mutate(items);
                  }}
                >
                  <Tag className="size-4" />
                  Add Tag
                </Button>
                <AlertDialog>
                  <AlertDialogTrigger
                    render={
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={bulkDeleteMutation.isPending}
                      >
                        <Trash2 className="size-4" />
                        Delete selected
                      </Button>
                    }
                  />
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>
                        Delete {selectedKeys.size} file
                        {selectedKeys.size === 1 ? "" : "s"}?
                      </AlertDialogTitle>
                      <AlertDialogDescription>
                        This will permanently delete the selected files. This
                        action cannot be undone.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                      <AlertDialogAction
                        onClick={() => {
                          const files = filteredFiles
                            .filter((f) => selectedKeys.has(f.key))
                            .map((f) => ({ id: f.id, key: f.key }));
                          bulkDeleteMutation.mutate(files);
                        }}
                      >
                        Delete
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setSelectedKeys(new Set())}
                >
                  Clear
                </Button>
              </div>
            </div>
          )}
          <div className="sidebar-surface overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10">
                    <Checkbox
                      checked={
                        filteredFiles.length > 0 &&
                        filteredFiles.every((f) => selectedKeys.has(f.key))
                      }
                      onCheckedChange={() => {
                        setSelectedKeys((prev) => {
                          const allSelected = filteredFiles.every((f) =>
                            prev.has(f.key),
                          );
                          const next = new Set(prev);
                          if (allSelected) {
                            for (const f of filteredFiles) next.delete(f.key);
                          } else {
                            for (const f of filteredFiles) next.add(f.key);
                          }
                          return next;
                        });
                      }}
                      aria-label="Select all"
                    />
                  </TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead>Tags</TableHead>
                  <TableHead>Folder</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Size</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredFiles.map((file) => {
                  const isImage = file.contentType?.startsWith("image/");
                  return (
                    <TableRow key={file.key}>
                      <TableCell>
                        <Checkbox
                          checked={selectedKeys.has(file.key)}
                          onCheckedChange={() => {
                            setSelectedKeys((prev) => {
                              const next = new Set(prev);
                              if (next.has(file.key)) next.delete(file.key);
                              else next.add(file.key);
                              return next;
                            });
                          }}
                          aria-label={`Select ${file.fileName}`}
                        />
                      </TableCell>
                      <TableCell className="flex items-center gap-2">
                        {isImage ? (
                          <ImageIcon className="size-4 text-muted-foreground" />
                        ) : (
                          <FileIcon className="size-4 text-muted-foreground" />
                        )}
                        {file.fileName}
                      </TableCell>
                      <TableCell>
                        <div className="flex max-w-40 flex-wrap gap-1">
                          {(file.tags ?? []).length === 0 ? (
                            <span className="text-xs text-muted-foreground">
                              —
                            </span>
                          ) : (
                            (file.tags ?? []).map((tag) => (
                              <Badge
                                key={tag}
                                variant="secondary"
                                className="text-[10px]"
                              >
                                {tag}
                              </Badge>
                            ))
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1.5">
                          <Badge variant="outline">{file.folder}</Badge>
                          {!file.tracked && (
                            <Badge
                              variant="secondary"
                              className="text-[10px]"
                              title="Found in storage but not uploaded through this app"
                            >
                              untracked
                            </Badge>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {file.contentType || "—"}
                      </TableCell>
                      <TableCell>{formatSize(file.size)}</TableCell>
                      <TableCell>
                        {new Date(file.createdAt).toLocaleString()}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() =>
                              setPreviewFile({
                                key: file.key,
                                fileName: file.fileName,
                                contentType: file.contentType,
                              })
                            }
                            aria-label="Preview"
                          >
                            <Eye />
                          </Button>
                          {file.id !== null && (
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => openEditor(file)}
                              aria-label="Manage tags and content"
                            >
                              <Tag />
                            </Button>
                          )}
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleDownload(file.key)}
                          >
                            <Download />
                          </Button>
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
                                  Delete file?
                                </AlertDialogTitle>
                                <AlertDialogDescription>
                                  This will permanently delete "{file.fileName}
                                  ". This action cannot be undone.
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>Cancel</AlertDialogCancel>
                                <AlertDialogAction
                                  onClick={() =>
                                    deleteMutation.mutate({
                                      id: file.id,
                                      key: file.key,
                                    })
                                  }
                                >
                                  Delete
                                </AlertDialogAction>
                                {/* file.id is null for objects found directly in
                                storage that were never uploaded through this
                                app (e.g. backups) — deletion falls back to a
                                key-only S3 delete in that case. */}
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </div>
      )}

      {uploadMutation.isError && (
        <Alert variant="destructive">
          <AlertTitle>Upload failed</AlertTitle>
          <AlertDescription>
            One or more files could not be uploaded. Please try again.
          </AlertDescription>
        </Alert>
      )}

      <Dialog
        open={editingDoc !== null}
        onOpenChange={(o) => !o && setEditingDoc(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Tags & Searchable Content</DialogTitle>
            <DialogDescription>
              {editingDoc?.fileName} — add tags and optional text content so
              this file can be found by search.
            </DialogDescription>
          </DialogHeader>
          {editingDoc && (
            <div className="flex flex-col gap-4">
              <div className="flex flex-col gap-2">
                <Label>Tags</Label>
                <div className="flex flex-wrap gap-1.5">
                  {editingDoc.tags.length === 0 ? (
                    <span className="text-xs text-muted-foreground">
                      No tags yet
                    </span>
                  ) : (
                    editingDoc.tags.map((tag) => (
                      <Badge
                        key={tag}
                        variant="secondary"
                        className="gap-1 pr-1"
                      >
                        {tag}
                        <button
                          type="button"
                          onClick={() => removeTag(tag)}
                          aria-label={`Remove tag ${tag}`}
                          className="rounded-full hover:text-destructive"
                        >
                          <X className="size-3" />
                        </button>
                      </Badge>
                    ))
                  )}
                </div>
                <div className="flex gap-2">
                  <Input
                    placeholder="e.g. contract, invoice"
                    value={tagInput}
                    onChange={(e) => setTagInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        addTag();
                      }
                    }}
                  />
                  <Button type="button" variant="outline" onClick={addTag}>
                    Add
                  </Button>
                </div>
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="file-content">Searchable content</Label>
                <Textarea
                  id="file-content"
                  placeholder="Paste or type the file's text so it can be found by full-text search."
                  value={editingDoc.extractedText}
                  onChange={(e) =>
                    setEditingDoc({
                      ...editingDoc,
                      extractedText: e.target.value,
                    })
                  }
                  className="min-h-32"
                />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setEditingDoc(null)}
              disabled={metaMutation.isPending}
            >
              Cancel
            </Button>
            <Button onClick={saveEditor} disabled={metaMutation.isPending}>
              {metaMutation.isPending ? "Saving..." : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <FilePreviewDialog
        open={previewFile !== null}
        onOpenChange={(o) => !o && setPreviewFile(null)}
        file={previewFile}
        getUrl={(key) => getStorageFileUrl({ data: key })}
        getText={(key) => getStorageFileText({ data: key })}
      />

      {conflict && (
        <AlertDialog open onOpenChange={() => {}}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>A file with this name exists</AlertDialogTitle>
              <AlertDialogDescription>
                "{conflict.file.name}" already exists in the {uploadFolder}{" "}
                folder. Replace the existing file, upload this as a separate
                copy, or skip it?
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter className="flex-wrap gap-2 sm:justify-end">
              <Button
                variant="ghost"
                onClick={() => conflictResolverRef.current?.("skip")}
              >
                Skip
              </Button>
              <Button
                variant="outline"
                onClick={() => conflictResolverRef.current?.("copy")}
              >
                Upload as copy
              </Button>
              <AlertDialogAction
                onClick={() => conflictResolverRef.current?.("replace")}
              >
                Replace
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}

      {duplicatesOpen && (
        <Dialog
          open
          onOpenChange={(o) => {
            if (!o) {
              setDuplicatesOpen(false);
              setDuplicateSelection(new Set());
            }
          }}
        >
          <DialogContent className="sm:max-w-2xl">
            <DialogHeader>
              <DialogTitle>Duplicate files</DialogTitle>
              <DialogDescription>
                Files sharing the same name within the same folder. Review and
                delete the older copies you don't need.
              </DialogDescription>
            </DialogHeader>
            <div className="max-h-[60vh] overflow-y-auto">
              {duplicatesLoading ? (
                <div className="flex flex-col gap-2">
                  <Skeleton className="h-16 w-full" />
                  <Skeleton className="h-16 w-full" />
                </div>
              ) : !duplicateGroups || duplicateGroups.length === 0 ? (
                <p className="text-sm text-muted-foreground py-6 text-center">
                  No duplicate files found.
                </p>
              ) : (
                <div className="flex flex-col gap-4">
                  {duplicateGroups.map((group) => (
                    <div
                      key={`${group.folder}::${group.fileName}`}
                      className="rounded-md border p-3"
                    >
                      <p className="text-sm font-medium mb-2">
                        {group.fileName}{" "}
                        <span className="text-xs text-muted-foreground">
                          in {group.folder} · {group.files.length} copies
                        </span>
                      </p>
                      <div className="flex flex-col gap-1.5">
                        {group.files.map((f, i) => (
                          <div
                            key={f.key}
                            className="flex items-center gap-2 text-xs"
                          >
                            <Checkbox
                              id={`dup-${f.key}`}
                              checked={duplicateSelection.has(f.key)}
                              onCheckedChange={() => {
                                setDuplicateSelection((prev) => {
                                  const next = new Set(prev);
                                  if (next.has(f.key)) next.delete(f.key);
                                  else next.add(f.key);
                                  return next;
                                });
                              }}
                            />
                            <label htmlFor={`dup-${f.key}`}>
                              {new Date(f.createdAt).toLocaleString()} ·{" "}
                              {formatSize(f.size)}
                              {i === 0 ? " · newest" : ""}
                            </label>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => {
                  setDuplicatesOpen(false);
                  setDuplicateSelection(new Set());
                }}
              >
                Close
              </Button>
              <Button
                variant="destructive"
                disabled={
                  duplicateSelection.size === 0 ||
                  deleteDuplicatesMutation.isPending
                }
                onClick={() => {
                  const targets = (duplicateGroups ?? [])
                    .flatMap((g) => g.files)
                    .filter((f) => duplicateSelection.has(f.key))
                    .map((f) => ({ id: f.id, key: f.key }));
                  deleteDuplicatesMutation.mutate(targets);
                }}
              >
                <Trash2 className="size-4" />
                Delete selected ({duplicateSelection.size})
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
