import { createFileRoute } from "@tanstack/react-router";
import { getResponse } from "@tanstack/react-start/server";
import { setAppAuthCookie } from "@/server/authCookie";

function isIframeRequest(request: Request): boolean {
  // Fetch metadata header for iframe navigations.
  return request.headers.get("sec-fetch-dest")?.toLowerCase() === "iframe";
}

export const Route = createFileRoute("/iframe-auth")({
  server: {
    handlers: {
      GET: ({ request }) => {
        if (!isIframeRequest(request)) {
          return new Response("Forbidden: iframe only", { status: 403 });
        }

        const url = new URL(request.url);
        const authToken = url.searchParams.get("authToken");

        if (!authToken) {
          return new Response("Missing authToken", { status: 400 });
        }

        setAppAuthCookie(authToken, "none");

        const headers = new Headers(getResponse().headers);
        headers.set("Location", "/");

        return new Response(null, {
          status: 302,
          headers,
        });
      },
    },
  },
});
