CREATE TABLE "data_exports" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "data_exports_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"table_key" text NOT NULL,
	"table_label" text NOT NULL,
	"storage_file_id" integer NOT NULL,
	"row_count" integer DEFAULT 0 NOT NULL,
	"from_date" timestamp,
	"to_date" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "data_exports" ADD CONSTRAINT "data_exports_storage_file_id_storage_files_id_fk" FOREIGN KEY ("storage_file_id") REFERENCES "public"."storage_files"("id") ON DELETE cascade ON UPDATE no action;