import { createFileRoute } from "@tanstack/react-router";
import { getResponse } from "@tanstack/react-start/server";
import { fetchRequestHandler } from "@trpc/server/adapters/fetch";
import { trpcRouter } from "@/integrations/trpc/router";
import { createTRPCContext } from "@/integrations/trpc/context";

function handleRequest(request: Request) {
  const responseHeaders = new Headers();
  return fetchRequestHandler({
    endpoint: "/api/trpc",
    req: request,
    router: trpcRouter,
    createContext: () =>
      createTRPCContext({
        request,
        responseHeaders,
      }),
  }).then((res) => {
    const headers = new Headers(res.headers);
    getResponse().headers.forEach((value, key) => {
      headers.append(key, value);
    });
    responseHeaders.forEach((value, key) => {
      headers.append(key, value);
    });
    return new Response(res.body, {
      status: res.status,
      statusText: res.statusText,
      headers,
    });
  });
}

export const Route = createFileRoute("/api/trpc/$")({
  server: {
    handlers: {
      GET: ({ request }) => handleRequest(request),
      POST: ({ request }) => handleRequest(request),
    },
  },
});
