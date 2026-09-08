import {
  LayoutDashboard,
  ClipboardList,
  MessageSquare,
  Image,
  Settings,
  HardDrive,
  Palette,
  ListTodo,
  Package,
  BarChart3,
  Plug,
  Workflow,
  Sparkle,
  FileSpreadsheet,
  BookOpenText,
  FileStack,
  FolderOutput,
  KeyRound,
  Layers,
  BookMarked,
  Users,
  BookText,
  ServerCog,
  WandSparkles,
} from "lucide-react";
import type { NavEntry } from "@/components/layout/nav";

/**
 * Navigation entries for the sidebar + breadcrumb (multi-page apps).
 * Add a page here to make it appear in the nav. Sections are grouped by
 * purpose and each section's items are kept alphabetical.
 */
export const routes: NavEntry[] = [
  { title: "Dashboard", url: "/", icon: LayoutDashboard },
  {
    label: "Productivity",
    items: [{ title: "To-Do", url: "/todo", icon: ListTodo }],
  },
  {
    label: "AI & Content",
    items: [
      { title: "AI Chat", url: "/chat", icon: MessageSquare },
      { title: "AI Text Tools", url: "/ai-text-tools", icon: WandSparkles },
      {
        title: "Document Pipeline",
        url: "/document-pipeline",
        icon: FileStack,
      },
      { title: "Knowledge Base", url: "/knowledge-base", icon: BookOpenText },
      { title: "Prompt Library", url: "/prompt-library", icon: BookText },
    ],
  },
  {
    label: "Files & Media",
    items: [
      { title: "Brand & Asset Library", url: "/brand-assets", icon: Layers },
      { title: "Export Center", url: "/export-center", icon: FolderOutput },
      { title: "Gallery", url: "/gallery", icon: Image },
      { title: "Import Wizard", url: "/import-wizard", icon: FileSpreadsheet },
      { title: "Inventory", url: "/inventory", icon: Package },
      { title: "Storage", url: "/storage", icon: HardDrive },
    ],
  },
  {
    label: "Insights & Data",
    items: [
      { title: "AI Insights", url: "/insights", icon: Sparkle },
      { title: "Saved Reports", url: "/saved-reports", icon: BookMarked },
    ],
  },
  {
    label: "Platform",
    items: [
      { title: "Connectors", url: "/connectors", icon: Plug },
      { title: "Secrets", url: "/secrets", icon: KeyRound },
      { title: "Workflows", url: "/workflows", icon: Workflow },
    ],
  },
  {
    label: "Monitoring & Logs",
    items: [
      { title: "Analytics", url: "/analytics", icon: BarChart3 },
      { title: "Changelog", url: "/changelog", icon: ClipboardList },
      { title: "System Monitor", url: "/system", icon: ServerCog },
    ],
  },
  {
    label: "Configuration",
    items: [
      { title: "Settings", url: "/settings", icon: Settings },
      { title: "Theme", url: "/theme", icon: Palette },
      {
        title: "User Roles & Permissions",
        url: "/roles-permissions",
        icon: Users,
      },
    ],
  },
];
