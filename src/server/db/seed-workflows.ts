import { config } from "dotenv";
config({ path: ".env.local" });

import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { sql as sqlTag } from "drizzle-orm";
import { workflowRegistry, registrySyncLog } from "./schema";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is not set");
  process.exit(1);
}

const sql = neon(url);
const db = drizzle({ client: sql });

/**
 * Snapshot of the workspace's workflows, captured from the platform's
 * workflow list. The Workflows page reads this registry so it can show and
 * run every workflow; entries can be added or removed from the page itself.
 */
const WORKFLOWS = [
  {
    workflowId: "2fbea4bc-2e34-44c2-8360-97114da334bd",
    name: "Test Wok text to sql",
    description:
      "A chat agent that converts natural language questions into SQL queries, executes them against a connected database, and returns results with agentic retry and self-correction.",
    status: "published",
    triggerType: "website_chatbot",
  },
  {
    workflowId: "5b03651e-ec98-46fc-b992-5c0be52305f2",
    name: "Remote Wok",
    description: null,
    status: "draft",
    triggerType: null,
  },
  {
    workflowId: "9256c465-bd35-47e4-99b8-4d8e042b6587",
    name: "KB_Test",
    description: "A chat agent that uses a LLM model to generate a response.",
    status: "draft",
    triggerType: null,
  },
  {
    workflowId: "e65fd518-cc61-476a-be7e-c3808dfa4987",
    name: "Chatbot",
    description: "A chat agent that uses a LLM model to generate a response.",
    status: "draft",
    triggerType: "website_chatbot",
  },
  {
    workflowId: "4ef1c9a2-01f6-44ce-966f-8c1634e267ba",
    name: "Test Wok Vul",
    description:
      "A chat agent that uses a prompt template to generate a response.",
    status: "published",
    triggerType: "website_chatbot",
  },
  {
    workflowId: "30d32720-5e04-4f65-97dd-75e33c8f191d",
    name: "Test Wok Export 2",
    description: "A chat agent that uses a LLM model to generate a response.",
    status: "published",
    triggerType: "website_chatbot",
  },
  {
    workflowId: "b1cc9f34-d1c0-4e8b-a0c9-9d337fda0861",
    name: "Test Wok Export",
    description: null,
    status: "published",
    triggerType: "website_chatbot",
  },
  {
    workflowId: "bd6cbb85-a5b7-44b7-991f-1a59b44df062",
    name: "Lightning Workflow",
    description: null,
    status: "draft",
    triggerType: "website_chatbot",
  },
  {
    workflowId: "e79fc219-1414-4a35-b009-cd6deec10be8",
    name: "Test Wok Agent",
    description: null,
    status: "draft",
    triggerType: null,
  },
  {
    workflowId: "1da4b971-1d1e-4587-ba37-435965061941",
    name: "Reject wok",
    description: null,
    status: "draft",
    triggerType: "website_chatbot",
  },
  {
    workflowId: "5279be7b-f0d2-4e14-8526-b7f7fc2c6879",
    name: "Python wok",
    description: null,
    status: "draft",
    triggerType: null,
  },
  {
    workflowId: "4be73ccb-af62-4029-96af-30c44e1ca5b0",
    name: "Complex",
    description: null,
    status: "draft",
    triggerType: null,
  },
  {
    workflowId: "fd9f7b3f-ac05-44b1-8757-eb9955781be4",
    name: "test wok",
    description: null,
    status: "draft",
    triggerType: null,
  },
  {
    workflowId: "ae337d1c-e8b1-4d7c-848e-f1c840c8b25f",
    name: "Prompt Test 1",
    description: null,
    status: "draft",
    triggerType: null,
  },
  {
    workflowId: "34894657-7b9b-4242-9abe-824ad3e2b484",
    name: "A2A Workflow",
    description: null,
    status: "draft",
    triggerType: null,
  },
  {
    workflowId: "18722351-8613-4ff1-bbe0-b053f874c2d2",
    name: "Database Workflow",
    description: "A chat agent that uses a database to retrieve data.",
    status: "published",
    triggerType: "website_chatbot",
  },
  {
    workflowId: "a173797b-ba65-4f82-b62c-05101de5a4ef",
    name: "Text-to-SQL Workflow",
    description:
      "A chat agent that converts natural language questions into SQL queries, executes them against a connected database, and returns results with agentic retry and self-correction.",
    status: "draft",
    triggerType: "website_chatbot",
  },
  {
    workflowId: "964f1c2e-3153-4518-bcd4-2753a148d5af",
    name: "Database Vector Workflow",
    description:
      "A chat agent that uses a vector database to retrieve context and a prompt template to generate a response.",
    status: "draft",
    triggerType: null,
  },
];

async function seed() {
  console.log(`Seeding ${WORKFLOWS.length} workflows into the registry...`);
  // Upsert (not onConflictDoNothing) so re-running this script after editing
  // WORKFLOWS above — the normal way this registry gets "re-synced" — also
  // refreshes an existing entry's name/description/status/triggerType
  // instead of silently leaving stale values in place.
  await db
    .insert(workflowRegistry)
    .values(WORKFLOWS)
    .onConflictDoUpdate({
      target: workflowRegistry.workflowId,
      set: {
        name: sqlTag`excluded.name`,
        description: sqlTag`excluded.description`,
        status: sqlTag`excluded.status`,
        triggerType: sqlTag`excluded.trigger_type`,
      },
    });
  const rows = await db.select().from(workflowRegistry);
  await db
    .insert(registrySyncLog)
    .values({ registryName: "workflows", entryCount: rows.length })
    .onConflictDoUpdate({
      target: registrySyncLog.registryName,
      set: { lastSyncedAt: new Date(), entryCount: rows.length },
    });
  console.log(`✓ Workflow registry now has ${rows.length} entries.`);
  process.exit(0);
}

seed().catch((err) => {
  console.error(err);
  process.exit(1);
});
