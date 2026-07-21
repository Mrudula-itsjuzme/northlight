/**
 * Applies every SQL file in src/db/migrations, in order, to the Postgres
 * instance at process.env.DATABASE_URL. Intended for a real Supabase
 * project (or any Postgres 15+ with pgvector available) — see DATABASE.md.
 *
 * This script does NOT run in this sandbox (there is no live DATABASE_URL
 * configured), but is what a real deployment should run instead of
 * `supabase db push` if you'd rather apply the Drizzle-generated SQL
 * directly. Either path is documented in DATABASE.md.
 */
import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import postgres from "postgres";

const MIGRATIONS_DIR = path.resolve(__dirname, "../src/db/migrations");

async function main() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    console.error(
      "DATABASE_URL is not set. Copy .env.example to .env.local (or export " +
        "DATABASE_URL directly) with a real Supabase/Postgres connection " +
        "string before running this script.",
    );
    process.exit(1);
  }

  const sql = postgres(connectionString, { max: 1 });

  const files = fs
    .readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith(".sql"))
    .sort();

  console.log(`Applying ${files.length} migration file(s)...`);

  for (const file of files) {
    console.log(`  -> ${file}`);
    const contents = fs.readFileSync(path.join(MIGRATIONS_DIR, file), "utf-8");
    const statements = contents
      .split("--> statement-breakpoint")
      .map((s) => s.trim())
      .filter(Boolean);

    for (const statement of statements) {
      await sql.unsafe(statement);
    }
  }

  console.log("All migrations applied successfully.");
  await sql.end();
}

main().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
