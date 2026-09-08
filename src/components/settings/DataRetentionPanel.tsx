import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { formatDistanceToNow } from "date-fns";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import {
  getDataRetentionSettings,
  runDataRetentionCleanup,
  saveDataRetentionSettings,
} from "@/services/db/settingsService";

const RETENTION_OPTIONS: { label: string; value: string }[] = [
  { label: "Keep forever", value: "forever" },
  { label: "30 days", value: "30" },
  { label: "90 days", value: "90" },
  { label: "180 days", value: "180" },
  { label: "365 days", value: "365" },
];

function toValue(days: number | null | undefined): string {
  return days == null ? "forever" : String(days);
}

function fromValue(value: string): number | null {
  return value === "forever" ? null : Number.parseInt(value, 10);
}

export function DataRetentionPanel({ enabled }: { enabled: boolean }) {
  const queryClient = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ["dataRetentionSettings"],
    queryFn: () => getDataRetentionSettings(),
    enabled,
  });

  const [errorDays, setErrorDays] = useState("forever");
  const [auditDays, setAuditDays] = useState("forever");
  const [chatDays, setChatDays] = useState("forever");

  useEffect(() => {
    if (data) {
      setErrorDays(toValue(data.errorLogRetentionDays));
      setAuditDays(toValue(data.auditLogRetentionDays));
      setChatDays(toValue(data.chatHistoryRetentionDays));
    }
  }, [data]);

  const saveMutation = useMutation({
    mutationFn: () =>
      saveDataRetentionSettings({
        data: {
          errorLogRetentionDays: fromValue(errorDays),
          auditLogRetentionDays: fromValue(auditDays),
          chatHistoryRetentionDays: fromValue(chatDays),
        },
      }),
    onSuccess: () => {
      toast.success("Retention settings saved");
      queryClient.invalidateQueries({ queryKey: ["dataRetentionSettings"] });
    },
    onError: () => toast.error("Couldn't save retention settings"),
  });

  const cleanupMutation = useMutation({
    mutationFn: () => runDataRetentionCleanup(),
    onSuccess: (result) => {
      toast.success(
        result.deletedCount > 0
          ? `Cleanup complete — removed ${result.deletedCount} row${
              result.deletedCount === 1 ? "" : "s"
            }.`
          : "Cleanup complete — nothing was old enough to remove.",
      );
      queryClient.invalidateQueries({ queryKey: ["dataRetentionSettings"] });
    },
    onError: () => toast.error("Cleanup failed"),
  });

  if (!enabled) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Data Retention</CardTitle>
          <CardDescription>Database not configured.</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  if (isLoading) {
    return <Skeleton className="h-64 w-full" />;
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Data Retention</CardTitle>
        <CardDescription>
          Choose how long to keep Error Log, Audit Log, and Chat History
          entries. "Run cleanup now" permanently deletes anything older than the
          limits below.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-6">
        <div className="flex flex-col gap-2">
          <Label>Error Log</Label>
          <Select value={errorDays} onValueChange={(v) => v && setErrorDays(v)}>
            <SelectTrigger className="max-w-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {RETENTION_OPTIONS.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex flex-col gap-2">
          <Label>Audit Log</Label>
          <Select value={auditDays} onValueChange={(v) => v && setAuditDays(v)}>
            <SelectTrigger className="max-w-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {RETENTION_OPTIONS.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex flex-col gap-2">
          <Label>Chat History</Label>
          <Select value={chatDays} onValueChange={(v) => v && setChatDays(v)}>
            <SelectTrigger className="max-w-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {RETENTION_OPTIONS.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-sm text-muted-foreground">
            Removes whole conversations (and their messages) older than the
            limit, not individual messages.
          </p>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-4">
          <p className="text-sm text-muted-foreground">
            {data?.lastCleanupAt
              ? `Last cleanup: ${formatDistanceToNow(new Date(data.lastCleanupAt), { addSuffix: true })} — removed ${data.lastCleanupDeletedCount ?? 0} row${data.lastCleanupDeletedCount === 1 ? "" : "s"}.`
              : "Cleanup has never been run."}
          </p>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => saveMutation.mutate()}
              disabled={saveMutation.isPending}
            >
              Save limits
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={() => cleanupMutation.mutate()}
              disabled={cleanupMutation.isPending}
            >
              Run cleanup now
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
