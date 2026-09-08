import { useState, useEffect, useRef, useCallback } from "react";
import { useQuerySource } from "@/hooks/useConnectors";

/** The backend hard-caps every querySource call at 50 rows. */
const SERVER_BATCH_LIMIT = 50;

export type UsePaginatedQuerySourceOptions = {
  connectorId: string | number;
  /** Base SQL query — do NOT include OFFSET or LIMIT; those are managed by this hook. */
  query: string;
  /** Number of rows to show per page. Default: 10. */
  perPage?: number;
};

export type UsePaginatedQuerySourceResult = {
  /** Rows for the current page. */
  rows: unknown[];
  /** All rows fetched so far across all batches. */
  allRows: unknown[];
  /** 1-based current page index. */
  currentPage: number;
  /** Navigate to a specific page. */
  setPage: (page: number) => void;
  /** Number of rows per page. */
  perPage: number;
  /** True while a server fetch is in progress. */
  isLoading: boolean;
  /** Error from the last fetch attempt, if any. */
  error: Error | null;
  /** True if there is a next page (either cached or fetchable). */
  hasNextPage: boolean;
  /** True if there is a previous page. */
  hasPreviousPage: boolean;
  /** Total number of rows fetched from the server so far. */
  totalFetched: number;
};

/**
 * Paginated connector query hook.
 *
 * The backend adds LIMIT 50 to every querySource call. This hook:
 * - Accumulates fetched batches client-side (pages come from the cache)
 * - Only fetches the next 50-row batch when the user navigates beyond cached rows
 * - Appends OFFSET <n> to the query when fetching subsequent batches
 *
 * Example:
 * ```tsx
 * const { rows, currentPage, setPage, hasNextPage, isLoading } =
 *   usePaginatedQuerySource({
 *     connectorId: 2,
 *     query: 'SELECT * FROM "users"',
 *     perPage: 10,
 *   });
 * ```
 * Pages 1-5 are served from the first 50-row batch (no extra fetch).
 * Page 6 triggers a fetch with OFFSET 50.
 */
export function usePaginatedQuerySource({
  connectorId,
  query,
  perPage = 10,
}: UsePaginatedQuerySourceOptions): UsePaginatedQuerySourceResult {
  const [allRows, setAllRows] = useState<unknown[]>([]);
  const [currentPage, setCurrentPage] = useState(1);
  // false once a batch returns fewer than SERVER_BATCH_LIMIT rows
  const [serverHasMore, setServerHasMore] = useState(true);
  const initialFetchDone = useRef(false);

  const mutation = useQuerySource();
  // Stable ref to mutation.mutate so fetchBatch doesn't need it as a dep
  const mutateRef = useRef(mutation.mutate);
  mutateRef.current = mutation.mutate;

  const fetchBatch = useCallback(
    (offset: number) => {
      const offsetClause = offset > 0 ? ` OFFSET ${offset}` : "";
      mutateRef.current(
        { connectorId, payload: { query: `${query}${offsetClause}` } },
        {
          onSuccess: (res) => {
            const batch = (res?.data as unknown[]) ?? [];
            setAllRows((prev) => [...prev, ...batch]);
            if (batch.length < SERVER_BATCH_LIMIT) {
              setServerHasMore(false);
            }
          },
        },
      );
    },
    [connectorId, query],
  );

  // Reset state when query or connector changes
  // biome-ignore lint/correctness/useExhaustiveDependencies: connectorId and query are props; resetting when they change is intentional
  useEffect(() => {
    setAllRows([]);
    setCurrentPage(1);
    setServerHasMore(true);
    initialFetchDone.current = false;
  }, [connectorId, query]);

  // Initial fetch
  useEffect(() => {
    if (!initialFetchDone.current) {
      initialFetchDone.current = true;
      fetchBatch(0);
    }
  }, [fetchBatch]);

  // Fetch next batch when the user navigates beyond cached rows
  useEffect(() => {
    const neededEnd = currentPage * perPage;
    const needsFetch =
      neededEnd > allRows.length && serverHasMore && !mutation.isPending;
    if (needsFetch) {
      fetchBatch(allRows.length);
    }
  }, [
    currentPage,
    perPage,
    allRows.length,
    serverHasMore,
    mutation.isPending,
    fetchBatch,
  ]);

  const pageRows = allRows.slice(
    (currentPage - 1) * perPage,
    currentPage * perPage,
  );

  const hasNextPage =
    currentPage * perPage < allRows.length ||
    (serverHasMore && !mutation.isPending);
  const hasPreviousPage = currentPage > 1;

  return {
    rows: pageRows,
    allRows,
    currentPage,
    setPage: setCurrentPage,
    perPage,
    isLoading: mutation.isPending,
    error: mutation.error,
    hasNextPage,
    hasPreviousPage,
    totalFetched: allRows.length,
  };
}
