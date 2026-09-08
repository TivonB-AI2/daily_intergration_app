import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  ClipboardList,
  History as HistoryIcon,
  AlertTriangle,
  Package,
  HardDrive,
  Search,
} from "lucide-react";
import { routes } from "@/components/layout/index";
import { isNavGroup, type NavItem } from "@/components/layout/nav";
import { useCapabilities } from "@/hooks/useCapabilities";
import { useQuerySource } from "@/hooks/useConnectors";
import {
  searchAppData,
  type GlobalSearchResult,
} from "@/services/db/globalSearchService";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";

/** AI Squared Vector Store connector + document tables — same ones the
 * Knowledge Base page (`/knowledge-base`) searches, reused here for a
 * lightweight keyword lookup so its documents are also reachable from
 * global search. */
const KB_CONNECTOR_ID = 1142;
const KB_TABLES = [
  "document_vector_embeddings",
  "lightning_embedding",
  "seemore_embedding",
] as const;

const RESULT_ICON: Record<GlobalSearchResult["type"], typeof ClipboardList> = {
  todo: ClipboardList,
  changelog: HistoryIcon,
  inventory: Package,
  error: AlertTriangle,
  storage: HardDrive,
};

/** Extra search keywords per page URL, so a page can be found by a related
 * term even when it doesn't literally appear in the page's short title
 * (e.g. typing "money"/"logs" should still surface relevant pages). */
const SEARCH_KEYWORDS: Record<string, string> = {
  "/": "home overview summary",
  "/todo": "tasks kanban issues",
  "/chat": "ai assistant bot",
  "/ai-text-tools":
    "summary summarize document ai moderation sentiment tone comparison diff",
  "/gallery": "photos images theme assets",
  "/storage": "files documents uploads",
  "/inventory": "stock products items",
  "/import-wizard": "csv upload import",
  "/document-pipeline": "extract ai documents processing",
  "/export-center": "download csv export",
  "/brand-assets": "logo icons fonts branding",
  "/workflows": "automation runs",
  "/connectors": "data sources integrations",
  "/secrets": "api keys vault",
  "/insights": "ai analysis questions live data metrics charts",
  "/saved-reports": "natural language sql questions reports",
  "/knowledge-base": "search documents semantic",
  "/analytics": "charts metrics stats",
  "/system":
    "system status integration health performance audit log error log query sql chat log monitoring speed fps",
  "/changelog": "version history releases",
  "/theme": "colors design appearance",
  "/settings": "preferences data retention workspace info backups",
};

/** Nav entries grouped by their sidebar section, for the search palette. */
const pageSections: { label: string; items: NavItem[] }[] = (() => {
  const sections: { label: string; items: NavItem[] }[] = [];
  const ungrouped: NavItem[] = [];
  for (const entry of routes) {
    if (isNavGroup(entry)) {
      sections.push({ label: entry.label, items: entry.items });
    } else {
      ungrouped.push(entry);
    }
  }
  if (ungrouped.length > 0) {
    sections.unshift({ label: "General", items: ungrouped });
  }
  return sections;
})();

/**
 * App-wide page search: a compact icon button in the header (matching
 * `RefreshButton`/`ThemeToggle`'s size and style) plus a Cmd/Ctrl+K shortcut
 * opens a command palette listing every registered page. Picking one
 * navigates there. Rendered inline in `AppHeader` — previously a floating
 * bottom-right button, moved into the header's own button group so all
 * global page-level actions live in one place.
 */
export function GlobalSearch() {
  const [open, setOpen] = useState(false);
  const [rawTerm, setRawTerm] = useState("");
  const [debouncedTerm, setDebouncedTerm] = useState("");
  const navigate = useNavigate();
  const { data: caps } = useCapabilities();
  const querySource = useQuerySource();

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.key === "k" || e.key === "K") && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((prev) => !prev);
      }
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, []);

  // Debounce the typed term before firing any data search, so we don't
  // fire a request on every keystroke.
  useEffect(() => {
    const id = setTimeout(() => setDebouncedTerm(rawTerm), 300);
    return () => clearTimeout(id);
  }, [rawTerm]);

  const { data: dataResults, isFetching: dataSearchLoading } = useQuery({
    queryKey: ["globalSearchData", debouncedTerm],
    queryFn: () => searchAppData({ data: debouncedTerm }),
    enabled: caps?.databaseEnabled === true && debouncedTerm.trim().length >= 2,
  });

  const [kbResults, setKbResults] = useState<GlobalSearchResult[]>([]);
  // biome-ignore lint/correctness/useExhaustiveDependencies: querySource.mutate is stable; only debouncedTerm should retrigger this search.
  useEffect(() => {
    const term = debouncedTerm.trim();
    if (term.length < 2) {
      setKbResults([]);
      return;
    }
    const escaped = term.replace(/'/g, "''");
    const unionSelect = KB_TABLES.map(
      (table) =>
        `SELECT '${table}' AS source_table, id, metadata FROM ${table} WHERE text ILIKE '%${escaped}%' LIMIT 3`,
    ).join(" UNION ALL ");
    querySource.mutate(
      {
        connectorId: KB_CONNECTOR_ID,
        payload: { query: unionSelect },
      },
      {
        onSuccess: (res) => {
          const rows = (res?.data ?? []) as {
            source_table?: string;
            id?: string | number;
            metadata?: string | null;
          }[];
          setKbResults(
            rows.slice(0, 5).map((row) => {
              let filename = "Document";
              try {
                const meta = row.metadata ? JSON.parse(row.metadata) : null;
                if (meta?.filename) filename = String(meta.filename);
              } catch {
                // metadata isn't valid JSON — keep the fallback label
              }
              return {
                type: "storage" as const,
                id: `kb-${row.source_table}-${row.id}`,
                title: filename,
                subtitle: "Knowledge Base",
                url: "/knowledge-base",
              };
            }),
          );
        },
        onError: () => setKbResults([]),
      },
    );
  }, [debouncedTerm]);

  const filteredPageSections = useMemo(() => {
    const term = rawTerm.trim().toLowerCase();
    if (!term) return pageSections;
    return pageSections
      .map((section) => ({
        ...section,
        items: section.items.filter((page) => {
          const haystack =
            `${page.title} ${SEARCH_KEYWORDS[page.url] ?? ""}`.toLowerCase();
          return haystack.includes(term);
        }),
      }))
      .filter((section) => section.items.length > 0);
  }, [rawTerm]);

  const allDataResults = [...(dataResults ?? []), ...kbResults];
  const showDataSection = rawTerm.trim().length >= 2;

  function goTo(url: string) {
    setOpen(false);
    navigate({ to: url });
  }

  function handleOpenChange(next: boolean) {
    if (!next) {
      setOpen(false);
      setRawTerm("");
      setDebouncedTerm("");
      setKbResults([]);
    }
  }

  return (
    <>
      <Button
        variant="ghost"
        size="icon"
        className="h-9 w-9"
        onClick={() => setOpen(true)}
        aria-label="Search pages and data (Cmd/Ctrl+K)"
        title="Search pages and data (Cmd/Ctrl+K)"
      >
        <Search className="h-4 w-4" />
      </Button>

      {/* Conditionally mounted (rather than always-rendered with only
       * `open` toggling visibility) so React fully unmounts this subtree
       * the instant `open` flips to false — this app's established fix for
       * dialogs that could otherwise appear not to close (see
       * routes/AGENTS.md's "Design For Me"/Secrets/Inventory dialog-close
       * entries); `CommandDialog` wraps the same base `Dialog`/`DialogContent`
       * primitives those fixes were needed for. */}
      {open && (
        <CommandDialog
          open
          onOpenChange={handleOpenChange}
          title="Search pages and data"
          description="Jump to any page, or find a task, changelog entry, inventory item, error, file, or document"
        >
          <Command filter={() => 1}>
            <CommandInput
              placeholder="Search pages and data..."
              value={rawTerm}
              onValueChange={setRawTerm}
            />
            <CommandList>
              <CommandEmpty>No matches found.</CommandEmpty>
              {filteredPageSections.map((section) => (
                <CommandGroup key={section.label} heading={section.label}>
                  {section.items.map((page) => (
                    <CommandItem
                      key={page.url}
                      value={page.url}
                      onSelect={() => goTo(page.url)}
                    >
                      <page.icon className="size-4" />
                      {page.title}
                    </CommandItem>
                  ))}
                </CommandGroup>
              ))}
              {showDataSection && (
                <CommandGroup
                  heading={
                    dataSearchLoading || querySource.isPending
                      ? "Results — searching..."
                      : "Results"
                  }
                >
                  {allDataResults.length === 0 ? (
                    <div className="px-2 py-3 text-xs text-muted-foreground">
                      No matching tasks, changelog entries, inventory, errors,
                      files, or documents.
                    </div>
                  ) : (
                    allDataResults.map((r) => {
                      const Icon = RESULT_ICON[r.type];
                      return (
                        <CommandItem
                          key={r.id}
                          value={r.id}
                          onSelect={() => goTo(r.url)}
                        >
                          <Icon className="size-4" />
                          <div className="flex flex-col min-w-0">
                            <span className="truncate">{r.title}</span>
                            <span className="text-xs text-muted-foreground">
                              {r.subtitle}
                            </span>
                          </div>
                        </CommandItem>
                      );
                    })
                  )}
                </CommandGroup>
              )}
            </CommandList>
          </Command>
        </CommandDialog>
      )}
    </>
  );
}
