CREATE TABLE "saved_queries" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "saved_queries_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"name" text NOT NULL,
	"connector_id" text NOT NULL,
	"connector_name" text NOT NULL,
	"query" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "workspace_models" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "workspace_models_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"model_id" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"query_type" text NOT NULL,
	"query" text,
	"connector_id" text,
	"connector_name" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "workspace_models_model_id_unique" UNIQUE("model_id")
);
