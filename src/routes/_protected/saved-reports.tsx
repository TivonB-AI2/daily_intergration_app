import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import {
  BookMarked,
  Database,
  MessageSquareText,
  Play,
  Plus,
  Sparkles,
  Trash2,
} from "lucide-react";
import { useConnectors, useQuerySource } from "@/hooks/useConnectors";
import { useAiModel } from "@/hooks/useAiModel";
import { useCapabilities } from "@/hooks/useCapabilities";
import { useActivityLog } from "@/hooks/useActivityLog";
import {
  buildSchemaContext,
  runNaturalLanguageQuery,
} from "@/services/db/dataExplorerService";
import {
  createSavedReport,
  deleteSavedReport,
  listSavedReports,
  updateSavedReportRun,
} from "@/services/db/savedReportService";
import type { SavedReport } from "@/server/db/schema";
import { AiProviderSelect } from "@/components/ai/AiProviderSelect";
import { DISCOVERY_QUERIES } from "@/components/connectors/ConnectorDetailSheet";
import {
  DEFAULT_AI_PROVIDER_ID,
  extractProviderText,
  type AiProviderId,
} from "@/lib/aiProviders";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Markdown } from "@/components/ui/markdown";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export const Route = createFileRoute("/_protected/saved-reports")({
  component: SavedReportsPage,
});

type TableRow = Record<string, unknown>;

/** Quotes a single identifier segment for use in a live query — BigQuery
 * uses backticks and errors on double quotes, every other engine here uses
 * ANSI double quotes (mirrors the same helper on `/insights`). */
function quoteIdentPart(name: string, isBigquery: boolean): string {
  if (isBigquery) return `\`${name.replace(/`/g, "")}\``;
  return `"${name.replace(/"/g, '""')}"`;
}

/** Builds a query-safe reference for a saved table name, which may be
 * schema-qualified ("public.employees") — each segment is quoted
 * separately so the schema is actually respected instead of being
 * swallowed into one invalid identifier. */
function qualifiedTableRef(qualifiedName: string, isBigquery: boolean): string {
  return qualifiedName
    .split(".")
    .map((part) => quoteIdentPart(part, isBigquery))
    .join(".");
}

/** Lightweight, schema-scoped table-name-only discovery queries — used
 * instead of the shared column-level `DISCOVERY_QUERIES` (from
 * ConnectorDetailSheet) for populating this page's table picker. A
 * column-per-row query against a database with several schemas (e.g.
 * Supabase's own "auth"/"storage" schemas alongside "public") can return
 * far more rows than the platform's query endpoint returns in one page —
 * since schemas outside "public" often sort first alphabetically and have
 * many columns, the truncated response can end up containing zero "public"
 * rows at all. Querying `information_schema.tables` (one row per table, not
 * per column) filtered to just the relevant schema avoids that. */
const TABLE_LIST_QUERIES: Record<string, string> = {
  Postgresql: `SELECT table_schema, table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE' ORDER BY table_name`,
  MariaDB: `SELECT table_schema, table_name FROM information_schema.tables WHERE table_schema = DATABASE() ORDER BY table_name`,
  Oracle: `SELECT owner AS table_schema, table_name FROM all_tables WHERE owner = USER ORDER BY table_name`,
  Bigquery: `SELECT table_schema, table_name FROM \`region-us\`.INFORMATION_SCHEMA.TABLES ORDER BY table_name`,
};

function extractSql(text: string): string | null {
  const fenced = text.match(/```(?:sql)?\s*([\s\S]*?)```/i);
  const candidate = fenced ? fenced[1] : text;
  const trimmed = candidate.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function SavedReportsPage() {
  const queryClient = useQueryClient();
  const { data: caps, isLoading: capsLoading } = useCapabilities();
  const dbEnabled = caps?.databaseEnabled === true;
  const { logError } = useActivityLog();

  const { data: reports, isLoading: reportsLoading } = useQuery({
    queryKey: ["savedReports"],
    queryFn: () => listSavedReports(),
    enabled: dbEnabled,
    staleTime: 30_000,
  });

  const { data: connectorsRes } = useConnectors({
    type: "source",
    category: "data",
    per_page: 100,
  });
  const sourceConnectors = (connectorsRes?.data ?? []).filter(
    (c) => c.attributes.configuration?.data_type !== "unstructured",
  );

  const createMutation = useMutation({
    mutationFn: createSavedReport,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["savedReports"] });
      toast.success("Report saved.");
    },
  });

  const deleteMutation = useMutation({
    mutationFn: deleteSavedReport,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["savedReports"] });
      toast.success("Report deleted.");
    },
  });

  const updateRunMutation = useMutation({
    mutationFn: updateSavedReportRun,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["savedReports"] });
    },
  });

  // --- Create dialog state ---
  const [createOpen, setCreateOpen] = useState(false);
  const [newType, setNewType] = useState<"explorer" | "insight">("explorer");
  const [newName, setNewName] = useState("");
  const [newQuestion, setNewQuestion] = useState("");
  const [newProvider, setNewProvider] = useState<AiProviderId>(
    DEFAULT_AI_PROVIDER_ID,
  );
  const [newConnectorId, setNewConnectorId] = useState<string | null>(null);
  const [newAvailableTables, setNewAvailableTables] = useState<string[]>([]);
  const [newSelectedTables, setNewSelectedTables] = useState<Set<string>>(
    new Set(),
  );
  const querySource = useQuerySource();

  useEffect(() => {
    if (!newConnectorId) return;
    setNewAvailableTables([]);
    setNewSelectedTables(new Set());
    const connector = sourceConnectors.find((c) => c.id === newConnectorId);
    const provider = connector?.attributes.connector_name;
    const discoveryQuery = provider
      ? (TABLE_LIST_QUERIES[provider] ?? DISCOVERY_QUERIES[provider])
      : undefined;
    if (!discoveryQuery) return;
    querySource.mutate(
      { connectorId: newConnectorId, payload: { query: discoveryQuery } },
      {
        onSuccess: (res) => {
          const rows = (res?.data ?? []) as {
            table_schema?: string;
            table_name?: string;
          }[];
          // Store the fully-qualified "schema.table" so the query built at
          // run time can reference the right schema — a bare table name can
          // resolve to the wrong (or no) table on databases with multiple
          // schemas, e.g. Supabase's own "auth"/"storage" schemas alongside
          // "public". `TABLE_LIST_QUERIES` already scopes the query itself
          // to the relevant schema (public/current-database/current-user),
          // so every row here is already one we want to offer.
          const qualified = rows
            .filter((r) => !!r.table_name)
            .map((r) => `${r.table_schema || "public"}.${r.table_name}`);
          const names = Array.from(new Set(qualified)).sort();
          setNewAvailableTables(names);
        },
        onError: () => {
          setNewAvailableTables([]);
        },
      },
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [newConnectorId]);

  function resetCreateForm() {
    setNewType("explorer");
    setNewName("");
    setNewQuestion("");
    setNewProvider(DEFAULT_AI_PROVIDER_ID);
    setNewConnectorId(null);
    setNewAvailableTables([]);
    setNewSelectedTables(new Set());
  }

  function handleCreate() {
    if (!newName.trim()) {
      toast.error("Give the report a name.");
      return;
    }
    if (newType === "explorer" && !newQuestion.trim()) {
      toast.error("Enter a question to save.");
      return;
    }
    if (newType === "insight") {
      if (!newConnectorId) {
        toast.error("Select a data source.");
        return;
      }
      if (newSelectedTables.size === 0) {
        toast.error("Select at least one table.");
        return;
      }
    }
    const connector = sourceConnectors.find((c) => c.id === newConnectorId);
    createMutation.mutate(
      {
        data: {
          name: newName.trim(),
          type: newType,
          provider: newProvider,
          question: newType === "explorer" ? newQuestion.trim() : undefined,
          connectorId:
            newType === "insight" ? String(newConnectorId) : undefined,
          connectorName:
            newType === "insight" ? connector?.attributes.name : undefined,
          tables:
            newType === "insight" ? Array.from(newSelectedTables) : undefined,
        },
      },
      {
        onSuccess: () => {
          setCreateOpen(false);
          resetCreateForm();
        },
      },
    );
  }

  // --- Run state ---
  const [runningId, setRunningId] = useState<number | null>(null);
  const [runResults, setRunResults] = useState<Record<number, string>>({});
  const aiModel = useAiModel();

  async function handleRunExplorer(report: SavedReport) {
    if (!report.question) return;
    setRunningId(report.id);
    try {
      const modelRes = await aiModel.mutateAsync({
        connectorId: report.provider as AiProviderId,
        messages: [
          {
            role: "user",
            content: `Database schema (Postgres):\n${buildSchemaContext()}\n\nQuestion: ${report.question}\n\nWrite a single read-only SELECT query (Postgres syntax) that answers this question using only the tables above. Respond with ONLY the SQL query in a single fenced code block, no explanation.`,
          },
        ],
        instructions:
          "You are a SQL assistant. You only ever write a single safe SELECT statement against the given schema. Never write INSERT/UPDATE/DELETE/DDL. Always wrap the query in a ```sql code block and add nothing else.",
      });
      const text = extractProviderText(modelRes?.data);
      const sql = extractSql(text);
      if (!sql) throw new Error("The AI didn't return a usable query.");
      const result = await runNaturalLanguageQuery({ data: sql });
      const summary = `${result.rows.length} row(s) returned.\nSQL: ${result.sql}`;
      setRunResults((prev) => ({ ...prev, [report.id]: summary }));
      updateRunMutation.mutate({
        data: { id: report.id, resultSummary: summary },
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Run failed.";
      toast.error(message);
      if (dbEnabled) {
        logError({
          message: `Saved Report (Explorer) run failed: ${message}`,
          severity: "error",
          source: "Saved Reports",
        });
      }
    } finally {
      setRunningId(null);
    }
  }

  async function handleRunInsight(report: SavedReport) {
    const connectorId = report.connectorId;
    const tableNames = report.tables;
    if (!connectorId || !tableNames || tableNames.length === 0) return;
    setRunningId(report.id);
    try {
      const connector = sourceConnectors.find((c) => c.id === connectorId);
      const isBigquery = connector?.attributes.connector_name === "Bigquery";
      // Each table is an independent query, so fetch them all in parallel
      // instead of one round-trip at a time.
      const tableResults = await Promise.all(
        tableNames.map((table) =>
          querySource.mutateAsync({
            connectorId,
            payload: {
              query: `SELECT * FROM ${qualifiedTableRef(table, isBigquery)} LIMIT 50`,
            },
          }),
        ),
      );
      const tables: Record<string, TableRow[]> = {};
      tableNames.forEach((table, i) => {
        tables[table] = (tableResults[i]?.data ?? []) as TableRow[];
      });
      const dataSummary = Object.entries(tables)
        .map(([table, rows]) => {
          if (rows.length === 0) return `${table}: (no rows)`;
          const lines = rows.slice(0, 20).map((row) =>
            Object.entries(row)
              .map(([k, v]) => `${k}: ${v}`)
              .join(", "),
          );
          return `${table} (${rows.length} rows):\n${lines.join("\n")}`;
        })
        .join("\n\n");

      const modelRes = await aiModel.mutateAsync({
        connectorId: report.provider as AiProviderId,
        messages: [
          {
            role: "user",
            content: `Here is live data from ${tableNames.length} table(s) (${tableNames.join(", ")}):\n\n${dataSummary}\n\nProvide 3-6 short, plain-language insights. Keep it concise and use bullet points.`,
          },
        ],
        instructions:
          "You are a data analytics assistant. Provide clear, concise, actionable insights based only on the data given.",
      });
      const text = extractProviderText(modelRes?.data);
      if (!text) throw new Error("The model returned no content.");
      setRunResults((prev) => ({ ...prev, [report.id]: text }));
      updateRunMutation.mutate({
        data: { id: report.id, resultSummary: text },
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Run failed.";
      toast.error(message);
      if (dbEnabled) {
        logError({
          message: `Saved Report (Insight) run failed: ${message}`,
          severity: "error",
          source: "Saved Reports",
        });
      }
    } finally {
      setRunningId(null);
    }
  }

  function handleRun(report: SavedReport) {
    if (report.type === "explorer") handleRunExplorer(report);
    else handleRunInsight(report);
  }

  const isLoading = reportsLoading || capsLoading;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            Saved Reports
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Bookmark a Data Explorer question or an AI Insight configuration and
            re-run it any time. Want to explore a data source live first?{" "}
            <Link to="/insights" className="underline underline-offset-2">
              Go to AI Insights
            </Link>
            .
          </p>
        </div>
        {dbEnabled && (
          <div>
            {createOpen && (
              <Dialog
                open
                onOpenChange={(next) => {
                  if (!next) {
                    setCreateOpen(false);
                    resetCreateForm();
                  }
                }}
              >
                <DialogContent className="sm:max-w-lg">
                  <DialogHeader>
                    <DialogTitle>New Saved Report</DialogTitle>
                  </DialogHeader>
                  <Tabs
                    value={newType}
                    onValueChange={(v) => v && setNewType(v as typeof newType)}
                  >
                    <TabsList>
                      <TabsTrigger value="explorer">
                        <MessageSquareText className="size-4" />
                        Explorer Question
                      </TabsTrigger>
                      <TabsTrigger value="insight">
                        <Sparkles className="size-4" />
                        AI Insight
                      </TabsTrigger>
                    </TabsList>
                    <div className="flex flex-col gap-3 mt-4">
                      <div className="flex flex-col gap-1.5">
                        <Label>Name</Label>
                        <Input
                          value={newName}
                          onChange={(e) => setNewName(e.target.value)}
                          placeholder="e.g. Weekly pending tasks"
                        />
                      </div>
                      <TabsContent
                        value="explorer"
                        className="flex flex-col gap-3 mt-0"
                      >
                        <div className="flex flex-col gap-1.5">
                          <Label>Question</Label>
                          <Input
                            value={newQuestion}
                            onChange={(e) => setNewQuestion(e.target.value)}
                            placeholder="e.g. How many pending tasks are there?"
                          />
                        </div>
                      </TabsContent>
                      <TabsContent
                        value="insight"
                        className="flex flex-col gap-3 mt-0"
                      >
                        <div className="flex flex-col gap-1.5">
                          <Label>Data source</Label>
                          <Select
                            value={newConnectorId ?? undefined}
                            onValueChange={(v) => v && setNewConnectorId(v)}
                          >
                            <SelectTrigger>
                              <SelectValue placeholder="Choose a data source" />
                            </SelectTrigger>
                            <SelectContent>
                              {sourceConnectors.map((c) => (
                                <SelectItem key={c.id} value={c.id}>
                                  {c.attributes.name}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        {newConnectorId && (
                          <div className="flex flex-col gap-1.5">
                            <Label>Tables</Label>
                            {newAvailableTables.length === 0 ? (
                              <p className="text-xs text-muted-foreground">
                                No tables discovered for this connector.
                              </p>
                            ) : (
                              <div className="grid grid-cols-2 gap-2 max-h-40 overflow-y-auto">
                                {newAvailableTables.map((t) => (
                                  <div
                                    key={t}
                                    className="flex items-center gap-2"
                                  >
                                    <Checkbox
                                      id={`new-table-${t}`}
                                      checked={newSelectedTables.has(t)}
                                      onCheckedChange={(checked) =>
                                        setNewSelectedTables((prev) => {
                                          const next = new Set(prev);
                                          if (checked === true) next.add(t);
                                          else next.delete(t);
                                          return next;
                                        })
                                      }
                                    />
                                    <Label
                                      htmlFor={`new-table-${t}`}
                                      className="text-sm font-normal"
                                    >
                                      {t.replace(/^public\./, "")}
                                    </Label>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        )}
                      </TabsContent>
                      <div className="flex flex-col gap-1.5">
                        <Label>AI provider</Label>
                        <AiProviderSelect
                          value={newProvider}
                          onChange={setNewProvider}
                        />
                      </div>
                    </div>
                  </Tabs>
                  <DialogFooter>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => {
                        setCreateOpen(false);
                        resetCreateForm();
                      }}
                    >
                      Cancel
                    </Button>
                    <Button
                      type="button"
                      onClick={handleCreate}
                      disabled={createMutation.isPending}
                    >
                      Save Report
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            )}
            <Button onClick={() => setCreateOpen(true)}>
              <Plus />
              New Saved Report
            </Button>
          </div>
        )}
      </div>

      {!dbEnabled && !capsLoading ? (
        <Alert>
          <AlertTitle>Database not configured</AlertTitle>
          <AlertDescription>
            Saved Reports need a database connection to store and re-run
            reports.
          </AlertDescription>
        </Alert>
      ) : isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Skeleton className="h-40 w-full" />
          <Skeleton className="h-40 w-full" />
        </div>
      ) : !reports || reports.length === 0 ? (
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <BookMarked />
            </EmptyMedia>
            <EmptyTitle>No saved reports yet</EmptyTitle>
            <EmptyDescription>
              Save a Data Explorer question or an AI Insight configuration to
              re-run it any time.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {reports.map((report) => (
            <Card key={report.id}>
              <CardHeader>
                <div className="flex items-center justify-between gap-2">
                  <CardTitle className="text-base">{report.name}</CardTitle>
                  <Badge variant="secondary" className="gap-1">
                    {report.type === "explorer" ? (
                      <MessageSquareText className="h-3 w-3" />
                    ) : (
                      <Database className="h-3 w-3" />
                    )}
                    {report.type === "explorer" ? "Explorer" : "Insight"}
                  </Badge>
                </div>
                <CardDescription>
                  {report.type === "explorer"
                    ? report.question
                    : `${report.connectorName} \u00b7 ${(report.tables ?? []).map((t) => t.replace(/^public\./, "")).join(", ")}`}
                </CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col gap-2">
                {report.lastRunAt && (
                  <p className="text-xs text-muted-foreground">
                    Last run {new Date(report.lastRunAt).toLocaleString()}
                  </p>
                )}
                {(runResults[report.id] ?? report.lastResultSummary) && (
                  <div className="rounded-md border border-border p-3 max-h-40 overflow-y-auto">
                    <Markdown>
                      {runResults[report.id] ?? report.lastResultSummary ?? ""}
                    </Markdown>
                  </div>
                )}
              </CardContent>
              <CardFooter className="flex items-center justify-between gap-2">
                <Button
                  size="sm"
                  onClick={() => handleRun(report)}
                  disabled={runningId === report.id}
                >
                  <Play
                    className={runningId === report.id ? "animate-pulse" : ""}
                  />
                  {runningId === report.id ? "Running..." : "Run"}
                </Button>
                <Button
                  size="icon"
                  variant="ghost"
                  aria-label="Delete report"
                  onClick={() => deleteMutation.mutate({ data: report.id })}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </CardFooter>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
