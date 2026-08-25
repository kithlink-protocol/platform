import { Inject, Injectable } from '@nestjs/common';
import type { TenantContext } from '@kithlink/db';
import {
  rentalPropertySchema,
  universalApplicationSchema,
  type RentalPropertyPublic,
  type SaveRentalPropertyInput,
  type SearchRentalQuery,
  type UniversalApplication,
} from '@kithlink/contracts';
import { AuditService } from '../../common/audit.service';
import { TenantService } from '../db.module';

const ANON_CTX: TenantContext = { roleClass: 'anonymous' };

const UNI_SECTIONS = [
  'household',
  'residence',
  'landlord',
  'currentPets',
  'petHistory',
  'lifestyle',
  'preferences',
  'vetCare',
] as const;

interface UniversalRow {
  universal_application: unknown;
}

interface RentalRow {
  id: string;
  display_name: string;
  city: string;
  state: string;
  pet_policy: unknown;
  confirmed_count: number;
}

function mapRental(row: RentalRow): RentalPropertyPublic {
  return rentalPropertySchema.parse({
    id: row.id,
    displayName: row.display_name,
    city: row.city,
    state: row.state,
    petPolicy: row.pet_policy ?? {},
    confirmedCount: row.confirmed_count,
  });
}

export function mergeUniversal(
  existing: UniversalApplication,
  patch: UniversalApplication,
): UniversalApplication {
  const merged: Record<string, unknown> = { ...existing };
  for (const key of UNI_SECTIONS) {
    const incoming = patch[key];
    if (incoming === undefined) continue;
    merged[key] = Array.isArray(incoming)
      ? incoming
      : { ...(existing[key] ?? {}), ...incoming };
  }
  return universalApplicationSchema.parse(merged);
}

@Injectable()
export class UniversalService {
  constructor(
    @Inject(TenantService) private readonly tenants: TenantService,
    @Inject(AuditService) private readonly audit: AuditService,
  ) {}

  private async ensureProfile(userId: string): Promise<string> {
    return this.tenants.service(async sql => {
      const existing = (await sql`
        select id from applicant_profiles where user_id = ${userId}::uuid limit 1`) as unknown as {
        id: string;
      }[];
      if (existing[0]) return existing[0].id;
      const inserted = (await sql`
        insert into applicant_profiles (user_id, legal_name)
        values (${userId}::uuid, '')
        on conflict (user_id) do nothing
        returning id`) as unknown as { id: string }[];
      if (inserted[0]) return inserted[0].id;
      const rows = (await sql`
        select id from applicant_profiles where user_id = ${userId}::uuid limit 1`) as unknown as {
        id: string;
      }[];
      return rows[0]!.id;
    });
  }

  async getUniversalApplication(userId: string): Promise<UniversalApplication> {
    return this.tenants.withTenant({ userId, roleClass: 'applicant' }, async sql => {
      const rows = (await sql`
        select universal_application from applicant_profiles
        where user_id = ${userId}::uuid limit 1`) as unknown as UniversalRow[];
      return universalApplicationSchema.parse(rows[0]?.universal_application ?? {});
    });
  }

  async saveUniversalApplication(
    userId: string,
    patch: UniversalApplication,
  ): Promise<UniversalApplication> {
    const profileId = await this.ensureProfile(userId);
    return this.tenants.withTenant({ userId, roleClass: 'applicant' }, async sql => {
      const currentRows = (await sql`
        select universal_application from applicant_profiles
        where id = ${profileId}::uuid limit 1`) as unknown as UniversalRow[];
      const merged = mergeUniversal(
        universalApplicationSchema.parse(currentRows[0]?.universal_application ?? {}),
        patch,
      );
      const updated = (await sql`
        update applicant_profiles set
          universal_application = ${JSON.stringify(merged)}::jsonb,
          updated_at = now()
        where id = ${profileId}::uuid
        returning universal_application`) as unknown as UniversalRow[];
      await this.audit.append(
        sql, userId, null, 'universal_application.updated', 'applicant_profile', profileId,
        { sections: UNI_SECTIONS.filter(key => patch[key] !== undefined) },
      );
      return universalApplicationSchema.parse(updated[0]!.universal_application);
    });
  }

  async searchRentalProperties(q: SearchRentalQuery): Promise<RentalPropertyPublic[]> {
    return this.tenants.withTenant(ANON_CTX, async sql => {
      const term = `%${q.q.trim()}%`;
      const cityFilter = q.city !== undefined && q.city.trim() !== ''
        ? sql` and city ilike ${`%${q.city.trim()}%`}`
        : sql``;
      const rows = (await sql`
        select id, display_name, city, state, pet_policy, confirmed_count
        from rental_properties
        where normalized_name ilike ${term}${cityFilter}
        order by confirmed_count desc, display_name asc
        limit 10`) as unknown as RentalRow[];
      return rows.map(mapRental);
    });
  }

  async saveRentalProperty(
    userId: string,
    input: SaveRentalPropertyInput,
  ): Promise<RentalPropertyPublic> {
    const normalizedName = input.displayName.trim().toLowerCase();
    return this.tenants.service(async sql => {
      const rows = (await sql`
        insert into rental_properties
          (normalized_name, display_name, city, state, pet_policy, submitted_by)
        values (
          ${normalizedName}, ${input.displayName}, ${input.city}, ${input.state},
          ${JSON.stringify(input.petPolicy)}::jsonb, ${userId}::uuid)
        on conflict (normalized_name, city, state) do update set
          pet_policy = excluded.pet_policy,
          submitted_by = excluded.submitted_by,
          confirmed_count = rental_properties.confirmed_count + 1
        returning id, display_name, city, state, pet_policy, confirmed_count`) as unknown as RentalRow[];
      const row = rows[0]!;
      await this.audit.append(
        sql, userId, null, 'rental_property.submitted', 'rental_property', row.id,
        { normalizedName },
      );
      return mapRental(row);
    });
  }
}
