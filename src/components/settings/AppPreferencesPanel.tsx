import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
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
  getAppPreferences,
  saveAppPreferences,
} from "@/services/db/settingsService";

const TIMEZONES = [
  "UTC",
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Los_Angeles",
  "Europe/London",
  "Europe/Paris",
  "Asia/Tokyo",
  "Asia/Kolkata",
  "Australia/Sydney",
];

const LANGUAGES = ["English", "Spanish", "French"];

type Draft = {
  displayName: string;
  timezone: string;
  language: string;
  compactDensity: boolean;
  sidebarCollapsed: boolean;
};

const DEFAULT_DRAFT: Draft = {
  displayName: "",
  timezone: "UTC",
  language: "English",
  compactDensity: false,
  sidebarCollapsed: false,
};

export function AppPreferencesPanel({ enabled }: { enabled: boolean }) {
  const queryClient = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ["appPreferences"],
    queryFn: () => getAppPreferences(),
    enabled,
  });

  const [draft, setDraft] = useState<Draft>(DEFAULT_DRAFT);

  useEffect(() => {
    if (data) {
      setDraft({
        displayName: data.displayName,
        timezone: data.timezone,
        language: data.language,
        compactDensity: data.compactDensity,
        sidebarCollapsed: data.sidebarCollapsed,
      });
    }
  }, [data]);

  const saved: Draft = useMemo(
    () =>
      data
        ? {
            displayName: data.displayName,
            timezone: data.timezone,
            language: data.language,
            compactDensity: data.compactDensity,
            sidebarCollapsed: data.sidebarCollapsed,
          }
        : DEFAULT_DRAFT,
    [data],
  );

  const hasUnsavedChanges = JSON.stringify(saved) !== JSON.stringify(draft);

  const saveMutation = useMutation({
    mutationFn: () => saveAppPreferences({ data: draft }),
    onSuccess: () => {
      toast.success("Preferences saved");
      queryClient.invalidateQueries({ queryKey: ["appPreferences"] });
    },
    onError: () => toast.error("Couldn't save preferences"),
  });

  const update = <K extends keyof Draft>(key: K, value: Draft[K]) => {
    setDraft((prev) => ({ ...prev, [key]: value }));
  };

  if (!enabled) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>App Preferences</CardTitle>
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
      <CardHeader className="flex flex-row items-start justify-between gap-3">
        <div>
          <CardTitle>App Preferences</CardTitle>
          <CardDescription>
            Basic profile and localization preferences, saved to the database so
            they persist across sessions and devices.
          </CardDescription>
        </div>
        <div className="flex items-center gap-2">
          {hasUnsavedChanges && (
            <Badge variant="secondary">Unsaved changes</Badge>
          )}
          <Button
            type="button"
            variant="outline"
            onClick={() => setDraft(saved)}
            disabled={!hasUnsavedChanges}
          >
            Reset
          </Button>
          <Button
            type="button"
            onClick={() => saveMutation.mutate()}
            disabled={!hasUnsavedChanges || saveMutation.isPending}
          >
            Save
          </Button>
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-6">
        <div className="flex flex-col gap-2">
          <Label htmlFor="display-name">Display name</Label>
          <Input
            id="display-name"
            value={draft.displayName}
            onChange={(e) => update("displayName", e.target.value)}
            placeholder="Your name"
            className="max-w-sm"
          />
        </div>

        <div className="flex flex-col gap-2">
          <Label>Timezone</Label>
          <Select
            value={draft.timezone}
            onValueChange={(v) => v && update("timezone", v)}
          >
            <SelectTrigger className="max-w-sm">
              <SelectValue placeholder="Select timezone" />
            </SelectTrigger>
            <SelectContent>
              {TIMEZONES.map((tz) => (
                <SelectItem key={tz} value={tz}>
                  {tz}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex flex-col gap-2">
          <Label>Language</Label>
          <Select
            value={draft.language}
            onValueChange={(v) => v && update("language", v)}
          >
            <SelectTrigger className="max-w-sm">
              <SelectValue placeholder="Select language" />
            </SelectTrigger>
            <SelectContent>
              {LANGUAGES.map((lang) => (
                <SelectItem key={lang} value={lang}>
                  {lang}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex items-center justify-between gap-4">
          <div className="flex flex-col gap-1">
            <Label htmlFor="compact-density">Compact density</Label>
            <p className="text-sm text-muted-foreground">
              Reduce spacing to fit more content on screen.
            </p>
          </div>
          <Switch
            id="compact-density"
            checked={draft.compactDensity}
            onCheckedChange={(v) => update("compactDensity", v)}
          />
        </div>

        <div className="flex items-center justify-between gap-4">
          <div className="flex flex-col gap-1">
            <Label htmlFor="sidebar-collapsed">
              Sidebar collapsed by default
            </Label>
            <p className="text-sm text-muted-foreground">
              Start with the navigation sidebar minimized.
            </p>
          </div>
          <Switch
            id="sidebar-collapsed"
            checked={draft.sidebarCollapsed}
            onCheckedChange={(v) => update("sidebarCollapsed", v)}
          />
        </div>
      </CardContent>
    </Card>
  );
}
