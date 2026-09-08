CREATE TABLE "theme_backups" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "theme_backups_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"original_theme_id" integer,
	"name" text NOT NULL,
	"snapshot" text NOT NULL,
	"reason" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "custom_themes" ADD COLUMN "radius" integer;--> statement-breakpoint
ALTER TABLE "custom_themes" ADD COLUMN "shadow_strength" integer;--> statement-breakpoint
ALTER TABLE "custom_themes" ADD COLUMN "dark_background" text;--> statement-breakpoint
ALTER TABLE "custom_themes" ADD COLUMN "dark_background_key" text;--> statement-breakpoint
ALTER TABLE "custom_themes" ADD COLUMN "dark_overlay_color" text;--> statement-breakpoint
ALTER TABLE "custom_themes" ADD COLUMN "dark_accent_colors" text[];