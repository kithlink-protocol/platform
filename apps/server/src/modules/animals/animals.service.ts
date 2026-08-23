import { z } from 'zod';
import { and, eq } from 'drizzle-orm';
import { BadRequestException, Injectable, NotFoundException,
  Inject,
} from '@nestjs/common';
import {
  animalListResponseSchema,
  animalPublicSchema,
  type AnimalPhotoPublic,
  type AnimalPublic,
  type AnimalStatus,
} from '@kithlink/contracts';
import { animalPhotos, animals, type AnySql, type TenantContext } from '@kithlink/db';
import { decodeCursor, encodeCursor } from '../../common/cursor.util';
import { AuditService } from '../../common/audit.service';
import { isForeignKeyViolation } from '../../common/db.util';
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
  created_at: Date;
}

interface PhotoRawRow {
  id: string;
  animal_id: string;
  position: number;
  alt_text: string | null;
}

function mapAnimal(row: AnimalRawRow, photos: PhotoRawRow[]): AnimalPublic {
  return animalPublicSchema.parse({
    id: row.id,
    shelterId: row.shelter_id,
    name: row.name,
    species: row.species,
    breed: row.breed ?? null,
    birthYear: row.birth_year ?? null,
    sex: row.sex,
    size: row.size ?? null,
    status: row.status,
    description: row.description ?? null,
    medical: row.medical_json ?? {},
    traits: row.traits_json ?? {},
    photos: photos.map(p => ({ id: p.id, position: p.position, altText: p.alt_text ?? null, url: null })),
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
        select id, shelter_id, name, species, breed, birth_year, sex, size, status, description, medical_json, traits_json, created_at
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

  async getById(ctx: TenantContext, shelterId: string, id: string): Promise<AnimalPublic | null> {
    return this.tenants.withTenant(ctx, async sql => {
      const rows = (await sql`
        select id, shelter_id, name, species, breed, birth_year, sex, size, status, description, medical_json, traits_json, created_at
        from animals
        where id = ${id}::uuid and shelter_id = ${shelterId}::uuid
        limit 1`) as unknown as AnimalRawRow[];
      const row = rows[0];
      if (!row) return null;
      const photos = await this.loadPhotos(sql, [row.id]);
      return mapAnimal(row, photos.get(row.id) ?? []);
    });
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
    },
  ): Promise<AnimalPublic> {
    try {
      return await this.tenants.withTenant(ctx, async sql => {
        const rows = (await sql`
          insert into animals (shelter_id, name, species, breed, birth_year, sex, size, status, description, medical_json, traits_json)
          values (${shelterId}::uuid, ${input.name}, ${input.species}, ${input.breed ?? null}, ${input.birthYear ?? null},
                  ${input.sex}, ${input.size ?? null}, ${input.status}, ${input.description ?? null},
                  ${JSON.stringify(input.medical)}::jsonb, ${JSON.stringify(input.traits)}::jsonb)
          returning id, shelter_id, name, species, breed, birth_year, sex, size, status, description, medical_json, traits_json, created_at`) as unknown as AnimalRawRow[];
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
      if (sets.length === 0) {
        const unchanged = (await sql`
          select id, shelter_id, name, species, breed, birth_year, sex, size, status, description, medical_json, traits_json, created_at
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
         returning id, shelter_id, name, species, breed, birth_year, sex, size, status, description, medical_json, traits_json, created_at`,
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
