import {
  pgTable,
  text,
  integer,
  boolean,
  timestamp,
  index,
  type AnyPgColumn,
} from "drizzle-orm/pg-core";

export const todos = pgTable("todos", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  title: text("title").notNull(),
  description: text("description"),
  solution: text("solution"),
  status: text("status")
    .$type<"pending" | "in_progress" | "done" | "cancelled">()
    .notNull()
    .default("pending"),
  priority: text("priority")
    .$type<"low" | "medium" | "high">()
    .notNull()
    .default("medium"),
  dueDate: timestamp("due_date"),
  changelogEntryId: integer("changelog_entry_id").references(
    () => changelogEntries.id,
    { onDelete: "set null" },
  ),
  // Self-reference: when set, this task is a sub-issue of another task
  // (e.g. a per-page improvement nested under a parent "section" issue).
  parentId: integer("parent_id").references((): AnyPgColumn => todos.id, {
    onDelete: "cascade",
  }),
  // Set automatically when status transitions to "done", cleared if moved
  // back to pending/in_progress. Lets the To-Do page show/filter by when a
  // task was actually finished, separate from when it was created.
  completedAt: timestamp("completed_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const errorLogs = pgTable("error_logs", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  message: text("message").notNull(),
  severity: text("severity")
    .$type<"info" | "warning" | "error" | "critical">()
    .notNull()
    .default("error"),
  source: text("source"),
  stackTrace: text("stack_trace"),
  resolved: boolean("resolved").notNull().default(false),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const auditLogs = pgTable("audit_logs", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  status: text("status")
    .$type<"success" | "failure">()
    .notNull()
    .default("success"),
  action: text("action").notNull(),
  resource: text("resource"),
  page: text("page"),
  category: text("category").notNull().default("general"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const changelogEntries = pgTable("changelog_entries", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  version: text("version").notNull(),
  type: text("type")
    .$type<"feature" | "fix" | "improvement" | "breaking" | "security">()
    .notNull()
    .default("feature"),
  title: text("title").notNull(),
  description: text("description"),
  releaseDate: timestamp("release_date").notNull().defaultNow(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const chatConversations = pgTable("chat_conversations", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  title: text("title").notNull().default("New Chat"),
  connectorId: integer("connector_id"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const chatMessages = pgTable(
  "chat_messages",
  {
    id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
    conversationId: integer("conversation_id")
      .notNull()
      .references(() => chatConversations.id, { onDelete: "cascade" }),
    role: text("role").$type<"user" | "assistant">().notNull(),
    content: text("content").notNull(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => [
    index("chat_messages_conversation_id_idx").on(table.conversationId),
  ],
);

export const storageFiles = pgTable("storage_files", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  key: text("key").notNull(),
  fileName: text("file_name").notNull(),
  folder: text("folder")
    .$type<"uploads" | "exports" | "assets">()
    .notNull()
    .default("uploads"),
  contentType: text("content_type"),
  size: integer("size").notNull().default(0),
  tags: text("tags").array(),
  extractedText: text("extracted_text"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const inventoryItems = pgTable("inventory_items", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  name: text("name").notNull(),
  description: text("description"),
  sku: text("sku").notNull().unique(),
  category: text("category").notNull(),
  quantity: integer("quantity").notNull().default(0),
  price: text("price"),
  photoKey: text("photo_key"),
  status: text("status")
    .$type<"active" | "inactive" | "discontinued">()
    .notNull()
    .default("active"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export type Todo = typeof todos.$inferSelect;
export type NewTodo = typeof todos.$inferInsert;
export type ErrorLog = typeof errorLogs.$inferSelect;
export type NewErrorLog = typeof errorLogs.$inferInsert;
export type AuditLog = typeof auditLogs.$inferSelect;
export type NewAuditLog = typeof auditLogs.$inferInsert;
export type ChangelogEntry = typeof changelogEntries.$inferSelect;
export type NewChangelogEntry = typeof changelogEntries.$inferInsert;
export type ChatConversation = typeof chatConversations.$inferSelect;
export type NewChatConversation = typeof chatConversations.$inferInsert;
export type ChatMessage = typeof chatMessages.$inferSelect;
export type NewChatMessage = typeof chatMessages.$inferInsert;
export const contentCalendarItems = pgTable(
  "content_calendar_items",
  {
    id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
    title: text("title").notNull(),
    description: text("description"),
    channel: text("channel")
      .$type<"blog" | "social" | "email" | "video" | "other">()
      .notNull()
      .default("social"),
    status: text("status")
      .$type<"draft" | "scheduled" | "published">()
      .notNull()
      .default("draft"),
    scheduledDate: timestamp("scheduled_date").notNull(),
    publishedAt: timestamp("published_at"),
    storageFileId: integer("storage_file_id").references(
      () => storageFiles.id,
      { onDelete: "set null" },
    ),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => [
    index("content_calendar_items_storage_file_id_idx").on(table.storageFileId),
  ],
);

export const brandAssets = pgTable(
  "brand_assets",
  {
    id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
    name: text("name").notNull(),
    category: text("category")
      .$type<
        "logo" | "icon" | "color_palette" | "font" | "template" | "other"
      >()
      .notNull()
      .default("other"),
    version: text("version"),
    tags: text("tags").array(),
    notes: text("notes"),
    storageFileId: integer("storage_file_id")
      .notNull()
      .references(() => storageFiles.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => [
    index("brand_assets_storage_file_id_idx").on(table.storageFileId),
  ],
);

export type StorageFile = typeof storageFiles.$inferSelect;
export type NewStorageFile = typeof storageFiles.$inferInsert;
export type InventoryItem = typeof inventoryItems.$inferSelect;
export type NewInventoryItem = typeof inventoryItems.$inferInsert;
export type ContentCalendarItem = typeof contentCalendarItems.$inferSelect;
export type NewContentCalendarItem = typeof contentCalendarItems.$inferInsert;
export type BrandAsset = typeof brandAssets.$inferSelect;
export type NewBrandAsset = typeof brandAssets.$inferInsert;

/** Singleton row (always id=1) tracking which Brand & Asset Library logo the
 * app is currently using, e.g. in the sidebar header. */
export const appBranding = pgTable("app_branding", {
  id: integer("id").primaryKey(),
  activeLogoAssetId: integer("active_logo_asset_id").references(
    () => brandAssets.id,
    { onDelete: "set null" },
  ),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export type AppBranding = typeof appBranding.$inferSelect;
export type NewAppBranding = typeof appBranding.$inferInsert;

export const customThemes = pgTable("custom_themes", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  name: text("name").notNull(),
  backgroundType: text("background_type")
    .$type<"solid" | "gradient" | "image" | "gif">()
    .notNull()
    .default("solid"),
  background: text("background").notNull(),
  /** For image/gif backgrounds sourced from the theme asset gallery: the
   * relative S3 key (e.g. "themes/neon-techno-grid.gif"). Presigned URLs
   * expire after ~1h, so `background` alone isn't reusable long-term —
   * renderers re-resolve a fresh URL from this key instead of trusting the
   * (possibly stale) URL baked into `background`. Null for solid/gradient
   * backgrounds or a manually pasted external image URL. */
  backgroundKey: text("background_key"),
  intensity: integer("intensity").notNull().default(50),
  overlay: integer("overlay").notNull().default(40),
  overlayColor: text("overlay_color").notNull().default("#000000"),
  /** Up to a few accent hex colors used for highlights/badges/preview chips. */
  accentColors: text("accent_colors").array(),
  /** Subtle grain/texture overlay strength, 0-100. */
  noiseOpacity: integer("noise_opacity").notNull().default(0),
  scope: text("scope").$type<"global" | "page">().notNull().default("global"),
  scopeKey: text("scope_key").notNull().default("global"),
  /** Card corner radius in px, applied live via `--radius`. Null = use the
   * app default. */
  radius: integer("radius"),
  /** Card/dialog/popover shadow strength, 0-100. Null = use the app default. */
  shadowStrength: integer("shadow_strength"),
  /** Dark-mode overrides — when null, the theme is single-mode and always
   * renders with the light-mode fields above regardless of system color
   * scheme. When set, `ThemeApplier` swaps to these while
   * `prefers-color-scheme: dark` is active. */
  darkBackground: text("dark_background"),
  darkBackgroundKey: text("dark_background_key"),
  darkOverlayColor: text("dark_overlay_color"),
  darkAccentColors: text("dark_accent_colors").array(),
  /** Badge ("bubble") design overrides — all null means every badge keeps
   * its normal per-variant look (app default), matching the null = "app
   * default" convention already used by `radius`/`shadowStrength` above. */
  badgeShape: text("badge_shape").$type<"pill" | "rounded" | "square">(),
  badgeFill: text("badge_fill").$type<"solid" | "soft" | "outline">(),
  badgeBorder: boolean("badge_border"),
  /** Badge background opacity, 0-100. Null = fully opaque (app default). */
  badgeOpacity: integer("badge_opacity"),
  /** Card design overrides — all null means cards keep the app/theme's
   * normal look (the existing frosted-glass chrome when a theme is active).
   * Same null-means-default convention as the badge fields above. */
  cardFill: text("card_fill").$type<"solid" | "glass" | "soft">(),
  cardBorder: text("card_border").$type<"none" | "subtle" | "accent">(),
  /** Card background opacity, 0-100. Only applied once `cardFill` is set. */
  cardOpacity: integer("card_opacity"),
  /** Up to 5 hex colors overriding the app's Recharts `--chart-1..5`
   * palette while this theme is active. Null/empty = charts keep the app
   * default indigo palette. */
  chartColors: text("chart_colors").array(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const activeThemes = pgTable("active_themes", {
  scopeKey: text("scope_key").primaryKey(),
  themeId: integer("theme_id")
    .notNull()
    .references(() => customThemes.id, { onDelete: "cascade" }),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

/** Snapshot of a theme's full field set, written automatically right before
 * it's overwritten or deleted, so a user who loses a theme by accident (or
 * just wants to go back a version) can restore it. Pruned to the most
 * recent few per original theme by the write path, not by a cron job. */
export const themeBackups = pgTable("theme_backups", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  originalThemeId: integer("original_theme_id"),
  name: text("name").notNull(),
  snapshot: text("snapshot").notNull(), // JSON-serialized CustomThemeInput
  reason: text("reason").$type<"manual" | "overwrite" | "delete">().notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export type CustomThemeRow = typeof customThemes.$inferSelect;
export type NewCustomThemeRow = typeof customThemes.$inferInsert;
export type ActiveThemeRow = typeof activeThemes.$inferSelect;
export type NewActiveThemeRow = typeof activeThemes.$inferInsert;
export type ThemeBackupRow = typeof themeBackups.$inferSelect;
export type NewThemeBackupRow = typeof themeBackups.$inferInsert;

export const apiKeys = pgTable("api_keys", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  name: text("name").notNull(),
  keyValue: text("key_value").notNull(),
  status: text("status")
    .$type<"active" | "revoked">()
    .notNull()
    .default("active"),
  lastUsedAt: timestamp("last_used_at"),
  expiresAt: timestamp("expires_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

/** Singleton row (always id=1) for app-wide user preferences, replacing the
 * old browser-localStorage-only Settings tabs (General/Appearance) with a
 * value that actually persists in the database and could be read anywhere
 * in the app. */
export const appPreferences = pgTable("app_preferences", {
  id: integer("id").primaryKey(),
  displayName: text("display_name").notNull().default(""),
  timezone: text("timezone").notNull().default("UTC"),
  language: text("language").notNull().default("English"),
  compactDensity: boolean("compact_density").notNull().default(false),
  sidebarCollapsed: boolean("sidebar_collapsed").notNull().default(false),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export type AppPreferences = typeof appPreferences.$inferSelect;
export type NewAppPreferences = typeof appPreferences.$inferInsert;

/** Singleton row (always id=1) controlling how long Error Log/Audit
 * Log/Chat History rows are kept. `lastCleanupAt`/`lastCleanupDeletedCount`
 * record the most recent real cleanup run so the Data Retention tab can
 * show it happened, not just that it's configured. */
export const dataRetentionSettings = pgTable("data_retention_settings", {
  id: integer("id").primaryKey(),
  errorLogRetentionDays: integer("error_log_retention_days"),
  auditLogRetentionDays: integer("audit_log_retention_days"),
  chatHistoryRetentionDays: integer("chat_history_retention_days"),
  lastCleanupAt: timestamp("last_cleanup_at"),
  lastCleanupDeletedCount: integer("last_cleanup_deleted_count"),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export type DataRetentionSettings = typeof dataRetentionSettings.$inferSelect;
export type NewDataRetentionSettings =
  typeof dataRetentionSettings.$inferInsert;

export const workflowRegistry = pgTable("workflow_registry", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  workflowId: text("workflow_id").notNull().unique(),
  name: text("name").notNull(),
  description: text("description"),
  status: text("status").notNull().default("draft"),
  triggerType: text("trigger_type"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const workflowRuns = pgTable("workflow_runs", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  workflowId: text("workflow_id").notNull(),
  workflowName: text("workflow_name").notNull(),
  input: text("input"),
  output: text("output"),
  status: text("status")
    .$type<"success" | "failure">()
    .notNull()
    .default("success"),
  durationMs: integer("duration_ms").notNull().default(0),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const savedQueries = pgTable("saved_queries", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  name: text("name").notNull(),
  connectorId: text("connector_id").notNull(),
  connectorName: text("connector_name").notNull(),
  query: text("query").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const workspaceModels = pgTable("workspace_models", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  modelId: text("model_id").notNull().unique(),
  name: text("name").notNull(),
  description: text("description"),
  queryType: text("query_type")
    .$type<"raw_sql" | "table_selector" | "ai_ml" | "unstructured" | string>()
    .notNull(),
  query: text("query"),
  connectorId: text("connector_id"),
  connectorName: text("connector_name"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

/**
 * Tracks when each manually-maintained platform snapshot (Workflows,
 * Models) was last re-synced against the live platform — there's no
 * runtime API for the app itself to list either one, only the `aisquared`
 * MCP tools can, so these registries are re-synced by re-running the
 * matching seed script (typically on request), not automatically kept
 * live. One row per registry name, upserted on every re-sync.
 */
export const registrySyncLog = pgTable("registry_sync_log", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  registryName: text("registry_name").notNull().unique(),
  lastSyncedAt: timestamp("last_synced_at").notNull().defaultNow(),
  entryCount: integer("entry_count").notNull().default(0),
});

export type RegistrySyncLogRow = typeof registrySyncLog.$inferSelect;
export type NewRegistrySyncLogRow = typeof registrySyncLog.$inferInsert;

export type SavedQueryRow = typeof savedQueries.$inferSelect;
export type NewSavedQueryRow = typeof savedQueries.$inferInsert;
export type WorkspaceModelRow = typeof workspaceModels.$inferSelect;
export type NewWorkspaceModelRow = typeof workspaceModels.$inferInsert;

export type WorkflowRegistryRow = typeof workflowRegistry.$inferSelect;
export type NewWorkflowRegistryRow = typeof workflowRegistry.$inferInsert;
export type WorkflowRunRow = typeof workflowRuns.$inferSelect;
export type NewWorkflowRunRow = typeof workflowRuns.$inferInsert;

export type ApiKey = typeof apiKeys.$inferSelect;
export type NewApiKey = typeof apiKeys.$inferInsert;

export const aiInsights = pgTable("ai_insights", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  connectorId: text("connector_id").notNull(),
  connectorName: text("connector_name").notNull(),
  summary: text("summary").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export type AiInsight = typeof aiInsights.$inferSelect;
export type NewAiInsight = typeof aiInsights.$inferInsert;

/** Metadata for full-database backups snapshotted to S3 (exports/backups/).
 * The actual data lives in the S3 object at `key`; this row lets the app
 * list/restore backups without needing S3 list support. */
export const dbBackups = pgTable("db_backups", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  key: text("key").notNull(),
  tableCount: integer("table_count").notNull().default(0),
  rowCount: integer("row_count").notNull().default(0),
  sizeBytes: integer("size_bytes").notNull().default(0),
  status: text("status")
    .$type<"completed" | "failed">()
    .notNull()
    .default("completed"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export type DbBackup = typeof dbBackups.$inferSelect;
export type NewDbBackup = typeof dbBackups.$inferInsert;

/** A single CSV upload processed by the Import Wizard. `targetTable` records
 * whether rows were matched into the existing Inventory table or, when the
 * CSV's columns didn't match a known table, captured generically in
 * `csvImportRows` (see below) instead of requiring a live schema change per
 * upload. */
export const csvImportBatches = pgTable("csv_import_batches", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  fileName: text("file_name").notNull(),
  storageKey: text("storage_key").notNull(),
  targetTable: text("target_table").$type<"inventory" | "generic">().notNull(),
  totalRows: integer("total_rows").notNull().default(0),
  insertedRows: integer("inserted_rows").notNull().default(0),
  updatedRows: integer("updated_rows").notNull().default(0),
  skippedRows: integer("skipped_rows").notNull().default(0),
  status: text("status")
    .$type<"completed" | "failed">()
    .notNull()
    .default("completed"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

/** Raw rows from a CSV batch that didn't match a known table shape — kept as
 * JSON per row so any CSV can be captured/browsed without a schema change. */
export const csvImportRows = pgTable(
  "csv_import_rows",
  {
    id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
    batchId: integer("batch_id")
      .notNull()
      .references(() => csvImportBatches.id, { onDelete: "cascade" }),
    rowIndex: integer("row_index").notNull(),
    data: text("data").notNull(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => [index("csv_import_rows_batch_id_idx").on(table.batchId)],
);

export type CsvImportBatch = typeof csvImportBatches.$inferSelect;
export type NewCsvImportBatch = typeof csvImportBatches.$inferInsert;
export type CsvImportRow = typeof csvImportRows.$inferSelect;
export type NewCsvImportRow = typeof csvImportRows.$inferInsert;

/** Caption + manual sort order for a theme-gallery image, keyed by its S3
 * key. The images themselves stay in S3 (see `themeGalleryService`) — this
 * table only holds the app-managed metadata layered on top. */
export const galleryImageMeta = pgTable("gallery_image_meta", {
  storageKey: text("storage_key").primaryKey(),
  caption: text("caption"),
  sortOrder: integer("sort_order").notNull().default(0),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export type GalleryImageMeta = typeof galleryImageMeta.$inferSelect;

/** A named, reusable set of pipeline stages + default AI provider for the
 * Document Intelligence Pipeline page, so a user doesn't have to re-pick
 * stages/provider on every upload. `stages` is an ordered array of stage
 * keys (see `PipelineStage` in the service layer). */
export const pipelineConfigs = pgTable("pipeline_configs", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  name: text("name").notNull(),
  stages: text("stages").array().notNull(),
  provider: text("provider")
    .$type<"anthropic" | "openai" | "ai-squared-bolt">()
    .notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export type PipelineConfig = typeof pipelineConfigs.$inferSelect;
export type NewPipelineConfig = typeof pipelineConfigs.$inferInsert;

/** One uploaded-document run through the pipeline. `stages` is a snapshot of
 * the stage list at creation time (independent of the preset, which could
 * be edited/deleted later) — this is what `pipelineStageResults` rows get
 * created for. */
export const documentJobs = pgTable(
  "document_jobs",
  {
    id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
    storageFileId: integer("storage_file_id").references(
      () => storageFiles.id,
      {
        onDelete: "set null",
      },
    ),
    fileName: text("file_name").notNull(),
    pipelineConfigId: integer("pipeline_config_id").references(
      () => pipelineConfigs.id,
      { onDelete: "set null" },
    ),
    stages: text("stages").array().notNull(),
    provider: text("provider")
      .$type<"anthropic" | "openai" | "ai-squared-bolt">()
      .notNull(),
    status: text("status")
      .$type<"pending" | "running" | "done" | "failed">()
      .notNull()
      .default("pending"),
    reportStorageFileId: integer("report_storage_file_id").references(
      () => storageFiles.id,
      { onDelete: "set null" },
    ),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => [
    index("document_jobs_storage_file_id_idx").on(table.storageFileId),
    index("document_jobs_pipeline_config_id_idx").on(table.pipelineConfigId),
  ],
);

export type DocumentJob = typeof documentJobs.$inferSelect;
export type NewDocumentJob = typeof documentJobs.$inferInsert;

/** One stage's execution record within a job — the unit that "retry just
 * the failed stage" operates on. `stageOrder` mirrors the job's `stages`
 * array index so results render in pipeline order regardless of which
 * order stages actually finished running in. */
export const pipelineStageResults = pgTable(
  "pipeline_stage_results",
  {
    id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
    jobId: integer("job_id")
      .notNull()
      .references(() => documentJobs.id, { onDelete: "cascade" }),
    stage: text("stage")
      .$type<"extract" | "summarize" | "tags" | "classify" | "report">()
      .notNull(),
    stageOrder: integer("stage_order").notNull().default(0),
    status: text("status")
      .$type<"pending" | "running" | "done" | "failed">()
      .notNull()
      .default("pending"),
    output: text("output"),
    errorMessage: text("error_message"),
    startedAt: timestamp("started_at"),
    completedAt: timestamp("completed_at"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => [index("pipeline_stage_results_job_id_idx").on(table.jobId)],
);

export type PipelineStageResult = typeof pipelineStageResults.$inferSelect;
export type NewPipelineStageResult = typeof pipelineStageResults.$inferInsert;
export type NewGalleryImageMeta = typeof galleryImageMeta.$inferInsert;

/** One CSV export generated by the Export Center page — the actual file
 * lives in Storage (`storageFiles`); this row records which table it came
 * from and what date range (if any) was applied, so the export history
 * list doesn't have to parse that back out of the file name. */
export const dataExports = pgTable(
  "data_exports",
  {
    id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
    tableKey: text("table_key").notNull(),
    tableLabel: text("table_label").notNull(),
    storageFileId: integer("storage_file_id")
      .notNull()
      .references(() => storageFiles.id, { onDelete: "cascade" }),
    rowCount: integer("row_count").notNull().default(0),
    fromDate: timestamp("from_date"),
    toDate: timestamp("to_date"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => [
    index("data_exports_storage_file_id_idx").on(table.storageFileId),
  ],
);

export type DataExport = typeof dataExports.$inferSelect;
export type NewDataExport = typeof dataExports.$inferInsert;

/** One manual "Test Connection" result for the Integration Health page —
 * builds a history over time per connector, since the platform itself has
 * no health-check/uptime endpoint for connectors. */
export const integrationHealthChecks = pgTable(
  "integration_health_checks",
  {
    id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
    connectorId: text("connector_id").notNull(),
    connectorName: text("connector_name").notNull(),
    connectorProvider: text("connector_provider"),
    status: text("status").$type<"success" | "failure">().notNull(),
    message: text("message"),
    durationMs: integer("duration_ms").notNull().default(0),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => [
    index("integration_health_checks_connector_id_idx").on(table.connectorId),
  ],
);

export type IntegrationHealthCheck =
  typeof integrationHealthChecks.$inferSelect;
export type NewIntegrationHealthCheck =
  typeof integrationHealthChecks.$inferInsert;

/** A bookmarked, re-runnable report — either a saved Data Explorer natural-
 * language question or a saved AI Insights configuration (connector +
 * tables). `lastResultSummary` caches a short preview of the most recent
 * run so the list shows something without needing a fresh run on every
 * page load. */
export const savedReports = pgTable("saved_reports", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  name: text("name").notNull(),
  type: text("type").$type<"explorer" | "insight">().notNull(),
  provider: text("provider").notNull().default("anthropic"),
  // Explorer-type fields
  question: text("question"),
  // Insight-type fields
  connectorId: text("connector_id"),
  connectorName: text("connector_name"),
  tables: text("tables").array(),
  lastRunAt: timestamp("last_run_at"),
  lastResultSummary: text("last_result_summary"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export type SavedReport = typeof savedReports.$inferSelect;
export type NewSavedReport = typeof savedReports.$inferInsert;

/** A reference/documentation role definition for the Roles & Permissions
 * page. Since sign-in is platform-managed (no custom user/login table),
 * this is a config matrix describing intended access, not an enforced
 * permission system. */
export const roles = pgTable("roles", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  name: text("name").notNull().unique(),
  description: text("description"),
  color: text("color").notNull().default("#6366f1"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export type Role = typeof roles.$inferSelect;
export type NewRole = typeof roles.$inferInsert;

/** Whether a given role is marked as allowed to access a given nav
 * section/page key (matching the `title` used in
 * `src/components/layout/index.ts`). One row per role+pageKey the role has
 * been granted; absence of a row means "not allowed" for that role. */
export const rolePermissions = pgTable(
  "role_permissions",
  {
    id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
    roleId: integer("role_id")
      .notNull()
      .references(() => roles.id, { onDelete: "cascade" }),
    pageKey: text("page_key").notNull(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => [index("role_permissions_role_id_idx").on(table.roleId)],
);

export type RolePermission = typeof rolePermissions.$inferSelect;
export type NewRolePermission = typeof rolePermissions.$inferInsert;

/** A team member directory entry — reference-only (no login credentials),
 * assigned a Role for documentation purposes. This app's sign-in is
 * platform-managed, so this table never gates real access. */
export const teamMembers = pgTable("team_members", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  name: text("name").notNull(),
  email: text("email").notNull(),
  title: text("title"),
  roleId: integer("role_id").references(() => roles.id, {
    onDelete: "set null",
  }),
  /** Marks this member as the app's Owner. At most one member should have
   * this set at a time (enforced in teamMemberService, not a DB constraint,
   * since this app has no custom login/session tied to it). An owner's role
   * is always forced to the "Admin" role and locked from being changed in
   * the UI. */
  isOwner: boolean("is_owner").notNull().default(false),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export type TeamMember = typeof teamMembers.$inferSelect;
export type NewTeamMember = typeof teamMembers.$inferInsert;

/** One saved Sentiment & Tone Analyzer run, so past checks can be reviewed
 * later instead of only showing on screen for the current session. */
export const sentimentAnalyses = pgTable("sentiment_analyses", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  inputText: text("input_text").notNull(),
  provider: text("provider").notNull().default("anthropic"),
  sentiment: text("sentiment").$type<"positive" | "negative" | "neutral">(),
  sentimentScore: integer("sentiment_score"),
  tones: text("tones").array(),
  keyPhrases: text("key_phrases").array(),
  rawResponse: text("raw_response").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export type SentimentAnalysis = typeof sentimentAnalyses.$inferSelect;
export type NewSentimentAnalysis = typeof sentimentAnalyses.$inferInsert;

/** One saved Content Moderation check (text pasted or extracted from an
 * uploaded document), so past checks can be reviewed later. */
export const moderationChecks = pgTable("moderation_checks", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  sourceLabel: text("source_label").notNull(),
  inputText: text("input_text").notNull(),
  provider: text("provider").notNull().default("anthropic"),
  flagged: boolean("flagged").notNull().default(false),
  categories: text("categories").array(),
  rawResponse: text("raw_response").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export type ModerationCheck = typeof moderationChecks.$inferSelect;
export type NewModerationCheck = typeof moderationChecks.$inferInsert;

/** A named, reusable prompt saved to the Prompt Library — copy/paste use
 * only (no direct "send to Chat" integration, per the confirmed scope). */
export const savedPrompts = pgTable("saved_prompts", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  title: text("title").notNull(),
  body: text("body").notNull(),
  category: text("category"),
  tags: text("tags").array(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export type SavedPrompt = typeof savedPrompts.$inferSelect;

/** One row per AppGen chat turn: the user's request, a short summary of
 * what the agent did in response, and when it happened. Distinct from
 * `chatConversations`/`chatMessages` above, which back the in-app
 * `<ChatAssistant/>` feature — this table is a log of THIS builder chat. */
export const agentChatLogs = pgTable("agent_chat_logs", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  /** Identifies which continuous AppGen chat session a turn belongs to.
   * There is no session id exposed by the platform to this app's own code —
   * the agent generates one id per ongoing conversation and reuses it for
   * every entry logged during that same session. */
  sessionId: text("session_id").notNull(),
  userQuery: text("user_query").notNull(),
  responseSummary: text("response_summary").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export type AgentChatLog = typeof agentChatLogs.$inferSelect;
export type NewAgentChatLog = typeof agentChatLogs.$inferInsert;
export type NewSavedPrompt = typeof savedPrompts.$inferInsert;
