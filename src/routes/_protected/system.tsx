import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { SystemStatusPage } from "@/components/system/SystemStatusPanel";
import { IntegrationHealthPage } from "@/components/system/IntegrationHealthPanel";
import { PerformancePage } from "@/components/system/PerformancePanel";
import { AuditLogPage } from "@/components/system/AuditLogPanel";
import { ErrorLogPage } from "@/components/system/ErrorLogPanel";
import { ChatLogPage } from "@/components/system/ChatLogPanel";

export const Route = createFileRoute("/_protected/system")({
  component: SystemMonitorPage,
});

const TABS = [
  { value: "status", label: "Status", Component: SystemStatusPage },
  {
    value: "integration",
    label: "Integration Health",
    Component: IntegrationHealthPage,
  },
  { value: "performance", label: "Performance", Component: PerformancePage },
  { value: "audit", label: "Audit Log", Component: AuditLogPage },
  { value: "errors", label: "Error Log", Component: ErrorLogPage },
  { value: "chatlog", label: "Chat Log", Component: ChatLogPage },
] as const;

/**
 * Consolidates what used to be 7 separate monitoring/dev-tool pages
 * (System Status, Integration Health, Performance, Audit Log, Error Log,
 * Query Console, Chat Log) into one page with tabs — Query Console was
 * later removed — to cut down on nav clutter for a non-technical audience.
 * Each tab's content only mounts
 * while it's the active tab, so things like the Performance tab's live
 * sampling loop still only run while that tab is actually open.
 */
function SystemMonitorPage() {
  const [tab, setTab] = useState<(typeof TABS)[number]["value"]>("status");

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          System Monitor
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Status, health, performance, and logs — all in one place.
        </p>
      </div>
      <Tabs
        value={tab}
        onValueChange={(v) => setTab(v as (typeof TABS)[number]["value"])}
      >
        <TabsList className="h-auto flex-wrap">
          {TABS.map((t) => (
            <TabsTrigger key={t.value} value={t.value}>
              {t.label}
            </TabsTrigger>
          ))}
        </TabsList>
        {TABS.map(({ value, Component }) => (
          <TabsContent key={value} value={value} className="mt-4">
            <Component />
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
}
