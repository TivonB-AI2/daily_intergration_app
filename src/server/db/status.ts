#!/usr/bin/env bun
import { config } from "dotenv";
config({ path: ".env.local" });

import { neon } from "@neondatabase/serverless";

const url = process.env.DATABASE_URL;
if (!url) {
  console.log("state=not_configured");
  process.exit(0);
}

try {
  const sql = neon(url);
  const rows = await sql`
    SELECT table_name
    FROM information_schema.tables
    WHERE table_schema = 'public'
    ORDER BY table_name
  `;
  const names = rows.map((r) => String(r.table_name));
  const list = names.length === 0 ? "(none)" : names.join(",");
  console.log(`state=connected tables=${list}`);
  process.exit(0);
} catch (e) {
  const raw = (e instanceof Error ? e.message : String(e))
    .split("\n")[0]
    .replace(/\s+/g, " ");
  const msg = raw
    .replace(/postgres(ql)?:\/\/[^\s]+/gi, "postgres://***")
    .replace(/password[=:]\s*\S+/gi, "password=***")
    .slice(0, 200);
  console.log(`state=error msg=${msg}`);
  process.exit(1);
}
