import "server-only";
import { eq, and } from "drizzle-orm";
import { getDb } from "@/db";
import { brandMembers } from "@/db/schema";
import { createClient } from "@/lib/supabase/server";
import { roleAtLeast, type BrandRole } from "@/lib/validation/brands";

export class RoleError extends Error {
  constructor(message = "You do not have permission to perform this action.") {
    super(message);
    this.name = "RoleError";
  }
}

export type RequireRoleResult =
  | { ok: true; role: BrandRole; userId: string }
  | { ok: false; error: string };

/**
 * Reads the caller's `brand_members.role` for `brandId` and confirms it is
 * at least `minimumRole` (owner > admin > editor > viewer). This is
 * application-layer authorization on top of RLS — RLS only enforces the
 * brand boundary (can this user see brand X's rows at all), not
 * fine-grained role gates like "only owner/admin can invite members". See
 * DATABASE.md.
 *
 * Returns a discriminated result rather than throwing by default so server
 * actions can surface a clean error to the UI; use `requireRoleOrThrow` when
 * a thrown error is more convenient (e.g. inside a route handler).
 */
export async function requireRole(
  brandId: string,
  minimumRole: BrandRole,
): Promise<RequireRoleResult> {
  const supabase = createClient();

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return { ok: false, error: "You must be signed in." };
  }

  // Read the membership row via Drizzle (direct Postgres connection) rather
  // than the Supabase JS client: this is the same code path the pglite
  // integration tests exercise, and it keeps a single source of truth for
  // "how do we read brand_members" across server actions and tests. RLS
  // still applies to any Supabase-client reads elsewhere; this helper is
  // purely an application-layer role gate layered on top (see DATABASE.md).
  const db = getDb();
  const [member] = await db
    .select({ role: brandMembers.role })
    .from(brandMembers)
    .where(
      and(eq(brandMembers.brandId, brandId), eq(brandMembers.userId, user.id)),
    )
    .limit(1);

  if (!member) {
    return { ok: false, error: "You are not a member of this brand." };
  }

  const role = member.role as BrandRole;

  if (!roleAtLeast(role, minimumRole)) {
    return {
      ok: false,
      error: `This action requires the "${minimumRole}" role or higher; you have "${role}".`,
    };
  }

  return { ok: true, role, userId: user.id };
}

export async function requireRoleOrThrow(
  brandId: string,
  minimumRole: BrandRole,
): Promise<{ role: BrandRole; userId: string }> {
  const result = await requireRole(brandId, minimumRole);
  if (!result.ok) {
    throw new RoleError(result.error);
  }
  return { role: result.role, userId: result.userId };
}
