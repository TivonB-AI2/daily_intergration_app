import { createServerFn } from "@tanstack/react-start";

export type TodoInput = {
  title: string;
  description?: string | null;
  solution?: string | null;
  status?: "pending" | "in_progress" | "done" | "cancelled";
  priority?: "low" | "medium" | "high";
  dueDate?: string | null;
  changelogEntryId?: number | null;
  /** When set, this task is a sub-issue nested under another task. */
  parentId?: number | null;
};

export const listTodos = createServerFn({ method: "GET" }).handler(async () => {
  const { requireAppAccess } = await import("@/server/protectedServerFn");
  await requireAppAccess();
  const { getDb } = await import("@/lib/db");
  const { todos } = await import("@/server/db/schema");
  const { desc } = await import("drizzle-orm");
  const db = await getDb();
  return db.select().from(todos).orderBy(desc(todos.createdAt));
});

export const createTodo = createServerFn({ method: "POST" })
  .inputValidator((input: TodoInput) => input)
  .handler(async ({ data }) => {
    const { requireAppAccess } = await import("@/server/protectedServerFn");
    await requireAppAccess();
    const { getDb } = await import("@/lib/db");
    const { todos } = await import("@/server/db/schema");
    const db = await getDb();
    const [row] = await db
      .insert(todos)
      .values({
        title: data.title,
        description: data.description ?? null,
        solution: data.solution ?? null,
        status: data.status ?? "pending",
        priority: data.priority ?? "medium",
        dueDate: data.dueDate ? new Date(data.dueDate) : null,
        changelogEntryId: data.changelogEntryId ?? null,
        parentId: data.parentId ?? null,
        completedAt: data.status === "done" ? new Date() : null,
      })
      .returning();
    return row;
  });

export const updateTodoChangelogLink = createServerFn({ method: "POST" })
  .inputValidator(
    (input: { id: number; changelogEntryId: number | null }) => input,
  )
  .handler(async ({ data }) => {
    const { requireAppAccess } = await import("@/server/protectedServerFn");
    await requireAppAccess();
    const { getDb } = await import("@/lib/db");
    const { todos } = await import("@/server/db/schema");
    const { eq } = await import("drizzle-orm");
    const db = await getDb();
    const [row] = await db
      .update(todos)
      .set({ changelogEntryId: data.changelogEntryId, updatedAt: new Date() })
      .where(eq(todos.id, data.id))
      .returning();
    return row;
  });

export const updateTodoSolution = createServerFn({ method: "POST" })
  .inputValidator((input: { id: number; solution: string | null }) => input)
  .handler(async ({ data }) => {
    const { requireAppAccess } = await import("@/server/protectedServerFn");
    await requireAppAccess();
    const { getDb } = await import("@/lib/db");
    const { todos } = await import("@/server/db/schema");
    const { eq } = await import("drizzle-orm");
    const db = await getDb();
    const [row] = await db
      .update(todos)
      .set({ solution: data.solution, updatedAt: new Date() })
      .where(eq(todos.id, data.id))
      .returning();
    return row;
  });

export const updateTodoStatus = createServerFn({ method: "POST" })
  .inputValidator(
    (input: {
      id: number;
      status: "pending" | "in_progress" | "done" | "cancelled";
    }) => input,
  )
  .handler(async ({ data }) => {
    const { requireAppAccess } = await import("@/server/protectedServerFn");
    await requireAppAccess();
    const { getDb } = await import("@/lib/db");
    const { todos } = await import("@/server/db/schema");
    const { eq } = await import("drizzle-orm");
    const db = await getDb();
    const [row] = await db
      .update(todos)
      .set({
        status: data.status,
        updatedAt: new Date(),
        completedAt: data.status === "done" ? new Date() : null,
      })
      .where(eq(todos.id, data.id))
      .returning();
    return row;
  });

export const deleteTodo = createServerFn({ method: "POST" })
  .inputValidator((id: number) => id)
  .handler(async ({ data: id }) => {
    const { requireAppAccess } = await import("@/server/protectedServerFn");
    await requireAppAccess();
    const { getDb } = await import("@/lib/db");
    const { todos } = await import("@/server/db/schema");
    const { eq } = await import("drizzle-orm");
    const db = await getDb();
    await db.delete(todos).where(eq(todos.id, id));
  });
