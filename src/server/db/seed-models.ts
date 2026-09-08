import { config } from "dotenv";
config({ path: ".env.local" });

import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { sql as sqlTag } from "drizzle-orm";
import { workspaceModels, registrySyncLog } from "./schema";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is not set");
  process.exit(1);
}

const sql = neon(url);
const db = drizzle({ client: sql });

/**
 * Snapshot of the workspace's Models, captured from the platform (no
 * runtime API exposes a models list to app code — only the `aisquared` MCP
 * tools can read it). The Query page's Models tab reads this registry.
 */
const MODELS = [
  {
    modelId: "1211",
    name: "AI Squared",
    description: null,
    queryType: "table_selector",
    query: "SELECT * FROM fortune1000",
    connectorId: "1142",
    connectorName: "AI Squared Vector Store",
  },
  {
    modelId: "1152",
    name: "One drive",
    description: null,
    queryType: "unstructured",
    query: null,
    connectorId: "1977",
    connectorName: "One Drive - Unstructured",
  },
  {
    modelId: "1011",
    name: "bolt 2",
    description: null,
    queryType: "ai_ml",
    query: null,
    connectorId: "1576",
    connectorName: "AI Squared Bolt 2",
  },
  {
    modelId: "1008",
    name: "Bolt",
    description: null,
    queryType: "ai_ml",
    query: null,
    connectorId: "1567",
    connectorName: "Ai Squared Bolt",
  },
  {
    modelId: "963",
    name: "Odoo Model - Static",
    description: null,
    queryType: "raw_sql",
    query: "SELECT * FROM crm.lead",
    connectorId: "1390",
    connectorName: "Odoo - Source",
  },
  {
    modelId: "893",
    name: "Aws Athena Model - Static",
    description: null,
    queryType: "raw_sql",
    query: "SELECT\n  *\nFROM\n  test_table",
    connectorId: "1205",
    connectorName: "Athena - Source",
  },
  {
    modelId: "892",
    name: "BigQuery Model Smoke Test",
    description: null,
    queryType: "raw_sql",
    query: "SELECT * FROM `big-potential-425100-e0.Test_Dataset.Test_Table`",
    connectorId: "1223",
    connectorName: "BigQuery Smoke Test",
  },
  {
    modelId: "891",
    name: "Intuit Quickbook Model - Static",
    description: null,
    queryType: "raw_sql",
    query: "SELECT\n  *\nFROM\n  Invoice",
    connectorId: "1212",
    connectorName: "Intuit Quickbook - Source",
  },
  {
    modelId: "890",
    name: "Intuit Quickbook Model - Table Selector",
    description: null,
    queryType: "table_selector",
    query: "SELECT * FROM Employee",
    connectorId: "1212",
    connectorName: "Intuit Quickbook - Source",
  },
  {
    modelId: "889",
    name: "Oracle DB Model - Static",
    description: null,
    queryType: "raw_sql",
    query: "SELECT\n  *\nFROM\n  EMPLOYEES",
    connectorId: "1211",
    connectorName: "Oracle - Source",
  },
  {
    modelId: "888",
    name: "Oracle DB Model - Table Selector",
    description: null,
    queryType: "table_selector",
    query: "SELECT * FROM EMPLOYEES",
    connectorId: "1211",
    connectorName: "Oracle - Source",
  },
  {
    modelId: "873",
    name: "SFTP Model - Static",
    description: null,
    queryType: "raw_sql",
    query: 'SELECT * FROM "Book_test_PC_20260331-160440.csv"',
    connectorId: "1160",
    connectorName: "SFTP - Source",
  },
  {
    modelId: "872",
    name: "SFTP Model",
    description: null,
    queryType: "table_selector",
    query: "SELECT * FROM /Book_test_PC_20260331-155345.csv",
    connectorId: "1160",
    connectorName: "SFTP - Source",
  },
  {
    modelId: "871",
    name: "AI Squared Vector Store - Static",
    description: null,
    queryType: "raw_sql",
    query: "SELECT * FROM org3_ws838.fortune1000",
    connectorId: "1142",
    connectorName: "AI Squared Vector Store",
  },
  {
    modelId: "870",
    name: "AI Squared Vector Store - Table Selector",
    description: null,
    queryType: "table_selector",
    query: "SELECT * FROM fortune1000",
    connectorId: "1142",
    connectorName: "AI Squared Vector Store",
  },
  {
    modelId: "869",
    name: "Supabase Table Selector",
    description: null,
    queryType: "table_selector",
    query: "SELECT * FROM document_vector_embeddings",
    connectorId: "1147",
    connectorName: "Supabase",
  },
  {
    modelId: "868",
    name: "BigQuery Model Static Large",
    description: null,
    queryType: "raw_sql",
    query: "SELECT * FROM `big-potential-425100-e0.Test_Dataset.Fortune1000`",
    connectorId: "1140",
    connectorName: "BigQuery",
  },
  {
    modelId: "867",
    name: "BigQuery Model Static",
    description: null,
    queryType: "raw_sql",
    query: "SELECT * FROM `big-potential-425100-e0.Test_Dataset.Test_Table`",
    connectorId: "1140",
    connectorName: "BigQuery",
  },
];

async function seed() {
  console.log(`Seeding ${MODELS.length} workspace models...`);
  // Upsert (not onConflictDoNothing) so re-running this script after
  // editing MODELS above — the normal way this registry gets "re-synced" —
  // also refreshes an existing entry's fields instead of silently leaving
  // stale values in place.
  await db
    .insert(workspaceModels)
    .values(MODELS)
    .onConflictDoUpdate({
      target: workspaceModels.modelId,
      set: {
        name: sqlTag`excluded.name`,
        description: sqlTag`excluded.description`,
        queryType: sqlTag`excluded.query_type`,
        query: sqlTag`excluded.query`,
        connectorId: sqlTag`excluded.connector_id`,
        connectorName: sqlTag`excluded.connector_name`,
      },
    });
  const rows = await db.select().from(workspaceModels);
  await db
    .insert(registrySyncLog)
    .values({ registryName: "models", entryCount: rows.length })
    .onConflictDoUpdate({
      target: registrySyncLog.registryName,
      set: { lastSyncedAt: new Date(), entryCount: rows.length },
    });
  console.log(`✓ Workspace models registry now has ${rows.length} entries.`);
  process.exit(0);
}

seed().catch((err) => {
  console.error(err);
  process.exit(1);
});
