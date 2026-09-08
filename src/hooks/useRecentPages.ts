import { useEffect, useState } from "react";
import { useRouterState } from "@tanstack/react-router";

const RECENT_PAGES_KEY = "sidebar-recent-pages-v1";
const MAX_RECENT = 5;

function loadRecentPages(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(RECENT_PAGES_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveRecentPages(paths: string[]) {
  window.localStorage.setItem(RECENT_PAGES_KEY, JSON.stringify(paths));
}

/**
 * Tracks the last few distinct pages the user has visited (persisted to
 * localStorage) so the sidebar can render a "Recently Visited" shortcut
 * section. The list returned excludes the current page.
 */
export function useRecentPages() {
  const routerState = useRouterState();
  const currentPath = routerState.location.pathname;
  const [recent, setRecent] = useState<string[]>([]);

  useEffect(() => {
    // Compute the list to display (history before this visit), then record
    // this visit for next time.
    const existing = loadRecentPages().filter((p) => p !== currentPath);
    setRecent(existing);

    const next = [currentPath, ...existing].slice(0, MAX_RECENT);
    saveRecentPages(next);
  }, [currentPath]);

  return recent;
}
