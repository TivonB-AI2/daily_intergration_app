import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useRef, useState } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  XAxis,
  YAxis,
} from "recharts";
import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  BarChart3,
  CheckCircle2,
  Download,
  HardDrive,
  ImageDown,
  Minus,
  Package,
  Printer,
} from "lucide-react";
import { useCapabilities } from "@/hooks/useCapabilities";
import {
  getAnalyticsComparison,
  getAnalyticsSummary,
  type AnalyticsRange,
} from "@/services/db/analyticsService";
import { exportChartAsPng } from "@/lib/chartExport";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
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
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { Skeleton } from "@/components/ui/skeleton";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";

export const Route = createFileRoute("/_protected/analytics")({
  component: AnalyticsPage,
});

const RANGE_LABELS: Record<AnalyticsRange, string> = {
  "7d": "Last 7 days",
  "30d": "Last 30 days",
  "90d": "Last 90 days",
};

const PIE_COLORS = [
  "var(--chart-1)",
  "var(--chart-2)",
  "var(--chart-3)",
  "var(--chart-4)",
  "var(--chart-5)",
];

const activityConfig = {
  audits: { label: "Activity events", color: "var(--chart-1)" },
  errors: { label: "Errors", color: "var(--chart-3)" },
  todos: { label: "Tasks created", color: "var(--chart-2)" },
} satisfies ChartConfig;

const inventoryConfig = {
  items: { label: "Items", color: "var(--chart-1)" },
  units: { label: "Units in stock", color: "var(--chart-2)" },
} satisfies ChartConfig;

const valueConfig = {
  value: { label: "Count" },
} satisfies ChartConfig;

function formatBytes(bytes: number): string {
  if (bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const i = Math.min(
    Math.floor(Math.log(bytes) / Math.log(1024)),
    units.length - 1,
  );
  return `${(bytes / 1024 ** i).toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

function shortDate(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`);
  return d.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

function toCsv(rows: (string | number)[][]): string {
  return rows
    .map((row) =>
      row
        .map((cell) => {
          const s = String(cell);
          return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
        })
        .join(","),
    )
    .join("\n");
}

function ComparisonMetric({
  label,
  current,
  previous,
}: {
  label: string;
  current: number;
  previous: number;
}) {
  const diff = current - previous;
  const pct =
    previous > 0 ? Math.round((diff / previous) * 100) : current > 0 ? 100 : 0;
  const Icon = diff > 0 ? ArrowUp : diff < 0 ? ArrowDown : Minus;
  const color =
    diff > 0
      ? "text-emerald-600 dark:text-emerald-400"
      : diff < 0
        ? "text-red-600 dark:text-red-400"
        : "text-muted-foreground";
  return (
    <div className="flex flex-col gap-1 rounded-lg border p-4">
      <span className="text-sm text-muted-foreground">{label}</span>
      <div className="flex items-baseline gap-2">
        <span className="text-2xl font-semibold tracking-tight">{current}</span>
        <span className={`flex items-center gap-0.5 text-xs ${color}`}>
          <Icon className="h-3 w-3" />
          {diff === 0 ? "no change" : `${Math.abs(pct)}%`}
        </span>
      </div>
      <span className="text-xs text-muted-foreground">
        {previous} in the previous period
      </span>
    </div>
  );
}

function AnalyticsPage() {
  const { data: caps, isLoading: capsLoading } = useCapabilities();
  const [range, setRange] = useState<AnalyticsRange>("30d");
  const [compareEnabled, setCompareEnabled] = useState(false);

  const activityChartRef = useRef<HTMLDivElement>(null);
  const statusChartRef = useRef<HTMLDivElement>(null);
  const priorityChartRef = useRef<HTMLDivElement>(null);
  const inventoryChartRef = useRef<HTMLDivElement>(null);
  const severityChartRef = useRef<HTMLDivElement>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["analytics", range],
    queryFn: () => getAnalyticsSummary({ data: range }),
    enabled: caps?.databaseEnabled === true,
    staleTime: 30_000,
  });

  const { data: comparison, isLoading: comparisonLoading } = useQuery({
    queryKey: ["analytics-comparison", range],
    queryFn: () => getAnalyticsComparison({ data: range }),
    enabled: caps?.databaseEnabled === true && compareEnabled,
    staleTime: 30_000,
  });

  const kpis = useMemo(() => {
    if (!data) return [];
    const t = data.totals;
    const completion =
      t.todos > 0 ? Math.round((t.todosDone / t.todos) * 100) : 0;
    return [
      {
        label: "Task completion",
        value: `${completion}%`,
        hint: `${t.todosDone} of ${t.todos} tasks done`,
        icon: CheckCircle2,
      },
      {
        label: "Open errors",
        value: String(t.errorsUnresolved),
        hint: `${t.errors} logged in total`,
        icon: AlertTriangle,
      },
      {
        label: "Inventory",
        value: String(t.inventoryItems),
        hint: `${t.inventoryUnits} units in stock`,
        icon: Package,
      },
      {
        label: "Stored files",
        value: String(t.files),
        hint: formatBytes(t.storageBytes),
        icon: HardDrive,
      },
    ];
  }, [data]);

  function handleExport() {
    if (!data) return;
    const rows: (string | number)[][] = [
      ["Section", "Label", "Metric", "Value"],
      ["Totals", "Tasks", "count", data.totals.todos],
      ["Totals", "Tasks done", "count", data.totals.todosDone],
      ["Totals", "Errors", "count", data.totals.errors],
      ["Totals", "Errors unresolved", "count", data.totals.errorsUnresolved],
      ["Totals", "Activity events", "count", data.totals.auditEvents],
      ["Totals", "Inventory items", "count", data.totals.inventoryItems],
      ["Totals", "Inventory units", "count", data.totals.inventoryUnits],
      ["Totals", "Files", "count", data.totals.files],
      ["Totals", "Storage", "bytes", data.totals.storageBytes],
    ];
    for (const a of data.activity) {
      rows.push(["Activity", a.date, "activity events", a.audits]);
      rows.push(["Activity", a.date, "errors", a.errors]);
      rows.push(["Activity", a.date, "tasks created", a.todos]);
    }
    for (const r of data.todosByStatus)
      rows.push(["Tasks by status", r.name, "count", r.value]);
    for (const r of data.todosByPriority)
      rows.push(["Tasks by priority", r.name, "count", r.value]);
    for (const r of data.errorsBySeverity)
      rows.push(["Errors by severity", r.name, "count", r.value]);
    for (const r of data.inventoryByCategory) {
      rows.push(["Inventory by category", r.name, "items", r.items]);
      rows.push(["Inventory by category", r.name, "units", r.units]);
    }
    for (const r of data.filesByFolder) {
      rows.push(["Files by folder", r.name, "files", r.files]);
      rows.push(["Files by folder", r.name, "bytes", r.bytes]);
    }

    const blob = new Blob([toCsv(rows)], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `analytics-${range}-${new Date()
      .toISOString()
      .slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

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
        <Empty>
          <EmptyMedia>
            <BarChart3 className="h-8 w-8" />
          </EmptyMedia>
          <EmptyHeader>
            <EmptyTitle>Database Not Configured</EmptyTitle>
            <EmptyDescription>
              Enable the database to see analytics for this app.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6 print-report">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Analytics</h1>
          <p className="text-muted-foreground text-sm">
            Activity, tasks, errors, inventory and storage at a glance.
          </p>
        </div>
        <div className="flex items-center gap-2 no-print">
          <ToggleGroup
            value={[range]}
            onValueChange={(v) => {
              const next = Array.isArray(v) ? v[0] : v;
              if (next) setRange(next as AnalyticsRange);
            }}
            className="bg-card"
          >
            {(Object.keys(RANGE_LABELS) as AnalyticsRange[]).map((r) => (
              <ToggleGroupItem key={r} value={r} className="px-3 text-sm">
                {r.replace("d", " days")}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
          <div className="flex items-center gap-2 rounded-md border bg-card px-3 py-2">
            <Switch
              id="compare-toggle"
              checked={compareEnabled}
              onCheckedChange={setCompareEnabled}
            />
            <Label htmlFor="compare-toggle" className="text-sm font-normal">
              Compare to previous period
            </Label>
          </div>
          <Button variant="outline" onClick={handleExport} disabled={!data}>
            <Download className="h-4 w-4" />
            Export CSV
          </Button>
          <Button
            variant="outline"
            onClick={() => window.print()}
            disabled={!data}
          >
            <Printer className="h-4 w-4" />
            Print Report
          </Button>
        </div>
      </div>

      {compareEnabled && (
        <Card>
          <CardHeader>
            <CardTitle>Period comparison</CardTitle>
            <CardDescription>
              {comparison?.rangeLabel ?? "Current period vs previous period"}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {comparisonLoading || !comparison ? (
              <div className="grid gap-3 sm:grid-cols-3">
                {[0, 1, 2].map((i) => (
                  <Skeleton key={i} className="h-24 w-full" />
                ))}
              </div>
            ) : (
              <div className="grid gap-3 sm:grid-cols-3">
                <ComparisonMetric
                  label="Activity events"
                  current={comparison.current.audits}
                  previous={comparison.previous.audits}
                />
                <ComparisonMetric
                  label="Errors logged"
                  current={comparison.current.errors}
                  previous={comparison.previous.errors}
                />
                <ComparisonMetric
                  label="Tasks created"
                  current={comparison.current.todosCreated}
                  previous={comparison.previous.todosCreated}
                />
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {isLoading || !data ? (
        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-28 w-full" />
            ))}
          </div>
          <Skeleton className="h-72 w-full" />
          <div className="grid gap-4 lg:grid-cols-2">
            <Skeleton className="h-72 w-full" />
            <Skeleton className="h-72 w-full" />
          </div>
        </div>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {kpis.map((kpi) => (
              <Card key={kpi.label}>
                <CardHeader className="pb-2">
                  <CardDescription className="flex items-center gap-2">
                    <kpi.icon className="h-4 w-4" />
                    {kpi.label}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-semibold tracking-tight">
                    {kpi.value}
                  </div>
                  <p className="text-muted-foreground text-xs mt-1">
                    {kpi.hint}
                  </p>
                </CardContent>
              </Card>
            ))}
          </div>

          <Card>
            <CardHeader className="flex-row items-start justify-between">
              <div>
                <CardTitle>Activity over time</CardTitle>
                <CardDescription>{RANGE_LABELS[range]}</CardDescription>
              </div>
              <Button
                variant="ghost"
                size="icon"
                className="no-print"
                aria-label="Export chart as PNG"
                onClick={() =>
                  exportChartAsPng(
                    activityChartRef.current,
                    `activity-over-time-${range}.png`,
                  )
                }
              >
                <ImageDown className="h-4 w-4" />
              </Button>
            </CardHeader>
            <CardContent>
              <div ref={activityChartRef}>
                <ChartContainer config={activityConfig} className="h-72 w-full">
                  <AreaChart data={data.activity}>
                    <CartesianGrid vertical={false} />
                    <XAxis
                      dataKey="date"
                      tickLine={false}
                      axisLine={false}
                      tickMargin={8}
                      minTickGap={24}
                      tickFormatter={shortDate}
                    />
                    <YAxis
                      tickLine={false}
                      axisLine={false}
                      width={32}
                      allowDecimals={false}
                    />
                    <ChartTooltip
                      content={
                        <ChartTooltipContent
                          labelFormatter={(label) => shortDate(String(label))}
                        />
                      }
                    />
                    <Area
                      dataKey="audits"
                      type="monotone"
                      fill="var(--color-audits)"
                      fillOpacity={0.2}
                      stroke="var(--color-audits)"
                    />
                    <Area
                      dataKey="todos"
                      type="monotone"
                      fill="var(--color-todos)"
                      fillOpacity={0.2}
                      stroke="var(--color-todos)"
                    />
                    <Area
                      dataKey="errors"
                      type="monotone"
                      fill="var(--color-errors)"
                      fillOpacity={0.2}
                      stroke="var(--color-errors)"
                    />
                  </AreaChart>
                </ChartContainer>
              </div>
            </CardContent>
          </Card>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader className="flex-row items-start justify-between">
                <div>
                  <CardTitle>Tasks by status</CardTitle>
                  <CardDescription>
                    Distribution across the To-Do list
                  </CardDescription>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="no-print"
                  aria-label="Export chart as PNG"
                  onClick={() =>
                    exportChartAsPng(
                      statusChartRef.current,
                      "tasks-by-status.png",
                    )
                  }
                >
                  <ImageDown className="h-4 w-4" />
                </Button>
              </CardHeader>
              <CardContent>
                {data.todosByStatus.length === 0 ? (
                  <p className="text-muted-foreground text-sm py-12 text-center">
                    No tasks recorded yet.
                  </p>
                ) : (
                  <div ref={statusChartRef}>
                    <ChartContainer
                      config={valueConfig}
                      className="h-64 w-full"
                    >
                      <PieChart>
                        <ChartTooltip content={<ChartTooltipContent />} />
                        <Pie
                          data={data.todosByStatus}
                          dataKey="value"
                          nameKey="name"
                          innerRadius={50}
                          outerRadius={90}
                        >
                          {data.todosByStatus.map((entry, i) => (
                            <Cell
                              key={entry.name}
                              fill={PIE_COLORS[i % PIE_COLORS.length]}
                            />
                          ))}
                        </Pie>
                      </PieChart>
                    </ChartContainer>
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex-row items-start justify-between">
                <div>
                  <CardTitle>Tasks by priority</CardTitle>
                  <CardDescription>Where the workload sits</CardDescription>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="no-print"
                  aria-label="Export chart as PNG"
                  onClick={() =>
                    exportChartAsPng(
                      priorityChartRef.current,
                      "tasks-by-priority.png",
                    )
                  }
                >
                  <ImageDown className="h-4 w-4" />
                </Button>
              </CardHeader>
              <CardContent>
                {data.todosByPriority.length === 0 ? (
                  <p className="text-muted-foreground text-sm py-12 text-center">
                    No tasks recorded yet.
                  </p>
                ) : (
                  <div ref={priorityChartRef}>
                    <ChartContainer
                      config={valueConfig}
                      className="h-64 w-full"
                    >
                      <BarChart data={data.todosByPriority}>
                        <CartesianGrid vertical={false} />
                        <XAxis
                          dataKey="name"
                          tickLine={false}
                          axisLine={false}
                          tickMargin={8}
                        />
                        <YAxis
                          tickLine={false}
                          axisLine={false}
                          width={32}
                          allowDecimals={false}
                        />
                        <ChartTooltip content={<ChartTooltipContent />} />
                        <Bar dataKey="value" radius={4}>
                          {data.todosByPriority.map((entry, i) => (
                            <Cell
                              key={entry.name}
                              fill={PIE_COLORS[i % PIE_COLORS.length]}
                            />
                          ))}
                        </Bar>
                      </BarChart>
                    </ChartContainer>
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex-row items-start justify-between">
                <div>
                  <CardTitle>Inventory by category</CardTitle>
                  <CardDescription>Items and units in stock</CardDescription>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="no-print"
                  aria-label="Export chart as PNG"
                  onClick={() =>
                    exportChartAsPng(
                      inventoryChartRef.current,
                      "inventory-by-category.png",
                    )
                  }
                >
                  <ImageDown className="h-4 w-4" />
                </Button>
              </CardHeader>
              <CardContent>
                {data.inventoryByCategory.length === 0 ? (
                  <p className="text-muted-foreground text-sm py-12 text-center">
                    No inventory items yet.
                  </p>
                ) : (
                  <div ref={inventoryChartRef}>
                    <ChartContainer
                      config={inventoryConfig}
                      className="h-64 w-full"
                    >
                      <BarChart data={data.inventoryByCategory}>
                        <CartesianGrid vertical={false} />
                        <XAxis
                          dataKey="name"
                          tickLine={false}
                          axisLine={false}
                          tickMargin={8}
                        />
                        <YAxis
                          tickLine={false}
                          axisLine={false}
                          width={32}
                          allowDecimals={false}
                        />
                        <ChartTooltip content={<ChartTooltipContent />} />
                        <Bar
                          dataKey="items"
                          fill="var(--color-items)"
                          radius={4}
                        />
                        <Bar
                          dataKey="units"
                          fill="var(--color-units)"
                          radius={4}
                        />
                      </BarChart>
                    </ChartContainer>
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex-row items-start justify-between">
                <div>
                  <CardTitle>Errors by severity</CardTitle>
                  <CardDescription>
                    {data.totals.errorsUnresolved} still unresolved
                  </CardDescription>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="no-print"
                  aria-label="Export chart as PNG"
                  onClick={() =>
                    exportChartAsPng(
                      severityChartRef.current,
                      "errors-by-severity.png",
                    )
                  }
                >
                  <ImageDown className="h-4 w-4" />
                </Button>
              </CardHeader>
              <CardContent>
                {data.errorsBySeverity.length === 0 ? (
                  <p className="text-muted-foreground text-sm py-12 text-center">
                    No errors logged — nice.
                  </p>
                ) : (
                  <div ref={severityChartRef}>
                    <ChartContainer
                      config={valueConfig}
                      className="h-64 w-full"
                    >
                      <BarChart data={data.errorsBySeverity} layout="vertical">
                        <CartesianGrid horizontal={false} />
                        <XAxis
                          type="number"
                          tickLine={false}
                          axisLine={false}
                          allowDecimals={false}
                        />
                        <YAxis
                          type="category"
                          dataKey="name"
                          tickLine={false}
                          axisLine={false}
                          width={80}
                        />
                        <ChartTooltip content={<ChartTooltipContent />} />
                        <Bar dataKey="value" radius={4}>
                          {data.errorsBySeverity.map((entry, i) => (
                            <Cell
                              key={entry.name}
                              fill={PIE_COLORS[i % PIE_COLORS.length]}
                            />
                          ))}
                        </Bar>
                      </BarChart>
                    </ChartContainer>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Storage usage by folder</CardTitle>
              <CardDescription>
                {data.totals.files} files ·{" "}
                {formatBytes(data.totals.storageBytes)} total
              </CardDescription>
            </CardHeader>
            <CardContent>
              {data.filesByFolder.length === 0 ? (
                <p className="text-muted-foreground text-sm py-12 text-center">
                  No files stored yet.
                </p>
              ) : (
                <div className="grid gap-3 sm:grid-cols-3">
                  {data.filesByFolder.map((f) => (
                    <div key={f.name} className="rounded-lg border p-4">
                      <div className="text-sm text-muted-foreground capitalize">
                        {f.name}
                      </div>
                      <div className="text-xl font-semibold tracking-tight mt-1">
                        {formatBytes(f.bytes)}
                      </div>
                      <div className="text-xs text-muted-foreground mt-1">
                        {f.files} file{f.files === 1 ? "" : "s"}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
