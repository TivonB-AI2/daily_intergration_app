import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Download, GripVertical, ImageIcon, Search } from "lucide-react";
import { useCapabilities } from "@/hooks/useCapabilities";
import {
  getThemeGalleryFileUrl,
  listThemeGalleryFiles,
  type ThemeGalleryFile,
} from "@/services/db/themeGalleryService";
import {
  listGalleryImageMeta,
  reorderGalleryImages,
  setGalleryImageCaption,
} from "@/services/db/galleryMetaService";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Card } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogFooter,
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
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";

export const Route = createFileRoute("/_protected/gallery")({
  component: GalleryPage,
});

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function GalleryThumbnail({
  file,
  caption,
  onOpen,
  draggable,
  onDragStart,
  onDragOver,
  onDrop,
  isDragTarget,
}: {
  file: ThemeGalleryFile;
  caption: string | null;
  onOpen: (file: ThemeGalleryFile, url: string) => void;
  draggable: boolean;
  onDragStart: () => void;
  onDragOver: (e: React.DragEvent) => void;
  onDrop: () => void;
  isDragTarget: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setIsVisible(true);
        }
      },
      { rootMargin: "100px" },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const { data } = useQuery({
    queryKey: ["themeGalleryFileUrl", file.key],
    queryFn: () => getThemeGalleryFileUrl({ data: file.key }),
    enabled: isVisible,
    staleTime: 1000 * 60 * 55,
  });

  return (
    <div
      ref={ref}
      draggable={draggable}
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDrop={onDrop}
      className={isDragTarget ? "ring-2 ring-primary rounded-lg" : undefined}
    >
      <Card
        className="aspect-square overflow-hidden p-0 cursor-pointer relative group"
        onClick={() => data?.url && onOpen(file, data.url)}
      >
        {data?.url ? (
          <img
            src={data.url}
            alt={file.fileName}
            loading="lazy"
            className="object-cover w-full h-full"
          />
        ) : (
          <Skeleton className="w-full h-full rounded-none" />
        )}
        {draggable && (
          <div className="absolute top-1 left-1 rounded bg-background/80 p-1 opacity-0 group-hover:opacity-100 cursor-grab">
            <GripVertical className="size-3.5" />
          </div>
        )}
        {caption && (
          <div className="absolute bottom-0 inset-x-0 bg-background/80 px-2 py-1 text-xs truncate">
            {caption}
          </div>
        )}
      </Card>
    </div>
  );
}

function GalleryPage() {
  const queryClient = useQueryClient();
  const { data: caps, isLoading: capsLoading } = useCapabilities();
  const enabled = caps?.s3Enabled === true;
  const dbEnabled = caps?.databaseEnabled === true;

  const [search, setSearch] = useState("");
  const [preview, setPreview] = useState<{
    file: ThemeGalleryFile;
    url: string;
  } | null>(null);
  const [captionDraft, setCaptionDraft] = useState("");
  const [dragKey, setDragKey] = useState<string | null>(null);
  const [dragOverKey, setDragOverKey] = useState<string | null>(null);

  const { data: files, isLoading: filesLoading } = useQuery({
    queryKey: ["themeGalleryFiles"],
    queryFn: () => listThemeGalleryFiles(),
    enabled,
    staleTime: 30_000,
  });

  const { data: metaRows } = useQuery({
    queryKey: ["galleryImageMeta"],
    queryFn: () => listGalleryImageMeta(),
    enabled: enabled && dbEnabled,
    staleTime: 30_000,
  });

  const metaByKey = new Map((metaRows ?? []).map((m) => [m.storageKey, m]));

  const captionMutation = useMutation({
    mutationFn: (input: { storageKey: string; caption: string }) =>
      setGalleryImageCaption({ data: input }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["galleryImageMeta"] });
      toast.success("Caption saved");
    },
    onError: () => toast.error("Failed to save caption"),
  });

  const reorderMutation = useMutation({
    mutationFn: (orderedKeys: string[]) =>
      reorderGalleryImages({ data: orderedKeys }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["galleryImageMeta"] });
    },
    onError: () => toast.error("Failed to save the new order"),
  });

  const images = files ?? [];
  const sortedImages = [...images].sort((a, b) => {
    const orderA = metaByKey.get(a.key)?.sortOrder ?? Number.MAX_SAFE_INTEGER;
    const orderB = metaByKey.get(b.key)?.sortOrder ?? Number.MAX_SAFE_INTEGER;
    if (orderA !== orderB) return orderA - orderB;
    return a.fileName.localeCompare(b.fileName);
  });
  const filtered = sortedImages.filter((f) =>
    f.fileName.toLowerCase().includes(search.toLowerCase()),
  );

  function handleDrop(targetKey: string) {
    if (!dragKey || dragKey === targetKey) {
      setDragKey(null);
      setDragOverKey(null);
      return;
    }
    const keys = filtered.map((f) => f.key);
    const fromIdx = keys.indexOf(dragKey);
    const toIdx = keys.indexOf(targetKey);
    if (fromIdx === -1 || toIdx === -1) return;
    const next = [...keys];
    next.splice(fromIdx, 1);
    next.splice(toIdx, 0, dragKey);
    setDragKey(null);
    setDragOverKey(null);
    reorderMutation.mutate(next);
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
        <Alert>
          <ImageIcon className="h-4 w-4" />
          <AlertTitle>Image Gallery unavailable</AlertTitle>
          <AlertDescription>
            This page requires file storage to be configured.
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">Image Gallery</h1>
        <p className="text-muted-foreground text-sm">
          Browse the images and GIFs in your theme asset library.
          {dbEnabled &&
            " Drag a thumbnail to reorder it, or open an image to add a caption."}
        </p>
      </div>

      <div className="relative w-full sm:max-w-xs">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search images..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-8"
        />
      </div>

      {filesLoading ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
          {Array.from({ length: 10 }).map((_, i) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: static skeleton grid
            <Skeleton key={i} className="aspect-square w-full" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <ImageIcon />
            </EmptyMedia>
            <EmptyTitle>No images found</EmptyTitle>
            <EmptyDescription>
              {images.length === 0
                ? "No images are in the theme asset library yet."
                : "No images match your search."}
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
          {filtered.map((file) => (
            <GalleryThumbnail
              key={file.key}
              file={file}
              caption={metaByKey.get(file.key)?.caption ?? null}
              onOpen={(f, url) => {
                setPreview({ file: f, url });
                setCaptionDraft(metaByKey.get(f.key)?.caption ?? "");
              }}
              draggable={dbEnabled}
              onDragStart={() => setDragKey(file.key)}
              onDragOver={(e) => {
                e.preventDefault();
                setDragOverKey(file.key);
              }}
              onDrop={() => handleDrop(file.key)}
              isDragTarget={dragOverKey === file.key && dragKey !== file.key}
            />
          ))}
        </div>
      )}

      <Dialog
        open={!!preview}
        onOpenChange={(open) => !open && setPreview(null)}
      >
        <DialogContent>
          {preview && (
            <>
              <DialogHeader>
                <DialogTitle>{preview.file.fileName}</DialogTitle>
              </DialogHeader>
              <div className="rounded-md overflow-hidden bg-muted">
                <img
                  src={preview.url}
                  alt={preview.file.fileName}
                  className="w-full max-h-[60vh] object-contain"
                />
              </div>
              <div className="text-sm text-muted-foreground space-y-1">
                <p>Size: {formatBytes(preview.file.size)}</p>
              </div>
              {dbEnabled && (
                <div className="flex items-center gap-2">
                  <Input
                    placeholder="Add a caption..."
                    value={captionDraft}
                    onChange={(e) => setCaptionDraft(e.target.value)}
                  />
                  <Button
                    variant="secondary"
                    disabled={captionMutation.isPending}
                    onClick={() =>
                      captionMutation.mutate({
                        storageKey: preview.file.key,
                        caption: captionDraft.trim(),
                      })
                    }
                  >
                    Save
                  </Button>
                </div>
              )}
              <DialogFooter>
                <Button
                  variant="outline"
                  onClick={() => window.open(preview.url, "_blank")}
                >
                  <Download className="h-4 w-4" />
                  Download
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
