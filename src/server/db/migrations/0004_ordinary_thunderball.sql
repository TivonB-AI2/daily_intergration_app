CREATE TABLE "active_themes" (
	"scope_key" text PRIMARY KEY NOT NULL,
	"theme_id" integer NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "custom_themes" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "custom_themes_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"name" text NOT NULL,
	"background_type" text DEFAULT 'solid' NOT NULL,
	"background" text NOT NULL,
	"intensity" integer DEFAULT 50 NOT NULL,
	"overlay" integer DEFAULT 40 NOT NULL,
	"overlay_color" text DEFAULT '#000000' NOT NULL,
	"scope" text DEFAULT 'global' NOT NULL,
	"scope_key" text DEFAULT 'global' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "active_themes" ADD CONSTRAINT "active_themes_theme_id_custom_themes_id_fk" FOREIGN KEY ("theme_id") REFERENCES "public"."custom_themes"("id") ON DELETE cascade ON UPDATE no action;