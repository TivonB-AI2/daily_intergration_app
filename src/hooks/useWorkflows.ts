import { useMutation, type UseMutationOptions } from "@tanstack/react-query";
import { trpc } from "@/integrations/trpc/react";
import type {
  RunWorkflowPayload,
  RunWorkflowResponse,
} from "@/services/workflows/types";

export type RunWorkflowMutationVariables = RunWorkflowPayload & {
  dataAppId?: string;
  dataAppToken?: string;
  dataAppSessionId?: string;
};

export function useRunWorkflow(
  workflowId: string,
  options?: UseMutationOptions<
    RunWorkflowResponse,
    Error,
    RunWorkflowMutationVariables
  >,
) {
  const client = trpc.useTRPCClient();
  return useMutation({
    ...options,
    mutationFn: async (vars: RunWorkflowMutationVariables) => {
      return client.workflows.run.mutate({
        ...vars,
        workflowId,
      });
    },
  });
}
