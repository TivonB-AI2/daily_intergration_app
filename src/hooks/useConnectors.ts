import {
  skipToken,
  useQuery,
  useMutation,
  type UseQueryOptions,
  type UseMutationOptions,
} from "@tanstack/react-query";
import { trpc } from "@/integrations/trpc/react";
import type {
  ConnectorResponse,
  ExecuteModelInput,
  ExecuteModelResponse,
  ListConnectorsParams,
  ListConnectorsResponse,
  QuerySourcePayload,
  QuerySourceResponse,
} from "@/services/connectors/types";

export const connectorsKeys = {
  all: ["connectors"] as const,
  lists: () => [...connectorsKeys.all, "list"] as const,
  list: (params?: ListConnectorsParams) =>
    [...connectorsKeys.lists(), params] as const,
  details: () => [...connectorsKeys.all, "detail"] as const,
  detail: (id: string | number) => [...connectorsKeys.details(), id] as const,
};

export function useConnectors(
  params?: ListConnectorsParams,
  options?: Omit<
    UseQueryOptions<
      ListConnectorsResponse,
      Error,
      ListConnectorsResponse,
      ReturnType<typeof connectorsKeys.list>
    >,
    "queryKey" | "queryFn"
  >,
) {
  const t = trpc.useTRPC();
  // @ts-expect-error — tRPC + React Query option merge
  return useQuery({
    ...t.connectors.list.queryOptions(params),
    ...options,
  });
}

export function useConnector(
  id: string | number | null | undefined,
  options?: Omit<
    UseQueryOptions<
      ConnectorResponse,
      Error,
      ConnectorResponse,
      ReturnType<typeof connectorsKeys.detail>
    >,
    "queryKey" | "queryFn"
  >,
) {
  const t = trpc.useTRPC();
  // @ts-expect-error — tRPC + React Query option merge
  return useQuery({
    ...t.connectors.get.queryOptions(id ?? skipToken),
    ...options,
  });
}

/**
 * Mutation hook to run a connector source query.
 * Call mutate({ connectorId, payload: { query: "SELECT ..." } }).
 * Payload uses `query` key, not `sql`.
 * Response rows are at mutation.data?.data.
 * For paginated queries, use usePaginatedQuerySource instead.
 */
export function useQuerySource(
  options?: UseMutationOptions<
    QuerySourceResponse,
    Error,
    { connectorId: string | number; payload: QuerySourcePayload }
  >,
) {
  const t = trpc.useTRPC();
  // @ts-expect-error — tRPC + React Query option merge
  return useMutation({
    ...t.connectors.querySource.mutationOptions(),
    ...options,
  });
}

/** Execute an AI/ML source connector. See `/base/src/services/AGENTS.md`. */
export function useExecuteModel(
  options?: UseMutationOptions<ExecuteModelResponse, Error, ExecuteModelInput>,
) {
  const t = trpc.useTRPC();
  // @ts-expect-error — tRPC + React Query option merge
  return useMutation({
    ...t.connectors.executeModel.mutationOptions(),
    ...options,
  });
}
