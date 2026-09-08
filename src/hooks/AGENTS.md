# Hooks

> **These platform hooks ship in every template** and call shared base services under the hood (`@/services/*`, base tRPC). Reuse them — don't reimplement auth, connectors, workflows, chat, or capabilities. Add a NEW hook here only for **app-specific** logic (e.g. `use<Domain>.ts` wrapping a tRPC procedure). See the root `AGENTS.md` "Shared base" section.

Call server functions with `{ data: payload }`. All hooks use `@tanstack/react-query`.

## Capabilities — `@/hooks/useCapabilities`

- **`useCapabilities()`** — `{ data: { databaseEnabled: boolean; s3Enabled: boolean }, isLoading }`. Cached forever. Gate DB queries with `enabled: caps?.databaseEnabled === true`, and storage UI with `caps?.s3Enabled`.

## Connectors — `@/hooks/useConnectors`

- **`useConnectors(params?)`** — list connectors.
- **`useConnector(id)`** — single connector.
- **`useQuerySource()`** — **mutation**. `mutate({ connectorId, payload: { query } })`. Key is `query`, not `sql`.
- **`useExecuteModel()`** — **mutation**. `mutate({ connectorId, payload })` or `mutate({ connectorId, messages, instructions? })`. AI/ML sources only. Response `data` is an array — see `/base/src/services/AGENTS.md`.
- **`usePaginatedQuerySource({ connectorId, query, perPage? })`** — auto-paginates. Do NOT add LIMIT/OFFSET.

## Workflows — `@/hooks/useWorkflows`

- **`useRunWorkflow(workflowId)`** — mutation.

## Chat — `@/hooks/useChatAssistant`

- **`useChatAssistant(workflowId)`** — `{ messages, sendMessage, isLoading, ready }`. Or use `<ChatAssistant workflowId={id} />` component.

## Auth — `@/hooks/useAuth`

- **`useSignIn()`** / **`useSignOut()`** / **`useGetUser()`** — platform API via tRPC.

## Helpers

- **`useAPIMutation({ mutationFn, successMessage?, onSuccessCallback? })`** — mutation with toasts.
- **`useIsMobile()`** — true when viewport < 768px.
