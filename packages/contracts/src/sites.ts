import { z } from 'zod';

export const siteThemes = ['default', 'rescue-min'] as const;
export const themeSlugSchema = z.enum(siteThemes);
export type ThemeSlug = (typeof siteThemes)[number];

export const siteBrandSchema = z
  .object({
    logoUrl: z.string().url().optional(),
    primaryColor: z.string().regex(/^#[0-9a-f]{6}$/).optional(),
  })
  .strip();
export type SiteBrand = z.infer<typeof siteBrandSchema>;

export const siteConfigSchema = z.object({
  themeSlug: themeSlugSchema.default('default'),
  brand: siteBrandSchema.default({}),
  heroTitle: z.string().max(140).default(''),
  heroBody: z.string().max(500).default(''),
});
export type SiteConfigInput = z.infer<typeof siteConfigSchema>;

export const siteConfigResponseSchema = siteConfigSchema.extend({
  shelterId: z.string().uuid(),
  slug: z.string(),
  publishedAt: z.string().datetime().nullable(),
});
export type SiteConfigResponse = z.infer<typeof siteConfigResponseSchema>;

export const publishResponseSchema = z.object({
  slug: z.string(),
  buildId: z.string(),
  publishedAt: z.string().datetime(),
  animalCount: z.number().int(),
});
export type PublishResponse = z.infer<typeof publishResponseSchema>;

export const siteStatusSchema = z.object({
  publishedAt: z.string().datetime().nullable(),
  themeSlug: themeSlugSchema,
  animalCount: z.number().int(),
});
export type SiteStatus = z.infer<typeof siteStatusSchema>;

export const customDomainSchema = z.object({
  id: z.string().uuid(),
  domain: z.string(),
  verified: z.boolean(),
  verificationToken: z.string(),
});
export type CustomDomain = z.infer<typeof customDomainSchema>;

export const addCustomDomainSchema = z.object({
  domain: z
    .string()
    .min(4)
    .max(253)
    .regex(/^[a-z0-9.-]+\.[a-z]{2,}$/),
});
export type AddCustomDomainInput = z.infer<typeof addCustomDomainSchema>;

export const siteSetupResponseSchema = z.object({
  slug: z.string(),
  subdomain: z.string(),
  publishedAt: z.string().datetime(),
  animalCount: z.number().int(),
});
export type SiteSetupResponse = z.infer<typeof siteSetupResponseSchema>;

export const syncProviders = ['petfinder', 'adoptapet'] as const;
export const syncProviderSchema = z.enum(syncProviders);
export type SyncProvider = (typeof syncProviders)[number];

export const syncModes = ['dry_run', 'live'] as const;
export const syncModeSchema = z.enum(syncModes);
export type SyncMode = (typeof syncModes)[number];

export const createSyncTargetSchema = z.object({
  provider: syncProviderSchema,
  clientId: z.string().min(8).max(200),
  clientSecret: z.string().min(8).max(200),
  mode: syncModeSchema.default('dry_run'),
});
export type CreateSyncTargetInput = z.infer<typeof createSyncTargetSchema>;

export const syncTargetPublicSchema = z.object({
  provider: syncProviderSchema,
  mode: syncModeSchema,
  status: z.string(),
  lastRunAt: z.string().datetime().nullable(),
});
export type SyncTargetPublic = z.infer<typeof syncTargetPublicSchema>;

export const syncRunSchema = z.object({
  id: z.string().uuid(),
  trigger: z.string(),
  startedAt: z.string().datetime(),
  finishedAt: z.string().datetime().nullable(),
  pushed: z.number().int(),
  pulled: z.number().int(),
  failed: z.number().int(),
  decisionsCount: z.number().int(),
});
export type SyncRunSummary = z.infer<typeof syncRunSchema>;
