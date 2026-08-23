import { z } from 'zod';
import { uuidSchema } from './common';

export const E164_PHONE_PATTERN = /^\+[1-9]\d{6,14}$/;

export const applicantProfileSchema = z.object({
  legalName: z.string().min(2).max(200),
  displayName: z.string().min(1).max(120).nullish(),
  phone: z.string().regex(E164_PHONE_PATTERN, 'phone must be E.164').nullish(),
});
export type ApplicantProfileInput = z.infer<typeof applicantProfileSchema>;

export const upsertApplicantProfileSchema = applicantProfileSchema.extend({
  address: z.string().min(1).max(500).nullish(),
});
export type UpsertApplicantProfileInput = z.infer<typeof upsertApplicantProfileSchema>;

export const applicantProfilePublicSchema = z.object({
  id: uuidSchema,
  legalName: z.string(),
  displayName: z.string().nullable(),
  phone: z.string().nullable(),
  createdAt: z.string().datetime(),
});
export type ApplicantProfilePublic = z.infer<typeof applicantProfilePublicSchema>;
