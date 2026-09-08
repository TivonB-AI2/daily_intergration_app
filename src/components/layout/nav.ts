import type { LucideIcon } from "lucide-react";

/** A single navigation entry rendered in the sidebar + breadcrumb. */
export type NavItem = {
  title: string;
  url: string;
  icon: LucideIcon;
};

/** A grouped section in the sidebar. */
export type NavGroup = {
  label: string;
  items: NavItem[];
};

/** Navigation entries can be individual items or grouped sections. */
export type NavEntry = NavItem | NavGroup;

export function isNavGroup(entry: NavEntry): entry is NavGroup {
  return "label" in entry && "items" in entry;
}

/** Flatten nested nav groups into a single array of items. */
export function flattenNavEntries(entries: NavEntry[]): NavItem[] {
  const result: NavItem[] = [];
  for (const entry of entries) {
    if (isNavGroup(entry)) {
      result.push(...entry.items);
    } else {
      result.push(entry);
    }
  }
  return result;
}
