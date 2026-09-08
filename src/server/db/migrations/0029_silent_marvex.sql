CREATE TABLE "moderation_checks" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "moderation_checks_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"source_label" text NOT NULL,
	"input_text" text NOT NULL,
	"provider" text DEFAULT 'anthropic' NOT NULL,
	"flagged" boolean DEFAULT false NOT NULL,
	"categories" text[],
	"raw_response" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "saved_prompts" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "saved_prompts_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"title" text NOT NULL,
	"body" text NOT NULL,
	"category" text,
	"tags" text[],
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sentiment_analyses" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "sentiment_analyses_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"input_text" text NOT NULL,
	"provider" text DEFAULT 'anthropic' NOT NULL,
	"sentiment" text,
	"sentiment_score" integer,
	"tones" text[],
	"key_phrases" text[],
	"raw_response" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
