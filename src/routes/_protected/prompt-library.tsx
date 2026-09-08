import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { BookText, Copy, Pencil, Plus, Search, Trash2 } from "lucide-react";
import { useCapabilities } from "@/hooks/useCapabilities";
import { useActivityLog } from "@/hooks/useActivityLog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  listSavedPrompts,
  createSavedPrompt,
  updateSavedPrompt,
  deleteSavedPrompt,
  type SavedPromptInput,
} from "@/services/db/promptLibraryService";

export const Route = createFileRoute("/_protected/prompt-library")({
  component: PromptLibraryPage,
});

const EMPTY_FORM: SavedPromptInput = {
  title: "",
  body: "",
  category: "",
  tags: [],
};

function PromptLibraryPage() {
  const { data: caps } = useCapabilities();
  const { logAudit } = useActivityLog();
  const queryClient = useQueryClient();
  const dbEnabled = caps?.databaseEnabled === true;

  const [search, setSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState<SavedPromptInput>(EMPTY_FORM);
  const [tagsInput, setTagsInput] = useState("");
  const [deleteId, setDeleteId] = useState<number | null>(null);

  const { data: prompts, isLoading } = useQuery({
    queryKey: ["savedPrompts"],
    queryFn: () => listSavedPrompts(),
    enabled: dbEnabled,
  });

  const createMutation = useMutation({
    mutationFn: (input: SavedPromptInput) => createSavedPrompt({ data: input }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["savedPrompts"] });
      toast.success("Prompt saved.");
      logAudit({
        action: "Created saved prompt",
        resource: form.title,
        page: "/prompt-library",
        category: "ai",
      });
    },
  });

  const updateMutation = useMutation({
    mutationFn: (input: { id: number } & SavedPromptInput) =>
      updateSavedPrompt({ data: input }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["savedPrompts"] });
      toast.success("Prompt updated.");
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => deleteSavedPrompt({ data: id }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["savedPrompts"] });
      toast.success("Prompt deleted.");
    },
  });

  const filtered = useMemo(() => {
    if (!prompts) return [];
    const term = search.trim().toLowerCase();
    if (!term) return prompts;
    return prompts.filter(
      (p) =>
        p.title.toLowerCase().includes(term) ||
        p.body.toLowerCase().includes(term) ||
        p.category?.toLowerCase().includes(term) ||
        p.tags?.some((t) => t.toLowerCase().includes(term)),
    );
  }, [prompts, search]);

  function openCreate() {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setTagsInput("");
    setDialogOpen(true);
  }

  function openEdit(p: {
    id: number;
    title: string;
    body: string;
    category: string | null;
    tags: string[] | null;
  }) {
    setEditingId(p.id);
    setForm({
      title: p.title,
      body: p.body,
      category: p.category ?? "",
      tags: p.tags ?? [],
    });
    setTagsInput((p.tags ?? []).join(", "));
    setDialogOpen(true);
  }

  function handleSubmit() {
    if (!form.title.trim() || !form.body.trim()) return;
    const tags = tagsInput
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean);
    const payload: SavedPromptInput = {
      title: form.title.trim(),
      body: form.body.trim(),
      category: form.category?.trim() || null,
      tags,
    };
    if (editingId !== null) {
      updateMutation.mutate({ id: editingId, ...payload });
    } else {
      createMutation.mutate(payload);
    }
    setDialogOpen(false);
  }

  function handleCopy(body: string) {
    navigator.clipboard.writeText(body);
    toast.success("Prompt copied to clipboard.");
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            Prompt Library
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Save, search, and reuse your favorite AI prompts.
          </p>
        </div>
        <Button onClick={openCreate} disabled={!dbEnabled}>
          <Plus />
          New Prompt
        </Button>
      </div>

      {!dbEnabled ? (
        <p className="text-sm text-muted-foreground">
          Database not configured — the Prompt Library isn't available.
        </p>
      ) : (
        <>
          <div className="relative max-w-sm">
            <Search className="absolute left-2.5 top-2.5 size-4 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by title, body, category, or tag..."
              className="pl-8"
            />
          </div>

          {isLoading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-40 w-full" />
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <Empty>
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <BookText />
                </EmptyMedia>
                <EmptyTitle>
                  {prompts && prompts.length > 0
                    ? "No matches"
                    : "No prompts yet"}
                </EmptyTitle>
                <EmptyDescription>
                  {prompts && prompts.length > 0
                    ? "Try a different search term."
                    : "Save your first prompt to build your library."}
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {filtered.map((p) => (
                <Card key={p.id} className="flex flex-col">
                  <CardHeader>
                    <CardTitle className="text-base flex items-center justify-between gap-2">
                      <span className="truncate">{p.title}</span>
                    </CardTitle>
                    {p.category && (
                      <Badge variant="secondary" className="self-start">
                        {p.category}
                      </Badge>
                    )}
                  </CardHeader>
                  <CardContent className="flex flex-col gap-3 flex-1">
                    <p className="text-sm text-muted-foreground line-clamp-4 whitespace-pre-wrap">
                      {p.body}
                    </p>
                    {p.tags && p.tags.length > 0 && (
                      <div className="flex flex-wrap gap-1">
                        {p.tags.map((t) => (
                          <Badge key={t} variant="outline" className="text-xs">
                            {t}
                          </Badge>
                        ))}
                      </div>
                    )}
                    <div className="flex items-center gap-1.5 mt-auto pt-1">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleCopy(p.body)}
                      >
                        <Copy className="size-3.5" />
                        Copy
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => openEdit(p)}
                      >
                        <Pencil className="size-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setDeleteId(p.id)}
                      >
                        <Trash2 className="size-3.5" />
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </>
      )}

      {dialogOpen && (
        <Dialog
          open
          onOpenChange={(next) => {
            if (!next) setDialogOpen(false);
          }}
        >
          <DialogContent>
            <DialogHeader>
              <DialogTitle>
                {editingId !== null ? "Edit Prompt" : "New Prompt"}
              </DialogTitle>
            </DialogHeader>
            <div className="flex flex-col gap-4">
              <div className="flex flex-col gap-1.5">
                <Label>Title</Label>
                <Input
                  value={form.title}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, title: e.target.value }))
                  }
                  placeholder="e.g. Blog post outline"
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label>Prompt</Label>
                <Textarea
                  value={form.body}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, body: e.target.value }))
                  }
                  placeholder="Write the prompt text..."
                  className="min-h-32 font-mono text-sm"
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label>Category (optional)</Label>
                <Input
                  value={form.category ?? ""}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, category: e.target.value }))
                  }
                  placeholder="e.g. Marketing, Support, Code"
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label>Tags (comma separated, optional)</Label>
                <Input
                  value={tagsInput}
                  onChange={(e) => setTagsInput(e.target.value)}
                  placeholder="e.g. email, tone, short"
                />
              </div>
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setDialogOpen(false)}
              >
                Cancel
              </Button>
              <Button
                type="button"
                onClick={handleSubmit}
                disabled={!form.title.trim() || !form.body.trim()}
              >
                {editingId !== null ? "Save Changes" : "Save Prompt"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      <AlertDialog
        open={deleteId !== null}
        onOpenChange={(open) => !open && setDeleteId(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete prompt?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently remove this saved prompt.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (deleteId !== null) deleteMutation.mutate(deleteId);
                setDeleteId(null);
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
