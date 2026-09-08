import { createFileRoute } from "@tanstack/react-router";
import { useCapabilities } from "@/hooks/useCapabilities";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AppPreferencesPanel } from "@/components/settings/AppPreferencesPanel";
import { DataRetentionPanel } from "@/components/settings/DataRetentionPanel";
import { WorkspaceInfoPanel } from "@/components/settings/WorkspaceInfoPanel";
import { BackupsPanel } from "@/components/settings/BackupsPanel";

export const Route = createFileRoute("/_protected/settings")({
  component: SettingsPage,
});

function SettingsPage() {
  const { data: caps } = useCapabilities();
  const dbEnabled = caps?.databaseEnabled === true;

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-6 p-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
        <p className="text-sm text-muted-foreground">
          Manage app preferences, data retention, workspace info, and backups.
        </p>
      </div>

      <Tabs defaultValue="preferences">
        <TabsList className="h-auto flex-wrap justify-start">
          <TabsTrigger value="preferences">App Preferences</TabsTrigger>
          <TabsTrigger value="retention">Data Retention</TabsTrigger>
          <TabsTrigger value="workspace">Workspace Info</TabsTrigger>
          <TabsTrigger value="backups">Backups</TabsTrigger>
        </TabsList>

        <TabsContent value="preferences">
          <AppPreferencesPanel enabled={dbEnabled} />
        </TabsContent>

        <TabsContent value="retention">
          <DataRetentionPanel enabled={dbEnabled} />
        </TabsContent>

        <TabsContent value="workspace">
          <WorkspaceInfoPanel enabled={dbEnabled} />
        </TabsContent>

        <TabsContent value="backups">
          <BackupsPanel enabled={dbEnabled} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
