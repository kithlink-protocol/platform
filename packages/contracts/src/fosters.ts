import { z } from 'zod';
import { uuidSchema } from './common';

export const fosterSkills = [
  'neonatal',
  'post_op',
  'reactive',
  'medical',
  'behavior',
] as const;
export const fosterSkillSchema = z.enum(fosterSkills);
export type FosterSkill = (typeof fosterSkills)[number];

export const fosterEnvironmentSchema = z.object({
  residentPets: z.boolean().optional(),
  children: z.boolean().optional(),
  fencedYard: z.boolean().optional(),
});
export type FosterEnvironment = z.infer<typeof fosterEnvironmentSchema>;

export const fosterHomeSchema = z.object({
  id: uuidSchema,
  homeName: z.string(),
  primaryContactEmail: z.string(),
  capacity: z.number().int(),
  environment: fosterEnvironmentSchema,
  skills: z.array(z.string()),
  active: z.boolean(),
  currentPlacements: z.number().int(),
});
export type FosterHome = z.infer<typeof fosterHomeSchema>;

export const upsertFosterHomeSchema = z.object({
  homeName: z.string().min(2).max(120),
  primaryContactEmail: z.string().email(),
  capacity: z.number().int().min(1).max(20),
  environment: fosterEnvironmentSchema.optional(),
  skills: z.array(fosterSkillSchema).max(6).default([]),
  active: z.boolean().default(true),
});
export type UpsertFosterHomeInput = z.infer<typeof upsertFosterHomeSchema>;

export const fosterHomeListResponseSchema = z.object({
  items: z.array(fosterHomeSchema),
});
export type FosterHomeListResponse = z.infer<typeof fosterHomeListResponseSchema>;

export const fosterPlacementStatuses = ['active', 'closed'] as const;
export const fosterPlacementStatusSchema = z.enum(fosterPlacementStatuses);
export type FosterPlacementStatus = (typeof fosterPlacementStatuses)[number];

export const fosterPlacementSchema = z.object({
  id: uuidSchema,
  homeId: uuidSchema,
  animalId: uuidSchema,
  animalName: z.string(),
  startedAt: z.string().datetime(),
  nextCheckIn: z.string().datetime(),
  status: fosterPlacementStatusSchema,
});
export type FosterPlacement = z.infer<typeof fosterPlacementSchema>;

export const createPlacementSchema = z.object({
  homeId: uuidSchema,
  animalId: uuidSchema,
});
export type CreatePlacementInput = z.infer<typeof createPlacementSchema>;

export const fosterPlacementListQuerySchema = z.object({
  status: fosterPlacementStatusSchema.optional(),
});
export type FosterPlacementListQuery = z.infer<typeof fosterPlacementListQuerySchema>;

export const fosterPlacementListResponseSchema = z.object({
  items: z.array(fosterPlacementSchema),
});
export type FosterPlacementListResponse = z.infer<
  typeof fosterPlacementListResponseSchema
>;

/** Deterministic, recomputed-on-read check-in key — never stored. */
export const fosterCheckInKeySchema = z.string().min(32).max(128);

export const fosterCheckInViewQuerySchema = z.object({
  fp: uuidSchema,
  k: fosterCheckInKeySchema,
});

export const fosterCheckInViewSchema = z.object({
  animalName: z.string(),
  homeName: z.string(),
});
export type FosterCheckInView = z.infer<typeof fosterCheckInViewSchema>;

export const fosterCheckInSubmitSchema = z.object({
  fp: uuidSchema,
  k: fosterCheckInKeySchema,
  notes: z.string().min(1).max(2000),
  concerns: z.boolean().default(false),
});
export type FosterCheckInSubmitInput = z.infer<typeof fosterCheckInSubmitSchema>;

export const fosterUpdateViewSchema = z.object({
  id: uuidSchema,
  notes: z.string(),
  concerns: z.boolean(),
  createdAt: z.string().datetime(),
});
export type FosterUpdateView = z.infer<typeof fosterUpdateViewSchema>;

export const fosterUpdatesResponseSchema = z.object({
  items: z.array(fosterUpdateViewSchema),
});
export type FosterUpdatesResponse = z.infer<typeof fosterUpdatesResponseSchema>;
