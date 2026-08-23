import { z } from 'zod';
import { paginated, uuidSchema } from './common';

export const artifactTypes = [
  'lease_addendum',
  'vet_record',
  'gov_id',
  'utility_bill',
  'other',
] as const;
export const artifactStates = [
  'uploaded',
  'parsing',
  'parsed',
  'pending_review',
  'verified',
  'rejected',
  'expired',
] as const;

export const artifactTypeSchema = z.enum(artifactTypes);
export type ArtifactType = (typeof artifactTypes)[number];
export const artifactStateSchema = z.enum(artifactStates);
export type ArtifactState = (typeof artifactStates)[number];

export const artifactMimes = ['application/pdf', 'image/png', 'image/jpeg', 'image/webp'] as const;

export const ARTIFACT_MAX_BYTES = 26_214_400;

export const artifactInitUploadSchema = z.object({
  type: artifactTypeSchema,
  mime: z.enum(artifactMimes),
  bytes: z.number().int().min(1).max(ARTIFACT_MAX_BYTES),
});
export type ArtifactInitUploadInput = z.infer<typeof artifactInitUploadSchema>;

export const uploadCompleteSchema = z.object({
  sha256: z.string().regex(/^[0-9a-f]{64}$/, 'sha256 must be lowercase hex'),
  mime: z.enum(artifactMimes).optional(),
});

export const artifactManualExtractSchema = z.object({
  extracted: z.record(z.unknown()),
});

export const artifactInitUploadResponseSchema = z.object({
  artifact: z.object({
    id: uuidSchema,
    type: artifactTypeSchema,
    state: artifactStateSchema,
  }),
  upload: z.object({
    url: z.string().url(),
    fields: z.record(z.string()).nullable(),
    expiresIn: z.number().int().positive(),
  }),
});
export type ArtifactInitUploadResponse = z.infer<typeof artifactInitUploadResponseSchema>;

export const verificationSummarySchema = z.object({
  shelterName: z.string(),
  outcome: z.string(),
  method: z.string(),
  verifiedAt: z.string().datetime(),
  validUntil: z.string().datetime().optional(),
});
export type VerificationSummary = z.infer<typeof verificationSummarySchema>;

export const artifactPublicSchema = z.object({
  id: uuidSchema,
  type: artifactTypeSchema,
  state: artifactStateSchema,
  mime: z.string().optional(),
  bytes: z.number().int().nonnegative().optional(),
  sha256: z.string().optional(),
  confidence: z.number().min(0).max(1).nullable(),
  extracted: z.record(z.unknown()).nullable(),
  networkVerified: z.boolean(),
  verifications: z.array(verificationSummarySchema).default([]),
  createdAt: z.string().datetime(),
});
export type ArtifactPublic = z.infer<typeof artifactPublicSchema>;

export const artifactWithVerificationsSchema = artifactPublicSchema;
export type ArtifactWithVerifications = z.infer<typeof artifactWithVerificationsSchema>;

export const artifactListQuerySchema = z.object({
  includeVerifications: z.coerce.boolean().default(false),
});

export const staffArtifactListQuerySchema = z.object({
  applicantId: z.string().uuid(),
});

export const artifactPageSchema = paginated(artifactWithVerificationsSchema);
