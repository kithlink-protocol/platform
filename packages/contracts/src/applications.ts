import { z } from 'zod';
import { cursorPageSchema, paginated, uuidSchema } from './common';

export const applicationStatuses = [
  'draft',
  'submitted',
  'in_review',
  'info_requested',
  'approved',
  'denied',
  'withdrawn',
  'adopted',
  'expired',
] as const;

export const applicationStatusSchema = z.enum(applicationStatuses);
export type ApplicationStatus = (typeof applicationStatuses)[number];

export const createApplicationSchema = z.object({
  animalId: uuidSchema,
  answers: z.record(z.unknown()).default({}),
});
export type CreateApplicationInput = z.infer<typeof createApplicationSchema>;

export const applicationPublicSchema = z.object({
  id: uuidSchema,
  status: applicationStatusSchema,
  animalId: uuidSchema,
  animalName: z.string(),
  shelterId: uuidSchema,
  shelterName: z.string(),
  submittedAt: z.string().datetime().nullable(),
  createdAt: z.string().datetime(),
});
export type ApplicationPublic = z.infer<typeof applicationPublicSchema>;

export const applicationCreatedResponseSchema = z.object({
  application: applicationPublicSchema,
  consentGrantId: uuidSchema,
});
export type ApplicationCreatedResponse = z.infer<typeof applicationCreatedResponseSchema>;

export const staffApplicationListQuerySchema = cursorPageSchema.extend({
  status: applicationStatusSchema.optional(),
});
export type StaffApplicationListQuery = z.infer<typeof staffApplicationListQuerySchema>;

export const applicationDecisionStatuses = [
  'in_review',
  'info_requested',
  'approved',
  'denied',
  'withdrawn',
  'adopted',
] as const;

export const applicationDecisionSchema = z.object({
  status: z.enum(applicationDecisionStatuses),
  note: z.string().min(1).max(2000).optional(),
});
export type ApplicationDecisionInput = z.infer<typeof applicationDecisionSchema>;

export const applicationListResponseSchema = paginated(applicationPublicSchema);
