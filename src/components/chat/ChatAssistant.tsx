import { useState, useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Loader } from "@/components/ui/loader";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Separator } from "@/components/ui/separator";
import { MessageBubble } from "@/components/chat/MessageBubble";
import { useChatAssistant } from "@/hooks/useChatAssistant";
import type { DataAppSession } from "@/services/workflows/types";
import { cn } from "@/lib/utils";
import { Send, History, Plus, MessageCircle, Sparkles } from "lucide-react";
import { useWorkflowDataAppConfig } from "@/hooks/useDataAppSessions";

type ChatAssistantProps = {
  workflowId: string;
  /**
   * Display name shown in the chat header.
   * Falls back to the workflow's `card_title` config value, then "Assistant".
   */
  name?: string;
  /**
   * Label shown above each assistant message.
   * Falls back to `name`, then the workflow's `responder_name`, then the resolved chat title.
   */
  assistantName?: string;
  className?: string;
  /** When true, removes border/radius so the chat fills its container edge-to-edge. */
  fullPage?: boolean;
  /**
   * Message shown when the conversation is empty and the workflow is ready.
   * Falls back to the workflow's `welcome_message` config value, then a generic prompt.
   */
  emptyMessage?: string;
  notReadyMessage?: string;
};

export function ChatAssistant({
  workflowId,
  name,
  assistantName,
  className,
  fullPage = false,
  emptyMessage,
  notReadyMessage = "Publish this workflow from the platform to enable chat.",
}: ChatAssistantProps) {
  const queryClient = useQueryClient();
  const {
    messages,
    sendMessage,
    isLoading,
    sessions,
    loadSession,
    startNewChat,
    ready,
  } = useChatAssistant(workflowId);

  const { data: config } = useWorkflowDataAppConfig(workflowId);

  const configProps =
    config?.data?.attributes.configuration.interface?.properties;

  // Explicit props take priority; workflow config values are the next fallback;
  // static strings are the last resort so the component always renders something.
  const resolvedChatTitle = name ?? configProps?.card_title ?? "Assistant";

  const resolvedAssistantName =
    assistantName ?? configProps?.chat_bot?.responder_name ?? resolvedChatTitle;

  const resolvedWelcomeMessage =
    emptyMessage ??
    configProps?.chat_bot?.welcome_message ??
    "Ask anything to get started.";

  const [inputValue, setInputValue] = useState("");
  const [historyOpen, setHistoryOpen] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom on new messages
  // biome-ignore lint/correctness/useExhaustiveDependencies: re-scroll whenever message list/loading state changes
  useEffect(() => {
    const el = scrollRef.current;
    if (el) {
      el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
    }
  }, [messages, isLoading]);

  useEffect(() => {
    if (historyOpen) {
      queryClient.invalidateQueries({
        queryKey: ["dataAppSessions"],
        exact: false,
      });
    }
  }, [historyOpen, queryClient]);

  const handleLoadSession = (session: DataAppSession) => {
    loadSession(session);
    setHistoryOpen(false);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputValue.trim() || isLoading || !ready) return;
    sendMessage(inputValue);
    setInputValue("");
  };

  return (
    <div
      className={cn(
        "flex flex-col h-full overflow-hidden",
        fullPage
          ? "bg-background"
          : "rounded-xl border border-border/60 bg-card",
        className,
      )}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border/60">
        <div className="flex items-center gap-2.5">
          <div className="flex size-7 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <Sparkles className="size-3.5" />
          </div>
          <span className="text-sm font-medium">{resolvedChatTitle}</span>
        </div>
        <div className="flex items-center gap-1">
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            onClick={() => setHistoryOpen(true)}
            aria-label="Chat history"
          >
            <History className="size-4" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            onClick={startNewChat}
            aria-label="New chat"
          >
            <Plus className="size-4" />
          </Button>
        </div>
      </div>

      {/* History sheet */}
      <Sheet open={historyOpen} onOpenChange={setHistoryOpen}>
        <SheetContent side="left" className="w-full max-w-xs sm:max-w-sm">
          <SheetHeader>
            <SheetTitle>History</SheetTitle>
          </SheetHeader>
          <div className="flex flex-col gap-0.5 pt-4">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="justify-start gap-2"
              onClick={() => {
                startNewChat();
                setHistoryOpen(false);
              }}
            >
              <Plus className="size-3.5" />
              New conversation
            </Button>
            <Separator className="my-2" />
            {sessions.length === 0 ? (
              <p className="text-xs text-muted-foreground py-6 px-2 text-center">
                No past conversations yet.
              </p>
            ) : (
              sessions.map((session) => (
                <Button
                  key={session.id}
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="justify-start font-normal text-left h-auto py-2 gap-2"
                  onClick={() => handleLoadSession(session)}
                >
                  <MessageCircle className="size-3.5 shrink-0 text-muted-foreground" />
                  <span className="truncate text-xs">
                    {session.title ||
                      `Session ${session.session_id.slice(0, 8)}`}
                  </span>
                </Button>
              ))
            )}
          </div>
        </SheetContent>
      </Sheet>

      {/* Messages area */}
      <div
        ref={scrollRef}
        className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden"
        role="log"
        aria-label="Chat messages"
      >
        {messages.length === 0 && !isLoading ? (
          <div className="flex flex-col items-center justify-center h-full gap-3 px-6 py-12">
            <div className="flex size-10 items-center justify-center rounded-full bg-muted">
              <Sparkles className="size-5 text-muted-foreground" />
            </div>
            <p className="text-sm text-muted-foreground text-center max-w-xs">
              {!ready ? notReadyMessage : resolvedWelcomeMessage}
            </p>
          </div>
        ) : (
          <div className={"flex flex-col px-3 py-2"}>
            {messages.map((msg) => (
              <div
                key={msg.id}
                className={cn(
                  "flex",
                  msg.role === "user" ? "justify-end" : "justify-start",
                )}
              >
                <MessageBubble
                  message={msg}
                  assistantName={resolvedAssistantName}
                  chatbotAvatar={
                    config?.data?.attributes.configuration.interface?.properties
                      ?.chat_bot?.avatar?.value
                  }
                />
              </div>
            ))}
            {isLoading && (
              <div className="flex gap-3 px-5 py-4">
                <div className="flex size-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                  <Sparkles className="size-3.5" />
                </div>
                <div className="pt-1">
                  <Loader variant="typing" text="Thinking..." />
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Input composer */}
      <div className="border-t border-border/60 p-3">
        <form onSubmit={handleSubmit} className="flex items-end gap-2">
          <Textarea
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            placeholder={ready ? "Send a message..." : "Chat not available"}
            className="min-h-[40px] max-h-[120px] resize-none text-sm"
            rows={1}
            disabled={isLoading || !ready}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                handleSubmit(e);
              }
            }}
          />
          <Button
            type="submit"
            size="icon"
            className="shrink-0 size-9 rounded-lg"
            disabled={!inputValue.trim() || isLoading || !ready}
          >
            <Send className="size-4" />
          </Button>
        </form>
      </div>
    </div>
  );
}
