ALTER TABLE "storage_files" ADD COLUMN "tags" text[];--> statement-breakpoint
ALTER TABLE "storage_files" ADD COLUMN "extracted_text" text;--> statement-breakpoint
ALTER TABLE "todos" ADD COLUMN "changelog_entry_id" integer;--> statement-breakpoint
ALTER TABLE "todos" ADD CONSTRAINT "todos_changelog_entry_id_changelog_entries_id_fk" FOREIGN KEY ("changelog_entry_id") REFERENCES "public"."changelog_entries"("id") ON DELETE set null ON UPDATE no action;