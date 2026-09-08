import { createFileRoute, useRouterState } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import {
  AlertTriangle,
  Check,
  Copy,
  Dice5,
  Download,
  History,
  Image as ImageIcon,
  Loader2,
  Lock,
  Palette,
  HelpCircle,
  Pipette,
  Plus,
  RotateCcw,
  Shuffle,
  Sparkles,
  Trash2,
  Upload,
  Wand2,
  X,
} from "lucide-react";
import { Bar, BarChart, Cell, ResponsiveContainer } from "recharts";
import { useCapabilities } from "@/hooks/useCapabilities";
import { routes as navEntries } from "@/components/layout/index";
import { flattenNavEntries } from "@/components/layout/nav";

const navRoutes = flattenNavEntries(navEntries);
import { cn } from "@/lib/utils";
import {
  BADGE_FILL_LABEL,
  BADGE_SHAPE_LABEL,
  CARD_BORDER_LABEL,
  CARD_FILL_LABEL,
  DEFAULT_CHART_COLORS,
  NOISE_TEXTURE_URI,
  checkThemeConsistency,
  computeBadgePreviewStyle,
  computeCardPreviewStyle,
  extractPaletteFromImage,
  type ActiveMap,
  type BackgroundType,
  type BadgeFill,
  type BadgeShape,
  type CardBorder,
  type CardFill,
  type CustomTheme,
  type ThemeScope,
  THEME_PRESETS,
  hexToRgba,
  hslToHex,
  resolveActiveTheme,
} from "@/lib/customTheme";
import { listBrandAssets } from "@/services/db/brandAssetService";
import { getStorageFileUrl } from "@/services/db/storageService";
import { getImageAsDataUrl } from "@/services/db/themeImagePaletteService";
import {
  clearActiveTheme,
  clearActiveThemes,
  createCustomTheme,
  deleteCustomTheme,
  listActiveThemes,
  listCustomThemes,
  backupCustomTheme,
  listThemeBackups,
  restoreThemeBackup,
  setActiveTheme,
} from "@/services/db/themeService";
import {
  exportTheme,
  importThemeFromUpload,
} from "@/services/db/themeExportService";
import {
  getThemeGalleryFileUrl,
  listThemeGalleryFiles,
  type ThemeGalleryFile,
} from "@/services/db/themeGalleryService";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Slider } from "@/components/ui/slider";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

export const Route = createFileRoute("/_protected/theme")({
  component: ThemePage,
});

const DIRECTIONS = [
  { value: "to right", label: "Left → Right" },
  { value: "to bottom right", label: "Top-left → Bottom-right" },
  { value: "to bottom", label: "Top → Bottom" },
  { value: "to bottom left", label: "Top-right → Bottom-left" },
  { value: "to left", label: "Right → Left" },
];

const BACKGROUND_TYPE_LABEL: Record<BackgroundType, string> = {
  solid: "Solid",
  gradient: "Gradient",
  image: "Image",
  gif: "GIF",
};

const LARGE_FILE_WARNING_BYTES = 3 * 1024 * 1024; // 3MB

function formatFileSize(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function nameFromFileName(fileName: string): string {
  const base = fileName.replace(/\.[^./]+$/, "");
  const words = base.replace(/[-_]+/g, " ").trim();
  if (!words) return "Gallery Theme";
  return words
    .split(" ")
    .map((w) => (w.length > 0 ? w[0].toUpperCase() + w.slice(1) : w))
    .join(" ");
}

function randomHex(): string {
  return `#${Math.floor(Math.random() * 0xffffff)
    .toString(16)
    .padStart(6, "0")}`;
}

const SURPRISE_ADJECTIVES = [
  "Cosmic",
  "Velvet",
  "Neon",
  "Midnight",
  "Electric",
  "Rustic",
  "Frosted",
  "Golden",
  "Stormy",
  "Dreamy",
  "Vivid",
  "Hazy",
  "Radiant",
  "Shadow",
  "Lush",
];

const SURPRISE_NOUNS = [
  "Horizon",
  "Nebula",
  "Orchard",
  "Lagoon",
  "Ember",
  "Canyon",
  "Meadow",
  "Aurora",
  "Comet",
  "Tundra",
  "Harbor",
  "Prairie",
  "Glacier",
  "Mirage",
  "Cascade",
];

function randomThemeName(): string {
  const adjective =
    SURPRISE_ADJECTIVES[Math.floor(Math.random() * SURPRISE_ADJECTIVES.length)];
  const noun =
    SURPRISE_NOUNS[Math.floor(Math.random() * SURPRISE_NOUNS.length)];
  const suffix = Math.floor(Math.random() * 900) + 100;
  return `${adjective} ${noun} ${suffix}`;
}

function buildBackground(
  type: BackgroundType,
  solidColor: string,
  gradStart: string,
  gradEnd: string,
  gradDirection: string,
  imageUrl: string,
): string {
  if (type === "solid") return solidColor;
  if (type === "gradient")
    return `linear-gradient(${gradDirection}, ${gradStart}, ${gradEnd})`;
  if (type === "image" || type === "gif")
    return imageUrl ? `url(${imageUrl})` : "";
  return "";
}

function ThemePage() {
  const queryClient = useQueryClient();
  const { data: caps } = useCapabilities();
  const s3Enabled = caps?.s3Enabled === true;
  const dbEnabled = caps?.databaseEnabled === true;
  const currentPath = useRouterState({ select: (s) => s.location.pathname });

  const { data: themes = [], isLoading: themesLoading } = useQuery({
    queryKey: ["customThemes"],
    queryFn: () => listCustomThemes(),
    enabled: dbEnabled,
    staleTime: 30_000,
  });
  const { data: activeRows = [] } = useQuery({
    queryKey: ["activeThemes"],
    queryFn: () => listActiveThemes(),
    enabled: dbEnabled,
    staleTime: 30_000,
  });

  const activeMap: ActiveMap = useMemo(() => {
    const map: ActiveMap = {};
    for (const row of activeRows) map[row.scopeKey] = { themeId: row.themeId };
    return map;
  }, [activeRows]);

  const activeTheme = useMemo(
    () => resolveActiveTheme(themes, activeMap, currentPath),
    [themes, activeMap, currentPath],
  );

  function invalidate() {
    queryClient.invalidateQueries({ queryKey: ["customThemes"] });
    queryClient.invalidateQueries({ queryKey: ["activeThemes"] });
  }

  const createMutation = useMutation({
    mutationFn: createCustomTheme,
    onSuccess: invalidate,
  });
  const deleteMutation = useMutation({
    mutationFn: deleteCustomTheme,
    onSuccess: invalidate,
  });
  const activateMutation = useMutation({
    mutationFn: setActiveTheme,
    onSuccess: invalidate,
  });
  const deactivateMutation = useMutation({
    mutationFn: clearActiveTheme,
    onSuccess: invalidate,
  });
  const clearAllMutation = useMutation({
    mutationFn: clearActiveThemes,
    onSuccess: invalidate,
  });

  const { data: backups = [] } = useQuery({
    queryKey: ["themeBackups"],
    queryFn: () => listThemeBackups(),
    enabled: dbEnabled,
    staleTime: 30_000,
  });
  const restoreBackupMutation = useMutation({
    mutationFn: restoreThemeBackup,
    onSuccess: () => {
      invalidate();
      queryClient.invalidateQueries({ queryKey: ["themeBackups"] });
      toast.success("Backup restored as a new theme.");
    },
  });
  const backupMutation = useMutation({
    mutationFn: backupCustomTheme,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["themeBackups"] });
      toast.success("Backed up — find it under Recently Removed if needed.");
    },
  });

  function handleBackupNow(theme: CustomTheme) {
    backupMutation.mutate({ data: theme.id });
  }

  const exportMutation = useMutation({ mutationFn: exportTheme });
  const importMutation = useMutation({
    mutationFn: importThemeFromUpload,
    onSuccess: (row) => {
      invalidate();
      toast.success(`Imported "${row.name}" — find it in Your Saved Themes.`);
    },
  });

  function handleExport(theme: CustomTheme) {
    exportMutation.mutate(
      { data: theme.id },
      {
        onSuccess: (res) => {
          window.open(res.url, "_blank");
          toast.success(
            'Saved to Storage → "Exported Theme" folder — download started.',
          );
        },
        onError: () => toast.error("Couldn't export this theme."),
      },
    );
  }

  function handleImportFile(file: File) {
    const fd = new FormData();
    fd.append("file", file);
    importMutation.mutate(
      { data: fd },
      { onError: () => toast.error("That file isn't a valid theme export.") },
    );
  }

  const [name, setName] = useState("");
  const [backgroundType, setBackgroundType] = useState<BackgroundType>("solid");
  const [solidColor, setSolidColor] = useState("#1e1b4b");
  const [gradStart, setGradStart] = useState("#4c1d95");
  const [gradEnd, setGradEnd] = useState("#0f172a");
  const [gradDirection, setGradDirection] = useState("to bottom right");
  const [imageUrl, setImageUrl] = useState("");
  // Relative S3 key when imageUrl came from the theme gallery — lets the
  // saved theme re-resolve a fresh presigned URL instead of relying on the
  // one baked in above, which expires after about an hour.
  const [galleryKey, setGalleryKey] = useState<string | null>(null);
  const [overlayColor, setOverlayColor] = useState("#000000");
  const [intensity, setIntensity] = useState(50);
  const [overlay, setOverlay] = useState(40);
  const [accentColors, setAccentColors] = useState<string[]>([]);
  const [noiseOpacity, setNoiseOpacity] = useState(0);
  const [scope, setScope] = useState<ThemeScope>("global");
  const [targetPage, setTargetPage] = useState(currentPath || "/");
  const [galleryOpen, setGalleryOpen] = useState(false);
  const [designForMeOpen, setDesignForMeOpen] = useState(false);
  const [designOptions, setDesignOptions] = useState({
    effects: true,
    badges: true,
    cards: true,
    charts: true,
    darkVariant: false,
    tone: "dark" as "dark" | "light",
  });
  const importFileInputRef = useRef<HTMLInputElement>(null);
  // Component-level accents: card corner radius (px) and shadow strength —
  // null keeps the app's default look for that dimension.
  const [radius, setRadius] = useState<number | null>(null);
  const [shadowStrength, setShadowStrength] = useState<number | null>(null);
  // Dark-mode auto-variant: only takes effect once `darkEnabled` is on;
  // `darkBackground`/`darkOverlayColor` mirror the light-mode solid color +
  // overlay so a system-dark visitor sees a deliberately darker look.
  const [darkEnabled, setDarkEnabled] = useState(false);
  const [darkSolidColor, setDarkSolidColor] = useState("#000000");
  const [darkOverlayColor, setDarkOverlayColor] = useState("#000000");
  // Badge ("bubble") design — null keeps every badge's normal per-variant
  // look (app default), same convention as radius/shadowStrength above.
  const [badgeShape, setBadgeShape] = useState<BadgeShape | null>(null);
  const [badgeFill, setBadgeFill] = useState<BadgeFill | null>(null);
  const [badgeBorder, setBadgeBorder] = useState(false);
  const [badgeOpacity, setBadgeOpacity] = useState(100);
  // Card design — same null-means-app-default convention.
  const [cardFill, setCardFill] = useState<CardFill | null>(null);
  const [cardBorder, setCardBorder] = useState<CardBorder | null>(null);
  const [cardOpacity, setCardOpacity] = useState(100);
  // Chart palette override — null-length means "app default" (existing
  // indigo `--chart-1..5` palette stays as-is).
  const [chartColors, setChartColors] = useState<string[]>([]);
  const [extractOpen, setExtractOpen] = useState(false);
  const [extracting, setExtracting] = useState(false);
  const [extractedPalette, setExtractedPalette] = useState<string[] | null>(
    null,
  );
  // Which image library the "Extract from Image" dialog is currently
  // browsing — Brand & Asset Library or the Theme Gallery (curated
  // background art already fetched above for the background-image picker).
  const [extractSource, setExtractSource] = useState<"brand" | "gallery">(
    "brand",
  );

  // "Simple" hides the more technical tabs (Badges, Cards, Charts, Scope,
  // Advanced) so a non-technical user only sees Background/Effects plus the
  // guided actions (Surprise Me / Design For Me / Extract from Image) —
  // everything a beginner needs without the full customization surface.
  // "Advanced" (the previous default, unchanged behavior) shows every tab.
  const [builderMode, setBuilderMode] = useState<"simple" | "advanced">(
    "simple",
  );
  const SIMPLE_MODE_TABS = ["background", "effects"] as const;
  const [activeBuilderTab, setActiveBuilderTab] = useState("background");

  const consistencyWarning = useMemo(
    () => checkThemeConsistency({ overlayColor, overlay, backgroundType }),
    [overlayColor, overlay, backgroundType],
  );

  const { data: galleryFiles, isLoading: galleryFilesLoading } = useQuery({
    queryKey: ["themeGalleryFiles"],
    queryFn: () => listThemeGalleryFiles(),
    enabled: s3Enabled,
    staleTime: 30_000,
  });

  const { data: brandAssets, isLoading: brandAssetsLoading } = useQuery({
    queryKey: ["brandAssetsForPalette"],
    queryFn: () => listBrandAssets(),
    enabled: extractOpen && dbEnabled && s3Enabled,
    staleTime: 30_000,
  });
  const brandAssetImages = useMemo(
    () =>
      (brandAssets ?? []).filter((a) => a.contentType?.startsWith("image/")),
    [brandAssets],
  );

  /** Loads the given Brand Asset image, extracts its dominant colors
   * client-side, and distributes them across the background gradient,
   * overlay tint, accent colors, and chart palette — a cohesive way to
   * pull an on-brand theme straight out of a logo/photo instead of picking
   * every color by hand. */
  async function handleExtractFromImage(asset: {
    fileKey: string;
    contentType: string | null;
    name: string;
  }) {
    setExtracting(true);
    setExtractedPalette(null);
    try {
      const { dataUrl } = await getImageAsDataUrl({
        data: {
          key: asset.fileKey,
          contentType: asset.contentType ?? "image/png",
        },
      });
      const palette = await extractPaletteFromImage(dataUrl, 5);
      setExtractedPalette(palette);
      setBackgroundType("gradient");
      setGradStart(palette[0]);
      setGradEnd(palette[Math.min(2, palette.length - 1)]);
      setOverlayColor(palette[Math.min(1, palette.length - 1)]);
      setAccentColors(palette.slice(0, 4));
      setChartColors(
        Array.from({ length: 5 }, (_, i) => palette[i % palette.length]),
      );
      if (!name.trim()) setName(`${asset.name} Palette`);
      toast.success(
        `Extracted ${palette.length} colors from "${asset.name}" — applied to Background, Effects, and Charts. Tweak and save below.`,
      );
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Couldn't extract a palette from this image.",
      );
    } finally {
      setExtracting(false);
    }
  }

  const background = buildBackground(
    backgroundType,
    solidColor,
    gradStart,
    gradEnd,
    gradDirection,
    imageUrl,
  );
  const blurPx = Math.round((intensity / 100) * 24);
  // Mirrors the floor `ThemeApplier` applies app-wide so the preview matches
  // what actually gets rendered once the theme is activated.
  const overlayAlpha = Math.max(0.35, overlay / 100);

  function applyPreset(preset: (typeof THEME_PRESETS)[number]) {
    setBackgroundType(preset.backgroundType);
    setSolidColor(preset.solidColor);
    setGradStart(preset.gradStart);
    setGradEnd(preset.gradEnd);
    setGradDirection(preset.gradDirection);
    setOverlayColor(preset.overlayColor);
    setIntensity(preset.intensity);
    setOverlay(preset.overlay);
    if (!name.trim()) setName(preset.name);
    toast.success(`Applied "${preset.name}" preset — tweak and save below.`);
  }

  function handleShuffle() {
    setGradStart(randomHex());
    setGradEnd(randomHex());
    setBackgroundType("gradient");
    toast.success("Shuffled gradient colors.");
  }

  function handleSurpriseMe() {
    setBackgroundType("gradient");
    setGradStart(randomHex());
    setGradEnd(randomHex());
    setGradDirection(
      DIRECTIONS[Math.floor(Math.random() * DIRECTIONS.length)].value,
    );
    setOverlayColor(randomHex());
    setIntensity(Math.floor(Math.random() * 70) + 20);
    setOverlay(Math.floor(Math.random() * 50) + 20);
    setAccentColors(
      Array.from({ length: Math.floor(Math.random() * 2) + 2 }, () =>
        randomHex(),
      ),
    );
    setNoiseOpacity(Math.floor(Math.random() * 60));

    // Randomize the dark-mode variant too, about half the time, so
    // Surprise Me themes exercise the manual Light/Dark toggle as well.
    const includeDarkVariant = Math.random() < 0.5;
    setDarkEnabled(includeDarkVariant);
    if (includeDarkVariant) {
      setDarkSolidColor(randomHex());
      setDarkOverlayColor(randomHex());
    }

    // Randomize badge design too, about half the time — the other half
    // leaves badges on "App default" so Surprise Me doesn't always force a
    // custom badge look on the user.
    const includeBadgeDesign = Math.random() < 0.5;
    if (includeBadgeDesign) {
      const shapes: BadgeShape[] = ["pill", "rounded", "square"];
      const fills: BadgeFill[] = ["solid", "soft", "outline"];
      setBadgeShape(shapes[Math.floor(Math.random() * shapes.length)]);
      setBadgeFill(fills[Math.floor(Math.random() * fills.length)]);
      setBadgeBorder(Math.random() < 0.5);
      setBadgeOpacity(Math.floor(Math.random() * 60) + 40);
    } else {
      setBadgeShape(null);
      setBadgeFill(null);
      setBadgeBorder(false);
      setBadgeOpacity(100);
    }

    // Randomize card design too, about half the time, same reasoning as
    // badges above.
    const includeCardDesign = Math.random() < 0.5;
    if (includeCardDesign) {
      const fills: CardFill[] = ["solid", "glass", "soft"];
      const borders: CardBorder[] = ["none", "subtle", "accent"];
      setCardFill(fills[Math.floor(Math.random() * fills.length)]);
      setCardBorder(borders[Math.floor(Math.random() * borders.length)]);
      setCardOpacity(Math.floor(Math.random() * 50) + 50);
    } else {
      setCardFill(null);
      setCardBorder(null);
      setCardOpacity(100);
    }

    // Randomize the chart palette too, about half the time, same reasoning
    // as badges/cards above.
    const includeChartDesign = Math.random() < 0.5;
    if (includeChartDesign) {
      setChartColors(Array.from({ length: 5 }, () => randomHex()));
    } else {
      setChartColors([]);
    }

    setName(randomThemeName());
    const extras = [
      includeDarkVariant && "a dark variant",
      includeBadgeDesign && "custom badges",
      includeCardDesign && "custom cards",
      includeChartDesign && "a chart palette",
    ].filter(Boolean);
    toast.success(
      extras.length > 0
        ? `Generated a fully random theme with ${extras.join(" and ")} — tweak and save below.`
        : "Generated a fully random theme — tweak and save below.",
    );
  }

  /** Generates a tasteful, cohesive theme — unlike "Surprise Me" (which
   * picks every color/setting independently at random and can clash),
   * this derives a whole palette from one random base hue using
   * color-harmony rules (analogous/complementary/triadic) plus fixed,
   * pleasant saturation/lightness/intensity ranges tuned by hand. Which
   * sections beyond the always-included Background get designed is up to
   * the `options` the user picked in the "Design For Me" dialog below —
   * an unchecked section is left exactly as it currently is in the
   * builder, not reset. */
  function handleDesignForMe(options: {
    effects: boolean;
    badges: boolean;
    cards: boolean;
    charts: boolean;
    darkVariant: boolean;
    tone: "dark" | "light";
  }) {
    const baseHue = Math.floor(Math.random() * 360);
    const harmonies = [
      { name: "analogous", offset: 30 },
      { name: "complementary", offset: 180 },
      { name: "triadic", offset: 120 },
    ] as const;
    const harmony = harmonies[Math.floor(Math.random() * harmonies.length)];
    const hue2 = baseHue + harmony.offset;
    const midHue = (baseHue + hue2) / 2;
    // Two hand-tuned lightness bands so the whole palette shifts together,
    // not just the background. "Lighter" stays well short of a true
    // light-mode background (this app's chrome/text assume a dark base) —
    // it just reads as a softer, less moody version of the same theme.
    const bgL = options.tone === "light" ? [42, 30, 18] : [22, 13, 8];
    const accentL = options.tone === "light" ? [68, 64, 60] : [62, 58, 55];

    // Background is always designed — rich gradient colors + a tinted
    // overlay, kept in a narrow hand-tuned lightness band per tone so the
    // result always stays a readable glass background.
    setBackgroundType("gradient");
    setGradStart(hslToHex(baseHue, 55, bgL[0]));
    setGradEnd(hslToHex(hue2, 60, bgL[1]));
    const directions = ["to bottom right", "to bottom", "to right"];
    setGradDirection(directions[Math.floor(Math.random() * directions.length)]);
    setOverlayColor(hslToHex(baseHue, 25, bgL[2]));
    // Vivid, saturated accents (much brighter than the background) so they
    // pop as highlights without a chance of landing on a muddy random hex.
    // Accent colors also feed the Badges tab's Soft/Solid fill colors, so
    // they're set here alongside the background rather than gated on
    // "Effects", matching how the Effects tab itself groups them.
    setAccentColors([
      hslToHex(baseHue, 75, accentL[0]),
      hslToHex(hue2, 70, accentL[1]),
      hslToHex(midHue, 65, accentL[2]),
    ]);

    if (options.effects) {
      setIntensity(45);
      setOverlay(35);
      setNoiseOpacity(12);
    }

    if (options.cards) {
      setRadius(14);
      setShadowStrength(45);
      setCardFill("glass");
      setCardBorder("subtle");
      setCardOpacity(88);
    }

    if (options.badges) {
      setBadgeShape("pill");
      setBadgeFill("soft");
      setBadgeBorder(false);
      setBadgeOpacity(92);
    }

    if (options.darkVariant) {
      setDarkEnabled(true);
      setDarkSolidColor(hslToHex(baseHue, 40, 10));
      setDarkOverlayColor(hslToHex(hue2, 30, 6));
    }

    if (options.charts) {
      // Five harmonious swatches spread evenly around the base hue, at a
      // consistent saturation/lightness band so the chart series read as a
      // deliberate palette rather than a random scatter of colors.
      setChartColors(
        Array.from({ length: 5 }, (_, i) =>
          hslToHex(baseHue + i * 35, 60, options.tone === "light" ? 62 : 52),
        ),
      );
    }

    setName(randomThemeName());
    const included = [
      options.effects && "Effects",
      options.badges && "Badges",
      options.cards && "Cards",
      options.charts && "a chart palette",
      options.darkVariant && "a dark variant",
    ].filter(Boolean);
    toast.success(
      included.length > 0
        ? `Designed a cohesive theme (Background + ${included.join(", ")}) — tweak and save below.`
        : "Designed a cohesive background theme — tweak and save below.",
    );
  }

  function addAccentColor() {
    if (accentColors.length >= 4) {
      toast.error("Up to 4 accent colors.");
      return;
    }
    setAccentColors([...accentColors, randomHex()]);
  }

  function updateAccentColor(index: number, value: string) {
    setAccentColors(accentColors.map((c, i) => (i === index ? value : c)));
  }

  function removeAccentColor(index: number) {
    setAccentColors(accentColors.filter((_, i) => i !== index));
  }

  function handleResetBuilder() {
    setName("");
    setBackgroundType("solid");
    setSolidColor("#1e1b4b");
    setGradStart("#4c1d95");
    setGradEnd("#0f172a");
    setGradDirection("to bottom right");
    setImageUrl("");
    setGalleryKey(null);
    setOverlayColor("#000000");
    setIntensity(50);
    setOverlay(40);
    setAccentColors([]);
    setNoiseOpacity(0);
    setScope("global");
    setTargetPage(currentPath || "/");
    setRadius(null);
    setShadowStrength(null);
    setDarkEnabled(false);
    setDarkSolidColor("#000000");
    setDarkOverlayColor("#000000");
    setBadgeShape(null);
    setBadgeFill(null);
    setBadgeBorder(false);
    setBadgeOpacity(100);
    setCardFill(null);
    setCardBorder(null);
    setCardOpacity(100);
    setChartColors([]);
    toast.success("Builder reset to defaults.");
  }

  function handleSave() {
    if (!name.trim()) {
      toast.error("Please enter a theme name.");
      return;
    }
    if ((backgroundType === "image" || backgroundType === "gif") && !imageUrl) {
      toast.error("Please provide an image URL or pick one from the gallery.");
      return;
    }
    createMutation.mutate(
      {
        data: {
          name: name.trim(),
          backgroundType,
          background,
          backgroundKey:
            backgroundType === "image" || backgroundType === "gif"
              ? galleryKey
              : null,
          intensity,
          overlay,
          overlayColor,
          accentColors,
          noiseOpacity,
          scope,
          scopeKey: scope === "global" ? "global" : targetPage,
          radius,
          shadowStrength,
          darkBackground: darkEnabled ? darkSolidColor : null,
          darkOverlayColor: darkEnabled ? darkOverlayColor : null,
          darkBackgroundKey: null,
          darkAccentColors: null,
          badgeShape,
          badgeFill,
          badgeBorder,
          badgeOpacity,
          cardFill,
          cardBorder,
          cardOpacity,
          chartColors: chartColors.length > 0 ? chartColors : null,
        },
      },
      {
        onSuccess: (row) => {
          toast.success(`"${row.name}" saved — see it in Your Saved Themes.`, {
            action: {
              label: "Activate now",
              onClick: () =>
                activateMutation.mutate(
                  { data: { scopeKey: row.scopeKey, themeId: row.id } },
                  {
                    onSuccess: () => toast.success(`"${row.name}" activated.`),
                  },
                ),
            },
          });
        },
      },
    );
  }

  function handleDuplicate(theme: CustomTheme) {
    createMutation.mutate(
      {
        data: {
          name: `${theme.name} (Copy)`,
          backgroundType: theme.backgroundType,
          background: theme.background,
          backgroundKey: theme.backgroundKey ?? null,
          intensity: theme.intensity,
          overlay: theme.overlay,
          overlayColor: theme.overlayColor,
          accentColors: theme.accentColors ?? [],
          noiseOpacity: theme.noiseOpacity,
          scope: theme.scope,
          scopeKey: theme.scopeKey,
          radius: theme.radius ?? null,
          shadowStrength: theme.shadowStrength ?? null,
          darkBackground: theme.darkBackground ?? null,
          darkBackgroundKey: theme.darkBackgroundKey ?? null,
          darkOverlayColor: theme.darkOverlayColor ?? null,
          darkAccentColors: theme.darkAccentColors ?? null,
          badgeShape: theme.badgeShape ?? null,
          badgeFill: theme.badgeFill ?? null,
          badgeBorder: theme.badgeBorder ?? null,
          badgeOpacity: theme.badgeOpacity ?? null,
          cardFill: theme.cardFill ?? null,
          cardBorder: theme.cardBorder ?? null,
          cardOpacity: theme.cardOpacity ?? null,
          chartColors: theme.chartColors ?? null,
        },
      },
      { onSuccess: () => toast.success(`Duplicated "${theme.name}".`) },
    );
  }

  function handleActivate(theme: CustomTheme) {
    activateMutation.mutate(
      { data: { scopeKey: theme.scopeKey, themeId: theme.id } },
      { onSuccess: () => toast.success(`"${theme.name}" activated.`) },
    );
  }

  function handleDeactivate(theme: CustomTheme) {
    if (activeMap[theme.scopeKey]?.themeId !== theme.id) return;
    deactivateMutation.mutate(
      { data: theme.scopeKey },
      { onSuccess: () => toast.success("Theme deactivated.") },
    );
  }

  function handleDelete(theme: CustomTheme) {
    deleteMutation.mutate(
      { data: theme.id },
      { onSuccess: () => toast.success("Theme deleted.") },
    );
  }

  function handleClearActive() {
    const keys = ["global", ...navRoutes.map((r) => r.url)];
    clearAllMutation.mutate(
      { data: keys },
      { onSuccess: () => toast.success("Active theme cleared.") },
    );
  }

  function handleUseGalleryFileInBuilder(file: ThemeGalleryFile, url: string) {
    const type: BackgroundType =
      file.contentType === "image/gif" ? "gif" : "image";
    setBackgroundType(type);
    setImageUrl(url);
    setGalleryKey(file.key);
    setNoiseOpacity(10);
    setIntensity(50);
    setOverlay(40);
    if (!name.trim()) setName(nameFromFileName(file.fileName));
    toast.success(
      `Loaded "${file.fileName}" into the builder — tweak and save below.`,
    );
  }

  async function handleSaveAndActivateGalleryFile(
    file: ThemeGalleryFile,
    url: string,
  ) {
    if (!dbEnabled) {
      toast.error("Database not configured — can't save this theme.");
      return;
    }
    const type: BackgroundType =
      file.contentType === "image/gif" ? "gif" : "image";
    try {
      const row = await createMutation.mutateAsync({
        data: {
          name: nameFromFileName(file.fileName),
          backgroundType: type,
          background: `url(${url})`,
          backgroundKey: file.key,
          intensity: 50,
          overlay: 40,
          overlayColor: "#000000",
          accentColors: [],
          noiseOpacity: 10,
          scope: "global",
          scopeKey: "global",
        },
      });
      await activateMutation.mutateAsync({
        data: { scopeKey: "global", themeId: row.id },
      });
      toast.success(`"${row.name}" saved and activated.`);
    } catch {
      toast.error("Could not save this theme.");
    }
  }

  const images = galleryFiles ?? [];

  // Active-first, then most recently created.
  const sortedThemes = [...themes].sort((a, b) => {
    const aActive = activeTheme?.id === a.id ? 1 : 0;
    const bActive = activeTheme?.id === b.id ? 1 : 0;
    if (aActive !== bActive) return bActive - aActive;
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  });

  const activeThemeScopeLabel = activeTheme
    ? activeTheme.scope === "global"
      ? "Global — every page"
      : (navRoutes.find((r) => r.url === activeTheme.scopeKey)?.title ??
        activeTheme.scopeKey)
    : null;

  return (
    <div className="p-6 space-y-6">
      {!dbEnabled && (
        <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
          Database not configured — saved themes can't be stored yet, so
          activated themes won't persist across reloads.
        </div>
      )}
      {activeTheme ? (
        <div className="flex items-center gap-2 rounded-lg border border-primary/40 bg-primary/10 p-3 text-sm">
          <Check className="h-4 w-4 shrink-0 text-primary" />
          <span>
            <strong className="font-medium">"{activeTheme.name}"</strong> is
            currently applied ({activeThemeScopeLabel}). Look for the{" "}
            <Lock className="inline h-3.5 w-3.5 align-[-2px]" /> theme indicator
            in the top-right corner of any page to confirm it's live.
          </span>
        </div>
      ) : (
        <div className="rounded-lg border bg-muted/40 p-3 text-sm text-muted-foreground">
          No theme is currently applied. Activate one below to see it live
          across the app.
        </div>
      )}
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="flex min-w-0 flex-col gap-1">
          <h1 className="text-2xl font-semibold tracking-tight">
            Theme Generator
          </h1>
          <p className="text-muted-foreground text-sm">
            Design a frosted-glass (glassmorphism) dark theme for this app —
            saved to the database so it stays applied everywhere.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 lg:shrink-0 lg:justify-end">
          <Button variant="outline" onClick={() => setDesignForMeOpen(true)}>
            <Wand2 className="h-4 w-4" />
            Design For Me
          </Button>
          <Button variant="outline" onClick={handleSurpriseMe}>
            <Dice5 className="h-4 w-4" />
            Surprise Me
          </Button>
          <Button
            variant="outline"
            disabled={!s3Enabled || !dbEnabled}
            title={
              !s3Enabled || !dbEnabled
                ? "Requires Database and Storage to browse Brand Assets"
                : undefined
            }
            onClick={() => {
              setExtractedPalette(null);
              setExtractOpen(true);
            }}
          >
            <Pipette className="h-4 w-4" />
            Extract from Image
          </Button>
          <Button
            variant="outline"
            disabled={!dbEnabled || !s3Enabled || importMutation.isPending}
            title={
              !s3Enabled
                ? "Storage not configured — can't import a theme file"
                : undefined
            }
            onClick={() => importFileInputRef.current?.click()}
          >
            <Upload className="h-4 w-4" />
            Import Theme
          </Button>
          <input
            ref={importFileInputRef}
            type="file"
            accept="application/json"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) handleImportFile(file);
              e.target.value = "";
            }}
          />
          <Button
            variant="outline"
            onClick={handleClearActive}
            disabled={!activeTheme}
          >
            <X className="h-4 w-4" />
            Clear Active Theme
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Sparkles className="h-4 w-4" />
            Step 1 — Start From a Template (optional)
          </CardTitle>
          <CardDescription>
            Pick a look below to load it into the builder, then fine-tune it in
            Step 2 — or skip this and build one from scratch.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="presets" className="w-full">
            <TabsList className="w-full">
              <TabsTrigger value="presets" className="flex-1">
                Color Presets
              </TabsTrigger>
              {s3Enabled && (
                <TabsTrigger value="gallery" className="flex-1">
                  Your Images &amp; GIFs
                </TabsTrigger>
              )}
            </TabsList>

            <TabsContent value="presets" className="pt-4">
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
                {THEME_PRESETS.map((preset) => (
                  <button
                    key={preset.name}
                    type="button"
                    onClick={() => applyPreset(preset)}
                    className="group flex flex-col gap-2 rounded-lg border p-2 text-left transition-colors hover:border-primary"
                  >
                    <div
                      className="h-12 w-full rounded-md"
                      style={{
                        background:
                          preset.backgroundType === "gradient"
                            ? `linear-gradient(${preset.gradDirection}, ${preset.gradStart}, ${preset.gradEnd})`
                            : preset.solidColor,
                      }}
                    />
                    <span className="text-xs font-medium leading-tight group-hover:text-primary">
                      {preset.name}
                    </span>
                  </button>
                ))}
              </div>
            </TabsContent>

            {s3Enabled && (
              <TabsContent value="gallery" className="pt-4">
                <p className="mb-3 text-xs text-muted-foreground">
                  Auto-generated from the images and GIFs in your theme asset
                  library — load one into the builder to tweak it, or save and
                  activate it right away.
                </p>
                {galleryFilesLoading ? (
                  <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
                    {Array.from({ length: 4 }).map((_, i) => (
                      // biome-ignore lint/suspicious/noArrayIndexKey: static skeleton grid
                      <Skeleton key={i} className="h-40 w-full" />
                    ))}
                  </div>
                ) : images.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    No images or GIFs found in the theme asset library yet.
                  </p>
                ) : (
                  <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
                    {images.map((file) => (
                      <GeneratedThemeCard
                        key={file.key}
                        file={file}
                        dbEnabled={dbEnabled}
                        saving={
                          createMutation.isPending || activateMutation.isPending
                        }
                        onUseInBuilder={handleUseGalleryFileInBuilder}
                        onSaveAndActivate={handleSaveAndActivateGalleryFile}
                      />
                    ))}
                  </div>
                )}
              </TabsContent>
            )}
          </Tabs>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader className="flex flex-row items-start justify-between gap-4">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Palette className="h-4 w-4" />
                Step 2 — Customize
              </CardTitle>
              <CardDescription>
                {builderMode === "simple"
                  ? "The essentials — pick a background and a few effects, then save below. Switch to Advanced for full control."
                  : "Adjust colors and effects, then save your theme below."}
              </CardDescription>
            </div>
            <ToggleGroup
              variant="outline"
              value={[builderMode]}
              onValueChange={(v) => {
                const next = (v as string[])[0];
                if (!next) return;
                setBuilderMode(next as "simple" | "advanced");
                if (
                  next === "simple" &&
                  !SIMPLE_MODE_TABS.includes(
                    activeBuilderTab as (typeof SIMPLE_MODE_TABS)[number],
                  )
                ) {
                  setActiveBuilderTab("background");
                }
              }}
              className="shrink-0"
            >
              <ToggleGroupItem value="simple">Simple</ToggleGroupItem>
              <ToggleGroupItem value="advanced">Advanced</ToggleGroupItem>
            </ToggleGroup>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="space-y-1.5">
              <Label htmlFor="theme-name">Name</Label>
              <Input
                id="theme-name"
                placeholder="Midnight Glass"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>

            <Tabs
              value={activeBuilderTab}
              onValueChange={(v) => v && setActiveBuilderTab(v as string)}
              className="w-full"
            >
              <TabsList className="w-full">
                <TabsTrigger value="background" className="flex-1">
                  Background
                </TabsTrigger>
                <TabsTrigger value="effects" className="flex-1">
                  Effects
                </TabsTrigger>
                {builderMode === "advanced" && (
                  <>
                    <TabsTrigger value="badges" className="flex-1">
                      Badges
                    </TabsTrigger>
                    <TabsTrigger value="cards" className="flex-1">
                      Cards
                    </TabsTrigger>
                    <TabsTrigger value="charts" className="flex-1">
                      Charts
                    </TabsTrigger>
                    <TabsTrigger value="scope" className="flex-1">
                      Scope
                    </TabsTrigger>
                    <TabsTrigger value="advanced" className="flex-1">
                      Advanced
                    </TabsTrigger>
                  </>
                )}
              </TabsList>

              <TabsContent value="background" className="space-y-4 pt-4">
                <div className="space-y-1.5">
                  <Label className="flex items-center gap-1.5">
                    Background Type
                    <HelpTip text="How the app's backdrop is filled: a flat color, a color gradient, a static image, or an animated GIF." />
                  </Label>
                  <ToggleGroup
                    variant="outline"
                    value={[backgroundType]}
                    onValueChange={(v) => {
                      const next = (v as string[])[0];
                      if (!next) return;
                      setBackgroundType(next as BackgroundType);
                    }}
                    className="flex-wrap justify-start"
                  >
                    <ToggleGroupItem value="solid">Solid Color</ToggleGroupItem>
                    <ToggleGroupItem value="gradient">Gradient</ToggleGroupItem>
                    <ToggleGroupItem value="image">Image</ToggleGroupItem>
                    <ToggleGroupItem value="gif">Animated GIF</ToggleGroupItem>
                  </ToggleGroup>
                </div>

                {backgroundType === "solid" && (
                  <div className="space-y-1.5">
                    <Label>Color</Label>
                    <div className="flex items-center gap-2">
                      <input
                        type="color"
                        value={solidColor}
                        onChange={(e) => setSolidColor(e.target.value)}
                        className="h-9 w-12 rounded-md border cursor-pointer bg-transparent p-1"
                      />
                      <Input
                        value={solidColor}
                        onChange={(e) => setSolidColor(e.target.value)}
                        className="font-mono"
                      />
                    </div>
                  </div>
                )}

                {backgroundType === "gradient" && (
                  <div className="space-y-3">
                    <div className="flex items-center gap-4">
                      <div className="space-y-1.5 flex-1">
                        <Label>Start</Label>
                        <div className="flex items-center gap-2">
                          <input
                            type="color"
                            value={gradStart}
                            onChange={(e) => setGradStart(e.target.value)}
                            className="h-9 w-12 rounded-md border cursor-pointer bg-transparent p-1"
                          />
                          <Input
                            value={gradStart}
                            onChange={(e) => setGradStart(e.target.value)}
                            className="font-mono"
                          />
                        </div>
                      </div>
                      <div className="space-y-1.5 flex-1">
                        <Label>End</Label>
                        <div className="flex items-center gap-2">
                          <input
                            type="color"
                            value={gradEnd}
                            onChange={(e) => setGradEnd(e.target.value)}
                            className="h-9 w-12 rounded-md border cursor-pointer bg-transparent p-1"
                          />
                          <Input
                            value={gradEnd}
                            onChange={(e) => setGradEnd(e.target.value)}
                            className="font-mono"
                          />
                        </div>
                      </div>
                    </div>
                    <div className="flex items-end gap-2">
                      <div className="space-y-1.5 flex-1">
                        <Label>Direction</Label>
                        <Select
                          value={gradDirection}
                          onValueChange={(v) => v && setGradDirection(v)}
                        >
                          <SelectTrigger className="w-full">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {DIRECTIONS.map((d) => (
                              <SelectItem key={d.value} value={d.value}>
                                {d.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <Button
                        type="button"
                        variant="outline"
                        onClick={handleShuffle}
                        title="Shuffle colors"
                      >
                        <Shuffle className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                )}

                {(backgroundType === "image" || backgroundType === "gif") && (
                  <div className="space-y-1.5">
                    <Label>
                      {backgroundType === "gif"
                        ? "Animated GIF URL"
                        : "Image URL"}
                    </Label>
                    <div className="flex gap-2">
                      <Input
                        placeholder={
                          backgroundType === "gif"
                            ? "https://example.com/anim.gif"
                            : "https://example.com/image.jpg"
                        }
                        value={imageUrl}
                        onChange={(e) => {
                          setImageUrl(e.target.value);
                          setGalleryKey(null);
                        }}
                      />
                      {s3Enabled && (
                        <Button
                          type="button"
                          variant="outline"
                          onClick={() => setGalleryOpen(true)}
                        >
                          <ImageIcon className="h-4 w-4" />
                          Gallery
                        </Button>
                      )}
                    </div>
                  </div>
                )}
              </TabsContent>

              <TabsContent value="effects" className="space-y-4 pt-4">
                <div className="space-y-1.5">
                  <Label>Blur Amount ({intensity}%)</Label>
                  <Slider
                    value={[intensity]}
                    onValueChange={(v) =>
                      setIntensity(Array.isArray(v) ? (v[0] ?? 0) : v)
                    }
                    min={0}
                    max={100}
                    step={1}
                  />
                  <p className="text-xs text-muted-foreground">
                    Higher = a softer, more "frosted glass" look behind app
                    panels and cards.
                  </p>
                </div>

                <div className="space-y-1.5">
                  <Label>Darkness ({overlay}%)</Label>
                  <Slider
                    value={[overlay]}
                    onValueChange={(v) =>
                      setOverlay(Array.isArray(v) ? (v[0] ?? 0) : v)
                    }
                    min={0}
                    max={100}
                    step={1}
                  />
                  <p className="text-xs text-muted-foreground">
                    Dims the background so light-colored text stays readable on
                    top of it.
                  </p>
                </div>

                <div className="space-y-1.5">
                  <Label>Overlay Tint</Label>
                  <div className="flex items-center gap-2">
                    <input
                      type="color"
                      value={overlayColor}
                      onChange={(e) => setOverlayColor(e.target.value)}
                      className="h-9 w-12 rounded-md border cursor-pointer bg-transparent p-1"
                    />
                    <Input
                      value={overlayColor}
                      onChange={(e) => setOverlayColor(e.target.value)}
                      className="font-mono"
                    />
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Tints the dark overlay — keep it black for neutral glass, or
                    match your background for a colored-glass look.
                  </p>
                </div>

                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <Label>Accent Colors</Label>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={addAccentColor}
                      disabled={accentColors.length >= 4}
                    >
                      <Plus className="h-3.5 w-3.5" />
                      Add
                    </Button>
                  </div>
                  {accentColors.length === 0 ? (
                    <p className="text-xs text-muted-foreground">
                      No accent colors yet — add one to highlight badges and
                      buttons when this theme is active.
                    </p>
                  ) : (
                    <div className="flex flex-col gap-2">
                      {accentColors.map((color, i) => (
                        <div key={i} className="flex items-center gap-2">
                          <input
                            type="color"
                            value={color}
                            onChange={(e) =>
                              updateAccentColor(i, e.target.value)
                            }
                            className="h-9 w-12 rounded-md border cursor-pointer bg-transparent p-1"
                          />
                          <Input
                            value={color}
                            onChange={(e) =>
                              updateAccentColor(i, e.target.value)
                            }
                            className="font-mono"
                          />
                          <Button
                            type="button"
                            size="icon"
                            variant="ghost"
                            onClick={() => removeAccentColor(i)}
                            aria-label="Remove accent color"
                          >
                            <X className="h-4 w-4" />
                          </Button>
                        </div>
                      ))}
                    </div>
                  )}
                  <p className="text-xs text-muted-foreground">
                    The first accent color becomes the app's live accent
                    (buttons/badges) whenever this theme is active.
                  </p>
                </div>

                <div className="space-y-1.5">
                  <Label>Noise / Texture Overlay ({noiseOpacity}%)</Label>
                  <Slider
                    value={[noiseOpacity]}
                    onValueChange={(v) =>
                      setNoiseOpacity(Array.isArray(v) ? (v[0] ?? 0) : v)
                    }
                    min={0}
                    max={100}
                    step={1}
                  />
                  <p className="text-xs text-muted-foreground">
                    Adds a subtle film-grain texture over the background for a
                    less flat look.
                  </p>
                </div>
              </TabsContent>

              <TabsContent value="badges" className="space-y-5 pt-4">
                <p className="text-xs text-muted-foreground">
                  Restyles every status/tag "bubble" (Badge) app-wide while this
                  theme is active — leave a field on "App default" to keep that
                  badge's normal look.
                </p>

                <div className="space-y-1.5">
                  <Label>Shape</Label>
                  <ToggleGroup
                    variant="outline"
                    value={badgeShape ? [badgeShape] : []}
                    onValueChange={(v) => {
                      const next = (v as string[])[0];
                      setBadgeShape(next ? (next as BadgeShape) : null);
                    }}
                    className="flex-wrap justify-start"
                  >
                    {(Object.keys(BADGE_SHAPE_LABEL) as BadgeShape[]).map(
                      (s) => (
                        <ToggleGroupItem key={s} value={s}>
                          {BADGE_SHAPE_LABEL[s]}
                        </ToggleGroupItem>
                      ),
                    )}
                  </ToggleGroup>
                </div>

                <div className="space-y-1.5">
                  <Label>Fill</Label>
                  <ToggleGroup
                    variant="outline"
                    value={badgeFill ? [badgeFill] : []}
                    onValueChange={(v) => {
                      const next = (v as string[])[0];
                      setBadgeFill(next ? (next as BadgeFill) : null);
                    }}
                    className="flex-wrap justify-start"
                  >
                    {(Object.keys(BADGE_FILL_LABEL) as BadgeFill[]).map((f) => (
                      <ToggleGroupItem key={f} value={f}>
                        {BADGE_FILL_LABEL[f]}
                      </ToggleGroupItem>
                    ))}
                  </ToggleGroup>
                  <p className="text-xs text-muted-foreground">
                    Solid/Soft use the theme's first accent color as the badge
                    color; Outline leaves the background transparent.
                  </p>
                </div>

                <div className="flex items-center justify-between">
                  <Label htmlFor="badge-border-toggle" className="font-normal">
                    Always show a border
                  </Label>
                  <Switch
                    id="badge-border-toggle"
                    checked={badgeBorder}
                    onCheckedChange={setBadgeBorder}
                  />
                </div>

                <div className="space-y-1.5">
                  <Label>Background Opacity ({badgeOpacity}%)</Label>
                  <Slider
                    value={[badgeOpacity]}
                    onValueChange={(v) =>
                      setBadgeOpacity(Array.isArray(v) ? (v[0] ?? 100) : v)
                    }
                    min={10}
                    max={100}
                    step={5}
                    disabled={badgeFill === "outline"}
                  />
                  <p className="text-xs text-muted-foreground">
                    {badgeFill === "outline"
                      ? "Outline badges have no fill, so opacity doesn't apply."
                      : "Lower this to make badge backgrounds more see-through."}
                  </p>
                </div>

                {(badgeShape || badgeFill || badgeBorder) && (
                  <div className="space-y-1.5">
                    <Label>Preview</Label>
                    <div className="flex flex-wrap items-center gap-2 rounded-lg border bg-muted/30 p-3">
                      {["Success", "Pending", "Failed"].map((label) => (
                        <span
                          key={label}
                          className="group/badge inline-flex h-5 w-fit shrink-0 items-center justify-center gap-1 overflow-hidden px-2 py-0.5 text-xs font-medium whitespace-nowrap"
                          style={computeBadgePreviewStyle({
                            shape: badgeShape ?? "pill",
                            fill: badgeFill ?? "solid",
                            border: badgeBorder,
                            opacity: badgeOpacity,
                            accentColor: accentColors[0] ?? "#6366f1",
                          })}
                        >
                          {label}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {badgeShape ||
                badgeFill ||
                badgeBorder ||
                badgeOpacity < 100 ? (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      setBadgeShape(null);
                      setBadgeFill(null);
                      setBadgeBorder(false);
                      setBadgeOpacity(100);
                    }}
                  >
                    Reset Badges to App Default
                  </Button>
                ) : null}
              </TabsContent>

              <TabsContent value="scope" className="space-y-4 pt-4">
                <div className="space-y-1.5">
                  <Label>Apply To</Label>
                  <RadioGroup
                    value={scope}
                    onValueChange={(v) => setScope(v as ThemeScope)}
                    className="flex flex-col gap-2"
                  >
                    <div className="flex items-center gap-2">
                      <RadioGroupItem value="global" id="scope-global" />
                      <Label htmlFor="scope-global" className="font-normal">
                        Global (every page)
                      </Label>
                    </div>
                    <div className="flex items-center gap-2">
                      <RadioGroupItem value="page" id="scope-page" />
                      <Label htmlFor="scope-page" className="font-normal">
                        A specific page
                      </Label>
                    </div>
                  </RadioGroup>
                </div>
                {scope === "page" && (
                  <div className="space-y-1.5">
                    <Label>Page</Label>
                    <Select
                      value={targetPage}
                      onValueChange={(v) => v && setTargetPage(v)}
                    >
                      <SelectTrigger className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {navRoutes.map((r) => (
                          <SelectItem key={r.url} value={r.url}>
                            {r.title}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
              </TabsContent>

              <TabsContent value="cards" className="space-y-5 pt-4">
                <p className="text-xs text-muted-foreground">
                  Restyles every card/dialog/popover app-wide while this theme
                  is active — leave a field on "App default" to keep the app's
                  normal look for that dimension.
                </p>

                <div className="space-y-1.5">
                  <Label>
                    Corner Radius
                    {radius === null ? " (app default)" : ` (${radius}px)`}
                  </Label>
                  <div className="flex items-center gap-2">
                    <Slider
                      value={[radius ?? 10]}
                      onValueChange={(v) =>
                        setRadius(Array.isArray(v) ? (v[0] ?? 10) : v)
                      }
                      min={0}
                      max={24}
                      step={1}
                      className="flex-1"
                    />
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => setRadius(null)}
                      disabled={radius === null}
                    >
                      Reset
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Rounds cards, dialogs and popovers to match this theme's
                    style — sharper for a technical look, rounder for a softer
                    one.
                  </p>
                </div>

                <div className="space-y-1.5">
                  <Label>
                    Shadow Intensity
                    {shadowStrength === null
                      ? " (app default)"
                      : ` (${shadowStrength}%)`}
                  </Label>
                  <div className="flex items-center gap-2">
                    <Slider
                      value={[shadowStrength ?? 35]}
                      onValueChange={(v) =>
                        setShadowStrength(Array.isArray(v) ? (v[0] ?? 35) : v)
                      }
                      min={0}
                      max={100}
                      step={1}
                      className="flex-1"
                    />
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => setShadowStrength(null)}
                      disabled={shadowStrength === null}
                    >
                      Reset
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    How strong the drop shadow under cards/dialogs is while this
                    theme is active.
                  </p>
                </div>

                <Separator />

                <div className="space-y-1.5">
                  <Label>Fill</Label>
                  <ToggleGroup
                    variant="outline"
                    value={cardFill ? [cardFill] : []}
                    onValueChange={(v) => {
                      const next = (v as string[])[0];
                      setCardFill(next ? (next as CardFill) : null);
                    }}
                    className="flex-wrap justify-start"
                  >
                    {(Object.keys(CARD_FILL_LABEL) as CardFill[]).map((f) => (
                      <ToggleGroupItem key={f} value={f}>
                        {CARD_FILL_LABEL[f]}
                      </ToggleGroupItem>
                    ))}
                  </ToggleGroup>
                  <p className="text-xs text-muted-foreground">
                    Solid = opaque card background; Glass = the existing frosted
                    blur look; Soft Tint washes cards with the theme's first
                    accent color. Leave unset to keep the app default.
                  </p>
                </div>

                <div className="space-y-1.5">
                  <Label>Border</Label>
                  <ToggleGroup
                    variant="outline"
                    value={cardBorder ? [cardBorder] : []}
                    onValueChange={(v) => {
                      const next = (v as string[])[0];
                      setCardBorder(next ? (next as CardBorder) : null);
                    }}
                    className="flex-wrap justify-start"
                  >
                    {(Object.keys(CARD_BORDER_LABEL) as CardBorder[]).map(
                      (b) => (
                        <ToggleGroupItem key={b} value={b}>
                          {CARD_BORDER_LABEL[b]}
                        </ToggleGroupItem>
                      ),
                    )}
                  </ToggleGroup>
                </div>

                <div className="space-y-1.5">
                  <Label>Background Opacity ({cardOpacity}%)</Label>
                  <Slider
                    value={[cardOpacity]}
                    onValueChange={(v) =>
                      setCardOpacity(Array.isArray(v) ? (v[0] ?? 100) : v)
                    }
                    min={10}
                    max={100}
                    step={5}
                    disabled={!cardFill}
                  />
                  <p className="text-xs text-muted-foreground">
                    {cardFill
                      ? "Lower this to make card backgrounds more see-through."
                      : "Pick a Fill above to enable transparency."}
                  </p>
                </div>

                {(cardFill || cardBorder) && (
                  <div className="space-y-1.5">
                    <Label>Preview</Label>
                    <div
                      className="rounded-lg border bg-muted/30 p-4"
                      style={{
                        background: "linear-gradient(135deg, #3730a3, #831843)",
                      }}
                    >
                      <div
                        className="flex flex-col gap-1 rounded-lg p-3 text-white shadow-sm"
                        style={computeCardPreviewStyle({
                          fill: cardFill ?? "glass",
                          border: cardBorder ?? "none",
                          opacity: cardOpacity,
                          accentColor: accentColors[0] ?? "#6366f1",
                        })}
                      >
                        <span className="text-sm font-medium">
                          Example Card
                        </span>
                        <span className="text-xs text-white/70">
                          This is how cards will look while this theme is
                          active.
                        </span>
                      </div>
                    </div>
                  </div>
                )}

                {cardFill || cardBorder || cardOpacity < 100 ? (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      setCardFill(null);
                      setCardBorder(null);
                      setCardOpacity(100);
                    }}
                  >
                    Reset Cards to App Default
                  </Button>
                ) : null}
              </TabsContent>

              <TabsContent value="charts" className="space-y-5 pt-4">
                <p className="text-xs text-muted-foreground">
                  Recolors every chart (bar, line, pie, area) app-wide while
                  this theme is active — leave on "App default" to keep the
                  app's normal indigo palette.
                </p>

                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <Label>Chart Palette</Label>
                    {chartColors.length > 0 ? (
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => setChartColors([])}
                      >
                        Reset to App Default
                      </Button>
                    ) : (
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() =>
                          setChartColors([...DEFAULT_CHART_COLORS])
                        }
                      >
                        Customize
                      </Button>
                    )}
                  </div>
                  {chartColors.length === 0 ? (
                    <p className="text-xs text-muted-foreground">
                      Charts currently use the app's default palette.
                    </p>
                  ) : (
                    <div className="flex flex-col gap-2">
                      {chartColors.map((color, i) => (
                        <div key={i} className="flex items-center gap-2">
                          <span className="w-16 shrink-0 text-xs text-muted-foreground">
                            Series {i + 1}
                          </span>
                          <input
                            type="color"
                            value={color}
                            onChange={(e) => {
                              const next = [...chartColors];
                              next[i] = e.target.value;
                              setChartColors(next);
                            }}
                            className="h-9 w-12 rounded-md border cursor-pointer bg-transparent p-1"
                          />
                          <Input
                            value={color}
                            onChange={(e) => {
                              const next = [...chartColors];
                              next[i] = e.target.value;
                              setChartColors(next);
                            }}
                            className="font-mono"
                          />
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {chartColors.length > 0 && (
                  <div className="space-y-1.5">
                    <Label>Preview</Label>
                    <div className="h-40 rounded-lg border bg-muted/30 p-3">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart
                          data={chartColors.map((c, i) => ({
                            name: `S${i + 1}`,
                            value: 100 - i * 12,
                            color: c,
                          }))}
                        >
                          <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                            {chartColors.map((c) => (
                              <Cell key={c} fill={c} />
                            ))}
                          </Bar>
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                )}
              </TabsContent>

              <TabsContent value="advanced" className="space-y-5 pt-4">
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="dark-variant-toggle">
                      Dark Mode Variant
                    </Label>
                    <Switch
                      id="dark-variant-toggle"
                      checked={darkEnabled}
                      onCheckedChange={setDarkEnabled}
                    />
                  </div>
                  <p className="text-xs text-muted-foreground">
                    When on, a Light/Dark switch appears next to the theme
                    indicator on every page (while this theme is active) —
                    visitors flip it manually to see the darker colors below
                    instead of the light-mode background/overlay set above. It
                    never switches on its own.
                  </p>
                  {darkEnabled && (
                    <div className="space-y-3 rounded-lg border bg-muted/30 p-3">
                      <div className="space-y-1.5">
                        <Label>Dark Background Color</Label>
                        <div className="flex items-center gap-2">
                          <input
                            type="color"
                            value={darkSolidColor}
                            onChange={(e) => setDarkSolidColor(e.target.value)}
                            className="h-9 w-12 rounded-md border cursor-pointer bg-transparent p-1"
                          />
                          <Input
                            value={darkSolidColor}
                            onChange={(e) => setDarkSolidColor(e.target.value)}
                            className="font-mono"
                          />
                        </div>
                      </div>
                      <div className="space-y-1.5">
                        <Label>Dark Overlay Color</Label>
                        <div className="flex items-center gap-2">
                          <input
                            type="color"
                            value={darkOverlayColor}
                            onChange={(e) =>
                              setDarkOverlayColor(e.target.value)
                            }
                            className="h-9 w-12 rounded-md border cursor-pointer bg-transparent p-1"
                          />
                          <Input
                            value={darkOverlayColor}
                            onChange={(e) =>
                              setDarkOverlayColor(e.target.value)
                            }
                            className="font-mono"
                          />
                        </div>
                      </div>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          setDarkSolidColor("#000000");
                          setDarkOverlayColor("#000000");
                        }}
                      >
                        Use Near-Black
                      </Button>
                    </div>
                  )}
                </div>

                {consistencyWarning && (
                  <div className="flex items-start gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-sm text-amber-700 dark:text-amber-400">
                    <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                    <span>{consistencyWarning}</span>
                  </div>
                )}
              </TabsContent>
            </Tabs>

            <div className="flex gap-2">
              <Button
                onClick={handleSave}
                className="flex-1"
                disabled={!dbEnabled || createMutation.isPending}
                title={
                  !dbEnabled
                    ? "Database not configured — themes can't be saved yet"
                    : undefined
                }
              >
                <Sparkles className="h-4 w-4" />
                Save Theme
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={handleResetBuilder}
                title="Reset builder to defaults"
                aria-label="Reset builder to defaults"
              >
                <RotateCcw className="h-4 w-4" />
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Live Preview</CardTitle>
            <CardDescription>
              What visitors will see once this theme is activated.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div
              className="relative h-64 w-full overflow-hidden rounded-lg border"
              style={{
                background:
                  backgroundType === "image" || backgroundType === "gif"
                    ? `${background} center/cover no-repeat`
                    : background || "#111827",
              }}
            >
              <div
                className="absolute inset-0"
                style={{
                  backgroundColor: hexToRgba(overlayColor, overlayAlpha),
                }}
              />
              {noiseOpacity > 0 && (
                <div
                  className="absolute inset-0 mix-blend-overlay"
                  style={{
                    backgroundImage: `url("${NOISE_TEXTURE_URI}")`,
                    opacity: Math.min(0.25, noiseOpacity / 100 / 4),
                  }}
                />
              )}
              <div
                className="absolute inset-0 flex flex-col items-center justify-center gap-3 p-6"
                style={{ backdropFilter: `blur(${blurPx}px)` }}
              >
                <div
                  className="w-full max-w-xs rounded-lg border border-white/20 bg-white/10 p-4 backdrop-blur-md"
                  style={
                    accentColors[0]
                      ? { borderColor: hexToRgba(accentColors[0], 0.6) }
                      : undefined
                  }
                >
                  <p className="text-sm font-medium text-white">Glass Card</p>
                  <p className="text-xs text-white/70">
                    Sample content over your frosted background.
                  </p>
                </div>
                <div className="w-full max-w-xs rounded-lg border border-white/20 bg-white/10 p-4 backdrop-blur-md">
                  <p className="text-sm font-medium text-white">Another Card</p>
                  <p className="text-xs text-white/70">
                    Blur {blurPx}px · Overlay {overlay}%
                  </p>
                </div>
                {accentColors.length > 0 && (
                  <div className="flex items-center gap-1.5">
                    {accentColors.map((c, i) => (
                      <span
                        key={i}
                        className="size-4 rounded-full border border-white/40"
                        style={{ backgroundColor: c }}
                      />
                    ))}
                  </div>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold tracking-tight">
            Step 3 — Your Saved Themes
          </h2>
          {themes.length > 0 && (
            <span className="text-xs text-muted-foreground">
              {themes.length} saved
            </span>
          )}
        </div>
        {dbEnabled && themesLoading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {Array.from({ length: 3 }).map((_, i) => (
              // biome-ignore lint/suspicious/noArrayIndexKey: static skeleton grid
              <Skeleton key={i} className="h-44 w-full" />
            ))}
          </div>
        ) : themes.length === 0 ? (
          <Empty>
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <Palette />
              </EmptyMedia>
              <EmptyTitle>No themes yet</EmptyTitle>
              <EmptyDescription>
                Build and save a theme above to see it here.
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {sortedThemes.map((theme) => {
              const isActive = activeTheme?.id === theme.id;
              const pageLabel =
                theme.scope === "global"
                  ? "Global"
                  : (navRoutes.find((r) => r.url === theme.scopeKey)?.title ??
                    theme.scopeKey);
              return (
                <Card
                  key={theme.id}
                  className={cn(
                    "overflow-hidden py-0",
                    isActive &&
                      "ring-2 ring-primary shadow-lg shadow-primary/30",
                  )}
                >
                  <div
                    className="relative h-24 w-full"
                    style={{
                      background:
                        theme.backgroundType === "image" ||
                        theme.backgroundType === "gif"
                          ? `${theme.background} center/cover no-repeat`
                          : theme.background,
                    }}
                  >
                    <Badge
                      variant="outline"
                      className="absolute top-2 left-2 bg-background/70 backdrop-blur-sm"
                    >
                      {BACKGROUND_TYPE_LABEL[theme.backgroundType]}
                    </Badge>
                    {(theme.accentColors?.length ?? 0) > 0 && (
                      <div className="absolute bottom-2 left-2 flex items-center gap-1">
                        {theme.accentColors?.map((c, i) => (
                          <span
                            key={i}
                            className="size-3 rounded-full border border-white/50"
                            style={{ backgroundColor: c }}
                          />
                        ))}
                      </div>
                    )}
                  </div>
                  <CardContent className="space-y-3 p-4">
                    <div className="flex items-center justify-between gap-2">
                      <p className="min-w-0 truncate font-medium">
                        {theme.name}
                      </p>
                      <div className="flex items-center gap-1.5 shrink-0">
                        {isActive && (
                          <Badge variant="default">
                            <Check className="h-3 w-3" />
                            Active
                          </Badge>
                        )}
                        <Badge variant="secondary">{pageLabel}</Badge>
                      </div>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      {isActive ? (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleDeactivate(theme)}
                        >
                          Deactivate
                        </Button>
                      ) : (
                        <Button size="sm" onClick={() => handleActivate(theme)}>
                          Activate
                        </Button>
                      )}
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleDuplicate(theme)}
                        aria-label="Duplicate theme"
                      >
                        <Copy className="h-4 w-4" />
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={!s3Enabled || exportMutation.isPending}
                        title={
                          !s3Enabled
                            ? "Storage not configured — can't export this theme"
                            : "Export as a shareable file"
                        }
                        onClick={() => handleExport(theme)}
                        aria-label="Export theme"
                      >
                        <Download className="h-4 w-4" />
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={!dbEnabled || backupMutation.isPending}
                        title="Back up this theme now"
                        onClick={() => handleBackupNow(theme)}
                        aria-label="Back up theme now"
                      >
                        <History className="h-4 w-4" />
                      </Button>
                      <AlertDialog>
                        <AlertDialogTrigger
                          render={
                            <Button
                              size="sm"
                              variant="destructive"
                              aria-label="Delete theme"
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          }
                        />
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Delete theme?</AlertDialogTitle>
                            <AlertDialogDescription>
                              This will delete "{theme.name}"
                              {isActive
                                ? " and turn it off everywhere it's currently applied"
                                : ""}
                              . This can't be undone unless you back it up first
                              with the "Back up theme now" button.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                            <AlertDialogAction
                              onClick={() => handleDelete(theme)}
                            >
                              Delete
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>

      {dbEnabled && backups.length > 0 && (
        <div className="space-y-3">
          <h2 className="flex items-center gap-2 text-lg font-semibold tracking-tight">
            <History className="h-4 w-4" />
            Your Backups
          </h2>
          <p className="text-sm text-muted-foreground">
            Backups you've made with "Back up theme now" — restore any of these
            back into Your Saved Themes.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {backups.map((backup) => (
              <Card key={backup.id} className="p-3">
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-medium truncate">{backup.name}</p>
                    <p className="text-xs text-muted-foreground truncate">
                      {backup.reason === "delete"
                        ? "Backed up before delete"
                        : backup.reason === "overwrite"
                          ? "Backed up before overwrite"
                          : "Backed up"}{" "}
                      {new Date(backup.createdAt).toLocaleString()}
                    </p>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    className="shrink-0"
                    onClick={() =>
                      restoreBackupMutation.mutate({ data: backup.id })
                    }
                    disabled={restoreBackupMutation.isPending}
                  >
                    Restore
                  </Button>
                </div>
              </Card>
            ))}
          </div>
        </div>
      )}

      <Dialog open={galleryOpen} onOpenChange={setGalleryOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Choose an Image</DialogTitle>
          </DialogHeader>
          {galleryFilesLoading ? (
            <div className="grid grid-cols-3 gap-3">
              {Array.from({ length: 6 }).map((_, i) => (
                // biome-ignore lint/suspicious/noArrayIndexKey: static skeleton grid
                <Skeleton key={i} className="aspect-square w-full" />
              ))}
            </div>
          ) : images.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No images found in the theme asset library yet.
            </p>
          ) : (
            <div className="grid grid-cols-3 gap-3 max-h-96 overflow-y-auto">
              {images.map((file) => (
                <GalleryPickThumbnail
                  key={file.key}
                  fileKey={file.key}
                  fileName={file.fileName}
                  onPick={(url) => {
                    setImageUrl(url);
                    setGalleryKey(file.key);
                    setBackgroundType(
                      file.contentType === "image/gif" ? "gif" : "image",
                    );
                    setGalleryOpen(false);
                  }}
                />
              ))}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {extractOpen && (
        <Dialog
          open
          onOpenChange={(next) => {
            if (!next) setExtractOpen(false);
          }}
        >
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Extract Palette from Image</DialogTitle>
            </DialogHeader>
            <div className="flex flex-col gap-4">
              <p className="text-sm text-muted-foreground">
                Pick an image from your Brand & Asset Library or the Theme
                Gallery — its dominant colors will fill in the background
                gradient, overlay tint, accent colors, and chart palette below.
              </p>

              <ToggleGroup
                variant="outline"
                value={[extractSource]}
                onValueChange={(v) => {
                  const next = (v as string[])[0];
                  if (next) setExtractSource(next as "brand" | "gallery");
                }}
                className="self-start"
              >
                <ToggleGroupItem value="brand">Brand Assets</ToggleGroupItem>
                <ToggleGroupItem value="gallery">Theme Gallery</ToggleGroupItem>
              </ToggleGroup>

              {!s3Enabled ? (
                <p className="text-sm text-muted-foreground">
                  Storage is required to browse images.
                </p>
              ) : extractSource === "brand" ? (
                !dbEnabled ? (
                  <p className="text-sm text-muted-foreground">
                    Database is required to browse Brand Assets.
                  </p>
                ) : brandAssetsLoading ? (
                  <div className="grid grid-cols-3 gap-3">
                    {[1, 2, 3].map((i) => (
                      <Skeleton key={i} className="aspect-square w-full" />
                    ))}
                  </div>
                ) : brandAssetImages.length === 0 ? (
                  <Empty>
                    <EmptyHeader>
                      <EmptyMedia variant="icon">
                        <ImageIcon />
                      </EmptyMedia>
                      <EmptyTitle>No image assets yet</EmptyTitle>
                      <EmptyDescription>
                        Upload a logo or photo on the Brand & Asset Library page
                        first.
                      </EmptyDescription>
                    </EmptyHeader>
                  </Empty>
                ) : (
                  <div className="grid grid-cols-3 gap-3 max-h-72 overflow-y-auto">
                    {brandAssetImages.map((asset) => (
                      <button
                        type="button"
                        key={asset.id}
                        disabled={extracting}
                        onClick={() =>
                          handleExtractFromImage({
                            fileKey: asset.fileKey,
                            contentType: asset.contentType,
                            name: asset.name,
                          })
                        }
                        className="flex flex-col items-center gap-1 rounded-md border p-2 text-xs hover:border-primary/60 disabled:opacity-50"
                      >
                        <BrandAssetThumb
                          fileKey={asset.fileKey}
                          contentType={asset.contentType}
                        />
                        <span className="truncate w-full text-center">
                          {asset.name}
                        </span>
                      </button>
                    ))}
                  </div>
                )
              ) : galleryFilesLoading ? (
                <div className="grid grid-cols-3 gap-3">
                  {[1, 2, 3].map((i) => (
                    <Skeleton key={i} className="aspect-square w-full" />
                  ))}
                </div>
              ) : (galleryFiles ?? []).length === 0 ? (
                <Empty>
                  <EmptyHeader>
                    <EmptyMedia variant="icon">
                      <ImageIcon />
                    </EmptyMedia>
                    <EmptyTitle>No gallery images found</EmptyTitle>
                  </EmptyHeader>
                </Empty>
              ) : (
                <div className="grid grid-cols-3 gap-3 max-h-72 overflow-y-auto">
                  {(galleryFiles ?? []).map((file) => (
                    <button
                      type="button"
                      key={file.key}
                      disabled={extracting}
                      onClick={() =>
                        handleExtractFromImage({
                          fileKey: file.key,
                          contentType: file.contentType,
                          name: file.fileName,
                        })
                      }
                      className="flex flex-col items-center gap-1 rounded-md border p-2 text-xs hover:border-primary/60 disabled:opacity-50"
                    >
                      <BrandAssetThumb
                        fileKey={file.key}
                        contentType={file.contentType}
                      />
                      <span className="truncate w-full text-center">
                        {file.fileName}
                      </span>
                    </button>
                  ))}
                </div>
              )}

              {extracting && (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Extracting colors...
                </div>
              )}
              {extractedPalette && (
                <div className="space-y-1.5">
                  <Label>Extracted Colors</Label>
                  <p className="text-xs text-muted-foreground">
                    {extractedPalette.length} unique color
                    {extractedPalette.length === 1 ? "" : "s"} pulled from the
                    image — applied to the background, overlay, accents, and
                    Chart Palette below.
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {extractedPalette.map((c) => (
                      <div
                        key={c}
                        className="h-8 w-8 rounded-md border"
                        style={{ backgroundColor: c }}
                        title={c}
                      />
                    ))}
                  </div>
                </div>
              )}

              <div className="mt-2 flex justify-end gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setExtractOpen(false)}
                >
                  Close
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      )}

      {designForMeOpen && (
        <Dialog
          open
          onOpenChange={(next) => {
            if (!next) setDesignForMeOpen(false);
          }}
        >
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Design For Me</DialogTitle>
            </DialogHeader>
            <div className="flex flex-col gap-4">
              <p className="text-sm text-muted-foreground">
                Generates a cohesive color palette for the Background (always
                included). Choose which other sections should get matching,
                designed-for-you styling too — leave a section unchecked to keep
                whatever it's currently set to.
              </p>
              <div className="flex flex-col gap-3">
                <div className="flex items-center gap-2">
                  <Checkbox checked disabled onCheckedChange={() => {}} />
                  <Label className="font-normal text-muted-foreground">
                    Background (always included)
                  </Label>
                </div>
                <div className="flex items-center gap-2">
                  <Checkbox
                    id="design-effects"
                    checked={designOptions.effects}
                    onCheckedChange={(checked) =>
                      setDesignOptions((o) => ({
                        ...o,
                        effects: checked === true,
                      }))
                    }
                  />
                  <Label htmlFor="design-effects" className="font-normal">
                    Effects (blur, darkness, noise)
                  </Label>
                </div>
                <div className="flex items-center gap-2">
                  <Checkbox
                    id="design-badges"
                    checked={designOptions.badges}
                    onCheckedChange={(checked) =>
                      setDesignOptions((o) => ({
                        ...o,
                        badges: checked === true,
                      }))
                    }
                  />
                  <Label htmlFor="design-badges" className="font-normal">
                    Badges
                  </Label>
                </div>
                <div className="flex items-center gap-2">
                  <Checkbox
                    id="design-cards"
                    checked={designOptions.cards}
                    onCheckedChange={(checked) =>
                      setDesignOptions((o) => ({
                        ...o,
                        cards: checked === true,
                      }))
                    }
                  />
                  <Label htmlFor="design-cards" className="font-normal">
                    Cards
                  </Label>
                </div>
                <div className="flex items-center gap-2">
                  <Checkbox
                    id="design-charts"
                    checked={designOptions.charts}
                    onCheckedChange={(checked) =>
                      setDesignOptions((o) => ({
                        ...o,
                        charts: checked === true,
                      }))
                    }
                  />
                  <Label htmlFor="design-charts" className="font-normal">
                    Charts
                  </Label>
                </div>
                <div className="flex items-center gap-2">
                  <Checkbox
                    id="design-dark-variant"
                    checked={designOptions.darkVariant}
                    onCheckedChange={(checked) =>
                      setDesignOptions((o) => ({
                        ...o,
                        darkVariant: checked === true,
                      }))
                    }
                  />
                  <Label htmlFor="design-dark-variant" className="font-normal">
                    Advanced: Dark Mode Variant
                  </Label>
                </div>
              </div>

              <Separator />

              <div className="space-y-1.5">
                <Label>Tone</Label>
                <ToggleGroup
                  variant="outline"
                  value={[designOptions.tone]}
                  onValueChange={(v) => {
                    const next = (v as string[])[0];
                    if (next === "dark" || next === "light") {
                      setDesignOptions((o) => ({ ...o, tone: next }));
                    }
                  }}
                  className="flex-wrap justify-start"
                >
                  <ToggleGroupItem value="dark">Darker</ToggleGroupItem>
                  <ToggleGroupItem value="light">Lighter</ToggleGroupItem>
                </ToggleGroup>
                <p className="text-xs text-muted-foreground">
                  Shifts the whole generated palette moodier/deep (Darker) or
                  softer/brighter (Lighter) — this app's theme is always a dark
                  glass background either way, just to a different degree.
                </p>
              </div>

              <div className="mt-2 flex justify-end gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setDesignForMeOpen(false)}
                >
                  Cancel
                </Button>
                <Button
                  type="button"
                  onClick={() => {
                    setDesignForMeOpen(false);
                    handleDesignForMe(designOptions);
                  }}
                >
                  <Wand2 className="h-4 w-4" />
                  Generate
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}

function GalleryPickThumbnail({
  fileKey,
  fileName,
  onPick,
}: {
  fileKey: string;
  fileName: string;
  onPick: (url: string) => void;
}) {
  const { data } = useQuery({
    queryKey: ["themeGalleryFileUrl", fileKey],
    queryFn: () => getThemeGalleryFileUrl({ data: fileKey }),
    staleTime: 1000 * 60 * 55,
  });

  return (
    <button
      type="button"
      onClick={() => data?.url && onPick(data.url)}
      className="aspect-square overflow-hidden rounded-md border"
    >
      {data?.url ? (
        <img
          src={data.url}
          alt={fileName}
          loading="lazy"
          decoding="async"
          className="h-full w-full object-cover"
        />
      ) : (
        <Skeleton className="h-full w-full rounded-none" />
      )}
    </button>
  );
}

/** A small "?" icon that shows a one-line plain-language explanation on
 * hover/focus — used next to the more jargon-y builder controls so a
 * non-technical user can learn what a setting does without leaving the
 * page or guessing. */
function HelpTip({ text }: { text: string }) {
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <button
            type="button"
            className="inline-flex items-center justify-center text-muted-foreground hover:text-foreground"
            aria-label="What does this do?"
          >
            <HelpCircle className="size-3.5" />
          </button>
        }
      />
      <TooltipContent>{text}</TooltipContent>
    </Tooltip>
  );
}

function BrandAssetThumb({
  fileKey,
  contentType,
}: {
  fileKey: string;
  contentType: string | null;
}) {
  const { data } = useQuery({
    queryKey: ["brandAssetPaletteUrl", fileKey],
    queryFn: () => getStorageFileUrl({ data: fileKey }),
    staleTime: 1000 * 60 * 55,
  });

  return (
    <div className="aspect-square w-full overflow-hidden rounded-md border bg-muted/30">
      {data?.url ? (
        <img
          src={data.url}
          alt=""
          loading="lazy"
          decoding="async"
          className="h-full w-full object-contain"
        />
      ) : (
        <Skeleton className="h-full w-full rounded-none" />
      )}
      {!contentType?.startsWith("image/") && null}
    </div>
  );
}

function GeneratedThemeCard({
  file,
  dbEnabled,
  saving,
  onUseInBuilder,
  onSaveAndActivate,
}: {
  file: ThemeGalleryFile;
  dbEnabled: boolean;
  saving: boolean;
  onUseInBuilder: (file: ThemeGalleryFile, url: string) => void;
  onSaveAndActivate: (file: ThemeGalleryFile, url: string) => void;
}) {
  const { data } = useQuery({
    queryKey: ["themeGalleryFileUrl", file.key],
    queryFn: () => getThemeGalleryFileUrl({ data: file.key }),
    staleTime: 1000 * 60 * 55,
  });
  const isGif = file.contentType === "image/gif";

  return (
    <div className="flex flex-col gap-2 rounded-lg border overflow-hidden">
      <div
        className="relative h-28 w-full"
        style={{
          background: data?.url
            ? `url(${data.url}) center/cover no-repeat`
            : undefined,
        }}
      >
        {!data?.url && <Skeleton className="h-full w-full rounded-none" />}
        <div className="absolute inset-0 bg-black/25" />
        <Badge
          variant="outline"
          className="absolute top-2 left-2 bg-background/70 backdrop-blur-sm"
        >
          {isGif ? "GIF" : "Image"}
        </Badge>
      </div>
      <div className="flex flex-col gap-2 p-2">
        <div className="flex items-center justify-between gap-2">
          <p className="truncate text-xs font-medium" title={file.fileName}>
            {nameFromFileName(file.fileName)}
          </p>
          <Badge
            variant={
              file.size > LARGE_FILE_WARNING_BYTES ? "destructive" : "outline"
            }
            className="shrink-0 text-[10px]"
          >
            {formatFileSize(file.size)}
          </Badge>
        </div>
        {file.size > LARGE_FILE_WARNING_BYTES && (
          <p className="text-[11px] text-muted-foreground">
            Large file — may slow down page loads when applied app-wide.
          </p>
        )}
        <div className="flex gap-1.5">
          <Button
            size="sm"
            variant="outline"
            className="flex-1"
            disabled={!data?.url}
            onClick={() => data?.url && onUseInBuilder(file, data.url)}
          >
            Use in Builder
          </Button>
          <Button
            size="sm"
            className="flex-1"
            disabled={!data?.url || !dbEnabled || saving}
            onClick={() => data?.url && onSaveAndActivate(file, data.url)}
          >
            Save &amp; Activate
          </Button>
        </div>
      </div>
    </div>
  );
}
