import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { AppHeader } from "@/components/layout/app-header";
import { AppSidebar, type SidebarUser } from "@/components/layout/app-sidebar";
import type { NavEntry } from "@/components/layout/nav";

export type SidebarLayoutProps = {
  children: React.ReactNode;
  /** Navigation entries (per-app) — can be individual items or grouped sections. */
  routes: NavEntry[];
  /** Branding shown in the sidebar header. */
  appName: string;
  appDescription: string;
  /** Current user for the account footer. */
  user?: SidebarUser;
  /** Hides the account/sign-out footer when false. */
  authEnabled?: boolean;
  /** Called when the user clicks "Sign out". */
  onSignOut: () => void;
};

/**
 * Full multi-page shell: sidebar (navigation + account) + header (breadcrumb +
 * theme toggle) + scrollable content. Presentational — the app supplies its
 * `routes`, branding, `user`, and `onSignOut`. Templates wrap this with their
 * own auth wiring (see each template's `src/components/layout/app-layout.tsx`).
 *
 * Wrap a route's root element with `data-flush` to drop the content padding for
 * a full-bleed page.
 */
export function SidebarLayout({
  children,
  routes,
  appName,
  appDescription,
  user,
  authEnabled,
  onSignOut,
}: SidebarLayoutProps) {
  return (
    <SidebarProvider>
      <AppSidebar
        routes={routes}
        appName={appName}
        appDescription={appDescription}
        user={user}
        authEnabled={authEnabled}
        onSignOut={onSignOut}
      />
      <SidebarInset>
        <div className="flex max-h-screen h-[calc(100vh-48px)] w-full flex-col">
          <AppHeader routes={routes} />
          <main className="flex-1 overflow-auto has-[>[data-flush]]:overflow-hidden h-full w-full">
            <div className="h-full w-full px-2 py-1 has-[>[data-flush]]:p-0">
              {children}
            </div>
          </main>
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}
