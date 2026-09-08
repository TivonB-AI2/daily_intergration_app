import type { CSSProperties } from "react";

/**
 * Shared types/constants for the Theme Generator (`/theme`) feature.
 * Themes and the active-theme selection are persisted in the database
 * (`src/services/db/themeService.ts`) so they survive reloads, new sessions,
 * and are shared across devices — this file only holds the shapes and
 * presets used by both the theme builder page and the global
 * `ThemeApplier` (mounted once in `_protected.tsx`).
 */

export type BackgroundType = "solid" | "gradient" | "image" | "gif";
export type ThemeScope = "global" | "page";
export type BadgeShape = "pill" | "rounded" | "square";
export type BadgeFill = "solid" | "soft" | "outline";
export type CardFill = "solid" | "glass" | "soft";
export type CardBorder = "none" | "subtle" | "accent";

export const BADGE_SHAPE_LABEL: Record<BadgeShape, string> = {
  pill: "Pill",
  rounded: "Rounded",
  square: "Square",
};

export const BADGE_FILL_LABEL: Record<BadgeFill, string> = {
  solid: "Solid",
  soft: "Soft Tint",
  outline: "Outline",
};

export const BADGE_SHAPE_RADIUS_PX: Record<BadgeShape, number> = {
  pill: 9999,
  rounded: 8,
  square: 2,
};

export const CARD_FILL_LABEL: Record<CardFill, string> = {
  solid: "Solid",
  glass: "Glass",
  soft: "Soft Tint",
};

export const CARD_BORDER_LABEL: Record<CardBorder, string> = {
  none: "None",
  subtle: "Subtle",
  accent: "Accent",
};

/** Mirrors the CSS rules in `styles.css` for the builder's own live preview,
 * so the "Preview" block on the Cards tab matches what actually gets
 * rendered app-wide once the theme is activated. */
export function computeCardPreviewStyle(input: {
  fill: CardFill;
  border: CardBorder;
  opacity: number; // 0-100
  accentColor: string;
}): CSSProperties {
  const { fill, border, opacity, accentColor } = input;
  const alpha = Math.max(0, Math.min(100, opacity)) / 100;
  const style: CSSProperties = {};
  if (fill === "solid") {
    style.backgroundColor = hexToRgba("#18181b", alpha);
    style.backdropFilter = "none";
  } else if (fill === "glass") {
    style.backgroundColor = hexToRgba("#18181b", 0.4 * alpha);
    style.backdropFilter = "blur(12px)";
  } else {
    style.backgroundColor = hexToRgba(accentColor, 0.15 * alpha);
    style.backdropFilter = "none";
  }
  if (border === "none") {
    style.boxShadow = "none";
    style.borderColor = "transparent";
  } else if (border === "subtle") {
    style.borderWidth = 1;
    style.borderStyle = "solid";
    style.borderColor = "rgba(255,255,255,0.15)";
  } else {
    style.borderWidth = 1;
    style.borderStyle = "solid";
    style.borderColor = accentColor;
  }
  return style;
}

/** Computes the same badge look both the builder's live preview and
 * `ThemeApplier`'s global CSS variables are meant to produce, given a set of
 * badge-design fields and the theme's first accent color (or a fallback).
 * Used directly as inline React styles in the preview (so it doesn't depend
 * on the `custom-theme-active` global class being set), and mirrored as
 * plain CSS in `styles.css` for the live, app-wide version. */
export function computeBadgePreviewStyle(input: {
  shape: BadgeShape;
  fill: BadgeFill;
  border: boolean;
  opacity: number; // 0-100
  accentColor: string;
}): CSSProperties {
  const { shape, fill, border, opacity, accentColor } = input;
  const alpha = Math.max(0, Math.min(100, opacity)) / 100;
  const style: CSSProperties = {
    borderRadius: BADGE_SHAPE_RADIUS_PX[shape],
    borderStyle: "solid",
    borderWidth: border ? 1 : fill === "outline" ? 1 : 0,
  };
  if (fill === "solid") {
    style.backgroundColor = hexToRgba(accentColor, alpha);
    style.color = "#ffffff";
    style.borderColor = "transparent";
  } else if (fill === "soft") {
    style.backgroundColor = hexToRgba(accentColor, alpha * 0.18);
    style.color = accentColor;
    style.borderColor = border ? hexToRgba(accentColor, 0.4) : "transparent";
  } else {
    style.backgroundColor = "transparent";
    style.color = accentColor;
    style.borderColor = accentColor;
  }
  return style;
}

export type CustomTheme = {
  id: number;
  name: string;
  backgroundType: BackgroundType;
  background: string; // resolved CSS background value
  /** Relative S3 key when the image/gif is from the theme asset gallery —
   * renderers should re-resolve a fresh presigned URL from this instead of
   * trusting `background`, which may hold an expired one. Null otherwise
   * (solid/gradient, or a manually pasted external image URL). */
  backgroundKey?: string | null;
  intensity: number; // blur px source (0-100)
  overlay: number; // 0-100
  /** Tint color for the dark overlay, e.g. "#000000" for neutral black or a
   * brand color for a colored-glass look. */
  overlayColor: string;
  /** Up to a few accent hex colors used for highlights/badges/preview chips. */
  accentColors: string[] | null;
  /** Subtle grain/texture overlay strength, 0-100. */
  noiseOpacity: number;
  scope: ThemeScope;
  scopeKey: string; // "global" or a page path
  /** Card/dialog/popover corner radius in px. Null = app default `--radius`. */
  radius?: number | null;
  /** Card/dialog/popover shadow strength, 0-100. Null = app default. */
  shadowStrength?: number | null;
  /** Dark-mode overrides — set together to enable an auto light/dark
   * variant for this theme; left null to keep a single fixed look. */
  darkBackground?: string | null;
  darkBackgroundKey?: string | null;
  darkOverlayColor?: string | null;
  darkAccentColors?: string[] | null;
  /** Badge ("bubble") design overrides. Null = every badge keeps its normal
   * per-variant look (app default), same null-means-default convention as
   * `radius`/`shadowStrength` above. */
  badgeShape?: BadgeShape | null;
  badgeFill?: BadgeFill | null;
  badgeBorder?: boolean | null;
  badgeOpacity?: number | null;
  /** Card design overrides. Null = cards keep the app/theme's normal look
   * (the existing frosted-glass chrome while a theme is active). */
  cardFill?: CardFill | null;
  cardBorder?: CardBorder | null;
  cardOpacity?: number | null;
  /** Up to 5 hex colors overriding the app's `--chart-1`..`--chart-5`
   * Recharts palette while this theme is active. Null/empty = charts keep
   * the app's default indigo palette. */
  chartColors?: string[] | null;
  createdAt: Date | string;
};

/** The subset of a theme's fields that flip between light/dark. Resolves to
 * the light-mode values unless a dark override is present AND the manual
 * light/dark switch (see `getManualColorScheme`/`setManualColorScheme`
 * below) is currently set to dark — this is a user-flipped toggle, not tied
 * to the OS/browser's `prefers-color-scheme`. */
export function resolveThemeForColorScheme(
  theme: CustomTheme,
  isDark: boolean,
): {
  background: string;
  backgroundKey: string | null;
  overlayColor: string;
  accentColors: string[] | null;
  hasDarkVariant: boolean;
} {
  const hasDarkVariant = Boolean(theme.darkBackground);
  if (!isDark || !hasDarkVariant) {
    return {
      background: theme.background,
      backgroundKey: theme.backgroundKey ?? null,
      overlayColor: theme.overlayColor,
      accentColors: theme.accentColors,
      hasDarkVariant,
    };
  }
  return {
    background: theme.darkBackground as string,
    backgroundKey: theme.darkBackgroundKey ?? null,
    overlayColor: theme.darkOverlayColor ?? theme.overlayColor,
    accentColors: theme.darkAccentColors ?? theme.accentColors,
    hasDarkVariant,
  };
}

/** Curated starting points shown in the builder so users don't have to pick
 * every value from scratch. */
export const THEME_PRESETS: Array<{
  name: string;
  backgroundType: BackgroundType;
  solidColor: string;
  gradStart: string;
  gradEnd: string;
  gradDirection: string;
  overlayColor: string;
  intensity: number;
  overlay: number;
}> = [
  {
    name: "Midnight Indigo",
    backgroundType: "gradient",
    solidColor: "#1e1b4b",
    gradStart: "#312e81",
    gradEnd: "#0f172a",
    gradDirection: "to bottom right",
    overlayColor: "#000000",
    intensity: 55,
    overlay: 40,
  },
  {
    name: "Deep Slate",
    backgroundType: "solid",
    solidColor: "#0f172a",
    gradStart: "#1e293b",
    gradEnd: "#0f172a",
    gradDirection: "to bottom",
    overlayColor: "#000000",
    intensity: 45,
    overlay: 35,
  },
  {
    name: "Emerald Dusk",
    backgroundType: "gradient",
    solidColor: "#022c22",
    gradStart: "#065f46",
    gradEnd: "#022c22",
    gradDirection: "to bottom right",
    overlayColor: "#022c22",
    intensity: 50,
    overlay: 45,
  },
  {
    name: "Crimson Glow",
    backgroundType: "gradient",
    solidColor: "#450a0a",
    gradStart: "#7f1d1d",
    gradEnd: "#1c1917",
    gradDirection: "to bottom",
    overlayColor: "#1c1917",
    intensity: 55,
    overlay: 45,
  },
  {
    name: "Ocean Glass",
    backgroundType: "gradient",
    solidColor: "#082f49",
    gradStart: "#0369a1",
    gradEnd: "#082f49",
    gradDirection: "to bottom right",
    overlayColor: "#082f49",
    intensity: 60,
    overlay: 40,
  },
  {
    name: "Charcoal",
    backgroundType: "solid",
    solidColor: "#171717",
    gradStart: "#262626",
    gradEnd: "#0a0a0a",
    gradDirection: "to bottom",
    overlayColor: "#000000",
    intensity: 40,
    overlay: 30,
  },
];

export type ActiveEntry = { themeId: number };
export type ActiveMap = Record<string, ActiveEntry>;

/** Manual light/dark preference for a theme's dark variant — deliberately
 * NOT derived from `prefers-color-scheme`; the user flips this switch
 * themselves (persisted per-browser) instead of it following the OS/browser
 * setting automatically. Fired as a `theme-color-scheme-changed` window
 * event on every write so same-tab listeners (the toggle itself,
 * `ThemeApplier`) update immediately without waiting for a re-render loop. */
const MANUAL_COLOR_SCHEME_KEY = "theme-manual-color-scheme";

export function getManualColorScheme(): "light" | "dark" {
  if (typeof window === "undefined") return "light";
  return window.localStorage.getItem(MANUAL_COLOR_SCHEME_KEY) === "dark"
    ? "dark"
    : "light";
}

export function setManualColorScheme(scheme: "light" | "dark"): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(MANUAL_COLOR_SCHEME_KEY, scheme);
  window.dispatchEvent(
    new CustomEvent("theme-color-scheme-changed", { detail: scheme }),
  );
}

/** A tileable fractal-noise SVG (as a data URI) used for the subtle grain
 * texture overlay — cheap to render, no image asset needed. */
export const NOISE_TEXTURE_URI =
  "data:image/svg+xml;utf8," +
  encodeURIComponent(
    `<svg xmlns='http://www.w3.org/2000/svg' width='120' height='120'>` +
      `<filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' stitchTiles='stitch'/></filter>` +
      `<rect width='100%' height='100%' filter='url(#n)'/></svg>`,
  );

/** Converts a `#rrggbb` hex color + 0-1 alpha into an `rgba(...)` string,
 * used to tint the theme overlay. Falls back to black on invalid input. */
export function hexToRgba(hex: string, alpha: number): string {
  const match = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (!match) return `rgba(0,0,0,${alpha})`;
  const r = Number.parseInt(match[1], 16);
  const g = Number.parseInt(match[2], 16);
  const b = Number.parseInt(match[3], 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

/** Converts HSL (hue 0-360, saturation/lightness 0-100) to a `#rrggbb` hex
 * string. Used by the "Design For Me" curated-palette generator, which picks
 * colors via hue-harmony rules + fixed pleasant saturation/lightness ranges
 * instead of fully independent random hex values (unlike "Surprise Me"),
 * so generated palettes read as intentional rather than clashing. */
export function hslToHex(h: number, s: number, l: number): string {
  const hue = ((h % 360) + 360) % 360;
  const sat = Math.max(0, Math.min(100, s)) / 100;
  const light = Math.max(0, Math.min(100, l)) / 100;
  const c = (1 - Math.abs(2 * light - 1)) * sat;
  const x = c * (1 - Math.abs(((hue / 60) % 2) - 1));
  const m = light - c / 2;
  let [r, g, b] = [0, 0, 0];
  if (hue < 60) [r, g, b] = [c, x, 0];
  else if (hue < 120) [r, g, b] = [x, c, 0];
  else if (hue < 180) [r, g, b] = [0, c, x];
  else if (hue < 240) [r, g, b] = [0, x, c];
  else if (hue < 300) [r, g, b] = [x, 0, c];
  else [r, g, b] = [c, 0, x];
  const toHex = (v: number) =>
    Math.round((v + m) * 255)
      .toString(16)
      .padStart(2, "0");
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

/** The default Recharts chart palette (matches `styles.css`'s
 * `--chart-1`..`--chart-5`) — used as the starting point for a theme's
 * "Charts" tab and as the fallback swatch colors shown when a theme hasn't
 * set its own. */
export const DEFAULT_CHART_COLORS = [
  "#4f46e5",
  "#818cf8",
  "#3730a3",
  "#a5b4fc",
  "#312e81",
];

/** Minimum Euclidean RGB distance (0-441) two extracted colors must have
 * from every color already picked before `extractPaletteFromImage` accepts
 * a candidate — keeps the returned palette visually distinct instead of
 * several near-identical shades of the image's most common color. */
const MIN_UNIQUE_COLOR_DISTANCE = 45;

/**
 * Extracts a small dominant-color palette from an image, entirely
 * client-side. Draws the image onto a downscaled offscreen canvas, buckets
 * pixels into a coarse RGB grid (5-bit per channel — 32 buckets/channel,
 * ~32k total) to group near-identical colors, averages each bucket's real
 * pixel values (so the result isn't snapped to bucket boundaries), skips
 * near-transparent/near-white/near-black pixels (usually padding, not the
 * subject), and returns up to `count` hex colors ordered by how often they
 * appeared — walking the frequency-sorted buckets and skipping any
 * candidate too close (in RGB distance) to a color already accepted, so
 * the result is `count` visually *unique* colors, not `count` near-clones
 * of the same dominant shade. Requires a same-origin image source (a data
 * URL) — a cross-origin image would taint the canvas and throw on
 * `getImageData`.
 */
export function extractPaletteFromImage(
  dataUrl: string,
  count = 5,
): Promise<string[]> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      try {
        const size = 120;
        const canvas = document.createElement("canvas");
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext("2d");
        if (!ctx) throw new Error("Canvas not supported.");
        ctx.drawImage(img, 0, 0, size, size);
        const { data } = ctx.getImageData(0, 0, size, size);

        const buckets = new Map<
          string,
          { r: number; g: number; b: number; n: number }
        >();
        const BUCKET_BITS = 5; // 32 levels per channel
        for (let i = 0; i < data.length; i += 4) {
          const r = data[i];
          const g = data[i + 1];
          const b = data[i + 2];
          const a = data[i + 3];
          if (a < 200) continue; // skip near-transparent
          const brightness = (r + g + b) / 3;
          if (brightness > 245 || brightness < 12) continue; // skip near-white/black
          const key = `${r >> (8 - BUCKET_BITS)}-${g >> (8 - BUCKET_BITS)}-${b >> (8 - BUCKET_BITS)}`;
          const existing = buckets.get(key);
          if (existing) {
            existing.r += r;
            existing.g += g;
            existing.b += b;
            existing.n += 1;
          } else {
            buckets.set(key, { r, g, b, n: 1 });
          }
        }

        const sorted = Array.from(buckets.values()).sort((a, b) => b.n - a.n);
        const toHex = (v: number) =>
          Math.round(v).toString(16).padStart(2, "0");

        const accepted: { r: number; g: number; b: number }[] = [];
        for (const c of sorted) {
          if (accepted.length >= count) break;
          const avg = { r: c.r / c.n, g: c.g / c.n, b: c.b / c.n };
          const tooClose = accepted.some((a) => {
            const dr = a.r - avg.r;
            const dg = a.g - avg.g;
            const db = a.b - avg.b;
            return (
              Math.sqrt(dr * dr + dg * dg + db * db) < MIN_UNIQUE_COLOR_DISTANCE
            );
          });
          if (!tooClose) accepted.push(avg);
        }
        const colors = accepted.map(
          (c) => `#${toHex(c.r)}${toHex(c.g)}${toHex(c.b)}`,
        );
        if (colors.length === 0) {
          reject(new Error("Couldn't find any usable colors in this image."));
          return;
        }
        resolve(colors);
      } catch (err) {
        reject(
          err instanceof Error ? err : new Error("Palette extraction failed."),
        );
      }
    };
    img.onerror = () => reject(new Error("Couldn't load the image."));
    img.src = dataUrl;
  });
}

/** Relative luminance of a `#rrggbb` hex color (WCAG formula, 0-1). */
function relativeLuminance(hex: string): number {
  const match = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (!match) return 0;
  const [r, g, b] = [match[1], match[2], match[3]].map((c) => {
    const v = Number.parseInt(c, 16) / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** WCAG contrast ratio (1-21) between two hex colors. */
export function contrastRatio(hexA: string, hexB: string): number {
  const lA = relativeLuminance(hexA) + 0.05;
  const lB = relativeLuminance(hexB) + 0.05;
  return lA > lB ? lA / lB : lB / lA;
}

/** Flags themes likely to make body text hard to read: the app renders
 * near-white text over the theme's overlay color once active, so a light
 * overlay color (which itself washes toward white) or a very low overlay
 * opacity (letting a light image/gradient show through) both hurt contrast.
 * Returns a short warning string, or null if the theme passes. */
export function checkThemeConsistency(theme: {
  overlayColor: string;
  overlay: number;
  backgroundType: BackgroundType;
}): string | null {
  const textColor = "#fafafa"; // matches --theme text (neutral-50) in styles.css
  const ratio = contrastRatio(theme.overlayColor, textColor);
  if (ratio < 3) {
    return "Low contrast: this overlay color is too light for readable white text. Pick a darker overlay or raise its opacity.";
  }
  if (theme.overlay < 25 && theme.backgroundType !== "solid") {
    return "Overlay opacity is very low — busy gradients/images may make text hard to read. Consider raising it above 25%.";
  }
  return null;
}

/** Resolves the theme that should be active for a given pathname: a
 * page-specific theme (scopeKey === pathname) wins over a global one. */
export function resolveActiveTheme(
  themes: CustomTheme[],
  activeMap: ActiveMap,
  pathname: string,
): CustomTheme | null {
  const pageEntry = activeMap[pathname];
  const globalEntry = activeMap.global;
  const entry = pageEntry ?? globalEntry;
  if (!entry) return null;
  return themes.find((t) => t.id === entry.themeId) ?? null;
}
