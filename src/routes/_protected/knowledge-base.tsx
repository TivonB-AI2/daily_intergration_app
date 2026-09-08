import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQuerySource } from "@/hooks/useConnectors";
import { useAiModel } from "@/hooks/useAiModel";
import { useEmbedSearchQuery } from "@/hooks/useEmbedSearchQuery";
import { useActivityLog } from "@/hooks/useActivityLog";
import { useCapabilities } from "@/hooks/useCapabilities";
import { cn } from "@/lib/utils";
import { AiProviderSelect } from "@/components/ai/AiProviderSelect";
import {
  DEFAULT_AI_PROVIDER_ID,
  extractProviderText,
  type AiProviderId,
} from "@/lib/aiProviders";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Markdown } from "@/components/ui/markdown";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";
import {
  Empty,
  EmptyHeader,
  EmptyTitle,
  EmptyDescription,
  EmptyMedia,
} from "@/components/ui/empty";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  BookOpenText,
  ChevronDown,
  ChevronUp,
  CircleCheck,
  FileText,
  Layers,
  Plus,
  Search,
  Sparkles,
} from "lucide-react";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute("/_protected/knowledge-base")({
  component: KnowledgeBasePage,
});

// The vector store connector confirmed with the user. It holds three
// document/embedding tables that all share the same shape (id, text,
// metadata, embedding, created_at) — the connector also has a fourth
// `fortune1000` table, but that's structured company data, not documents,
// so it's intentionally excluded from knowledge-base search.
const VECTOR_STORE_CONNECTOR_ID = 1142;
const VECTOR_TABLES = [
  "document_vector_embeddings",
  "lightning_embedding",
  "seemore_embedding",
] as const;
type VectorTable = (typeof VECTOR_TABLES)[number];
const ALL_TABLES_VALUE = "all";
const MAX_RESULTS = 15;
const MAX_CONTEXT_DOCUMENTS = 5;
const PREVIEW_CHAR_LIMIT = 600;

/** Friendly label + accent color for each source table, so results are
 * visually scannable at a glance instead of showing the raw table name. */
const TABLE_LABELS: Record<VectorTable, string> = {
  document_vector_embeddings: "Document embeddings",
  lightning_embedding: "Lightning embedding",
  seemore_embedding: "Seemore embedding",
};

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Standalone words that commonly act as a section heading in plain-text
 * documents (no markdown syntax, no line breaks) when they appear on their
 * own ahead of the next sentence. */
const STANDALONE_HEADING_WORDS = new Set([
  "Introduction",
  "Conclusion",
  "Summary",
  "Background",
  "Overview",
]);
/** Safety cap on how many capitalized words after "Section N:" can be
 * pulled into the heading, in case a long run of capitalized words never
 * hits a lowercase word (e.g. a title-cased document with no normal
 * sentences at all). The word-by-word lookahead below almost always stops
 * well before this. */
const MAX_SECTION_TITLE_WORDS = 8;
const CAPITALIZED_WORD_RE = /^[A-Z][a-zA-Z''-]*$/;

/** The vector store's stored `text` is raw, unstructured plain text with no
 * newlines or markdown syntax at all — even documents that visually looked
 * structured (numbered sections, an "Introduction"/"Conclusion") had that
 * structure flattened into one continuous run of words during ingestion.
 * Since there's no real markdown to render, this reconstructs a reasonable
 * approximation of it: "Section 1: Foo Bar" becomes a `##` heading, and
 * standalone heading words become their own `##` heading, so the Markdown
 * renderer below has something to actually format instead of one flat
 * paragraph. This is a heuristic over plain English, not a real parser.
 *
 * Title-word detection: every English sentence starts with a capitalized
 * word, and that word's own next word is capitalized only if it too is a
 * title word — a normal sentence's *second* word is virtually always
 * lowercase ("Machine learning...", "Chunking is..."). So a capitalized
 * word only belongs to the heading if the word right after it is *also*
 * capitalized (i.e. we're still inside a multi-word title phrase); the
 * first capitalized word whose follower is lowercase is the start of the
 * next sentence, not part of the title, and is excluded.
 */
function reconstructHeadings(text: string): string {
  const words = text.split(" ");
  const out: string[] = [];
  for (let i = 0; i < words.length; i++) {
    const word = words[i];
    if (/^Section$/i.test(word) && /^\d+:$/.test(words[i + 1] ?? "")) {
      const number = words[i + 1];
      let j = i + 2;
      const titleWords: string[] = [];
      while (
        j < words.length &&
        titleWords.length < MAX_SECTION_TITLE_WORDS &&
        CAPITALIZED_WORD_RE.test(words[j])
      ) {
        const next = words[j + 1];
        const nextIsCapitalized =
          next != null && CAPITALIZED_WORD_RE.test(next);
        // The word right after `words[j]` is only capitalized if `words[j]`
        // is itself still part of the multi-word title; if it's lowercase,
        // `words[j]` is the sentence that follows the title, not the title
        // itself, so it's excluded and the loop stops here.
        if (!nextIsCapitalized) break;
        titleWords.push(words[j]);
        j++;
      }
      if (titleWords.length > 0) {
        out.push(`\n\n## Section ${number} ${titleWords.join(" ")}\n\n`);
        i = j - 1;
        continue;
      }
    }
    if (STANDALONE_HEADING_WORDS.has(word)) {
      out.push(`\n\n## ${word}\n\n`);
      continue;
    }
    out.push(word);
  }
  return out
    .join(" ")
    .replace(/ +\n\n/g, "\n\n")
    .replace(/\n\n +/g, "\n\n");
}

/** Wraps every case-insensitive occurrence of the current search term in
 * markdown bold (`**term**`) before the text is handed to the `Markdown`
 * renderer below — the renderer's own `strong` styling is tuned to look
 * like a highlight, so a matching result is easy to spot inside a long
 * passage without making the user re-read the whole thing to find why it
 * matched. */
function highlightMatches(text: string, term: string) {
  if (!term.trim()) return text;
  return text.replace(
    new RegExp(`(${escapeRegExp(term.trim())})`, "gi"),
    "**$1**",
  );
}

type VectorRow = {
  id: string;
  text: string;
  metadata: string | null;
  created_at: string;
  source_table: VectorTable;
  distance?: string | number;
};

/** A single document, with all of its matching chunks combined into one
 * block of text (chunks of the same source document were previously shown
 * as separate result cards, which was confusing — a document that matched
 * a search term in 3 different chunks looked like 3 unrelated results). */
type DocumentGroup = {
  key: string;
  filename: string | null;
  sourceTable: VectorTable;
  chunkCount: number;
  text: string;
  /** Best (lowest) cosine distance among the document's chunks, only
   * present in semantic-search mode — used to show a relevance score. */
  bestDistance: number | null;
  /** Most recent `created_at` among the document's chunks — used by the
   * "Newest"/"Oldest" sort options. */
  createdAt: string;
};

function parseMetadata(metadata: string | null): {
  filename?: string;
  knowledge_base_file_id?: string | number;
} {
  if (!metadata) return {};
  try {
    return JSON.parse(metadata) as {
      filename?: string;
      knowledge_base_file_id?: string | number;
    };
  } catch {
    return {};
  }
}

/** Documents are chunked with an overlap (so context isn't lost at a chunk
 * boundary — see the chunking test document in the sample data, which
 * describes exactly this: "1000-character chunks with 250-character
 * overlap"). Naively joining chunk text back-to-back therefore repeats
 * that overlapping stretch verbatim, which is what made combined results
 * read as choppy/duplicated. This finds the longest matching
 * suffix-of-`a`/prefix-of-`b` (up to a generous cap) and drops the
 * duplicate before joining, so consecutive chunks read as one continuous
 * passage. Falls back to a paragraph break when no overlap is found (e.g.
 * chunks aren't actually adjacent).
 */
function stitchChunkText(a: string, b: string): string {
  const maxOverlap = Math.min(a.length, b.length, 400);
  for (let len = maxOverlap; len >= 20; len--) {
    if (a.slice(-len) === b.slice(0, len)) {
      return a + b.slice(len);
    }
  }
  return `${a}\n\n${b}`;
}

/** Groups chunk-level rows back into one entry per source document (same
 * table + same `knowledge_base_file_id`/filename), sorting each document's
 * chunks by id (chunk ids are assigned in reading order) and stitching
 * their text together (removing overlap duplication) so the combined
 * result reads like the original document instead of a jumbled, repetitive
 * mix of chunks. */
function groupResultsByDocument(rows: VectorRow[]): DocumentGroup[] {
  const groups = new Map<
    string,
    { filename: string | null; sourceTable: VectorTable; rows: VectorRow[] }
  >();

  for (const row of rows) {
    const meta = parseMetadata(row.metadata);
    const filename = meta.filename ?? null;
    const docId = meta.knowledge_base_file_id ?? filename ?? row.id;
    const key = `${row.source_table}:${docId}`;
    const existing = groups.get(key);
    if (existing) {
      existing.rows.push(row);
    } else {
      groups.set(key, { filename, sourceTable: row.source_table, rows: [row] });
    }
  }

  return [...groups.entries()].map(([key, group]) => {
    const sortedRows = [...group.rows].sort((a, b) => {
      const na = Number(a.id);
      const nb = Number(b.id);
      if (!Number.isNaN(na) && !Number.isNaN(nb)) return na - nb;
      return a.id.localeCompare(b.id);
    });
    const text = sortedRows
      .map((r) => r.text)
      .reduce((combined, chunk) => stitchChunkText(combined, chunk));
    const distances = sortedRows
      .map((r) => (r.distance != null ? Number(r.distance) : null))
      .filter((d): d is number => d != null && !Number.isNaN(d));
    const createdAt = sortedRows
      .map((r) => r.created_at)
      .reduce((latest, current) => (current > latest ? current : latest));
    return {
      key,
      filename: group.filename,
      sourceTable: group.sourceTable,
      chunkCount: sortedRows.length,
      text,
      bestDistance: distances.length > 0 ? Math.min(...distances) : null,
      createdAt,
    };
  });
}

/** Extracts the distinct document filenames present in a batch of rows (for
 * the "Document" filter dropdown), sorted alphabetically. */
function extractFilenames(rows: VectorRow[]): string[] {
  const filenames = new Set<string>();
  for (const row of rows) {
    const meta = parseMetadata(row.metadata);
    if (meta.filename) filenames.add(meta.filename);
  }
  return [...filenames].sort((a, b) => a.localeCompare(b));
}

type SortOption = "relevance" | "newest" | "oldest" | "alphabetical";

const SORT_OPTIONS: { value: SortOption; label: string }[] = [
  { value: "relevance", label: "Relevance" },
  { value: "newest", label: "Newest first" },
  { value: "oldest", label: "Oldest first" },
  { value: "alphabetical", label: "Alphabetical" },
];

function sortDocumentGroups(
  groups: DocumentGroup[],
  sortBy: SortOption,
): DocumentGroup[] {
  const sorted = [...groups];
  switch (sortBy) {
    case "newest":
      sorted.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
      break;
    case "oldest":
      sorted.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
      break;
    case "alphabetical":
      sorted.sort((a, b) =>
        (a.filename ?? "Untitled document").localeCompare(
          b.filename ?? "Untitled document",
        ),
      );
      break;
    case "relevance":
      // Semantic search already orders by distance ascending (best match
      // first); keyword search already orders by created_at desc. Only
      // re-sort here when distances are actually present, since a mixed
      // "some rows have a distance, some don't" state can't happen (all
      // rows share the same search mode within one result set).
      if (sorted.some((g) => g.bestDistance != null)) {
        sorted.sort((a, b) => (a.bestDistance ?? 2) - (b.bestDistance ?? 2));
      }
      break;
  }
  return sorted;
}

/** Generates a Google-style search snippet: a window of text centered on
 * the first occurrence of the search term (with ellipses on either side of
 * the window), rather than always showing the document's first N
 * characters — so a user can see *why* a long document matched without
 * scanning past unrelated text first. Falls back to a plain
 * first-N-characters preview when there's no search term or no match. */
function buildSnippet(text: string, term: string): string {
  const trimmed = term.trim();
  const fallback = () =>
    text.length > PREVIEW_CHAR_LIMIT
      ? `${text.slice(0, PREVIEW_CHAR_LIMIT).trimEnd()}…`
      : text;
  if (!trimmed) return fallback();
  const idx = text.toLowerCase().indexOf(trimmed.toLowerCase());
  if (idx === -1) return fallback();
  const contextChars = 220;
  const start = Math.max(0, idx - contextChars);
  const end = Math.min(text.length, idx + trimmed.length + contextChars);
  const prefix = start > 0 ? "…" : "";
  const suffix = end < text.length ? "…" : "";
  return `${prefix}${text.slice(start, end).trim()}${suffix}`;
}

/** Turns a document's grouping key (e.g. "lightning_embedding:42") into a
 * valid HTML id so a result card can be linked to from an Ask-AI citation
 * like "[doc 2]" via a plain in-page anchor link. */
function docAnchorId(key: string): string {
  return `kb-doc-${key.replace(/[^a-zA-Z0-9_-]/g, "-")}`;
}

/** Rewrites "[doc N]" citations inside an AI answer into markdown links
 * pointing at the matching result card's anchor id, so clicking a citation
 * scrolls straight to the snippet it came from instead of leaving the user
 * to search the page manually. `keys` is the ordered list of document keys
 * that were actually sent as context for that answer. */
function linkCitations(text: string, keys: string[]): string {
  return text.replace(/\[doc (\d+)\]/gi, (match, numStr) => {
    const key = keys[Number(numStr) - 1];
    return key ? `[${match}](#${docAnchorId(key)})` : match;
  });
}

/** Builds a UNION ALL query across the given tables (or a single-table
 * query when only one is selected) so results from every knowledge-base
 * table can be searched and ranked together. */
function buildUnionQuery(
  tables: readonly string[],
  where: string,
  limit: number,
) {
  const parts = tables.map(
    (table) =>
      `SELECT id, text, metadata, created_at, '${table}' AS source_table FROM ${table} ${where}`,
  );
  return `${parts.join(" UNION ALL ")} ORDER BY created_at DESC LIMIT ${limit}`;
}

/** Builds a UNION ALL query that ranks rows by true semantic (cosine
 * distance) similarity to a query embedding via pgvector's `<=>` operator
 * — verified live against the connected vector store, which stores 1536-
 * dimension embeddings — instead of a plain keyword `ILIKE` match. Accepts
 * the same extra filter conditions (document/date) as the keyword query so
 * both search modes support the Document/Date filters identically. */
function buildSemanticUnionQuery(
  tables: readonly string[],
  embedding: number[],
  limit: number,
  extraConditions: string[] = [],
) {
  const vectorLiteral = `'[${embedding.join(",")}]'::vector`;
  const where =
    extraConditions.length > 0 ? `WHERE ${extraConditions.join(" AND ")}` : "";
  const parts = tables.map(
    (table) =>
      `SELECT id, text, metadata, created_at, '${table}' AS source_table, embedding <=> ${vectorLiteral} AS distance FROM ${table} ${where}`,
  );
  return `${parts.join(" UNION ALL ")} ORDER BY distance ASC LIMIT ${limit}`;
}

function escapeSqlLiteral(value: string) {
  return value.replace(/'/g, "''");
}

const ALL_FILES_VALUE = "all";

/** Builds the extra (non-search-term) filter conditions shared by both the
 * keyword and semantic query paths — narrowing to one document (by its
 * stored `metadata.filename`) and/or a created-at date range. */
function buildFilterConditions(
  filenameFilter: string,
  dateFrom: string,
  dateTo: string,
): string[] {
  const conditions: string[] = [];
  if (filenameFilter !== ALL_FILES_VALUE) {
    conditions.push(
      `metadata::jsonb->>'filename' = '${escapeSqlLiteral(filenameFilter)}'`,
    );
  }
  if (dateFrom) {
    conditions.push(`created_at >= '${escapeSqlLiteral(dateFrom)}'`);
  }
  if (dateTo) {
    conditions.push(`created_at <= '${escapeSqlLiteral(dateTo)}T23:59:59'`);
  }
  return conditions;
}

const STOPWORDS = new Set([
  "this",
  "that",
  "with",
  "from",
  "have",
  "been",
  "were",
  "will",
  "your",
  "their",
  "into",
  "about",
  "which",
  "there",
  "these",
  "those",
  "would",
  "could",
  "should",
  "each",
  "such",
  "also",
  "than",
  "then",
  "when",
  "where",
  "what",
  "over",
  "some",
  "more",
  "most",
  "only",
  "other",
  "after",
  "before",
  "under",
  "while",
  "here",
  "proprietary",
]);

const MAX_KEYWORD_SUGGESTIONS = 8;

/**
 * Derives simple candidate search keywords from a batch of document
 * snippets: filenames (from metadata) plus frequently-occurring words in
 * the text, filtered against a small stopword list. This is a lightweight
 * heuristic (no NLP/keyword-extraction API available), meant to give users
 * a starting point rather than a precise topic model.
 */
function extractKeywordSuggestions(rows: VectorRow[]): string[] {
  const filenames = new Set<string>();
  const wordCounts = new Map<string, number>();

  for (const row of rows) {
    const meta = parseMetadata(row.metadata);
    if (meta.filename) {
      const base = meta.filename.replace(/\.[a-zA-Z0-9]+$/, "").trim();
      if (base) filenames.add(base);
    }

    const words = row.text
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .filter((w) => w.length > 4 && !STOPWORDS.has(w));

    for (const w of words) {
      wordCounts.set(w, (wordCounts.get(w) ?? 0) + 1);
    }
  }

  const topWords = [...wordCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([w]) => w);

  const suggestions = [...filenames, ...topWords];
  const unique = [...new Set(suggestions)];
  return unique.slice(0, MAX_KEYWORD_SUGGESTIONS);
}

/** One turn in the "Ask AI" conversation. Assistant turns carry the ordered
 * list of document keys that were sent as `[doc N]` context for that
 * specific answer, so citations in *that* answer link to the right cards
 * even if the selected context documents change between questions. */
type ConversationTurn =
  | { role: "user"; content: string }
  | { role: "assistant"; content: string; citationKeys: string[] };

function KnowledgeBasePage() {
  const { data: caps } = useCapabilities();
  const { logError } = useActivityLog();
  const dbEnabled = caps?.databaseEnabled === true;

  const [search, setSearch] = useState("");
  const [results, setResults] = useState<VectorRow[] | null>(null);
  const [question, setQuestion] = useState("");
  const [conversation, setConversation] = useState<ConversationTurn[]>([]);
  const [provider, setProvider] = useState<AiProviderId>(
    DEFAULT_AI_PROVIDER_ID,
  );
  const [keywordSuggestions, setKeywordSuggestions] = useState<string[]>([]);
  const [availableFilenames, setAvailableFilenames] = useState<string[]>([]);
  const [suggestionsLoading, setSuggestionsLoading] = useState(true);
  const [tableFilter, setTableFilter] = useState<VectorTable | "all">(
    ALL_TABLES_VALUE,
  );
  const [filenameFilter, setFilenameFilter] = useState(ALL_FILES_VALUE);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [sortBy, setSortBy] = useState<SortOption>("relevance");
  const [expandedDocs, setExpandedDocs] = useState<Set<string>>(new Set());
  const [contextDocKeys, setContextDocKeys] = useState<Set<string>>(new Set());
  const [semanticSearch, setSemanticSearch] = useState(true);

  const querySource = useQuerySource();
  const executeModel = useAiModel();
  const embedQuery = useEmbedSearchQuery();
  const isSearching = querySource.isPending || embedQuery.isPending;

  // Chunks of the same document (same table + knowledge_base_file_id) are
  // merged into a single combined entry so a document that matched in
  // multiple chunks reads as one result instead of several fragments, then
  // ordered by the selected sort option.
  const documentGroups = useMemo(
    () => sortDocumentGroups(groupResultsByDocument(results ?? []), sortBy),
    [results, sortBy],
  );

  // Load a sample of documents once on mount, across every knowledge-base
  // table, to derive sample search keywords (filenames + frequent words)
  // and the list of known document filenames (for the Document filter).
  useEffect(() => {
    querySource.mutate(
      {
        connectorId: VECTOR_STORE_CONNECTOR_ID,
        payload: {
          query: buildUnionQuery(VECTOR_TABLES, "", 50),
        },
      },
      {
        onSuccess: (res) => {
          const rows = (res?.data ?? []) as VectorRow[];
          setKeywordSuggestions(extractKeywordSuggestions(rows));
          setAvailableFilenames(extractFilenames(rows));
          setSuggestionsLoading(false);
        },
        onError: () => {
          setSuggestionsLoading(false);
        },
      },
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function runVectorStoreQuery(query: string) {
    querySource.mutate(
      {
        connectorId: VECTOR_STORE_CONNECTOR_ID,
        payload: { query },
      },
      {
        onSuccess: (res) => {
          setResults((res?.data ?? []) as VectorRow[]);
        },
        onError: (err) => {
          setResults([]);
          if (dbEnabled) {
            logError({
              message: `Knowledge Base search failed: ${err.message}`,
              severity: "error",
              source: "Knowledge Base",
            });
          }
        },
      },
    );
  }

  function handleSearch(term = search) {
    const trimmedTerm = term.trim();
    setSearch(trimmedTerm);
    setConversation([]);
    setExpandedDocs(new Set());
    setContextDocKeys(new Set());
    const tables =
      tableFilter === ALL_TABLES_VALUE ? VECTOR_TABLES : [tableFilter];
    const filterConditions = buildFilterConditions(
      filenameFilter,
      dateFrom,
      dateTo,
    );

    // Semantic search needs a non-empty query to embed — an empty search
    // box just falls back to the plain "browse everything" keyword query.
    if (semanticSearch && trimmedTerm) {
      embedQuery.mutate(trimmedTerm, {
        onSuccess: ({ embedding }) => {
          runVectorStoreQuery(
            buildSemanticUnionQuery(
              tables,
              embedding,
              MAX_RESULTS,
              filterConditions,
            ),
          );
        },
        onError: (err) => {
          setResults([]);
          if (dbEnabled) {
            logError({
              message: `Knowledge Base semantic search failed: ${err.message}`,
              severity: "error",
              source: "Knowledge Base",
            });
          }
        },
      });
      return;
    }

    const searchCondition = trimmedTerm
      ? `(text ILIKE '%${escapeSqlLiteral(trimmedTerm)}%' OR metadata ILIKE '%${escapeSqlLiteral(trimmedTerm)}%')`
      : null;
    const allConditions = [
      ...(searchCondition ? [searchCondition] : []),
      ...filterConditions,
    ];
    const where =
      allConditions.length > 0 ? `WHERE ${allConditions.join(" AND ")}` : "";
    runVectorStoreQuery(buildUnionQuery(tables, where, MAX_RESULTS));
  }

  // Documents the user explicitly added via each card's "Add to Ask AI
  // context" button take priority over the automatic top-N default, so a
  // user can control exactly what the assistant is grounded in.
  function toggleContextDoc(key: string) {
    setContextDocKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function handleAsk() {
    const trimmedQuestion = question.trim();
    if (!trimmedQuestion || documentGroups.length === 0) return;

    const selectedDocs = documentGroups.filter((d) =>
      contextDocKeys.has(d.key),
    );
    const docs = (
      selectedDocs.length > 0 ? selectedDocs : documentGroups
    ).slice(0, MAX_CONTEXT_DOCUMENTS);
    const citationKeys = docs.map((d) => d.key);
    const context = docs
      .map(
        (d, i) =>
          `[doc ${i + 1}] (table: ${d.sourceTable}, file: ${d.filename ?? "unknown"})\n${d.text}`,
      )
      .join("\n\n");

    const priorTurns = conversation.map((turn) => ({
      role: turn.role,
      content: turn.content,
    }));
    const userTurn: ConversationTurn = {
      role: "user",
      content: trimmedQuestion,
    };
    setConversation((prev) => [...prev, userTurn]);
    setQuestion("");

    executeModel.mutate(
      {
        connectorId: provider,
        messages: [
          {
            role: "user",
            content: `Here are document snippets from a knowledge base:\n\n${context}\n\nAnswer questions using only the snippets above. After each claim, cite the snippet it came from like "[doc 1]". If the snippets don't contain the answer, say so. This may be a multi-turn conversation — treat any earlier questions/answers below as prior context for follow-up questions.`,
          },
          ...priorTurns,
          { role: "user", content: trimmedQuestion },
        ],
        instructions:
          "You are a knowledge-base assistant. Only answer from the provided snippets and always cite which snippet ([doc N]) backs each claim.",
      },
      {
        onSuccess: (res) => {
          const text = extractProviderText(res?.data);
          setConversation((prev) => [
            ...prev,
            {
              role: "assistant",
              content: text || "The model returned no content.",
              citationKeys,
            },
          ]);
        },
        onError: (err) => {
          setConversation((prev) => prev.slice(0, -1));
          if (dbEnabled) {
            logError({
              message: `Knowledge Base Q&A failed: ${err.message}`,
              severity: "error",
              source: "Knowledge Base",
            });
          }
        },
      },
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          Knowledge Base
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Search embedded documents across every table in the AI Squared Vector
          Store — chunks from the same document are combined into one result —
          and ask AI questions grounded in the matching text.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Search documents</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <div className="flex gap-2">
            <Input
              placeholder="Search by keyword..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleSearch();
              }}
            />
            <Select
              value={tableFilter}
              onValueChange={(value) => {
                if (value) setTableFilter(value as VectorTable | "all");
              }}
            >
              <SelectTrigger className="w-[200px]">
                <SelectValue placeholder="Table" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL_TABLES_VALUE}>All tables</SelectItem>
                {VECTOR_TABLES.map((table) => (
                  <SelectItem key={table} value={table}>
                    {table}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button onClick={() => handleSearch()} disabled={isSearching}>
              <Search />
              {isSearching
                ? semanticSearch && embedQuery.isPending
                  ? "Understanding query..."
                  : "Searching..."
                : "Search"}
            </Button>
          </div>
          <div className="flex flex-wrap items-end gap-2">
            <div className="flex flex-col gap-1">
              <Label className="text-xs font-normal text-muted-foreground">
                Document
              </Label>
              <Select
                value={filenameFilter}
                onValueChange={(value) => {
                  if (value) setFilenameFilter(value);
                }}
              >
                <SelectTrigger className="w-[220px]">
                  <SelectValue placeholder="All documents" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL_FILES_VALUE}>All documents</SelectItem>
                  {availableFilenames.map((name) => (
                    <SelectItem key={name} value={name}>
                      {name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-1">
              <Label className="text-xs font-normal text-muted-foreground">
                From date
              </Label>
              <Input
                type="date"
                className="w-[160px]"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-1">
              <Label className="text-xs font-normal text-muted-foreground">
                To date
              </Label>
              <Input
                type="date"
                className="w-[160px]"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
              />
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Switch
              id="semantic-search"
              checked={semanticSearch}
              onCheckedChange={setSemanticSearch}
            />
            <Label
              htmlFor="semantic-search"
              className="text-sm font-normal text-muted-foreground"
            >
              Semantic search
            </Label>
          </div>
          <p className="text-xs text-muted-foreground">
            {semanticSearch
              ? "Understands the meaning of your query — matches by concept and context, not just exact words, using AI-generated embeddings compared against every document's stored vector."
              : "Matches text and metadata directly (keyword search) — turn on Semantic search above for concept-based matching instead of exact words."}
          </p>
          {suggestionsLoading ? (
            <div className="flex gap-2">
              <Skeleton className="h-6 w-20 rounded-full" />
              <Skeleton className="h-6 w-24 rounded-full" />
              <Skeleton className="h-6 w-16 rounded-full" />
            </div>
          ) : keywordSuggestions.length > 0 ? (
            <div className="flex flex-col gap-1.5">
              <span className="text-xs font-medium text-muted-foreground">
                Try a sample keyword from your documents:
              </span>
              <div className="flex flex-wrap gap-1.5">
                {keywordSuggestions.map((kw) => (
                  <Badge
                    key={kw}
                    variant="secondary"
                    className="cursor-pointer hover:bg-secondary/70"
                    onClick={() => handleSearch(kw)}
                  >
                    {kw}
                  </Badge>
                ))}
              </div>
            </div>
          ) : null}
        </CardContent>
      </Card>

      {isSearching && (
        <div className="flex flex-col gap-2">
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
        </div>
      )}

      {results && !isSearching && (
        <Card>
          <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2">
            <CardTitle className="text-base">
              Results ({documentGroups.length}{" "}
              {documentGroups.length === 1 ? "document" : "documents"})
            </CardTitle>
            {documentGroups.length > 0 && (
              <div className="flex items-center gap-2">
                <Label className="text-xs font-normal text-muted-foreground">
                  Sort by
                </Label>
                <Select
                  value={sortBy}
                  onValueChange={(value) => {
                    if (value) setSortBy(value as SortOption);
                  }}
                >
                  <SelectTrigger className="w-[160px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {SORT_OPTIONS.map((opt) => (
                      <SelectItem key={opt.value} value={opt.value}>
                        {opt.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </CardHeader>
          <CardContent>
            {documentGroups.length === 0 ? (
              <Empty>
                <EmptyHeader>
                  <EmptyMedia variant="icon">
                    <BookOpenText />
                  </EmptyMedia>
                  <EmptyTitle>No matches found</EmptyTitle>
                  <EmptyDescription>
                    Try a different search term.
                  </EmptyDescription>
                </EmptyHeader>
              </Empty>
            ) : (
              <div className="flex flex-col gap-4">
                {documentGroups.map((doc) => {
                  const isExpanded = expandedDocs.has(doc.key);
                  const shownText = isExpanded
                    ? doc.text
                    : buildSnippet(doc.text, search);
                  const isLong =
                    !isExpanded && shownText.length < doc.text.length;
                  const isInContext = contextDocKeys.has(doc.key);

                  return (
                    <div
                      key={doc.key}
                      id={docAnchorId(doc.key)}
                      className="group scroll-mt-4 rounded-lg border p-4 transition-colors hover:border-primary/40 hover:bg-muted/30"
                    >
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="flex min-w-0 items-center gap-2.5">
                          <div className="flex size-8 shrink-0 items-center justify-center rounded-md bg-muted">
                            <FileText className="size-4 text-muted-foreground" />
                          </div>
                          <div className="min-w-0">
                            <p className="truncate text-sm font-medium">
                              {doc.filename ?? "Untitled document"}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              {TABLE_LABELS[doc.sourceTable]}
                            </p>
                          </div>
                        </div>
                        <div className="flex shrink-0 items-center gap-1.5">
                          {doc.bestDistance != null && (
                            <Badge className="gap-1">
                              <Sparkles className="size-3" />
                              {Math.round((1 - doc.bestDistance / 2) * 100)}%
                              match
                            </Badge>
                          )}
                          {doc.chunkCount > 1 && (
                            <Badge variant="outline" className="gap-1">
                              <Layers className="size-3" />
                              {doc.chunkCount} chunks merged
                            </Badge>
                          )}
                          <Button
                            variant={isInContext ? "default" : "outline"}
                            size="sm"
                            className="h-7 gap-1 px-2 text-xs"
                            onClick={() => toggleContextDoc(doc.key)}
                          >
                            {isInContext ? (
                              <>
                                <CircleCheck className="size-3" /> In context
                              </>
                            ) : (
                              <>
                                <Plus className="size-3" /> Add to Ask AI
                              </>
                            )}
                          </Button>
                        </div>
                      </div>
                      <Separator className="my-3" />
                      <Markdown
                        className={cn(
                          "text-sm text-foreground/90",
                          "[&>*+*]:mt-2.5",
                          "[&_p]:leading-relaxed [&_p]:whitespace-pre-line",
                          "[&_h1]:text-base [&_h1]:font-semibold [&_h1]:mt-3 [&_h1]:mb-1.5 [&_h1]:first:mt-0",
                          "[&_h2]:text-sm [&_h2]:font-semibold [&_h2]:mt-2.5 [&_h2]:mb-1 [&_h2]:first:mt-0",
                          "[&_h3]:text-sm [&_h3]:font-medium [&_h3]:mt-2 [&_h3]:mb-1 [&_h3]:first:mt-0",
                          "[&_ul]:list-disc [&_ul]:pl-5 [&_ul]:space-y-1",
                          "[&_ol]:list-decimal [&_ol]:pl-5 [&_ol]:space-y-1",
                          "[&_li]:leading-relaxed",
                          "[&_strong]:rounded [&_strong]:bg-primary/20 [&_strong]:px-0.5 [&_strong]:font-medium [&_strong]:text-foreground",
                          "[&_code]:rounded-md [&_code]:bg-muted [&_code]:px-1 [&_code]:py-0.5 [&_code]:text-xs [&_code]:font-mono",
                          "[&_blockquote]:border-l-2 [&_blockquote]:border-border [&_blockquote]:pl-3 [&_blockquote]:text-muted-foreground [&_blockquote]:italic",
                          "[&_table]:w-full [&_table]:text-xs [&_table]:border-collapse [&_table]:my-2",
                          "[&_th]:border [&_th]:border-border [&_th]:bg-muted [&_th]:px-2 [&_th]:py-1 [&_th]:text-left [&_th]:font-medium",
                          "[&_td]:border [&_td]:border-border [&_td]:px-2 [&_td]:py-1",
                        )}
                      >
                        {highlightMatches(
                          reconstructHeadings(shownText),
                          search,
                        )}
                      </Markdown>
                      {isLong && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="mt-2 h-7 px-2 text-xs text-muted-foreground"
                          onClick={() =>
                            setExpandedDocs((prev) => {
                              const next = new Set(prev);
                              if (next.has(doc.key)) next.delete(doc.key);
                              else next.add(doc.key);
                              return next;
                            })
                          }
                        >
                          {isExpanded ? (
                            <>
                              <ChevronUp /> Show less
                            </>
                          ) : (
                            <>
                              <ChevronDown /> Show full document
                            </>
                          )}
                        </Button>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {documentGroups.length > 0 && (
        <Card>
          <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2">
            <div>
              <CardTitle className="text-base">
                Ask AI about these results
              </CardTitle>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {contextDocKeys.size > 0
                  ? `Grounded in ${Math.min(contextDocKeys.size, MAX_CONTEXT_DOCUMENTS)} document${contextDocKeys.size === 1 ? "" : "s"} you added to context.`
                  : `Grounded in the top ${Math.min(MAX_CONTEXT_DOCUMENTS, documentGroups.length)} result${documentGroups.length === 1 ? "" : "s"} — add a document to context above to control this.`}
              </p>
            </div>
            {conversation.length > 0 && (
              <Button
                variant="ghost"
                size="sm"
                className="text-xs text-muted-foreground"
                onClick={() => setConversation([])}
              >
                New conversation
              </Button>
            )}
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            {conversation.length > 0 && (
              <div className="flex flex-col gap-3">
                {conversation.map((turn, i) =>
                  turn.role === "user" ? (
                    <div
                      key={`turn-${i}-${turn.content.slice(0, 20)}`}
                      className="ml-auto max-w-[85%] rounded-lg bg-primary px-3 py-2 text-sm text-primary-foreground"
                    >
                      {turn.content}
                    </div>
                  ) : (
                    <div
                      key={`turn-${i}-${turn.content.slice(0, 20)}`}
                      className="max-w-[90%] rounded-lg border p-3"
                    >
                      <Markdown
                        className={cn(
                          "text-sm",
                          "[&_a]:font-medium [&_a]:text-primary [&_a]:underline [&_a]:underline-offset-2",
                        )}
                      >
                        {linkCitations(turn.content, turn.citationKeys)}
                      </Markdown>
                    </div>
                  ),
                )}
              </div>
            )}
            <Input
              placeholder={
                conversation.length > 0
                  ? "Ask a follow-up question..."
                  : "Ask a question about the matching documents..."
              }
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleAsk();
              }}
            />
            <div className="flex items-center gap-2">
              <Button
                onClick={handleAsk}
                disabled={!question.trim() || executeModel.isPending}
              >
                <Sparkles />
                {executeModel.isPending ? "Thinking..." : "Ask"}
              </Button>
              <AiProviderSelect value={provider} onChange={setProvider} />
            </div>
            {executeModel.isError && (
              <Alert variant="destructive">
                <AlertTitle>Something went wrong</AlertTitle>
                <AlertDescription>
                  Couldn't get an answer right now. Please try again.
                </AlertDescription>
              </Alert>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
