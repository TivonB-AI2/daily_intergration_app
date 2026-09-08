import { Markdown } from "@/components/ui/markdown";
import { cn } from "@/lib/utils";

type ChatMarkdownProps = {
  content: string;
  className?: string;
  id?: string;
};

export function ChatMarkdown({ content, className, id }: ChatMarkdownProps) {
  return (
    <Markdown
      id={id}
      className={cn(
        "text-sm leading-relaxed",
        // Prose spacing
        "[&>*+*]:mt-3",
        // Paragraphs
        "[&_p]:leading-relaxed",
        // Code blocks
        "[&_pre]:rounded-lg [&_pre]:bg-muted [&_pre]:p-3.5 [&_pre]:text-xs [&_pre]:my-3",
        // Inline code
        "[&_code]:rounded-md [&_code]:bg-muted [&_code]:px-1.5 [&_code]:py-0.5 [&_code]:text-xs [&_code]:font-mono",
        // Lists
        "[&_ul]:list-disc [&_ul]:pl-5 [&_ul]:space-y-1",
        "[&_ol]:list-decimal [&_ol]:pl-5 [&_ol]:space-y-1",
        "[&_li]:leading-relaxed",
        // Links
        "[&_a]:text-primary [&_a]:underline [&_a]:underline-offset-2 [&_a]:decoration-primary/40 hover:[&_a]:decoration-primary",
        // Headings in responses
        "[&_h1]:text-base [&_h1]:font-semibold [&_h1]:mt-4 [&_h1]:mb-2",
        "[&_h2]:text-sm [&_h2]:font-semibold [&_h2]:mt-3 [&_h2]:mb-1.5",
        "[&_h3]:text-sm [&_h3]:font-medium [&_h3]:mt-2 [&_h3]:mb-1",
        // Tables
        "[&_table]:w-full [&_table]:text-xs [&_table]:border-collapse",
        "[&_th]:border [&_th]:border-border [&_th]:bg-muted [&_th]:px-2.5 [&_th]:py-1.5 [&_th]:text-left [&_th]:font-medium",
        "[&_td]:border [&_td]:border-border [&_td]:px-2.5 [&_td]:py-1.5",
        // Blockquotes
        "[&_blockquote]:border-l-2 [&_blockquote]:border-border [&_blockquote]:pl-4 [&_blockquote]:text-muted-foreground [&_blockquote]:italic",
        className,
      )}
    >
      {content}
    </Markdown>
  );
}
