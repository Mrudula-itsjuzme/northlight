import { describe, expect, it } from "vitest";
import { parse } from "libpg-query";
import fs from "node:fs";
import path from "node:path";

const MIGRATIONS_DIR = path.resolve(__dirname, "../../src/db/migrations");

/**
 * Validates that every migration file is syntactically valid Postgres SQL
 * — including statements pglite can't execute (CREATE EXTENSION vector,
 * vector(1536) columns) — using libpg-query, which is compiled from the
 * real Postgres grammar (libpg_query). This is the check that stands in
 * for "migrations apply cleanly to a real Supabase/Postgres instance" for
 * the parts we cannot execute end-to-end in this sandbox (see
 * tests/db/pglite.ts for the behavioral RLS tests, which run everything
 * EXCEPT the vector column against a real embedded Postgres engine).
 */
describe("migration SQL syntax", () => {
  const migrationFiles = fs
    .readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith(".sql"))
    .sort();

  it("found the expected migration files", () => {
    expect(migrationFiles).toContain("0000_sticky_secret_warriors.sql");
    expect(migrationFiles).toContain("0001_rls_policies.sql");
  });

  for (const file of migrationFiles) {
    it(`${file} is syntactically valid Postgres SQL`, async () => {
      const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, file), "utf-8");
      const statements = sql
        .split("--> statement-breakpoint")
        .map((s) => s.trim())
        .filter(Boolean);

      expect(statements.length).toBeGreaterThan(0);

      for (const statement of statements) {
        await expect(parse(statement)).resolves.toBeDefined();
      }
    });
  }
});
