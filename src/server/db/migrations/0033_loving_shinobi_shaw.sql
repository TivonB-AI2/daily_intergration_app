CREATE TABLE "animated_themes" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "animated_themes_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"name" text NOT NULL,
	"grad_start" text NOT NULL,
	"grad_end" text NOT NULL,
	"grad_direction" text DEFAULT 'to bottom right' NOT NULL,
	"animation" text DEFAULT 'wave' NOT NULL,
	"speed" integer DEFAULT 50 NOT NULL,
	"accent_colors" text[],
	"created_at" timestamp DEFAULT now() NOT NULL
);
