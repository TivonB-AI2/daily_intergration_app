import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import {
  Activity,
  CheckCircle2,
  Plug,
  RefreshCw,
  Trash2,
  XCircle,
} from "lucide-react";
import { useConnectors, useQuerySource } from "@/hooks/useConnectors";
import { useCapabilities } from "@/hooks/useCapabilities";
import { useActivityLog } from "@/hooks/useActivityLog";
import { DISCOVERY_QUERIES } from "@/components/connectors/ConnectorDetailSheet";
import {
  clearHealthChecks,
  listHealthChecks,
  recordHealthCheck,
} from "@/services/db/integrationHealthService";
import type { IntegrationHealthCheck } from "@/server/db/schema";
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
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
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

function timeAgo(date: string | Date) {
  const d = typeof date === "string" ? new Date(date) : date;
  const seconds = Math.floor((Date.now() - d.getTime()) / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export function IntegrationHealthPage() {
  const queryClient = useQueryClient();
  const { data: caps, isLoading: capsLoading } = useCapabilities();
  const dbEnabled = caps?.databaseEnabled === true;
  const { logError } = useActivityLog();

  const { data: connectorsRes, isLoading: connectorsLoading } = useConnectors({
    per_page: 100,
  });
  const connectors = connectorsRes?.data ?? [];

  const { data: checks, isLoading: checksLoading } = useQuery({
    queryKey: ["integrationHealthChecks"],
    queryFn: () => listHealthChecks(),
    enabled: dbEnabled,
    staleTime: 15_000,
  });

  const querySource = useQuerySource();
  const [testingId, setTestingId] = useState<string | number | null>(null);

  const recordMutation = useMutation({
    mutationFn: recordHealthCheck,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["integrationHealthChecks"] });
    },
  });

  const clearMutation = useMutation({
    mutationFn: clearHealthChecks,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["integrationHealthChecks"] });
      toast.success("Health check history cleared.");
    },
  });

  const latestByConnector = useMemo(() => {
    const map = new Map<string, IntegrationHealthCheck>();
    for (const c of checks ?? []) {
      if (!map.has(c.connectorId)) map.set(c.connectorId, c);
    }
    return map;
  }, [checks]);

  function handleTest(
    connectorId: string | number,
    connectorName: string,
    provider: string,
  ) {
    const query = DISCOVERY_QUERIES[provider];
    if (!query) {
      toast.error(`Connection testing isn't supported for ${provider} yet.`);
      return;
    }
    setTestingId(connectorId);
    const started = Date.now();
    querySource.mutate(
      { connectorId: Number(connectorId), payload: { query: "SELECT 1" } },
      {
        onSuccess: () => {
          setTestingId(null);
          const durationMs = Date.now() - started;
          toast.success("Connection is healthy.");
          if (dbEnabled) {
            recordMutation.mutate({
              data: {
                connectorId: String(connectorId),
                connectorName,
                connectorProvider: provider,
                status: "success",
                durationMs,
              },
            });
          }
        },
        onError: (err) => {
          setTestingId(null);
          const durationMs = Date.now() - started;
          toast.error(`Connection test failed: ${err.message}`);
          if (dbEnabled) {
            recordMutation.mutate({
              data: {
                connectorId: String(connectorId),
                connectorName,
                connectorProvider: provider,
                status: "failure",
                message: err.message,
                durationMs,
              },
            });
            logError({
              message: `Integration health check failed for ${connectorName}: ${err.message}`,
              severity: "error",
              source: "Integration Health",
            });
          }
        },
      },
    );
  }

  const testableConnectors = connectors.filter(
    (c) => !!DISCOVERY_QUERIES[c.attributes.connector_name],
  );
  const healthyCount = testableConnectors.filter(
    (c) => latestByConnector.get(String(c.id))?.status === "success",
  ).length;
  const failingCount = testableConnectors.filter(
    (c) => latestByConnector.get(String(c.id))?.status === "failure",
  ).length;
  const untestedCount = testableConnectors.length - healthyCount - failingCount;

  const isLoading = connectorsLoading || capsLoading;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          Integration Health
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Test any connector's connection and keep a history of results over
          time.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Healthy</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold">{healthyCount}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Failing</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold">{failingCount}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Not tested yet</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold">{untestedCount}</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Connectors</CardTitle>
          <CardDescription>
            Only connector types that support a lightweight test query are shown
            here.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex flex-col gap-3">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
          ) : testableConnectors.length === 0 ? (
            <Empty>
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <Plug />
                </EmptyMedia>
                <EmptyTitle>No testable connectors</EmptyTitle>
                <EmptyDescription>
                  None of this workspace's connectors currently support a
                  connection test.
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Connector</TableHead>
                  <TableHead>Provider</TableHead>
                  <TableHead>Last result</TableHead>
                  <TableHead>Last checked</TableHead>
                  <TableHead className="text-right">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {testableConnectors.map((c) => {
                  const last = latestByConnector.get(String(c.id));
                  return (
                    <TableRow key={c.id}>
                      <TableCell className="font-medium">
                        {c.attributes.name}
                      </TableCell>
                      <TableCell>
                        <Badge variant="secondary">
                          {c.attributes.connector_name}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {!last ? (
                          <Badge variant="outline">Not tested</Badge>
                        ) : last.status === "success" ? (
                          <Badge className="gap-1">
                            <CheckCircle2 className="h-3 w-3" />
                            Healthy
                          </Badge>
                        ) : (
                          <Badge variant="destructive" className="gap-1">
                            <XCircle className="h-3 w-3" />
                            Failing
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {last ? timeAgo(last.createdAt) : "\u2014"}
                      </TableCell>
                      <TableCell className="text-right">
                        <button
                          type="button"
                          className="inline-flex items-center gap-1.5 text-sm text-primary hover:underline disabled:opacity-50 disabled:no-underline"
                          disabled={testingId === c.id}
                          onClick={() =>
                            handleTest(
                              c.id,
                              c.attributes.name,
                              c.attributes.connector_name,
                            )
                          }
                        >
                          <RefreshCw
                            className={`h-3.5 w-3.5 ${testingId === c.id ? "animate-spin" : ""}`}
                          />
                          Test
                        </button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-3">
          <div>
            <CardTitle className="text-base">Check History</CardTitle>
            <CardDescription>
              Every test recorded, newest first.
            </CardDescription>
          </div>
          {dbEnabled && checks && checks.length > 0 && (
            <AlertDialog>
              <AlertDialogTrigger className="inline-flex items-center gap-1.5 text-sm text-destructive hover:underline">
                <Trash2 className="h-3.5 w-3.5" />
                Clear History
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Clear all health checks?</AlertDialogTitle>
                  <AlertDialogDescription>
                    This permanently deletes every recorded health check. This
                    cannot be undone.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction onClick={() => clearMutation.mutate({})}>
                    Clear
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}
        </CardHeader>
        <CardContent>
          {!dbEnabled ? (
            <Alert>
              <AlertTitle>Database not configured</AlertTitle>
              <AlertDescription>
                Health check history can't be saved without a database
                connection — tests can still be run above, just not tracked over
                time.
              </AlertDescription>
            </Alert>
          ) : checksLoading ? (
            <div className="flex flex-col gap-3">
              <Skeleton className="h-6 w-full" />
              <Skeleton className="h-6 w-full" />
            </div>
          ) : !checks || checks.length === 0 ? (
            <Empty>
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <Activity />
                </EmptyMedia>
                <EmptyTitle>No checks recorded yet</EmptyTitle>
                <EmptyDescription>
                  Run a test above to start building history.
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Connector</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Duration</TableHead>
                  <TableHead>Message</TableHead>
                  <TableHead className="text-right">When</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {checks.slice(0, 50).map((c) => (
                  <TableRow key={c.id}>
                    <TableCell className="font-medium">
                      {c.connectorName}
                    </TableCell>
                    <TableCell>
                      {c.status === "success" ? (
                        <Badge className="gap-1">
                          <CheckCircle2 className="h-3 w-3" />
                          Success
                        </Badge>
                      ) : (
                        <Badge variant="destructive" className="gap-1">
                          <XCircle className="h-3 w-3" />
                          Failure
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {c.durationMs}ms
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground max-w-64 truncate">
                      {c.message ?? "\u2014"}
                    </TableCell>
                    <TableCell className="text-right text-xs text-muted-foreground">
                      {timeAgo(c.createdAt)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
