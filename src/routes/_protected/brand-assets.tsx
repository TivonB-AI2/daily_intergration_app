import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import {
  BadgeCheck,
  Download,
  ImageIcon,
  Layers,
  Palette,
  Pencil,
  Plus,
  Tag,
  Trash2,
  Type,
} from "lucide-react";
import { useCapabilities } from "@/hooks/useCapabilities";
import { useActivityLog } from "@/hooks/useActivityLog";
import {
  listBrandAssets,
  createBrandAsset,
  updateBrandAsset,
  deleteBrandAsset,
  type BrandAssetCategory,
  type BrandAssetWithFile,
} from "@/services/db/brandAssetService";
import { getStorageFileUrl } from "@/services/db/storageService";
import {
  getActiveLogo,
  setActiveLogo,
  clearActiveLogo,
} from "@/services/db/brandingService";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
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
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
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
import {
  Empty,
  EmptyHeader,
  EmptyTitle,
  EmptyDescription,
  EmptyMedia,
} from "@/components/ui/empty";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";

export const Route = createFileRoute("/_protected/brand-assets")({
  component: BrandAssetsPage,
});

const CATEGORY_LABELS: Record<BrandAssetCategory, string> = {
  logo: "Logo",
  icon: "Icon",
  color_palette: "Color Palette",
  font: "Font",
  template: "Template",
  other: "Other",
};

const CATEGORY_ICONS: Record<BrandAssetCategory, typeof ImageIcon> = {
  logo: ImageIcon,
  icon: ImageIcon,
  color_palette: Palette,
  font: Type,
  template: Layers,
  other: Tag,
};

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function AssetThumbnail({ asset }: { asset: BrandAssetWithFile }) {
  const isImage = asset.contentType?.startsWith("image/") ?? false;
  const { data, isLoading } = useQuery({
    queryKey: ["brandAssetUrl", asset.fileKey],
    queryFn: () => getStorageFileUrl({ data: asset.fileKey }),
    enabled: isImage,
    staleTime: 1000 * 60 * 5,
  });

  if (isImage) {
    if (isLoading) {
      return <Skeleton className="h-32 w-full rounded-md" />;
    }
    if (data?.url) {
      return (
        <div className="relative h-32 w-full overflow-hidden rounded-md bg-muted">
          <img
            src={data.url}
            alt={asset.name}
            loading="lazy"
            decoding="async"
            className="h-full w-full object-contain"
          />
          <Badge className="absolute top-2 left-2 bg-black/60 text-white border-0">
            Image
          </Badge>
        </div>
      );
    }
  }
  const Icon = CATEGORY_ICONS[asset.category];
  return (
    <div className="h-32 w-full flex items-center justify-center bg-muted rounded-md">
      <Icon className="h-8 w-8 text-muted-foreground" />
    </div>
  );
}

function BrandAssetsPage() {
  const queryClient = useQueryClient();
  const { logAudit } = useActivityLog();
  const { data: caps, isLoading: capsLoading } = useCapabilities();
  const dbEnabled = caps?.databaseEnabled === true;
  const s3Enabled = caps?.s3Enabled === true;
  const ready = dbEnabled && s3Enabled;

  const [createOpen, setCreateOpen] = useState(false);
  const [editAsset, setEditAsset] = useState<BrandAssetWithFile | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [bulkTagInput, setBulkTagInput] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [search, setSearch] = useState("");

  const [file, setFile] = useState<File | null>(null);
  const [name, setName] = useState("");
  const [category, setCategory] = useState<BrandAssetCategory>("logo");
  const [version, setVersion] = useState("");
  const [tags, setTags] = useState("");
  const [notes, setNotes] = useState("");

  const [editName, setEditName] = useState("");
  const [editCategory, setEditCategory] = useState<BrandAssetCategory>("logo");
  const [editVersion, setEditVersion] = useState("");
  const [editTags, setEditTags] = useState("");
  const [editNotes, setEditNotes] = useState("");

  const { data: assets, isLoading: assetsLoading } = useQuery({
    queryKey: ["brandAssets"],
    queryFn: () => listBrandAssets(),
    enabled: ready,
    staleTime: 30_000,
  });

  const { data: activeLogo } = useQuery({
    queryKey: ["activeLogo"],
    queryFn: () => getActiveLogo(),
    enabled: ready,
    staleTime: 30_000,
  });

  const setActiveLogoMut = useMutation({
    mutationFn: (assetId: number) => setActiveLogo({ data: assetId }),
    onSuccess: (_, assetId) => {
      queryClient.invalidateQueries({ queryKey: ["activeLogo"] });
      const asset = (assets ?? []).find((a) => a.id === assetId);
      toast.success(
        asset
          ? `"${asset.name}" is now the app's active logo`
          : "Active logo updated",
      );
      if (asset) {
        logAudit({
          action: "Set active app logo",
          resource: asset.name,
          page: "/brand-assets",
          category: "brand_assets",
          status: "success",
        });
      }
    },
    onError: () => toast.error("Failed to set active logo"),
  });

  const clearActiveLogoMut = useMutation({
    mutationFn: () => clearActiveLogo(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["activeLogo"] });
      toast.success("Reverted to the default app icon");
      logAudit({
        action: "Cleared active app logo",
        resource: "App branding",
        page: "/brand-assets",
        category: "brand_assets",
        status: "success",
      });
    },
    onError: () => toast.error("Failed to clear active logo"),
  });

  const createMut = useMutation({
    mutationFn: (formData: FormData) => createBrandAsset({ data: formData }),
    onSuccess: (row) => {
      queryClient.invalidateQueries({ queryKey: ["brandAssets"] });
      toast.success(`"${row.name}" added to the library`);
      logAudit({
        action: "Uploaded brand asset",
        resource: row.name,
        page: "/brand-assets",
        category: "brand_assets",
        status: "success",
      });
      resetCreateForm();
      setCreateOpen(false);
    },
    onError: (error) => {
      toast.error(`Failed to upload: ${error.message}`);
    },
  });

  const updateMut = useMutation({
    mutationFn: (input: {
      id: number;
      name: string;
      category: BrandAssetCategory;
      version: string | null;
      notes: string | null;
      tags: string[] | null;
    }) => updateBrandAsset({ data: input }),
    onSuccess: (row) => {
      queryClient.invalidateQueries({ queryKey: ["brandAssets"] });
      toast.success(`"${row.name}" updated`);
      logAudit({
        action: "Updated brand asset",
        resource: row.name,
        page: "/brand-assets",
        category: "brand_assets",
        status: "success",
      });
      setEditAsset(null);
    },
    onError: () => toast.error("Failed to update asset"),
  });

  const deleteMut = useMutation({
    mutationFn: (asset: BrandAssetWithFile) =>
      deleteBrandAsset({
        data: { id: asset.id, storageFileId: asset.storageFileId },
      }),
    onSuccess: (_, asset) => {
      queryClient.invalidateQueries({ queryKey: ["brandAssets"] });
      toast.success(`"${asset.name}" deleted`);
      logAudit({
        action: "Deleted brand asset",
        resource: asset.name,
        page: "/brand-assets",
        category: "brand_assets",
        status: "success",
      });
    },
    onError: () => toast.error("Failed to delete asset"),
  });

  const bulkDeleteMut = useMutation({
    mutationFn: (targets: BrandAssetWithFile[]) =>
      Promise.all(
        targets.map((asset) =>
          deleteBrandAsset({
            data: { id: asset.id, storageFileId: asset.storageFileId },
          }),
        ),
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["brandAssets"] });
      toast.success("Selected assets deleted");
      setSelectedIds(new Set());
    },
    onError: () => toast.error("Failed to delete selected assets"),
  });

  const bulkTagMut = useMutation({
    mutationFn: (targets: BrandAssetWithFile[]) =>
      Promise.all(
        targets.map((asset) =>
          updateBrandAsset({
            data: {
              id: asset.id,
              name: asset.name,
              category: asset.category,
              version: asset.version,
              notes: asset.notes,
              tags: (asset.tags ?? []).includes(bulkTagInput.trim())
                ? (asset.tags ?? [])
                : [...(asset.tags ?? []), bulkTagInput.trim()],
            },
          }),
        ),
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["brandAssets"] });
      toast.success("Tag added to selected assets");
      setSelectedIds(new Set());
      setBulkTagInput("");
    },
    onError: () => toast.error("Failed to tag selected assets"),
  });

  function resetCreateForm() {
    setFile(null);
    setName("");
    setCategory("logo");
    setVersion("");
    setTags("");
    setNotes("");
  }

  function handleCreateSubmit() {
    if (!file) {
      toast.error("Please choose a file to upload");
      return;
    }
    if (!name.trim()) {
      toast.error("Please give the asset a name");
      return;
    }
    const formData = new FormData();
    formData.set("file", file);
    formData.set("name", name.trim());
    formData.set("category", category);
    formData.set("version", version.trim());
    formData.set("tags", tags);
    formData.set("notes", notes);
    createMut.mutate(formData);
  }

  function openEdit(asset: BrandAssetWithFile) {
    setEditAsset(asset);
    setEditName(asset.name);
    setEditCategory(asset.category);
    setEditVersion(asset.version ?? "");
    setEditTags((asset.tags ?? []).join(", "));
    setEditNotes(asset.notes ?? "");
  }

  function handleEditSubmit() {
    if (!editAsset) return;
    if (!editName.trim()) {
      toast.error("Please give the asset a name");
      return;
    }
    updateMut.mutate({
      id: editAsset.id,
      name: editName.trim(),
      category: editCategory,
      version: editVersion.trim() || null,
      notes: editNotes.trim() || null,
      tags: editTags
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean),
    });
  }

  async function handleDownload(asset: BrandAssetWithFile) {
    const { url } = await getStorageFileUrl({ data: asset.fileKey });
    window.open(url, "_blank");
  }

  const filteredAssets = (assets ?? []).filter((a) => {
    if (categoryFilter !== "all" && a.category !== categoryFilter) return false;
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      const matchesName = a.name.toLowerCase().includes(q);
      const matchesTag = (a.tags ?? []).some((t) =>
        t.toLowerCase().includes(q),
      );
      if (!matchesName && !matchesTag) return false;
    }
    return true;
  });

  if (capsLoading) {
    return (
      <div className="p-6 space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (!ready) {
    return (
      <div className="p-6">
        <Empty>
          <EmptyMedia>
            <Layers className="h-8 w-8" />
          </EmptyMedia>
          <EmptyHeader>
            <EmptyTitle>Not Fully Configured</EmptyTitle>
            <EmptyDescription>
              The Brand & Asset Library needs both the database and file storage
              enabled.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            Brand & Asset Library
          </h1>
          <p className="text-muted-foreground text-sm">
            Logos, icons, color palettes, fonts, and templates in one place
          </p>
        </div>
        <Dialog
          open={createOpen}
          onOpenChange={(open) => {
            setCreateOpen(open);
            if (!open) resetCreateForm();
          }}
        >
          <DialogTrigger render={<Button />}>
            <Plus className="h-4 w-4 mr-2" />
            Upload Asset
          </DialogTrigger>
          {createOpen && (
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Upload a brand asset</DialogTitle>
                <DialogDescription>
                  Add a file to the library with a name, category, and tags.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4">
                <div>
                  <Label>File *</Label>
                  <Input
                    type="file"
                    onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                  />
                </div>
                <div>
                  <Label>Name *</Label>
                  <Input
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="e.g. Primary Logo — Dark"
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>Category</Label>
                    <Select
                      value={category}
                      onValueChange={(v) =>
                        v && setCategory(v as BrandAssetCategory)
                      }
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {Object.entries(CATEGORY_LABELS).map(([k, label]) => (
                          <SelectItem key={k} value={k}>
                            {label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>Version (optional)</Label>
                    <Input
                      value={version}
                      onChange={(e) => setVersion(e.target.value)}
                      placeholder="e.g. v2.1"
                    />
                  </div>
                </div>
                <div>
                  <Label>Tags (comma separated, optional)</Label>
                  <Input
                    value={tags}
                    onChange={(e) => setTags(e.target.value)}
                    placeholder="e.g. dark-mode, social, print"
                  />
                </div>
                <div>
                  <Label>Usage notes (optional)</Label>
                  <Textarea
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="Where/how this asset should be used"
                    rows={3}
                  />
                </div>
              </div>
              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setCreateOpen(false)}
                >
                  Cancel
                </Button>
                <Button
                  type="button"
                  onClick={handleCreateSubmit}
                  disabled={createMut.isPending}
                >
                  {createMut.isPending ? "Uploading…" : "Upload"}
                </Button>
              </DialogFooter>
            </DialogContent>
          )}
        </Dialog>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by name or tag..."
          className="max-w-xs"
        />
        <Select
          value={categoryFilter}
          onValueChange={(v) => v && setCategoryFilter(v)}
        >
          <SelectTrigger className="w-48">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All categories</SelectItem>
            {Object.entries(CATEGORY_LABELS).map(([k, label]) => (
              <SelectItem key={k} value={k}>
                {label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {assetsLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-56 w-full" />
          ))}
        </div>
      ) : filteredAssets.length === 0 ? (
        <Empty>
          <EmptyMedia>
            <Layers className="h-8 w-8" />
          </EmptyMedia>
          <EmptyHeader>
            <EmptyTitle>No Assets Found</EmptyTitle>
            <EmptyDescription>
              {assets && assets.length > 0
                ? "Try a different search or category filter."
                : "Upload your first brand asset to get started."}
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <div className="flex flex-col gap-3">
          {selectedIds.size > 0 && (
            <div className="flex flex-wrap items-center gap-3 rounded-md border bg-muted/40 px-4 py-2.5">
              <span className="text-sm font-medium">
                {selectedIds.size} selected
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
                  disabled={!bulkTagInput.trim() || bulkTagMut.isPending}
                  onClick={() =>
                    bulkTagMut.mutate(
                      (assets ?? []).filter((a) => selectedIds.has(a.id)),
                    )
                  }
                >
                  <Pencil className="size-4" />
                  Add Tag
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
                        Delete {selectedIds.size} asset
                        {selectedIds.size === 1 ? "" : "s"}?
                      </AlertDialogTitle>
                      <AlertDialogDescription>
                        This permanently deletes the selected assets and their
                        files from storage. This action cannot be undone.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                      <AlertDialogAction
                        onClick={() =>
                          bulkDeleteMut.mutate(
                            (assets ?? []).filter((a) => selectedIds.has(a.id)),
                          )
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
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {filteredAssets.map((asset) => {
              const isActiveLogo = activeLogo?.assetId === asset.id;
              const canBeLogo =
                asset.category === "logo" &&
                (asset.contentType?.startsWith("image/") ?? false);
              return (
                <Card key={asset.id} className="p-3 space-y-3">
                  <div className="flex items-start justify-between">
                    <Checkbox
                      checked={selectedIds.has(asset.id)}
                      onCheckedChange={() => {
                        setSelectedIds((prev) => {
                          const next = new Set(prev);
                          if (next.has(asset.id)) next.delete(asset.id);
                          else next.add(asset.id);
                          return next;
                        });
                      }}
                      aria-label={`Select ${asset.name}`}
                    />
                  </div>
                  <AssetThumbnail asset={asset} />
                  <div>
                    <div className="flex items-start justify-between gap-2">
                      <p className="font-medium text-sm leading-tight">
                        {asset.name}
                      </p>
                      <Badge variant="secondary" className="shrink-0">
                        {CATEGORY_LABELS[asset.category]}
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">
                      {asset.version ? `${asset.version} · ` : ""}
                      {formatBytes(asset.size)}
                    </p>
                    {isActiveLogo && (
                      <Badge className="mt-2 gap-1 bg-primary/10 text-primary border-primary/30">
                        <BadgeCheck className="h-3 w-3" />
                        Active App Logo
                      </Badge>
                    )}
                    {asset.tags && asset.tags.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-2">
                        {asset.tags.map((t) => (
                          <Badge key={t} variant="outline" className="text-xs">
                            {t}
                          </Badge>
                        ))}
                      </div>
                    )}
                    {asset.notes && (
                      <p className="text-xs text-muted-foreground mt-2 line-clamp-2">
                        {asset.notes}
                      </p>
                    )}
                  </div>
                  {canBeLogo && (
                    <Button
                      variant={isActiveLogo ? "outline" : "secondary"}
                      size="sm"
                      className="w-full"
                      disabled={
                        setActiveLogoMut.isPending ||
                        clearActiveLogoMut.isPending
                      }
                      onClick={() =>
                        isActiveLogo
                          ? clearActiveLogoMut.mutate()
                          : setActiveLogoMut.mutate(asset.id)
                      }
                    >
                      <BadgeCheck className="h-4 w-4" />
                      {isActiveLogo
                        ? "Remove as active logo"
                        : "Set as active logo"}
                    </Button>
                  )}
                  <div className="flex items-center justify-end gap-1 pt-1 border-t">
                    <Button
                      variant="ghost"
                      size="icon"
                      title="Download"
                      onClick={() => handleDownload(asset)}
                    >
                      <Download className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      title="Edit"
                      onClick={() => openEdit(asset)}
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <AlertDialog>
                      <AlertDialogTrigger
                        render={
                          <Button variant="ghost" size="icon" title="Delete" />
                        }
                      >
                        <Trash2 className="h-4 w-4" />
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>
                            Delete this asset?
                          </AlertDialogTitle>
                          <AlertDialogDescription>
                            This permanently deletes "{asset.name}" and its file
                            from storage.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancel</AlertDialogCancel>
                          <AlertDialogAction
                            onClick={() => deleteMut.mutate(asset)}
                          >
                            Delete
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                </Card>
              );
            })}
          </div>
        </div>
      )}

      <Dialog
        open={!!editAsset}
        onOpenChange={(open) => !open && setEditAsset(null)}
      >
        {editAsset && (
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Edit asset</DialogTitle>
              <DialogDescription>
                Update metadata for "{editAsset.fileName}".
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label>Name *</Label>
                <Input
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Category</Label>
                  <Select
                    value={editCategory}
                    onValueChange={(v) =>
                      v && setEditCategory(v as BrandAssetCategory)
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {Object.entries(CATEGORY_LABELS).map(([k, label]) => (
                        <SelectItem key={k} value={k}>
                          {label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Version</Label>
                  <Input
                    value={editVersion}
                    onChange={(e) => setEditVersion(e.target.value)}
                  />
                </div>
              </div>
              <div>
                <Label>Tags (comma separated)</Label>
                <Input
                  value={editTags}
                  onChange={(e) => setEditTags(e.target.value)}
                />
              </div>
              <div>
                <Label>Usage notes</Label>
                <Textarea
                  value={editNotes}
                  onChange={(e) => setEditNotes(e.target.value)}
                  rows={3}
                />
              </div>
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setEditAsset(null)}
              >
                Cancel
              </Button>
              <Button
                type="button"
                onClick={handleEditSubmit}
                disabled={updateMut.isPending}
              >
                Save
              </Button>
            </DialogFooter>
          </DialogContent>
        )}
      </Dialog>
    </div>
  );
}
