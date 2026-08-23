import { relations, sql } from 'drizzle-orm';
import {
  bigint,
  check,
  customType,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
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
