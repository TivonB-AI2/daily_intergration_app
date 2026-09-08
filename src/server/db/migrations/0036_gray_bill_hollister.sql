CREATE TABLE "agent_chat_logs" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "agent_chat_logs_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"user_query" text NOT NULL,
	"response_summary" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
