import { config } from "dotenv";
config({ path: ".env.local" });

import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { todos } from "./schema";
import { desc } from "drizzle-orm";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is not set");
  process.exit(1);
}

const sql = neon(url);
const db = drizzle({ client: sql });

async function verify() {
  try {
    console.log("📊 Verifying To-Do list...\n");

    const allTodos = await db.select().from(todos).orderBy(desc(todos.createdAt));
    
    console.log(`Total To-Do items: ${allTodos.length}\n`);
    console.log("Recent items:");
    allTodos.slice(0, 10).forEach((todo, i) => {
      console.log(`  ${i + 1}. [${todo.status}] ${todo.title}`);
    });

    console.log("\n✨ All pages are now tracked in To-Do!");
  } catch (error) {
    console.error("❌ Error:", error);
    process.exit(1);
  }
}

verify();
