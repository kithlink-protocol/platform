import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { favoriteSchema, favoritesResponseSchema, type Favorite } from '@kithlink/contracts';
import { AuditService } from '../../common/audit.service';
import { TenantService } from '../db.module';

interface FavoriteRow {
  id: string;
  animal_id: string;
  created_at: Date;
}

interface AnimalJoinRow {
  animal_id: string;
  animal_name: string;
  animal_status: string;
  shelter_slug: string;
  shelter_name: string;
}

function mapFavorite(row: FavoriteRow, join: AnimalJoinRow | undefined): Favorite {
  return favoriteSchema.parse({
    id: row.id,
    animalId: row.animal_id,
    animalName: join?.animal_name ?? '',
    shelterSlug: join?.shelter_slug ?? '',
    shelterName: join?.shelter_name ?? '',
    animalStatus: join?.animal_status ?? 'unavailable',
    addedAt: new Date(row.created_at as unknown as string | Date).toISOString(),
  });
}

/**
 * Favorites live in favorite_animals (self-service RLS on kithlink.user_id); the
 * animal/shelter labels ride a service-context lookup because applicant contexts
 * cannot read the animals/shelters tables directly (same split as ConsentsService).
 */
@Injectable()
export class FavoritesService {
  constructor(
    @Inject(TenantService) private readonly tenants: TenantService,
    @Inject(AuditService) private readonly audit: AuditService,
  ) {}

  async list(userId: string): Promise<{ items: Favorite[]; nextCursor: string | null }> {
    const rows = (await this.tenants.withTenant({ userId, roleClass: 'applicant' }, async sql => {
      return sql`
        select id, animal_id, created_at
        from favorite_animals
        where user_id = ${userId}::uuid
        order by created_at desc, id desc
        limit 200`;
    })) as unknown as FavoriteRow[];
    if (rows.length === 0) return favoritesResponseSchema.parse({ items: [], nextCursor: null });
    const joins = await this.loadJoins(rows.map(r => r.animal_id));
    const byAnimal = new Map(joins.map(j => [j.animal_id, j]));
    return favoritesResponseSchema.parse({
      items: rows.map(row => mapFavorite(row, byAnimal.get(row.animal_id))),
      nextCursor: null,
    });
  }

  /** Idempotent add: re-favoriting returns the existing favorite without a duplicate audit event. */
  async add(userId: string, animalId: string): Promise<Favorite> {
    const joins = await this.loadJoins([animalId]);
    if (!joins[0]) throw new NotFoundException('Animal not found');
    const row = (await this.tenants.withTenant({ userId, roleClass: 'applicant' }, async sql => {
      const inserted = (await sql`
        insert into favorite_animals (user_id, animal_id)
        values (${userId}::uuid, ${animalId}::uuid)
        on conflict (user_id, animal_id) do nothing
        returning id, animal_id, created_at`) as unknown as FavoriteRow[];
      if (inserted[0]) {
        await this.audit.append(sql, userId, null, 'favorite.added', 'animal', animalId, {});
        return inserted[0];
      }
      const existing = (await sql`
        select id, animal_id, created_at
        from favorite_animals
        where user_id = ${userId}::uuid and animal_id = ${animalId}::uuid
        limit 1`) as unknown as FavoriteRow[];
      return existing[0]!;
    })) as unknown as FavoriteRow;
    return mapFavorite(row, joins[0]);
  }

  /** Idempotent remove: deleting an absent favorite is a silent no-op. */
  async remove(userId: string, animalId: string): Promise<void> {
    await this.tenants.withTenant({ userId, roleClass: 'applicant' }, async sql => {
      const deleted = (await sql`
        delete from favorite_animals
        where user_id = ${userId}::uuid and animal_id = ${animalId}::uuid
        returning id`) as unknown as { id: string }[];
      if (deleted[0]) {
        await this.audit.append(sql, userId, null, 'favorite.removed', 'animal', animalId, {});
      }
    });
  }

  private async loadJoins(animalIds: string[]): Promise<AnimalJoinRow[]> {
    if (animalIds.length === 0) return [];
    return (await this.tenants.service(async sql => {
      return sql`
        select a.id as animal_id, a.name as animal_name, a.status as animal_status,
               s.slug as shelter_slug, s.name as shelter_name
        from animals a
        join shelters s on s.id = a.shelter_id
        where a.id = any(${animalIds}::uuid[])`;
    })) as unknown as AnimalJoinRow[];
  }
}
