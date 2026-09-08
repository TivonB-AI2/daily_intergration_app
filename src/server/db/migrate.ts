#!/usr/bin/env bun
import { config } from "dotenv";
config({ path: ".env.local" });

import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { migrate } from "drizzle-orm/neon-http/migrator";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is not set");
  process.exit(1);
}

const sql = neon(url);
const db = drizzle(sql);

await migrate(db, { migrationsFolder: "./src/server/db/migrations" });

console.log("Migrations applied.");
process.exit(0);
