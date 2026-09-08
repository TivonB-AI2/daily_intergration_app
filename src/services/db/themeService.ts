import { createServerFn } from "@tanstack/react-start";

export type BackgroundType = "solid" | "gradient" | "image" | "gif";
export type ThemeScope = "global" | "page";

export type BadgeShape = "pill" | "rounded" | "square";
export type BadgeFill = "solid" | "soft" | "outline";
export type CardFill = "solid" | "glass" | "soft";
export type CardBorder = "none" | "subtle" | "accent";

export type CustomThemeInput = {
  name: string;
  backgroundType: BackgroundType;
  background: string;
  /** Relative S3 key when the image/gif came from the theme asset gallery,
   * so a fresh presigned URL can be re-resolved instead of relying on the
   * (expiring) URL baked into `background`. */
  backgroundKey?: string | null;
  intensity: number;
  overlay: number;
  overlayColor: string;
  accentColors?: string[];
  noiseOpacity?: number;
  scope: ThemeScope;
  scopeKey: string;
  radius?: number | null;
  shadowStrength?: number | null;
  darkBackground?: string | null;
  darkBackgroundKey?: string | null;
  darkOverlayColor?: string | null;
  darkAccentColors?: string[] | null;
  badgeShape?: BadgeShape | null;
  badgeFill?: BadgeFill | null;
  badgeBorder?: boolean | null;
  badgeOpacity?: number | null;
  cardFill?: CardFill | null;
  cardBorder?: CardBorder | null;
  cardOpacity?: number | null;
  chartColors?: string[] | null;
};

export const listCustomThemes = createServerFn({ method: "GET" }).handler(
  async () => {
    const { requireAppAccess } = await import("@/server/protectedServerFn");
    await requireAppAccess();
    const { getDb } = await import("@/lib/db");
    const { customThemes } = await import("@/server/db/schema");
    const { desc } = await import("drizzle-orm");
    const db = await getDb();
    return db.select().from(customThemes).orderBy(desc(customThemes.createdAt));
  },
);

export const createCustomTheme = createServerFn({ method: "POST" })
  .inputValidator((input: CustomThemeInput) => input)
  .handler(async ({ data }) => {
    const { requireAppAccess } = await import("@/server/protectedServerFn");
    await requireAppAccess();
    const { getDb } = await import("@/lib/db");
    const { customThemes } = await import("@/server/db/schema");
    const db = await getDb();
    const [row] = await db
      .insert(customThemes)
      .values({
        ...data,
        backgroundKey: data.backgroundKey ?? null,
        accentColors: data.accentColors ?? [],
        noiseOpacity: data.noiseOpacity ?? 0,
        radius: data.radius ?? null,
        shadowStrength: data.shadowStrength ?? null,
        darkBackground: data.darkBackground ?? null,
        darkBackgroundKey: data.darkBackgroundKey ?? null,
        darkOverlayColor: data.darkOverlayColor ?? null,
        darkAccentColors: data.darkAccentColors ?? null,
        badgeShape: data.badgeShape ?? null,
        badgeFill: data.badgeFill ?? null,
        badgeBorder: data.badgeBorder ?? null,
        badgeOpacity: data.badgeOpacity ?? null,
        cardFill: data.cardFill ?? null,
        cardBorder: data.cardBorder ?? null,
        cardOpacity: data.cardOpacity ?? null,
        chartColors: data.chartColors ?? null,
      })
      .returning();
    return row;
  });

/** Deletes a theme. Does NOT snapshot it automatically — back it up first
 * with `backupCustomTheme` if you want it recoverable afterward. */
export const deleteCustomTheme = createServerFn({ method: "POST" })
  .inputValidator((id: number) => id)
  .handler(async ({ data: id }) => {
    const { requireAppAccess } = await import("@/server/protectedServerFn");
    await requireAppAccess();
    const { getDb } = await import("@/lib/db");
    const { customThemes } = await import("@/server/db/schema");
    const { eq } = await import("drizzle-orm");
    const db = await getDb();
    await db.delete(customThemes).where(eq(customThemes.id, id));
  });

/** Manually snapshots a theme into `theme_backups` on request — the user
 * decides when to back a theme up, nothing runs this automatically. */
export const backupCustomTheme = createServerFn({ method: "POST" })
  .inputValidator((id: number) => id)
  .handler(async ({ data: id }) => {
    const { requireAppAccess } = await import("@/server/protectedServerFn");
    await requireAppAccess();
    const { getDb } = await import("@/lib/db");
    const { customThemes, themeBackups } = await import("@/server/db/schema");
    const { eq } = await import("drizzle-orm");
    const db = await getDb();
    const [existing] = await db
      .select()
      .from(customThemes)
      .where(eq(customThemes.id, id));
    if (!existing) throw new Error("Theme not found");
    const [backup] = await db
      .insert(themeBackups)
      .values({
        originalThemeId: existing.id,
        name: existing.name,
        snapshot: JSON.stringify(existing),
        reason: "manual",
      })
      .returning();
    return backup;
  });

/** Most recent backups, newest first, capped so the list stays manageable. */
export const listThemeBackups = createServerFn({ method: "GET" }).handler(
  async () => {
    const { requireAppAccess } = await import("@/server/protectedServerFn");
    await requireAppAccess();
    const { getDb } = await import("@/lib/db");
    const { themeBackups } = await import("@/server/db/schema");
    const { desc } = await import("drizzle-orm");
    const db = await getDb();
    return db
      .select()
      .from(themeBackups)
      .orderBy(desc(themeBackups.createdAt))
      .limit(20);
  },
);

/** Re-creates a theme from a backup snapshot as a brand-new theme row (never
 * overwrites in place, so restoring is itself non-destructive). */
export const restoreThemeBackup = createServerFn({ method: "POST" })
  .inputValidator((backupId: number) => backupId)
  .handler(async ({ data: backupId }) => {
    const { requireAppAccess } = await import("@/server/protectedServerFn");
    await requireAppAccess();
    const { getDb } = await import("@/lib/db");
    const { themeBackups, customThemes } = await import("@/server/db/schema");
    const { eq } = await import("drizzle-orm");
    const db = await getDb();
    const [backup] = await db
      .select()
      .from(themeBackups)
      .where(eq(themeBackups.id, backupId));
    if (!backup) throw new Error("Backup not found");
    const snapshot = JSON.parse(backup.snapshot) as Record<string, unknown>;
    const { id: _id, createdAt: _createdAt, ...rest } = snapshot;
    const [row] = await db
      .insert(customThemes)
      .values({
        ...(rest as CustomThemeInput),
        name: `${backup.name} (restored)`,
      })
      .returning();
    return row;
  });

export const listActiveThemes = createServerFn({ method: "GET" }).handler(
  async () => {
    const { requireAppAccess } = await import("@/server/protectedServerFn");
    await requireAppAccess();
    const { getDb } = await import("@/lib/db");
    const { activeThemes } = await import("@/server/db/schema");
    const db = await getDb();
    return db.select().from(activeThemes);
  },
);

export const setActiveTheme = createServerFn({ method: "POST" })
  .inputValidator((input: { scopeKey: string; themeId: number }) => input)
  .handler(async ({ data }) => {
    const { requireAppAccess } = await import("@/server/protectedServerFn");
    await requireAppAccess();
    const { getDb } = await import("@/lib/db");
    const { activeThemes } = await import("@/server/db/schema");
    const db = await getDb();
    const [row] = await db
      .insert(activeThemes)
      .values({ scopeKey: data.scopeKey, themeId: data.themeId })
      .onConflictDoUpdate({
        target: activeThemes.scopeKey,
        set: { themeId: data.themeId, updatedAt: new Date() },
      })
      .returning();
    return row;
  });

export const clearActiveTheme = createServerFn({ method: "POST" })
  .inputValidator((scopeKey: string) => scopeKey)
  .handler(async ({ data: scopeKey }) => {
    const { requireAppAccess } = await import("@/server/protectedServerFn");
    await requireAppAccess();
    const { getDb } = await import("@/lib/db");
    const { activeThemes } = await import("@/server/db/schema");
    const { eq } = await import("drizzle-orm");
    const db = await getDb();
    await db.delete(activeThemes).where(eq(activeThemes.scopeKey, scopeKey));
  });

export const clearActiveThemes = createServerFn({ method: "POST" })
  .inputValidator((scopeKeys: string[]) => scopeKeys)
  .handler(async ({ data: scopeKeys }) => {
    const { requireAppAccess } = await import("@/server/protectedServerFn");
    await requireAppAccess();
    const { getDb } = await import("@/lib/db");
    const { activeThemes } = await import("@/server/db/schema");
    const { inArray } = await import("drizzle-orm");
    const db = await getDb();
    if (scopeKeys.length === 0) return;
    await db
      .delete(activeThemes)
      .where(inArray(activeThemes.scopeKey, scopeKeys));
  });
