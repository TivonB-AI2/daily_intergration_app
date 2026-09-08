import { useEffect, useRef, useState } from "react";
import { codeToHtml } from "shiki";
import { cn } from "@/lib/utils";

/**
 * A SQL textarea with live syntax highlighting. Implemented as a
 * highlighted `<div>` rendered behind a transparent-text `<textarea>` (the
 * standard "invisible textarea over highlighted code" technique) — Shiki
 * (already a dependency, used by `CodeBlockCode`) has no editable-input
 * mode of its own. Scroll position is kept in sync between the two layers.
 */
export function SqlEditor({
  value,
  onChange,
  placeholder,
  rows = 6,
  id,
  className,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  rows?: number;
  id?: string;
  className?: string;
}) {
  const [html, setHtml] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const highlightRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    async function highlight() {
      if (!value) {
        if (!cancelled) setHtml(null);
        return;
      }
      const result = await codeToHtml(value, {
        lang: "sql",
        theme: "css-variables",
      });
      if (!cancelled) setHtml(result);
    }
    highlight();
    return () => {
      cancelled = true;
    };
  }, [value]);

  function syncScroll() {
    if (!textareaRef.current || !highlightRef.current) return;
    highlightRef.current.scrollTop = textareaRef.current.scrollTop;
    highlightRef.current.scrollLeft = textareaRef.current.scrollLeft;
  }

  return (
    <div
      className={cn(
        "relative rounded-md border border-input font-mono text-sm",
        className,
      )}
    >
      <div
        ref={highlightRef}
        aria-hidden
        className="pointer-events-none absolute inset-0 overflow-auto whitespace-pre-wrap break-words p-3 [&_pre]:!bg-transparent [&_pre]:whitespace-pre-wrap [&_pre]:break-words"
        style={{ lineHeight: "1.5" }}
        dangerouslySetInnerHTML={{
          __html:
            html ?? `<pre><code>${value ? escapeHtml(value) : ""}</code></pre>`,
        }}
      />
      <textarea
        ref={textareaRef}
        id={id}
        rows={rows}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onScroll={syncScroll}
        placeholder={placeholder}
        spellCheck={false}
        className="relative z-10 w-full resize-none bg-transparent p-3 text-transparent caret-foreground outline-none placeholder:text-muted-foreground"
        style={{ lineHeight: "1.5" }}
      />
    </div>
  );
}

function escapeHtml(text: string) {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}
