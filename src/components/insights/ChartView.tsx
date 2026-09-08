import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Bar, BarChart, CartesianGrid, Cell, XAxis } from "recharts";
import { Columns3, Hash, RefreshCw, Rows3, TableIcon } from "lucide-react";
import { useQuerySource } from "@/hooks/useConnectors";
import { DISCOVERY_QUERIES } from "@/components/connectors/ConnectorDetailSheet";
import { useActivityLog } from "@/hooks/useActivityLog";
import { useCapabilities } from "@/hooks/useCapabilities";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

type Row = Record<string, unknown>;

const CHART_COLORS = [
  "var(--chart-1)",
  "var(--chart-2)",
  "var(--chart-3)",
  "var(--chart-4)",
  "var(--chart-5)",
];

const groupChartConfig: ChartConfig = {
  count: { label: "Rows" },
};

const ID_LIKE = /(^id$|_id$)/i;

/** One column row returned by a `DISCOVERY_QUERIES` schema-introspection
 * query, keyed generically so it works across the different SQL engines'
 * catalog views (all normalized to these 4 column names). */
type SchemaColumnRow = {
  table_schema?: string;
  table_name?: string;
};

type TableInfo = {
  /** Fully-qualified, quote-safe name to use in a `SELECT * FROM ...`. */
  qualifiedName: string;
  /** Human-readable label shown in the table picker. */
  label: string;
};

/** Quotes a table/schema identifier for use in a live `SELECT * FROM ...`
 * query. Most SQL engines use ANSI double quotes — but BigQuery uses
 * backticks for identifiers and errors on double quotes. */
function quoteIdent(name: string, connectorProvider?: string) {
  if (connectorProvider === "Bigquery") {
    return `\`${name.replace(/`/g, "")}\``;
  }
  return `"${name.replace(/"/g, '""')}"`;
}

function isNumeric(value: unknown): boolean {
  if (typeof value === "number") return true;
  if (typeof value !== "string" || value.trim() === "") return false;
  return !Number.isNaN(Number(value));
}

/** Infer simple column types from a sample of rows, live from whatever
 * schema the selected table actually has. */
function analyzeColumns(rows: Row[]) {
  if (rows.length === 0)
    return { numeric: [] as string[], categorical: [] as string[] };
  const columns = Object.keys(rows[0]);
  const numeric: string[] = [];
  const categorical: string[] = [];
  for (const col of columns) {
    const values = rows
      .map((r) => r[col])
      .filter((v) => v !== null && v !== undefined);
    if (values.length === 0) continue;
    const allNumeric = values.every(isNumeric);
    if (allNumeric && !ID_LIKE.test(col)) {
      numeric.push(col);
    } else if (!ID_LIKE.test(col)) {
      const distinct = new Set(values.map(String));
      if (distinct.size >= 2 && distinct.size <= 12) categorical.push(col);
    }
  }
  return { numeric, categorical };
}

/** Renders the same discover-schema -> pick-table -> auto-generated-charts
 * flow the Data Dashboard page used to have as a standalone page, but scoped
 * to whichever connector the parent (AI Insights) currently has selected —
 * no connector picker of its own. */
export function ChartView({
  connectorId,
  connectorProvider,
  connectorName,
}: {
  connectorId: string | null;
  connectorProvider: string;
  connectorName: string;
}) {
  const { data: caps } = useCapabilities();
  const { logError } = useActivityLog();
  const dbEnabled = caps?.databaseEnabled === true;
  const querySource = useQuerySource();

  const discoveryQuery = connectorProvider
    ? DISCOVERY_QUERIES[connectorProvider]
    : undefined;

  const [availableTables, setAvailableTables] = useState<TableInfo[] | null>(
    null,
  );
  const [selectedTable, setSelectedTable] = useState<string | null>(null);
  const [tableRows, setTableRows] = useState<Row[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [lastRefreshed, setLastRefreshed] = useState<Date | null>(null);

  function loadAvailableTables(id: string, provider?: string, query?: string) {
    setError(null);
    setAvailableTables(null);
    setSelectedTable(null);
    setTableRows(null);
    if (!query) {
      setError("Live schema discovery isn't supported for this connector.");
      return;
    }
    querySource.mutate(
      {
        connectorId: id,
        payload: { query },
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
                  ? `${quoteIdent(schema, provider)}.${quoteIdent(table, provider)}`
                  : quoteIdent(table, provider),
                label: key,
              });
            }
          }
          const tables = Array.from(byTable.values()).sort((a, b) =>
            a.label.localeCompare(b.label),
          );
          setAvailableTables(tables);
          setSelectedTable((current) => current ?? tables[0]?.label ?? null);
          if (tables.length === 0) setLastRefreshed(new Date());
        },
        onError: (err) => {
          const message =
            err.message || "Failed to discover the connector's schema.";
          setError(message);
          if (dbEnabled) {
            logError({
              message: `Chart view failed to discover schema: ${message}`,
              severity: "error",
              source: "Insights",
            });
          }
        },
      },
    );
  }

  function loadTable(id: string, tableInfo: TableInfo) {
    setError(null);
    setTableRows(null);
    querySource.mutate(
      {
        connectorId: id,
        payload: {
          query: `SELECT * FROM ${tableInfo.qualifiedName} LIMIT 200`,
        },
      },
      {
        onSuccess: (res) => {
          setTableRows((res?.data ?? []) as Row[]);
          setLastRefreshed(new Date());
        },
        onError: (err) => {
          const message =
            err.message || `Failed to load table "${tableInfo.label}".`;
          setError(message);
          if (dbEnabled) {
            logError({
              message: `Chart view failed to load table "${tableInfo.label}": ${message}`,
              severity: "error",
              source: "Insights",
            });
          }
        },
      },
    );
  }

  useEffect(() => {
    if (connectorId)
      loadAvailableTables(connectorId, connectorProvider, discoveryQuery);
    else {
      setAvailableTables(null);
      setSelectedTable(null);
      setTableRows(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connectorId, discoveryQuery]);

  useEffect(() => {
    const tableInfo = availableTables?.find((t) => t.label === selectedTable);
    if (connectorId && tableInfo) loadTable(connectorId, tableInfo);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedTable]);

  function handleRefresh() {
    if (!connectorId) return;
    const tableInfo = availableTables?.find((t) => t.label === selectedTable);
    if (tableInfo) loadTable(connectorId, tableInfo);
    else loadAvailableTables(connectorId, connectorProvider, discoveryQuery);
    toast.info("Refreshing live data...");
  }

  const columns = useMemo(() => {
    if (!tableRows || tableRows.length === 0) return [];
    return Object.keys(tableRows[0]);
  }, [tableRows]);

  const { numeric, categorical } = useMemo(
    () => analyzeColumns(tableRows ?? []),
    [tableRows],
  );

  const groupColumn = categorical[0] ?? null;
  const metricColumn = numeric[0] ?? null;

  const groupChartData = useMemo(() => {
    if (!tableRows || !groupColumn) return [];
    const counts = new Map<string, number>();
    for (const row of tableRows) {
      const key = String(row[groupColumn] ?? "Unknown");
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    return Array.from(counts.entries()).map(([name, count]) => ({
      name,
      count,
    }));
  }, [tableRows, groupColumn]);

  const metricAverage = useMemo(() => {
    if (!tableRows || !metricColumn) return null;
    const values = tableRows
      .map((r) => Number(r[metricColumn]))
      .filter((n) => !Number.isNaN(n));
    if (values.length === 0) return null;
    return values.reduce((sum, n) => sum + n, 0) / values.length;
  }, [tableRows, metricColumn]);

  const isLoading = querySource.isPending && tableRows === null;
  const isDiscovering = querySource.isPending && availableTables === null;

  if (!connectorId) {
    return (
      <Empty>
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <TableIcon />
          </EmptyMedia>
          <EmptyTitle>No data source selected</EmptyTitle>
          <EmptyDescription>
            Choose a data source above to view its data as charts.
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm text-muted-foreground">
            Auto-generated charts from live data in {connectorName}
          </p>
        </div>
        <div className="flex items-center gap-3">
          {lastRefreshed && (
            <span className="text-xs text-muted-foreground">
              Updated {lastRefreshed.toLocaleTimeString()}
            </span>
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={handleRefresh}
            disabled={querySource.isPending}
          >
            <RefreshCw
              className={querySource.isPending ? "animate-spin" : ""}
            />
            Refresh
          </Button>
        </div>
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertTitle>Couldn't load live data</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <Card>
        <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-4">
          <div>
            <CardTitle className="text-base flex items-center gap-2">
              <TableIcon className="size-4" /> Table
            </CardTitle>
            <CardDescription>
              Pick a table discovered live in this connector's schema.
            </CardDescription>
          </div>
          <Select
            value={selectedTable ?? undefined}
            onValueChange={(v) => v && setSelectedTable(v)}
            disabled={
              isDiscovering || !availableTables || availableTables.length === 0
            }
          >
            <SelectTrigger className="w-56">
              <SelectValue placeholder="Choose a table" />
            </SelectTrigger>
            <SelectContent>
              {(availableTables ?? []).map((t) => (
                <SelectItem key={t.label} value={t.label}>
                  {t.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </CardHeader>
      </Card>

      {isDiscovering ? (
        <Skeleton className="h-24 w-full" />
      ) : !availableTables || availableTables.length === 0 ? (
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <TableIcon />
            </EmptyMedia>
            <EmptyTitle>No tables found</EmptyTitle>
            <EmptyDescription>
              This connector's schema doesn't expose any tables to chart.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <Card>
              <CardHeader className="pb-2">
                <CardDescription className="flex items-center gap-2">
                  <Rows3 className="size-4" /> Rows
                </CardDescription>
              </CardHeader>
              <CardContent>
                {isLoading ? (
                  <Skeleton className="h-9 w-16" />
                ) : (
                  <p className="text-3xl font-bold">{tableRows?.length ?? 0}</p>
                )}
                <p className="text-xs text-muted-foreground mt-1">
                  Showing up to 200 rows
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardDescription className="flex items-center gap-2">
                  <Columns3 className="size-4" /> Columns
                </CardDescription>
              </CardHeader>
              <CardContent>
                {isLoading ? (
                  <Skeleton className="h-9 w-16" />
                ) : (
                  <p className="text-3xl font-bold">{columns.length}</p>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardDescription className="flex items-center gap-2">
                  <Hash className="size-4" />
                  {metricColumn ? `Avg. ${metricColumn}` : "Numeric Columns"}
                </CardDescription>
              </CardHeader>
              <CardContent>
                {isLoading ? (
                  <Skeleton className="h-9 w-16" />
                ) : (
                  <p className="text-3xl font-bold">
                    {metricColumn && metricAverage !== null
                      ? metricAverage.toLocaleString(undefined, {
                          maximumFractionDigits: 2,
                        })
                      : numeric.length}
                  </p>
                )}
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">
                {groupColumn ? `Rows by ${groupColumn}` : "Breakdown"}
              </CardTitle>
              <CardDescription>
                {groupColumn
                  ? `Live count grouped by ${groupColumn}`
                  : "No suitable categorical column found for a breakdown chart."}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <Skeleton className="h-64 w-full" />
              ) : !groupColumn || groupChartData.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Not enough categorical variation in this table to chart.
                </p>
              ) : (
                <ChartContainer
                  config={groupChartConfig}
                  className="h-64 w-full"
                >
                  <BarChart data={groupChartData}>
                    <CartesianGrid vertical={false} />
                    <XAxis
                      dataKey="name"
                      tickLine={false}
                      axisLine={false}
                      tickMargin={8}
                    />
                    <ChartTooltip content={<ChartTooltipContent />} />
                    <Bar dataKey="count" radius={4}>
                      {groupChartData.map((_, i) => (
                        <Cell
                          key={i}
                          fill={CHART_COLORS[i % CHART_COLORS.length]}
                        />
                      ))}
                    </Bar>
                  </BarChart>
                </ChartContainer>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">{selectedTable}</CardTitle>
              <CardDescription>Live records from the connector</CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              {isLoading ? (
                <div className="flex flex-col gap-3 p-4">
                  <Skeleton className="h-8 w-full" />
                  <Skeleton className="h-8 w-full" />
                  <Skeleton className="h-8 w-full" />
                </div>
              ) : !tableRows || tableRows.length === 0 ? (
                <div className="p-4">
                  <Empty>
                    <EmptyHeader>
                      <EmptyMedia variant="icon">
                        <Rows3 />
                      </EmptyMedia>
                      <EmptyTitle>No rows found</EmptyTitle>
                      <EmptyDescription>
                        This table doesn't have any records yet.
                      </EmptyDescription>
                    </EmptyHeader>
                  </Empty>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        {columns.map((col) => (
                          <TableHead key={col} className="whitespace-nowrap">
                            {col}
                          </TableHead>
                        ))}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {tableRows.map((row, i) => (
                        // biome-ignore lint/suspicious/noArrayIndexKey: rows have no stable connector-provided id across all tables
                        <TableRow key={i}>
                          {columns.map((col) => (
                            <TableCell
                              key={col}
                              className="whitespace-nowrap text-sm"
                            >
                              {String(row[col] ?? "—")}
                            </TableCell>
                          ))}
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
