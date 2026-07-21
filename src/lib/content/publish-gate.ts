import type { BrandRole } from "@/lib/validation/brands";

export type ClaimStatus = "unresolved" | "resolved" | "overridden";

export type ClaimForGate = {
  status: ClaimStatus;
};

export type PublishGateResult =
  | { canPublish: true }
  | { canPublish: false; reason: string };

/**
 * Pure publish-gate function: an article may publish iff every claim is
 * `resolved` or `overridden` — i.e. NO claim is `unresolved` — with one
 * exception path: an owner can record an override that resolves the
 * remaining unresolved claims, but ONLY if `actorRole === "owner"` and the
 * override was actually recorded (`overrideRecorded === true`, meaning the
 * caller has already written the audit fields — this function does not
 * perform the override itself, it only decides whether publishing is
 * allowed given that an override was or wasn't recorded).
 *
 * This function is intentionally pure (no DB access) so it can be
 * unit-tested exhaustively and reused identically both in the publish
 * server action and in the UI's "why is publish disabled" messaging.
 */
export function canPublish(
  claims: ClaimForGate[],
  actorRole: BrandRole,
  overrideRecorded: boolean,
): PublishGateResult {
  const unresolvedClaims = claims.filter((c) => c.status === "unresolved");

  if (unresolvedClaims.length === 0) {
    return { canPublish: true };
  }

  // There are unresolved claims. Publishing is blocked UNLESS an owner
  // override has been recorded.
  if (actorRole !== "owner") {
    return {
      canPublish: false,
      reason:
        unresolvedClaims.length === 1
          ? "1 claim is unresolved. Resolve it, or ask an owner to override."
          : `${unresolvedClaims.length} claims are unresolved. Resolve them, or ask an owner to override.`,
    };
  }

  if (!overrideRecorded) {
    return {
      canPublish: false,
      reason:
        "Unresolved claims remain. As an owner, you may override, but the override was not recorded.",
    };
  }

  return { canPublish: true };
}
