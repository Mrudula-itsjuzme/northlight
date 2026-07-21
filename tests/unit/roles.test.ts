import { describe, it, expect } from "vitest";
import { roleAtLeast, ROLE_RANK, brandRoles } from "@/lib/validation/brands";

describe("ROLE_RANK", () => {
  it("ranks roles from least to most privileged", () => {
    expect(ROLE_RANK.viewer).toBeLessThan(ROLE_RANK.editor);
    expect(ROLE_RANK.editor).toBeLessThan(ROLE_RANK.admin);
    expect(ROLE_RANK.admin).toBeLessThan(ROLE_RANK.owner);
  });

  it("has a rank entry for every role", () => {
    for (const role of brandRoles) {
      expect(typeof ROLE_RANK[role]).toBe("number");
    }
  });
});

describe("roleAtLeast", () => {
  it("returns true when role equals the minimum", () => {
    expect(roleAtLeast("admin", "admin")).toBe(true);
  });

  it("returns true when role exceeds the minimum", () => {
    expect(roleAtLeast("owner", "viewer")).toBe(true);
    expect(roleAtLeast("owner", "admin")).toBe(true);
    expect(roleAtLeast("admin", "editor")).toBe(true);
  });

  it("returns false when role is below the minimum", () => {
    expect(roleAtLeast("viewer", "editor")).toBe(false);
    expect(roleAtLeast("editor", "admin")).toBe(false);
    expect(roleAtLeast("admin", "owner")).toBe(false);
  });

  it("viewer is at least viewer but nothing higher", () => {
    expect(roleAtLeast("viewer", "viewer")).toBe(true);
    expect(roleAtLeast("viewer", "editor")).toBe(false);
    expect(roleAtLeast("viewer", "admin")).toBe(false);
    expect(roleAtLeast("viewer", "owner")).toBe(false);
  });

  it("owner satisfies every minimum", () => {
    for (const min of brandRoles) {
      expect(roleAtLeast("owner", min)).toBe(true);
    }
  });
});
