import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MessageBubble } from "@/components/chat/MessageBubble";
import type { ChatMessageUI } from "@/hooks/useChatAssistant";

vi.mock("@/components/chat/ChatMarkdown", () => ({
  ChatMarkdown: ({ content }: { content: string }) => (
    <div data-testid="chat-markdown">{content}</div>
  ),
}));

vi.mock("lucide-react", () => ({
  Sparkles: (props: Record<string, unknown>) => (
    <svg data-testid="icon-sparkles" {...props} />
  ),
}));

describe("MessageBubble", () => {
  const userMsg: ChatMessageUI = {
    id: "u-1",
    role: "user",
    content: "Hello there",
  };
  const assistantMsg: ChatMessageUI = {
    id: "a-1",
    role: "assistant",
    content: "Hi! How can I help?",
  };

  it("renders user message text content", () => {
    render(<MessageBubble message={userMsg} />);
    expect(screen.getByText("Hello there")).toBeInTheDocument();
  });

  it("renders assistant message through ChatMarkdown", () => {
    render(<MessageBubble message={assistantMsg} />);
    const md = screen.getByTestId("chat-markdown");
    expect(md).toHaveTextContent("Hi! How can I help?");
  });

  it("shows 'You' role label for user messages", () => {
    render(<MessageBubble message={userMsg} />);
    expect(screen.getByText("You")).toBeInTheDocument();
  });

  it("shows default assistant name for assistant messages", () => {
    render(<MessageBubble message={assistantMsg} />);
    expect(screen.getByText("Assistant")).toBeInTheDocument();
  });

  it("shows custom assistantName when provided", () => {
    render(
      <MessageBubble message={assistantMsg} assistantName="Support Bot" />,
    );
    expect(screen.getByText("Support Bot")).toBeInTheDocument();
  });

  it("shows sparkles avatar for assistant messages but not for user messages", () => {
    const { rerender } = render(<MessageBubble message={userMsg} />);
    expect(screen.queryByTestId("icon-sparkles")).not.toBeInTheDocument();

    rerender(<MessageBubble message={assistantMsg} />);
    expect(screen.getByTestId("icon-sparkles")).toBeInTheDocument();
  });

  it("renders user row with bg-transparent class", () => {
    const { container } = render(<MessageBubble message={userMsg} />);
    expect(container.firstElementChild?.className).toContain("bg-transparent");
  });

  it("renders assistant row with muted background class", () => {
    const { container } = render(<MessageBubble message={assistantMsg} />);
    expect(container.firstElementChild?.className).toContain("bg-muted");
  });
});
