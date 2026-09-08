import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  XAxis,
  YAxis,
} from "recharts";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import {
  Activity,
  AlertTriangle,
  Bell,
  Network,
  RefreshCw,
} from "lucide-react";

type Rating = "good" | "needs-improvement" | "poor" | "unknown";

interface HistoryPoint {
  time: string;
  fps: number | null;
  heapUsed: number | null;
}

interface ResourceRow {
  name: string;
  type: string;
  duration: number;
  size: number;
}

const HISTORY_CAP = 30;

function ratingBadgeVariant(
  rating: Rating,
): "default" | "secondary" | "destructive" | "outline" {
  switch (rating) {
    case "good":
      return "default";
    case "needs-improvement":
      return "secondary";
    case "poor":
      return "destructive";
    default:
      return "outline";
  }
}

function rateFps(fps: number | null): Rating {
  if (fps === null) return "unknown";
  if (fps >= 50) return "good";
  if (fps >= 30) return "needs-improvement";
  return "poor";
}

function rateTimeMetric(
  value: number | null,
  goodMax: number,
  niMax: number,
): Rating {
  if (value === null) return "unknown";
  if (value <= goodMax) return "good";
  if (value <= niMax) return "needs-improvement";
  return "poor";
}

function formatMs(value: number | null): string {
  if (value === null) return "—";
  return `${Math.round(value)}`;
}

function truncateName(name: string, max = 40): string {
  try {
    const url = new URL(name);
    const short = url.pathname.split("/").pop() || url.pathname;
    return short.length > max ? `${short.slice(0, max)}…` : short || name;
  } catch {
    return name.length > max ? `${name.slice(0, max)}…` : name;
  }
}

function formatBytes(bytes: number): string {
  if (bytes <= 0) return "0 KB";
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb.toFixed(1)} KB`;
  return `${(kb / 1024).toFixed(2)} MB`;
}

const chartConfig = {
  fps: {
    label: "FPS",
    color: "var(--chart-1)",
  },
  heapUsed: {
    label: "Heap Used (MB)",
    color: "var(--chart-2)",
  },
} satisfies ChartConfig;

const THRESHOLDS_KEY = "performance-alert-thresholds-v1";

type Thresholds = {
  minFps: number;
  maxHeapMB: number;
  maxLcpMs: number;
};

const DEFAULT_THRESHOLDS: Thresholds = {
  minFps: 30,
  maxHeapMB: 200,
  maxLcpMs: 4000,
};

function loadThresholds(): Thresholds {
  if (typeof window === "undefined") return DEFAULT_THRESHOLDS;
  try {
    const raw = window.localStorage.getItem(THRESHOLDS_KEY);
    if (!raw) return DEFAULT_THRESHOLDS;
    return { ...DEFAULT_THRESHOLDS, ...JSON.parse(raw) };
  } catch {
    return DEFAULT_THRESHOLDS;
  }
}

export function PerformancePage() {
  const [fps, setFps] = useState<number | null>(null);
  const [heapUsed, setHeapUsed] = useState<number | null>(null);
  const [heapTotal, setHeapTotal] = useState<number | null>(null);
  const [heapSupported, setHeapSupported] = useState(true);
  const [fcp, setFcp] = useState<number | null>(null);
  const [lcp, setLcp] = useState<number | null>(null);
  const [lcpSupported, setLcpSupported] = useState(true);
  const [ttfb, setTtfb] = useState<number | null>(null);
  const [navTiming, setNavTiming] = useState<{
    domContentLoaded: number | null;
    loadEvent: number | null;
    domInteractive: number | null;
    domComplete: number | null;
  }>({
    domContentLoaded: null,
    loadEvent: null,
    domInteractive: null,
    domComplete: null,
  });
  const [resourceSummary, setResourceSummary] = useState<{
    count: number;
    totalSize: number;
    top: ResourceRow[];
  }>({ count: 0, totalSize: 0, top: [] });
  const [history, setHistory] = useState<HistoryPoint[]>([]);
  const [autoSample, setAutoSample] = useState(false);
  const [thresholds, setThresholds] = useState<Thresholds>(DEFAULT_THRESHOLDS);
  const [thresholdsLoaded, setThresholdsLoaded] = useState(false);
  const notifiedBreachesRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    setThresholds(loadThresholds());
    setThresholdsLoaded(true);
  }, []);

  function updateThreshold<K extends keyof Thresholds>(key: K, value: number) {
    setThresholds((prev) => {
      const next = { ...prev, [key]: value };
      window.localStorage.setItem(THRESHOLDS_KEY, JSON.stringify(next));
      return next;
    });
  }

  const frameCountRef = useRef(0);
  const lastFpsTimeRef = useRef(performance.now());
  const rafIdRef = useRef<number | null>(null);

  // FPS sampling loop
  useEffect(() => {
    const loop = (now: number) => {
      frameCountRef.current += 1;
      const elapsed = now - lastFpsTimeRef.current;
      if (elapsed >= 1000) {
        const computedFps = (frameCountRef.current * 1000) / elapsed;
        setFps(Math.round(computedFps));
        frameCountRef.current = 0;
        lastFpsTimeRef.current = now;

        const mem = (
          performance as unknown as {
            memory?: { usedJSHeapSize: number; totalJSHeapSize: number };
          }
        ).memory;
        if (mem) {
          setHeapUsed(mem.usedJSHeapSize / (1024 * 1024));
          setHeapTotal(mem.totalJSHeapSize / (1024 * 1024));
          setHeapSupported(true);
        } else {
          setHeapSupported(false);
        }
      }
      rafIdRef.current = requestAnimationFrame(loop);
    };
    rafIdRef.current = requestAnimationFrame(loop);
    return () => {
      if (rafIdRef.current !== null) cancelAnimationFrame(rafIdRef.current);
    };
  }, []);

  // LCP observer
  useEffect(() => {
    if (typeof PerformanceObserver === "undefined") {
      setLcpSupported(false);
      return;
    }
    try {
      const observer = new PerformanceObserver((list) => {
        const entries = list.getEntries();
        const last = entries[entries.length - 1] as PerformanceEntry & {
          renderTime?: number;
          loadTime?: number;
        };
        if (last) {
          setLcp(last.renderTime || last.loadTime || last.startTime);
        }
      });
      observer.observe({
        type: "largest-contentful-paint",
        buffered: true,
      } as PerformanceObserverInit);
      return () => observer.disconnect();
    } catch {
      setLcpSupported(false);
    }
  }, []);

  const sampleOneOffMetrics = useCallback(
    (options?: { manual?: boolean }) => {
      const paintEntries = performance.getEntriesByType("paint");
      const fcpEntry = paintEntries.find(
        (e) => e.name === "first-contentful-paint",
      );
      setFcp(fcpEntry ? fcpEntry.startTime : null);

      const navEntries = performance.getEntriesByType(
        "navigation",
      ) as PerformanceNavigationTiming[];
      const nav = navEntries[0];
      if (nav) {
        setTtfb(nav.responseStart);
        setNavTiming({
          domContentLoaded: nav.domContentLoadedEventEnd - nav.startTime,
          loadEvent: nav.loadEventEnd - nav.startTime,
          domInteractive: nav.domInteractive - nav.startTime,
          domComplete: nav.domComplete - nav.startTime,
        });
      }

      const resourceEntries = performance.getEntriesByType(
        "resource",
      ) as PerformanceResourceTiming[];
      const rows: ResourceRow[] = resourceEntries.map((r) => ({
        name: r.name,
        type: r.initiatorType || "other",
        duration: r.duration,
        size: r.transferSize || 0,
      }));
      const totalSize = rows.reduce((sum, r) => sum + r.size, 0);
      const top = [...rows].sort((a, b) => b.size - a.size).slice(0, 10);
      setResourceSummary({ count: rows.length, totalSize, top });

      setHistory((prev) => {
        const next: HistoryPoint = {
          time: new Date().toLocaleTimeString(),
          fps,
          heapUsed,
        };
        const updated = [...prev, next];
        return updated.length > HISTORY_CAP
          ? updated.slice(updated.length - HISTORY_CAP)
          : updated;
      });
      setLastCheckedAt(new Date());
      if (options?.manual) {
        toast.success("Manual check complete — metrics refreshed.");
      }
      // eslint-disable-next-line react-hooks/exhaustive-deps
    },
    [fps, heapUsed],
  );

  const [hasSampled, setHasSampled] = useState(false);
  const [lastCheckedAt, setLastCheckedAt] = useState<Date | null>(null);
  const [isManualChecking, setIsManualChecking] = useState(false);

  function handleManualCheck() {
    setIsManualChecking(true);
    // The sample itself is synchronous/instant; a short delay just keeps the
    // spinner visible long enough to be seen as real feedback.
    setTimeout(() => {
      sampleOneOffMetrics({ manual: true });
      setIsManualChecking(false);
    }, 400);
  }

  // initial sample on mount
  useEffect(() => {
    sampleOneOffMetrics();
    setHasSampled(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // auto-sample interval
  useEffect(() => {
    if (!autoSample) return;
    const id = setInterval(() => {
      sampleOneOffMetrics();
    }, 5000);
    return () => clearInterval(id);
  }, [autoSample, sampleOneOffMetrics]);

  const fpsRating = rateFps(fps);
  const fcpRating = rateTimeMetric(fcp, 1800, 3000);
  const lcpRating = rateTimeMetric(lcpSupported ? lcp : null, 2500, 4000);
  const ttfbRating = rateTimeMetric(ttfb, 800, 1800);

  const kpis = useMemo(
    () => [
      {
        label: "FPS",
        value: fps === null ? "—" : `${fps}`,
        unit: "fps",
        rating: fpsRating,
        available: fps !== null,
      },
      {
        label: "Heap Used",
        value: heapSupported && heapUsed !== null ? heapUsed.toFixed(1) : "—",
        unit:
          heapSupported && heapTotal !== null
            ? `MB / ${heapTotal.toFixed(0)} MB total`
            : "MB",
        rating: "unknown" as Rating,
        available: heapSupported && heapUsed !== null,
      },
      {
        label: "FCP",
        value: formatMs(fcp),
        unit: "ms",
        rating: fcpRating,
        available: fcp !== null,
      },
      {
        label: "LCP",
        value: lcpSupported ? formatMs(lcp) : "—",
        unit: "ms",
        rating: lcpRating,
        available: lcpSupported && lcp !== null,
      },
      {
        label: "TTFB",
        value: formatMs(ttfb),
        unit: "ms",
        rating: ttfbRating,
        available: ttfb !== null,
      },
    ],
    [
      fps,
      fpsRating,
      heapSupported,
      heapUsed,
      fcp,
      fcpRating,
      lcpSupported,
      lcp,
      lcpRating,
      ttfb,
      ttfbRating,
    ],
  );

  const breaches = useMemo(() => {
    const list: { key: string; message: string }[] = [];
    if (fps !== null && fps < thresholds.minFps) {
      list.push({
        key: "fps",
        message: `FPS is ${fps}, below the ${thresholds.minFps} fps threshold.`,
      });
    }
    if (heapSupported && heapUsed !== null && heapUsed > thresholds.maxHeapMB) {
      list.push({
        key: "heap",
        message: `Heap usage is ${heapUsed.toFixed(1)} MB, above the ${thresholds.maxHeapMB} MB threshold.`,
      });
    }
    if (lcpSupported && lcp !== null && lcp > thresholds.maxLcpMs) {
      list.push({
        key: "lcp",
        message: `LCP is ${Math.round(lcp)} ms, above the ${thresholds.maxLcpMs} ms threshold.`,
      });
    }
    return list;
  }, [fps, heapSupported, heapUsed, lcpSupported, lcp, thresholds]);

  // Toast once per newly-crossed threshold (not on every sample while it
  // stays breached), and clear the "already notified" flag once a metric
  // recovers below/under its threshold again.
  useEffect(() => {
    if (!thresholdsLoaded) return;
    const activeKeys = new Set(breaches.map((b) => b.key));
    for (const breach of breaches) {
      if (!notifiedBreachesRef.current.has(breach.key)) {
        toast.warning(breach.message);
        notifiedBreachesRef.current.add(breach.key);
      }
    }
    for (const key of [...notifiedBreachesRef.current]) {
      if (!activeKeys.has(key)) notifiedBreachesRef.current.delete(key);
    }
  }, [breaches, thresholdsLoaded]);

  return (
    <div className="flex flex-col gap-6 p-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">
          Performance Monitor
        </h1>
        <p className="text-muted-foreground text-sm">
          Live browser performance metrics captured client-side — no data leaves
          your device.
        </p>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <Switch
            id="auto-sample"
            checked={autoSample}
            onCheckedChange={setAutoSample}
          />
          <Label htmlFor="auto-sample">Auto-sample every 5s</Label>
        </div>
        <div className="flex items-center gap-2">
          <Popover>
            <PopoverTrigger
              render={
                <Button variant="outline" size="sm">
                  <Bell className="size-4" />
                  Alert Thresholds
                </Button>
              }
            />
            <PopoverContent className="w-72 space-y-4">
              <div>
                <p className="text-sm font-medium">Alert thresholds</p>
                <p className="text-muted-foreground text-xs">
                  Flagged with a warning banner when crossed.
                </p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="min-fps">Minimum FPS</Label>
                <Input
                  id="min-fps"
                  type="number"
                  min={0}
                  value={thresholds.minFps}
                  onChange={(e) =>
                    updateThreshold("minFps", Number(e.target.value) || 0)
                  }
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="max-heap">Max heap used (MB)</Label>
                <Input
                  id="max-heap"
                  type="number"
                  min={0}
                  value={thresholds.maxHeapMB}
                  onChange={(e) =>
                    updateThreshold("maxHeapMB", Number(e.target.value) || 0)
                  }
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="max-lcp">Max LCP (ms)</Label>
                <Input
                  id="max-lcp"
                  type="number"
                  min={0}
                  value={thresholds.maxLcpMs}
                  onChange={(e) =>
                    updateThreshold("maxLcpMs", Number(e.target.value) || 0)
                  }
                />
              </div>
            </PopoverContent>
          </Popover>
          <Button
            onClick={handleManualCheck}
            variant="outline"
            size="sm"
            disabled={isManualChecking}
          >
            <RefreshCw
              className={cn("size-4", { "animate-spin": isManualChecking })}
            />
            Run Manual Check
          </Button>
          {lastCheckedAt && (
            <span className="text-xs text-muted-foreground">
              Last checked {lastCheckedAt.toLocaleTimeString()}
            </span>
          )}
        </div>
      </div>

      {breaches.length > 0 && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Performance threshold exceeded</AlertTitle>
          <AlertDescription>
            <ul className="list-inside list-disc">
              {breaches.map((b) => (
                <li key={b.key}>{b.message}</li>
              ))}
            </ul>
          </AlertDescription>
        </Alert>
      )}

      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        {!hasSampled
          ? Array.from({ length: 5 }).map((_, i) => (
              // biome-ignore lint/suspicious/noArrayIndexKey: static skeleton grid
              <Card key={i}>
                <CardHeader className="gap-1">
                  <Skeleton className="h-4 w-16" />
                  <Skeleton className="h-7 w-20" />
                </CardHeader>
                <CardContent>
                  <Skeleton className="h-5 w-24" />
                </CardContent>
              </Card>
            ))
          : kpis.map((kpi) => {
              const breachKey =
                kpi.label === "FPS"
                  ? "fps"
                  : kpi.label === "Heap Used"
                    ? "heap"
                    : kpi.label === "LCP"
                      ? "lcp"
                      : null;
              const isBreached =
                breachKey !== null && breaches.some((b) => b.key === breachKey);
              return (
                <Card
                  key={kpi.label}
                  className={isBreached ? "border-destructive" : undefined}
                >
                  <CardHeader className="gap-1">
                    <CardDescription>{kpi.label}</CardDescription>
                    <div className="flex items-baseline gap-1">
                      <span className="text-2xl font-semibold">
                        {kpi.value}
                      </span>
                      <span className="text-muted-foreground text-xs">
                        {kpi.unit}
                      </span>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <Badge
                      variant={
                        isBreached
                          ? "destructive"
                          : ratingBadgeVariant(kpi.rating)
                      }
                    >
                      {isBreached
                        ? "Threshold exceeded"
                        : kpi.available
                          ? kpi.rating.replace("-", " ")
                          : "Not available"}
                    </Badge>
                  </CardContent>
                </Card>
              );
            })}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>FPS &amp; Heap Usage Over Time</CardTitle>
          <CardDescription>
            Updated on manual check or auto-sample interval
          </CardDescription>
        </CardHeader>
        <CardContent>
          {history.length === 0 ? (
            <Empty>
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <Activity />
                </EmptyMedia>
                <EmptyTitle>No samples yet</EmptyTitle>
                <EmptyDescription>
                  Run a manual check to begin tracking performance.
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : (
            <ChartContainer config={chartConfig} className="h-64 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={history}>
                  <CartesianGrid vertical={false} />
                  <XAxis dataKey="time" tickLine={false} axisLine={false} />
                  <YAxis tickLine={false} axisLine={false} />
                  <ChartTooltip content={<ChartTooltipContent />} />
                  <Line
                    type="monotone"
                    dataKey="fps"
                    stroke="var(--color-fps)"
                    strokeWidth={2}
                    dot={false}
                    connectNulls
                  />
                  <Line
                    type="monotone"
                    dataKey="heapUsed"
                    stroke="var(--color-heapUsed)"
                    strokeWidth={2}
                    dot={false}
                    connectNulls
                  />
                </LineChart>
              </ResponsiveContainer>
            </ChartContainer>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Navigation Timing</CardTitle>
          <CardDescription>
            Milestones relative to navigation start, in milliseconds
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
            <div className="flex flex-col gap-1">
              <span className="text-muted-foreground text-xs">
                DOM Interactive
              </span>
              <span className="text-lg font-medium">
                {formatMs(navTiming.domInteractive)} ms
              </span>
            </div>
            <div className="flex flex-col gap-1">
              <span className="text-muted-foreground text-xs">
                DOM Content Loaded
              </span>
              <span className="text-lg font-medium">
                {formatMs(navTiming.domContentLoaded)} ms
              </span>
            </div>
            <div className="flex flex-col gap-1">
              <span className="text-muted-foreground text-xs">
                DOM Complete
              </span>
              <span className="text-lg font-medium">
                {formatMs(navTiming.domComplete)} ms
              </span>
            </div>
            <div className="flex flex-col gap-1">
              <span className="text-muted-foreground text-xs">Load Event</span>
              <span className="text-lg font-medium">
                {formatMs(navTiming.loadEvent)} ms
              </span>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Resource Timings</CardTitle>
          <CardDescription>
            {resourceSummary.count} resources loaded, totaling{" "}
            {formatBytes(resourceSummary.totalSize)} transferred (top 10 by
            size)
          </CardDescription>
        </CardHeader>
        <CardContent>
          {resourceSummary.top.length === 0 ? (
            <Empty>
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <Network />
                </EmptyMedia>
                <EmptyTitle>No resource entries yet</EmptyTitle>
                <EmptyDescription>
                  Resource timing data will appear here once the page loads
                  assets.
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead className="text-right">Duration (ms)</TableHead>
                  <TableHead className="text-right">Size</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {resourceSummary.top.map((row, i) => (
                  <TableRow key={`${row.name}-${i}`}>
                    <TableCell className="max-w-xs truncate">
                      {truncateName(row.name)}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">{row.type}</Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      {Math.round(row.duration)}
                    </TableCell>
                    <TableCell className="text-right">
                      {formatBytes(row.size)}
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
