import { useQuery } from "@tanstack/react-query";
import { formatDistanceToNow } from "date-fns";
import {
  CheckCircle2,
  XCircle,
  Database,
  HardDrive,
  Archive,
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
import {
  getSystemStatus,
  getWorkspaceInfo,
} from "@/services/db/settingsService";

function formatBytes(bytes: number): string {
  if (bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const exp = Math.min(
    Math.floor(Math.log(bytes) / Math.log(1024)),
    units.length - 1,
  );
  return `${(bytes / 1024 ** exp).toFixed(exp === 0 ? 0 : 1)} ${units[exp]}`;
}

function ConnectionBadge({ connected }: { connected: boolean }) {
  return connected ? (
    <Badge variant="secondary" className="gap-1">
      <CheckCircle2 className="h-3 w-3" /> Connected
    </Badge>
  ) : (
    <Badge variant="outline" className="gap-1">
      <XCircle className="h-3 w-3" /> Not connected
    </Badge>
  );
}

export function SystemStatusPage() {
  const { data: caps, isLoading: capsLoading } = useCapabilities();
  const dbEnabled = caps?.databaseEnabled === true;

  const { data: status, isLoading: statusLoading } = useQuery({
    queryKey: ["systemStatus"],
    queryFn: () => getSystemStatus(),
    enabled: dbEnabled,
  });
  const { data: info, isLoading: infoLoading } = useQuery({
    queryKey: ["workspaceInfo"],
    queryFn: () => getWorkspaceInfo(),
    enabled: dbEnabled,
  });
  const { data: connectorsRes, isLoading: connectorsLoading } = useConnectors({
    per_page: 100,
  });

  if (capsLoading) {
    return (
      <div className="mx-auto flex max-w-4xl flex-col gap-6 p-6">
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-6 p-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">System Status</h1>
        <p className="text-sm text-muted-foreground">
          Live connection status for this app's database and storage, and a
          summary of what's currently in them.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Database className="h-4 w-4" /> Database
          </CardTitle>
          <CardDescription>
            Backed by Neon Postgres. Powers every feature that saves or tracks
            data (To-Do, Error Log, Audit Log, Backups, and more).
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <ConnectionBadge connected={dbEnabled} />
          {dbEnabled &&
            (infoLoading ? (
              <Skeleton className="h-24 w-full" />
            ) : (
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                <div className="flex flex-col gap-1 rounded-lg border p-3">
                  <span className="text-xs text-muted-foreground">Tasks</span>
                  <span className="text-lg font-semibold">
                    {info?.todoCount ?? 0}
                  </span>
                </div>
                <div className="flex flex-col gap-1 rounded-lg border p-3">
                  <span className="text-xs text-muted-foreground">
                    Error Log
                  </span>
                  <span className="text-lg font-semibold">
                    {info?.errorCount ?? 0}
                  </span>
                </div>
                <div className="flex flex-col gap-1 rounded-lg border p-3">
                  <span className="text-xs text-muted-foreground">
                    Audit Log
                  </span>
                  <span className="text-lg font-semibold">
                    {info?.auditCount ?? 0}
                  </span>
                </div>
                <div className="flex flex-col gap-1 rounded-lg border p-3">
                  <span className="text-xs text-muted-foreground">
                    Chat conversations
                  </span>
                  <span className="text-lg font-semibold">
                    {info?.chatConversationCount ?? 0}
                  </span>
                </div>
              </div>
            ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <HardDrive className="h-4 w-4" /> Storage
          </CardTitle>
          <CardDescription>
            S3-compatible object storage. Powers file uploads, exports, and app
            backups.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <ConnectionBadge connected={caps?.s3Enabled === true} />
          {caps?.s3Enabled &&
            (infoLoading ? (
              <Skeleton className="h-24 w-full" />
            ) : (
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                <div className="flex flex-col gap-1 rounded-lg border p-3">
                  <span className="text-xs text-muted-foreground">
                    Total files
                  </span>
                  <span className="text-lg font-semibold">
                    {info?.storageFileCount ?? 0}
                  </span>
                </div>
                <div className="flex flex-col gap-1 rounded-lg border p-3">
                  <span className="text-xs text-muted-foreground">
                    Storage used
                  </span>
                  <span className="text-lg font-semibold">
                    {formatBytes(info?.storageBytes ?? 0)}
                  </span>
                </div>
                <div className="flex flex-col gap-1 rounded-lg border p-3">
                  <span className="text-xs text-muted-foreground">Uploads</span>
                  <span className="text-lg font-semibold">
                    {info?.folderBreakdown?.uploads ?? 0}
                  </span>
                </div>
                <div className="flex flex-col gap-1 rounded-lg border p-3">
                  <span className="text-xs text-muted-foreground">Exports</span>
                  <span className="text-lg font-semibold">
                    {info?.folderBreakdown?.exports ?? 0}
                  </span>
                </div>
              </div>
            ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Archive className="h-4 w-4" /> Last Backup
          </CardTitle>
          <CardDescription>
            Most recent snapshot created from the Settings &gt; Backups tab.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {statusLoading ? (
            <Skeleton className="h-12 w-full" />
          ) : status?.lastBackup ? (
            <p className="text-sm">
              {formatDistanceToNow(new Date(status.lastBackup.createdAt), {
                addSuffix: true,
              })}{" "}
              — {status.lastBackup.tableCount} tables,{" "}
              {status.lastBackup.rowCount} rows,{" "}
              {formatBytes(status.lastBackup.sizeBytes)}
            </p>
          ) : (
            <p className="text-sm text-muted-foreground">
              No backups have been created yet.
            </p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Connectors</CardTitle>
          <CardDescription>
            Data source and destination connectors linked to this workspace.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-2xl font-semibold tracking-tight">
            {connectorsLoading ? "…" : (connectorsRes?.data?.length ?? 0)}
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
