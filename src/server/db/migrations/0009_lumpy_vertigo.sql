ALTER TABLE "custom_themes" ADD COLUMN "accent_colors" text[];--> statement-breakpoint
ALTER TABLE "custom_themes" ADD COLUMN "noise_opacity" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "custom_themes" ADD COLUMN "animation" text DEFAULT 'none' NOT NULL;