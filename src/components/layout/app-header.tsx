import { useRouterState } from "@tanstack/react-router";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbList,
  BreadcrumbPage,
} from "@/components/ui/breadcrumb";
import { Separator } from "@/components/ui/separator";
import { SidebarTrigger } from "@/components/ui/sidebar";
import type { NavEntry } from "@/components/layout/nav";
import { isNavGroup } from "@/components/layout/nav";
import { ThemeToggle } from "@/components/layout/theme-toggle";
import { RefreshButton } from "@/components/layout/refresh-button";
import { GlobalSearch } from "@/components/search/GlobalSearch";
import { ThemeLockIndicator } from "@/components/theme/ThemeLockIndicator";

export function AppHeader({ routes }: { routes: NavEntry[] }) {
  const routerState = useRouterState();
  const currentPath = routerState.location.pathname;

  // Find page title in routes (handles both individual items and groups)
  let pageTitle = "Page";
  for (const entry of routes) {
    if (isNavGroup(entry)) {
      const found = entry.items.find((item) => item.url === currentPath);
      if (found) {
        pageTitle = found.title;
        break;
      }
    } else {
      if (entry.url === currentPath) {
        pageTitle = entry.title;
        break;
      }
    }
  }

  return (
    <header className="flex h-12 shrink-0 items-center gap-2 border-b bg-card/80 backdrop-blur-sm px-3">
      <div className="flex items-center justify-center pr-1">
        <SidebarTrigger />
      </div>
      <Separator orientation="vertical" className="mr-1" />
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbPage>{pageTitle}</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>
      <div className="ml-auto flex items-center gap-1">
        <GlobalSearch />
        <ThemeLockIndicator />
        <RefreshButton />
        <ThemeToggle />
      </div>
    </header>
  );
}
