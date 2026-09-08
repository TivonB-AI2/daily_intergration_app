# AppGen Template

React app in a coding sandbox. Generated code is shown to end users as a live application.

## Critical Rules

- **Audience is non-technical.** Describe changes in terms of what users see. Implement everything — don't explain the plan.
- **OpenCode runs in API mode** — produce complete, self-contained responses.
- **Do exactly what is asked — no more.** Match scope precisely.
- **Log every fix/change (standing user instruction).** Whenever a user asks to fix an issue or make a change to the app, and the app has both database and the Changelog/To-Do pages/services (`changelogService`, `todoService`) available, do BOTH before finishing:
  1. Add a **Changelog** entry (`createChangelogEntry`) describing the change (version, type — `fix`/`improvement`/`feature` as appropriate, title, description).
  2. Add a **To-Do** item (`createTodo`) with `status: "done"` and a description covering the issue/feature and the solution applied.
  If the database isn't configured yet, mention this to the user instead of silently skipping it. Do this in addition to, not instead of, actually implementing the fix/change.
- **Load `frontend-design` skill ONLY for UI pages** — skip for DB/backend tasks.
- **Never start a dev server** — one is already running on port 5173.
- **Never run `bun run build` to verify changes.** The running dev server (HMR) and LSP diagnostics are the verification. Build only when the user explicitly asks for a build or deploy check.
- **Do not run full `bun run check` after every change.** Format only the files you touched: `bunx biome format --write <files>` right after writing them.
- **Batch independent steps.** Run unrelated reads and commands together in one round, not one at a time.
- **Prefer small targeted edits** over rewriting whole files.
- **Never re-read a file already in context** — it has not changed unless you changed it. This includes a file you just created or edited this turn: trust the `Write`/`Edit` success, don't re-read to verify.
- **No throwaway bash.** Never run a command whose output you discard or that only passes time (`sleep`, re-`cat` to `/dev/null`). To check for errors rely on HMR/LSP, or read the one file you changed.
- **After 3 failed attempts at the same fix, stop and reassess** the approach instead of retrying variations.
- **Playwright results can lie.** If a playwright tool's output contains an error message, treat the step as failed regardless of the reported status; on environment/browser errors do not retry, skip browser verification and rely on the dev server + LSP.
- **Do not run `bun install`** — dependencies are pre-installed.
- **Package manager is bun.** Use `bun run`, `bunx`. Replace `npx` with `bunx`.
- **Import `createServerFn` from `@tanstack/react-start`** — NOT `@tanstack/start`. Build error otherwise.
- **Use `.inputValidator()`, never `.validator()`** — runtime crash.
- **Use `method: "POST"` for all mutations** — no DELETE support.
- **Never use `pgEnum`** — use `text("col").$type<"a" | "b">()` instead.
- **Never run `drizzle-kit push`** — hangs. Use `bun run db:generate` + `bun run db:migrate`.
- **Always use Neon database for data storage.** Never in-memory arrays, `useState<Array>`, `Map`, `localStorage`.
- **Auth is platform-only.** Do not build standalone auth (no users table, no bcryptjs, no password hashing).
- **Do not change the font (Google Sans Flex).**
- **Dynamic-import `@/lib/db` and `@/env` inside handlers** — a module-level import breaks the client bundle.
- **Raw `integer()` needs `.references()`** to be a real foreign key.
- **`@tabler/icons-react` → Vite 500.** Package is not installed. Import icons from `lucide-react` (e.g. `Search`, not `IconSearch`).

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | TanStack Start (React 19, SSR) |
| Language | TypeScript (strict) |
| Bundler | Vite 7 |
| Routing | TanStack Router (file-based) |
| UI | shadcn/ui, Tailwind CSS v4 |
| Icons | Lucide (`lucide-react`) |
| Forms | TanStack Form, Zod |
| Charts | Recharts |
| DB | Drizzle ORM + Neon HTTP (`@neondatabase/serverless`) |
| State | None — no app-level stores |
| Linting | Biome |

## Shared base — reuse first, don't recreate

This template is a thin overlay on a **shared base**. At runtime the base is baked **read-only** at `/base`; your imports reach it through the `@/*` alias, which resolves to **both** your local `./src/*` **and** `../../base/src/*`. Many `@/…` imports therefore resolve to base files that are **not** in this folder — reuse them, don't reimplement, and never try to edit base files.

**Reuse from base** (`@/…` resolves into `/base`, read-only):

| Need | Import |
|---|---|
| UI primitives (shadcn) | `@/components/ui/*` |
| Class merge / utils | `@/lib/utils` (`cn`) |
| DB access | `@/lib/db` (`getDb`) |
| Platform API fetch | `@/lib/apiFetch` |
| Server-only: auth, cookies, platform, S3, env | `@/server/*`, `@/server/s3/client`, `@/env` |
| Platform services | `@/services/connectors`, `@/services/workflows`, `@/services/capabilitiesService`, `@/services/common` |
| tRPC core (init / context / client) | `@/integrations/trpc` |

**Reuse what already ships in THIS template's `src/`** (platform infra — reuse, keep shared behavior intact):

- Platform hooks: `@/hooks/useAuth`, `useConnectors`, `useExecuteModel`, `useWorkflows`, `useCapabilities`, `useChatAssistant`, `usePaginatedQuerySource`, `useDataAppSessions`, `useAPIMutation`, `useQueryWrapper`
- Chat UI: `@/components/chat/*` (`<ChatAssistant/>`)
- tRPC router composition: `src/integrations/trpc/router.ts`
- Branding: `@/lib/constants` (`APP_NAME`)

**Build CUSTOM here** (this template's `src/` — where your app lives):

- Pages/routes under `src/routes/`
- App-specific components in `src/components/`
- Domain hooks (`src/hooks/use<Domain>.ts`) and services (`src/services/db/<domain>Service.ts`)
- DB schema + migrations (`src/server/db/schema.ts`, `src/server/db/migrations/`)

**UI components available** (import `@/components/ui/<name>`; this is the full set — do not spend rounds listing the directory): accordion, alert, alert-dialog, aspect-ratio, avatar, badge, breadcrumb, button, button-group, calendar, card, carousel, chart, chat-container, checkbox, code-block, collapsible, combobox, command, context-menu, dialog, direction, drawer, dropdown-menu, empty, field, hover-card, input, input-group, input-otp, item, kbd, label, loader, markdown, menubar, native-select, navigation-menu, pagination, popover, progress, radio-group, resizable, scroll-area, scroll-button, select, separator, sheet, sidebar, skeleton, slider, sonner, spinner, switch, table, tabs, textarea, toggle, toggle-group, tooltip. Hooks: `use-mobile`, `useErrorToast`.

**Deep-dive base docs** — read on demand; these are **not** auto-loaded (they live outside this folder at `/base`):

- `/base/src/server/AGENTS.md` — auth, cookies, platform API, **S3 (AWS SDK v3)**
- `/base/src/services/AGENTS.md` — `createServerFn` services + DB CRUD patterns
- `/base/src/server/db/AGENTS.md` — Drizzle schema + migration workflow
- `/base/src/server/trpc/AGENTS.md` + `/base/src/integrations/trpc/AGENTS.md` — tRPC routers + React usage
- `/base/src/lib/AGENTS.md` — shared utilities

## Server Functions

**All server calls use `createServerFn`** from `@tanstack/react-start`. Dynamic-import dependencies inside handlers. **Protect non-public handlers**: call `await requireAppAccess()` (from `@/server/protectedServerFn`) at the top — never the `protectedServerFn` wrapper for handlers importing `@/lib/db` or `@/server/s3/client` (it breaks the client build; see `/base/src/server/AGENTS.md`):

```tsx
export const listItems = createServerFn({ method: "GET" }).handler(async () => {
  const { requireAppAccess } = await import("@/server/protectedServerFn");
  await requireAppAccess();
  const { getDb } = await import("@/lib/db");
  const { items } = await import("@/server/db/schema");
  const { desc } = await import("drizzle-orm");
  const db = await getDb();
  return db.select().from(items).orderBy(desc(items.createdAt));
});

export const createItem = createServerFn({ method: "POST" })
  .inputValidator((input: { name: string }) => input)
  .handler(async ({ data }) => {
    const { requireAppAccess } = await import("@/server/protectedServerFn");
    await requireAppAccess();
    const { getDb } = await import("@/lib/db");
    const { items } = await import("@/server/db/schema");
    const db = await getDb();
    const [row] = await db.insert(items).values(data).returning();
    return row;
  });

export const deleteItem = createServerFn({ method: "POST" })
  .inputValidator((id: number) => id)
  .handler(async ({ data: id }) => {
    const { requireAppAccess } = await import("@/server/protectedServerFn");
    await requireAppAccess();
    const { getDb } = await import("@/lib/db");
    const { items } = await import("@/server/db/schema");
    const { eq } = await import("drizzle-orm");
    const db = await getDb();
    await db.delete(items).where(eq(items.id, id));
  });
```

## Application Layout

- **`__root.tsx`** — auth guard in `beforeLoad`. Never remove it.
- **Home route is the app's main page — replace the placeholder.** `src/routes/_protected/index.tsx` ships as a "Welcome to {APP_NAME}" placeholder. The preview always opens at `/`, so the FIRST/primary page you build MUST be edited directly into `_protected/index.tsx` — never leave the placeholder, and never build the main page as a separate route while `/` still shows "Welcome…". The user must see their generated app at `/`, not an empty Dashboard.
- **Keep the nav in sync with the home route.** When `/` becomes the main page, rename the default `routes` entry in `src/components/layout/index.ts` (title/icon) to match it — do not add a second entry that duplicates `/`. Only add new `routes` entries for genuinely separate secondary pages.
- Additional pages: `src/routes/<name>.tsx` with `createFileRoute`, then add a nav entry to `src/components/layout/index.ts`.
- Use `data-flush` for full-page layouts (removes padding).

## Database (Drizzle + Neon HTTP)

Enabled when `DATABASE_URL` is set. Apps without DB boot normally.

### When to provision

| Signal | Action |
|---|---|
| "save", "store", "track", CRUD, records | Call `agentic_coding_request_database` MCP tool first |
| Ephemeral UI state, toggles | `useState` / `useReducer` |

### Provisioning

```
agentic_coding_request_database(app_id: "<value of $APPGEN_APP_ID env var>")
```

Idempotent. Do not ask for confirmation — execute directly.

### After provisioning — exact order

1. `bun run db:status` — must print `state=connected`. A missing-file/module error (not a connection error) means a local runner was deleted; restore it with `cp /base/src/server/db/migrate.ts /base/src/server/db/status.ts src/server/db/` — never hand-rewrite them.
2. Define tables in `src/server/db/schema.ts` — **it does not exist yet; create it with `Write`, never `Read` it first** (single file)
3. `bun run db:generate`
4. `bun run db:migrate`
5. `bun run db:status` — verify table in list
6. Write service in `src/services/db/<domain>Service.ts`
7. Wire UI with `useQuery`/`useMutation`. Gate with `useCapabilities()`.

Recovery details (missing `_journal.json`/`meta/`, `DATABASE_URL` unset): see `/base/src/server/db/AGENTS.md`.

### Schema and relations examples

See [`/base/src/server/db/AGENTS.md`](/base/src/server/db/AGENTS.md) before writing `schema.ts` (it also covers the migration recovery cases). **Do not `cat` `/base/src/server/db/schema.ts`** — it is commented-out boilerplate, not needed. Key trap: `relations()` must be declared on **both** sides or `with: { ... }` silently returns nothing.

### Files you own

- `src/server/db/schema.ts`, `src/server/db/migrations/`, `src/services/db/<domain>Service.ts`

### Files you DON'T touch

- `src/lib/db.ts` (`@/lib/db`, base-owned), `drizzle.config.ts`, `src/server/db/migrate.ts`, `src/server/db/status.ts`, `.env.local` — `drizzle.config.ts` is template-root-owned (no base copy). The runners (`migrate.ts`/`status.ts`) are local scaffolded files invoked by exact path in package.json (the `/base` overlay never applies to script paths); if a runner is missing, restore it from `/base/src/server/db/`, never reimplement it

### DB-backed page pattern

```tsx
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useCapabilities } from "@/hooks/useCapabilities";
import { listItems, deleteItem } from "@/services/db/itemService";
import { Skeleton } from "@/components/ui/skeleton";

export const Route = createFileRoute("/items")({ component: ItemsPage });

function ItemsPage() {
  const queryClient = useQueryClient();
  const { data: caps, isLoading: capsLoading } = useCapabilities();
  const { data: items, isLoading: itemsLoading } = useQuery({
    queryKey: ["items"],
    queryFn: () => listItems(),
    enabled: caps?.databaseEnabled === true,
  });
  const deleteMut = useMutation({
    mutationFn: (id: number) => deleteItem({ data: id }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["items"] }),
  });

  if (capsLoading) return <Skeleton className="h-64 w-full" />;
  if (!caps?.databaseEnabled) return <p>Database not configured.</p>;
  if (itemsLoading) return <Skeleton className="h-64 w-full" />;

  return (
    <div>
      {items?.map((item) => (
        <div key={item.id}>{item.name}</div>
      ))}
    </div>
  );
}
```

Rules:
- All hooks MUST be called before any early return.
- Use `enabled: caps?.databaseEnabled === true` to skip DB queries when DB is off.
- Use `<Skeleton>` for loading states.
- Invalidate queries after mutations.

## S3 Object Storage (AWS SDK v3)

Enabled when the platform has provisioned storage and credentials are present. Apps without storage boot normally. Credentials are temporary STS tokens auto-refreshed by the platform — **never hardcode them**.

### CRITICAL: Provision BEFORE writing any S3 code

**Before writing ANY code that uses file uploads, images, photos, documents, PDFs, CSVs, or the S3 helpers, you MUST first call the MCP tool to provision storage. If you skip this step, the app will crash because S3 credentials won't exist.**

Read the value of `APPGEN_APP_ID` from the environment, then call:
```
agentic_coding_create_storage(app_id: "<the APPGEN_APP_ID value>")
```

To get the app ID, run: `echo $APPGEN_APP_ID` in the terminal.

This is the FIRST thing you do — before creating any service files, components, or routes that involve files. Idempotent — safe to call even if already provisioned. Do not ask for confirmation.

Same pattern as database: you call `agentic_coding_request_database` before writing DB code. You call `agentic_coding_create_storage` before writing file upload code.

### Folders and gating

`assets/` = agent-written static assets (public). `uploads/` and `exports/` are written by app code at runtime only — **the agent never touches files there directly**. Gate storage UI on `caps?.s3Enabled` (same shape as `databaseEnabled`). Full folder table + safety model: see the link below.

For the helper API (`uploadFile`, `downloadFile`, `deleteFile`, `getPresignedUrl`, `refreshS3Credentials`), refresh model, and safety rules see [`/base/src/server/AGENTS.md`](/base/src/server/AGENTS.md).

## Platform Integration

- **Auth**: Platform-based only via `getAuthState()` in `__root.tsx`. Hook: `useSignIn`, `useSignOut`, `useGetUser` (tRPC, calls platform API).
- **Connectors**: `useConnectors(params?)`, `useConnector(id)`, `useQuerySource()` (mutation), `useExecuteModel()` (mutation, AI/ML sources).
- **Workflows**: `useRunWorkflow(workflowId)`.
- **Chat**: `<ChatAssistant workflowId={id} />` — one component, one prop. See `src/components/chat/`.
- **Attached context**: When the user pins sources, models, AI/ML connectors, or workflows in AppGen chat, their IDs appear in your system prompt (`Available connectors: [...]`, etc.). See [`/base/src/services/AGENTS.md`](/base/src/services/AGENTS.md) — *Attached context payload*.
- **MCP tools**: The `aisquared` MCP provides platform connectors, workflows, AI/ML model execution (`aisquared_connectors_execute_model`), and DB/storage provisioning.

## Coding Standards

- Use `@/` alias for imports. Prefer shadcn components over raw HTML.
- Tailwind utilities + `cn()`. No inline styles.
- TypeScript strict; no `any`.
- Biome for formatting, scoped to touched files: `bunx biome format --write <files>`. Full lint is `bun run check` (final review only).
- No render-time side effects. Use `useEffect`/handlers.

## Commands

```bash
bun run build        # deploy check only — never for routine verification
bun run check        # full-repo lint + format check — final review only, not per change
bun run test         # Vitest
bun run db:generate  # SQL migration from schema diff
bun run db:migrate   # Apply migrations via Neon HTTP
bun run db:status    # DB state + table list
```
