import { describe, expect, it } from "vitest";
import {
  extractAssistantContent,
  serverMessagesToUI,
} from "@/hooks/useChatAssistant";
import type { ChatMessage } from "@/services/workflows/types";

describe("extractAssistantContent", () => {
  it("extracts from output.data.message", () => {
    const res = { output: { data: { message: "hello" } } };
    expect(extractAssistantContent(res)).toBe("hello");
  });

  it("extracts from data.output.data.message", () => {
    const res = { data: { output: { data: { message: "nested" } } } };
    expect(extractAssistantContent(res)).toBe("nested");
  });

  it("falls back to body.message", () => {
    const res = { data: { message: "fallback-body" } };
    expect(extractAssistantContent(res)).toBe("fallback-body");
  });

  it("falls back to res.message", () => {
    const res = { message: "top-level" };
    expect(extractAssistantContent(res)).toBe("top-level");
  });

  it("returns empty string when message is null", () => {
    const res = { output: { data: { message: null } } };
    expect(extractAssistantContent(res as Record<string, unknown>)).toBe("");
  });

  it("stringifies object message", () => {
    const res = { output: { data: { message: { key: "val" } } } };
    expect(extractAssistantContent(res)).toBe('{"key":"val"}');
  });

  it("returns empty string for completely empty input", () => {
    expect(extractAssistantContent({})).toBe("");
  });

  it("handles direct message at res level alongside data", () => {
    const res = { message: "direct" };
    expect(extractAssistantContent(res)).toBe("direct");
  });
});

describe("serverMessagesToUI", () => {
  it("sorts by id ascending and maps correctly", () => {
    const msgs: ChatMessage[] = [
      { id: 3, role: "assistant", content: "reply", workspace_id: 1 },
      { id: 1, role: "user", content: "hello", workspace_id: 1 },
      { id: 2, role: "user", content: "world", workspace_id: 1 },
    ];
    const result = serverMessagesToUI(msgs);
    expect(result).toEqual([
      { id: "server-1", role: "user", content: "hello" },
      { id: "server-2", role: "user", content: "world" },
      { id: "server-3", role: "assistant", content: "reply" },
    ]);
  });

  it("prefixes id with 'server-'", () => {
    const msgs: ChatMessage[] = [
      { id: 10, role: "user", content: "hi", workspace_id: 1 },
    ];
    expect(serverMessagesToUI(msgs)[0].id).toBe("server-10");
  });

  it("preserves role and content", () => {
    const msgs: ChatMessage[] = [
      { id: 1, role: "assistant", content: "abc", workspace_id: 1 },
    ];
    const result = serverMessagesToUI(msgs)[0];
    expect(result.role).toBe("assistant");
    expect(result.content).toBe("abc");
  });

  it("returns empty array for empty input", () => {
    expect(serverMessagesToUI([])).toEqual([]);
  });

  it("handles single item", () => {
    const msgs: ChatMessage[] = [
      { id: 5, role: "user", content: "only one", workspace_id: 1 },
    ];
    const result = serverMessagesToUI(msgs);
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({
      id: "server-5",
      role: "user",
      content: "only one",
    });
  });
});
