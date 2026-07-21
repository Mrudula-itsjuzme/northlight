import { describe, it, expect } from "vitest";
import {
  signupSchema,
  loginSchema,
  requestPasswordResetSchema,
  updatePasswordSchema,
  updateProfileSchema,
} from "@/lib/validation/auth";

describe("signupSchema", () => {
  const valid = {
    fullName: "Ada Lovelace",
    email: "ada@example.com",
    password: "supersecret1",
    confirmPassword: "supersecret1",
  };

  it("accepts valid input", () => {
    expect(signupSchema.safeParse(valid).success).toBe(true);
  });

  it("rejects mismatched passwords", () => {
    const result = signupSchema.safeParse({
      ...valid,
      confirmPassword: "different",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(
        result.error.issues.some((i) => i.path.includes("confirmPassword")),
      ).toBe(true);
    }
  });

  it("rejects invalid email", () => {
    expect(signupSchema.safeParse({ ...valid, email: "not-an-email" }).success).toBe(
      false,
    );
  });

  it("rejects short passwords", () => {
    expect(
      signupSchema.safeParse({
        ...valid,
        password: "short",
        confirmPassword: "short",
      }).success,
    ).toBe(false);
  });

  it("rejects empty full name", () => {
    expect(signupSchema.safeParse({ ...valid, fullName: "" }).success).toBe(false);
  });
});

describe("loginSchema", () => {
  it("accepts valid credentials", () => {
    expect(
      loginSchema.safeParse({ email: "a@b.com", password: "x" }).success,
    ).toBe(true);
  });

  it("rejects empty password", () => {
    expect(
      loginSchema.safeParse({ email: "a@b.com", password: "" }).success,
    ).toBe(false);
  });

  it("rejects invalid email", () => {
    expect(
      loginSchema.safeParse({ email: "nope", password: "x" }).success,
    ).toBe(false);
  });
});

describe("requestPasswordResetSchema", () => {
  it("accepts a valid email", () => {
    expect(
      requestPasswordResetSchema.safeParse({ email: "a@b.com" }).success,
    ).toBe(true);
  });

  it("rejects an invalid email", () => {
    expect(
      requestPasswordResetSchema.safeParse({ email: "nope" }).success,
    ).toBe(false);
  });
});

describe("updatePasswordSchema", () => {
  it("accepts matching passwords >= 8 chars", () => {
    expect(
      updatePasswordSchema.safeParse({
        password: "longenough",
        confirmPassword: "longenough",
      }).success,
    ).toBe(true);
  });

  it("rejects mismatched passwords", () => {
    expect(
      updatePasswordSchema.safeParse({
        password: "longenough",
        confirmPassword: "different",
      }).success,
    ).toBe(false);
  });
});

describe("updateProfileSchema", () => {
  it("accepts a valid full name", () => {
    expect(updateProfileSchema.safeParse({ fullName: "Grace Hopper" }).success).toBe(
      true,
    );
  });

  it("rejects an empty full name", () => {
    expect(updateProfileSchema.safeParse({ fullName: "" }).success).toBe(false);
  });
});
