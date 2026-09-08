import { createServerFn } from "@tanstack/react-start";

export type TeamMemberWithRole = {
  id: number;
  name: string;
  email: string;
  title: string | null;
  roleId: number | null;
  isOwner: boolean;
  createdAt: Date;
  roleName: string | null;
  roleColor: string | null;
};

const OWNER_ROLE_NAME = "Admin";

/** Finds the "Admin" role, creating it (with all-pages permissions) if it
 * doesn't exist yet. The Owner's role is always forced to this role. */
async function ensureAdminRoleId(
  db: Awaited<ReturnType<typeof import("@/lib/db").getDb>>,
): Promise<number> {
  const { roles, rolePermissions } = await import("@/server/db/schema");
  const { eq } = await import("drizzle-orm");
  const existing = await db
    .select({ id: roles.id })
    .from(roles)
    .where(eq(roles.name, OWNER_ROLE_NAME))
    .limit(1);
  if (existing[0]) return existing[0].id;

  const { flattenNavEntries } = await import("@/components/layout/nav").catch(
    () => ({ flattenNavEntries: null }),
  );
  const [role] = await db
    .insert(roles)
    .values({
      name: OWNER_ROLE_NAME,
      description: "Full access — automatically assigned to the app Owner.",
      color: "#f59e0b",
    })
    .returning();

  if (flattenNavEntries) {
    try {
      const { routes } = await import("@/components/layout/index");
      const pages = flattenNavEntries(routes as never);
      if (Array.isArray(pages) && pages.length > 0) {
        await db.insert(rolePermissions).values(
          pages.map((p: { title: string }) => ({
            roleId: role.id,
            pageKey: p.title,
          })),
        );
      }
    } catch {
      // Best-effort: if nav can't be read, Admin role is still created,
      // just without pre-granted permissions.
    }
  }

  return role.id;
}

export const listTeamMembers = createServerFn({ method: "GET" }).handler(
  async (): Promise<TeamMemberWithRole[]> => {
    const { requireAppAccess } = await import("@/server/protectedServerFn");
    await requireAppAccess();
    const { getDb } = await import("@/lib/db");
    const { teamMembers, roles } = await import("@/server/db/schema");
    const { asc, desc, eq } = await import("drizzle-orm");
    const db = await getDb();

    const rows = await db
      .select({
        id: teamMembers.id,
        name: teamMembers.name,
        email: teamMembers.email,
        title: teamMembers.title,
        roleId: teamMembers.roleId,
        isOwner: teamMembers.isOwner,
        createdAt: teamMembers.createdAt,
        roleName: roles.name,
        roleColor: roles.color,
      })
      .from(teamMembers)
      .leftJoin(roles, eq(teamMembers.roleId, roles.id))
      .orderBy(desc(teamMembers.isOwner), asc(teamMembers.name));

    return rows;
  },
);

export const createTeamMember = createServerFn({ method: "POST" })
  .inputValidator(
    (input: {
      name: string;
      email: string;
      title?: string;
      roleId?: number | null;
      isOwner?: boolean;
    }) => input,
  )
  .handler(async ({ data }) => {
    const { requireAppAccess } = await import("@/server/protectedServerFn");
    await requireAppAccess();
    const { getDb } = await import("@/lib/db");
    const { teamMembers } = await import("@/server/db/schema");
    const { eq } = await import("drizzle-orm");
    const db = await getDb();

    const wantsOwner = data.isOwner === true;
    const roleId = wantsOwner
      ? await ensureAdminRoleId(db)
      : (data.roleId ?? null);

    if (wantsOwner) {
      // Only one Owner at a time — demote any existing owner first.
      await db
        .update(teamMembers)
        .set({ isOwner: false })
        .where(eq(teamMembers.isOwner, true));
    }

    const [row] = await db
      .insert(teamMembers)
      .values({
        name: data.name,
        email: data.email,
        title: data.title ?? null,
        roleId,
        isOwner: wantsOwner,
      })
      .returning();
    return row;
  });

export const updateTeamMember = createServerFn({ method: "POST" })
  .inputValidator(
    (input: {
      id: number;
      name: string;
      email: string;
      title?: string;
      roleId?: number | null;
      isOwner?: boolean;
    }) => input,
  )
  .handler(async ({ data }) => {
    const { requireAppAccess } = await import("@/server/protectedServerFn");
    await requireAppAccess();
    const { getDb } = await import("@/lib/db");
    const { teamMembers } = await import("@/server/db/schema");
    const { eq, and, ne } = await import("drizzle-orm");
    const db = await getDb();

    const wantsOwner = data.isOwner === true;
    // The Owner's role is always forced to Admin and can't be changed away
    // from it via the Role picker, regardless of what was submitted.
    const roleId = wantsOwner
      ? await ensureAdminRoleId(db)
      : (data.roleId ?? null);

    if (wantsOwner) {
      // Only one Owner at a time — demote any other existing owner.
      await db
        .update(teamMembers)
        .set({ isOwner: false })
        .where(and(eq(teamMembers.isOwner, true), ne(teamMembers.id, data.id)));
    }

    const [row] = await db
      .update(teamMembers)
      .set({
        name: data.name,
        email: data.email,
        title: data.title ?? null,
        roleId,
        isOwner: wantsOwner,
      })
      .where(eq(teamMembers.id, data.id))
      .returning();
    return row;
  });

export const deleteTeamMember = createServerFn({ method: "POST" })
  .inputValidator((id: number) => id)
  .handler(async ({ data: id }) => {
    const { requireAppAccess } = await import("@/server/protectedServerFn");
    await requireAppAccess();
    const { getDb } = await import("@/lib/db");
    const { teamMembers } = await import("@/server/db/schema");
    const { eq } = await import("drizzle-orm");
    const db = await getDb();

    const [existing] = await db
      .select({ isOwner: teamMembers.isOwner })
      .from(teamMembers)
      .where(eq(teamMembers.id, id))
      .limit(1);
    if (existing?.isOwner) {
      throw new Error(
        "The app Owner can't be removed. Unset them as Owner first.",
      );
    }

    await db.delete(teamMembers).where(eq(teamMembers.id, id));
  });
