import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

/**
 * Drizzle client for the app's own Postgres access (used by the background
 * job worker, server actions that need typed query building, and scripts).
 * This connects directly to Postgres via `DATABASE_URL` (Supabase's
 * connection string), separate from the Supabase JS client which talks to
 * PostgREST/Auth/Storage over HTTP.
 *
 * This module must only be imported server-side (route handlers, server
 * actions, scripts, the worker) — never from client components.
 */
let _client: ReturnType<typeof postgres> | null = null;

function getClient() {
  if (_client) return _client;
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error(
      "Missing DATABASE_URL. Copy .env.example to .env.local and fill in " +
        "your Supabase Postgres connection string.",
    );
  }
  _client = postgres(connectionString, { prepare: false });
  return _client;
}

export function getDb() {
  return drizzle(getClient(), { schema });
}

export { schema };
