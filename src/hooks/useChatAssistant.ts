import { useState, useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { trpc } from "@/integrations/trpc/react";
import { useRunWorkflow } from "@/hooks/useWorkflows";
import {
  useWorkflowDataAppConfig,
  useDataAppSessions,
} from "@/hooks/useDataAppSessions";
import {
  getOrCreateSessionId,
  generateSessionId,
  setSessionId,
  clearSessionId,
} from "@/lib/sessionManager";
import type { DataAppSession, ChatMessage } from "@/services/workflows/types";

export type ChatMessageUI = {
  id: string;
  role: "user" | "assistant";
  content: string;
};

export function serverMessagesToUI(msgs: ChatMessage[]): ChatMessageUI[] {
  return [...msgs]
    .sort((a, b) => a.id - b.id)
    .map((m) => ({
      id: `server-${m.id}`,
      role: m.role,
      content: m.content,
    }));
}

export function extractAssistantContent(res: Record<string, unknown>): string {
  const body = (res?.data ?? res) as Record<string, unknown> | undefined;
  const output = (body?.output ?? res?.output) as
    | Record<string, unknown>
    | undefined;
  const outputData = output?.data as Record<string, unknown> | undefined;
  const pick = (o: Record<string, unknown> | undefined): unknown =>
    o && "message" in o ? o.message : undefined;

  let msg: unknown =
    pick(outputData) ??
    pick(body?.data as Record<string, unknown> | undefined) ??
    body?.message ??
    res?.message ??
    "";

  if (msg == null) msg = "";
  if (typeof msg === "string") return msg;
  if (typeof msg === "object") return JSON.stringify(msg);
  return String(msg);
}

export function useChatAssistant(workflowId: string) {
  const queryClient = useQueryClient();
  const t = trpc.useTRPC();
  const { data: dataAppConfig } = useWorkflowDataAppConfig(workflowId);
  const client = trpc.useTRPCClient();

  const dataAppId =
    dataAppConfig?.data?.attributes.configuration.interface?.dataAppId;
  const dataAppToken =
    dataAppConfig?.data?.attributes.configuration.interface?.dataAppToken;

  const [messages, setMessages] = useState<ChatMessageUI[]>([]);
  const { data: sessions = [] } = useDataAppSessions(dataAppId);
  const runWorkflow = useRunWorkflow(workflowId);

  const sendMessage = useCallback(
    async (prompt: string) => {
      const trimmed = prompt.trim();
      if (!trimmed || !dataAppId || !dataAppToken) return;

      const sessionId = getOrCreateSessionId(dataAppId);
      setMessages((prev) => [
        ...prev,
        { id: `user-${Date.now()}`, role: "user", content: trimmed },
      ]);

      try {
        const res = await runWorkflow.mutateAsync({
          workflow: { inputs: { text: trimmed } },
          dataAppId,
          dataAppToken,
          dataAppSessionId: sessionId,
        });

        const content =
          extractAssistantContent(res as Record<string, unknown>) ||
          "No response.";

        setMessages((prev) => [
          ...prev,
          { id: `assistant-${Date.now()}`, role: "assistant", content },
        ]);

        await queryClient.invalidateQueries({
          queryKey:
            t.workflows.getDataAppSessions.queryOptions(dataAppId).queryKey,
        });
      } catch {
        setMessages((prev) => [
          ...prev,
          {
            id: `error-${Date.now()}`,
            role: "assistant",
            content: "Something went wrong. Please try again.",
          },
        ]);
      }
    },
    [runWorkflow, queryClient, dataAppId, dataAppToken, t],
  );

  const loadSession = useCallback(
    async (session: DataAppSession) => {
      if (!dataAppId) return;
      setSessionId(dataAppId, session.session_id);
      setMessages([]);

      const result = await client.workflows.getDataAppSessionMessages.query(
        session.id,
      );
      if (result) {
        setMessages(serverMessagesToUI(result));
      }
    },
    [dataAppId, client],
  );

  const startNewChat = useCallback(() => {
    if (!dataAppId) return;
    clearSessionId(dataAppId);
    setSessionId(dataAppId, generateSessionId());
    setMessages([]);
    void queryClient.invalidateQueries({
      queryKey: t.workflows.getDataAppSessions.queryOptions(dataAppId).queryKey,
    });
  }, [dataAppId, queryClient, t]);

  return {
    messages,
    sendMessage,
    isLoading: runWorkflow.isPending,
    error: runWorkflow.error,
    sessions,
    loadSession,
    startNewChat,
    ready: Boolean(dataAppId) && Boolean(dataAppToken),
  };
}
