CREATE TABLE "app_branding" (
	"id" integer PRIMARY KEY NOT NULL,
	"active_logo_asset_id" integer,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "app_branding" ADD CONSTRAINT "app_branding_active_logo_asset_id_brand_assets_id_fk" FOREIGN KEY ("active_logo_asset_id") REFERENCES "public"."brand_assets"("id") ON DELETE set null ON UPDATE no action;