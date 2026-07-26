import { sql } from "drizzle-orm";
import type { User } from "@supabase/supabase-js";
import { getDb } from "@/db";
import { profiles } from "@/db/schema";

/**
 * Idempotently ensures that a public.profiles row exists for the given Supabase user.
 * Can be called with either a transaction client or the primary db instance.
 */
export async function ensureProfile(
  user: User,
  txClient?: Parameters<Parameters<ReturnType<typeof getDb>["transaction"]>[0]>[0],
): Promise<string> {
  const db = txClient ?? getDb();
  const userId = user.id;
  const email = user.email ?? "";
  const fullName =
    typeof user.user_metadata?.full_name === "string" && user.user_metadata.full_name.trim() !== ""
      ? user.user_metadata.full_name
      : null;

  await db
    .insert(profiles)
    .values({
      id: userId,
      email,
      fullName,
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: profiles.id,
      set: {
        email,
        fullName: fullName ? fullName : sql`${profiles.fullName}`,
        updatedAt: new Date(),
      },
    });

  return userId;
}
