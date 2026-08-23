import { z } from 'zod';
import { uuidSchema } from './common';

export const consentScopes = ['application_review', 'post_adoption_contact'] as const;
export const consentStatuses = ['granted', 'active', 'revoked', 'expired'] as const;

export const consentScopeSchema = z.enum(consentScopes);
export const consentStatusSchema = z.enum(consentStatuses);

export const consentGrantSchema = z.object({
  id: uuidSchema,
  shelterId: uuidSchema,
  shelterName: z.string(),
  scope: consentScopeSchema,
  status: consentStatusSchema,
  grantedAt: z.string().datetime(),
  expiresAt: z.string().datetime().nullable(),
});
export type ConsentGrant = z.infer<typeof consentGrantSchema>;
