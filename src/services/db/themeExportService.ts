import { createServerFn } from "@tanstack/react-start";
import type { CustomThemeInput } from "@/services/db/themeService";

/**
 * Lets a user turn a saved theme into a portable file ("shareable code") so
 * it can be handed to a teammate or re-applied in another workspace. Export
 * writes a JSON snapshot to the private `exports/Exported Theme/` S3 folder
 * and returns a presigned download link; import reads a previously exported
 * file back out of `uploads/` and inserts it as a new theme.
 */

/** All theme exports land under this fixed subfolder of the app's private
 * `exports/` prefix, so every exported theme file is easy to find in one
 * place in Storage. */
const EXPORTED_THEME_FOLDER = "exports/Exported Theme";

export const exportTheme = createServerFn({ method: "POST" })
  .inputValidator((themeId: number) => themeId)
  .handler(async ({ data: themeId }) => {
    const { requireAppAccess } = await import("@/server/protectedServerFn");
    await requireAppAccess();
    const { getDb } = await import("@/lib/db");
    const { customThemes } = await import("@/server/db/schema");
    const { eq } = await import("drizzle-orm");
    const { uploadFile, getPresignedUrl } = await import("@/server/s3/client");
    const db = await getDb();
    const [theme] = await db
      .select()
      .from(customThemes)
      .where(eq(customThemes.id, themeId));
    if (!theme) throw new Error("Theme not found");

    const { id: _id, createdAt: _createdAt, ...portable } = theme;
    const slug = theme.name.toLowerCase().replace(/[^a-z0-9]+/g, "-");
    const key = `${EXPORTED_THEME_FOLDER}/theme-${themeId}-${slug}.json`;
    await uploadFile(key, JSON.stringify(portable, null, 2), {
      contentType: "application/json",
    });
    const url = await getPresignedUrl(key, { expiresIn: 3600 });
    return { key, url };
  });

/** Client uploads the exported .json into `uploads/`, then this reads it
 * back and inserts a new theme row from it (always global scope; the user
 * re-scopes/activates it from the theme page like any other theme). */
export const importThemeFromUpload = createServerFn({ method: "POST" })
  .inputValidator((data: FormData) => data)
  .handler(async ({ data }) => {
    const { requireAppAccess } = await import("@/server/protectedServerFn");
    await requireAppAccess();
    const file = data.get("file") as File;
    if (!file) throw new Error("No file provided");

    const { uploadFile, downloadFile, deleteFile } = await import(
      "@/server/s3/client"
    );
    const key = `uploads/theme-imports/${Date.now()}-${file.name}`;
    await uploadFile(key, file, { contentType: "application/json" });

    const bytes = await downloadFile(key);
    if (!bytes) throw new Error("Uploaded file could not be read");
    let parsed: Partial<CustomThemeInput> & Record<string, unknown>;
    try {
      parsed = JSON.parse(new TextDecoder().decode(bytes));
    } catch {
      await deleteFile(key);
      throw new Error("That file isn't a valid theme export");
    }
    // Clean up the transient upload once parsed — the theme itself is
    // persisted in the database, not as a file.
    await deleteFile(key);

    if (!parsed.name || !parsed.backgroundType || !parsed.background) {
      throw new Error("That file isn't a valid theme export");
    }

    const { getDb } = await import("@/lib/db");
    const { customThemes } = await import("@/server/db/schema");
    const db = await getDb();
    const [row] = await db
      .insert(customThemes)
      .values({
        name: `${parsed.name} (imported)`,
        backgroundType:
          parsed.backgroundType as CustomThemeInput["backgroundType"],
        background: parsed.background as string,
        backgroundKey: (parsed.backgroundKey as string | null) ?? null,
        intensity: (parsed.intensity as number) ?? 50,
        overlay: (parsed.overlay as number) ?? 40,
        overlayColor: (parsed.overlayColor as string) ?? "#000000",
        accentColors: (parsed.accentColors as string[]) ?? [],
        noiseOpacity: (parsed.noiseOpacity as number) ?? 0,
        scope: "global",
        scopeKey: "global",
        radius: (parsed.radius as number | null) ?? null,
        shadowStrength: (parsed.shadowStrength as number | null) ?? null,
        darkBackground: (parsed.darkBackground as string | null) ?? null,
        darkBackgroundKey: (parsed.darkBackgroundKey as string | null) ?? null,
        darkOverlayColor: (parsed.darkOverlayColor as string | null) ?? null,
        darkAccentColors: (parsed.darkAccentColors as string[] | null) ?? null,
      })
      .returning();
    return row;
  });
