import { useQuery, type UseQueryOptions } from "@tanstack/react-query";

type QueryKey = readonly unknown[];

/**
 * Simple query wrapper. Previously workspace-scoped, but workspace ID is now
 * handled server-side in the fetch utilities. Use raw useQuery for non-cached
 * queries (e.g. auth, embed sessions).
 */
export default function useQueryWrapper<TData = unknown, TError = Error>(
  queryKey: QueryKey,
  queryFn: () => Promise<TData>,
  options?: Omit<
    UseQueryOptions<TData, TError, TData, QueryKey>,
    "queryKey" | "queryFn"
  >,
) {
  return useQuery({
    queryKey,
    queryFn,
    ...options,
  });
}
