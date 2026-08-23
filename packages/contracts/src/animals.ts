import { z } from 'zod';
import { cursorPageSchema, paginated, uuidSchema } from './common';
import { slugSchema } from './shelters';

export const animalSpecies = ['dog', 'cat', 'other'] as const;
export const animalSexes = ['male', 'female', 'unknown'] as const;
export const animalSizes = ['small', 'medium', 'large', 'xl'] as const;
export const animalAgeClasses = ['baby', 'young', 'adult', 'senior'] as const;
export type AnimalAgeClass = (typeof animalAgeClasses)[number];
export const animalStatuses = [
  'draft',
  'available',
  'pending',
  'adopted',
  'unavailable',
] as const;

export const animalStatusSchema = z.enum(animalStatuses);
export type AnimalStatus = (typeof animalStatuses)[number];

export const sterilizationStatuses = [
  'unknown',
  'scheduled',
  'completed',
  'voucher_issued',
] as const;
export type SterilizationStatus = (typeof sterilizationStatuses)[number];

// Buckets derive from birthYear only: baby <1y, young 1-2, adult 3-7, senior 8+.
export function ageToAgeClass(birthYear: number | null, now: Date = new Date()): AnimalAgeClass | null {
  if (birthYear === null) return null;
  const age = now.getUTCFullYear() - birthYear;
  if (age < 1) return 'baby';
  if (age <= 2) return 'young';
  if (age <= 7) return 'adult';
  return 'senior';
}

const traitsSchema = z
  .object({
    goodWithKids: z.boolean().optional(),
    goodWithDogs: z.boolean().optional(),
    goodWithCats: z.boolean().optional(),
    energyLevel: z.enum(['low', 'medium', 'high']).optional(),
    specialNeeds: z.boolean().optional(),
  })
  .strip();

export const sterilizationInputSchema = z.object({
  status: z.enum(sterilizationStatuses).default('unknown'),
  dueDate: z.string().datetime().nullish(),
  voucherRef: z.string().max(120).nullish(),
});
export type SterilizationInput = z.infer<typeof sterilizationInputSchema>;

export const animalCreateSchema = z.object({
  name: z.string().min(1).max(120),
  species: z.enum(animalSpecies),
  breed: z.string().max(160).nullish(),
  birthYear: z.number().int().min(1980).max(2100).nullish(),
  sex: z.enum(animalSexes).default('unknown'),
  size: z.enum(animalSizes).nullish(),
  description: z.string().max(5000).nullish(),
  status: animalStatusSchema.default('available'),
  medical: z.record(z.unknown()).default({}),
  traits: traitsSchema.default({}),
  sterilization: sterilizationInputSchema.default({}),
});
export type AnimalCreateInput = z.infer<typeof animalCreateSchema>;

export const animalUpdateSchema = animalCreateSchema.partial();
export type AnimalUpdateInput = z.infer<typeof animalUpdateSchema>;

export const animalPhotoPublicSchema = z.object({
  id: uuidSchema,
  position: z.number().int(),
  altText: z.string().nullable(),
  /** Absolute URL or API-relative path (/public/v1/...); null when photo not yet uploaded. */
  url: z.union([z.string().url(), z.string().regex(/^\/\S+$/)]).nullable(),
});
export type AnimalPhotoPublic = z.infer<typeof animalPhotoPublicSchema>;

export const animalPublicSchema = z.object({
  id: uuidSchema,
  shelterId: uuidSchema,
  name: z.string(),
  species: z.enum(animalSpecies),
  breed: z.string().nullable(),
  birthYear: z.number().int().nullable(),
  sex: z.enum(animalSexes),
  size: z.enum(animalSizes).nullable(),
  ageClass: z.enum(animalAgeClasses).nullable(),
  status: animalStatusSchema,
  description: z.string().nullable(),
  medical: z.record(z.unknown()),
  traits: z.record(z.unknown()),
  sterilization: z.object({
    status: z.enum(sterilizationStatuses),
    dueDate: z.string().datetime().nullable(),
    voucherRef: z.string().nullable(),
  }),
  photos: z.array(animalPhotoPublicSchema).default([]),
  createdAt: z.string().datetime(),
});
export type AnimalPublic = z.infer<typeof animalPublicSchema>;

export const animalListQuerySchema = cursorPageSchema.extend({
  species: z.enum(animalSpecies).optional(),
  status: animalStatusSchema.optional(),
});
export type AnimalListQuery = z.infer<typeof animalListQuerySchema>;
export const animalListResponseSchema = paginated(animalPublicSchema);

export const animalSearchQuerySchema = cursorPageSchema.extend({
  species: z.enum(animalSpecies).optional(),
  sex: z.enum(animalSexes).optional(),
  size: z.enum(animalSizes).optional(),
  ageClass: z.enum(animalAgeClasses).optional(),
  q: z.string().max(120).optional(),
  shelterSlug: slugSchema.optional(),
  nearLat: z.coerce.number().min(-90).max(90).optional(),
  nearLng: z.coerce.number().min(-180).max(180).optional(),
  radiusKm: z.coerce.number().min(1).max(500).optional(),
  // Trait facets: coerced from query strings; map to traits_json filters server-side.
  goodWithKids: z.coerce.boolean().optional(),
  goodWithDogs: z.coerce.boolean().optional(),
  goodWithCats: z.coerce.boolean().optional(),
  energy: z.enum(['low', 'medium', 'high']).optional(),
});
export type AnimalSearchQuery = z.infer<typeof animalSearchQuerySchema>;

export const animalSearchItemSchema = animalPublicSchema.extend({
  shelterName: z.string(),
  shelterSlug: slugSchema,
  distanceKm: z.number().nullable(),
});
export type AnimalSearchItem = z.infer<typeof animalSearchItemSchema>;
export const animalSearchResponseSchema = paginated(animalSearchItemSchema);

export const favoriteSchema = z.object({
  id: uuidSchema,
  animalId: uuidSchema,
  animalName: z.string(),
  shelterSlug: slugSchema,
  shelterName: z.string(),
  animalStatus: animalStatusSchema,
  addedAt: z.string().datetime(),
});
export type Favorite = z.infer<typeof favoriteSchema>;
export const favoritesResponseSchema = paginated(favoriteSchema);
export type FavoritesResponse = z.infer<typeof favoritesResponseSchema>;

export const OBSERVATION_TAGS = [
  'playful',
  'fearful',
  'reactive',
  'calm',
  'curious',
  'vocal',
  'snuggly',
  'independent',
] as const;
export type ObservationTag = (typeof OBSERVATION_TAGS)[number];

/** Anon-safe behavior snapshot: never carries author identity. */
export const behaviorObservationSchema = z.object({
  id: uuidSchema,
  fasScore: z.number().int().min(0).max(4).nullable(),
  tags: z.array(z.enum(OBSERVATION_TAGS)),
  note: z.string().max(1000).nullable(),
  createdAt: z.string().datetime(),
});
export type BehaviorObservation = z.infer<typeof behaviorObservationSchema>;

export const addObservationSchema = z
  .object({
    fasScore: z.number().int().min(0).max(4).nullish(),
    tags: z.array(z.enum(OBSERVATION_TAGS)).max(4).default([]),
    note: z.string().max(1000).nullish(),
  })
  .refine(input => input.fasScore != null || (input.note ?? '').length > 0, {
    message: 'An observation needs a stress score or a note',
  });
export type AddObservationInput = z.infer<typeof addObservationSchema>;

export const animalDetailSchema = animalPublicSchema.extend({
  shelter: z.object({
    name: z.string(),
    slug: slugSchema,
    city: z.string().nullable(),
    state: z.string().nullable(),
  }),
  observations: z.array(behaviorObservationSchema).max(20).default([]),
});
export type AnimalDetail = z.infer<typeof animalDetailSchema>;

export const complianceSummarySchema = z.object({
  total: z.number().int().nonnegative(),
  completed: z.number().int().nonnegative(),
  scheduled: z.number().int().nonnegative(),
  voucherIssued: z.number().int().nonnegative(),
  unknown: z.number().int().nonnegative(),
  overdue: z.number().int().nonnegative(),
});
export type ComplianceSummary = z.infer<typeof complianceSummarySchema>;
