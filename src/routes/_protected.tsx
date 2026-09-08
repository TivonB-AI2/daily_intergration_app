import { Outlet, createFileRoute } from "@tanstack/react-router";
import { AppLayout } from "@/components/layout/app-layout";
import { ThemeApplier } from "@/components/theme/ThemeApplier";

// Auth is enforced centrally in __root.tsx beforeLoad; this route is layout-only.
// GlobalSearch and ThemeLockIndicator (formerly floating, fixed-position
// elements) are now rendered inline inside AppHeader's own button group,
// not mounted standalone here.
export const Route = createFileRoute("/_protected")({
  component: ProtectedLayout,
});

function ProtectedLayout() {
  return (
    <>
      <ThemeApplier />
      <AppLayout>
        <Outlet />
      </AppLayout>
    </>
  );
}
