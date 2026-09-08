import { createServerFn } from "@tanstack/react-start";

export type WorkflowRegistryInput = {
  workflowId: string;
  name: string;
  description?: string | null;
  status?: string;
  triggerType?: string | null;
};

export type WorkflowRunInput = {
  workflowId: string;
  workflowName: string;
  input?: string | null;
  output?: string | null;
  status?: "success" | "failure";
  durationMs?: number;
};

export const listRegisteredWorkflows = createServerFn({
  method: "GET",
}).handler(async () => {
  const { requireAppAccess } = await import("@/server/protectedServerFn");
  await requireAppAccess();
  const { getDb } = await import("@/lib/db");
  const { workflowRegistry } = await import("@/server/db/schema");
  const { asc } = await import("drizzle-orm");
  const db = await getDb();
  return db.select().from(workflowRegistry).orderBy(asc(workflowRegistry.name));
});

export const registerWorkflow = createServerFn({ method: "POST" })
  .inputValidator((input: WorkflowRegistryInput) => input)
  .handler(async ({ data }) => {
    const { requireAppAccess } = await import("@/server/protectedServerFn");
    await requireAppAccess();
    const { getDb } = await import("@/lib/db");
    const { workflowRegistry, auditLogs } = await import("@/server/db/schema");
    const db = await getDb();
    const [row] = await db
      .insert(workflowRegistry)
      .values({
        workflowId: data.workflowId,
        name: data.name,
        description: data.description ?? null,
        status: data.status ?? "draft",
        triggerType: data.triggerType ?? null,
      })
      .onConflictDoUpdate({
        target: workflowRegistry.workflowId,
        set: { name: data.name, description: data.description ?? null },
      })
      .returning();
    await db.insert(auditLogs).values({
      action: "Registered workflow",
      resource: data.name,
      page: "/workflows",
      category: "workflows",
    });
    return row;
  });

export const unregisterWorkflow = createServerFn({ method: "POST" })
  .inputValidator((id: number) => id)
  .handler(async ({ data: id }) => {
    const { requireAppAccess } = await import("@/server/protectedServerFn");
    await requireAppAccess();
    const { getDb } = await import("@/lib/db");
    const { workflowRegistry, auditLogs } = await import("@/server/db/schema");
    const { eq } = await import("drizzle-orm");
    const db = await getDb();
    const [row] = await db
      .delete(workflowRegistry)
      .where(eq(workflowRegistry.id, id))
      .returning();
    await db.insert(auditLogs).values({
      action: "Removed workflow from registry",
      resource: row?.name,
      page: "/workflows",
      category: "workflows",
    });
  });

export const listWorkflowRuns = createServerFn({ method: "GET" }).handler(
  async () => {
    const { requireAppAccess } = await import("@/server/protectedServerFn");
    await requireAppAccess();
    const { getDb } = await import("@/lib/db");
    const { workflowRuns } = await import("@/server/db/schema");
    const { desc } = await import("drizzle-orm");
    const db = await getDb();
    return db.select().from(workflowRuns).orderBy(desc(workflowRuns.createdAt));
  },
);

export const recordWorkflowRun = createServerFn({ method: "POST" })
  .inputValidator((input: WorkflowRunInput) => input)
  .handler(async ({ data }) => {
    const { requireAppAccess } = await import("@/server/protectedServerFn");
    await requireAppAccess();
    const { getDb } = await import("@/lib/db");
    const { workflowRuns, auditLogs } = await import("@/server/db/schema");
    const db = await getDb();
    const [row] = await db
      .insert(workflowRuns)
      .values({
        workflowId: data.workflowId,
        workflowName: data.workflowName,
        input: data.input ?? null,
        output: data.output ?? null,
        status: data.status ?? "success",
        durationMs: data.durationMs ?? 0,
      })
      .returning();
    await db.insert(auditLogs).values({
      status: data.status ?? "success",
      action: "Ran workflow",
      resource: data.workflowName,
      page: "/workflows",
      category: "workflows",
    });
    return row;
  });

export const clearWorkflowRuns = createServerFn({ method: "POST" }).handler(
  async () => {
    const { requireAppAccess } = await import("@/server/protectedServerFn");
    await requireAppAccess();
    const { getDb } = await import("@/lib/db");
    const { workflowRuns } = await import("@/server/db/schema");
    const db = await getDb();
    await db.delete(workflowRuns);
  },
);
