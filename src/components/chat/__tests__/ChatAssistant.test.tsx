import { describe, expect, it, vi, beforeEach, type Mock } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ChatAssistant } from "@/components/chat/ChatAssistant";
import type { ChatMessageUI } from "@/hooks/useChatAssistant";
import type { DataAppSession } from "@/services/workflows/types";

const mockSendMessage = vi.fn();
const mockLoadSession = vi.fn();
const mockStartNewChat = vi.fn();
const mockInvalidateQueries = vi.fn();

let hookReturn: {
  messages: ChatMessageUI[];
  sendMessage: Mock;
  isLoading: boolean;
  error: Error | null;
  sessions: DataAppSession[];
  loadSession: Mock;
  startNewChat: Mock;
  ready: boolean;
};

vi.mock("@/hooks/useChatAssistant", () => ({
  useChatAssistant: () => hookReturn,
}));

// Prevent useWorkflowDataAppConfig (used for config-driven title/welcome) from
// calling real useQuery — return empty data so prop defaults take over.
vi.mock("@/hooks/useDataAppSessions", () => ({
  useWorkflowDataAppConfig: () => ({ data: undefined }),
  useDataAppSessions: () => ({ data: [] }),
}));

vi.mock("@tanstack/react-query", () => ({
  useQueryClient: () => ({ invalidateQueries: mockInvalidateQueries }),
}));

vi.mock("@/components/chat/MessageBubble", () => ({
  MessageBubble: ({ message }: { message: ChatMessageUI }) => (
    <div data-testid={`msg-${message.id}`}>{message.content}</div>
  ),
}));

vi.mock("@/components/ui/sheet", () => ({
  Sheet: ({
    open,
    children,
  }: {
    open: boolean;
    onOpenChange: (v: boolean) => void;
    children: React.ReactNode;
  }) => (open ? <div data-testid="sheet">{children}</div> : null),
  SheetContent: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="sheet-content">{children}</div>
  ),
  SheetHeader: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  SheetTitle: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
}));

vi.mock("@/components/ui/separator", () => ({
  Separator: () => <hr />,
}));

vi.mock("lucide-react", () => ({
  Send: () => <svg data-testid="icon-send" />,
  History: () => <svg data-testid="icon-history" />,
  Plus: () => <svg data-testid="icon-plus" />,
  MessageCircle: () => <svg data-testid="icon-message-circle" />,
  Sparkles: () => <svg data-testid="icon-sparkles" />,
}));

const baseSessions: DataAppSession[] = [
  {
    id: 1,
    session_id: "sess-aaa",
    data_app_id: 5,
    workspace_id: 1,
    title: "First chat",
  },
  {
    id: 2,
    session_id: "sess-bbb",
    data_app_id: 5,
    workspace_id: 1,
  },
];

describe("ChatAssistant", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    hookReturn = {
      messages: [],
      sendMessage: mockSendMessage,
      isLoading: false,
      error: null,
      sessions: [],
      loadSession: mockLoadSession,
      startNewChat: mockStartNewChat,
      ready: true,
    };
  });

  it("renders empty state message when no messages", () => {
    render(<ChatAssistant workflowId="wf-1" />);
    expect(
      screen.getByText("Ask anything to get started."),
    ).toBeInTheDocument();
  });

  it("renders custom emptyMessage prop", () => {
    render(<ChatAssistant workflowId="wf-1" emptyMessage="Ask me anything!" />);
    expect(screen.getByText("Ask me anything!")).toBeInTheDocument();
  });

  it("renders notReadyMessage when not ready and no messages", () => {
    hookReturn.ready = false;
    render(<ChatAssistant workflowId="wf-1" />);
    expect(
      screen.getByText(
        "Publish this workflow from the platform to enable chat.",
      ),
    ).toBeInTheDocument();
  });

  it("renders custom notReadyMessage when not ready", () => {
    hookReturn.ready = false;
    render(
      <ChatAssistant
        workflowId="wf-1"
        notReadyMessage="Please publish the workflow first."
      />,
    );
    expect(
      screen.getByText("Please publish the workflow first."),
    ).toBeInTheDocument();
  });

  it("displays messages via MessageBubble components", () => {
    hookReturn.messages = [
      { id: "u-1", role: "user", content: "hello" },
      { id: "a-1", role: "assistant", content: "hi there" },
    ];
    render(<ChatAssistant workflowId="wf-1" />);
    expect(screen.getByTestId("msg-u-1")).toHaveTextContent("hello");
    expect(screen.getByTestId("msg-a-1")).toHaveTextContent("hi there");
  });

  it("shows loading indicator when isLoading is true", () => {
    hookReturn.isLoading = true;
    render(<ChatAssistant workflowId="wf-1" />);
    expect(screen.getByText("Thinking...")).toBeInTheDocument();
  });

  it("submit button is disabled when input is empty", () => {
    render(<ChatAssistant workflowId="wf-1" />);
    const submitBtn = screen
      .getAllByRole("button")
      .find((b) => b.getAttribute("type") === "submit");
    expect(submitBtn).toBeDisabled();
  });

  it("submit button is disabled when not ready", () => {
    hookReturn.ready = false;
    render(<ChatAssistant workflowId="wf-1" />);
    const textarea = screen.getByPlaceholderText("Chat not available");
    fireEvent.change(textarea, { target: { value: "hello" } });
    const submitBtn = screen
      .getAllByRole("button")
      .find((b) => b.getAttribute("type") === "submit");
    expect(submitBtn).toBeDisabled();
  });

  it("typing and submitting calls sendMessage and clears input", async () => {
    render(<ChatAssistant workflowId="wf-1" />);
    const textarea = screen.getByPlaceholderText("Send a message...");
    fireEvent.change(textarea, { target: { value: "hello world" } });
    expect(textarea).toHaveValue("hello world");

    const form = textarea.closest("form")!;
    fireEvent.submit(form);

    expect(mockSendMessage).toHaveBeenCalledWith("hello world");
    expect(textarea).toHaveValue("");
  });

  it("Enter key submits, Shift+Enter does not", async () => {
    render(<ChatAssistant workflowId="wf-1" />);
    const textarea = screen.getByPlaceholderText("Send a message...");
    fireEvent.change(textarea, { target: { value: "test" } });

    fireEvent.keyDown(textarea, { key: "Enter", shiftKey: true });
    expect(mockSendMessage).not.toHaveBeenCalled();

    fireEvent.keyDown(textarea, { key: "Enter", shiftKey: false });
    expect(mockSendMessage).toHaveBeenCalledWith("test");
  });

  it("history button opens the Sheet", async () => {
    hookReturn.sessions = baseSessions;
    render(<ChatAssistant workflowId="wf-1" />);

    expect(screen.queryByTestId("sheet")).not.toBeInTheDocument();

    const historyBtn = screen.getByRole("button", { name: "Chat history" });
    await userEvent.click(historyBtn);

    expect(screen.getByTestId("sheet")).toBeInTheDocument();
  });

  it("session list renders session titles in history panel", async () => {
    hookReturn.sessions = baseSessions;
    render(<ChatAssistant workflowId="wf-1" />);

    const historyBtn = screen.getByRole("button", { name: "Chat history" });
    await userEvent.click(historyBtn);

    expect(screen.getByText("First chat")).toBeInTheDocument();
    expect(screen.getByText("Session sess-bbb")).toBeInTheDocument();
  });

  it("'New chat' button calls startNewChat", async () => {
    render(<ChatAssistant workflowId="wf-1" />);
    const newChatBtn = screen.getByRole("button", { name: "New chat" });
    await userEvent.click(newChatBtn);
    expect(mockStartNewChat).toHaveBeenCalled();
  });

  it("clicking a session in history calls loadSession and closes the panel", async () => {
    hookReturn.sessions = baseSessions;
    render(<ChatAssistant workflowId="wf-1" />);

    await userEvent.click(screen.getByRole("button", { name: "Chat history" }));

    const sessionBtn = screen.getByText("First chat");
    await userEvent.click(sessionBtn);

    expect(mockLoadSession).toHaveBeenCalledWith(baseSessions[0]);
    expect(screen.queryByTestId("sheet")).not.toBeInTheDocument();
  });
});
