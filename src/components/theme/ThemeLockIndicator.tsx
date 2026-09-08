import { useEffect, useMemo, useState } from "react";
import { Link, useRouterState } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Globe, Lock, Moon, Palette, Sun } from "lucide-react";
import { useCapabilities } from "@/hooks/useCapabilities";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  type ActiveMap,
  getManualColorScheme,
  resolveActiveTheme,
  setManualColorScheme,
} from "@/lib/customTheme";
import { listActiveThemes, listCustomThemes } from "@/services/db/themeService";

/**
 * Header pill (rendered inline in `AppHeader`, alongside `RefreshButton`/
 * `ThemeToggle`) that always shows which theme is governing the current
 * page — a page-specific override, an inherited global theme, or none — so
 * users are never surprised by which theme "wins" on a given screen. Links
 * to the theme builder. Also renders the manual light/dark toggle for the
 * active theme's dark variant, when one is defined.
 */
export function ThemeLockIndicator() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const { data: caps } = useCapabilities();
  const dbEnabled = caps?.databaseEnabled === true;

  const { data: themes } = useQuery({
    queryKey: ["customThemes"],
    queryFn: () => listCustomThemes(),
    enabled: dbEnabled,
  });
  const { data: activeRows } = useQuery({
    queryKey: ["activeThemes"],
    queryFn: () => listActiveThemes(),
    enabled: dbEnabled,
  });

  const status = useMemo(() => {
    if (!activeRows || !themes) return null;
    const pageEntry = activeRows.find((r) => r.scopeKey === pathname);
    const globalEntry = activeRows.find((r) => r.scopeKey === "global");
    if (pageEntry) {
      const t = themes.find((t) => t.id === pageEntry.themeId);
      return t ? { kind: "page" as const, name: t.name } : null;
    }
    if (globalEntry) {
      const t = themes.find((t) => t.id === globalEntry.themeId);
      return t ? { kind: "global" as const, name: t.name } : null;
    }
    return { kind: "none" as const, name: null };
  }, [activeRows, themes, pathname]);

  const activeMap: ActiveMap = useMemo(() => {
    const map: ActiveMap = {};
    for (const row of activeRows ?? [])
      map[row.scopeKey] = { themeId: row.themeId };
    return map;
  }, [activeRows]);
  const activeTheme = useMemo(
    () => resolveActiveTheme(themes ?? [], activeMap, pathname),
    [themes, activeMap, pathname],
  );
  const hasDarkVariant = Boolean(activeTheme?.darkBackground);

  // Manual light/dark switch — only shown when the active theme actually
  // defines a dark variant to switch to. Deliberately not tied to the
  // browser/OS `prefers-color-scheme` setting; the user flips it themselves.
  const [isDark, setIsDark] = useState(false);
  useEffect(() => {
    setIsDark(getManualColorScheme() === "dark");
  }, []);

  if (!dbEnabled || !status || pathname === "/theme") return null;

  const label =
    status.kind === "page"
      ? `Page theme: ${status.name}`
      : status.kind === "global"
        ? `Global theme: ${status.name}`
        : "No theme active";

  const Icon =
    status.kind === "page" ? Lock : status.kind === "global" ? Globe : Palette;

  return (
    <div className="flex items-center gap-1">
      {hasDarkVariant && (
        <Button
          variant="ghost"
          size="icon"
          className="h-9 w-9"
          onClick={() => {
            const next = isDark ? "light" : "dark";
            setManualColorScheme(next);
            setIsDark(next === "dark");
          }}
          title={
            isDark
              ? "Switch this theme to its light look"
              : "Switch this theme to its dark look"
          }
          aria-label="Toggle theme light/dark variant"
        >
          {isDark ? <Moon className="h-4 w-4" /> : <Sun className="h-4 w-4" />}
        </Button>
      )}
      <Link
        to="/theme"
        className={cn(
          "flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs transition-colors",
          "bg-transparent text-muted-foreground hover:bg-accent hover:text-foreground border-border/60",
        )}
        title={
          status.kind === "page"
            ? "This page has its own theme override"
            : status.kind === "global"
              ? "This page is inheriting the global theme"
              : "No theme is currently active — go to Theme to pick one"
        }
      >
        <Icon className="size-3.5" />
        <span className="max-w-32 truncate">{label}</span>
      </Link>
    </div>
  );
}
