import { z } from 'zod';
import { staffRoleSchema } from './auth';
import { uuidSchema } from './common';

export const slugSchema = z
  .string()
  .min(2)
  .max(63)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'lowercase letters, digits, hyphens');

export const createShelterSchema = z.object({
  name: z.string().min(2).max(200),
  slug: slugSchema,
});
export type CreateShelterInput = z.infer<typeof createShelterSchema>;

export const shelterPublicSchema = z.object({
  id: uuidSchema,
  name: z.string(),
  slug: slugSchema,
  city: z.string().nullable().default(null),
  state: z.string().nullable().default(null),
});
export type ShelterPublic = z.infer<typeof shelterPublicSchema>;

export const shelterDetailSchema = shelterPublicSchema.extend({
  latitude: z.number().nullable().default(null),
  longitude: z.number().nullable().default(null),
  availableAnimalCount: z.number().int(),
});
export type ShelterDetail = z.infer<typeof shelterDetailSchema>;

export const updateShelterProfileSchema = z
  .object({
    name: z.string().min(2).max(200).optional(),
    city: z.string().max(120).nullish(),
    state: z.string().max(60).nullish(),
    postalCode: z.string().max(20).nullish(),
    latitude: z.number().min(-90).max(90).nullish(),
    longitude: z.number().min(-180).max(180).nullish(),
  })
  .refine(input => Object.keys(input).length > 0, { message: 'At least one field required' });
export type UpdateShelterProfileInput = z.infer<typeof updateShelterProfileSchema>;

export const listSheltersQuerySchema = z.object({
  q: z.string().max(120).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(25),
});


export const addStaffMemberSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  role: staffRoleSchema.default('volunteer'),
});
export type AddStaffMemberInput = z.infer<typeof addStaffMemberSchema>;

export const updateStaffMemberSchema = z.object({
  role: staffRoleSchema,
});
