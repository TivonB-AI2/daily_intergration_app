CREATE TABLE "document_jobs" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "document_jobs_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"storage_file_id" integer,
	"file_name" text NOT NULL,
	"pipeline_config_id" integer,
	"stages" text[] NOT NULL,
	"provider" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"report_storage_file_id" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pipeline_configs" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "pipeline_configs_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"name" text NOT NULL,
	"stages" text[] NOT NULL,
	"provider" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pipeline_stage_results" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "pipeline_stage_results_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"job_id" integer NOT NULL,
	"stage" text NOT NULL,
	"stage_order" integer DEFAULT 0 NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"output" text,
	"error_message" text,
	"started_at" timestamp,
	"completed_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "document_jobs" ADD CONSTRAINT "document_jobs_storage_file_id_storage_files_id_fk" FOREIGN KEY ("storage_file_id") REFERENCES "public"."storage_files"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_jobs" ADD CONSTRAINT "document_jobs_pipeline_config_id_pipeline_configs_id_fk" FOREIGN KEY ("pipeline_config_id") REFERENCES "public"."pipeline_configs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_jobs" ADD CONSTRAINT "document_jobs_report_storage_file_id_storage_files_id_fk" FOREIGN KEY ("report_storage_file_id") REFERENCES "public"."storage_files"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pipeline_stage_results" ADD CONSTRAINT "pipeline_stage_results_job_id_document_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."document_jobs"("id") ON DELETE cascade ON UPDATE no action;