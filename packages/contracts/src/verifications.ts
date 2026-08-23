import { z } from 'zod';
import { uuidSchema } from './common';
import { artifactWithVerificationsSchema } from './artifacts';

export const verificationMethods = [
  'landlord_call',
  'document_audit',
  'prior_verification',
  'clinic_api',
  'automated',
] as const;
export const verificationMethodSchema = z.enum(verificationMethods);
export type VerificationMethod = (typeof verificationMethods)[number];

export const verificationOutcomes = [
  'confirmed',
  'failed_contact',
  'discrepancy',
  'revoked',
] as const;
export const verificationOutcomeSchema = z.enum(verificationOutcomes);
export type VerificationOutcome = (typeof verificationOutcomes)[number];

export const createVerificationSchema = z.object({
  method: verificationMethodSchema,
  outcome: z.enum(['confirmed', 'failed_contact', 'discrepancy']),
  notesRedacted: z.string().min(1).max(2000).optional(),
  callLogUrl: z.string().url().max(1024).optional(),
  validUntil: z.string().datetime().optional(),
});
export type CreateVerificationInput = z.infer<typeof createVerificationSchema>;

export const staffApplicationDetailSchema = z.object({
  application: z.object({
    id: uuidSchema,
    status: z.string(),
    animalName: z.string(),
    submittedAt: z.string().datetime().nullable(),
    answers: z.record(z.unknown()),
  }),
  applicant: z.object({
    legalName: z.string(),
    displayName: z.string().nullable(),
    phone: z.string().nullable(),
  }),
  consent: z.object({
    id: uuidSchema.nullable(),
    scope: z.string().nullable(),
    status: z.string().nullable(),
  }),
  artifacts: z.array(artifactWithVerificationsSchema),
});
export type StaffApplicationDetail = z.infer<typeof staffApplicationDetailSchema>;

export const verificationRevocationSchema = z.object({
  revoked: z.number().int().nonnegative(),
  networkVerified: z.boolean(),
});
export type VerificationRevocation = z.infer<typeof verificationRevocationSchema>;
