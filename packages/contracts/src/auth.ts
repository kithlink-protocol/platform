import { z } from 'zod';

export const staffRoles = ['owner', 'admin', 'coordinator', 'volunteer', 'viewer'] as const;
export const staffRoleSchema = z.enum(staffRoles);
export type StaffRole = (typeof staffRoles)[number];

export const emailSchema = z.string().trim().toLowerCase().email();
export const passwordSchema = z
  .string()
  .min(10)
  .max(200)
  .regex(/[a-z]/, 'needs a lowercase letter')
  .regex(/[A-Z]/, 'needs an uppercase letter')
  .regex(/[0-9]/, 'needs a digit');

export const registerSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
});
export type RegisterInput = z.infer<typeof registerSchema>;

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1),
});
export type LoginInput = z.infer<typeof loginSchema>;

export const forgotPasswordSchema = z.object({
  email: emailSchema,
});
export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>;

export const resetPasswordSchema = z.object({
  token: z.string().min(10).max(200),
  password: passwordSchema,
});
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;

export const userPublicSchema = z.object({
  id: z.string(),
  email: z.string(),
  emailVerified: z.boolean(),
});
export type UserPublic = z.infer<typeof userPublicSchema>;

/** Membership of the authenticated user in one shelter. */
export const membershipSchema = z.object({
  shelterId: z.string(),
  shelterName: z.string(),
  role: staffRoleSchema,
});
export type Membership = z.infer<typeof membershipSchema>;

export const authSessionSchema = z.object({
  user: userPublicSchema,
  memberships: z.array(membershipSchema),
});
export type AuthSession = z.infer<typeof authSessionSchema>;
