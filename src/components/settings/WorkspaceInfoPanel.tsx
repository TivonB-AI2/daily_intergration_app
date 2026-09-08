import { useQuery } from "@tanstack/react-query";
import {
  CheckSquare,
  AlertTriangle,
  ScrollText,
  FileBox,
  MessageSquare,
  Plug,
  HardDrive,
  Database,
  CheckCircle2,
  XCircle,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useCapabilities } from "@/hooks/useCapabilities";
import { useConnectors } from "@/hooks/useConnectors";
import { getWorkspaceInfo } from "@/services/db/settingsService";

function formatBytes(bytes: number): string {
  if (bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const exp = Math.min(
    Math.floor(Math.log(bytes) / Math.log(1024)),
    units.length - 1,
  );
  return `${(bytes / 1024 ** exp).toFixed(exp === 0 ? 0 : 1)} ${units[exp]}`;
}

export function WorkspaceInfoPanel({ enabled }: { enabled: boolean }) {
  const { data: caps } = useCapabilities();
  const { data, isLoading } = useQuery({
    queryKey: ["workspaceInfo"],
    queryFn: () => getWorkspaceInfo(),
    enabled,
    staleTime: 30_000,
  });
  const { data: connectorsRes, isLoading: connectorsLoading } = useConnectors({
    per_page: 100,
  });

  if (!enabled) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Workspace Info</CardTitle>
          <CardDescription>Database not configured.</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  if (isLoading) {
    return <Skeleton className="h-64 w-full" />;
  }

  const stats = [
    { label: "Tasks", value: data?.todoCount ?? 0, icon: CheckSquare },
    {
      label: "Error Log entries",
      value: data?.errorCount ?? 0,
      icon: AlertTriangle,
    },
    {
      label: "Audit Log entries",
      value: data?.auditCount ?? 0,
      icon: ScrollText,
    },
    {
      label: "Storage files",
      value: data?.storageFileCount ?? 0,
      icon: FileBox,
    },
    {
      label: "Chat conversations",
      value: data?.chatConversationCount ?? 0,
      icon: MessageSquare,
    },
    {
      label: "Connectors",
      value: connectorsLoading ? "…" : (connectorsRes?.data?.length ?? 0),
      icon: Plug,
    },
  ];

  return (
    <Card>
      <CardHeader>
        <CardTitle>Workspace Info</CardTitle>
        <CardDescription>
          A live, read-only snapshot of what's stored in this app right now.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-6">
        <div className="flex flex-wrap gap-3">
          <div className="flex items-center gap-2 rounded-lg border px-3 py-2">
            <Database className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm">Database</span>
            {caps?.databaseEnabled ? (
              <Badge variant="secondary" className="gap-1">
                <CheckCircle2 className="h-3 w-3" /> Connected
              </Badge>
            ) : (
              <Badge variant="outline" className="gap-1">
                <XCircle className="h-3 w-3" /> Not connected
              </Badge>
            )}
          </div>
          <div className="flex items-center gap-2 rounded-lg border px-3 py-2">
            <HardDrive className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm">Storage</span>
            {caps?.s3Enabled ? (
              <Badge variant="secondary" className="gap-1">
                <CheckCircle2 className="h-3 w-3" /> Connected
              </Badge>
            ) : (
              <Badge variant="outline" className="gap-1">
                <XCircle className="h-3 w-3" /> Not connected
              </Badge>
            )}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
          {stats.map((stat) => (
            <div
              key={stat.label}
              className="flex flex-col gap-1 rounded-lg border p-4"
            >
              <div className="flex items-center gap-2 text-muted-foreground">
                <stat.icon className="h-4 w-4" />
                <span className="text-xs">{stat.label}</span>
              </div>
              <span className="text-2xl font-semibold tracking-tight">
                {stat.value}
              </span>
            </div>
          ))}
          <div className="flex flex-col gap-1 rounded-lg border p-4">
            <div className="flex items-center gap-2 text-muted-foreground">
              <HardDrive className="h-4 w-4" />
              <span className="text-xs">Storage used</span>
            </div>
            <span className="text-2xl font-semibold tracking-tight">
              {formatBytes(data?.storageBytes ?? 0)}
            </span>
          </div>
        </div>

        {caps?.s3Enabled && data?.folderBreakdown && (
          <div className="flex flex-col gap-2">
            <p className="text-xs text-muted-foreground">
              Storage files by folder
            </p>
            <div className="grid grid-cols-3 gap-4">
              <div className="flex flex-col gap-1 rounded-lg border p-3">
                <span className="text-xs text-muted-foreground">Uploads</span>
                <span className="text-lg font-semibold">
                  {data.folderBreakdown.uploads}
                </span>
              </div>
              <div className="flex flex-col gap-1 rounded-lg border p-3">
                <span className="text-xs text-muted-foreground">Exports</span>
                <span className="text-lg font-semibold">
                  {data.folderBreakdown.exports}
                </span>
              </div>
              <div className="flex flex-col gap-1 rounded-lg border p-3">
                <span className="text-xs text-muted-foreground">Assets</span>
                <span className="text-lg font-semibold">
                  {data.folderBreakdown.assets}
                </span>
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
