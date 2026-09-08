import { useMemo, useState } from "react";
import { useRouterState } from "@tanstack/react-router";
import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { useCapabilities } from "@/hooks/useCapabilities";
import {
  NOISE_TEXTURE_URI,
  getManualColorScheme,
  hexToRgba,
  resolveActiveTheme,
  resolveThemeForColorScheme,
  type ActiveMap,
} from "@/lib/customTheme";
import { listCustomThemes, listActiveThemes } from "@/services/db/themeService";
import { getThemeGalleryFileUrl } from "@/services/db/themeGalleryService";

/** Pulls the raw URL out of a `url(...)` CSS value (with or without quotes). */
function extractCssUrl(value: string): string | null {
  const match = /^url\((.+)\)$/.exec(value.trim());
  if (!match) return null;
  return match[1].replace(/^["']/, "").replace(/["']$/, "");
}

/**
 * Mounted once in `_protected.tsx`. Reads saved themes, the active-theme
 * selection, and the active animated theme from the database (persisted, not
 * per-browser) and renders whichever is active as a background behind the
 * whole app. Animated themes take precedence over custom themes when both are
 * available. Also flips a `custom-theme-active` class on `<html>` so
 * `styles.css` can make the app chrome translucent to reveal it.
 */
export function ThemeApplier() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const { data: caps } = useCapabilities();
  const dbEnabled = caps?.databaseEnabled === true;

  // Same-tab changes (activating/saving/deleting on /theme) invalidate these
  // exact query keys immediately via the shared QueryClient, so this poll is
  // only a fallback for cross-tab/cross-session changes — it doesn't need to
  // be frequent. 10 minutes is plenty to pick up a change made in another
  // tab/session while keeping this background request effectively
  // negligible across every page, for every signed-in user, forever.
  const THEME_POLL_INTERVAL_MS = 10 * 60 * 1000;
  const { data: themes } = useQuery({
    queryKey: ["customThemes"],
    queryFn: () => listCustomThemes(),
    enabled: dbEnabled,
    refetchInterval: THEME_POLL_INTERVAL_MS,
  });
  const { data: activeRows } = useQuery({
    queryKey: ["activeThemes"],
    queryFn: () => listActiveThemes(),
    enabled: dbEnabled,
    refetchInterval: THEME_POLL_INTERVAL_MS,
  });

  const activeMap: ActiveMap = useMemo(() => {
    const map: ActiveMap = {};
    for (const row of activeRows ?? []) {
      map[row.scopeKey] = { themeId: row.themeId };
    }
    return map;
  }, [activeRows]);

  const theme = useMemo(
    () => resolveActiveTheme(themes ?? [], activeMap, pathname),
    [themes, activeMap, pathname],
  );

  // Manual light/dark preference (a switch the user flips themselves, not
  // the OS/browser's `prefers-color-scheme` — see `customTheme.ts`).
  const [manualIsDark, setManualIsDark] = useState(false);
  useEffect(() => {
    setManualIsDark(getManualColorScheme() === "dark");
    const onChange = (e: Event) =>
      setManualIsDark((e as CustomEvent<"light" | "dark">).detail === "dark");
    const onStorage = (e: StorageEvent) => {
      if (e.key === "theme-manual-color-scheme") {
        setManualIsDark(getManualColorScheme() === "dark");
      }
    };
    window.addEventListener("theme-color-scheme-changed", onChange);
    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener("theme-color-scheme-changed", onChange);
      window.removeEventListener("storage", onStorage);
    };
  }, []);

  const resolved = useMemo(
    () => (theme ? resolveThemeForColorScheme(theme, manualIsDark) : null),
    [theme, manualIsDark],
  );

  useEffect(() => {
    const root = document.documentElement;
    if (!theme || !resolved) {
      root.classList.remove("custom-theme-active");
      root.style.removeProperty("--theme-accent-1");
      root.style.removeProperty("--theme-accent-2");
      root.style.removeProperty("--theme-accent-3");
      root.style.removeProperty("--accent");
      root.style.removeProperty("--ring");
      root.style.removeProperty("--sidebar-primary");
      root.style.removeProperty("--sidebar-ring");
      root.style.removeProperty("--radius");
      root.style.removeProperty("--theme-shadow-opacity");
      root.removeAttribute("data-badge-shape");
      root.removeAttribute("data-badge-fill");
      root.removeAttribute("data-badge-border");
      root.style.removeProperty("--badge-opacity");
      root.removeAttribute("data-card-fill");
      root.removeAttribute("data-card-border");
      root.style.removeProperty("--card-opacity");
      root.style.removeProperty("--chart-1");
      root.style.removeProperty("--chart-2");
      root.style.removeProperty("--chart-3");
      root.style.removeProperty("--chart-4");
      root.style.removeProperty("--chart-5");
      return;
    }
    root.classList.add("custom-theme-active");
    const [a1, a2, a3] = resolved.accentColors ?? [];
    if (a1) root.style.setProperty("--theme-accent-1", a1);
    if (a2) root.style.setProperty("--theme-accent-2", a2);
    if (a3) root.style.setProperty("--theme-accent-3", a3);
    // The first accent color, when set, becomes the app's live accent across
    // every component that already reads these tokens — not just
    // `bg-accent`, but focus rings and sidebar highlights too, so the accent
    // feels like a consistent brand color rather than a single badge tint.
    if (a1) {
      root.style.setProperty("--accent", a1);
      root.style.setProperty("--ring", a1);
      root.style.setProperty("--sidebar-primary", a1);
      root.style.setProperty("--sidebar-ring", a1);
    }
    if (typeof theme.radius === "number") {
      root.style.setProperty("--radius", `${theme.radius}px`);
    }
    if (typeof theme.shadowStrength === "number") {
      root.style.setProperty(
        "--theme-shadow-opacity",
        String(Math.min(0.6, theme.shadowStrength / 100)),
      );
    }
    // Badge ("bubble") design — each field independently falls back to the
    // app default (attribute/variable simply absent) when not set on this
    // theme, same null-means-default convention as radius/shadowStrength.
    if (theme.badgeShape) {
      root.setAttribute("data-badge-shape", theme.badgeShape);
    } else {
      root.removeAttribute("data-badge-shape");
    }
    if (theme.badgeFill) {
      root.setAttribute("data-badge-fill", theme.badgeFill);
    } else {
      root.removeAttribute("data-badge-fill");
    }
    if (theme.badgeBorder) {
      root.setAttribute("data-badge-border", "true");
    } else {
      root.removeAttribute("data-badge-border");
    }
    if (typeof theme.badgeOpacity === "number") {
      root.style.setProperty("--badge-opacity", `${theme.badgeOpacity}%`);
    } else {
      root.style.removeProperty("--badge-opacity");
    }
    // Card design — same null-means-app-default convention.
    if (theme.cardFill) {
      root.setAttribute("data-card-fill", theme.cardFill);
    } else {
      root.removeAttribute("data-card-fill");
    }
    if (theme.cardBorder) {
      root.setAttribute("data-card-border", theme.cardBorder);
    } else {
      root.removeAttribute("data-card-border");
    }
    if (typeof theme.cardOpacity === "number") {
      root.style.setProperty("--card-opacity", `${theme.cardOpacity}%`);
    } else {
      root.style.removeProperty("--card-opacity");
    }
    // Chart ("Recharts") palette override — every chart in the app reads
    // `var(--chart-1)`..`var(--chart-5)` for its series colors, so setting
    // these here re-themes every chart app-wide with zero per-chart changes.
    // Null/empty (app default) leaves the existing indigo palette alone.
    const chartVars = [
      "--chart-1",
      "--chart-2",
      "--chart-3",
      "--chart-4",
      "--chart-5",
    ];
    if (theme.chartColors && theme.chartColors.length > 0) {
      chartVars.forEach((v, i) => {
        const color = theme.chartColors?.[i];
        if (color) root.style.setProperty(v, color);
        else root.style.removeProperty(v);
      });
    } else {
      chartVars.forEach((v) => root.style.removeProperty(v));
    }
    return () => {
      root.classList.remove("custom-theme-active");
      root.style.removeProperty("--theme-accent-1");
      root.style.removeProperty("--theme-accent-2");
      root.style.removeProperty("--theme-accent-3");
      root.style.removeProperty("--accent");
      root.style.removeProperty("--ring");
      root.style.removeProperty("--sidebar-primary");
      root.style.removeProperty("--sidebar-ring");
      root.style.removeProperty("--radius");
      root.style.removeProperty("--theme-shadow-opacity");
      root.removeAttribute("data-badge-shape");
      root.removeAttribute("data-badge-fill");
      root.removeAttribute("data-badge-border");
      root.style.removeProperty("--badge-opacity");
      root.removeAttribute("data-card-fill");
      root.removeAttribute("data-card-border");
      root.style.removeProperty("--card-opacity");
      root.style.removeProperty("--chart-1");
      root.style.removeProperty("--chart-2");
      root.style.removeProperty("--chart-3");
      root.style.removeProperty("--chart-4");
      root.style.removeProperty("--chart-5");
    };
  }, [theme, resolved]);

  // Presigned gallery URLs expire after ~1h; re-resolve a fresh one from the
  // stored relative key instead of trusting whatever URL got baked into
  // `theme.background` at save time (which would otherwise silently start
  // failing to load — wasted, endlessly-retried network requests for a
  // background image that never renders again).
  const { data: freshGalleryUrl } = useQuery({
    queryKey: ["themeGalleryFileUrl", resolved?.backgroundKey],
    queryFn: () =>
      getThemeGalleryFileUrl({ data: resolved?.backgroundKey as string }),
    enabled: !!resolved?.backgroundKey,
    staleTime: 1000 * 60 * 50,
  });

  const isImage =
    theme?.backgroundType === "image" || theme?.backgroundType === "gif";
  // The URL this theme *should* be showing right now (fresh gallery URL once
  // resolved, or the URL baked into a manually-pasted background). Uses the
  // light/dark-resolved background so a dark-variant image swaps in too.
  const targetImageUrl =
    !theme || !resolved
      ? null
      : isImage
        ? resolved.backgroundKey
          ? (freshGalleryUrl?.url ?? null)
          : extractCssUrl(resolved.background)
        : null;

  // Preload at low network priority and only swap the background in once
  // decoded. This keeps a potentially huge image/GIF from competing with the
  // page's own critical-path resources (scripts, fonts, real content) and
  // stops it from counting toward LCP as a giant, abruptly-appearing paint —
  // it fades in instead once ready, off the critical path entirely.
  const [loadedImageUrl, setLoadedImageUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!targetImageUrl) {
      setLoadedImageUrl(null);
      return;
    }
    let cancelled = false;
    const img = new Image();
    // fetchPriority is widely supported in Chromium/Firefox; unsupported
    // browsers just ignore the property and load at normal priority.
    (img as unknown as { fetchPriority?: string }).fetchPriority = "low";
    img.decoding = "async";
    img.onload = () => {
      if (!cancelled) setLoadedImageUrl(targetImageUrl);
    };
    img.src = targetImageUrl;
    return () => {
      cancelled = true;
    };
  }, [targetImageUrl]);

  if (!theme || !resolved) return null;

  const blurPx = Math.round((theme.intensity / 100) * 24);
  // Floor the overlay at 35% so text/icons in the (always light-on-dark-glass)
  // chrome stay legible even if the user drags the slider to 0.
  const overlayAlpha = Math.max(0.35, theme.overlay / 100);
  // Keep the grain subtle — 100% on the slider still caps well under full
  // opacity so it reads as texture, not noise.
  const noiseAlpha = Math.min(0.25, (theme.noiseOpacity ?? 0) / 100 / 4);

  return (
    <div
      aria-hidden
      className="fixed inset-0 z-0 pointer-events-none"
      style={{
        position: "fixed",
        background: isImage ? undefined : resolved.background,
        // Cheap, instant neutral fill so there's no flash of the page
        // showing through while a large background image loads in.
        backgroundColor: isImage ? "#0a0a0a" : undefined,
      }}
    >
      {isImage && (
        <div
          className="absolute inset-0 transition-opacity duration-700 ease-out"
          style={{
            position: "absolute",
            background: loadedImageUrl
              ? `url(${loadedImageUrl}) center/cover no-repeat`
              : undefined,
            opacity: loadedImageUrl ? 1 : 0,
          }}
        />
      )}
      <div
        className="absolute inset-0"
        style={{
          backgroundColor: hexToRgba(resolved.overlayColor, overlayAlpha),
          backdropFilter: `blur(${blurPx}px)`,
        }}
      />
      {noiseAlpha > 0 && (
        <div
          className="absolute inset-0 mix-blend-overlay"
          style={{
            backgroundImage: `url("${NOISE_TEXTURE_URI}")`,
            opacity: noiseAlpha,
          }}
        />
      )}
    </div>
  );
}
