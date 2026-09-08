import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { SidebarLayout } from "@/components/layout/sidebar-layout";
import { routes } from ".";
import { APP_NAME, APP_DESCRIPTION } from "@/lib/constants";
import { useGetUser, useSignOut } from "@/hooks/useAuth";
import { useAutoRegisterTeamMember } from "@/hooks/useAutoRegisterTeamMember";
import { getAuthState } from "@/server/auth";

/**
 * App wrapper around the shared `SidebarLayout` (from base). Wires this app's
 * navigation (`routes`), branding, and auth into the shared component. Used by
 * `_protected.tsx` for MULTI-PAGE apps; single-page apps use `AppShell` instead.
 */
export function AppLayout({ children }: { children: React.ReactNode }) {
  const navigate = useNavigate();
  const { mutate: signOut } = useSignOut();
  const { data: authState } = useQuery({
    queryKey: ["auth-state"],
    queryFn: () => getAuthState(),
    staleTime: 5 * 60 * 1000,
  });
  const authEnabled = authState?.authEnabled ?? true;
  const { data: user } = useGetUser({
    enabled: authState?.authEnabled === true,
  });
  const attrs = user?.data?.attributes;

  useAutoRegisterTeamMember({
    authEnabled,
    userName: attrs?.name,
    userEmail: attrs?.email,
  });

  return (
    <SidebarLayout
      routes={routes}
      appName={APP_NAME}
      appDescription={APP_DESCRIPTION}
      authEnabled={authEnabled}
      user={attrs ? { name: attrs.name, email: attrs.email } : undefined}
      onSignOut={() => {
        signOut();
        navigate({ to: "/sign-in" });
      }}
    >
      {children}
    </SidebarLayout>
  );
}
