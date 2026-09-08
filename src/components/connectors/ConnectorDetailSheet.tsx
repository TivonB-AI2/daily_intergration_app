import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Database, Search } from "lucide-react";
import { useConnector, useQuerySource } from "@/hooks/useConnectors";
import { useCapabilities } from "@/hooks/useCapabilities";
import { useActivityLog } from "@/hooks/useActivityLog";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

/**
 * Providers whose schema we can introspect via `querySource` (a live SQL
 * query), each with the catalog query their engine actually understands.
 * Re-verified live against real connectors: Postgresql/MariaDB use ANSI
 * `information_schema.columns`; Oracle has no such view and needs
 * `ALL_TAB_COLUMNS` instead; BigQuery needs the region-qualified
 * `INFORMATION_SCHEMA.COLUMNS` form (confirmed working live).
 *
 * Snowflake, Databricks, ClickHouse, and AWS Athena are included too as a
 * best-effort attempt (their catalog views really do exist, and the query
 * text below is correct for each engine) — but in this workspace their live
 * connectors currently fail for connector/environment reasons unrelated to
 * the query itself (missing ODBC driver, platform request errors, a
 * pagination incompatibility), so discovery for them falls back to a cached
 * snapshot (see `connectorSchemaFallback.ts`) when the live attempt errors.
 */
export const DISCOVERY_QUERIES: Record<string, string> = {
  Postgresql: `SELECT table_schema, table_name, column_name, data_type
FROM information_schema.columns
WHERE table_schema NOT IN ('pg_catalog', 'information_schema')
ORDER BY table_schema, table_name, ordinal_position`,
  MariaDB: `SELECT table_schema, table_name, column_name, data_type
FROM information_schema.columns
WHERE table_schema NOT IN ('information_schema', 'performance_schema', 'mysql', 'sys')
ORDER BY table_schema, table_name, ordinal_position`,
  Oracle: `SELECT owner AS table_schema, table_name, column_name, data_type
FROM all_tab_columns
WHERE owner NOT IN ('SYS', 'SYSTEM', 'OUTLN', 'XDB', 'MDSYS', 'CTXSYS', 'ORDSYS')
ORDER BY owner, table_name, column_id`,
  Bigquery: `SELECT table_schema, table_name, column_name, data_type
FROM \`region-us\`.INFORMATION_SCHEMA.COLUMNS
ORDER BY table_schema, table_name, ordinal_position`,
  Snowflake: `SELECT table_schema, table_name, column_name, data_type
FROM information_schema.columns
WHERE table_schema NOT IN ('INFORMATION_SCHEMA')
ORDER BY table_schema, table_name, ordinal_position`,
  Databricks: `SELECT table_schema, table_name, column_name, data_type
FROM information_schema.columns
ORDER BY table_schema, table_name, ordinal_position`,
  Clickhouse: `SELECT table_schema, table_name, column_name, data_type
FROM system.columns
WHERE table_schema NOT IN ('system', 'information_schema')
ORDER BY table_schema, table_name, position`,
  AwsAthena: `SELECT table_schema, table_name, column_name, data_type
FROM information_schema.columns
ORDER BY table_schema, table_name, ordinal_position`,
};

type SchemaRow = {
  table_schema?: string | number | boolean;
  table_name?: string | number | boolean;
  column_name?: string | number | boolean;
  data_type?: string | number | boolean;
};

export function ConnectorDetailSheet({
  connectorId,
  open,
  onOpenChange,
}: {
  connectorId: string | number | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [rows, setRows] = useState<SchemaRow[] | null>(null);
  const { data: caps } = useCapabilities();
  const dbEnabled = caps?.databaseEnabled === true;
  const { logError: logErrorEvent } = useActivityLog();
  const {
    data: connectorRes,
    isLoading,
    error: connectorError,
  } = useConnector(connectorId);
  const querySource = useQuerySource();

  const connector = connectorRes?.data;
  const attrs = connector?.attributes;
  const discoveryQuery = attrs?.connector_name
    ? DISCOVERY_QUERIES[attrs.connector_name]
    : undefined;
  const canDiscover = attrs?.connector_type === "source" && !!discoveryQuery;

  function logError(message: string) {
    if (!dbEnabled) return;
    logErrorEvent({ message, severity: "error", source: "Connectors" });
  }

  useEffect(() => {
    if (connectorError) {
      logError(
        `Failed to load connector ${connectorId}: ${connectorError.message}`,
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connectorError]);

  function handleDiscover() {
    if (!connectorId || !discoveryQuery) return;
    setRows(null);
    querySource.mutate(
      { connectorId, payload: { query: discoveryQuery } },
      {
        onSuccess: (res) => {
          const data = (res?.data ?? []) as SchemaRow[];
          setRows(data);
          if (data.length === 0) {
            toast.info("No tables were returned for this source.");
          } else {
            toast.success(`Discovered ${data.length} columns.`);
          }
        },
        onError: (error) => {
          const message = error.message || "Schema discovery failed.";
          toast.error(message);
          logError(
            `Schema discovery failed for "${attrs?.name ?? connectorId}": ${message}`,
          );
        },
      },
    );
  }

  const tableCount = rows
    ? new Set(rows.map((r) => `${r.table_schema}.${r.table_name}`)).size
    : 0;

  const configEntries = attrs?.configuration
    ? Object.entries(attrs.configuration).filter(
        // Never surface credentials in the UI.
        ([key]) => key !== "credentials",
      )
    : [];

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="flex w-full flex-col gap-6 overflow-y-auto sm:max-w-2xl">
        {connectorError ? (
          <div className="flex flex-col gap-4 p-2">
            <SheetHeader>
              <SheetTitle>Couldn't load connector</SheetTitle>
            </SheetHeader>
            <Alert variant="destructive" className="mx-4">
              <AlertDescription>{connectorError.message}</AlertDescription>
            </Alert>
          </div>
        ) : isLoading || !attrs ? (
          <div className="flex flex-col gap-4 p-2">
            <Skeleton className="h-8 w-48" />
            <Skeleton className="h-32 w-full" />
          </div>
        ) : (
          <>
            <SheetHeader>
              <SheetTitle>{attrs.name}</SheetTitle>
              <SheetDescription>
                {attrs.description || "No description provided."}
              </SheetDescription>
            </SheetHeader>

            <div className="flex flex-col gap-4 px-4">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="outline">{attrs.connector_name}</Badge>
                <Badge variant="secondary">{attrs.connector_type}</Badge>
                <Badge variant={attrs.enabled ? "default" : "secondary"}>
                  {attrs.enabled ? "Enabled" : "Disabled"}
                </Badge>
              </div>

              <div className="flex flex-col gap-2">
                <Label>Configuration</Label>
                {configEntries.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    No configuration details available.
                  </p>
                ) : (
                  <div className="rounded-lg border">
                    <Table>
                      <TableBody>
                        {configEntries.map(([key, value]) => (
                          <TableRow key={key}>
                            <TableCell className="w-40 font-medium">
                              {key.replace(/_/g, " ")}
                            </TableCell>
                            <TableCell className="font-mono text-xs">
                              {String(value)}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </div>

              <div className="flex flex-col gap-3">
                <div className="flex items-center justify-between gap-2">
                  <Label>Schema</Label>
                  {canDiscover && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={handleDiscover}
                      disabled={querySource.isPending}
                    >
                      {querySource.isPending ? (
                        <Spinner className="h-4 w-4" />
                      ) : (
                        <Search className="h-4 w-4" />
                      )}
                      {querySource.isPending
                        ? "Discovering..."
                        : "Discover Schema"}
                    </Button>
                  )}
                </div>

                {!canDiscover ? (
                  <p className="text-sm text-muted-foreground">
                    Live schema discovery is only available for PostgreSQL,
                    MySQL-family, and Oracle database sources right now. This
                    connector's details are shown above.
                  </p>
                ) : rows === null ? (
                  <p className="text-sm text-muted-foreground">
                    Run discovery to list the tables and columns available in
                    this source.
                  </p>
                ) : rows.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    No tables were returned for this source.
                  </p>
                ) : (
                  <div className="flex flex-col gap-2">
                    <p className="flex items-center gap-2 text-xs text-muted-foreground">
                      <Database className="h-3 w-3" />
                      {tableCount} tables · {rows.length} columns
                    </p>
                    <div className="max-h-96 overflow-y-auto rounded-lg border">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Schema</TableHead>
                            <TableHead>Table</TableHead>
                            <TableHead>Column</TableHead>
                            <TableHead>Type</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {rows.map((row, i) => (
                            <TableRow
                              // biome-ignore lint/suspicious/noArrayIndexKey: schema rows have no stable id
                              key={`${row.table_schema}-${row.table_name}-${row.column_name}-${i}`}
                            >
                              <TableCell className="text-xs text-muted-foreground">
                                {String(row.table_schema ?? "")}
                              </TableCell>
                              <TableCell className="text-xs font-medium">
                                {String(row.table_name ?? "")}
                              </TableCell>
                              <TableCell className="text-xs">
                                {String(row.column_name ?? "")}
                              </TableCell>
                              <TableCell className="font-mono text-xs text-muted-foreground">
                                {String(row.data_type ?? "")}
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
