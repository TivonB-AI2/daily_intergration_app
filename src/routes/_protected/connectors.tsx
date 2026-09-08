import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Plug, Search, Zap } from "lucide-react";
import { useConnectors, useQuerySource } from "@/hooks/useConnectors";
import { useCapabilities } from "@/hooks/useCapabilities";
import { useActivityLog } from "@/hooks/useActivityLog";
import {
  ConnectorDetailSheet,
  DISCOVERY_QUERIES,
} from "@/components/connectors/ConnectorDetailSheet";
import { Spinner } from "@/components/ui/spinner";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";

export const Route = createFileRoute("/_protected/connectors")({
  component: ConnectorsPage,
});

type TypeFilter = "all" | "source" | "destination";
type CategoryFilter = "all" | "ai_ml" | "data";

function ConnectorsPage() {
  const { data: caps } = useCapabilities();
  const { logError } = useActivityLog();
  const dbEnabled = caps?.databaseEnabled === true;

  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<TypeFilter>("all");
  const [categoryFilter, setCategoryFilter] = useState<CategoryFilter>("all");
  const [selectedId, setSelectedId] = useState<string | number | null>(null);
  const [testingId, setTestingId] = useState<string | number | null>(null);
  const querySource = useQuerySource();

  // Single fetch for the whole workspace (up to 100 connectors) — used for
  // both the summary counts (always reflect the whole workspace) and the
  // browsable list below. `connector_type` is present on every connector
  // already, so the Sources/Destinations split is applied client-side on
  // this same result with no extra request.
  const {
    data: allConnectorsRes,
    isLoading,
    error,
  } = useConnectors({ per_page: 100 });
  const allConnectors = allConnectorsRes?.data ?? [];

  // `category` (ai_ml vs data) is a server-side-only filter param — it
  // isn't a field on the connector response, so it can't be derived
  // client-side. Only fire this second request when a category filter is
  // actually active, instead of unconditionally duplicating the fetch
  // above on every render regardless of filter state.
  const categoryActive = typeFilter === "source" && categoryFilter !== "all";
  const { data: categoryConnectorsRes, isLoading: categoryLoading } =
    useConnectors(
      { per_page: 100, type: "source", category: categoryFilter },
      { enabled: categoryActive },
    );

  useEffect(() => {
    if (error && dbEnabled) {
      logError({
        message: `Failed to load connectors: ${error.message}`,
        severity: "error",
        source: "Connectors",
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [error, dbEnabled]);

  function handleTypeFilterChange(value: TypeFilter) {
    setTypeFilter(value);
    if (value !== "source") setCategoryFilter("all");
  }

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    const base = categoryActive
      ? (categoryConnectorsRes?.data ?? [])
      : allConnectors.filter(
          (c) =>
            typeFilter === "all" || c.attributes.connector_type === typeFilter,
        );
    return base.filter((c) => {
      const attrs = c.attributes;
      if (!term) return true;
      return (
        attrs.name.toLowerCase().includes(term) ||
        attrs.connector_name.toLowerCase().includes(term)
      );
    });
  }, [
    allConnectors,
    categoryConnectorsRes,
    categoryActive,
    search,
    typeFilter,
  ]);

  const listLoading = categoryActive ? categoryLoading : isLoading;

  function handleTest(connectorId: string | number, connectorName: string) {
    const query = DISCOVERY_QUERIES[connectorName];
    if (!query) {
      toast.error(
        `Connection testing isn't supported for ${connectorName} yet.`,
      );
      return;
    }
    setTestingId(connectorId);
    querySource.mutate(
      { connectorId: Number(connectorId), payload: { query: "SELECT 1" } },
      {
        onSuccess: () => {
          setTestingId(null);
          toast.success("Connection is healthy.");
        },
        onError: (err) => {
          setTestingId(null);
          toast.error(`Connection test failed: ${err.message}`);
          if (dbEnabled) {
            logError({
              message: `Connector test failed for ${connectorName}: ${err.message}`,
              severity: "error",
              source: "Connectors",
            });
          }
        },
      },
    );
  }

  const sourceCount = allConnectors.filter(
    (c) => c.attributes.connector_type === "source",
  ).length;
  const destinationCount = allConnectors.filter(
    (c) => c.attributes.connector_type === "destination",
  ).length;

  return (
    <div className="flex flex-col gap-6 p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-semibold tracking-tight">Connectors</h1>
          <p className="text-sm text-muted-foreground">
            Browse the data sources and destinations connected to this
            workspace, and inspect what's inside them.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Total Connectors</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold">{allConnectors.length}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Sources</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold">{sourceCount}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Destinations</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold">{destinationCount}</p>
          </CardContent>
        </Card>
      </div>

      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center gap-3">
          <Input
            placeholder="Search connectors..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="max-w-sm"
          />
          <Select
            value={typeFilter}
            onValueChange={(v) => v && handleTypeFilterChange(v as TypeFilter)}
          >
            <SelectTrigger className="w-44">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All types</SelectItem>
              <SelectItem value="source">Sources only</SelectItem>
              <SelectItem value="destination">Destinations only</SelectItem>
            </SelectContent>
          </Select>
          {typeFilter === "source" && (
            <Select
              value={categoryFilter}
              onValueChange={(v) => v && setCategoryFilter(v as CategoryFilter)}
            >
              <SelectTrigger className="w-44">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All categories</SelectItem>
                <SelectItem value="ai_ml">AI/ML</SelectItem>
                <SelectItem value="data">Data</SelectItem>
              </SelectContent>
            </Select>
          )}
        </div>

        {error ? (
          <Alert variant="destructive">
            <AlertDescription>
              Couldn't load connectors: {error.message}
            </AlertDescription>
          </Alert>
        ) : listLoading ? (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 6 }).map((_, i) => (
              // biome-ignore lint/suspicious/noArrayIndexKey: static skeleton grid
              <Skeleton key={i} className="h-32 w-full" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <Empty>
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <Plug />
              </EmptyMedia>
              <EmptyTitle>No connectors found</EmptyTitle>
              <EmptyDescription>
                No connector matches your search or filter.
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
            {filtered.map((connector) => {
              const attrs = connector.attributes;
              const testable = !!DISCOVERY_QUERIES[attrs.connector_name];
              const isTesting = testingId === connector.id;
              return (
                <Card
                  key={connector.id}
                  className="flex flex-col transition-colors hover:border-primary"
                >
                  <CardHeader
                    className="cursor-pointer pb-3"
                    onClick={() => setSelectedId(connector.id)}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <CardTitle className="text-base">{attrs.name}</CardTitle>
                      <Badge
                        variant={
                          attrs.connector_type === "source"
                            ? "default"
                            : "secondary"
                        }
                      >
                        {attrs.connector_type}
                      </Badge>
                    </div>
                    <CardDescription>{attrs.connector_name}</CardDescription>
                  </CardHeader>
                  <CardContent className="mt-auto flex items-center justify-between gap-2">
                    <Badge
                      variant={attrs.enabled ? "outline" : "secondary"}
                      className="w-fit"
                    >
                      {attrs.enabled ? "Enabled" : "Disabled"}
                    </Badge>
                    <div className="flex items-center gap-1">
                      {testable && (
                        <Button
                          size="sm"
                          variant="ghost"
                          disabled={isTesting}
                          onClick={() =>
                            handleTest(connector.id, attrs.connector_name)
                          }
                          title="Test connection"
                        >
                          {isTesting ? (
                            <Spinner className="h-4 w-4" />
                          ) : (
                            <Zap className="h-4 w-4" />
                          )}
                          Test
                        </Button>
                      )}
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => setSelectedId(connector.id)}
                      >
                        <Search className="h-4 w-4" />
                        Inspect
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>

      <ConnectorDetailSheet
        connectorId={selectedId}
        open={selectedId !== null}
        onOpenChange={(open) => {
          if (!open) setSelectedId(null);
        }}
      />
    </div>
  );
}
