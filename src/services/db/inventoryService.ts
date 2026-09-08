import { createServerFn } from "@tanstack/react-start";

export type InventoryInput = {
  name: string;
  description?: string | null;
  sku: string;
  category: string;
  quantity?: number;
  price?: string | null;
  photoKey?: string | null;
  status?: "active" | "inactive" | "discontinued";
};

export const listInventoryItems = createServerFn({ method: "GET" }).handler(
  async () => {
    const { requireAppAccess } = await import("@/server/protectedServerFn");
    await requireAppAccess();
    const { getDb } = await import("@/lib/db");
    const { inventoryItems } = await import("@/server/db/schema");
    const { desc } = await import("drizzle-orm");
    const db = await getDb();
    return db
      .select()
      .from(inventoryItems)
      .orderBy(desc(inventoryItems.createdAt));
  },
);

export const createInventoryItem = createServerFn({ method: "POST" })
  .inputValidator((input: InventoryInput) => input)
  .handler(async ({ data }) => {
    const { requireAppAccess } = await import("@/server/protectedServerFn");
    await requireAppAccess();
    const { getDb } = await import("@/lib/db");
    const { inventoryItems } = await import("@/server/db/schema");
    const db = await getDb();
    const [row] = await db
      .insert(inventoryItems)
      .values({
        name: data.name,
        description: data.description ?? null,
        sku: data.sku,
        category: data.category,
        quantity: data.quantity ?? 0,
        price: data.price ?? null,
        photoKey: data.photoKey ?? null,
        status: data.status ?? "active",
      })
      .returning();
    return row;
  });

export const updateInventoryItem = createServerFn({ method: "POST" })
  .inputValidator((input: { id: number; data: InventoryInput }) => input)
  .handler(async ({ data: { id, data } }) => {
    const { requireAppAccess } = await import("@/server/protectedServerFn");
    await requireAppAccess();
    const { getDb } = await import("@/lib/db");
    const { inventoryItems } = await import("@/server/db/schema");
    const { eq } = await import("drizzle-orm");
    const db = await getDb();
    const [row] = await db
      .update(inventoryItems)
      .set({
        name: data.name,
        description: data.description ?? null,
        sku: data.sku,
        category: data.category,
        quantity: data.quantity ?? 0,
        price: data.price ?? null,
        photoKey: data.photoKey ?? null,
        status: data.status ?? "active",
        updatedAt: new Date(),
      })
      .where(eq(inventoryItems.id, id))
      .returning();
    return row;
  });

/** Lightweight status-only update — used by bulk actions so they don't need
 * to resend every field of the item just to change its status. */
export const updateInventoryItemStatus = createServerFn({ method: "POST" })
  .inputValidator(
    (input: { id: number; status: "active" | "inactive" | "discontinued" }) =>
      input,
  )
  .handler(async ({ data }) => {
    const { requireAppAccess } = await import("@/server/protectedServerFn");
    await requireAppAccess();
    const { getDb } = await import("@/lib/db");
    const { inventoryItems } = await import("@/server/db/schema");
    const { eq } = await import("drizzle-orm");
    const db = await getDb();
    const [row] = await db
      .update(inventoryItems)
      .set({ status: data.status, updatedAt: new Date() })
      .where(eq(inventoryItems.id, data.id))
      .returning();
    return row;
  });

export const deleteInventoryItem = createServerFn({ method: "POST" })
  .inputValidator((id: number) => id)
  .handler(async ({ data: id }) => {
    const { requireAppAccess } = await import("@/server/protectedServerFn");
    await requireAppAccess();
    const { getDb } = await import("@/lib/db");
    const { inventoryItems } = await import("@/server/db/schema");
    const { eq } = await import("drizzle-orm");
    const db = await getDb();
    await db.delete(inventoryItems).where(eq(inventoryItems.id, id));
  });
