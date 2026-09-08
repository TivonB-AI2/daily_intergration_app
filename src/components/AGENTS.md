# Components (AppGen) — shadcn/ui

> **Reuse-first (non-negotiable):** `@/components/ui/*` and `@/components/chat/*` are the **shared AISquared design system**. They resolve via `@/*` into the **read-only base at `/base`** — you won't see a `src/components/ui/` folder here. **Always import and use these components directly.** Do NOT rewrite, re-implement, fork, or copy them, and do NOT build wrapper components around them just to restyle — that forks the design system and makes apps drift apart. If a primitive needs adjusting, extend it via `className`/props only. Build **app-specific** composition here in this template's `src/components/`, always assembled from the shared `@/components/ui/*` primitives.

**Rules of thumb:**
- Need a table, dialog, dropdown, button, input, chart, date picker, file upload, chat message, etc.? There is already a component for it in `@/components/ui/*` — use it. Check the base directory first, before writing raw HTML or a new component.
- Never restyle a primitive by wrapping it in a look-alike. Pass `className` to the real component instead.
- One design system across every generated app: same components, same tokens, same look.

## UI Components

- **Add via CLI**: `bunx shadcn@latest add <component>`. For prompt-kit: `bunx shadcn@latest add "https://prompt-kit.com/c/<name>.json"`. Always use `bunx`, never `npx`.
- **Import**: Named exports from `@/components/ui/<name>`.
- **Styling**: Tailwind + `cn()` from `@/lib/utils`. Use CSS variables (`bg-background`, `text-foreground`, etc.) for dark mode consistency. No custom CSS files unless necessary.
- **Icons**: `lucide-react`.
- **Primitives**: Base UI (`@base-ui/react`). Do not edit or wrap the primitives in `@/components/ui/` — use them as-is and extend via `className`/props.
- **No ghost props**: Check component source for actual props. Do not invent `loading`, `asChild`, etc. unless the source has them.

## Table

Use shadcn `Table` for all tabular data:

```tsx
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

<Table>
  <TableHeader>
    <TableRow>
      <TableHead>ID</TableHead>
      <TableHead>Name</TableHead>
    </TableRow>
  </TableHeader>
  <TableBody>
    {data.map((row) => (
      <TableRow key={row.id}>
        <TableCell>{row.id}</TableCell>
        <TableCell>{row.name}</TableCell>
      </TableRow>
    ))}
  </TableBody>
</Table>
```

## Forms (`@tanstack/react-form`)

Use **`@tanstack/react-form`** only. No `react-hook-form` or `formik`.

Per-field `validators` take Zod directly via `onChange`/`onBlur`. **Do not** import `zodValidator` or pass `validatorAdapter` — older API, causes runtime errors.

```tsx
import { useForm } from "@tanstack/react-form";
import { z } from "zod";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

export function CreateUserForm({ onSubmit }: { onSubmit: (v: { name: string; email: string }) => void }) {
  const form = useForm({
    defaultValues: { name: "", email: "" },
    onSubmit: async ({ value }) => onSubmit(value),
  });

  return (
    <form onSubmit={(e) => { e.preventDefault(); form.handleSubmit(); }}>
      <form.Field
        name="email"
        validators={{ onChange: z.string().email("Valid email required") }}
      >
        {(f) => (
          <div>
            <Input
              value={f.state.value}
              onChange={(e) => f.handleChange(e.target.value)}
              onBlur={f.handleBlur}
            />
            {f.state.meta.errors?.[0] && (
              <p className="text-destructive text-sm">{f.state.meta.errors[0]}</p>
            )}
          </div>
        )}
      </form.Field>
      <Button type="submit">Save</Button>
    </form>
  );
}
```

### Gotchas

- **Select null**: `@base-ui/react` Select does not accept `null` as `value`. Use `""` (empty string) for "nothing selected" and coerce on submit.
- **`asChild`**: Not every shadcn/Base UI component supports it. Check `src/components/ui/<name>.tsx` for `Slot`/`asChild` in props before using. If absent, wrap with your own element instead.

## Layout — single-page (default) vs multi-page

Every app starts **single-page** using **`AppShell`** (wired in `src/routes/_protected.tsx`): a minimal padded container with **no sidebar and no header**. Keep it for single-page apps (a dashboard, a one-screen tool) — a nav bar is pointless with one page.

**The moment the app needs a second page, it is multi-page — make the full switch in ONE step.** Triggers: the user says "add a page", "add navigation", "make it multi-page", asks for another screen / section / tab, or describes multiple distinct views. Do **not** just add the page and wait for a separate "add navigation" request — *adding a second page is itself the request to go multi-page*. In the same change:

1. In `src/routes/_protected.tsx`, swap `<AppShell>` for `<AppLayout>` (import from `@/components/layout/app-layout`). This adds the sidebar + header.
2. Create each page: `src/routes/<name>.tsx` with `createFileRoute`.
3. Register **every** page (the existing one *and* the new one) in the `routes` array in `src/components/layout/index.ts` (`title`, `url`, `icon` from `lucide-react`). The sidebar links and breadcrumb read from this — **a page is unreachable until it is registered here.**

- **Branding**: import `APP_NAME`/`APP_DESCRIPTION` from `@/lib/constants`. Never hardcode.
- **Flush layout**: wrap a route's root element with `data-flush` to remove shell padding (`p-0`) for full-bleed pages. Works in both `AppShell` and `AppLayout`.


## Chat Assistant

```tsx
<ChatAssistant workflowId={id} />
```

One component, one required prop. Handles messages, sessions, history, Markdown, typing indicator automatically.

| Prop | Type | Default | Description |
|---|---|---|---|
| `workflowId` | `string` | **required** | Workflow to connect to |
| `name` | `string?` | workflow `card_title` → `"Assistant"` | Header title |
| `assistantName` | `string?` | workflow `responder_name` → `name` | Per-message label |
| `fullPage` | `boolean?` | `false` | Edge-to-edge, no border |
| `emptyMessage` | `string?` | workflow `welcome_message` → default | Empty state text |

- **No `workflowId`?** Ask the user — never guess or hardcode.
- **Full-page chat**: `<div data-flush className="h-full"><ChatAssistant workflowId={id} fullPage /></div>`

Chat building blocks in `src/components/chat/`:
- **`ChatAssistant`** — full chat UI (messages, input, history panel, typing indicator)
- **`MessageBubble`** — single message row. Props: `message`, optional `assistantName`, `chatbotAvatar`
- **`ChatMarkdown`** — Markdown renderer via prompt-kit

Prompt-kit components in `src/components/ui/`: `chat-container`, `markdown`, `code-block`, `scroll-button`, `loader`.

## Component Categories (reference)

**Layout:** card, separator, tabs, accordion, collapsible, sheet, sidebar, resizable, aspect-ratio, item, marker
**Forms:** button, button-group, input, input-group, input-otp, textarea, select, native-select, checkbox, radio-group, switch, slider, calendar, date-picker, field, label, toggle, toggle-group, combobox, file-upload
**Feedback:** alert, alert-dialog, toast (sonner), skeleton, progress, spinner, loader, empty
**Overlays:** dialog, drawer, popover, tooltip, dropdown-menu, context-menu, hover-card, menubar
**Data:** table, data-table, badge, avatar, chart, attachment
**Navigation:** breadcrumb, navigation-menu, pagination
**Chat / prompt-kit:** chat-container, message, message-scroller, bubble, markdown, code-block, scroll-button, loader
**Other:** command (cmdk), carousel, scroll-area, direction, kbd

> New in this design-system update — `attachment`, `file-upload` (+ `use-file-upload` hook in `@/hooks`), `message`, `message-scroller`, `bubble`, `data-table` (TanStack Table), `date-picker`, `marker`. Chart uses **Recharts v3**. Use these instead of hand-rolling equivalents.
