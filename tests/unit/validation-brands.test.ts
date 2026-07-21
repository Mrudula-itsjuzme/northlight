import { describe, it, expect } from "vitest";
import {
  createBrandSchema,
  inviteMemberSchema,
  updateMemberRoleSchema,
} from "@/lib/validation/brands";

describe("createBrandSchema", () => {
  it("accepts a minimal valid brand", () => {
    expect(createBrandSchema.safeParse({ name: "Acme" }).success).toBe(true);
  });

  it("accepts an optional vertical and website URL", () => {
    expect(
      createBrandSchema.safeParse({
        name: "Acme",
        vertical: "haircare",
        websiteUrl: "https://acme.com",
      }).success,
    ).toBe(true);
  });

  it("accepts an empty-string website URL (optional field left blank)", () => {
    expect(
      createBrandSchema.safeParse({ name: "Acme", websiteUrl: "" }).success,
    ).toBe(true);
  });

  it("rejects an empty name", () => {
    expect(createBrandSchema.safeParse({ name: "" }).success).toBe(false);
  });

  it("rejects an invalid website URL", () => {
    expect(
      createBrandSchema.safeParse({ name: "Acme", websiteUrl: "not-a-url" })
        .success,
    ).toBe(false);
  });
});

describe("inviteMemberSchema", () => {
  it("accepts admin/editor/viewer roles", () => {
    for (const role of ["admin", "editor", "viewer"] as const) {
      expect(
        inviteMemberSchema.safeParse({ email: "a@b.com", role }).success,
      ).toBe(true);
    }
  });

  it("rejects inviting someone directly as owner", () => {
    expect(
      inviteMemberSchema.safeParse({ email: "a@b.com", role: "owner" })
        .success,
    ).toBe(false);
  });

  it("rejects an invalid email", () => {
    expect(
      inviteMemberSchema.safeParse({ email: "nope", role: "viewer" }).success,
    ).toBe(false);
  });
});

describe("updateMemberRoleSchema", () => {
  const memberId = "123e4567-e89b-12d3-a456-426614174000";

  it("accepts any valid role including owner", () => {
    for (const role of ["owner", "admin", "editor", "viewer"] as const) {
      expect(
        updateMemberRoleSchema.safeParse({ memberId, role }).success,
      ).toBe(true);
    }
  });

  it("rejects a non-uuid memberId", () => {
    expect(
      updateMemberRoleSchema.safeParse({ memberId: "not-a-uuid", role: "admin" })
        .success,
    ).toBe(false);
  });
});
