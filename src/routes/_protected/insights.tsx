import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  Sparkles,
  TableIcon,
  Trash2,
  MessageSquareText,
  Database,
  BarChart3,
} from "lucide-react";
import { useConnectors, useQuerySource } from "@/hooks/useConnectors";
import { ChartView } from "@/components/insights/ChartView";
import { useAiModel } from "@/hooks/useAiModel";
import { useCapabilities } from "@/hooks/useCapabilities";
import { useActivityLog } from "@/hooks/useActivityLog";
import {
  createAiInsight,
  deleteAiInsight,
  listAiInsights,
} from "@/services/db/aiInsightService";
import { AiProviderSelect } from "@/components/ai/AiProviderSelect";
import { DISCOVERY_QUERIES } from "@/components/connectors/ConnectorDetailSheet";
import { CONNECTOR_SCHEMA_FALLBACK } from "@/lib/connectorSchemaFallback";
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
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
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

export const Route = createFileRoute("/_protected/insights")({
  component: InsightsPage,
});

type TableRow = Record<string, unknown>;

/** One column row returned by a `DISCOVERY_QUERIES` schema-introspection
 * query, keyed generically so it works across the different SQL engines'
 * catalog views (all normalized to these 4 column names). */
type SchemaColumnRow = {
  table_schema?: string;
  table_name?: string;
  column_name?: string;
  data_type?: string;
};

type TableInfo = {
  /** Fully-qualified, quote-safe name to use in a `SELECT * FROM ...`. */
  qualifiedName: string;
  /** Human-readable label shown in the table picker. */
  label: string;
  columns: { name: string; type: string }[];
};

/** Quotes a table/schema identifier for use in a live `SELECT * FROM ...`
 * query. Most SQL engines (Postgresql/MariaDB/Oracle/Snowflake/Databricks/
 * ClickHouse/Athena) use ANSI double quotes — but BigQuery uses backticks
 * for identifiers and errors on double quotes (confirmed live: a
 * double-quoted `"dataset"."table"` query fails with a syntax error, while
 * the identical query with backticks succeeds and returns real rows). */
function quoteIdent(name: string, connectorProvider?: string) {
  if (connectorProvider === "Bigquery") {
    return `\`${name.replace(/`/g, "")}\``;
  }
  return `"${name.replace(/"/g, '""')}"`;
}

function InsightsPage() {
  const queryClient = useQueryClient();
  const { data: caps } = useCapabilities();
  const { logError } = useActivityLog();
  const dbEnabled = caps?.databaseEnabled === true;

  const querySource = useQuerySource();
  const aiModel = useAiModel();
  const [generatedInsight, setGeneratedInsight] = useState<string | null>(null);

  // Every data-source connector in the workspace — excludes AI/ML model
  // connectors (category "ai_ml"), since those aren't data to analyze, just
  // the model used to generate the insight text.
  const { data: connectorsRes, isLoading: connectorsLoading } = useConnectors({
    type: "source",
    category: "data",
    per_page: 100,
  });
  // Unstructured document connectors (e.g. OneDrive's "Unstructured" mode)
  // are excluded from AI Insights — removed per request.
  const sourceConnectors = useMemo(
    () =>
      (connectorsRes?.data ?? []).filter(
        (c) => c.attributes.configuration?.data_type !== "unstructured",
      ),
    [connectorsRes],
  );
  const [connectorId, setConnectorId] = useState<string | null>(null);

  // Default to the first available source connector once the list loads.
  useEffect(() => {
    if (!connectorId && sourceConnectors.length > 0) {
      setConnectorId(sourceConnectors[0].id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sourceConnectors]);

  const selectedConnector = sourceConnectors.find((c) => c.id === connectorId);
  const connectorName = selectedConnector?.attributes.name ?? "";
  const connectorProvider = selectedConnector?.attributes.connector_name ?? "";
  const discoveryQuery = connectorProvider
    ? DISCOVERY_QUERIES[connectorProvider]
    : undefined;
  const fallbackSchema = connectorId
    ? CONNECTOR_SCHEMA_FALLBACK[connectorId]
    : undefined;
  // Live SQL discovery is attempted for every connector whose provider has a
  // catalog query mapped; a cached snapshot (see connectorSchemaFallback.ts)
  // is used as a fallback when that attempt fails or isn't available at all
  // (e.g. the connector isn't a SQL engine).
  const canDiscoverSchema = !!discoveryQuery || !!fallbackSchema;

  const [availableTables, setAvailableTables] = useState<TableInfo[] | null>(
    null,
  );
  const [isFallbackSchema, setIsFallbackSchema] = useState(false);
  const [fallbackNote, setFallbackNote] = useState<string | null>(null);
  const [selectedTables, setSelectedTables] = useState<Set<string>>(new Set());
  const [discoverError, setDiscoverError] = useState<string | null>(null);
  const [loadingTables, setLoadingTables] = useState(false);

  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState<string | null>(null);
  const [askProvider, setAskProvider] = useState<AiProviderId>(
    DEFAULT_AI_PROVIDER_ID,
  );
  const [generateProvider, setGenerateProvider] = useState<AiProviderId>(
    DEFAULT_AI_PROVIDER_ID,
  );
  const [isAsking, setIsAsking] = useState(false);

  const { data: history, isLoading: historyLoading } = useQuery({
    queryKey: ["aiInsights"],
    queryFn: () => listAiInsights(),
    enabled: dbEnabled,
    staleTime: 30_000,
  });

  const saveMutation = useMutation({
    mutationFn: createAiInsight,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["aiInsights"] });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: deleteAiInsight,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["aiInsights"] });
      toast.success("Insight deleted.");
    },
  });

  /** Loads the cached fallback snapshot (see connectorSchemaFallback.ts) for
   * the current connector, if one exists — used when live SQL discovery
   * isn't available or fails. Returns true if a fallback was applied. */
  function applyFallbackSchema(errorMessage?: string): boolean {
    if (!fallbackSchema) {
      if (errorMessage) setDiscoverError(errorMessage);
      return false;
    }
    setAvailableTables(
      fallbackSchema.tables
        .map((t) => ({
          qualifiedName: quoteIdent(t.name, connectorProvider),
          label: t.name,
          columns: t.columns.map((name) => ({ name, type: "" })),
        }))
        .sort((a, b) => a.label.localeCompare(b.label)),
    );
    setIsFallbackSchema(true);
    setFallbackNote(fallbackSchema.note);
    setDiscoverError(null);
    return true;
  }

  // Re-discover the schema whenever the selected connector changes.
  useEffect(() => {
    setAvailableTables(null);
    setSelectedTables(new Set());
    setDiscoverError(null);
    setIsFallbackSchema(false);
    setFallbackNote(null);
    setGeneratedInsight(null);
    setAnswer(null);

    if (!connectorId) return;

    // No live SQL catalog query mapped for this provider at all — go
    // straight to the cached fallback snapshot, if one exists.
    if (!discoveryQuery) {
      applyFallbackSchema(
        `Live schema discovery isn't supported for this connector type (${connectorProvider || "unknown"}), and no cached schema snapshot is available for it yet.`,
      );
      return;
    }

    querySource.mutate(
      {
        connectorId,
        payload: { query: discoveryQuery },
      },
      {
        onSuccess: (res) => {
          const rows = (res?.data ?? []) as SchemaColumnRow[];
          const byTable = new Map<string, TableInfo>();
          for (const row of rows) {
            const schema = row.table_schema ?? "";
            const table = row.table_name ?? "";
            if (!table) continue;
            const key = schema ? `${schema}.${table}` : table;
            if (!byTable.has(key)) {
              byTable.set(key, {
                qualifiedName: schema
                  ? `${quoteIdent(schema, connectorProvider)}.${quoteIdent(table, connectorProvider)}`
                  : quoteIdent(table, connectorProvider),
                label: key,
                columns: [],
              });
            }
            if (row.column_name) {
              byTable.get(key)?.columns.push({
                name: row.column_name,
                type: row.data_type ?? "",
              });
            }
          }
          setAvailableTables(
            Array.from(byTable.values()).sort((a, b) =>
              a.label.localeCompare(b.label),
            ),
          );
          setIsFallbackSchema(false);
          setFallbackNote(null);
        },
        onError: (err) => {
          // Live discovery failed — fall back to a cached snapshot rather
          // than just showing an error, if one is available for this
          // connector.
          applyFallbackSchema(
            err.message || "Failed to discover the connector's schema.",
          );
        },
      },
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connectorId, discoveryQuery]);

  function toggleTable(table: string, checked: boolean) {
    setSelectedTables((prev) => {
      const next = new Set(prev);
      if (checked) next.add(table);
      else next.delete(table);
      return next;
    });
  }

  const TABLE_ROW_LIMIT = 200;

  async function loadSelectedTableData(): Promise<Record<
    string,
    TableRow[]
  > | null> {
    if (!connectorId) return null;
    const tables: Record<string, TableRow[]> = {};
    try {
      for (const label of selectedTables) {
        const info = availableTables?.find((t) => t.label === label);
        if (!info) continue;
        // Fallback-schema connectors (non-SQL engines — Salesforce, Odoo,
        // QuickBooks, OneDrive, etc.) translate `SELECT * FROM <stream>`
        // into a native API call themselves and reject a literal `LIMIT`
        // clause with a 422 (confirmed live) — only real SQL engines (a
        // live-discovered schema) understand `LIMIT`. Row count is capped
        // client-side afterwards instead for fallback-schema connectors.
        const query = isFallbackSchema
          ? `SELECT * FROM ${info.qualifiedName}`
          : `SELECT * FROM ${info.qualifiedName} LIMIT ${TABLE_ROW_LIMIT}`;
        const res = await querySource.mutateAsync({
          connectorId,
          payload: { query },
        });
        const rows = ((res?.data ?? []) as TableRow[]).slice(
          0,
          TABLE_ROW_LIMIT,
        );
        tables[label] = rows;
      }
      return tables;
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to load live data.";
      handleQueryError(message);
      return null;
    }
  }

  function summarizeTables(tables: Record<string, TableRow[]>): string {
    return Object.entries(tables)
      .map(([table, rows]) => {
        if (rows.length === 0) return `${table}: (no rows)`;
        const lines = rows.map((row) =>
          Object.entries(row)
            .map(([k, v]) => `${k}: ${v}`)
            .join(", "),
        );
        return `${table} (${rows.length} rows):\n${lines.join("\n")}`;
      })
      .join("\n\n");
  }

  async function handleGenerate() {
    if (!connectorId) {
      toast.error("Select a data source first.");
      return;
    }
    if (selectedTables.size === 0) {
      toast.error("Select at least one table to analyze.");
      return;
    }
    setGeneratedInsight(null);
    setLoadingTables(true);
    const tables = await loadSelectedTableData();
    setLoadingTables(false);
    if (!tables) return;
    runModel(tables);
  }

  async function handleAsk() {
    const trimmedQuestion = question.trim();
    if (!trimmedQuestion) return;
    if (!connectorId) {
      toast.error("Select a data source first.");
      return;
    }
    if (selectedTables.size === 0) {
      toast.error("Select at least one table to ask about.");
      return;
    }
    setAnswer(null);
    setIsAsking(true);
    const tables = await loadSelectedTableData();
    if (!tables) {
      setIsAsking(false);
      return;
    }
    const dataSummary = summarizeTables(tables);
    const tableNames = Object.keys(tables);

    aiModel.mutate(
      {
        connectorId: askProvider,
        messages: [
          {
            role: "user",
            content: `Here is live data from ${tableNames.length} table(s) in our database (${tableNames.join(", ")}):\n\n${dataSummary}\n\nQuestion: ${trimmedQuestion}\n\nAnswer using only the data above. If the data doesn't contain the answer, say so.`,
          },
        ],
        instructions:
          "You are a data analytics assistant. Answer questions clearly and concisely, using only the data provided.",
      },
      {
        onSuccess: (res) => {
          const text = extractProviderText(res?.data);
          setIsAsking(false);
          if (!text) {
            toast.error("The model returned no content.");
            return;
          }
          setAnswer(text);
          if (dbEnabled && connectorId) {
            saveMutation.mutate({
              data: {
                connectorId: String(connectorId),
                connectorName: `${connectorName} (${tableNames.join(", ")})`,
                summary: `**Q:** ${trimmedQuestion}\n\n**A:** ${text}`,
              },
            });
          }
        },
        onError: (err) => {
          setIsAsking(false);
          toast.error("Failed to get an answer. Please try again.");
          if (dbEnabled) {
            logError({
              message: `Insights Q&A failed: ${err.message}`,
              severity: "error",
              source: "Insights",
            });
          }
        },
      },
    );
  }

  /** Surfaces the common "the connector's underlying source is unreachable"
   * case (e.g. an OneDrive Unstructured connector pointed at a file that's
   * been moved/deleted) with a clearer explanation than the raw API error —
   * this is a source-connection problem, not something fixable in-app. The
   * platform's own error body doesn't always come back in a shape the
   * generic error handler can parse, so a real connection failure can
   * surface as just a bare "AIS API request failed with status 422/400"
   * instead of the underlying reason — treated the same way here since
   * either message means the connector itself couldn't be queried. */
  function friendlyConnectorError(message: string): string {
    if (
      /itemNotFound|resource could not be found|AIS API request failed/i.test(
        message,
      )
    ) {
      return `${connectorName || "This connector"} couldn't be reached — its underlying file(s)/data may be unavailable, moved, or the connection may need to be reauthorized. Ask whoever manages that connection to check it, or choose a different data source.`;
    }
    return message;
  }

  function handleQueryError(message: string) {
    const friendly = friendlyConnectorError(message);
    toast.error(friendly || "Failed to load live data for insights.");
    if (dbEnabled) {
      logError({
        message: `Insights page failed to load data: ${friendly}`,
        severity: "error",
        source: "Insights",
      });
    }
  }

  function runModel(tables: Record<string, TableRow[]>) {
    const tableNames = Object.keys(tables);
    const sections = tableNames.map((table) => {
      const rows = tables[table] ?? [];
      if (rows.length === 0) return `${table}: (no rows)`;
      const lines = rows.map((row) =>
        Object.entries(row)
          .map(([k, v]) => `${k}: ${v}`)
          .join(", "),
      );
      return `${table} (${rows.length} rows):\n${lines.join("\n")}`;
    });
    const dataSummary = sections.join("\n\n");

    aiModel.mutate(
      {
        connectorId: generateProvider,
        messages: [
          {
            role: "user",
            content: `Here is live data from ${tableNames.length} table(s) in our database (${tableNames.join(", ")}):\n\n${dataSummary}\n\nAnalyze this data and provide 3-6 short, plain-language insights (notable patterns, risks, or opportunities across and within these tables). Keep it concise and use bullet points.`,
          },
        ],
        instructions:
          "You are a data analytics assistant. Provide clear, concise, actionable insights based only on the data given.",
      },
      {
        onSuccess: (res) => {
          const text = extractProviderText(res?.data);
          if (!text) {
            toast.error("The model returned no content.");
            return;
          }
          setGeneratedInsight(text);
          if (dbEnabled && connectorId) {
            saveMutation.mutate({
              data: {
                connectorId: String(connectorId),
                connectorName: `${connectorName} (${tableNames.join(", ")})`,
                summary: text,
              },
            });
          }
        },
        onError: (err) => {
          toast.error("Failed to generate insights. Please try again.");
          if (dbEnabled) {
            logError({
              message: `Insights generation failed: ${err.message}`,
              severity: "error",
              source: "Insights",
            });
          }
        },
      },
    );
  }

  const isDiscovering =
    querySource.isPending && availableTables === null && canDiscoverSchema;
  const isGenerating = loadingTables || aiModel.isPending;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">AI Insights</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Pick any connected data source, select tables from its live schema,
          and generate AI-powered insights or ask a question about the data.
          Want to save a question to re-run later?{" "}
          <Link to="/saved-reports" className="underline underline-offset-2">
            Try Saved Reports
          </Link>
          .
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Data source</CardTitle>
          <CardDescription>
            Every source connector in this workspace — schema discovery
            currently supports Postgresql, MariaDB, and Oracle connectors.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {connectorsLoading ? (
            <Skeleton className="h-9 w-64" />
          ) : sourceConnectors.length === 0 ? (
            <Empty>
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <Database />
                </EmptyMedia>
                <EmptyTitle>No source connectors</EmptyTitle>
                <EmptyDescription>
                  Connect a data source first from the Connectors page.
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : (
            <div className="flex flex-wrap items-center gap-3">
              <Select
                value={connectorId ?? undefined}
                onValueChange={(v) => v && setConnectorId(v)}
              >
                <SelectTrigger className="w-72">
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
              {connectorProvider && (
                <Badge variant="secondary">{connectorProvider}</Badge>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Tables to analyze</CardTitle>
          <CardDescription>
            Discovered live from the selected connector's schema — select which
            ones to include.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {!connectorId ? (
            <p className="text-sm text-muted-foreground">
              Choose a data source above to discover its tables.
            </p>
          ) : !canDiscoverSchema ? (
            <Alert>
              <AlertTitle>No schema available</AlertTitle>
              <AlertDescription>
                {discoverError ||
                  `This connector type (${connectorProvider || "unknown"}) couldn't be introspected, and no cached schema snapshot is available for it yet.`}
              </AlertDescription>
            </Alert>
          ) : isDiscovering ? (
            <div className="flex flex-col gap-2">
              <Skeleton className="h-5 w-full" />
              <Skeleton className="h-5 w-full" />
              <Skeleton className="h-5 w-3/4" />
            </div>
          ) : !availableTables || availableTables.length === 0 ? (
            <Empty>
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <TableIcon />
                </EmptyMedia>
                <EmptyTitle>No tables found</EmptyTitle>
                <EmptyDescription>
                  This connector has no tables to select from.
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : (
            <div className="flex flex-col gap-3">
              {isFallbackSchema && (
                <Alert>
                  <AlertTitle>Showing a cached schema snapshot</AlertTitle>
                  <AlertDescription>
                    {fallbackNote ||
                      "Live schema discovery isn't available for this connector, so this list comes from a cached snapshot instead."}{" "}
                    Generate Insights / Ask a Question still attempt a live
                    fetch of each selected table's rows — this only affects the
                    table/column list shown here, not data querying itself.
                  </AlertDescription>
                </Alert>
              )}
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
                {availableTables.map((table) => (
                  <div key={table.label} className="flex items-center gap-2">
                    <Checkbox
                      id={`table-${table.label}`}
                      checked={selectedTables.has(table.label)}
                      onCheckedChange={(checked) =>
                        toggleTable(table.label, checked === true)
                      }
                    />
                    <Label
                      htmlFor={`table-${table.label}`}
                      className="text-sm font-normal"
                      title={table.columns.map((c) => c.name).join(", ")}
                    >
                      {table.label}
                    </Label>
                  </div>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Tabs defaultValue="ask-ai">
        <TabsList>
          <TabsTrigger value="ask-ai">
            <MessageSquareText className="size-4" />
            Ask AI
          </TabsTrigger>
          <TabsTrigger value="chart-view">
            <BarChart3 className="size-4" />
            Chart View
          </TabsTrigger>
        </TabsList>

        <TabsContent value="ask-ai" className="flex flex-col gap-6 mt-4">
          <Tabs defaultValue="generate">
            <TabsList>
              <TabsTrigger value="generate">
                <Sparkles className="size-4" />
                Generate Insights
              </TabsTrigger>
              <TabsTrigger value="ask">
                <MessageSquareText className="size-4" />
                Ask a Question
              </TabsTrigger>
            </TabsList>

            <TabsContent value="generate" className="flex flex-col gap-4 mt-4">
              <div className="flex items-center gap-2">
                <Button
                  onClick={handleGenerate}
                  disabled={isGenerating || selectedTables.size === 0}
                >
                  <Sparkles className={isGenerating ? "animate-pulse" : ""} />
                  {isGenerating ? "Generating..." : "Generate Insights"}
                </Button>
                <AiProviderSelect
                  value={generateProvider}
                  onChange={setGenerateProvider}
                />
              </div>

              {isGenerating && (
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">
                      Analyzing live data...
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="flex flex-col gap-2">
                    <Skeleton className="h-4 w-full" />
                    <Skeleton className="h-4 w-full" />
                    <Skeleton className="h-4 w-3/4" />
                  </CardContent>
                </Card>
              )}

              {generatedInsight && !isGenerating && (
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">Latest Insight</CardTitle>
                    <CardDescription>Generated just now</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <Markdown>{generatedInsight}</Markdown>
                  </CardContent>
                </Card>
              )}
            </TabsContent>

            <TabsContent value="ask" className="flex flex-col gap-4 mt-4">
              <div className="flex flex-col gap-3">
                <Input
                  placeholder="Ask a question about the selected tables' data..."
                  value={question}
                  onChange={(e) => setQuestion(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleAsk();
                  }}
                />
                <div className="flex items-center gap-2">
                  <Button
                    onClick={handleAsk}
                    disabled={isAsking || !question.trim()}
                  >
                    <MessageSquareText
                      className={isAsking ? "animate-pulse" : ""}
                    />
                    {isAsking ? "Thinking..." : "Ask"}
                  </Button>
                  <AiProviderSelect
                    value={askProvider}
                    onChange={setAskProvider}
                  />
                </div>
              </div>

              {isAsking && (
                <Card>
                  <CardContent className="flex flex-col gap-2 pt-6">
                    <Skeleton className="h-4 w-full" />
                    <Skeleton className="h-4 w-full" />
                    <Skeleton className="h-4 w-3/4" />
                  </CardContent>
                </Card>
              )}

              {answer && !isAsking && (
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">Answer</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <Markdown>{answer}</Markdown>
                  </CardContent>
                </Card>
              )}
            </TabsContent>
          </Tabs>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Insight History</CardTitle>
              <CardDescription>Previously generated insights</CardDescription>
            </CardHeader>
            <CardContent>
              {!dbEnabled ? (
                <Alert>
                  <AlertTitle>Database not configured</AlertTitle>
                  <AlertDescription>
                    Insight history can't be saved without a database
                    connection.
                  </AlertDescription>
                </Alert>
              ) : historyLoading ? (
                <div className="flex flex-col gap-3">
                  <Skeleton className="h-6 w-full" />
                  <Skeleton className="h-6 w-full" />
                </div>
              ) : !history || history.length === 0 ? (
                <Empty>
                  <EmptyHeader>
                    <EmptyMedia variant="icon">
                      <Sparkles />
                    </EmptyMedia>
                    <EmptyTitle>No insights yet</EmptyTitle>
                    <EmptyDescription>
                      Select tables above and click "Generate Insights".
                    </EmptyDescription>
                  </EmptyHeader>
                </Empty>
              ) : (
                <div className="flex flex-col gap-4">
                  {history.map((item) => (
                    <div
                      key={item.id}
                      className="rounded-md border border-border p-4"
                    >
                      <div className="flex items-center justify-between gap-4 mb-2">
                        <span className="text-xs text-muted-foreground">
                          {item.connectorName} ·{" "}
                          {new Date(item.createdAt).toLocaleString()}
                        </span>
                        <Button
                          size="icon"
                          variant="ghost"
                          aria-label="Delete insight"
                          onClick={() =>
                            deleteMutation.mutate({ data: item.id })
                          }
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                      <Markdown>{item.summary}</Markdown>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="chart-view" className="mt-4">
          <ChartView
            connectorId={connectorId}
            connectorProvider={connectorProvider}
            connectorName={connectorName}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}
