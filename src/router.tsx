import { createRouter as createTanStackRouter } from "@tanstack/react-router";
import { QueryClient, QueryCache, MutationCache } from "@tanstack/react-query";
import { setupRouterSsrQueryIntegration } from "@tanstack/react-router-ssr-query";
import { TRPCClientError } from "@trpc/client";
import { routeTree } from "./routeTree.gen";
import { trpc } from "@/integrations/trpc/react";
import { createTrpcClient } from "@/integrations/trpc/createTrpcClient";

function isUnauthorizedTrpcError(error: unknown) {
  return (
    error instanceof TRPCClientError && error.data?.code === "UNAUTHORIZED"
  );
}

/** tRPC procedure namespaces whose 401s are hard-redirected to sign-in
 * (real app-session auth failures). Any namespace NOT listed here is
 * assumed to be able to legitimately 401 for reasons that have nothing to
 * do with this app's own session — e.g. `connectors`/`workflows` simply
 * forward whatever the platform's own downstream API returns (base's
 * `platformRequest`/`enterpriseApiFetch` map ANY upstream 401, including a
 * connector-specific model-execution permission gate, to the exact same
 * tRPC `UNAUTHORIZED` code as "your session expired" — there is no way to
 * distinguish the two from the error alone). Every page that calls
 * `connectors.*`/`workflows.*` (AI Chat, AI Insights, Query, Workflows,
 * Document Pipeline, Data Explorer, etc.) already has its own local 401
 * handling to show a clear inline message — this global handler hard
 * navigating out from under them (via `window.location.assign`, bypassing
 * every route's own error handling/`errorComponent` entirely, since it's a
 * real browser navigation, not a React error) was overriding that and is
 * what caused a page to appear to "reset to the Dashboard" whenever one of
 * those connector-level calls failed. */
const AUTH_REDIRECT_PROCEDURE_NAMESPACES = new Set(["auth", "capabilities"]);

function trpcProcedurePath(key: unknown): string[] | null {
  if (!Array.isArray(key) || key.length === 0) return null;
  const first = key[0];
  return Array.isArray(first) && first.every((p) => typeof p === "string")
    ? (first as string[])
    : null;
}

function shouldRedirectForTrpcError(error: unknown, key: unknown): boolean {
  if (!isUnauthorizedTrpcError(error)) return false;
  const path = trpcProcedurePath(key);
  // Unknown/non-tRPC key shape: fall back to the previous behavior rather
  // than silently never redirecting on a real session failure.
  if (!path || path.length === 0) return true;
  return AUTH_REDIRECT_PROCEDURE_NAMESPACES.has(path[0]);
}

function handleTrpcAuthError(error: unknown, key: unknown) {
  if (typeof window === "undefined") return;
  if (!shouldRedirectForTrpcError(error, key)) return;
  if (window.location.pathname === "/sign-in") return;
  window.location.assign("/sign-in");
}

export function getRouter() {
  const trpcClient = createTrpcClient();
  const queryClient = new QueryClient({
    queryCache: new QueryCache({
      onError: (error, query) => handleTrpcAuthError(error, query.queryKey),
    }),
    mutationCache: new MutationCache({
      onError: (error, _variables, _context, mutation) =>
        handleTrpcAuthError(error, mutation.options.mutationKey),
    }),
    defaultOptions: {
      queries: {
        staleTime: 60 * 1000,
      },
    },
  });

  const router = createTanStackRouter({
    routeTree,
    context: { queryClient },
    scrollRestoration: true,
    defaultPreload: "intent",
    defaultPreloadStaleTime: 0,
    Wrap: ({ children }) => (
      <trpc.TRPCProvider trpcClient={trpcClient} queryClient={queryClient}>
        {children}
      </trpc.TRPCProvider>
    ),
  });

  setupRouterSsrQueryIntegration({ router, queryClient });

  return router;
}

declare module "@tanstack/react-router" {
  interface Register {
    router: ReturnType<typeof getRouter>;
  }
}
