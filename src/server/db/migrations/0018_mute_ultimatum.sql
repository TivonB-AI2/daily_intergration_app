CREATE TABLE "registry_sync_log" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "registry_sync_log_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"registry_name" text NOT NULL,
	"last_synced_at" timestamp DEFAULT now() NOT NULL,
	"entry_count" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "registry_sync_log_registry_name_unique" UNIQUE("registry_name")
);
