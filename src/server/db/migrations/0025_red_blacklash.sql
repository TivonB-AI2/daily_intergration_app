CREATE TABLE "brand_assets" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "brand_assets_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"name" text NOT NULL,
	"category" text DEFAULT 'other' NOT NULL,
	"version" text,
	"tags" text[],
	"notes" text,
	"storage_file_id" integer NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "brand_assets" ADD CONSTRAINT "brand_assets_storage_file_id_storage_files_id_fk" FOREIGN KEY ("storage_file_id") REFERENCES "public"."storage_files"("id") ON DELETE cascade ON UPDATE no action;