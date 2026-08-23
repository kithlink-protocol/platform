import { z } from 'zod';
import { cursorPageSchema, paginated, uuidSchema } from './common';

export const animalSpecies = ['dog', 'cat', 'other'] as const;
export const animalSexes = ['male', 'female', 'unknown'] as const;
export const animalSizes = ['small', 'medium', 'large', 'xl'] as const;
export const animalStatuses = [
  'draft',
  'available',
  'pending',
  'adopted',
  'unavailable',
] as const;

export const animalStatusSchema = z.enum(animalStatuses);
export type AnimalStatus = (typeof animalStatuses)[number];

const traitsSchema = z
  .object({
    goodWithKids: z.boolean().optional(),
    goodWithDogs: z.boolean().optional(),
    goodWithCats: z.boolean().optional(),
    energyLevel: z.enum(['low', 'medium', 'high']).optional(),
    specialNeeds: z.boolean().optional(),
  })
  .strip();

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
});
export type AnimalCreateInput = z.infer<typeof animalCreateSchema>;

export const animalUpdateSchema = animalCreateSchema.partial();
export type AnimalUpdateInput = z.infer<typeof animalUpdateSchema>;

export const animalPhotoPublicSchema = z.object({
  id: uuidSchema,
  position: z.number().int(),
  altText: z.string().nullable(),
  /** Public CDN/bucket URL; null when photo not yet processed. */
  url: z.string().url().nullable(),
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
  status: animalStatusSchema,
  description: z.string().nullable(),
  medical: z.record(z.unknown()),
  traits: z.record(z.unknown()),
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
