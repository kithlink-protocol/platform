import { BadRequestException, Injectable, NotFoundException, Inject } from '@nestjs/common';
import type { AnySql, PendingQuery, Row, TenantContext } from '@kithlink/db';
import { AuditService } from '../../common/audit.service';
import { TenantService } from '../db.module';

export interface ShelterProfileRow {
  id: string;
  name: string;
  slug: string;
  city: string | null;
  state: string | null;
  postal_code: string | null;
  latitude: number | null;
  longitude: number | null;
}

export interface ShelterProfile {
  id: string;
  name: string;
  slug: string;
  city: string | null;
  state: string | null;
  postalCode: string | null;
  latitude: number | null;
  longitude: number | null;
}

export function mapProfile(row: ShelterProfileRow): ShelterProfile {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    city: row.city ?? null,
    state: row.state ?? null,
    postalCode: row.postal_code ?? null,
    latitude: row.latitude ?? null,
    longitude: row.longitude ?? null,
  };
}

@Injectable()
export class SheltersService {
  constructor(
    @Inject(TenantService) private readonly tenants: TenantService,
    @Inject(AuditService) private readonly audit: AuditService,
  ) {}

  async updateProfile(
    ctx: TenantContext,
    actorId: string,
    shelterId: string,
    input: Record<string, unknown>,
  ): Promise<ShelterProfile> {
    return this.tenants.withTenant(ctx, async sql => {
      type Frag = PendingQuery<Row[]>;
      const assigns: Frag[] = [];
      if (input.name !== undefined) assigns.push(sql`name = ${input.name as string}`);
      if ('city' in input) assigns.push(sql`city = ${(input.city as string | null) ?? null}`);
      if ('state' in input) assigns.push(sql`state = ${(input.state as string | null) ?? null}`);
      if ('postalCode' in input) {
        assigns.push(sql`postal_code = ${(input.postalCode as string | null) ?? null}`);
      }
      if ('latitude' in input) {
        assigns.push(sql`latitude = ${(input.latitude as number | null) ?? null}`);
      }
      if ('longitude' in input) {
        assigns.push(sql`longitude = ${(input.longitude as number | null) ?? null}`);
      }
      if (assigns.length === 0) throw new BadRequestException('No fields to update');
      let setFrag: Frag = assigns[0]!;
      for (let i = 1; i < assigns.length; i++) setFrag = sql`${setFrag}, ${assigns[i]!}`;
      const rows = (await sql`
        update shelters set ${setFrag}
        where id = ${shelterId}::uuid
        returning id, name, slug, city, state, postal_code, latitude, longitude`) as unknown as ShelterProfileRow[];
      const row = rows[0];
      if (!row) throw new NotFoundException('Shelter not found');
      await this.audit.append(sql, actorId, shelterId, 'shelter.updated', 'shelter', shelterId, {
        fields: Object.keys(input),
      });
      return mapProfile(row);
    });
  }
}
