import { Link, createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { AlertCircle, Link2, ListFilter, Plus, Trash2 } from "lucide-react";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { useCapabilities } from "@/hooks/useCapabilities";
import {
  createChangelogEntry,
  deleteChangelogEntry,
  listChangelogEntries,
} from "@/services/db/changelogService";
import { listTodos } from "@/services/db/todoService";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
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
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export const Route = createFileRoute("/_protected/changelog")({
  component: ChangelogPage,
});

type ChangelogType =
  | "feature"
  | "fix"
  | "improvement"
  | "breaking"
  | "security";

const TYPE_LABELS: Record<ChangelogType, string> = {
  feature: "Feature",
  fix: "Fix",
  improvement: "Improvement",
  breaking: "Breaking",
  security: "Security",
};

const TYPE_VARIANTS: Record<
  ChangelogType,
  "default" | "destructive" | "secondary" | "outline"
> = {
  feature: "default",
  fix: "destructive",
  improvement: "secondary",
  breaking: "destructive",
  security: "outline",
};

function todayISODate() {
  return new Date().toISOString().slice(0, 10);
}

function ChangelogPage() {
  const queryClient = useQueryClient();
  const { data: caps, isLoading: capsLoading } = useCapabilities();
  const [open, setOpen] = useState(false);
  const [version, setVersion] = useState("");
  const [type, setType] = useState<ChangelogType>("feature");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [releaseDate, setReleaseDate] = useState(todayISODate());
  const [typeFilter, setTypeFilter] = useState<ChangelogType[]>([]);

  const { data: entries, isLoading: entriesLoading } = useQuery({
    queryKey: ["changelog"],
    queryFn: () => listChangelogEntries(),
    enabled: caps?.databaseEnabled === true,
    staleTime: 30_000,
  });

  const { data: todos } = useQuery({
    queryKey: ["todos"],
    queryFn: () => listTodos(),
    enabled: caps?.databaseEnabled === true,
    staleTime: 30_000,
  });

  const createMut = useMutation({
    mutationFn: () =>
      createChangelogEntry({
        data: {
          version,
          type,
          title,
          description: description || undefined,
          releaseDate,
        },
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["changelog"] });
      toast.success("Release added");
      setOpen(false);
      setVersion("");
      setType("feature");
      setTitle("");
      setDescription("");
      setReleaseDate(todayISODate());
    },
    onError: () => toast.error("Failed to add release"),
  });

  const deleteMut = useMutation({
    mutationFn: (id: number) => deleteChangelogEntry({ data: id }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["changelog"] });
      toast.success("Entry deleted");
    },
    onError: () => toast.error("Failed to delete entry"),
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
        <Alert>
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Database required</AlertTitle>
          <AlertDescription>
            The changelog requires a database connection to store release
            entries. Connect a database to use this page.
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  const allGroups: {
    version: string;
    releaseDate: string;
    entries: typeof entries;
  }[] = [];
  if (entries) {
    for (const entry of entries) {
      const existing = allGroups.find((g) => g.version === entry.version);
      if (existing) {
        existing.entries?.push(entry);
      } else {
        allGroups.push({
          version: entry.version,
          releaseDate: entry.releaseDate as unknown as string,
          entries: [entry],
        });
      }
    }
  }

  const groups =
    typeFilter.length === 0
      ? allGroups
      : allGroups
          .map((g) => ({
            ...g,
            entries: g.entries?.filter((e) =>
              typeFilter.includes(e.type as ChangelogType),
            ),
          }))
          .filter((g) => (g.entries?.length ?? 0) > 0);

  function scrollToVersion(version: string) {
    document
      .getElementById(`changelog-version-${version}`)
      ?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Changelog</h1>
          <p className="text-sm leading-relaxed text-muted-foreground">
            Track feature releases, fixes, and improvements over time.
          </p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger
            render={
              <Button>
                <Plus className="h-4 w-4" />
                Add Release
              </Button>
            }
          />
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Add Release</DialogTitle>
              <DialogDescription>
                Record a new version entry in the changelog.
              </DialogDescription>
            </DialogHeader>
            <form
              className="space-y-4"
              onSubmit={(e) => {
                e.preventDefault();
                createMut.mutate();
              }}
            >
              <div className="space-y-2">
                <Label htmlFor="version">Version</Label>
                <Input
                  id="version"
                  placeholder="1.2.0"
                  value={version}
                  onChange={(e) => setVersion(e.target.value)}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="type">Type</Label>
                <Select
                  value={type}
                  onValueChange={(v) => setType(v as ChangelogType)}
                >
                  <SelectTrigger id="type" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {(Object.keys(TYPE_LABELS) as ChangelogType[]).map((t) => (
                      <SelectItem key={t} value={t}>
                        {TYPE_LABELS[t]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="title">Title</Label>
                <Input
                  id="title"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="description">Description</Label>
                <Textarea
                  id="description"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="releaseDate">Release Date</Label>
                <Input
                  id="releaseDate"
                  type="date"
                  value={releaseDate}
                  onChange={(e) => setReleaseDate(e.target.value)}
                  required
                />
              </div>
              <DialogFooter>
                <Button
                  type="submit"
                  disabled={createMut.isPending || !version || !title}
                >
                  {createMut.isPending ? "Saving..." : "Save Release"}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {entriesLoading ? (
        <div className="space-y-4">
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-24 w-full" />
        </div>
      ) : !entries || entries.length === 0 ? (
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <AlertCircle className="h-6 w-6" />
            </EmptyMedia>
            <EmptyTitle>No releases yet</EmptyTitle>
            <EmptyDescription>
              Add your first release to start tracking the changelog.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <ListFilter className="h-4 w-4 text-muted-foreground" />
            <ToggleGroup
              value={typeFilter}
              onValueChange={(v) => setTypeFilter((v ?? []) as ChangelogType[])}
              className="flex-wrap"
            >
              {(Object.keys(TYPE_LABELS) as ChangelogType[]).map((t) => (
                <ToggleGroupItem key={t} value={t} className="px-3 text-sm">
                  {TYPE_LABELS[t]}
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
            {typeFilter.length > 0 && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setTypeFilter([])}
              >
                Clear
              </Button>
            )}
          </div>

          <div className="grid gap-6 lg:grid-cols-[1fr_180px]">
            <div className="space-y-10">
              {groups.length === 0 ? (
                <Empty>
                  <EmptyHeader>
                    <EmptyMedia variant="icon">
                      <ListFilter className="h-6 w-6" />
                    </EmptyMedia>
                    <EmptyTitle>No matching releases</EmptyTitle>
                    <EmptyDescription>
                      No entries match the selected type filters.
                    </EmptyDescription>
                  </EmptyHeader>
                </Empty>
              ) : (
                groups.map((group) => (
                  <div
                    key={group.version}
                    id={`changelog-version-${group.version}`}
                    className="relative pl-7 border-l-2 border-border"
                  >
                    <div className="absolute -left-[7px] top-1 h-3 w-3 rounded-full border-2 border-background bg-primary" />
                    <div className="flex items-baseline gap-2.5 mb-4">
                      <h2 className="text-xl font-semibold tracking-tight">
                        v{group.version}
                      </h2>
                      <span className="text-sm text-muted-foreground">
                        {new Date(group.releaseDate).toLocaleDateString(
                          undefined,
                          { year: "numeric", month: "long", day: "numeric" },
                        )}
                      </span>
                    </div>
                    <div className="space-y-3">
                      {group.entries?.map((entry) => (
                        <div
                          key={entry.id}
                          className="flex items-start justify-between gap-4 rounded-lg border bg-card p-4"
                        >
                          <div className="space-y-1.5">
                            <div className="flex flex-wrap items-center gap-2">
                              <Badge
                                variant={
                                  TYPE_VARIANTS[entry.type as ChangelogType]
                                }
                              >
                                {TYPE_LABELS[entry.type as ChangelogType]}
                              </Badge>
                              <span className="text-base font-medium leading-snug">
                                {entry.title}
                              </span>
                            </div>
                            {entry.description && (
                              <p className="text-sm leading-relaxed text-muted-foreground">
                                {entry.description}
                              </p>
                            )}
                            {(todos ?? []).some(
                              (t) => t.changelogEntryId === entry.id,
                            ) && (
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-7 gap-1 px-2 text-xs"
                                render={<Link to="/todo" />}
                              >
                                <Link2 className="h-3 w-3" />
                                View linked task
                              </Button>
                            )}
                          </div>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="shrink-0"
                            onClick={() => deleteMut.mutate(entry.id)}
                            disabled={deleteMut.isPending}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      ))}
                    </div>
                  </div>
                ))
              )}
            </div>

            <div className="hidden lg:block">
              <div className="sticky top-6 max-h-[80vh] space-y-0.5 overflow-y-auto rounded-lg border bg-card p-3">
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Jump to version
                </p>
                {groups.map((group) => (
                  <button
                    key={group.version}
                    type="button"
                    onClick={() => scrollToVersion(group.version)}
                    className="block w-full rounded-md px-2 py-1.5 text-left text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                  >
                    v{group.version}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
