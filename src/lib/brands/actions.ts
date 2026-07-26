"use server";

import { randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";

import { getDb } from "@/db";
import { brands, brandMembers, invites, profiles } from "@/db/schema";
import { createClient } from "@/lib/supabase/server";
import {
  createBrandSchema,
  inviteMemberSchema,
  updateMemberRoleSchema,
  type CreateBrandInput,
  type InviteMemberInput,
  type UpdateMemberRoleInput,
  type BrandRole,
} from "@/lib/validation/brands";
import { requireRoleOrThrow, RoleError } from "@/lib/brands/require-role";
import {
  CURRENT_BRAND_COOKIE,
  type ActionResult,
  type BrandListItem,
} from "@/lib/brands/types";
import { checkRateLimit } from "@/lib/rate-limit";

export type { ActionResult, BrandListItem };

function slugify(name: string): string {
  const base = name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
  const suffix = randomBytes(3).toString("hex");
  return `${base || "brand"}-${suffix}`;
}

async function getAuthedUserId(): Promise<string | null> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user?.id ?? null;
}

/**
 * Creates a brand and makes the calling user its owner in a single
 * transaction: an `brands` insert plus a `brand_members` insert with
 * role='owner'. Both succeed or both roll back — a brand can never exist
 * without an owner.
 */
export async function createBrand(
  input: CreateBrandInput,
): Promise<ActionResult<{ brandId: string }>> {
  const parsed = createBrandSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: "Invalid input.",
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }

  const userId = await getAuthedUserId();
  if (!userId) {
    return { ok: false, error: "You must be signed in to create a brand." };
  }

  const db = getDb();
  const { name, vertical, websiteUrl } = parsed.data;

  try {
    const brandId = await db.transaction(async (tx) => {
      const [brand] = await tx
        .insert(brands)
        .values({
          name,
          slug: slugify(name),
          vertical: vertical || null,
          websiteUrl: websiteUrl || null,
          createdBy: userId,
        })
        .returning({ id: brands.id });

      await tx.insert(brandMembers).values({
        brandId: brand.id,
        userId,
        role: "owner",
      });

      return brand.id;
    });

    revalidatePath("/", "layout");
    return { ok: true, data: { brandId } };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Failed to create brand.",
    };
  }
}

/** Lists every brand the calling user belongs to, with their role in each. */
export async function listBrandsForUser(): Promise<
  ActionResult<BrandListItem[]>
> {
  const userId = await getAuthedUserId();
  if (!userId) {
    return { ok: false, error: "You must be signed in." };
  }

  const db = getDb();
  const rows = await db
    .select({
      id: brands.id,
      name: brands.name,
      slug: brands.slug,
      vertical: brands.vertical,
      role: brandMembers.role,
    })
    .from(brandMembers)
    .innerJoin(brands, eq(brandMembers.brandId, brands.id))
    .where(eq(brandMembers.userId, userId));

  return {
    ok: true,
    data: rows.map((r) => ({ ...r, role: r.role as BrandRole })),
  };
}

/**
 * Sets the "current brand" cookie used by the dashboard shell to scope
 * queries. Verifies the caller is actually a member of the brand first, so
 * this can never be used to switch into a brand the user has no access to.
 */
export async function switchActiveBrand(
  brandId: string,
): Promise<ActionResult> {
  const userId = await getAuthedUserId();
  if (!userId) {
    return { ok: false, error: "You must be signed in." };
  }

  const db = getDb();
  const [member] = await db
    .select({ id: brandMembers.id })
    .from(brandMembers)
    .where(
      and(eq(brandMembers.brandId, brandId), eq(brandMembers.userId, userId)),
    )
    .limit(1);

  if (!member) {
    return { ok: false, error: "You are not a member of this brand." };
  }

  cookies().set(CURRENT_BRAND_COOKIE, brandId, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  });

  revalidatePath("/", "layout");
  return { ok: true, data: undefined };
}

export async function getActiveBrandId(): Promise<string | null> {
  return cookies().get(CURRENT_BRAND_COOKIE)?.value ?? null;
}

/**
 * Reads `brands.is_demo` for one brand — the single source of truth every
 * page uses to decide whether to render the shared `<DataBadge kind="demo" />`
 * (src/lib/analytics/data-labels.ts) at the page/brand level, rather than
 * each page re-deriving "is this a demo brand" its own way. Returns false
 * (never throws) if the brand can't be found, so a stale/missing brandId
 * never blocks a page from rendering — it just won't show the badge.
 */
export async function isBrandDemo(brandId: string): Promise<boolean> {
  const db = getDb();
  const [row] = await db.select({ isDemo: brands.isDemo }).from(brands).where(eq(brands.id, brandId)).limit(1);
  return row?.isDemo ?? false;
}

/**
 * Invites a new member by email. Owner/admin only — enforced here in the
 * application layer via `requireRoleOrThrow`, not just RLS (RLS only
 * enforces the brand boundary, not this role gate; see DATABASE.md).
 */
export async function inviteMember(
  brandId: string,
  input: InviteMemberInput,
): Promise<ActionResult<{ inviteId: string; token: string }>> {
  const parsed = inviteMemberSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: "Invalid input.",
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }

  try {
    const { userId } = await requireRoleOrThrow(brandId, "admin");

    const limit = checkRateLimit("inviteSend", brandId);
    if (!limit.ok) return limit;

    const db = getDb();
    const token = randomBytes(24).toString("hex");
    const expiresAt = new Date(Date.now() + 1000 * 60 * 60 * 24 * 7); // 7 days

    const [invite] = await db
      .insert(invites)
      .values({
        brandId,
        email: parsed.data.email,
        role: parsed.data.role,
        token,
        status: "pending",
        invitedBy: userId,
        expiresAt,
      })
      .returning({ id: invites.id, token: invites.token });

    revalidatePath(`/brands/${brandId}/members`);
    return { ok: true, data: { inviteId: invite.id, token: invite.token } };
  } catch (err) {
    if (err instanceof RoleError) {
      return { ok: false, error: err.message };
    }
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Failed to invite member.",
    };
  }
}

/**
 * Accepts a pending invite for the currently authenticated user: creates the
 * brand_members row with the invited role, and marks the invite accepted.
 * Requires the invite email to match the authenticated user's email so a
 * stolen/leaked token can't be redeemed by a different account.
 */
export async function acceptInvite(token: string): Promise<ActionResult<{ brandId: string }>> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { ok: false, error: "You must be signed in to accept an invite." };
  }

  const db = getDb();
  const [invite] = await db
    .select()
    .from(invites)
    .where(eq(invites.token, token))
    .limit(1);

  if (!invite) {
    return { ok: false, error: "This invite does not exist." };
  }
  if (invite.status !== "pending") {
    return { ok: false, error: `This invite has already been ${invite.status}.` };
  }
  if (invite.expiresAt.getTime() < Date.now()) {
    return { ok: false, error: "This invite has expired." };
  }
  if (invite.email.toLowerCase() !== (user.email ?? "").toLowerCase()) {
    return {
      ok: false,
      error: "This invite was sent to a different email address.",
    };
  }

  try {
    await db.transaction(async (tx) => {
      await tx
        .insert(brandMembers)
        .values({ brandId: invite.brandId, userId: user.id, role: invite.role })
        .onConflictDoNothing();

      await tx
        .update(invites)
        .set({ status: "accepted" })
        .where(eq(invites.id, invite.id));

      // Ensure a profile row exists (in production this is created by the
      // handle_new_user() trigger documented in DATABASE.md; this is a
      // defensive fallback so accept-invite never fails on a missing row).
      await tx
        .insert(profiles)
        .values({ id: user.id, email: user.email ?? "" })
        .onConflictDoNothing();
    });

    revalidatePath("/", "layout");
    return { ok: true, data: { brandId: invite.brandId } };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Failed to accept invite.",
    };
  }
}

/** Revokes a pending invite. Owner/admin only. */
export async function revokeInvite(
  brandId: string,
  inviteId: string,
): Promise<ActionResult> {
  try {
    await requireRoleOrThrow(brandId, "admin");

    const db = getDb();
    await db
      .update(invites)
      .set({ status: "revoked" })
      .where(and(eq(invites.id, inviteId), eq(invites.brandId, brandId)));

    revalidatePath(`/brands/${brandId}/members`);
    return { ok: true, data: undefined };
  } catch (err) {
    if (err instanceof RoleError) {
      return { ok: false, error: err.message };
    }
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Failed to revoke invite.",
    };
  }
}

/** Changes a member's role. Owner only (prevents privilege escalation by admins). */
export async function updateMemberRole(
  brandId: string,
  input: UpdateMemberRoleInput,
): Promise<ActionResult> {
  const parsed = updateMemberRoleSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: "Invalid input.",
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }

  try {
    await requireRoleOrThrow(brandId, "owner");

    const db = getDb();
    await db
      .update(brandMembers)
      .set({ role: parsed.data.role })
      .where(
        and(
          eq(brandMembers.id, parsed.data.memberId),
          eq(brandMembers.brandId, brandId),
        ),
      );

    revalidatePath(`/brands/${brandId}/members`);
    return { ok: true, data: undefined };
  } catch (err) {
    if (err instanceof RoleError) {
      return { ok: false, error: err.message };
    }
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Failed to update role.",
    };
  }
}

/** Removes a member from a brand. Owner/admin only. */
export async function removeMember(
  brandId: string,
  memberId: string,
): Promise<ActionResult> {
  try {
    await requireRoleOrThrow(brandId, "admin");

    const db = getDb();
    await db
      .delete(brandMembers)
      .where(
        and(eq(brandMembers.id, memberId), eq(brandMembers.brandId, brandId)),
      );

    revalidatePath(`/brands/${brandId}/members`);
    return { ok: true, data: undefined };
  } catch (err) {
    if (err instanceof RoleError) {
      return { ok: false, error: err.message };
    }
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Failed to remove member.",
    };
  }
}
