ALTER TABLE "agent_chat_logs" ADD COLUMN "session_id" text;
--> statement-breakpoint
UPDATE "agent_chat_logs" SET "session_id" = 'legacy-session' WHERE "session_id" IS NULL;
--> statement-breakpoint
ALTER TABLE "agent_chat_logs" ALTER COLUMN "session_id" SET NOT NULL;