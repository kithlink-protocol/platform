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
});
export type ShelterPublic = z.infer<typeof shelterPublicSchema>;

export const shelterDetailSchema = shelterPublicSchema.extend({
  availableAnimalCount: z.number().int(),
});
export type ShelterDetail = z.infer<typeof shelterDetailSchema>;

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
