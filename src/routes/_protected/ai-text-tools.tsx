import { createFileRoute } from "@tanstack/react-router";
import { useRef, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  ShieldAlert,
  ShieldCheck,
  Upload,
  Trash2,
  Loader2,
  X,
  FileText,
  SmilePlus,
  Copy,
  Quote,
  GitCompare,
} from "lucide-react";
import { useCapabilities } from "@/hooks/useCapabilities";
import { useAiModel } from "@/hooks/useAiModel";
import { useActivityLog } from "@/hooks/useActivityLog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";
import { Markdown } from "@/components/ui/markdown";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import { AiProviderSelect } from "@/components/ai/AiProviderSelect";
import {
  extractProviderText,
  DEFAULT_AI_PROVIDER_ID,
  type AiProviderId,
} from "@/lib/aiProviders";
import { extractUploadedDocumentText } from "@/services/ai/documentExtractionService";
import {
  listModerationChecks,
  createModerationCheck,
  deleteModerationCheck,
} from "@/services/db/moderationService";
import {
  listSentimentAnalyses,
  createSentimentAnalysis,
  deleteSentimentAnalysis,
} from "@/services/db/sentimentAnalysisService";

export const Route = createFileRoute("/_protected/ai-text-tools")({
  component: AiTextToolsPage,
});

const PLAIN_TEXT_EXTENSIONS = [
  "txt",
  "md",
  "csv",
  "log",
  "json",
  "xml",
  "html",
  "rst",
  "rtf",
];
const BINARY_EXTENSIONS = ["pdf", "docx", "odt"];
const SUPPORTED_EXTENSIONS = [...PLAIN_TEXT_EXTENSIONS, ...BINARY_EXTENSIONS];

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result ?? "");
      const commaIndex = result.indexOf(",");
      resolve(commaIndex >= 0 ? result.slice(commaIndex + 1) : result);
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

function fileToText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(reader.error);
    reader.readAsText(file);
  });
}

/* ------------------------------------------------------------------ */
/* Moderation tab                                                      */
/* ------------------------------------------------------------------ */

const MODERATION_CHAR_LIMIT = 10000;

type ParsedModeration = {
  flagged: boolean;
  categories: { name: string; severity: "low" | "medium" | "high" }[];
};

function parseModeration(raw: string): ParsedModeration {
  try {
    const match = raw.match(/\{[\s\S]*\}/);
    if (!match) throw new Error("no json");
    const parsed = JSON.parse(match[0]);
    const categories = Array.isArray(parsed.categories)
      ? parsed.categories
          .filter(
            (c: unknown) =>
              c && typeof (c as { name?: unknown }).name === "string",
          )
          .map((c: { name: string; severity?: unknown }) => ({
            name: c.name,
            severity: ["low", "medium", "high"].includes(c.severity as string)
              ? (c.severity as "low" | "medium" | "high")
              : "medium",
          }))
      : [];
    return { flagged: Boolean(parsed.flagged), categories };
  } catch {
    return { flagged: false, categories: [] };
  }
}

function severityColor(severity: string) {
  if (severity === "high")
    return "bg-red-500/15 text-red-600 dark:text-red-400";
  if (severity === "medium")
    return "bg-amber-500/15 text-amber-600 dark:text-amber-400";
  return "bg-muted text-muted-foreground";
}

function ModerationTab() {
  const { data: caps } = useCapabilities();
  const { logAudit, logError } = useActivityLog();
  const queryClient = useQueryClient();
  const [text, setText] = useState("");
  const [fileName, setFileName] = useState<string | null>(null);
  const [isImporting, setIsImporting] = useState(false);
  const [provider, setProvider] = useState<AiProviderId>(
    DEFAULT_AI_PROVIDER_ID,
  );
  const fileInputRef = useRef<HTMLInputElement>(null);
  const aiModel = useAiModel();
  const [lastResult, setLastResult] = useState<ParsedModeration | null>(null);

  const dbEnabled = caps?.databaseEnabled === true;
  const charCount = text.length;

  const { data: history, isLoading: historyLoading } = useQuery({
    queryKey: ["moderationChecks"],
    queryFn: () => listModerationChecks(),
    enabled: dbEnabled,
    staleTime: 15_000,
  });

  const saveMutation = useMutation({
    mutationFn: (input: Parameters<typeof createModerationCheck>[0]["data"]) =>
      createModerationCheck({ data: input }),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ["moderationChecks"] }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => deleteModerationCheck({ data: id }),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ["moderationChecks"] }),
  });

  function handleLoadFileClick() {
    fileInputRef.current?.click();
  }

  async function handleFileSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
    if (!SUPPORTED_EXTENSIONS.includes(ext)) {
      toast.error(
        `Unsupported file type ".${ext}". Supported: ${SUPPORTED_EXTENSIONS.join(", ")}`,
      );
      return;
    }
    setIsImporting(true);
    try {
      if (BINARY_EXTENSIONS.includes(ext)) {
        const base64 = await fileToBase64(file);
        const res = await extractUploadedDocumentText({
          data: { fileName: file.name, base64 },
        });
        setText(res.text.slice(0, MODERATION_CHAR_LIMIT));
      } else {
        const content = await fileToText(file);
        setText(content.slice(0, MODERATION_CHAR_LIMIT));
      }
      setFileName(file.name);
    } catch (error) {
      toast.error(
        `Couldn't read "${file.name}": ${error instanceof Error ? error.message : "unknown error"}`,
      );
    }
    setIsImporting(false);
  }

  function handleCheck() {
    const input = text.trim();
    if (!input) return;
    aiModel.mutate(
      {
        connectorId: provider,
        messages: [
          {
            role: "user",
            content: `Moderate the following text for policy violations. Respond with ONLY a JSON object (no markdown, no extra text) in this exact shape: {"flagged": true|false, "categories": [{"name": <one of "hate speech", "harassment", "violence", "self-harm", "sexual content", "misinformation">, "severity": "low"|"medium"|"high"}]}. Only include categories that actually apply; if nothing is concerning, return an empty categories array and flagged: false.\n\nText:\n${input}`,
          },
        ],
        instructions:
          "You are a precise content moderation assistant. Always respond with valid JSON only, matching the requested shape exactly.",
      },
      {
        onSuccess: (res) => {
          const raw = extractProviderText(res?.data);
          const parsed = parseModeration(raw);
          setLastResult(parsed);
          if (dbEnabled) {
            saveMutation.mutate({
              sourceLabel: fileName ?? "Pasted text",
              inputText: input,
              provider,
              flagged: parsed.flagged,
              categories: parsed.categories.map(
                (c) => `${c.name} (${c.severity})`,
              ),
              rawResponse: raw,
            });
            logAudit({
              action: "Ran content moderation check",
              resource: fileName ?? `${input.length} chars`,
              page: "/ai-text-tools",
              category: "ai",
            });
          }
        },
        onError: (error) => {
          toast.error("Failed to run moderation check. Please try again.");
          if (dbEnabled) {
            logError({
              message: String(error),
              severity: "error",
              source: "Content Moderation",
            });
          }
        },
      },
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-4">
          <CardTitle className="text-base">Content</CardTitle>
          <div className="flex items-center gap-2">
            <input
              ref={fileInputRef}
              type="file"
              accept=".txt,.md,.csv,.log,.json,.xml,.html,.rst,.rtf,.pdf,.docx,.odt"
              className="hidden"
              onChange={handleFileSelected}
            />
            <Button
              variant="outline"
              size="sm"
              onClick={handleLoadFileClick}
              disabled={isImporting}
            >
              {isImporting ? <Loader2 className="animate-spin" /> : <Upload />}
              Load File
            </Button>
          </div>
        </CardHeader>
        <CardContent className="flex flex-col gap-2">
          {fileName && (
            <Badge variant="secondary" className="gap-1.5 pr-1 self-start">
              <FileText className="size-3" />
              <span className="max-w-40 truncate">{fileName}</span>
              <button
                type="button"
                onClick={() => setFileName(null)}
                className="rounded-sm hover:bg-muted-foreground/20"
                aria-label="Clear file"
              >
                <X className="size-3" />
              </button>
            </Badge>
          )}
          <Textarea
            value={text}
            onChange={(e) => {
              setText(e.target.value.slice(0, MODERATION_CHAR_LIMIT));
              setFileName(null);
            }}
            placeholder="Paste text here, or load a document above..."
            className="min-h-48 font-mono text-sm"
          />
          <div className="flex justify-end">
            <span className="text-xs text-muted-foreground">
              {charCount.toLocaleString()} /{" "}
              {MODERATION_CHAR_LIMIT.toLocaleString()}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <Button
              onClick={handleCheck}
              disabled={!text.trim() || aiModel.isPending}
            >
              {aiModel.isPending ? (
                <Loader2 className="animate-spin" />
              ) : (
                <ShieldAlert />
              )}
              Check Content
            </Button>
            <AiProviderSelect value={provider} onChange={setProvider} />
          </div>
        </CardContent>
      </Card>

      {aiModel.isPending && (
        <Card>
          <CardContent className="flex flex-col gap-2 pt-6">
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-3/4" />
          </CardContent>
        </Card>
      )}

      {aiModel.isError && !aiModel.isPending && (
        <Alert variant="destructive">
          <AlertTitle>Something went wrong</AlertTitle>
          <AlertDescription>
            We couldn't check this content right now. Please try again.
          </AlertDescription>
        </Alert>
      )}

      {lastResult && !aiModel.isPending && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              {lastResult.flagged ? (
                <>
                  <ShieldAlert className="size-4 text-destructive" />
                  Flagged
                </>
              ) : (
                <>
                  <ShieldCheck className="size-4 text-emerald-600" />
                  No issues found
                </>
              )}
            </CardTitle>
          </CardHeader>
          {lastResult.categories.length > 0 && (
            <CardContent className="flex flex-wrap gap-1.5">
              {lastResult.categories.map((c) => (
                <Badge key={c.name} className={severityColor(c.severity)}>
                  {c.name} · {c.severity}
                </Badge>
              ))}
            </CardContent>
          )}
        </Card>
      )}

      <div>
        <h2 className="text-base font-semibold mb-2">History</h2>
        {!dbEnabled ? (
          <p className="text-sm text-muted-foreground">
            Database not configured — history isn't available.
          </p>
        ) : historyLoading ? (
          <Skeleton className="h-32 w-full" />
        ) : !history || history.length === 0 ? (
          <Empty>
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <ShieldAlert />
              </EmptyMedia>
              <EmptyTitle>No checks yet</EmptyTitle>
              <EmptyDescription>
                Run a check above to see it saved here.
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          <div className="flex flex-col gap-2">
            {history.map((h) => (
              <Card key={h.id}>
                <CardContent className="flex items-start justify-between gap-4 pt-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <Badge
                        className={
                          h.flagged
                            ? "bg-red-500/15 text-red-600 dark:text-red-400"
                            : "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"
                        }
                      >
                        {h.flagged ? "Flagged" : "Clean"}
                      </Badge>
                      <span className="text-xs text-muted-foreground truncate">
                        {h.sourceLabel}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {new Date(h.createdAt).toLocaleString()}
                      </span>
                    </div>
                    <p className="text-sm text-muted-foreground truncate">
                      {h.inputText}
                    </p>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => deleteMutation.mutate(h.id)}
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Sentiment tab                                                        */
/* ------------------------------------------------------------------ */

const SENTIMENT_CHAR_LIMIT = 10000;

type ParsedSentiment = {
  sentiment: "positive" | "negative" | "neutral" | null;
  sentimentScore: number | null;
  tones: string[];
  keyPhrases: string[];
};

function parseAnalysis(raw: string): ParsedSentiment {
  try {
    const match = raw.match(/\{[\s\S]*\}/);
    if (!match) throw new Error("no json");
    const parsed = JSON.parse(match[0]);
    const sentiment = ["positive", "negative", "neutral"].includes(
      parsed.sentiment,
    )
      ? parsed.sentiment
      : null;
    const sentimentScore =
      typeof parsed.score === "number" ? Math.round(parsed.score) : null;
    const tones = Array.isArray(parsed.tones)
      ? parsed.tones.filter((t: unknown) => typeof t === "string")
      : [];
    const keyPhrases = Array.isArray(parsed.keyPhrases)
      ? parsed.keyPhrases.filter((t: unknown) => typeof t === "string")
      : [];
    return { sentiment, sentimentScore, tones, keyPhrases };
  } catch {
    return { sentiment: null, sentimentScore: null, tones: [], keyPhrases: [] };
  }
}

function sentimentColor(sentiment: string | null) {
  if (sentiment === "positive")
    return "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400";
  if (sentiment === "negative")
    return "bg-red-500/15 text-red-600 dark:text-red-400";
  return "bg-muted text-muted-foreground";
}

function SentimentTab() {
  const { data: caps } = useCapabilities();
  const { logAudit, logError } = useActivityLog();
  const queryClient = useQueryClient();
  const [text, setText] = useState("");
  const [provider, setProvider] = useState<AiProviderId>(
    DEFAULT_AI_PROVIDER_ID,
  );
  const aiModel = useAiModel();
  const [lastResult, setLastResult] = useState<ParsedSentiment | null>(null);
  const [lastRaw, setLastRaw] = useState<string | null>(null);

  const dbEnabled = caps?.databaseEnabled === true;
  const charCount = text.length;

  const { data: history, isLoading: historyLoading } = useQuery({
    queryKey: ["sentimentAnalyses"],
    queryFn: () => listSentimentAnalyses(),
    enabled: dbEnabled,
    staleTime: 15_000,
  });

  const saveMutation = useMutation({
    mutationFn: (
      input: Parameters<typeof createSentimentAnalysis>[0]["data"],
    ) => createSentimentAnalysis({ data: input }),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ["sentimentAnalyses"] }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => deleteSentimentAnalysis({ data: id }),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ["sentimentAnalyses"] }),
  });

  function handleAnalyze() {
    const input = text.trim();
    if (!input) return;
    aiModel.mutate(
      {
        connectorId: provider,
        messages: [
          {
            role: "user",
            content: `Analyze the sentiment and tone of the following text. Respond with ONLY a JSON object (no markdown, no extra text) in this exact shape: {"sentiment": "positive"|"negative"|"neutral", "score": <integer 0-100 confidence>, "tones": [<up to 5 short tone descriptors like "formal", "urgent", "friendly">], "keyPhrases": [<up to 5 short exact quotes from the text that best support the sentiment>]}.\n\nText:\n${input}`,
          },
        ],
        instructions:
          "You are a precise sentiment and tone analysis assistant. Always respond with valid JSON only, matching the requested shape exactly.",
      },
      {
        onSuccess: (res) => {
          const raw = extractProviderText(res?.data);
          const parsed = parseAnalysis(raw);
          setLastResult(parsed);
          setLastRaw(raw);
          if (dbEnabled) {
            saveMutation.mutate({
              inputText: input,
              provider,
              sentiment: parsed.sentiment,
              sentimentScore: parsed.sentimentScore,
              tones: parsed.tones,
              keyPhrases: parsed.keyPhrases,
              rawResponse: raw,
            });
            logAudit({
              action: "Ran sentiment analysis",
              resource: `${input.length} chars`,
              page: "/ai-text-tools",
              category: "ai",
            });
          }
        },
        onError: (error) => {
          toast.error("Failed to analyze text. Please try again.");
          if (dbEnabled) {
            logError({
              message: String(error),
              severity: "error",
              source: "Sentiment Analyzer",
            });
          }
        },
      },
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Text</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-2">
          <Textarea
            value={text}
            onChange={(e) =>
              setText(e.target.value.slice(0, SENTIMENT_CHAR_LIMIT))
            }
            placeholder="Paste text to analyze (a review, email, message, feedback, etc.)..."
            className="min-h-48 font-mono text-sm"
          />
          <div className="flex justify-end">
            <span className="text-xs text-muted-foreground">
              {charCount.toLocaleString()} /{" "}
              {SENTIMENT_CHAR_LIMIT.toLocaleString()}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <Button
              onClick={handleAnalyze}
              disabled={!text.trim() || aiModel.isPending}
            >
              {aiModel.isPending ? (
                <Loader2 className="animate-spin" />
              ) : (
                <SmilePlus />
              )}
              Analyze
            </Button>
            <AiProviderSelect value={provider} onChange={setProvider} />
          </div>
        </CardContent>
      </Card>

      {aiModel.isPending && (
        <Card>
          <CardContent className="flex flex-col gap-2 pt-6">
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-3/4" />
          </CardContent>
        </Card>
      )}

      {aiModel.isError && !aiModel.isPending && (
        <Alert variant="destructive">
          <AlertTitle>Something went wrong</AlertTitle>
          <AlertDescription>
            We couldn't analyze this text right now. Please try again.
          </AlertDescription>
        </Alert>
      )}

      {lastResult && !aiModel.isPending && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Result</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            {lastResult.sentiment ? (
              <div className="flex items-center gap-3">
                <Badge className={sentimentColor(lastResult.sentiment)}>
                  {lastResult.sentiment}
                </Badge>
                {lastResult.sentimentScore !== null && (
                  <span className="text-sm text-muted-foreground">
                    Confidence: {lastResult.sentimentScore}%
                  </span>
                )}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground whitespace-pre-wrap">
                {lastRaw}
              </p>
            )}
            {lastResult.tones.length > 0 && (
              <div>
                <p className="text-xs font-medium text-muted-foreground mb-1.5">
                  Tone
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {lastResult.tones.map((t) => (
                    <Badge key={t} variant="secondary">
                      {t}
                    </Badge>
                  ))}
                </div>
              </div>
            )}
            {lastResult.keyPhrases.length > 0 && (
              <div>
                <p className="text-xs font-medium text-muted-foreground mb-1.5">
                  Key Phrases
                </p>
                <div className="flex flex-col gap-1.5">
                  {lastResult.keyPhrases.map((p, i) => (
                    <blockquote
                      // biome-ignore lint/suspicious/noArrayIndexKey: static list from one response
                      key={i}
                      className="border-l-2 border-primary/40 pl-3 text-sm text-muted-foreground italic"
                    >
                      {p}
                    </blockquote>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      <div>
        <h2 className="text-base font-semibold mb-2">History</h2>
        {!dbEnabled ? (
          <p className="text-sm text-muted-foreground">
            Database not configured — history isn't available.
          </p>
        ) : historyLoading ? (
          <Skeleton className="h-32 w-full" />
        ) : !history || history.length === 0 ? (
          <Empty>
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <SmilePlus />
              </EmptyMedia>
              <EmptyTitle>No analyses yet</EmptyTitle>
              <EmptyDescription>
                Run an analysis above to see it saved here.
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          <div className="flex flex-col gap-2">
            {history.map((h) => (
              <Card key={h.id}>
                <CardContent className="flex items-start justify-between gap-4 pt-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      {h.sentiment && (
                        <Badge className={sentimentColor(h.sentiment)}>
                          {h.sentiment}
                        </Badge>
                      )}
                      <span className="text-xs text-muted-foreground">
                        {new Date(h.createdAt).toLocaleString()}
                      </span>
                    </div>
                    <p className="text-sm text-muted-foreground truncate">
                      {h.inputText}
                    </p>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => deleteMutation.mutate(h.id)}
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Summariser tab                                                       */
/* ------------------------------------------------------------------ */

const SUMMARY_CHAR_LIMIT = 20000;

type LoadedDocument = { name: string; content: string };

function splitSummaryAndCitations(raw: string): [string | null, string[]] {
  if (!raw) return [null, []];
  const marker = /##\s*Citations/i;
  const match = raw.match(marker);
  if (!match || match.index === undefined) return [raw.trim(), []];

  const summaryPart = raw.slice(0, match.index).trim();
  const citationsPart = raw.slice(match.index + match[0].length);
  const citations = citationsPart
    .split(/\n+/)
    .map((line) => line.replace(/^[\s\-*\d.]+/, "").trim())
    .filter((line) => line.length > 0);

  return [summaryPart || null, citations];
}

function SummariserTab() {
  const { data: caps } = useCapabilities();
  const { logAudit, logError } = useActivityLog();
  const [text, setText] = useState("");
  const [documents, setDocuments] = useState<LoadedDocument[]>([]);
  const [isImporting, setIsImporting] = useState(false);
  const [provider, setProvider] = useState<AiProviderId>(
    DEFAULT_AI_PROVIDER_ID,
  );
  const fileInputRef = useRef<HTMLInputElement>(null);
  const executeModel = useAiModel();

  const dbEnabled = caps?.databaseEnabled === true;
  const documentsCharCount = documents.reduce(
    (sum, d) => sum + d.content.length,
    0,
  );
  const charCount = text.length + documentsCharCount;
  const nearLimit = charCount >= SUMMARY_CHAR_LIMIT * 0.9;
  const hasContent = text.trim().length > 0 || documents.length > 0;

  const rawResponse = extractProviderText(executeModel.data?.data);
  const [summary, citations] = splitSummaryAndCitations(rawResponse);

  function handleTextChange(value: string) {
    const remaining = Math.max(0, SUMMARY_CHAR_LIMIT - documentsCharCount);
    setText(value.slice(0, remaining));
  }

  function handleLoadFileClick() {
    fileInputRef.current?.click();
  }

  function handleRemoveDocument(name: string) {
    setDocuments((docs) => docs.filter((d) => d.name !== name));
  }

  async function handleFileSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    e.target.value = "";
    if (files.length === 0) return;

    setIsImporting(true);
    const loaded: LoadedDocument[] = [];
    for (const file of files) {
      const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
      if (!SUPPORTED_EXTENSIONS.includes(ext)) {
        toast.error(
          `Skipped "${file.name}": unsupported file type ".${ext}". Supported: ${SUPPORTED_EXTENSIONS.join(", ")}`,
        );
        continue;
      }
      try {
        if (BINARY_EXTENSIONS.includes(ext)) {
          const base64 = await fileToBase64(file);
          const res = await extractUploadedDocumentText({
            data: { fileName: file.name, base64 },
          });
          loaded.push({ name: file.name, content: res.text });
        } else {
          const content = await fileToText(file);
          loaded.push({ name: file.name, content });
        }
      } catch (error) {
        toast.error(
          `Couldn't read "${file.name}": ${
            error instanceof Error ? error.message : "unknown error"
          }`,
        );
      }
    }
    if (loaded.length > 0) {
      setDocuments((docs) => {
        const byName = new Map(docs.map((d) => [d.name, d] as const));
        for (const doc of loaded) byName.set(doc.name, doc);
        return Array.from(byName.values());
      });
    }
    setIsImporting(false);
  }

  function buildCombinedDocument() {
    const parts: string[] = [];
    if (documents.length > 0) {
      for (const doc of documents) {
        parts.push(`--- File: ${doc.name} ---\n${doc.content}`);
      }
    }
    if (text.trim()) parts.push(text);
    return parts.join("\n\n").slice(0, SUMMARY_CHAR_LIMIT);
  }

  function handleSummarise() {
    const combined = buildCombinedDocument();
    if (!combined.trim()) return;
    const isMultiDocument = documents.length > 1;
    executeModel.mutate(
      {
        connectorId: provider,
        messages: [
          {
            role: "user",
            content: isMultiDocument
              ? `Summarise the following documents. Produce one combined overview, then a short per-document summary for each file (using its filename as a heading). After that, add a heading "## Citations" followed by a numbered list of short, exact quotes copied verbatim from the documents that support the summary's main points (one quote per line, no extra commentary).\n\nDocuments:\n${combined}`
              : `Summarise the following document concisely. After the summary, add a heading "## Citations" followed by a numbered list of short, exact quotes copied verbatim from the document that support the summary's main points (one quote per line, no extra commentary).\n\nDocument:\n${combined}`,
          },
        ],
        instructions:
          "You are a helpful assistant that produces clear, concise summaries of documents along with exact supporting quotes from the source text.",
      },
      {
        onSuccess: () => {
          if (dbEnabled) {
            logAudit({
              action: "Generated AI summary",
              resource: `${documents.length || 1} document(s), ${combined.length} chars`,
              page: "/ai-text-tools",
              category: "ai",
            });
          }
        },
        onError: (error) => {
          toast.error("Failed to generate summary. Please try again.");
          if (dbEnabled) {
            logError({
              message: String(error),
              severity: "error",
              source: "AI Summariser",
            });
          }
        },
      },
    );
  }

  function handleCopy() {
    if (!summary) return;
    const withCitations =
      citations.length > 0
        ? `${summary}\n\nCitations:\n${citations.map((c, i) => `${i + 1}. ${c}`).join("\n")}`
        : summary;
    navigator.clipboard.writeText(withCitations);
    toast.success("Summary copied to clipboard.");
  }

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-4">
          <CardTitle className="text-base">Document</CardTitle>
          <div className="flex items-center gap-2">
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept=".txt,.md,.csv,.log,.json,.xml,.html,.rst,.rtf,.pdf,.docx,.odt"
              className="hidden"
              onChange={handleFileSelected}
            />
            <Button
              variant="outline"
              size="sm"
              onClick={handleLoadFileClick}
              disabled={isImporting}
            >
              {isImporting ? <Loader2 className="animate-spin" /> : <Upload />}
              Load File(s)
            </Button>
          </div>
        </CardHeader>
        <CardContent className="flex flex-col gap-2">
          {documents.length > 0 && (
            <div className="flex flex-wrap gap-2 pb-1">
              {documents.map((doc) => (
                <Badge
                  key={doc.name}
                  variant="secondary"
                  className="gap-1.5 pr-1"
                >
                  <FileText className="size-3" />
                  <span className="max-w-40 truncate">{doc.name}</span>
                  <button
                    type="button"
                    onClick={() => handleRemoveDocument(doc.name)}
                    className="rounded-sm hover:bg-muted-foreground/20"
                    aria-label={`Remove ${doc.name}`}
                  >
                    <X className="size-3" />
                  </button>
                </Badge>
              ))}
            </div>
          )}
          <Textarea
            value={text}
            onChange={(e) => handleTextChange(e.target.value)}
            placeholder={
              documents.length > 0
                ? "Add extra notes/text here, or leave blank to summarise the loaded document(s) above..."
                : "Paste your document text here, or load one or more files..."
            }
            className="min-h-64 font-mono text-sm"
          />
          <div className="flex justify-end">
            <span
              className={cn(
                "text-xs text-muted-foreground",
                nearLimit && "text-destructive",
              )}
            >
              {charCount.toLocaleString()} /{" "}
              {SUMMARY_CHAR_LIMIT.toLocaleString()}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <Button
              onClick={handleSummarise}
              disabled={!hasContent || executeModel.isPending}
            >
              <FileText />
              Summarise
              {documents.length > 1 ? ` ${documents.length} Documents` : ""}
            </Button>
            <AiProviderSelect value={provider} onChange={setProvider} />
          </div>
        </CardContent>
      </Card>

      {executeModel.isPending && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Summary</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-2">
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-3/4" />
          </CardContent>
        </Card>
      )}

      {!hasContent && !summary && !executeModel.isPending && (
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <FileText />
            </EmptyMedia>
            <EmptyTitle>No document loaded yet</EmptyTitle>
            <EmptyDescription>
              Paste text or load a file above, then click Summarise to generate
              a concise AI summary with supporting citations.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      )}

      {executeModel.isError && !executeModel.isPending && (
        <Alert variant="destructive">
          <AlertTitle>Something went wrong</AlertTitle>
          <AlertDescription>
            We couldn't generate a summary right now. Please try again in a
            moment.
          </AlertDescription>
        </Alert>
      )}

      {summary && !executeModel.isPending && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-4">
            <CardTitle className="text-base">Summary</CardTitle>
            <Button variant="outline" size="sm" onClick={handleCopy}>
              <Copy />
              Copy to Clipboard
            </Button>
          </CardHeader>
          <CardContent>
            {Markdown ? (
              <Markdown>{summary}</Markdown>
            ) : (
              <p className="whitespace-pre-wrap text-sm">{summary}</p>
            )}
          </CardContent>
        </Card>
      )}

      {citations.length > 0 && !executeModel.isPending && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Quote className="size-4" />
              Citations
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-2">
            {citations.map((quote, i) => (
              <blockquote
                // biome-ignore lint/suspicious/noArrayIndexKey: static list from one response
                key={i}
                className="border-l-2 border-primary/40 pl-3 text-sm text-muted-foreground italic"
              >
                {quote}
              </blockquote>
            ))}
          </CardContent>
        </Card>
      )}

      <p className="text-xs text-muted-foreground">
        Supported formats: txt, md, csv, log, json, xml, html, rst, rtf, pdf,
        docx, odt · Load multiple files at once for a combined summary · Powered
        by your selected AI provider
      </p>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Document comparison tab                                             */
/* ------------------------------------------------------------------ */

const COMPARISON_CHAR_LIMIT = 15000;

type DiffLine = { type: "same" | "added" | "removed"; text: string };

/** Simple LCS-based line diff — good enough for a plain-language visual diff
 * without pulling in a diff library. */
function diffLines(a: string, b: string): DiffLine[] {
  const linesA = a.split("\n");
  const linesB = b.split("\n");
  const n = linesA.length;
  const m = linesB.length;
  const dp: number[][] = Array.from({ length: n + 1 }, () =>
    new Array(m + 1).fill(0),
  );
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i][j] =
        linesA[i] === linesB[j]
          ? dp[i + 1][j + 1] + 1
          : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }
  const result: DiffLine[] = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (linesA[i] === linesB[j]) {
      result.push({ type: "same", text: linesA[i] });
      i++;
      j++;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      result.push({ type: "removed", text: linesA[i] });
      i++;
    } else {
      result.push({ type: "added", text: linesB[j] });
      j++;
    }
  }
  while (i < n) {
    result.push({ type: "removed", text: linesA[i] });
    i++;
  }
  while (j < m) {
    result.push({ type: "added", text: linesB[j] });
    j++;
  }
  return result;
}

function ComparisonSlot({
  slotId,
  label,
  text,
  fileName,
  onTextChange,
  onFileChange,
  onClearFile,
}: {
  slotId: string;
  label: string;
  text: string;
  fileName: string | null;
  onTextChange: (v: string) => void;
  onFileChange: (file: File) => void;
  onClearFile: () => void;
}) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isImporting, setIsImporting] = useState(false);

  async function handleFileSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
    if (!SUPPORTED_EXTENSIONS.includes(ext)) {
      toast.error(
        `Unsupported file type ".${ext}". Supported: ${SUPPORTED_EXTENSIONS.join(", ")}`,
      );
      return;
    }
    setIsImporting(true);
    try {
      await onFileChange(file);
    } finally {
      setIsImporting(false);
    }
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-4">
        <CardTitle className="text-base">{label}</CardTitle>
        <div className="flex items-center gap-2">
          <input
            id={`document-slot-file-${slotId}`}
            ref={fileInputRef}
            type="file"
            accept=".txt,.md,.csv,.log,.json,.xml,.html,.rst,.rtf,.pdf,.docx,.odt"
            className="hidden"
            onChange={handleFileSelected}
          />
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => fileInputRef.current?.click()}
            disabled={isImporting}
          >
            {isImporting ? <Loader2 className="animate-spin" /> : <Upload />}
            Load File
          </Button>
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-2">
        {fileName && (
          <Badge variant="secondary" className="gap-1.5 pr-1 self-start">
            <FileText className="size-3" />
            <span className="max-w-40 truncate">{fileName}</span>
            <button
              type="button"
              onClick={onClearFile}
              className="rounded-sm hover:bg-muted-foreground/20"
              aria-label="Clear file"
            >
              <X className="size-3" />
            </button>
          </Badge>
        )}
        <Textarea
          value={text}
          onChange={(e) =>
            onTextChange(e.target.value.slice(0, COMPARISON_CHAR_LIMIT))
          }
          placeholder="Paste text here, or load a file above..."
          className="min-h-56 font-mono text-sm"
        />
      </CardContent>
    </Card>
  );
}

function ComparisonTab() {
  const { data: caps } = useCapabilities();
  const { logAudit, logError } = useActivityLog();
  const [textA, setTextA] = useState("");
  const [textB, setTextB] = useState("");
  const [fileNameA, setFileNameA] = useState<string | null>(null);
  const [fileNameB, setFileNameB] = useState<string | null>(null);
  const [provider, setProvider] = useState<AiProviderId>(
    DEFAULT_AI_PROVIDER_ID,
  );
  const [diff, setDiff] = useState<DiffLine[] | null>(null);
  const aiModel = useAiModel();

  const dbEnabled = caps?.databaseEnabled === true;

  async function loadFile(
    file: File,
    setText: (v: string) => void,
    setName: (v: string) => void,
  ) {
    const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
    try {
      if (BINARY_EXTENSIONS.includes(ext)) {
        const base64 = await fileToBase64(file);
        const res = await extractUploadedDocumentText({
          data: { fileName: file.name, base64 },
        });
        setText(res.text.slice(0, COMPARISON_CHAR_LIMIT));
      } else {
        const content = await fileToText(file);
        setText(content.slice(0, COMPARISON_CHAR_LIMIT));
      }
      setName(file.name);
    } catch (error) {
      toast.error(
        `Couldn't read "${file.name}": ${error instanceof Error ? error.message : "unknown error"}`,
      );
    }
  }

  const summary = extractProviderText(aiModel.data?.data);

  function handleCompare() {
    if (!textA.trim() || !textB.trim()) return;
    setDiff(diffLines(textA, textB));
    aiModel.mutate(
      {
        connectorId: provider,
        messages: [
          {
            role: "user",
            content: `Compare Document A and Document B and produce a concise, plain-English summary of what changed between them (additions, removals, and edits), organized as a short bulleted list. Focus on substantive differences, not formatting.\n\nDocument A:\n${textA}\n\nDocument B:\n${textB}`,
          },
        ],
        instructions:
          "You are a helpful assistant that clearly summarizes differences between two versions of a document.",
      },
      {
        onSuccess: () => {
          if (dbEnabled) {
            logAudit({
              action: "Compared two documents",
              resource: `${fileNameA ?? "Document A"} vs ${fileNameB ?? "Document B"}`,
              page: "/ai-text-tools",
              category: "ai",
            });
          }
        },
        onError: (error) => {
          toast.error("Failed to summarize the differences. Please try again.");
          if (dbEnabled) {
            logError({
              message: String(error),
              severity: "error",
              source: "Document Comparison",
            });
          }
        },
      },
    );
  }

  const addedCount = diff?.filter((d) => d.type === "added").length ?? 0;
  const removedCount = diff?.filter((d) => d.type === "removed").length ?? 0;

  return (
    <div className="flex flex-col gap-6">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <ComparisonSlot
          key="doc-a"
          slotId="a"
          label="Document A"
          text={textA}
          fileName={fileNameA}
          onTextChange={(v) => {
            setTextA(v);
            setFileNameA(null);
          }}
          onFileChange={(file) => loadFile(file, setTextA, setFileNameA)}
          onClearFile={() => setFileNameA(null)}
        />
        <ComparisonSlot
          key="doc-b"
          slotId="b"
          label="Document B"
          text={textB}
          fileName={fileNameB}
          onTextChange={(v) => {
            setTextB(v);
            setFileNameB(null);
          }}
          onFileChange={(file) => loadFile(file, setTextB, setFileNameB)}
          onClearFile={() => setFileNameB(null)}
        />
      </div>

      <div className="flex items-center gap-2">
        <Button
          onClick={handleCompare}
          disabled={!textA.trim() || !textB.trim() || aiModel.isPending}
        >
          {aiModel.isPending ? (
            <Loader2 className="animate-spin" />
          ) : (
            <GitCompare />
          )}
          Compare
        </Button>
        <AiProviderSelect value={provider} onChange={setProvider} />
      </div>

      {diff && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-4">
            <CardTitle className="text-base">Line Diff</CardTitle>
            <div className="flex items-center gap-2">
              <Badge className="bg-emerald-500/15 text-emerald-600 dark:text-emerald-400">
                +{addedCount}
              </Badge>
              <Badge className="bg-red-500/15 text-red-600 dark:text-red-400">
                -{removedCount}
              </Badge>
            </div>
          </CardHeader>
          <CardContent>
            <div className="rounded-md border max-h-96 overflow-y-auto font-mono text-xs">
              {diff.map((line, i) => (
                <div
                  // biome-ignore lint/suspicious/noArrayIndexKey: static diff output, order matters
                  key={i}
                  className={cn(
                    "px-3 py-0.5 whitespace-pre-wrap break-all",
                    line.type === "added" &&
                      "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
                    line.type === "removed" &&
                      "bg-red-500/10 text-red-700 dark:text-red-400",
                  )}
                >
                  {line.type === "added"
                    ? "+ "
                    : line.type === "removed"
                      ? "- "
                      : "  "}
                  {line.text || " "}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {aiModel.isPending && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Summary of Changes</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-2">
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-3/4" />
          </CardContent>
        </Card>
      )}

      {aiModel.isError && !aiModel.isPending && (
        <Alert variant="destructive">
          <AlertTitle>Something went wrong</AlertTitle>
          <AlertDescription>
            We couldn't summarize the differences right now. Please try again.
          </AlertDescription>
        </Alert>
      )}

      {summary && !aiModel.isPending && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Summary of Changes</CardTitle>
          </CardHeader>
          <CardContent>
            <Markdown>{summary}</Markdown>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Page                                                                */
/* ------------------------------------------------------------------ */

function AiTextToolsPage() {
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">AI Text Tools</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Paste or upload text and let AI moderate, analyze, summarise, or
          compare it.
        </p>
      </div>

      <Tabs defaultValue="moderation">
        <TabsList>
          <TabsTrigger value="moderation">Moderation</TabsTrigger>
          <TabsTrigger value="sentiment">Sentiment & Tone</TabsTrigger>
          <TabsTrigger value="summariser">Summariser</TabsTrigger>
          <TabsTrigger value="comparison">Document Comparison</TabsTrigger>
        </TabsList>
        <TabsContent value="moderation" className="mt-4">
          <ModerationTab />
        </TabsContent>
        <TabsContent value="sentiment" className="mt-4">
          <SentimentTab />
        </TabsContent>
        <TabsContent value="summariser" className="mt-4">
          <SummariserTab />
        </TabsContent>
        <TabsContent value="comparison" className="mt-4">
          <ComparisonTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}
