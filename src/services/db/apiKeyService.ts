import { createServerFn } from "@tanstack/react-start";

export type ApiKeyInput = {
  name: string;
  expiresAt?: string | null;
};

/** Generates a random secret value in the form `sk_live_<40 hex chars>`. */
function generateSecretValue() {
  const bytes = new Uint8Array(20);
  crypto.getRandomValues(bytes);
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join(
    "",
  );
  return `sk_live_${hex}`;
}

export const listApiKeys = createServerFn({ method: "GET" }).handler(
  async () => {
    const { requireAppAccess } = await import("@/server/protectedServerFn");
    await requireAppAccess();
    const { getDb } = await import("@/lib/db");
    const { apiKeys } = await import("@/server/db/schema");
    const { desc } = await import("drizzle-orm");
    const db = await getDb();
    return db.select().from(apiKeys).orderBy(desc(apiKeys.createdAt));
  },
);

export const createApiKey = createServerFn({ method: "POST" })
  .inputValidator((input: ApiKeyInput) => input)
  .handler(async ({ data }) => {
    const { requireAppAccess } = await import("@/server/protectedServerFn");
    await requireAppAccess();
    const { getDb } = await import("@/lib/db");
    const { apiKeys } = await import("@/server/db/schema");
    const db = await getDb();
    const [row] = await db
      .insert(apiKeys)
      .values({
        name: data.name,
        keyValue: generateSecretValue(),
        status: "active",
        expiresAt: data.expiresAt ? new Date(data.expiresAt) : null,
      })
      .returning();
    return row;
  });

/** Generates a brand new secret value for an existing key, keeping its name
 * and history — the previous value stops working immediately. */
export const rotateApiKey = createServerFn({ method: "POST" })
  .inputValidator((id: number) => id)
  .handler(async ({ data: id }) => {
    const { requireAppAccess } = await import("@/server/protectedServerFn");
    await requireAppAccess();
    const { getDb } = await import("@/lib/db");
    const { apiKeys } = await import("@/server/db/schema");
    const { eq } = await import("drizzle-orm");
    const db = await getDb();
    const [row] = await db
      .update(apiKeys)
      .set({
        keyValue: generateSecretValue(),
        status: "active",
        lastUsedAt: null,
      })
      .where(eq(apiKeys.id, id))
      .returning();
    return row;
  });

export const revokeApiKey = createServerFn({ method: "POST" })
  .inputValidator((id: number) => id)
  .handler(async ({ data: id }) => {
    const { requireAppAccess } = await import("@/server/protectedServerFn");
    await requireAppAccess();
    const { getDb } = await import("@/lib/db");
    const { apiKeys } = await import("@/server/db/schema");
    const { eq } = await import("drizzle-orm");
    const db = await getDb();
    const [row] = await db
      .update(apiKeys)
      .set({ status: "revoked" })
      .where(eq(apiKeys.id, id))
      .returning();
    return row;
  });

export const reactivateApiKey = createServerFn({ method: "POST" })
  .inputValidator((id: number) => id)
  .handler(async ({ data: id }) => {
    const { requireAppAccess } = await import("@/server/protectedServerFn");
    await requireAppAccess();
    const { getDb } = await import("@/lib/db");
    const { apiKeys } = await import("@/server/db/schema");
    const { eq } = await import("drizzle-orm");
    const db = await getDb();
    const [row] = await db
      .update(apiKeys)
      .set({ status: "active" })
      .where(eq(apiKeys.id, id))
      .returning();
    return row;
  });

export const deleteApiKey = createServerFn({ method: "POST" })
  .inputValidator((id: number) => id)
  .handler(async ({ data: id }) => {
    const { requireAppAccess } = await import("@/server/protectedServerFn");
    await requireAppAccess();
    const { getDb } = await import("@/lib/db");
    const { apiKeys } = await import("@/server/db/schema");
    const { eq } = await import("drizzle-orm");
    const db = await getDb();
    await db.delete(apiKeys).where(eq(apiKeys.id, id));
  });

/** Marks a key as used just now — called when a key is copied/revealed, to
 * simulate real "last used" tracking for a secret. */
export const touchApiKey = createServerFn({ method: "POST" })
  .inputValidator((id: number) => id)
  .handler(async ({ data: id }) => {
    const { requireAppAccess } = await import("@/server/protectedServerFn");
    await requireAppAccess();
    const { getDb } = await import("@/lib/db");
    const { apiKeys } = await import("@/server/db/schema");
    const { eq } = await import("drizzle-orm");
    const db = await getDb();
    const [row] = await db
      .update(apiKeys)
      .set({ lastUsedAt: new Date() })
      .where(eq(apiKeys.id, id))
      .returning();
    return row;
  });
