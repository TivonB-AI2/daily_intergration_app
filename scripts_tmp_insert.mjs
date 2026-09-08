import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import * as schema from "./src/server/db/schema.ts";

const sql = neon(process.env.DATABASE_URL);
const db = drizzle(sql, { schema });

async function main() {
  const [entry] = await db
    .insert(schema.changelogEntries)
    .values({
      version: "2.72.0",
      type: "improvement",
      title: "Data Dashboard: restrict to structured data sources",
      description:
        "The Data Dashboard's connector picker now only lists structured/tabular data source connectors — unstructured document connectors (e.g. OneDrive's Unstructured mode) are excluded, since this page needs a real SQL table schema to browse.",
    })
    .returning();

  const [todo] = await db
    .insert(schema.todos)
    .values({
      title: "Data Dashboard: filter out unstructured connectors from picker",
      description:
        'Previously the Data Dashboard\'s connector picker listed every connector in the "data" category, including unstructured document connectors (data_type === "unstructured", e.g. OneDrive Unstructured mode) which don\'t provide a real SQL schema. Filtered the picker to only structured/tabular connectors and updated the empty-state text to "No structured data source connectors available".',
      status: "done",
      changelogEntryId: entry.id,
    })
    .returning();

  console.log(JSON.stringify({ entry, todo }, null, 2));
}

main().then(() => process.exit(0)).catch((e) => {
  console.error(e);
  process.exit(1);
});
