import { z } from 'zod';
import { uuidSchema } from './common';

export const JOURNEY_DAY_OFFSETS = [2, 14, 30, 365] as const;

const DAY_LABELS: Record<number, string> = {
  2: 'First nights',
  14: 'Settling in',
  30: 'One month home',
  365: 'Gotcha Day anniversary',
};

export function labelForDay(dayOffset: number): string {
  return DAY_LABELS[dayOffset] ?? `Day ${dayOffset}`;
}

export const journeyStatuses = ['active', 'completed', 'opted_out', 'returned'] as const;
export const journeyStatusSchema = z.enum(journeyStatuses);
export type JourneyStatus = (typeof journeyStatuses)[number];

export const journeyTouchpointStatuses = ['scheduled', 'sent', 'done', 'skipped'] as const;
export type JourneyTouchpointStatus = (typeof journeyTouchpointStatuses)[number];

export const journeyTopicValues = [
  'potty',
  'chewing',
  'vet',
  'intros',
  'food',
  'training',
  'other',
] as const;
export const journeyTopicSchema = z.enum(journeyTopicValues);
export type JourneyTopic = (typeof journeyTopicValues)[number];

export const journeyTokenSchema = z.string().min(20).max(200);

export const journeyPublicViewQuerySchema = z.object({ jt: journeyTokenSchema });
export type JourneyPublicViewQuery = z.infer<typeof journeyPublicViewQuerySchema>;

export const journeyPublicViewSchema = z.object({
  animalName: z.string(),
  shelterName: z.string(),
  dayOffset: z.number().int(),
  dayLabel: z.string(),
  alreadyDone: z.boolean(),
});
export type JourneyPublicView = z.infer<typeof journeyPublicViewSchema>;

export const journeyTouchpointViewSchema = z.object({
  dayOffset: z.number().int().min(0).max(400),
  dayLabel: z.string(),
  sentAt: z.string().datetime().nullable(),
});
export type JourneyTouchpointView = z.infer<typeof journeyTouchpointViewSchema>;

export const journeyStatusViewSchema = z.object({
  id: uuidSchema,
  animalName: z.string(),
  adopterEmail: z.string().nullable(),
  dayOffset: z.number().int(),
  dayLabel: z.string(),
  status: journeyStatusSchema,
  risk: z.boolean(),
  lastResponseAt: z.string().datetime().nullable(),
});
export type JourneyStatusView = z.infer<typeof journeyStatusViewSchema>;

export const journeyListResponseSchema = z.object({
  items: z.array(journeyStatusViewSchema),
});
export type JourneyListResponse = z.infer<typeof journeyListResponseSchema>;

export const journeyResponseViewSchema = z.object({
  touchpointId: uuidSchema,
  dayOffset: z.number().int(),
  petMood: z.number().int().min(1).max(5),
  ownerMood: z.number().int().min(1).max(5),
  topics: z.array(z.string()),
  note: z.string().nullable(),
  hasConcern: z.boolean(),
  createdAt: z.string().datetime(),
});
export type JourneyResponseView = z.infer<typeof journeyResponseViewSchema>;

export const journeyCaseViewSchema = z.object({
  id: uuidSchema,
  kind: z.enum(['concern', 'return']),
  reason: z.string(),
  status: z.enum(['open', 'resolved']),
  openedAt: z.string().datetime(),
  resolvedAt: z.string().datetime().nullable(),
  resolutionNote: z.string().nullable(),
});
export type JourneyCaseView = z.infer<typeof journeyCaseViewSchema>;

export const journeyDetailSchema = z.object({
  id: uuidSchema,
  animalName: z.string(),
  adopterEmail: z.string().nullable(),
  status: journeyStatusSchema,
  startedAt: z.string().datetime(),
  touchpoints: z.array(journeyTouchpointViewSchema),
  responses: z.array(journeyResponseViewSchema),
  cases: z.array(journeyCaseViewSchema),
});
export type JourneyDetail = z.infer<typeof journeyDetailSchema>;

export const journeyRespondSchema = z.object({
  token: journeyTokenSchema,
  petMood: z.number().int().min(1).max(5),
  ownerMood: z.number().int().min(1).max(5),
  topics: z.array(journeyTopicSchema).max(4).default([]),
  note: z.string().max(1000).optional(),
  wantFollowUp: z.boolean().default(false),
});
export type JourneyRespondInput = z.infer<typeof journeyRespondSchema>;

export const journeySkipSchema = z.object({ token: journeyTokenSchema });
export type JourneySkipInput = z.infer<typeof journeySkipSchema>;

export const journeyActionResultSchema = z.object({ ok: z.literal(true) });
export type JourneyActionResult = z.infer<typeof journeyActionResultSchema>;

export const journeyCaseResolveSchema = z.object({
  resolutionNote: z.string().min(1).max(2000),
});
export type JourneyCaseResolveInput = z.infer<typeof journeyCaseResolveSchema>;

export const journeyReturnSchema = z.object({
  reason: z.string().min(1).max(2000),
});
export type JourneyReturnInput = z.infer<typeof journeyReturnSchema>;
