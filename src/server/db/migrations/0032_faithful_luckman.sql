CREATE TABLE "app_preferences" (
	"id" integer PRIMARY KEY NOT NULL,
	"display_name" text DEFAULT '' NOT NULL,
	"timezone" text DEFAULT 'UTC' NOT NULL,
	"language" text DEFAULT 'English' NOT NULL,
	"compact_density" boolean DEFAULT false NOT NULL,
	"sidebar_collapsed" boolean DEFAULT false NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "data_retention_settings" (
	"id" integer PRIMARY KEY NOT NULL,
	"error_log_retention_days" integer,
	"audit_log_retention_days" integer,
	"chat_history_retention_days" integer,
	"last_cleanup_at" timestamp,
	"last_cleanup_deleted_count" integer,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
