import { createFileRoute } from "@tanstack/react-router";
import { memo, useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Plus, Trash2, Send, Sparkles, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Loader } from "@/components/ui/loader";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Empty,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
  EmptyDescription,
} from "@/components/ui/empty";
import { MessageBubble } from "@/components/chat/MessageBubble";

// Memoized so typing in the composer (which re-renders this whole page on
// every keystroke) doesn't re-render and re-parse markdown for every
// already-rendered message — only messages whose data actually changed
// (new/edited) re-render.
const MemoMessageBubble = memo(MessageBubble);
import type { ChatMessageUI } from "@/hooks/useChatAssistant";
import { useCapabilities } from "@/hooks/useCapabilities";
import { useAiModel } from "@/hooks/useAiModel";
import {
  AI_SQUARED_BOLT_CONNECTOR_ID,
  extractProviderText,
  type AiProviderId,
} from "@/lib/aiProviders";
import { cn } from "@/lib/utils";
import {
  listConversations,
  createConversation,
  deleteConversation,
  listMessages,
  addMessage,
} from "@/services/db/chatService";
import { useActivityLog } from "@/hooks/useActivityLog";

export const Route = createFileRoute("/_protected/chat")({
  component: ChatPage,
  // Catches render-time errors thrown anywhere in this route (instead of
  // letting them escape to a blank screen / full app reload, which is what
  // happens with no errorComponent — there's no error boundary anywhere
  // else in the route tree). Rendered in place of the page content, inside
  // the same sidebar/header layout, so the user never gets bounced to the
  // Dashboard or sees a hard reload.
  errorComponent: ChatRouteError,
});

function ChatRouteError({ error }: { error: unknown }) {
  const message =
    error instanceof Error ? error.message : "Something went wrong.";
  return (
    <div className="flex h-full items-center justify-center p-6">
      <Empty>
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <Sparkles />
          </EmptyMedia>
          <EmptyTitle>AI Chat hit an error</EmptyTitle>
          <EmptyDescription className="max-w-md whitespace-pre-wrap break-words">
            {message}
          </EmptyDescription>
        </EmptyHeader>
        <Button variant="outline" onClick={() => window.location.reload()}>
          Reload chat
        </Button>
      </Empty>
    </div>
  );
}

const MODEL_OPTIONS = [
  { id: 1319, label: "Anthropic" },
  { id: 1751, label: "OpenAI" },
  { id: AI_SQUARED_BOLT_CONNECTOR_ID, label: "AI Squared Bolt" },
] as const;

/** Anthropic (1319) and OpenAI (1751) call the provider's API directly with
 * this app's own secrets; "AI Squared Bolt" goes through the platform's
 * AI/ML connector (`AI_SQUARED_BOLT_CONNECTOR_ID`) — all three now go
 * through the shared `useAiModel()` dispatcher (see `@/lib/aiProviders` and
 * `@/hooks/useAiModel`), consolidating the connector-specific path that used
 * to live only in this file. */
function providerForConnectorId(connectorId: number): AiProviderId {
  if (connectorId === 1319) return "anthropic";
  if (connectorId === 1751) return "openai";
  return "ai-squared-bolt";
}

function isUnauthorized(error: unknown): boolean {
  if (!error) return false;
  const err = error as { message?: string; data?: { httpStatus?: number } };
  if (err.data?.httpStatus === 401) return true;
  if (typeof err.message === "string" && err.message.includes("401"))
    return true;
  return false;
}

/** AI Squared Bolt is the one model option still routed through the
 * platform's own AI/ML connector (see `AI_SQUARED_BOLT_CONNECTOR_ID`) rather
 * than a direct provider secret. That connector-execution endpoint has been
 * observed to reject some accounts' sessions with a 401 from the platform's
 * own authorization layer (confirmed live: the connector itself works fine;
 * the same accounts' sessions can query other connectors without issue) —
 * this is a platform-side permission gate, not something this app's code
 * can grant. Surface that plainly instead of a generic failure message. */
function aiSquaredBoltUnavailableMessage(): string {
  return "AI Squared Bolt isn't available for your account right now — the platform didn't authorize this session to run AI models through this connector. Try Anthropic or OpenAI instead, or ask your workspace admin for access.";
}

/** Turns any thrown error from the AI request into one plain-language
 * message, shared by the toast and the inline in-conversation banner so
 * both always say the same thing. Never throws itself, regardless of what
 * shape `error` is. */
function describeAiError(error: unknown, provider: AiProviderId): string {
  try {
    if (isUnauthorized(error) && provider === "ai-squared-bolt") {
      return aiSquaredBoltUnavailableMessage();
    }
    if (isUnauthorized(error)) {
      return "You are not authorized to use this model.";
    }
    const message =
      error instanceof Error
        ? error.message
        : typeof error === "string"
          ? error
          : "";
    return message
      ? `Failed to get a response: ${message}`
      : "Failed to get a response. Please try again.";
  } catch {
    return "Failed to get a response. Please try again.";
  }
}

function ChatPage() {
  const { data: caps, isLoading: capsLoading } = useCapabilities();
  const queryClient = useQueryClient();
  const { logAudit, logError } = useActivityLog();
  const dbEnabled = caps?.databaseEnabled === true;

  const [activeId, setActiveId] = useState<number | null>(null);
  const [connectorId, setConnectorId] = useState<number>(MODEL_OPTIONS[0].id);
  const [input, setInput] = useState("");
  // Shown inline in the message pane (not just a toast) when the AI request
  // fails, so the failure is visible in the conversation itself instead of
  // silently disappearing or crashing the page.
  const [chatError, setChatError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const initializedRef = useRef(false);

  const { data: conversations, isLoading: conversationsLoading } = useQuery({
    queryKey: ["chat-conversations"],
    queryFn: () => listConversations(),
    enabled: dbEnabled,
  });

  const { data: messages, isLoading: messagesLoading } = useQuery({
    queryKey: ["chat-messages", activeId],
    queryFn: () => listMessages({ data: activeId as number }),
    enabled: dbEnabled && activeId !== null,
  });

  const createConversationMut = useMutation({
    mutationFn: (connId: number) =>
      createConversation({ data: { title: "New Chat", connectorId: connId } }),
    onSuccess: (row) => {
      queryClient.invalidateQueries({ queryKey: ["chat-conversations"] });
      setActiveId(row.id);
      setConnectorId(row.connectorId ?? MODEL_OPTIONS[0].id);
      // Log conversation creation
      logAudit({
        action: "Created new chat conversation",
        resource: row.title,
        page: "/chat",
        category: "chat",
        status: "success",
      });
    },
  });

  const deleteConversationMut = useMutation({
    mutationFn: (id: number) => deleteConversation({ data: id }),
    onSuccess: (_data, id) => {
      const deletedConversation = conversations?.find((c) => c.id === id);
      queryClient.invalidateQueries({ queryKey: ["chat-conversations"] });
      if (activeId === id) setActiveId(null);
      // Log conversation deletion
      logAudit({
        action: "Deleted chat conversation",
        resource: deletedConversation?.title ?? "Chat",
        page: "/chat",
        category: "chat",
        status: "success",
      });
    },
  });

  const addMessageMut = useMutation({
    mutationFn: addMessage,
  });

  const aiModel = useAiModel();

  // Auto-create a conversation on first visit if none exist.
  useEffect(() => {
    if (!dbEnabled || conversationsLoading || initializedRef.current) return;
    initializedRef.current = true;
    if (conversations && conversations.length > 0) {
      const first = conversations[0];
      setActiveId(first.id);
      setConnectorId(first.connectorId ?? MODEL_OPTIONS[0].id);
    } else if (conversations && conversations.length === 0) {
      createConversationMut.mutate(connectorId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dbEnabled, conversationsLoading, conversations]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messages, aiModel.isPending]);

  const uiMessages: ChatMessageUI[] = useMemo(
    () =>
      (messages ?? []).map((m) => ({
        id: `server-${m.id}`,
        role: m.role,
        content: m.content,
      })),
    [messages],
  );

  function handleSelectConversation(id: number, connId: number | null) {
    setActiveId(id);
    setConnectorId(connId ?? MODEL_OPTIONS[0].id);
    setChatError(null);
  }

  function handleNewChat() {
    setChatError(null);
    createConversationMut.mutate(connectorId);
  }

  function handleSend() {
    const trimmed = input.trim();
    if (!trimmed || activeId === null || aiModel.isPending) return;
    const conversation = conversations?.find((c) => c.id === activeId);
    const conversationId = activeId;
    setInput("");
    setChatError(null);

    // Log user message sent
    logAudit({
      action: "Sent message to AI",
      resource: conversation?.title ?? "Chat",
      page: "/chat",
      category: "chat",
      status: "success",
    });

    addMessageMut.mutate(
      { data: { conversationId, role: "user", content: trimmed } },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({
            queryKey: ["chat-messages", conversationId],
          });
          queryClient.invalidateQueries({ queryKey: ["chat-conversations"] });

          const history = [
            ...(messages ?? []).map((m) => ({
              role: m.role,
              content: m.content,
            })),
            { role: "user" as const, content: trimmed },
          ];

          const provider = providerForConnectorId(connectorId);

          // Every callback below is wrapped in its own try/catch: these run
          // as mutation onSuccess/onError callbacks, which TanStack Query
          // does not catch exceptions from — an uncaught throw here would
          // otherwise become an unhandled rejection with no visible error
          // in the chat UI (previously reported as the page appearing to
          // reload/reset instead of showing what went wrong).
          const onAiSuccess = (res: unknown) => {
            try {
              const data = (res as { data?: unknown[] })?.data;
              const reply = extractProviderText(data);
              addMessage({
                data: {
                  conversationId,
                  role: "assistant",
                  content: reply || "No response received.",
                },
              })
                .then(() => {
                  queryClient.invalidateQueries({
                    queryKey: ["chat-messages", conversationId],
                  });
                })
                .catch((persistError) => {
                  setChatError(
                    "Got a response from the model, but couldn't save it to this conversation. Please try again.",
                  );
                  logError({
                    message: `Failed to persist AI reply: ${String(persistError)}`,
                    severity: "error",
                    source: "AI Chat",
                  });
                });
              // Log successful AI response
              logAudit({
                action: "Received AI response",
                resource: conversation?.title ?? "Chat",
                page: "/chat",
                category: "chat",
                status: "success",
              });
            } catch (renderError) {
              setChatError(describeAiError(renderError, provider));
              logError({
                message: `AI Chat onSuccess handler threw: ${String(renderError)}`,
                severity: "error",
                source: "AI Chat",
              });
            }
          };
          const onAiError = (error: unknown) => {
            try {
              // Log AI error
              logAudit({
                action: "AI request failed",
                resource: conversation?.title ?? "Chat",
                page: "/chat",
                category: "chat",
                status: "failure",
              });
              logError({
                message: String(error),
                severity: "error",
                source: "AI Chat",
              });
              const description = describeAiError(error, provider);
              setChatError(description);
              toast.error(description, {
                duration:
                  isUnauthorized(error) && provider === "ai-squared-bolt"
                    ? 10000
                    : undefined,
              });
            } catch {
              // Fallback path if something above itself threw — still
              // guarantees the user sees *something* in the chat rather
              // than a silent failure.
              setChatError("Failed to get a response. Please try again.");
            }
          };

          aiModel.mutate(
            { connectorId: provider, messages: history },
            { onSuccess: onAiSuccess, onError: onAiError },
          );
        },
      },
    );
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  if (capsLoading) {
    return (
      <div className="flex h-full flex-col gap-4 p-6">
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-full w-full" />
      </div>
    );
  }

  if (!dbEnabled) {
    return (
      <div className="flex h-full items-center justify-center p-6">
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <Sparkles />
            </EmptyMedia>
            <EmptyTitle>Database not configured</EmptyTitle>
            <EmptyDescription>
              AI Chat requires a database to store conversations and messages.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      </div>
    );
  }

  return (
    <div className="flex h-full">
      <div className="flex w-64 shrink-0 flex-col border-r sm:w-72">
        <div className="flex items-center justify-between gap-2 border-b p-3">
          <span className="text-sm font-medium">Conversations</span>
          <Button
            size="sm"
            variant="outline"
            onClick={handleNewChat}
            disabled={createConversationMut.isPending}
          >
            <Plus className="size-4" />
            New Chat
          </Button>
        </div>
        <div className="flex-1 overflow-y-auto p-2">
          {conversationsLoading ? (
            <div className="flex flex-col gap-2">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
          ) : conversations && conversations.length > 0 ? (
            <div className="flex flex-col gap-1">
              {conversations.map((c) => (
                <div
                  key={c.id}
                  className={cn(
                    "group flex cursor-pointer items-center justify-between gap-2 rounded-md px-2.5 py-2 text-sm hover:bg-accent",
                    activeId === c.id && "bg-accent",
                  )}
                  onClick={() => handleSelectConversation(c.id, c.connectorId)}
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">{c.title}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {new Date(c.updatedAt).toLocaleString()}
                    </p>
                  </div>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="size-7 shrink-0 opacity-0 group-hover:opacity-100"
                    onClick={(e) => {
                      e.stopPropagation();
                      deleteConversationMut.mutate(c.id);
                    }}
                  >
                    <Trash2 className="size-3.5" />
                  </Button>
                </div>
              ))}
            </div>
          ) : (
            <p className="p-2 text-sm text-muted-foreground">
              No conversations yet.
            </p>
          )}
        </div>
      </div>

      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex items-center justify-between gap-2 border-b p-3">
          <span className="text-sm font-medium">Model</span>
          <Select
            value={String(connectorId)}
            onValueChange={(v) => setConnectorId(Number(v))}
          >
            <SelectTrigger className="w-48">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {MODEL_OPTIONS.map((m) => (
                <SelectItem key={m.id} value={String(m.id)}>
                  {m.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div ref={scrollRef} className="flex-1 overflow-y-auto">
          {activeId === null ? (
            <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
              Select or start a conversation.
            </div>
          ) : messagesLoading ? (
            <div className="flex flex-col gap-3 p-6">
              <Skeleton className="h-16 w-2/3" />
              <Skeleton className="ml-auto h-12 w-1/2" />
              <Skeleton className="h-16 w-2/3" />
            </div>
          ) : uiMessages.length === 0 && !chatError ? (
            <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
              Send a message to start the conversation.
            </div>
          ) : (
            <div className="flex flex-col">
              {uiMessages.map((m) => (
                <MemoMessageBubble key={m.id} message={m} />
              ))}
              {aiModel.isPending && (
                <div className="flex items-start gap-2 rounded-lg bg-muted px-5 py-4">
                  <Loader variant="typing" size="sm" text="Thinking..." />
                </div>
              )}
              {chatError && (
                <div className="px-5 py-2">
                  <Alert variant="destructive">
                    <TriangleAlert className="size-4" />
                    <AlertTitle>Couldn't get a response</AlertTitle>
                    <AlertDescription className="whitespace-pre-wrap break-words">
                      {chatError}
                    </AlertDescription>
                  </Alert>
                </div>
              )}
            </div>
          )}
        </div>

        <div className="border-t p-3">
          <div className="flex items-end gap-2">
            <Textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Message the assistant..."
              className="min-h-[44px] resize-none"
              disabled={activeId === null}
            />
            <Button
              size="icon"
              onClick={handleSend}
              disabled={activeId === null || !input.trim() || aiModel.isPending}
            >
              <Send className="size-4" />
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
