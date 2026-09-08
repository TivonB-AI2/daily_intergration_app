import { createServerFn } from "@tanstack/react-start";

export type RoleWithPermissions = {
  id: number;
  name: string;
  description: string | null;
  color: string;
  createdAt: Date;
  pageKeys: string[];
};

export const listRoles = createServerFn({ method: "GET" }).handler(
  async (): Promise<RoleWithPermissions[]> => {
    const { requireAppAccess } = await import("@/server/protectedServerFn");
    await requireAppAccess();
    const { getDb } = await import("@/lib/db");
    const { roles, rolePermissions } = await import("@/server/db/schema");
    const { asc } = await import("drizzle-orm");
    const db = await getDb();

    const [roleRows, permRows] = await Promise.all([
      db.select().from(roles).orderBy(asc(roles.name)),
      db.select().from(rolePermissions),
    ]);

    const permsByRole = new Map<number, string[]>();
    for (const p of permRows) {
      const list = permsByRole.get(p.roleId) ?? [];
      list.push(p.pageKey);
      permsByRole.set(p.roleId, list);
    }

    return roleRows.map((r) => ({
      ...r,
      pageKeys: permsByRole.get(r.id) ?? [],
    }));
  },
);

export const createRole = createServerFn({ method: "POST" })
  .inputValidator(
    (input: { name: string; description?: string; color: string }) => input,
  )
  .handler(async ({ data }) => {
    const { requireAppAccess } = await import("@/server/protectedServerFn");
    await requireAppAccess();
    const { getDb } = await import("@/lib/db");
    const { roles } = await import("@/server/db/schema");
    const db = await getDb();
    const [row] = await db
      .insert(roles)
      .values({
        name: data.name,
        description: data.description ?? null,
        color: data.color,
      })
      .returning();
    return row;
  });

export const deleteRole = createServerFn({ method: "POST" })
  .inputValidator((id: number) => id)
  .handler(async ({ data: id }) => {
    const { requireAppAccess } = await import("@/server/protectedServerFn");
    await requireAppAccess();
    const { getDb } = await import("@/lib/db");
    const { roles } = await import("@/server/db/schema");
    const { eq } = await import("drizzle-orm");
    const db = await getDb();
    await db.delete(roles).where(eq(roles.id, id));
  });

export const duplicateRole = createServerFn({ method: "POST" })
  .inputValidator((roleId: number) => roleId)
  .handler(async ({ data: roleId }) => {
    const { requireAppAccess } = await import("@/server/protectedServerFn");
    await requireAppAccess();
    const { getDb } = await import("@/lib/db");
    const { roles, rolePermissions } = await import("@/server/db/schema");
    const { eq } = await import("drizzle-orm");
    const db = await getDb();

    const [source] = await db.select().from(roles).where(eq(roles.id, roleId));
    if (!source) throw new Error("Role not found");

    const [copy] = await db
      .insert(roles)
      .values({
        name: `${source.name} (copy)`,
        description: source.description,
        color: source.color,
      })
      .returning();

    const perms = await db
      .select()
      .from(rolePermissions)
      .where(eq(rolePermissions.roleId, roleId));
    if (perms.length > 0) {
      await db
        .insert(rolePermissions)
        .values(perms.map((p) => ({ roleId: copy.id, pageKey: p.pageKey })));
    }
    return copy;
  });

/** Replaces a role's full permission set (the granted page keys) in one
 * call — simplest way to sync a matrix of checkboxes. */
export const setRolePermissions = createServerFn({ method: "POST" })
  .inputValidator((input: { roleId: number; pageKeys: string[] }) => input)
  .handler(async ({ data }) => {
    const { requireAppAccess } = await import("@/server/protectedServerFn");
    await requireAppAccess();
    const { getDb } = await import("@/lib/db");
    const { rolePermissions } = await import("@/server/db/schema");
    const { eq } = await import("drizzle-orm");
    const db = await getDb();
    await db
      .delete(rolePermissions)
      .where(eq(rolePermissions.roleId, data.roleId));
    if (data.pageKeys.length > 0) {
      await db
        .insert(rolePermissions)
        .values(
          data.pageKeys.map((pageKey) => ({ roleId: data.roleId, pageKey })),
        );
    }
  });
