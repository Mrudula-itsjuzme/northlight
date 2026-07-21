import { z } from "zod";

export const brandRoles = ["owner", "admin", "editor", "viewer"] as const;
export type BrandRole = (typeof brandRoles)[number];

/** Roles allowed to perform a given privileged action, most restrictive first. */
export const ROLE_RANK: Record<BrandRole, number> = {
  viewer: 0,
  editor: 1,
  admin: 2,
  owner: 3,
};

export function roleAtLeast(role: BrandRole, minimum: BrandRole): boolean {
  return ROLE_RANK[role] >= ROLE_RANK[minimum];
}

export const createBrandSchema = z.object({
  name: z.string().min(1, "Brand name is required").max(200),
  vertical: z.string().max(100).optional(),
  websiteUrl: z
    .string()
    .url("Enter a valid URL")
    .optional()
    .or(z.literal("")),
});

export type CreateBrandInput = z.infer<typeof createBrandSchema>;

export const inviteMemberSchema = z.object({
  email: z.string().email("Enter a valid email address"),
  role: z.enum(brandRoles).exclude(["owner"]),
});

export type InviteMemberInput = z.infer<typeof inviteMemberSchema>;

export const updateMemberRoleSchema = z.object({
  memberId: z.string().uuid(),
  role: z.enum(brandRoles),
});

export type UpdateMemberRoleInput = z.infer<typeof updateMemberRoleSchema>;
