import { PGlite } from "@electric-sql/pglite";
import fs from "node:fs";
import path from "node:path";

const MIGRATIONS_DIR = path.resolve(__dirname, "../../src/db/migrations");

/**
 * This project's Postgres migrations are validated two separate ways:
 *
 * 1. Syntactic validity of the REAL migration SQL (including the `vector`
 *    column type used by pgvector) is checked with `libpg-query`, which
 *    embeds the actual Postgres grammar — see
 *    tests/integration/migration-syntax.test.ts. That test proves the SQL
 *    Supabase will actually run is well-formed Postgres.
 *
 * 2. Behavioral validation (does RLS actually isolate tenants? does the
 *    schema's constraints behave as intended?) runs against pglite, an
 *    embedded WASM build of real Postgres, because this sandbox has no
 *    Docker/psql/pg_ctl and no passwordless sudo to install a Postgres
 *    server or use testcontainers. The pglite version available on npm
 *    (0.5.4, latest at the time of writing) does not bundle the pgvector
 *    extension in its contrib set, so for behavioral tests only, this
 *    harness applies a MODIFIED copy of migration 0000 where
 *    `vector(1536)` is rewritten to `double precision[]` (same nullability,
 *    no data loss for the rows the tests create, since no test asserts on
 *    embedding similarity search). Every other statement — every table,
 *    column, constraint, index, and all of migration 0001's RLS policies
 *    and helper functions — runs completely unmodified. This is the only
 *    deviation between "real" and "test" schema, and it is scoped to a
 *    single column's type. DATABASE.md documents this in detail.
 *
 * pglite also has no built-in `auth` schema (that's a Supabase-specific
 * concept layered on top of Postgres). We create a minimal shim:
 * `auth.uid()` reads a session-local Postgres setting
 * (`request.jwt.claim.sub`) that tests set via `setCurrentUser()` below,
 * mirroring how Supabase's PostgREST sets it from the request JWT before
 * RLS policies evaluate `auth.uid()`. Because our RLS policies (migration
 * 0001) only ever call `auth.uid()` — never any other Supabase-specific
 * function — this shim is sufficient to exercise the real policy logic.
 */
export async function createTestDb(): Promise<PGlite> {
  const db = await PGlite.create();

  await db.exec(`
    CREATE SCHEMA IF NOT EXISTS auth;
    CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid
    LANGUAGE sql STABLE
    AS $$
      SELECT NULLIF(current_setting('request.jwt.claim.sub', true), '')::uuid;
    $$;
  `);

  const migration0000 = fs.readFileSync(
    path.join(MIGRATIONS_DIR, "0000_sticky_secret_warriors.sql"),
    "utf-8",
  );
  const migration0001 = fs.readFileSync(
    path.join(MIGRATIONS_DIR, "0001_rls_policies.sql"),
    "utf-8",
  );

  const testSafeMigration0000 = migration0000
    .replace(/CREATE EXTENSION IF NOT EXISTS vector;/, "-- (vector extension skipped under pglite; see tests/db/pglite.ts)")
    .replace(/vector\(1536\)/g, "double precision[]");

  await runStatements(db, testSafeMigration0000);
  await runStatements(db, migration0001);

  // pglite's default connection role ("postgres") is a superuser with
  // rolbypassrls = true, same as any Postgres table owner — RLS NEVER
  // applies to superusers/owners, by design, on any Postgres. Supabase's
  // PostgREST connects as a non-superuser `authenticated` role instead, so
  // policies actually engage for normal app requests. We replicate that
  // here: create an `authenticated` role, grant it table privileges (grants
  // are necessary but not sufficient — RLS policies then further restrict
  // row visibility within whatever the grants allow), and every test query
  // runs `SET ROLE authenticated` first so RLS is actually in effect. If we
  // skipped this and queried as `postgres`, every isolation test would pass
  // vacuously (RLS bypassed) regardless of whether the policies were
  // correct — the exact false-positive this test suite must not produce.
  await db.exec(`
    DO $$
    BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
        CREATE ROLE authenticated NOLOGIN NOBYPASSRLS;
      END IF;
    END
    $$;
    GRANT USAGE ON SCHEMA public TO authenticated;
    GRANT USAGE ON SCHEMA auth TO authenticated;
    GRANT EXECUTE ON FUNCTION auth.uid() TO authenticated;
    GRANT ALL ON ALL TABLES IN SCHEMA public TO authenticated;
    GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO authenticated;
  `);

  return db;
}

async function runStatements(db: PGlite, sql: string) {
  const statements = sql
    .split("--> statement-breakpoint")
    .map((s) => s.trim())
    .filter(Boolean);

  for (const statement of statements) {
    await db.exec(statement);
  }
}

/**
 * Simulates "the currently authenticated user" for the duration of the
 * connection, exactly as Supabase's PostgREST sets the JWT claim before
 * RLS policies run, AND switches the session to the non-superuser
 * `authenticated` role so RLS policies actually engage (see createTestDb
 * for why this matters). Pass `null` to simulate an unauthenticated
 * request (still under the `authenticated` role, but auth.uid() is NULL,
 * so every `is_brand_member()` check evaluates false).
 */
export async function setCurrentUser(db: PGlite, userId: string | null) {
  await db.exec(`SET ROLE authenticated;`);
  // is_local = false (session-level, not transaction-local): pglite may run
  // each exec/query in its own implicit transaction, so a transaction-local
  // setting (is_local = true, the third `set_config` arg) would vanish
  // before the next query ever saw it. Supabase's PostgREST sets this
  // per-request at the session level for the same reason.
  if (userId === null) {
    await db.exec(`SELECT set_config('request.jwt.claim.sub', '', false);`);
  } else {
    await db.query(`SELECT set_config('request.jwt.claim.sub', $1, false);`, [
      userId,
    ]);
  }
}

/**
 * Drops back to the superuser role, bypassing RLS. Used only for test
 * fixture setup (e.g. inserting brand A's and brand B's rows as the
 * "system", before asserting what brand A's authenticated user can and
 * cannot see).
 */
export async function resetToSuperuser(db: PGlite) {
  await db.exec(`RESET ROLE;`);
}
