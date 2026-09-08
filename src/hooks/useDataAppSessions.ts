import { skipToken, useQuery } from "@tanstack/react-query";
import { trpc } from "@/integrations/trpc/react";

export function useWorkflowDataAppConfig(workflowId: string) {
  const t = trpc.useTRPC();
  return useQuery({
    ...t.workflows.getWorkflowDataAppConfig.queryOptions(
      workflowId || skipToken,
    ),
  });
}

export function useDataAppSessions(dataAppId: string | undefined) {
  const t = trpc.useTRPC();
  return useQuery({
    ...t.workflows.getDataAppSessions.queryOptions(dataAppId ?? skipToken),
  });
}

export function useDataAppSessionMessages(sessionDbId: number | null) {
  const t = trpc.useTRPC();
  return useQuery({
    ...t.workflows.getDataAppSessionMessages.queryOptions(
      sessionDbId ?? skipToken,
    ),
  });
}
