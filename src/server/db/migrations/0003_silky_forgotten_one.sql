CREATE TABLE "content_calendar_items" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "content_calendar_items_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"title" text NOT NULL,
	"description" text,
	"channel" text DEFAULT 'social' NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"scheduled_date" timestamp NOT NULL,
	"published_at" timestamp,
	"storage_file_id" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "content_calendar_items" ADD CONSTRAINT "content_calendar_items_storage_file_id_storage_files_id_fk" FOREIGN KEY ("storage_file_id") REFERENCES "public"."storage_files"("id") ON DELETE set null ON UPDATE no action;