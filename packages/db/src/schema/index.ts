import { relations, sql } from 'drizzle-orm';
import {
  bigint,
  boolean,
  check,
  customType,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  type AnyPgColumn,
} from 'drizzle-orm/pg-core';

export const citext = customType<{ data: string }>({
  dataType() {
    return 'citext';
  },
});

export const tsvector = customType<{ data: string }>({
  dataType() {
    return 'tsvector';
  },
});

export const staffRole = pgEnum('staff_role', [
  'owner',
  'admin',
  'coordinator',
  'volunteer',
  'viewer',
]);

export const applicationStatus = pgEnum('application_status', [
  'draft',
  'submitted',
  'in_review',
  'info_requested',
  'approved',
  'denied',
  'withdrawn',
  'adopted',
  'expired',
]);

export const shelters = pgTable('shelters', {
  id: uuid('id').defaultRandom().primaryKey(),
  slug: text('slug').notNull().unique(),
  name: text('name').notNull(),
  settings: jsonb('settings').notNull().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const users = pgTable('users', {
  id: uuid('id').defaultRandom().primaryKey(),
  email: citext('email').notNull().unique(),
  passwordHash: text('password_hash'),
  totpSecretEnc: text('totp_secret_enc'),
  emailVerifiedAt: timestamp('email_verified_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
});

export const sessions = pgTable(
  'sessions',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    tokenHash: text('token_hash').notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    lastSeenAt: timestamp('last_seen_at', { withTimezone: true }).notNull().defaultNow(),
    userAgent: text('user_agent'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('sessions_token_hash_idx').on(t.tokenHash)],
);

export const staffMembers = pgTable(
  'staff_members',
  {
    shelterId: uuid('shelter_id')
      .notNull()
      .references(() => shelters.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    role: staffRole('role').notNull().default('volunteer'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.shelterId, t.userId] })],
);

export const animals = pgTable(
  'animals',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    shelterId: uuid('shelter_id')
      .notNull()
      .references(() => shelters.id),
    name: text('name').notNull(),
    species: text('species').notNull(),
    breed: text('breed'),
    birthYear: integer('birth_year'),
    sex: text('sex').notNull().default('unknown'),
    size: text('size'),
    status: text('status').notNull().default('available'),
    description: text('description'),
    medicalJson: jsonb('medical_json').notNull().default({}),
    traitsJson: jsonb('traits_json').notNull().default({}),
    externalRefs: jsonb('external_refs').notNull().default({}),
    fts: tsvector('fts').generatedAlwaysAs(
      sql`to_tsvector('english', coalesce(name,'') || ' ' || coalesce(breed,'') || ' ' || coalesce(description,''))`,
    ),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('animals_shelter_status_idx').on(t.shelterId, t.status),
    check('animals_species_check', sql`${t.species} IN ('dog','cat','other')`),
    check('animals_sex_check', sql`${t.sex} IN ('male','female','unknown')`),
    check('animals_size_check', sql`${t.size} IS NULL OR ${t.size} IN ('small','medium','large','xl')`),
    check(
      'animals_status_check',
      sql`${t.status} IN ('draft','available','pending','adopted','unavailable')`,
    ),
  ],
);

export const animalPhotos = pgTable(
  'animal_photos',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    animalId: uuid('animal_id')
      .notNull()
      .references(() => animals.id, { onDelete: 'cascade' }),
    storageKey: text('storage_key').notNull(),
    position: integer('position').notNull().default(0),
    altText: text('alt_text'),
    bytes: bigint('bytes', { mode: 'number' }),
    mime: text('mime'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('animal_photos_animal_idx').on(t.animalId, t.position)],
);

/** Append-only, hash-chained audit trail (doc 07 §6). No SELECT policy for app role. */
export const auditLogs = pgTable(
  'audit_logs',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    actorId: uuid('actor_id'),
    shelterId: uuid('shelter_id'),
    action: text('action').notNull(),
    entityType: text('entity_type').notNull(),
    entityId: text('entity_id'),
    meta: jsonb('meta').notNull().default({}),
    prevHash: text('prev_hash'),
    hash: text('hash').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('audit_logs_entity_idx').on(t.entityType, t.entityId)],
);

export const sheltersRelations = relations(shelters, ({ many }) => ({
  staff: many(staffMembers),
  animals: many(animals),
}));

export const applicantProfiles = pgTable(
  'applicant_profiles',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .unique()
      .references(() => users.id, { onDelete: 'cascade' }),
    legalName: text('legal_name').notNull(),
    displayName: text('display_name'),
    phone: text('phone'),
    addressEnc: text('address_enc'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
);

export const artifacts = pgTable(
  'artifacts',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    applicantId: uuid('applicant_id')
      .notNull()
      .references(() => applicantProfiles.id, { onDelete: 'cascade' }),
    type: text('type').notNull(),
    state: text('state').notNull().default('uploaded'),
    extractedJson: jsonb('extracted_json'),
    confidence: numeric('confidence', { precision: 4, scale: 3 }),
    redactedText: text('redacted_text'),
    expiresAt: timestamp('expires_at', { withTimezone: true }),
    networkVerified: boolean('network_verified').notNull().default(false),
    supersededBy: uuid('superseded_by').references((): AnyPgColumn => artifacts.id),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('artifacts_applicant_idx').on(t.applicantId, t.type, t.state),
    check(
      'artifacts_type_check',
      sql`${t.type} IN ('lease_addendum','vet_record','gov_id','utility_bill','other')`,
    ),
    check(
      'artifacts_state_check',
      sql`${t.state} IN ('uploaded','parsing','parsed','pending_review','verified','rejected','expired','failed_parse')`,
    ),
  ],
);

export const artifactFiles = pgTable(
  'artifact_files',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    artifactId: uuid('artifact_id')
      .notNull()
      .references(() => artifacts.id, { onDelete: 'cascade' }),
    version: integer('version').notNull().default(1),
    storageKey: text('storage_key').notNull().unique(),
    edekWrapped: text('edek_wrapped').notNull(),
    sha256: text('sha256').notNull(),
    mime: text('mime').notNull(),
    bytes: bigint('bytes', { mode: 'number' }).notNull(),
    uploadedBy: uuid('uploaded_by')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
);

export const verifications = pgTable(
  'verifications',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    artifactId: uuid('artifact_id')
      .notNull()
      .references(() => artifacts.id, { onDelete: 'cascade' }),
    shelterId: uuid('shelter_id')
      .notNull()
      .references(() => shelters.id),
    performedBy: uuid('performed_by').references(() => users.id),
    method: text('method').notNull(),
    outcome: text('outcome').notNull(),
    notesRedacted: text('notes_redacted'),
    callLogUrl: text('call_log_url'),
    verifiedAt: timestamp('verified_at', { withTimezone: true }).notNull().defaultNow(),
    validUntil: timestamp('valid_until', { withTimezone: true }),
  },
  (t) => [
    index('verifications_artifact_idx').on(t.artifactId, t.outcome),
    check(
      'verifications_method_check',
      sql`${t.method} IN ('landlord_call','clinic_api','document_audit','automated','prior_verification')`,
    ),
    check(
      'verifications_outcome_check',
      sql`${t.outcome} IN ('confirmed','failed_contact','discrepancy','revoked')`,
    ),
  ],
);

export const applications = pgTable(
  'applications',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    animalId: uuid('animal_id')
      .notNull()
      .references(() => animals.id),
    shelterId: uuid('shelter_id')
      .notNull()
      .references(() => shelters.id),
    applicantId: uuid('applicant_id')
      .notNull()
      .references(() => applicantProfiles.id, { onDelete: 'cascade' }),
    status: applicationStatus('status').notNull().default('draft'),
    answersJson: jsonb('answers_json').notNull().default({}),
    submittedAt: timestamp('submitted_at', { withTimezone: true }),
    decidedAt: timestamp('decided_at', { withTimezone: true }),
    decisionNote: text('decision_note'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('applications_animal_applicant_uq').on(t.animalId, t.applicantId),
    index('applications_shelter_status_idx').on(t.shelterId, t.status),
  ],
);

export const consentGrants = pgTable(
  'consent_grants',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    applicantId: uuid('applicant_id')
      .notNull()
      .references(() => applicantProfiles.id, { onDelete: 'cascade' }),
    shelterId: uuid('shelter_id')
      .notNull()
      .references(() => shelters.id),
    applicationId: uuid('application_id').references(() => applications.id, {
      onDelete: 'set null',
    }),
    scope: text('scope').notNull(),
    status: text('status').notNull().default('active'),
    grantedAt: timestamp('granted_at', { withTimezone: true }).notNull().defaultNow(),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
    expiresAt: timestamp('expires_at', { withTimezone: true }),
  },
  (t) => [
    index('consent_grants_lookup_idx').on(t.applicantId, t.shelterId, t.scope, t.status),
    check(
      'consent_grants_scope_check',
      sql`${t.scope} IN ('application_review','post_adoption_contact')`,
    ),
    check(
      'consent_grants_status_check',
      sql`${t.status} IN ('granted','active','revoked','expired')`,
    ),
  ],
);

/** Transactional outbox (doc 01 §6): dispatcher drains to SMTP/webhooks. */
export const outboxEvents = pgTable('outbox_events', {
  id: uuid('id').defaultRandom().primaryKey(),
  topic: text('topic').notNull(),
  payloadJson: jsonb('payload_json').notNull().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  sentAt: timestamp('sent_at', { withTimezone: true }),
});

export const animalsRelations = relations(animals, ({ one, many }) => ({
  shelter: one(shelters, { fields: [animals.shelterId], references: [shelters.id] }),
  photos: many(animalPhotos),
}));

export const animalPhotosRelations = relations(animalPhotos, ({ one }) => ({
  animal: one(animals, { fields: [animalPhotos.animalId], references: [animals.id] }),
}));

export const usersRelations = relations(users, ({ many }) => ({
  memberships: many(staffMembers),
  sessions: many(sessions),
}));

export const staffMembersRelations = relations(staffMembers, ({ one }) => ({
  shelter: one(shelters, { fields: [staffMembers.shelterId], references: [shelters.id] }),
  user: one(users, { fields: [staffMembers.userId], references: [users.id] }),
}));

export const applicantProfilesRelations = relations(applicantProfiles, ({ one, many }) => ({
  user: one(users, { fields: [applicantProfiles.userId], references: [users.id] }),
  artifacts: many(artifacts),
  applications: many(applications),
  consentGrants: many(consentGrants),
}));

export const artifactsRelations = relations(artifacts, ({ one, many }) => ({
  applicant: one(applicantProfiles, {
    fields: [artifacts.applicantId],
    references: [applicantProfiles.id],
  }),
  files: many(artifactFiles),
  verifications: many(verifications),
}));

export const artifactFilesRelations = relations(artifactFiles, ({ one }) => ({
  artifact: one(artifacts, { fields: [artifactFiles.artifactId], references: [artifacts.id] }),
}));

export const verificationsRelations = relations(verifications, ({ one }) => ({
  artifact: one(artifacts, { fields: [verifications.artifactId], references: [artifacts.id] }),
  shelter: one(shelters, { fields: [verifications.shelterId], references: [shelters.id] }),
  performer: one(users, { fields: [verifications.performedBy], references: [users.id] }),
}));

export const applicationsRelations = relations(applications, ({ one, many }) => ({
  animal: one(animals, { fields: [applications.animalId], references: [animals.id] }),
  shelter: one(shelters, { fields: [applications.shelterId], references: [shelters.id] }),
  applicant: one(applicantProfiles, {
    fields: [applications.applicantId],
    references: [applicantProfiles.id],
  }),
  consentGrants: many(consentGrants),
}));

export const consentGrantsRelations = relations(consentGrants, ({ one }) => ({
  applicant: one(applicantProfiles, {
    fields: [consentGrants.applicantId],
    references: [applicantProfiles.id],
  }),
  shelter: one(shelters, { fields: [consentGrants.shelterId], references: [shelters.id] }),
  application: one(applications, {
    fields: [consentGrants.applicationId],
    references: [applications.id],
  }),
}));

export const sites = pgTable(
  'sites',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    shelterId: uuid('shelter_id')
      .notNull()
      .unique()
      .references(() => shelters.id, { onDelete: 'cascade' }),
    themeSlug: text('theme_slug').notNull().default('default'),
    brand: jsonb('brand').notNull().default({}),
    heroTitle: text('hero_title').notNull().default(''),
    heroBody: text('hero_body').notNull().default(''),
    publishedAt: timestamp('published_at', { withTimezone: true }),
  },
  (t) => [check('sites_theme_check', sql`${t.themeSlug} IN ('default','rescue-min')`)],
);

export const sitePages = pgTable(
  'site_pages',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    siteId: uuid('site_id')
      .notNull()
      .references(() => sites.id, { onDelete: 'cascade' }),
    slug: text('slug').notNull(),
    blocksJsonb: jsonb('blocks_jsonb').notNull().default([]),
    position: integer('position').notNull().default(0),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('site_pages_site_slug_idx').on(t.siteId, t.slug),
    check('site_pages_slug_check', sql`${t.slug} IN ('about','faq','contact')`),
  ],
);

export const syncTargets = pgTable(
  'sync_targets',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    shelterId: uuid('shelter_id')
      .notNull()
      .references(() => shelters.id, { onDelete: 'cascade' }),
    provider: text('provider').notNull(),
    credentialsEnc: text('credentials_enc').notNull(),
    mode: text('mode').notNull().default('dry_run'),
    status: text('status').notNull().default('active'),
    lastRunAt: timestamp('last_run_at', { withTimezone: true }),
  },
  (t) => [
    uniqueIndex('sync_targets_shelter_provider_idx').on(t.shelterId, t.provider),
    check('sync_targets_provider_check', sql`${t.provider} IN ('petfinder','adoptapet')`),
    check('sync_targets_mode_check', sql`${t.mode} IN ('dry_run','live')`),
  ],
);

export const syncRuns = pgTable(
  'sync_runs',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    targetId: uuid('target_id')
      .notNull()
      .references(() => syncTargets.id, { onDelete: 'cascade' }),
    trigger: text('trigger').notNull(),
    startedAt: timestamp('started_at', { withTimezone: true }).notNull().defaultNow(),
    finishedAt: timestamp('finished_at', { withTimezone: true }),
    pushed: integer('pushed').notNull().default(0),
    pulled: integer('pulled').notNull().default(0),
    failed: integer('failed').notNull().default(0),
    decisionsJson: jsonb('decisions_json').notNull().default([]),
  },
  (t) => [index('sync_runs_target_idx').on(t.targetId, t.startedAt)],
);

export const sitesRelations = relations(sites, ({ one, many }) => ({
  shelter: one(shelters, { fields: [sites.shelterId], references: [shelters.id] }),
  pages: many(sitePages),
}));

export const sitePagesRelations = relations(sitePages, ({ one }) => ({
  site: one(sites, { fields: [sitePages.siteId], references: [sites.id] }),
}));

export const syncTargetsRelations = relations(syncTargets, ({ one, many }) => ({
  shelter: one(shelters, { fields: [syncTargets.shelterId], references: [shelters.id] }),
  runs: many(syncRuns),
}));

export const syncRunsRelations = relations(syncRuns, ({ one }) => ({
  target: one(syncTargets, { fields: [syncRuns.targetId], references: [syncTargets.id] }),
}));
