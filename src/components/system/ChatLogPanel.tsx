import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import {
  Bot,
  ChevronDown,
  Download,
  MessageSquareText,
  Search,
  Trash2,
  User2,
} from "lucide-react";
import { useCapabilities } from "@/hooks/useCapabilities";
import {
  deleteAgentChatLog,
  listAgentChatLogs,
} from "@/services/db/agentChatLogService";
import { downloadCsv } from "@/lib/csvExport";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Empty,
  EmptyHeader,
  EmptyTitle,
  EmptyDescription,
  EmptyMedia,
} from "@/components/ui/empty";

const PAGE_SIZE = 10;

function formatTimestamp(date: string | Date) {
  return new Date(date).toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

function dayKey(date: string | Date) {
  return new Date(date).toISOString().slice(0, 10);
}

export function ChatLogPage() {
  const queryClient = useQueryClient();
  const { data: caps, isLoading: capsLoading } = useCapabilities();

  const [search, setSearch] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [page, setPage] = useState(1);
  const [openSessions, setOpenSessions] = useState<Set<string>>(new Set());

  const { data: entries, isLoading: entriesLoading } = useQuery({
    queryKey: ["agentChatLogs"],
    queryFn: () => listAgentChatLogs(),
    enabled: caps?.databaseEnabled === true,
    staleTime: 30_000,
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => deleteAgentChatLog({ data: id }),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ["agentChatLogs"] }),
  });

  const filteredEntries = useMemo(() => {
    if (!entries) return [];
    const term = search.trim().toLowerCase();
    return entries.filter((entry) => {
      if (term) {
        const haystack =
          `${entry.userQuery} ${entry.responseSummary} ${entry.sessionId}`.toLowerCase();
        if (!haystack.includes(term)) return false;
      }
      const created = new Date(entry.createdAt);
      if (fromDate && created < new Date(`${fromDate}T00:00:00`)) return false;
      if (toDate && created > new Date(`${toDate}T23:59:59`)) return false;
      return true;
    });
  }, [entries, search, fromDate, toDate]);

  const stats = useMemo(() => {
    const sessionIds = new Set(filteredEntries.map((e) => e.sessionId));
    const dayCounts = new Map<string, number>();
    for (const e of filteredEntries) {
      const key = dayKey(e.createdAt);
      dayCounts.set(key, (dayCounts.get(key) ?? 0) + 1);
    }
    let mostActiveDay: string | null = null;
    let mostActiveCount = 0;
    for (const [key, count] of dayCounts) {
      if (count > mostActiveCount) {
        mostActiveCount = count;
        mostActiveDay = key;
      }
    }
    return {
      total: filteredEntries.length,
      sessionCount: sessionIds.size,
      mostActiveDay,
      mostActiveCount,
    };
  }, [filteredEntries]);

  const sessionGroups = useMemo(() => {
    const map = new Map<string, typeof filteredEntries>();
    for (const entry of filteredEntries) {
      const list = map.get(entry.sessionId) ?? [];
      list.push(entry);
      map.set(entry.sessionId, list);
    }
    const groups = Array.from(map.entries()).map(([sessionId, items]) => ({
      sessionId,
      items,
      latestAt: items.reduce(
        (max, e) => Math.max(max, new Date(e.createdAt).getTime()),
        0,
      ),
    }));
    groups.sort((a, b) => b.latestAt - a.latestAt);
    return groups;
  }, [filteredEntries]);

  const totalPages = Math.max(1, Math.ceil(sessionGroups.length / PAGE_SIZE));
  const pagedGroups = sessionGroups.slice(
    (page - 1) * PAGE_SIZE,
    page * PAGE_SIZE,
  );

  function toggleSession(sessionId: string) {
    setOpenSessions((prev) => {
      const next = new Set(prev);
      if (next.has(sessionId)) next.delete(sessionId);
      else next.add(sessionId);
      return next;
    });
  }

  function handleExport() {
    downloadCsv(
      "chat-log",
      filteredEntries.map((e) => ({
        id: e.id,
        session_id: e.sessionId,
        created_at: new Date(e.createdAt).toISOString(),
        user_query: e.userQuery,
        response_summary: e.responseSummary,
      })),
    );
  }

  function updateFilter(fn: () => void) {
    fn();
    setPage(1);
  }

  if (capsLoading) {
    return (
      <div className="p-6 space-y-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  if (!caps?.databaseEnabled) {
    return (
      <div className="p-6">
        <p className="text-muted-foreground">Database not configured.</p>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight">Chat Log</h1>
          <p className="text-muted-foreground text-sm">
            A running record of what you've asked the AppGen assistant to do in
            this chat, a summary of what it did, and when.
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={handleExport}
          disabled={filteredEntries.length === 0}
        >
          <Download className="size-4" />
          Export CSV
        </Button>
      </div>

      {!entriesLoading && entries && entries.length > 0 && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <Card data-slot="card">
            <CardContent className="space-y-1 py-4">
              <p className="text-muted-foreground text-xs uppercase tracking-wide">
                Total entries
              </p>
              <p className="text-2xl font-semibold">{stats.total}</p>
            </CardContent>
          </Card>
          <Card data-slot="card">
            <CardContent className="space-y-1 py-4">
              <p className="text-muted-foreground text-xs uppercase tracking-wide">
                Sessions
              </p>
              <p className="text-2xl font-semibold">{stats.sessionCount}</p>
            </CardContent>
          </Card>
          <Card data-slot="card">
            <CardContent className="space-y-1 py-4">
              <p className="text-muted-foreground text-xs uppercase tracking-wide">
                Most active day
              </p>
              <p className="text-2xl font-semibold">
                {stats.mostActiveDay ?? "—"}
              </p>
              {stats.mostActiveDay && (
                <p className="text-muted-foreground text-xs">
                  {stats.mostActiveCount} entries
                </p>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative w-full max-w-xs">
          <Search className="text-muted-foreground absolute left-2.5 top-1/2 size-4 -translate-y-1/2" />
          <Input
            placeholder="Search query or summary..."
            className="pl-8"
            value={search}
            onChange={(e) => updateFilter(() => setSearch(e.target.value))}
          />
        </div>
        <Input
          type="date"
          className="w-40"
          value={fromDate}
          onChange={(e) => updateFilter(() => setFromDate(e.target.value))}
        />
        <span className="text-muted-foreground text-xs">to</span>
        <Input
          type="date"
          className="w-40"
          value={toDate}
          onChange={(e) => updateFilter(() => setToDate(e.target.value))}
        />
        {(search || fromDate || toDate) && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() =>
              updateFilter(() => {
                setSearch("");
                setFromDate("");
                setToDate("");
              })
            }
          >
            Clear filters
          </Button>
        )}
      </div>

      {entriesLoading ? (
        <div className="space-y-3">
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-24 w-full" />
        </div>
      ) : !entries || entries.length === 0 ? (
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <MessageSquareText />
            </EmptyMedia>
            <EmptyTitle>No chat entries yet</EmptyTitle>
            <EmptyDescription>
              Entries appear here automatically as you chat with the AppGen
              assistant.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : sessionGroups.length === 0 ? (
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <Search />
            </EmptyMedia>
            <EmptyTitle>No matching entries</EmptyTitle>
            <EmptyDescription>
              Try adjusting your search or date filters.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <div className="space-y-3">
          {pagedGroups.map((group) => {
            const isOpen = openSessions.has(group.sessionId);
            return (
              <Collapsible
                key={group.sessionId}
                open={isOpen}
                onOpenChange={() => toggleSession(group.sessionId)}
              >
                <div className="rounded-lg border">
                  <CollapsibleTrigger className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant="outline" className="font-mono text-xs">
                        Session: {group.sessionId}
                      </Badge>
                      <span className="text-muted-foreground text-xs">
                        {formatTimestamp(new Date(group.latestAt))}
                      </span>
                      <Badge variant="secondary" className="text-xs">
                        {group.items.length}{" "}
                        {group.items.length === 1 ? "entry" : "entries"}
                      </Badge>
                    </div>
                    <ChevronDown
                      className={`size-4 shrink-0 transition-transform ${isOpen ? "rotate-180" : ""}`}
                    />
                  </CollapsibleTrigger>
                  <CollapsibleContent className="space-y-3 border-t px-4 py-3">
                    {group.items.map((entry) => (
                      <Card key={entry.id} data-slot="card">
                        <CardContent className="space-y-3">
                          <div className="flex items-start justify-between gap-3">
                            <span className="text-muted-foreground text-xs">
                              {formatTimestamp(entry.createdAt)}
                            </span>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="text-muted-foreground hover:text-destructive size-7"
                              onClick={() => deleteMutation.mutate(entry.id)}
                              disabled={deleteMutation.isPending}
                              aria-label="Delete entry"
                            >
                              <Trash2 className="size-4" />
                            </Button>
                          </div>
                          <div className="rounded-md border border-blue-200 bg-blue-50 p-3 dark:border-blue-900 dark:bg-blue-950/40">
                            <p className="mb-1 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-blue-700 dark:text-blue-300">
                              <User2 className="size-3.5" />
                              Query
                            </p>
                            <p className="text-sm whitespace-pre-wrap text-blue-950 dark:text-blue-100">
                              {entry.userQuery}
                            </p>
                          </div>
                          <div className="rounded-md border border-emerald-200 bg-emerald-50 p-3 dark:border-emerald-900 dark:bg-emerald-950/40">
                            <p className="mb-1 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-emerald-700 dark:text-emerald-300">
                              <Bot className="size-3.5" />
                              Response summary
                            </p>
                            <p className="text-sm whitespace-pre-wrap text-emerald-950 dark:text-emerald-100">
                              {entry.responseSummary}
                            </p>
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </CollapsibleContent>
                </div>
              </Collapsible>
            );
          })}

          {totalPages > 1 && (
            <div className="flex items-center justify-between pt-2">
              <p className="text-muted-foreground text-xs">
                Page {page} of {totalPages} ({sessionGroups.length} sessions)
              </p>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                >
                  Previous
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page >= totalPages}
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                >
                  Next
                </Button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
