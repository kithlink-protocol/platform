import { z } from 'zod';
import { and, eq } from 'drizzle-orm';
import { BadRequestException, Injectable, NotFoundException,
  Inject,
} from '@nestjs/common';
import {
  ageToAgeClass,
  animalDetailSchema,
  animalListResponseSchema,
  animalPublicSchema,
  animalSearchItemSchema,
  animalSearchResponseSchema,
  behaviorObservationSchema,
  complianceSummarySchema,
  type AddObservationInput,
  type AnimalAgeClass,
  type AnimalDetail,
  type AnimalPhotoPublic,
  type AnimalPublic,
  type AnimalSearchItem,
  type AnimalSearchQuery,
  type AnimalStatus,
  type BehaviorObservation,
  type ComplianceSummary,
  type SterilizationStatus,
} from '@kithlink/contracts';
import { animalPhotos, animals, type AnySql, type PendingQuery, type Row, type TenantContext } from '@kithlink/db';
import { decodeCursor, encodeCursor } from '../../common/cursor.util';
import { AuditService } from '../../common/audit.service';
import { isCheckViolation, isForeignKeyViolation } from '../../common/db.util';
import { OutboxService } from '../notifications/notifications.module';
import { TenantService } from '../db.module';

// No photo-metadata input schema exists in contracts yet; kept server-local until promoted.
export const animalPhotoInputSchema = z.object({
  storageKey: z.string().min(1),
  altText: z.string().max(500).nullish(),
  position: z.number().int().min(0).nullish(),
  mime: z.string().max(100).nullish(),
  bytes: z.number().int().nonnegative().nullish(),
});
export type AnimalPhotoInput = z.infer<typeof animalPhotoInputSchema>;

export interface AnimalPageQuery {
  cursor?: string;
  limit: number;
  species?: string;
  status?: AnimalStatus;
}

export interface AnimalRawRow {
  id: string;
  shelter_id: string;
  name: string;
  species: string;
  breed: string | null;
  birth_year: number | null;
  sex: string;
  size: string | null;
  status: string;
  description: string | null;
  medical_json: Record<string, unknown>;
  traits_json: Record<string, unknown>;
  sterilization_status: string;
  sterilization_due_date: Date | null;
  sterilization_voucher_ref: string | null;
  created_at: Date;
}

interface PhotoRawRow {
  id: string;
  animal_id: string;
  position: number;
  alt_text: string | null;
}

function mapSterilization(row: Pick<
  AnimalRawRow,
  'sterilization_status' | 'sterilization_due_date' | 'sterilization_voucher_ref'
>) {
  return {
    status: row.sterilization_status as SterilizationStatus,
    dueDate: row.sterilization_due_date
      ? new Date(row.sterilization_due_date as unknown as string | Date).toISOString()
      : null,
    voucherRef: row.sterilization_voucher_ref ?? null,
  };
}

function animalCore(row: AnimalRawRow, photos: PhotoRawRow[]) {
  return {
    id: row.id,
    shelterId: row.shelter_id,
    name: row.name,
    species: row.species,
    breed: row.breed ?? null,
    birthYear: row.birth_year ?? null,
    sex: row.sex,
    size: row.size ?? null,
    ageClass: ageToAgeClass(row.birth_year ?? null),
    status: row.status,
    description: row.description ?? null,
    medical: row.medical_json ?? {},
    traits: row.traits_json ?? {},
    sterilization: mapSterilization(row),
    photos: photos.map(p => ({ id: p.id, position: p.position, altText: p.alt_text ?? null, url: null })),
    createdAt: new Date(row.created_at as unknown as string | Date).toISOString(),
  };
}

function mapAnimal(row: AnimalRawRow, photos: PhotoRawRow[]): AnimalPublic {
  return animalPublicSchema.parse(animalCore(row, photos));
}

interface ShelterJoinRow {
  shelter_name: string;
  shelter_slug: string;
}

interface SearchRow extends AnimalRawRow, ShelterJoinRow {
  distance_km: number | null;
}

interface DetailRow extends AnimalRawRow, ShelterJoinRow {
  shelter_city: string | null;
  shelter_state: string | null;
}

interface ObservationRawRow {
  id: string;
  fas_score: number | null;
  tags: string[];
  note: string | null;
  created_at: Date;
}

function mapObservation(row: ObservationRawRow): BehaviorObservation {
  return behaviorObservationSchema.parse({
    id: row.id,
    fasScore: row.fas_score ?? null,
    tags: row.tags ?? [],
    note: row.note ?? null,
    createdAt: new Date(row.created_at as unknown as string | Date).toISOString(),
  });
}

@Injectable()
export class AnimalsService {
  constructor(
    @Inject(TenantService) private readonly tenants: TenantService,
    @Inject(AuditService) private readonly audit: AuditService,
  ) {}

  async list(
    ctx: TenantContext,
    shelterId: string,
    q: AnimalPageQuery,
  ): Promise<{ items: AnimalPublic[]; nextCursor: string | null }> {
    const cursor = q.cursor ? decodeCursor(q.cursor) : null;
    if (q.cursor && !cursor) throw new BadRequestException('Invalid cursor');
    return this.tenants.withTenant(ctx, async sql => {
      const speciesFrag = q.species ? sql` and species = ${q.species}` : sql``;
      const statusFrag = q.status !== undefined ? sql` and status = ${q.status}` : sql``;
      const cursorFrag = cursor
        ? sql` and (created_at, id) < (${cursor.createdAt}::timestamptz, ${cursor.id}::uuid)`
        : sql``;
      const rows = (await sql`
        select id, shelter_id, name, species, breed, birth_year, sex, size, status, description, medical_json, traits_json,
               sterilization_status, sterilization_due_date, sterilization_voucher_ref, created_at
        from animals
        where shelter_id = ${shelterId}::uuid${speciesFrag}${statusFrag}${cursorFrag}
        order by created_at desc, id desc
        limit ${q.limit + 1}`) as unknown as AnimalRawRow[];
      const page = rows.slice(0, q.limit);
      const photosByAnimal = await this.loadPhotos(sql, page.map(r => r.id));
      const items = page.map(r => mapAnimal(r, photosByAnimal.get(r.id) ?? []));
      const hasMore = rows.length > q.limit;
      const last = page[page.length - 1];
      const nextCursor =
        hasMore && last
          ? encodeCursor({
              createdAt: new Date(last.created_at as unknown as string | Date).toISOString(),
              id: last.id,
            })
          : null;
      return animalListResponseSchema.parse({ items, nextCursor });
    });
  }

  async getById(ctx: TenantContext, shelterId: string, id: string): Promise<AnimalPublic | null> {    return this.tenants.withTenant(ctx, async sql => {
      const rows = (await sql`
        select id, shelter_id, name, species, breed, birth_year, sex, size, status, description, medical_json, traits_json,
               sterilization_status, sterilization_due_date, sterilization_voucher_ref, created_at
        from animals
        where id = ${id}::uuid and shelter_id = ${shelterId}::uuid
        limit 1`) as unknown as AnimalRawRow[];
      const row = rows[0];
      if (!row) return null;
      const photos = await this.loadPhotos(sql, [row.id]);
      return mapAnimal(row, photos.get(row.id) ?? []);
    });
  }

  async search(
    ctx: TenantContext,
    q: AnimalSearchQuery,
  ): Promise<{ items: AnimalSearchItem[]; nextCursor: string | null }> {
    const cursor = q.cursor ? decodeCursor(q.cursor) : null;
    if (q.cursor && !cursor) throw new BadRequestException('Invalid cursor');
    return this.tenants.withTenant(ctx, async sql => {
      type Frag = PendingQuery<Row[]>;
      const filters: Frag[] = [sql`a.status = 'available'`];
      if (q.species) filters.push(sql`a.species = ${q.species}`);
      if (q.sex) filters.push(sql`a.sex = ${q.sex}`);
      if (q.size) filters.push(sql`a.size = ${q.size}`);
      if (q.shelterSlug) filters.push(sql`s.slug = ${q.shelterSlug}`);
      if (q.q) {
        const pattern = `%${q.q}%`;
        filters.push(
          sql`(a.name ilike ${pattern} or a.breed ilike ${pattern} or a.description ilike ${pattern})`,
        );
      }
      if (q.ageClass) {
        const year = new Date().getUTCFullYear();
        const buckets: Record<AnimalAgeClass, Frag> = {
          baby: sql`a.birth_year > ${year - 1}`,
          young: sql`a.birth_year between ${year - 2} and ${year - 1}`,
          adult: sql`a.birth_year between ${year - 7} and ${year - 3}`,
          senior: sql`a.birth_year <= ${year - 8}`,
        };
        filters.push(buckets[q.ageClass]);
      }
      const { nearLat, nearLng, radiusKm } = q;
      const hasGeo = nearLat !== undefined && nearLng !== undefined && radiusKm !== undefined;
      let distanceExpr: Frag | null = null;
      if (hasGeo && nearLat !== undefined && nearLng !== undefined && radiusKm !== undefined) {
        distanceExpr = sql`(6371 * 2 * asin(sqrt(
          power(sin(radians(s.latitude - ${nearLat}) / 2), 2)
          + cos(radians(${nearLat})) * cos(radians(s.latitude))
          * power(sin(radians(s.longitude - ${nearLng}) / 2), 2))))`;
        filters.push(sql`s.latitude is not null and s.longitude is not null and ${distanceExpr} <= ${radiusKm}`);
      }
      const distanceSelect =
        distanceExpr !== null
          ? sql`, round(${distanceExpr}::numeric, 1)::float8 as distance_km`
          : sql`, null::float8 as distance_km`;
      const cursorFrag = cursor
        ? sql`and (a.created_at, a.id) < (${cursor.createdAt}::timestamptz, ${cursor.id}::uuid)`
        : sql``;
      const rows = (await sql`
        select a.id, a.shelter_id, a.name, a.species, a.breed, a.birth_year, a.sex, a.size,
               a.status, a.description, a.medical_json, a.traits_json,
               a.sterilization_status, a.sterilization_due_date, a.sterilization_voucher_ref, a.created_at,
               s.name as shelter_name, s.slug as shelter_slug${distanceSelect}
        from animals a
        join shelters s on s.id = a.shelter_id
        where ${filters.reduce<Frag>((acc, f) => (acc ? sql`(${acc}) and (${f})` : f), sql`true`)} ${cursorFrag}
        order by a.created_at desc, a.id desc
        limit ${q.limit + 1}`) as unknown as SearchRow[];
      const page = rows.slice(0, q.limit);
      const photosByAnimal = await this.loadPhotos(sql, page.map(r => r.id));
      const items = page.map(r =>
        animalSearchItemSchema.parse({
          ...animalCore(r, photosByAnimal.get(r.id) ?? []),
          shelterName: r.shelter_name,
          shelterSlug: r.shelter_slug,
          distanceKm: r.distance_km ?? null,
        }),
      );
      const hasMore = rows.length > q.limit;
      const last = page[page.length - 1];
      const nextCursor =
        hasMore && last
          ? encodeCursor({
              createdAt: new Date(last.created_at as unknown as string | Date).toISOString(),
              id: last.id,
            })
          : null;
      return animalSearchResponseSchema.parse({ items, nextCursor });
    });
  }

  async getPublicById(ctx: TenantContext, id: string): Promise<AnimalDetail | null> {
    return this.tenants.withTenant(ctx, async sql => {
      const rows = (await sql`
        select a.id, a.shelter_id, a.name, a.species, a.breed, a.birth_year, a.sex, a.size,
               a.status, a.description, a.medical_json, a.traits_json,
               a.sterilization_status, a.sterilization_due_date, a.sterilization_voucher_ref, a.created_at,
               s.name as shelter_name, s.slug as shelter_slug, s.city as shelter_city, s.state as shelter_state
        from animals a
        join shelters s on s.id = a.shelter_id
        where a.id = ${id}::uuid and a.status = 'available'
        limit 1`) as unknown as DetailRow[];
      const row = rows[0];
      if (!row) return null;
      const photos = await this.loadPhotos(sql, [row.id]);
      // Observations ride the anon RLS policy: only visible when the animal is available,
      // so detail behavior for unavailable animals stays identical (404 upstream).
      const observations = await this.listPublicObservations(sql, row.id, 20);
      return animalDetailSchema.parse({
        ...animalCore(row, photos.get(row.id) ?? []),
        observations,
        shelter: {
          name: row.shelter_name,
          slug: row.shelter_slug,
          city: row.shelter_city ?? null,
          state: row.shelter_state ?? null,
        },
      });
    });
  }

  async sterilizationSummary(ctx: TenantContext, shelterId: string): Promise<ComplianceSummary> {
    return this.tenants.withTenant(ctx, async sql => {
      const rows = (await sql`
        select count(*)::int as total,
               count(*) filter (where sterilization_status = 'completed')::int as completed,
               count(*) filter (where sterilization_status = 'scheduled')::int as scheduled,
               count(*) filter (where sterilization_status = 'voucher_issued')::int as voucher_issued,
               count(*) filter (where sterilization_status = 'unknown')::int as unknown,
               count(*) filter (
                 where sterilization_status in ('scheduled', 'voucher_issued')
                   and sterilization_due_date < now()
               )::int as overdue
        from animals
        where shelter_id = ${shelterId}::uuid`) as unknown as {
        total: number;
        completed: number;
        scheduled: number;
        voucher_issued: number;
        unknown: number;
        overdue: number;
      }[];
      const row = rows[0]!;
      return complianceSummarySchema.parse({
        total: row.total,
        completed: row.completed,
        scheduled: row.scheduled,
        voucherIssued: row.voucher_issued,
        unknown: row.unknown,
        overdue: row.overdue,
      });
    });
  }

  async addObservation(
    ctx: TenantContext,
    actorId: string,
    shelterId: string,
    animalId: string,
    input: AddObservationInput,
  ): Promise<BehaviorObservation> {
    return this.tenants.withTenant(ctx, async sql => {
      const existing = (await sql`
        select id from animals
        where id = ${animalId}::uuid and shelter_id = ${shelterId}::uuid
        limit 1`) as unknown as { id: string }[];
      if (!existing[0]) throw new NotFoundException('Animal not found');
      try {
        const inserted = (await sql`
          insert into animal_observations (animal_id, shelter_id, fas_score, tags, note, author_id)
          values (${animalId}::uuid, ${shelterId}::uuid, ${input.fasScore ?? null},
                  ${input.tags}::text[], ${input.note ?? null}, ${actorId}::uuid)
          returning id, fas_score, tags, note, created_at`) as unknown as ObservationRawRow[];
        const row = inserted[0]!;
        await this.audit.append(sql, actorId, shelterId, 'observation.added', 'animal_observation', row.id, {
          animalId,
          fasScore: input.fasScore ?? null,
          tags: input.tags,
        });
        return mapObservation(row);
      } catch (error) {
        if (isCheckViolation(error)) throw new BadRequestException('Invalid observation');
        throw error;
      }
    });
  }

  async listObservations(
    ctx: TenantContext,
    shelterId: string,
    animalId: string,
    limit = 50,
  ): Promise<{ items: BehaviorObservation[] }> {
    return this.tenants.withTenant(ctx, async sql => {
      const existing = (await sql`
        select id from animals
        where id = ${animalId}::uuid and shelter_id = ${shelterId}::uuid
        limit 1`) as unknown as { id: string }[];
      if (!existing[0]) throw new NotFoundException('Animal not found');
      return { items: await this.listPublicObservations(sql, animalId, limit, shelterId) };
    });
  }

  private async listPublicObservations(
    sql: AnySql,
    animalId: string,
    limit: number,
    shelterId?: string,
  ): Promise<BehaviorObservation[]> {
    const shelterFrag =
      shelterId !== undefined ? sql` and shelter_id = ${shelterId}::uuid` : sql``;
    const rows = (await sql`
      select id, fas_score, tags, note, created_at
      from animal_observations
      where animal_id = ${animalId}::uuid${shelterFrag}
      order by created_at desc, id desc
      limit ${limit}`) as unknown as ObservationRawRow[];
    return rows.map(mapObservation);
  }

  async create(
    ctx: TenantContext,
    actorId: string,
    shelterId: string,
    input: {
      name: string;
      species: 'dog' | 'cat' | 'other';
      breed?: string | null;
      birthYear?: number | null;
      sex: 'male' | 'female' | 'unknown';
      size?: 'small' | 'medium' | 'large' | 'xl' | null;
      description?: string | null;
      status: AnimalStatus;
      medical: Record<string, unknown>;
      traits: Record<string, unknown>;
      sterilization?: { status?: SterilizationStatus; dueDate?: string | null; voucherRef?: string | null };
    },
  ): Promise<AnimalPublic> {
    try {
      return await this.tenants.withTenant(ctx, async sql => {
        const rows = (await sql`
          insert into animals (shelter_id, name, species, breed, birth_year, sex, size, status, description, medical_json, traits_json,
                               sterilization_status, sterilization_due_date, sterilization_voucher_ref)
          values (${shelterId}::uuid, ${input.name}, ${input.species}, ${input.breed ?? null}, ${input.birthYear ?? null},
                  ${input.sex}, ${input.size ?? null}, ${input.status}, ${input.description ?? null},
                  ${JSON.stringify(input.medical)}::jsonb, ${JSON.stringify(input.traits)}::jsonb,
                  ${input.sterilization?.status ?? 'unknown'}, ${input.sterilization?.dueDate ?? null},
                  ${input.sterilization?.voucherRef ?? null})
          returning id, shelter_id, name, species, breed, birth_year, sex, size, status, description, medical_json, traits_json,
                    sterilization_status, sterilization_due_date, sterilization_voucher_ref, created_at`) as unknown as AnimalRawRow[];
        const row = rows[0]!;
        await this.audit.append(sql, actorId, shelterId, 'animal.created', 'animal', row.id, { name: row.name });
        return mapAnimal(row, []);
      });
    } catch (error) {
      if (isForeignKeyViolation(error)) throw new NotFoundException('Shelter not found');
      throw error;
    }
  }

  async update(
    ctx: TenantContext,
    actorId: string,
    shelterId: string,
    id: string,
    input: Record<string, unknown>,
  ): Promise<AnimalPublic | null> {
    return this.tenants.withTenant(ctx, async sql => {
      const sets: string[] = [];
      const params: unknown[] = [];
      const push = (column: string, value: unknown, cast = '') => {
        params.push(value);
        sets.push(`${column} = $${params.length}${cast}`);
      };
      if (input.name !== undefined) push('name', input.name);
      if (input.species !== undefined) push('species', input.species);
      if (input.breed !== undefined) push('breed', input.breed ?? null);
      if (input.birthYear !== undefined) push('birth_year', input.birthYear ?? null);
      if (input.sex !== undefined) push('sex', input.sex);
      if (input.size !== undefined) push('size', input.size ?? null);
      if (input.status !== undefined) push('status', input.status);
      if (input.description !== undefined) push('description', input.description ?? null);
      if (input.medical !== undefined)
        push('medical_json', JSON.stringify(input.medical), '::jsonb');
      if (input.traits !== undefined) push('traits_json', JSON.stringify(input.traits), '::jsonb');
      const sterilization = input.sterilization as
        | { status?: string; dueDate?: string | null; voucherRef?: string | null }
        | undefined;
      if (sterilization?.status !== undefined) push('sterilization_status', sterilization.status);
      if (sterilization?.dueDate !== undefined)
        push('sterilization_due_date', sterilization.dueDate ?? null);
      if (sterilization?.voucherRef !== undefined)
        push('sterilization_voucher_ref', sterilization.voucherRef ?? null);
      if (sets.length === 0) {
        const unchanged = (await sql`
          select id, shelter_id, name, species, breed, birth_year, sex, size, status, description, medical_json, traits_json,
                 sterilization_status, sterilization_due_date, sterilization_voucher_ref, created_at
          from animals where id = ${id}::uuid and shelter_id = ${shelterId}::uuid`) as unknown as AnimalRawRow[];
        const cur = unchanged[0];
        if (!cur) return null;
        return mapAnimal(cur, (await this.loadPhotos(sql, [cur.id])).get(cur.id) ?? []);
      }
      params.push(id);
      const whereId = `$${params.length}::uuid`;
      params.push(shelterId);
      const rows = (await sql.unsafe(
        `update animals set updated_at = now(), ${sets.join(', ')}
         where id = ${whereId} and shelter_id = $${params.length}::uuid
         returning id, shelter_id, name, species, breed, birth_year, sex, size, status, description, medical_json, traits_json,
                   sterilization_status, sterilization_due_date, sterilization_voucher_ref, created_at`,
        params as Parameters<typeof sql.unsafe>[1],
      )) as unknown as AnimalRawRow[];
      const row = rows[0];
      if (!row) return null;
      await this.audit.append(sql, actorId, shelterId, 'animal.updated', 'animal', row.id, {
        fields: Object.keys(input),
      });
      const photos = await this.loadPhotos(sql, [row.id]);
      return mapAnimal(row, photos.get(row.id) ?? []);
    });
  }

  async addPhoto(
    ctx: TenantContext,
    shelterId: string,
    animalId: string,
    input: AnimalPhotoInput,
  ): Promise<AnimalPhotoPublic> {
    return this.tenants.withTenantTx(ctx, async db => {
      const existing = await db
        .select({ id: animals.id })
        .from(animals)
        .where(and(eq(animals.id, animalId), eq(animals.shelterId, shelterId)))
        .limit(1);
      if (!existing[0]) throw new NotFoundException('Animal not found');
      const inserted = await db
        .insert(animalPhotos)
        .values({
          animalId,
          storageKey: input.storageKey,
          position: input.position ?? 0,
          altText: input.altText ?? null,
          mime: input.mime ?? null,
          bytes: input.bytes ?? null,
        })
        .returning({ id: animalPhotos.id, position: animalPhotos.position, altText: animalPhotos.altText });
      const photo = inserted[0];
      if (!photo) throw new Error('photo insert returned no rows');
      return { id: photo.id, position: photo.position, altText: photo.altText ?? null, url: null };
    });
  }

  private async loadPhotos(sql: AnySql, animalIds: string[]): Promise<Map<string, PhotoRawRow[]>> {
    if (animalIds.length === 0) return new Map();
    const rows = (await sql`
      select id, animal_id, position, alt_text
      from animal_photos
      where animal_id = any(${animalIds}::uuid[])
      order by animal_id, position`) as unknown as PhotoRawRow[];
    const map = new Map<string, PhotoRawRow[]>();
    for (const row of rows) {
      const list = map.get(row.animal_id);
      if (list) list.push(row);
      else map.set(row.animal_id, [row]);
    }
    return map;
  }
}

interface SterilizationSweepAnimalRow {
  animal_id: string;
  animal_name: string;
  sterilization_status: string;
  sterilization_due_date: Date;
  shelter_id: string;
}

/**
 * Cron body (docs/design/12 §M9): one reminder email per shelter owner/admin covering
 * every due-soon animal of that shelter. Grouping per shelter makes the run idempotent
 * within itself — no owner ever receives more than one row per sweep.
 */
export async function runSterilizationSweep(
  tenants: TenantService,
  outbox: OutboxService,
): Promise<number> {
  const due = (await tenants.service(async sql => {
    return sql`
      select id as animal_id, name as animal_name, shelter_id,
             sterilization_status, sterilization_due_date
      from animals
      where status = 'available'
        and sterilization_status in ('scheduled', 'voucher_issued')
        and sterilization_due_date < now() + interval '7 days'
        and sterilization_due_date is not null
      order by shelter_id, sterilization_due_date`;
  })) as unknown as SterilizationSweepAnimalRow[];

  const byShelter = new Map<string, SterilizationSweepAnimalRow[]>();
  for (const row of due) {
    const list = byShelter.get(row.shelter_id);
    if (list) list.push(row);
    else byShelter.set(row.shelter_id, [row]);
  }

  let sent = 0;
  for (const [shelterId, animals] of byShelter) {
    const recipients = (await tenants.service(async sql => {
      return sql`
        select u.email
        from staff_members sm
        join users u on u.id = sm.user_id and u.deleted_at is null
        where sm.shelter_id = ${shelterId}::uuid and sm.role in ('owner', 'admin')`;
    })) as unknown as { email: string }[];
    const lines = animals
      .map(a => `- ${a.animal_name}: due ${new Date(a.sterilization_due_date).toISOString().slice(0, 10)} (${a.sterilization_status === 'voucher_issued' ? 'voucher issued' : a.sterilization_status})`)
      .join('\n');
    for (const recipient of recipients) {
      try {
        await tenants.service(async sql => {
          await outbox.enqueue(sql, 'sterilization.reminder', {
            to: [recipient.email],
            subject: `Sterilization reminder: ${animals.length} ${animals.length === 1 ? 'animal needs' : 'animals need'} scheduling`,
            text:
              `Hi there,\n\n` +
              `The following animals have a sterilization appointment or voucher deadline coming up within 7 days:\n\n` +
              `${lines}\n\n` +
              `Open the animal's page in the admin to update the status once it's done.`,
          });
          sent++;
        });
      } catch (error) {
        console.warn(`[sterilization] failed to enqueue reminder for shelter ${shelterId}`, error);
      }
    }
  }
  return sent;
}
