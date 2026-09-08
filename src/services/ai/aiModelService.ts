import { createServerFn } from "@tanstack/react-start";

export type AiChatMessage = {
  role: "user" | "assistant" | "system";
  content: string;
};

export type AiProviderKey = "anthropic" | "openai" | "ai-squared-bolt";

export type AiModelInput = {
  provider: AiProviderKey;
  messages: AiChatMessage[];
  instructions?: string;
};

/** The platform AI/ML connector id backing the "ai-squared-bolt" provider —
 * same id as `AI_SQUARED_BOLT_CONNECTOR_ID` in `@/lib/aiProviders` (kept as
 * a separate constant here since this file can't import client-side code). */
const AI_SQUARED_BOLT_CONNECTOR_ID = 2342;

/** Calls the platform's AI/ML connector (id 2342, "App Builder AI Squared
 * Bolt") the same way the tRPC `connectors.executeModel` procedure's
 * `{ connectorId, payload }` variant does — sending the payload directly
 * rather than fetching the connector and building it from its stored
 * `configuration.request_format` (see the payload-building comment below
 * for why) — but from a plain server function instead of a tRPC procedure,
 * so server-orchestrated callers (like the Document Pipeline, which runs
 * entirely server-side with no client-driven `useExecuteModel` call) can
 * use it too. `apiFetch` only reads `ctx.authToken` (the session cookie) —
 * `request`/`responseHeaders` are unused by it — so a minimal context
 * works fine here. */
async function callAiSquaredBoltConnector(
  messages: AiChatMessage[],
  instructions?: string,
): Promise<string> {
  // `callAiText` (this function's only caller) is a plain top-level export,
  // not wrapped in `createServerFn` — so it isn't covered by TanStack
  // Start's server-fn client/server splitting, which only strips code
  // reached through an actual `.handler()` closure. Because `useAiModel.ts`
  // (a client-side hook) statically imports `callAiModel` from this same
  // file, Vite's production build still resolves and bundles this
  // function's imports for the client, even though it never actually runs
  // there.
  //
  // Two things had to change to stop that from breaking `bun run build`:
  // (1) `/* @vite-ignore */` on the `@tanstack/react-start/server` import
  // below tells Vite to skip static analysis of it, so it's left as a
  // plain runtime `import()` the server's real Node/Bun runtime resolves
  // normally, instead of being bundled for the client (where it would drag
  // in SSR-only code referencing `node:stream`'s `Readable`, which has no
  // browser build). (2) `@/server/authCookie` (this app's usual source for
  // `APP_AUTH_COOKIE_NAME`) itself has a *static* top-level import of
  // `@tanstack/react-start/server` — `/* @vite-ignore */` only covers the
  // import expression it's written on, not a transitive dependency's own
  // imports, so dynamically importing `@/server/authCookie` here would
  // still pull that in. The cookie name is a fixed constant, so it's
  // inlined directly below instead of imported, avoiding that whole
  // dependency chain (same reasoning as `AI_SQUARED_BOLT_CONNECTOR_ID`
  // above being duplicated rather than imported from client-side code).
  const getCookie = (
    await import(/* @vite-ignore */ "@tanstack/react-start/server")
  ).getCookie as (name: string) => string | undefined;
  const APP_AUTH_COOKIE_NAME = "ais-auth-cookie";
  const { apiFetch } = await import("@/server/platform/apiFetch");
  type ExecuteModelResponse =
    import("@/services/connectors/types").ExecuteModelResponse;

  const authToken = getCookie(APP_AUTH_COOKIE_NAME);
  const ctx = {
    request: undefined as unknown as Request,
    responseHeaders: new Headers(),
    authToken,
  };

  // Send the payload directly instead of fetching the connector and running
  // `buildLlmPayload()` against its stored `configuration.request_format`.
  // That lookup throws if the connector's own config happens to be missing
  // or has invalid JSON in that field — a property of how the connector is
  // set up on the platform, unrelated to whether it can actually run a
  // model. This shape (plain `messages`, instructions merged in as a
  // leading system message) matches what's confirmed to work when calling
  // this connector's `execute_model` endpoint directly.
  const payload = {
    messages: instructions
      ? [{ role: "system", content: instructions }, ...messages]
      : messages,
  };

  const res = await apiFetch<{ payload: string }, ExecuteModelResponse>(ctx, {
    url: `connectors/${AI_SQUARED_BOLT_CONNECTOR_ID}/execute_model`,
    method: "POST",
    data: { payload: JSON.stringify(payload) },
  });

  const first = res.data?.[0] as Record<string, unknown> | undefined;
  const choices = first?.choices as Array<Record<string, unknown>> | undefined;
  const message = choices?.[0]?.message as Record<string, unknown> | undefined;
  const content = message?.content;
  if (typeof content === "string") return content;

  // Anthropic-style response (content: [{ type: "text", text }]).
  const content2 = first?.content;
  if (Array.isArray(content2)) {
    const block = content2.find(
      (b) => (b as Record<string, unknown>)?.type === "text",
    ) as Record<string, unknown> | undefined;
    if (typeof block?.text === "string") return block.text;
  }

  return "";
}

/** Shape mirrors the platform connector's `executeModel` response
 * (`{ data: [{ choices: [{ message: { content } }] }] }`) so every page
 * that previously called `useExecuteModel` + `extractProviderText` keeps
 * working unchanged after switching to this direct-secret call. */
export type AiModelResponse = {
  data: [{ choices: [{ message: { content: string } }] }];
};

// claude-3-5-sonnet-20241022 was retired by Anthropic on 2025-10-28 (every
// request returned a 404 "model: ... not found" — reproduced live and
// confirmed via Anthropic's own model-deprecations page). claude-sonnet-4-6
// is the current, actively-supported production model as of this writing.
const ANTHROPIC_MODEL = "claude-sonnet-4-6";
const OPENAI_MODEL = "gpt-4o-mini";

/** Every AI call in this app (including each Document Pipeline stage) goes
 * through this. Without a timeout, a stalled upstream request would hang
 * indefinitely with no feedback — a stuck `fetch` never resolves or
 * rejects on its own. `AbortController` + `setTimeout` turns that into a
 * clear, bounded error instead. */
const AI_REQUEST_TIMEOUT_MS = 45_000;

async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  timeoutMs = AI_REQUEST_TIMEOUT_MS,
): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      throw new Error(
        `Request to ${new URL(url).hostname} timed out after ${timeoutMs / 1000}s.`,
      );
    }
    throw err;
  } finally {
    clearTimeout(timeout);
  }
}

async function callAnthropic(
  messages: AiChatMessage[],
  instructions?: string,
): Promise<string> {
  const apiKey = process.env.ANTHROPIC_KEY;
  if (!apiKey) {
    throw new Error(
      "ANTHROPIC_KEY is not configured. Ask the app owner to add this secret.",
    );
  }

  const res = await fetchWithTimeout("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: ANTHROPIC_MODEL,
      max_tokens: 1500,
      ...(instructions ? { system: instructions } : {}),
      messages: messages
        .filter((m) => m.role !== "system")
        .map((m) => ({
          role: m.role === "assistant" ? "assistant" : "user",
          content: m.content,
        })),
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(
      `Anthropic API request failed with status ${res.status}${body ? `: ${body.slice(0, 300)}` : ""}`,
    );
  }

  const json = (await res.json()) as {
    content?: Array<{ type: string; text?: string }>;
  };
  const block = json.content?.find((b) => b.type === "text");
  return block?.text ?? "";
}

async function callOpenAi(
  messages: AiChatMessage[],
  instructions?: string,
): Promise<string> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error(
      "OPENAI_API_KEY is not configured. Ask the app owner to add this secret.",
    );
  }

  const res = await fetchWithTimeout(
    "https://api.openai.com/v1/chat/completions",
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: OPENAI_MODEL,
        messages: [
          ...(instructions
            ? [{ role: "system" as const, content: instructions }]
            : []),
          ...messages,
        ],
      }),
    },
  );

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(
      `OpenAI API request failed with status ${res.status}${body ? `: ${body.slice(0, 300)}` : ""}`,
    );
  }

  const json = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  return json.choices?.[0]?.message?.content ?? "";
}

/** Plain (non-`createServerFn`) helper that routes to the right provider —
 * exported so other *server-side* modules (e.g. `documentPipelineService`)
 * can get raw model text without going through `callAiModel`'s own HTTP/
 * server-fn boundary, since server functions aren't meant to call each
 * other directly. Callers are still responsible for their own
 * `requireAppAccess()` check. */
export async function callAiText(
  provider: AiProviderKey,
  messages: AiChatMessage[],
  instructions?: string,
): Promise<string> {
  if (provider === "ai-squared-bolt") {
    return callAiSquaredBoltConnector(messages, instructions);
  }
  return provider === "anthropic"
    ? callAnthropic(messages, instructions)
    : callOpenAi(messages, instructions);
}

/** Calls the OpenAI or Anthropic API directly using this app's own
 * `OPENAI_API_KEY`/`ANTHROPIC_KEY` secrets, instead of going through the
 * platform's AI/ML connector (which requires separately-managed connector
 * auth). */
export const callAiModel = createServerFn({ method: "POST" })
  .inputValidator((input: AiModelInput) => input)
  .handler(async ({ data }): Promise<AiModelResponse> => {
    const { requireAppAccess } = await import("@/server/protectedServerFn");
    await requireAppAccess();

    const text = await callAiText(
      data.provider,
      data.messages,
      data.instructions,
    );

    return { data: [{ choices: [{ message: { content: text } }] }] };
  });

/** Must match the embedding model used to populate the vector store's
 * `embedding` column (verified live: `vector_dims(embedding)` returns
 * 1536 on the connected AI Squared Vector Store, the same dimension
 * `text-embedding-3-small` and `text-embedding-ada-002` both produce). */
const EMBEDDING_MODEL = "text-embedding-3-small";

/** Turns a search query into a 1536-dimension embedding vector via
 * OpenAI's embeddings API, so the Knowledge Base can rank documents by
 * true semantic (cosine-distance) similarity instead of a plain keyword
 * (`ILIKE`) match. Uses `OPENAI_API_KEY` regardless of which chat provider
 * is selected elsewhere — Anthropic has no public embeddings endpoint. */
export const embedSearchQuery = createServerFn({ method: "POST" })
  .inputValidator((input: { text: string }) => input)
  .handler(async ({ data }): Promise<{ embedding: number[] }> => {
    const { requireAppAccess } = await import("@/server/protectedServerFn");
    await requireAppAccess();

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new Error(
        "OPENAI_API_KEY is not configured. Ask the app owner to add this secret.",
      );
    }

    const res = await fetchWithTimeout("https://api.openai.com/v1/embeddings", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({ model: EMBEDDING_MODEL, input: data.text }),
    });

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(
        `OpenAI embeddings request failed with status ${res.status}${body ? `: ${body.slice(0, 300)}` : ""}`,
      );
    }

    const json = (await res.json()) as {
      data?: Array<{ embedding?: number[] }>;
    };
    const embedding = json.data?.[0]?.embedding;
    if (!embedding) {
      throw new Error("OpenAI embeddings response did not include a vector.");
    }
    return { embedding };
  });
