import { Link, useRouterState } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ChevronDown, Clock, Hexagon, LogOut } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useRecentPages } from "@/hooks/useRecentPages";
import { useCapabilities } from "@/hooks/useCapabilities";
import { getActiveLogo } from "@/services/db/brandingService";
import { getStorageFileUrl } from "@/services/db/storageService";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar";
import { cn } from "@/lib/utils";
import type { NavEntry } from "./nav";
import { flattenNavEntries, isNavGroup } from "./nav";

const COLLAPSED_GROUPS_KEY = "sidebar-collapsed-groups-v1";

/** Color assigned to each nav group, cycled by group order. */
const GROUP_COLORS = [
  {
    label: "text-blue-600 dark:text-blue-400",
    icon: "text-blue-600 dark:text-blue-400",
    border: "data-active:border-blue-500",
  },
  {
    label: "text-violet-600 dark:text-violet-400",
    icon: "text-violet-600 dark:text-violet-400",
    border: "data-active:border-violet-500",
  },
  {
    label: "text-emerald-600 dark:text-emerald-400",
    icon: "text-emerald-600 dark:text-emerald-400",
    border: "data-active:border-emerald-500",
  },
  {
    label: "text-sky-600 dark:text-sky-400",
    icon: "text-sky-600 dark:text-sky-400",
    border: "data-active:border-sky-500",
  },
  {
    label: "text-fuchsia-600 dark:text-fuchsia-400",
    icon: "text-fuchsia-600 dark:text-fuchsia-400",
    border: "data-active:border-fuchsia-500",
  },
  {
    label: "text-rose-600 dark:text-rose-400",
    icon: "text-rose-600 dark:text-rose-400",
    border: "data-active:border-rose-500",
  },
] as const;

function groupColor(index: number) {
  return GROUP_COLORS[index % GROUP_COLORS.length];
}

function loadCollapsedGroups(): Record<string, boolean> {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(COLLAPSED_GROUPS_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

/** Minimal user shape the sidebar renders — supply from the app's auth hook. */
export type SidebarUser = {
  name?: string | null;
  email?: string | null;
};

export type AppSidebarProps = {
  /** Navigation entries (per-app) — can be individual items or grouped sections. */
  routes: NavEntry[];
  /** Branding shown in the sidebar header. */
  appName: string;
  appDescription: string;
  /** Current user; when omitted the account footer still renders placeholders. */
  user?: SidebarUser;
  /** Whether auth is enabled — hides the account/sign-out footer when false. */
  authEnabled?: boolean;
  /** Called when the user clicks "Sign out". */
  onSignOut: () => void;
};

export function AppSidebar({
  routes,
  appName,
  appDescription,
  user,
  authEnabled = true,
  onSignOut,
}: AppSidebarProps) {
  const routerState = useRouterState();
  const currentPath = routerState.location.pathname;
  const { open } = useSidebar();
  const { data: caps } = useCapabilities();
  const brandingReady =
    caps?.databaseEnabled === true && caps?.s3Enabled === true;
  const { data: activeLogo } = useQuery({
    queryKey: ["activeLogo"],
    queryFn: () => getActiveLogo(),
    enabled: brandingReady,
    staleTime: 1000 * 60 * 5,
  });
  const { data: activeLogoUrl } = useQuery({
    queryKey: ["activeLogoUrl", activeLogo?.fileKey],
    queryFn: () => getStorageFileUrl({ data: activeLogo?.fileKey ?? "" }),
    enabled: !!activeLogo?.fileKey,
    staleTime: 1000 * 60 * 5,
  });
  const [collapsedGroups, setCollapsedGroups] = useState<
    Record<string, boolean>
  >({});
  const recentPaths = useRecentPages();
  const flatItems = useMemo(() => flattenNavEntries(routes), [routes]);
  const recentItems = recentPaths
    .map((path) => flatItems.find((item) => item.url === path))
    .filter((item): item is (typeof flatItems)[number] => item !== undefined);

  useEffect(() => {
    setCollapsedGroups(loadCollapsedGroups());
  }, []);

  function toggleGroup(label: string) {
    setCollapsedGroups((prev) => {
      const next = { ...prev, [label]: !prev[label] };
      window.localStorage.setItem(COLLAPSED_GROUPS_KEY, JSON.stringify(next));
      return next;
    });
  }

  return (
    <Sidebar variant="inset" collapsible="icon">
      <SidebarHeader className="border-b border-sidebar-border/60 pb-3">
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" tooltip={appName}>
              <div className="flex items-center gap-2.5">
                <div className="flex size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground shadow-sm overflow-hidden">
                  {activeLogoUrl?.url ? (
                    <img
                      src={activeLogoUrl.url}
                      alt={appName}
                      className="size-full object-contain"
                    />
                  ) : (
                    <Hexagon className="size-4.5" />
                  )}
                </div>
                {open && (
                  <div className="flex flex-col leading-none">
                    <span className="font-semibold tracking-tight text-sm">
                      {appName}
                    </span>
                    <span className="text-[11px] text-muted-foreground">
                      {appDescription}
                    </span>
                  </div>
                )}
              </div>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarContent className="gap-1">
        {recentItems.length > 0 && (
          <SidebarGroup className="border-b border-sidebar-border/50 bg-amber-500/5 pb-2.5 mb-0.5 rounded-md">
            <SidebarGroupLabel className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-amber-600 dark:text-amber-400">
              <Clock className="size-3" />
              Recently Visited
            </SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {recentItems.map(({ title, url, icon: Icon }) => (
                  <SidebarMenuItem key={`recent-${url}`}>
                    <SidebarMenuButton
                      tooltip={title}
                      className="data-active:border-l-2 data-active:border-amber-500"
                      render={<Link to={url} />}
                    >
                      <Icon className="size-4 text-amber-600 dark:text-amber-400" />
                      <span>{title}</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}
        {(() => {
          let groupIndex = -1;
          return routes.map((entry, index) => {
            if (isNavGroup(entry)) {
              groupIndex += 1;
              const color = groupColor(groupIndex);
              const isCollapsed = collapsedGroups[entry.label] ?? false;
              return (
                <Collapsible
                  key={`group-${index}`}
                  open={!isCollapsed}
                  onOpenChange={() => toggleGroup(entry.label)}
                >
                  <SidebarGroup
                    className={cn(
                      index > 0 &&
                        "border-t border-sidebar-border/50 pt-2.5 mt-0.5",
                    )}
                  >
                    <CollapsibleTrigger className="flex w-full items-center justify-between gap-1 rounded-md transition-colors hover:bg-sidebar-accent/60">
                      <SidebarGroupLabel
                        className={cn(
                          "flex-1 text-[10px] font-semibold uppercase tracking-wider",
                          color.label,
                        )}
                      >
                        {entry.label}
                      </SidebarGroupLabel>
                      {open && (
                        <ChevronDown
                          className={cn(
                            "mr-2 size-3.5 text-muted-foreground transition-transform duration-200",
                            isCollapsed && "-rotate-90",
                          )}
                        />
                      )}
                    </CollapsibleTrigger>
                    <CollapsibleContent>
                      <SidebarGroupContent>
                        <SidebarMenu>
                          {entry.items.map(({ title, url, icon: Icon }) => (
                            <SidebarMenuItem key={title}>
                              <SidebarMenuButton
                                isActive={currentPath === url}
                                tooltip={title}
                                className={cn(
                                  "data-active:border-l-2 transition-colors",
                                  color.border,
                                )}
                                render={<Link to={url} />}
                              >
                                <Icon className={cn("size-4", color.icon)} />
                                <span>{title}</span>
                              </SidebarMenuButton>
                            </SidebarMenuItem>
                          ))}
                        </SidebarMenu>
                      </SidebarGroupContent>
                    </CollapsibleContent>
                  </SidebarGroup>
                </Collapsible>
              );
            }

            // Individual item (for backward compatibility)
            return (
              <SidebarGroup
                key={`item-${index}`}
                className={cn(
                  index > 0 &&
                    "border-t border-sidebar-border/50 pt-2.5 mt-0.5",
                )}
              >
                <SidebarGroupContent>
                  <SidebarMenu>
                    <SidebarMenuItem>
                      <SidebarMenuButton
                        isActive={currentPath === entry.url}
                        tooltip={entry.title}
                        className="data-active:border-l-2 data-active:border-primary transition-colors"
                        render={<Link to={entry.url} />}
                      >
                        <entry.icon className="size-4 group-data-active/menu-button:text-primary" />
                        <span>{entry.title}</span>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  </SidebarMenu>
                </SidebarGroupContent>
              </SidebarGroup>
            );
          });
        })()}
      </SidebarContent>

      {authEnabled && (
        <SidebarFooter className="border-t border-sidebar-border/60 pt-2">
          <SidebarMenu>
            <SidebarMenuItem>
              <DropdownMenu>
                <DropdownMenuTrigger
                  render={
                    <SidebarMenuButton
                      size="lg"
                      tooltip="Account"
                      className="cursor-pointer transition-colors"
                    />
                  }
                >
                  <Avatar className="size-7 rounded-full">
                    <AvatarFallback className="rounded-full bg-sidebar text-[11px] font-medium">
                      {user?.name?.charAt(0) ?? "U"}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex flex-1 flex-col leading-none">
                    <span className="text-sm font-medium">
                      {user?.name ?? "User Name"}
                    </span>
                    <span className="text-[11px] text-muted-foreground">
                      {user?.email ?? "Email"}
                    </span>
                  </div>
                  <ChevronDown className="ml-auto size-3.5 text-muted-foreground" />
                </DropdownMenuTrigger>
                <DropdownMenuContent side="top" align="end" className="w-32">
                  <DropdownMenuItem onClick={onSignOut} variant="destructive">
                    <LogOut className="mr-2 size-4" />
                    Sign out
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarFooter>
      )}
    </Sidebar>
  );
}
