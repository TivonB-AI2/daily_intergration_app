import {
  HeadContent,
  Outlet,
  Scripts,
  createRootRouteWithContext,
  redirect,
} from "@tanstack/react-router";
import { ThemeProvider } from "next-themes";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Toaster } from "@/components/ui/sonner";
import { BuiltWithBadge } from "@/components/BuiltWithBadge";

import appCss from "../styles.css?url";

import type { QueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { initAhoy } from "@/lib/ahoy-init";
import { getAuthState } from "@/server/auth";

interface MyRouterContext {
  queryClient: QueryClient;
}

export const Route = createRootRouteWithContext<MyRouterContext>()({
  // Centralized auth gate — protected by default. Public routes (/sign-in,
  // /iframe-auth) and the API endpoint are exempt to avoid redirect loops.
  beforeLoad: async ({ location }) => {
    const params = new URLSearchParams(location.searchStr);
    const authToken = params.get("authToken");
    // Embedded entry: capture the token and hand off to /iframe-auth (once).
    if (authToken && location.pathname !== "/iframe-auth") {
      const cleanSearch = Array.from(params.entries())
        .filter(([k]) => k !== "authToken")
        .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
        .join("&");
      const redirectTo = `${location.pathname}${cleanSearch ? `?${cleanSearch}` : ""}${location.hash}`;
      throw redirect({
        to: "/iframe-auth",
        search: { authToken, redirect: redirectTo || "/" },
        replace: true,
      });
    }
    if (
      location.pathname === "/iframe-auth" ||
      location.pathname.startsWith("/api")
    ) {
      return;
    }
    const auth = await getAuthState();
    if (location.pathname === "/sign-in") {
      // Public-link mode: no user auth, so skip the sign-in screen.
      if (!auth.authEnabled) throw redirect({ to: "/", replace: true });
      return;
    }
    if (!auth.allowed) {
      throw redirect({ to: "/sign-in", replace: true });
    }
  },
  head: () => ({
    meta: [
      {
        charSet: "utf-8",
      },
      {
        name: "viewport",
        content: "width=device-width, initial-scale=1",
      },
      {
        title: "AppGen",
      },
    ],
    links: [
      {
        rel: "stylesheet",
        href: appCss,
      },
      {
        rel: "icon",
        href: "/favicon.svg",
      },
    ],
  }),
  component: RootLayout,
  shellComponent: RootDocument,
  notFoundComponent: () => {
    return <div>Page not found</div>;
  },
});

function RootLayout() {
  return <Outlet />;
}

function RootDocument({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    initAhoy();
  }, []);
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <HeadContent />
      </head>
      <body>
        <ThemeProvider
          attribute="class"
          defaultTheme="light"
          enableSystem={false}
          disableTransitionOnChange
        >
          <TooltipProvider>
            {children}
            <Toaster />
            <BuiltWithBadge />
          </TooltipProvider>
        </ThemeProvider>
        <Scripts />
      </body>
    </html>
  );
}
