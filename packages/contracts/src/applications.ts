import { z } from 'zod';
import { cursorPageSchema, paginated, uuidSchema } from './common';
import { artifactPublicSchema } from './artifacts';

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

export const applicationNoteSchema = z.object({
  id: uuidSchema,
  authorName: z.string().nullable(),
  body: z.string(),
  createdAt: z.string().datetime(),
});
export type ApplicationNote = z.infer<typeof applicationNoteSchema>;

export const addApplicationNoteSchema = z.object({
  body: z.string().min(1).max(4000),
});
export type AddApplicationNoteInput = z.infer<typeof addApplicationNoteSchema>;

export const applicationNotesResponseSchema = z.object({
  items: z.array(applicationNoteSchema),
});
export type ApplicationNotesResponse = z.infer<typeof applicationNotesResponseSchema>;

export const applicantHistorySchema = z.object({
  profile: z.object({
    legalName: z.string(),
    displayName: z.string().optional(),
    phone: z.string().optional(),
  }),
  applicationsAtShelter: z.array(
    z.object({
      id: uuidSchema,
      animalName: z.string(),
      status: applicationStatusSchema,
      submittedAt: z.string().datetime().nullable(),
      decidedAt: z.string().datetime().nullable(),
    }),
  ),
  sharedArtifacts: z.array(artifactPublicSchema),
  generatedAt: z.string().datetime(),
});
export type ApplicantHistory = z.infer<typeof applicantHistorySchema>;
export type ApplicantHistoryApplication = ApplicantHistory['applicationsAtShelter'][number];

export const checklistItemSchema = z.object({
  id: uuidSchema,
  label: z.string(),
  position: z.number().int(),
});
export type ChecklistItem = z.infer<typeof checklistItemSchema>;

export const checklistStateEntrySchema = z.object({
  itemId: uuidSchema,
  checked: z.boolean(),
});
export type ChecklistStateEntry = z.infer<typeof checklistStateEntrySchema>;

export const reviewChecklistPayloadSchema = z.object({
  items: z.array(checklistItemSchema),
  state: z.array(checklistStateEntrySchema),
});
export type ReviewChecklistPayload = z.infer<typeof reviewChecklistPayloadSchema>;

export const saveReviewChecklistSchema = z.object({
  labels: z.array(z.string().trim().min(1).max(160)).max(12),
});
export type SaveReviewChecklistInput = z.infer<typeof saveReviewChecklistSchema>;

export const saveChecklistStateSchema = z.object({
  entries: z.array(
    z.object({
      itemId: uuidSchema,
      checked: z.boolean(),
    }),
  ).max(12),
});
export type SaveChecklistStateInput = z.infer<typeof saveChecklistStateSchema>;

export const statsSchema = z.object({
  animalsAvailable: z.number().int(),
  openApplications: z.number().int(),
  avgPlacementHours30d: z.number().nullable(),
});
export type Stats = z.infer<typeof statsSchema>;
