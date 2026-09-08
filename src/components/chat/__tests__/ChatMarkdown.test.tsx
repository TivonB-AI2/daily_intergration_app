import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { ChatMarkdown } from "@/components/chat/ChatMarkdown";

vi.mock("@/components/ui/markdown", () => ({
  Markdown: ({
    children,
    id,
    className,
  }: {
    children: string;
    id?: string;
    className?: string;
  }) => (
    <div data-testid="markdown" data-id={id} className={className}>
      {children}
    </div>
  ),
}));

describe("ChatMarkdown", () => {
  it("renders markdown content", () => {
    render(<ChatMarkdown content="Hello **world**" />);
    expect(screen.getByTestId("markdown")).toHaveTextContent("Hello **world**");
  });

  it("passes id and className props through", () => {
    render(<ChatMarkdown content="test" id="msg-1" className="extra-class" />);
    const el = screen.getByTestId("markdown");
    expect(el).toHaveAttribute("data-id", "msg-1");
    expect(el.className).toContain("extra-class");
    expect(el.className).toContain("text-sm");
  });
});
