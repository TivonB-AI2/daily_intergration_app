import { Link, createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import {
  AlertCircle,
  ArrowUpDown,
  Ban,
  CalendarIcon,
  CalendarPlus,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Circle,
  CircleDashed,
  CornerDownRight,
  Filter,
  Link2,
  ListChecks,
  ListTodo,
  Plus,
  RotateCcw,
  Trash2,
  XCircle,
} from "lucide-react";
import { useCapabilities } from "@/hooks/useCapabilities";
import {
  listTodos,
  createTodo,
  updateTodoStatus,
  updateTodoChangelogLink,
  deleteTodo,
} from "@/services/db/todoService";
import { listChangelogEntries } from "@/services/db/changelogService";
import { useActivityLog } from "@/hooks/useActivityLog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Checkbox } from "@/components/ui/checkbox";
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
  EmptyMedia,
  EmptyTitle,
  EmptyDescription,
} from "@/components/ui/empty";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_protected/todo")({
  component: TodoPage,
});

type Status = "pending" | "in_progress" | "done" | "cancelled";
type Priority = "low" | "medium" | "high";

type Todo = {
  id: number;
  title: string;
  description: string | null;
  solution: string | null;
  status: Status;
  priority: Priority;
  dueDate: string | null;
  changelogEntryId?: number | null;
  parentId?: number | null;
  createdAt: string;
  completedAt?: string | null;
  updatedAt?: string;
};

const STORAGE_KEY = "todo-fallback-v1";

const STATUS_LABEL: Record<Status, string> = {
  pending: "Pending",
  in_progress: "In Progress",
  done: "Done",
  cancelled: "Cancelled",
};

// The status-icon click still only cycles through the three "active" states
// — cancelling is a deliberate separate action (see the Cancel button on
// each card), not something you'd want to land on accidentally while
// cycling through. Clicking the icon on an already-cancelled task reopens
// it back to Pending instead.
const NEXT_STATUS: Record<Status, Status> = {
  pending: "in_progress",
  in_progress: "done",
  done: "pending",
  cancelled: "pending",
};

const PRIORITY_VARIANT: Record<
  Priority,
  "destructive" | "secondary" | "outline"
> = {
  high: "destructive",
  medium: "secondary",
  low: "outline",
};

const PRIORITY_BAR: Record<Priority, string> = {
  high: "bg-destructive",
  medium: "bg-primary",
  low: "bg-border",
};

const STATUS_ICON: Record<Status, typeof Circle> = {
  pending: Circle,
  in_progress: CircleDashed,
  done: CheckCircle2,
  cancelled: XCircle,
};

const STATUS_ICON_CLASS: Record<Status, string> = {
  pending: "text-muted-foreground",
  in_progress: "text-primary",
  done: "text-primary",
  cancelled: "text-muted-foreground",
};

const FILTERS: { key: "all" | Status; label: string }[] = [
  { key: "all", label: "All" },
  { key: "pending", label: "Pending" },
  { key: "in_progress", label: "In Progress" },
  { key: "done", label: "Done" },
  { key: "cancelled", label: "Cancelled" },
];

const PRIORITY_FILTERS: { key: "all" | Priority; label: string }[] = [
  { key: "all", label: "All priorities" },
  { key: "high", label: "High" },
  { key: "medium", label: "Medium" },
  { key: "low", label: "Low" },
];

type SortKey = "created_desc" | "created_asc" | "due_asc" | "priority_desc";

const SORT_OPTIONS: { key: SortKey; label: string }[] = [
  { key: "created_desc", label: "Newest first" },
  { key: "created_asc", label: "Oldest first" },
  { key: "due_asc", label: "Due date" },
  { key: "priority_desc", label: "Priority (high first)" },
];

const PRIORITY_ORDER: Record<Priority, number> = { high: 0, medium: 1, low: 2 };

function sortTodos(list: Todo[], sortBy: SortKey): Todo[] {
  const sorted = [...list];
  sorted.sort((a, b) => {
    switch (sortBy) {
      case "due_asc": {
        if (!a.dueDate && !b.dueDate) return 0;
        if (!a.dueDate) return 1;
        if (!b.dueDate) return -1;
        return new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime();
      }
      case "priority_desc":
        return PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority];
      case "created_asc":
        return (
          new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
        );
      default:
        return (
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
        );
    }
  });
  return sorted;
}

/** Inclusive day-level range check: `from`/`to` are "YYYY-MM-DD" strings from
 * a date input; empty means unbounded on that side. */
function isWithinDateRange(
  value: string | null | undefined,
  from: string,
  to: string,
): boolean {
  if (!from && !to) return true;
  if (!value) return false;
  const day = new Date(value).toISOString().slice(0, 10);
  if (from && day < from) return false;
  if (to && day > to) return false;
  return true;
}

function isOverdue(todo: { dueDate: string | null; status: Status }) {
  if (!todo.dueDate || todo.status === "done" || todo.status === "cancelled")
    return false;
  const due = new Date(todo.dueDate);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return due < today;
}

function loadLocalTodos(): Todo[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as Todo[];
  } catch {
    return [];
  }
}

function saveLocalTodos(todos: Todo[]) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(todos));
}

function TodoPage() {
  const { data: caps, isLoading: capsLoading } = useCapabilities();
  const dbEnabled = caps?.databaseEnabled === true;
  const queryClient = useQueryClient();
  const { logAudit } = useActivityLog();

  // ---- DB mode ----
  const { data: dbTodos, isLoading: dbLoading } = useQuery({
    queryKey: ["todos"],
    queryFn: () => listTodos(),
    enabled: dbEnabled,
    staleTime: 30_000,
  });

  const { data: changelogEntries } = useQuery({
    queryKey: ["changelogEntries"],
    queryFn: () => listChangelogEntries(),
    enabled: dbEnabled,
    staleTime: 30_000,
  });

  const linkMutation = useMutation({
    mutationFn: (input: { id: number; changelogEntryId: number | null }) =>
      updateTodoChangelogLink({ data: input }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["todos"] });
    },
  });

  const createMutation = useMutation({
    mutationFn: (input: {
      title: string;
      description?: string;
      solution?: string;
      priority?: Priority;
      dueDate?: string;
      parentId?: number | null;
    }) => createTodo({ data: input }),
    onSuccess: (row) => {
      queryClient.invalidateQueries({ queryKey: ["todos"] });
      logAudit({
        action: "Created task",
        resource: row?.title ?? "task",
        page: "/todo",
        category: "todo",
      });
    },
  });

  const statusMutation = useMutation({
    mutationFn: (input: { id: number; status: Status }) =>
      updateTodoStatus({ data: input }),
    onSuccess: (row) => {
      queryClient.invalidateQueries({ queryKey: ["todos"] });
      logAudit({
        action: "Updated task status",
        resource: row?.title ?? "task",
        page: "/todo",
        category: "todo",
      });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (input: { id: number; title: string }) =>
      deleteTodo({ data: input.id }),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["todos"] });
      logAudit({
        action: "Deleted task",
        resource: variables.title,
        page: "/todo",
        category: "todo",
      });
    },
  });

  // ---- Local fallback mode ----
  const [localTodos, setLocalTodos] = useState<Todo[]>([]);
  const [localLoaded, setLocalLoaded] = useState(false);

  useEffect(() => {
    if (!dbEnabled) {
      setLocalTodos(loadLocalTodos());
      setLocalLoaded(true);
    }
  }, [dbEnabled]);

  // ---- Common form state ----
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [solution, setSolution] = useState("");
  const [priority, setPriority] = useState<Priority>("medium");
  const [dueDate, setDueDate] = useState("");
  const [parentId, setParentId] = useState<number | null>(null);
  const [filter, setFilter] = useState<"all" | Status>("all");
  const [priorityFilter, setPriorityFilter] = useState<"all" | Priority>("all");
  const [sortBy, setSortBy] = useState<SortKey>("created_desc");
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());

  function toggleSelectOne(id: number) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function exitSelectMode() {
    setSelectMode(false);
    setSelectedIds(new Set());
  }

  function bulkSetStatus(status: Status) {
    for (const todo of visibleTodos) {
      if (selectedIds.has(todo.id) && todo.status !== status) {
        handleSetStatus(todo, status);
      }
    }
    exitSelectMode();
  }

  function bulkDelete() {
    for (const todo of visibleTodos) {
      if (selectedIds.has(todo.id)) handleDelete(todo);
    }
    exitSelectMode();
  }
  const [expanded, setExpanded] = useState<Record<number, boolean>>({});
  const [doneSectionOpen, setDoneSectionOpen] = useState(true);
  const [cancelledSectionOpen, setCancelledSectionOpen] = useState(false);
  const [createdFrom, setCreatedFrom] = useState("");
  const [createdTo, setCreatedTo] = useState("");
  const [completedFrom, setCompletedFrom] = useState("");
  const [completedTo, setCompletedTo] = useState("");

  const todos: Todo[] = useMemo(() => {
    if (dbEnabled) {
      return (dbTodos ?? []).map((t: any) => ({
        ...t,
        dueDate: t.dueDate ? String(t.dueDate) : null,
        createdAt: String(t.createdAt),
        completedAt: t.completedAt ? String(t.completedAt) : null,
      }));
    }
    return localTodos;
  }, [dbEnabled, dbTodos, localTodos]);

  // Priority + created/completed date filters apply on top of the status
  // filter below, then the result is sorted.
  const visibleTodos = useMemo(() => {
    const byPriority =
      priorityFilter === "all"
        ? todos
        : todos.filter((t) => t.priority === priorityFilter);
    const byDates = byPriority.filter(
      (t) =>
        isWithinDateRange(t.createdAt, createdFrom, createdTo) &&
        isWithinDateRange(t.completedAt, completedFrom, completedTo),
    );
    return sortTodos(byDates, sortBy);
  }, [
    todos,
    priorityFilter,
    createdFrom,
    createdTo,
    completedFrom,
    completedTo,
    sortBy,
  ]);

  const dateFiltersActive =
    !!createdFrom || !!createdTo || !!completedFrom || !!completedTo;

  function clearDateFilters() {
    setCreatedFrom("");
    setCreatedTo("");
    setCompletedFrom("");
    setCompletedTo("");
  }

  const counts = useMemo(() => {
    return {
      all: visibleTodos.length,
      pending: visibleTodos.filter((t) => t.status === "pending").length,
      in_progress: visibleTodos.filter((t) => t.status === "in_progress")
        .length,
      done: visibleTodos.filter((t) => t.status === "done").length,
      cancelled: visibleTodos.filter((t) => t.status === "cancelled").length,
    };
  }, [visibleTodos]);

  const topLevelTodos = useMemo(
    () => todos.filter((t) => !t.parentId),
    [todos],
  );

  const todoById = useMemo(() => {
    const map = new Map<number, Todo>();
    for (const t of todos) map.set(t.id, t);
    return map;
  }, [todos]);

  // Order parent issues immediately followed by their sub-issues so the
  // hierarchy reads top-to-bottom, instead of interleaved by created_at.
  // Also splits into an Open section (top) and a collapsible Done section
  // (bottom) when showing "All", so open work always stays at the top.
  const { filteredTodos, openTodos, doneTodos, cancelledTodos } =
    useMemo(() => {
      function orderWithSubIssues(base: Todo[]) {
        const byParent = new Map<number, Todo[]>();
        const roots: Todo[] = [];
        for (const t of base) {
          if (t.parentId && todoById.has(t.parentId)) {
            byParent.set(t.parentId, [...(byParent.get(t.parentId) ?? []), t]);
          } else {
            roots.push(t);
          }
        }
        const ordered: Todo[] = [];
        for (const root of roots) {
          ordered.push(root);
          ordered.push(...(byParent.get(root.id) ?? []));
        }
        return ordered;
      }

      const base =
        filter === "all"
          ? visibleTodos
          : visibleTodos.filter((t) => t.status === filter);
      const filtered = orderWithSubIssues(base);

      if (filter !== "all") {
        return {
          filteredTodos: filtered,
          openTodos: filtered,
          doneTodos: [],
          cancelledTodos: [],
        };
      }
      return {
        filteredTodos: filtered,
        openTodos: orderWithSubIssues(
          visibleTodos.filter(
            (t) => t.status !== "done" && t.status !== "cancelled",
          ),
        ),
        doneTodos: orderWithSubIssues(
          visibleTodos.filter((t) => t.status === "done"),
        ),
        cancelledTodos: orderWithSubIssues(
          visibleTodos.filter((t) => t.status === "cancelled"),
        ),
      };
    }, [visibleTodos, filter, todoById]);

  const isLoading = capsLoading || (dbEnabled ? dbLoading : !localLoaded);

  function resetForm() {
    setTitle("");
    setDescription("");
    setSolution("");
    setPriority("medium");
    setDueDate("");
    setParentId(null);
  }

  function handleCreate() {
    if (!title.trim()) return;
    if (dbEnabled) {
      createMutation.mutate({
        title: title.trim(),
        description: description.trim() || undefined,
        solution: solution.trim() || undefined,
        priority,
        dueDate: dueDate || undefined,
        parentId,
      });
      resetForm();
      return;
    }
    const newTodo: Todo = {
      id: Date.now(),
      title: title.trim(),
      description: description.trim() || null,
      solution: solution.trim() || null,
      status: "pending",
      priority,
      dueDate: dueDate || null,
      createdAt: new Date().toISOString(),
      completedAt: null,
    };
    const next = [newTodo, ...localTodos];
    setLocalTodos(next);
    saveLocalTodos(next);
    resetForm();
  }

  function handleCycleStatus(todo: Todo) {
    const nextStatus = NEXT_STATUS[todo.status];
    if (dbEnabled) {
      statusMutation.mutate({ id: todo.id, status: nextStatus });
      return;
    }
    const next = localTodos.map((t) =>
      t.id === todo.id
        ? {
            ...t,
            status: nextStatus,
            completedAt:
              nextStatus === "done" ? new Date().toISOString() : null,
          }
        : t,
    );
    setLocalTodos(next);
    saveLocalTodos(next);
  }

  function handleSetStatus(todo: Todo, status: Status) {
    if (dbEnabled) {
      statusMutation.mutate({ id: todo.id, status });
      return;
    }
    const next = localTodos.map((t) =>
      t.id === todo.id
        ? {
            ...t,
            status,
            completedAt: status === "done" ? new Date().toISOString() : null,
          }
        : t,
    );
    setLocalTodos(next);
    saveLocalTodos(next);
  }

  function handleCancel(todo: Todo) {
    handleSetStatus(todo, "cancelled");
  }

  function handleReopen(todo: Todo) {
    handleSetStatus(todo, "pending");
  }

  function handleDelete(todo: Todo) {
    if (dbEnabled) {
      deleteMutation.mutate({ id: todo.id, title: todo.title });
      return;
    }
    const next = localTodos.filter((t) => t.id !== todo.id);
    setLocalTodos(next);
    saveLocalTodos(next);
  }

  function toggleExpanded(id: number) {
    setExpanded((prev) => ({ ...prev, [id]: !prev[id] }));
  }

  if (isLoading) {
    return (
      <div className="flex flex-col gap-4 p-6">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-40 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6 p-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">To-Do</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Track and organize your tasks in one place.
          </p>
        </div>
        <Badge variant={dbEnabled ? "default" : "outline"}>
          {dbEnabled ? "Database" : "Local (offline)"}
        </Badge>
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Total Tasks</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold">{counts.all}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Pending</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold">{counts.pending}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>In Progress</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold">{counts.in_progress}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Completed</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold">{counts.done}</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">New Task</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-2">
              <Label htmlFor="todo-title">Title</Label>
              <Input
                id="todo-title"
                placeholder="Task title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="todo-due">Due date</Label>
              <div className="relative">
                <CalendarIcon className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="todo-due"
                  type="date"
                  className="pl-9"
                  value={dueDate}
                  onChange={(e) => setDueDate(e.target.value)}
                />
              </div>
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-2">
              <Label htmlFor="todo-description">Description</Label>
              <Textarea
                id="todo-description"
                placeholder="What's the task or issue?"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="todo-solution">Solution</Label>
              <Textarea
                id="todo-solution"
                placeholder="Optional — how it was or will be resolved"
                value={solution}
                onChange={(e) => setSolution(e.target.value)}
              />
            </div>
          </div>
          <div className="flex flex-wrap items-end gap-4">
            <div className="flex flex-col gap-2">
              <Label>Priority</Label>
              <Select
                value={priority}
                onValueChange={(v) => setPriority(v as Priority)}
              >
                <SelectTrigger className="w-40">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="low">Low</SelectItem>
                  <SelectItem value="medium">Medium</SelectItem>
                  <SelectItem value="high">High</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {dbEnabled && (
              <div className="flex flex-col gap-2">
                <Label>Parent task</Label>
                <Select
                  value={parentId ? String(parentId) : "none"}
                  onValueChange={(v) =>
                    setParentId(v === "none" ? null : Number(v))
                  }
                >
                  <SelectTrigger className="w-56">
                    <SelectValue placeholder="None (top-level)" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">None (top-level)</SelectItem>
                    {topLevelTodos.map((t) => (
                      <SelectItem key={t.id} value={String(t.id)}>
                        #{t.id} — {t.title}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            <Button
              onClick={handleCreate}
              disabled={!title.trim() || createMutation.isPending}
            >
              <Plus className="size-4" />
              Add Task
            </Button>
          </div>
        </CardContent>
      </Card>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          {FILTERS.map((f) => (
            <Button
              key={f.key}
              size="sm"
              variant={filter === f.key ? "default" : "outline"}
              onClick={() => setFilter(f.key)}
            >
              {f.label}
              <Badge
                variant={filter === f.key ? "secondary" : "outline"}
                className="ml-1"
              >
                {counts[f.key]}
              </Badge>
            </Button>
          ))}
          <Select
            value={priorityFilter}
            onValueChange={(v) => setPriorityFilter(v as "all" | Priority)}
          >
            <SelectTrigger size="sm" className="w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PRIORITY_FILTERS.map((p) => (
                <SelectItem key={p.key} value={p.key}>
                  {p.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={sortBy} onValueChange={(v) => setSortBy(v as SortKey)}>
            <SelectTrigger size="sm" className="w-44">
              <ArrowUpDown className="size-3.5" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {SORT_OPTIONS.map((s) => (
                <SelectItem key={s.key} value={s.key}>
                  {s.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Popover>
            <PopoverTrigger
              render={
                <Button
                  size="sm"
                  variant={dateFiltersActive ? "default" : "outline"}
                >
                  <Filter className="size-3.5" />
                  Date filters
                  {dateFiltersActive && (
                    <Badge variant="secondary" className="ml-1">
                      On
                    </Badge>
                  )}
                </Button>
              }
            />
            <PopoverContent className="w-80 space-y-4">
              <div className="space-y-2">
                <p className="flex items-center gap-1.5 text-sm font-medium">
                  <CalendarIcon className="size-3.5" />
                  Created date
                </p>
                <div className="flex items-center gap-2">
                  <Input
                    type="date"
                    value={createdFrom}
                    onChange={(e) => setCreatedFrom(e.target.value)}
                    aria-label="Created from"
                  />
                  <span className="text-muted-foreground text-xs">to</span>
                  <Input
                    type="date"
                    value={createdTo}
                    onChange={(e) => setCreatedTo(e.target.value)}
                    aria-label="Created to"
                  />
                </div>
              </div>
              <div className="space-y-2">
                <p className="flex items-center gap-1.5 text-sm font-medium">
                  <CalendarPlus className="size-3.5" />
                  Completed date
                </p>
                <div className="flex items-center gap-2">
                  <Input
                    type="date"
                    value={completedFrom}
                    onChange={(e) => setCompletedFrom(e.target.value)}
                    aria-label="Completed from"
                  />
                  <span className="text-muted-foreground text-xs">to</span>
                  <Input
                    type="date"
                    value={completedTo}
                    onChange={(e) => setCompletedTo(e.target.value)}
                    aria-label="Completed to"
                  />
                </div>
                <p className="text-muted-foreground text-xs">
                  Only tasks marked Done have a completed date.
                </p>
              </div>
              {dateFiltersActive && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="w-full"
                  onClick={clearDateFilters}
                >
                  Clear date filters
                </Button>
              )}
            </PopoverContent>
          </Popover>
        </div>
        <div className="flex items-center gap-3">
          {counts.all > 0 && (
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <ListChecks className="size-3.5" />
              {counts.done} of {counts.all} complete
            </div>
          )}
          {dbEnabled && counts.all > 0 && (
            <Button
              size="sm"
              variant={selectMode ? "default" : "outline"}
              onClick={() =>
                selectMode ? exitSelectMode() : setSelectMode(true)
              }
            >
              {selectMode ? "Cancel selection" : "Select"}
            </Button>
          )}
        </div>
      </div>

      {selectMode && selectedIds.size > 0 && (
        <div className="flex items-center gap-3 rounded-md border bg-muted/40 px-4 py-2.5">
          <span className="text-sm font-medium">
            {selectedIds.size} selected
          </span>
          <div className="flex items-center gap-2 ml-auto">
            <Button
              variant="outline"
              size="sm"
              onClick={() => bulkSetStatus("done")}
            >
              Mark Done
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => bulkSetStatus("cancelled")}
            >
              Cancel Tasks
            </Button>
            <AlertDialog>
              <AlertDialogTrigger
                render={
                  <Button variant="outline" size="sm">
                    <Trash2 className="size-4" />
                    Delete selected
                  </Button>
                }
              />
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>
                    Delete {selectedIds.size} task
                    {selectedIds.size === 1 ? "" : "s"}?
                  </AlertDialogTitle>
                  <AlertDialogDescription>
                    This will permanently delete the selected tasks. This action
                    cannot be undone.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction onClick={bulkDelete}>
                    Delete
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        </div>
      )}

      {filteredTodos.length === 0 ? (
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <ListTodo />
            </EmptyMedia>
            <EmptyTitle>No tasks</EmptyTitle>
            <EmptyDescription>
              {filter === "all"
                ? "Add your first task above to get started."
                : "No tasks match this filter."}
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : filter === "all" ? (
        <div className="flex flex-col gap-5">
          {openTodos.length > 0 ? (
            <div className="flex flex-col gap-3">
              {openTodos.map((todo) => renderTodoCard(todo))}
            </div>
          ) : (
            <Empty>
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <CheckCircle2 />
                </EmptyMedia>
                <EmptyTitle>Nothing open</EmptyTitle>
                <EmptyDescription>
                  All tasks are done — nice work.
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          )}

          {doneTodos.length > 0 && (
            <Collapsible
              open={doneSectionOpen}
              onOpenChange={setDoneSectionOpen}
            >
              <CollapsibleTrigger className="flex w-full items-center justify-between gap-2 rounded-md border-t pt-3 text-left transition-colors hover:text-foreground">
                <span className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                  <CheckCircle2 className="size-4" />
                  Done
                  <Badge variant="outline" className="text-[10px]">
                    {doneTodos.length}
                  </Badge>
                </span>
                {doneSectionOpen ? (
                  <ChevronUp className="size-4 text-muted-foreground" />
                ) : (
                  <ChevronDown className="size-4 text-muted-foreground" />
                )}
              </CollapsibleTrigger>
              <CollapsibleContent className="flex flex-col gap-3 pt-3">
                {doneTodos.map((todo) => renderTodoCard(todo))}
              </CollapsibleContent>
            </Collapsible>
          )}

          {cancelledTodos.length > 0 && (
            <Collapsible
              open={cancelledSectionOpen}
              onOpenChange={setCancelledSectionOpen}
            >
              <CollapsibleTrigger className="flex w-full items-center justify-between gap-2 rounded-md border-t pt-3 text-left transition-colors hover:text-foreground">
                <span className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                  <XCircle className="size-4" />
                  Cancelled
                  <Badge variant="outline" className="text-[10px]">
                    {cancelledTodos.length}
                  </Badge>
                </span>
                {cancelledSectionOpen ? (
                  <ChevronUp className="size-4 text-muted-foreground" />
                ) : (
                  <ChevronDown className="size-4 text-muted-foreground" />
                )}
              </CollapsibleTrigger>
              <CollapsibleContent className="flex flex-col gap-3 pt-3">
                {cancelledTodos.map((todo) => renderTodoCard(todo))}
              </CollapsibleContent>
            </Collapsible>
          )}
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {filteredTodos.map((todo) => renderTodoCard(todo))}
        </div>
      )}
    </div>
  );

  function renderTodoCard(todo: Todo) {
    const isExpanded = expanded[todo.id];
    const overdue = isOverdue(todo);
    const StatusIcon = STATUS_ICON[todo.status];
    const isDone = todo.status === "done";
    const parent = todo.parentId ? todoById.get(todo.parentId) : null;
    const isSubIssue = !!parent;
    return (
      <Card
        key={todo.id}
        className={cn(
          "flex-row overflow-hidden p-0 gap-0 transition-colors",
          isDone && "opacity-70",
          isSubIssue && "ml-8 border-dashed",
        )}
      >
        <div
          className={cn("w-1 shrink-0", PRIORITY_BAR[todo.priority])}
          aria-hidden
        />
        <CardContent className="flex flex-1 flex-col gap-2 py-3.5 pr-4 pl-3.5 min-w-0">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-start gap-2.5 min-w-0">
              {selectMode && (
                <Checkbox
                  className="mt-1"
                  checked={selectedIds.has(todo.id)}
                  onCheckedChange={() => toggleSelectOne(todo.id)}
                  aria-label={`Select task ${todo.title}`}
                />
              )}
              <button
                type="button"
                onClick={() => handleCycleStatus(todo)}
                aria-label={`Cycle status, currently ${STATUS_LABEL[todo.status]}`}
                className="mt-0.5 shrink-0 text-muted-foreground transition-colors hover:text-primary"
              >
                <StatusIcon
                  className={cn("size-5", STATUS_ICON_CLASS[todo.status])}
                />
              </button>
              <div className="flex flex-col gap-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span
                    className={cn(
                      "font-medium text-sm leading-snug break-words",
                      isDone && "line-through text-muted-foreground",
                    )}
                  >
                    {todo.title}
                  </span>
                  <Badge
                    variant="outline"
                    className="text-[10px] font-mono whitespace-nowrap"
                  >
                    #{todo.id}
                  </Badge>
                </div>
                <div className="flex flex-wrap items-center gap-1.5">
                  <Badge
                    variant={PRIORITY_VARIANT[todo.priority]}
                    className="text-[10px] capitalize"
                  >
                    {todo.priority}
                  </Badge>
                  <Badge variant="outline" className="text-[10px]">
                    {STATUS_LABEL[todo.status]}
                  </Badge>
                  {parent && (
                    <Badge variant="secondary" className="gap-1 text-[10px]">
                      <CornerDownRight className="size-3" />
                      Sub-issue of #{parent.id} {parent.title}
                    </Badge>
                  )}
                  {dbEnabled && todo.changelogEntryId && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-5 gap-1 px-1.5 text-[10px]"
                      render={<Link to="/changelog" />}
                    >
                      <Link2 className="size-3" />
                      View in Changelog
                    </Button>
                  )}
                  {todo.dueDate && (
                    <span
                      className={cn(
                        "flex items-center gap-1 text-xs",
                        overdue
                          ? "text-destructive font-medium"
                          : "text-muted-foreground",
                      )}
                    >
                      <CalendarIcon className="size-3" />
                      {overdue ? "Overdue" : "Due"}{" "}
                      {new Date(todo.dueDate).toLocaleDateString(undefined, {
                        month: "short",
                        day: "numeric",
                      })}
                      {overdue && <AlertCircle className="size-3" />}
                    </span>
                  )}
                  <span className="flex items-center gap-1 text-xs text-muted-foreground">
                    <CalendarIcon className="size-3" />
                    Created{" "}
                    {new Date(todo.createdAt).toLocaleDateString(undefined, {
                      month: "short",
                      day: "numeric",
                    })}
                  </span>
                  {todo.completedAt && (
                    <span className="flex items-center gap-1 text-xs text-muted-foreground">
                      <CalendarPlus className="size-3" />
                      Completed{" "}
                      {new Date(todo.completedAt).toLocaleDateString(
                        undefined,
                        { month: "short", day: "numeric" },
                      )}
                    </span>
                  )}
                </div>
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-1">
              {todo.status === "cancelled" ? (
                <Button
                  size="icon"
                  variant="ghost"
                  onClick={() => handleReopen(todo)}
                  aria-label="Reopen task"
                  className="text-muted-foreground hover:text-primary"
                >
                  <RotateCcw className="size-4" />
                </Button>
              ) : (
                todo.status !== "done" && (
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={() => handleCancel(todo)}
                    aria-label="Cancel task"
                    className="text-muted-foreground hover:text-destructive"
                  >
                    <Ban className="size-4" />
                  </Button>
                )
              )}
              <Button
                size="icon"
                variant="ghost"
                onClick={() => handleDelete(todo)}
                aria-label="Delete task"
                className="text-muted-foreground hover:text-destructive"
              >
                <Trash2 className="size-4" />
              </Button>
            </div>
          </div>
          {(todo.description || todo.solution || dbEnabled) && (
            <Collapsible
              open={isExpanded}
              onOpenChange={() => toggleExpanded(todo.id)}
            >
              <CollapsibleTrigger className="ml-[30px] flex h-auto w-fit items-center gap-1 px-0 text-xs text-muted-foreground transition-colors hover:text-foreground">
                {isExpanded ? (
                  <>
                    Hide details <ChevronUp className="size-3.5" />
                  </>
                ) : (
                  <>
                    Show details <ChevronDown className="size-3.5" />
                  </>
                )}
              </CollapsibleTrigger>
              <CollapsibleContent className="ml-[30px] flex flex-col gap-3">
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="flex flex-col gap-1">
                    <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground/80">
                      Description
                    </p>
                    <p className="text-sm leading-relaxed text-muted-foreground">
                      {todo.description || (
                        <span className="italic">None provided</span>
                      )}
                    </p>
                  </div>
                  <div className="flex flex-col gap-1 sm:border-l sm:pl-3">
                    <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground/80">
                      Solution
                    </p>
                    <p className="text-sm leading-relaxed text-muted-foreground">
                      {todo.solution || (
                        <span className="italic">None yet</span>
                      )}
                    </p>
                  </div>
                </div>
                {dbEnabled && (
                  <div className="flex flex-col gap-1.5 border-t pt-3">
                    <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground/80">
                      Changelog Link
                    </p>
                    <Select
                      value={String(todo.changelogEntryId ?? "none")}
                      onValueChange={(v) =>
                        linkMutation.mutate({
                          id: todo.id,
                          changelogEntryId: v === "none" ? null : Number(v),
                        })
                      }
                    >
                      <SelectTrigger className="h-8 w-full max-w-sm text-xs">
                        <SelectValue placeholder="Not linked" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">Not linked</SelectItem>
                        {(changelogEntries ?? []).map((entry) => (
                          <SelectItem key={entry.id} value={String(entry.id)}>
                            v{entry.version} — {entry.title}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
              </CollapsibleContent>
            </Collapsible>
          )}
        </CardContent>
      </Card>
    );
  }
}
