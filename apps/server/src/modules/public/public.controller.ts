import { Controller, Get, NotFoundException, Param, Query,
  Inject,
} from '@nestjs/common';
import {
  animalListQuerySchema,
  listSheltersQuerySchema,
  shelterDetailSchema,
  type ShelterDetail,
} from '@kithlink/contracts';
import type { TenantContext } from '@kithlink/db';
import { getVersion } from '../../common/version';
import { TenantService } from '../db.module';
import { AnimalsService } from '../animals/animals.service';

interface ShelterCountRow {
  id: string;
  name: string;
  slug: string;
  available_animal_count: number;
}

function mapShelterDetail(row: ShelterCountRow): ShelterDetail {
  return shelterDetailSchema.parse({
    id: row.id,
    name: row.name,
    slug: row.slug,
    availableAnimalCount: row.available_animal_count,
  });
}

const ANON_CTX: TenantContext = { roleClass: 'anonymous' };

@Controller('public/v1')
export class PublicRegistryController {
  constructor(
    @Inject(TenantService) private readonly tenants: TenantService,
    @Inject(AnimalsService) private readonly animalsService: AnimalsService,
  ) {}

  @Get('version')
  version() {
    return getVersion();
  }

  @Get('shelters')
  shelters(@Query() query: unknown): Promise<ShelterDetail[]> {
    const q = listSheltersQuerySchema.parse(query);
    return this.tenants.withTenant(ANON_CTX, async sql => {
      const filter = q.q !== undefined ? sql` where s.name ilike ${'%' + q.q + '%'}` : sql``;
      const rows = (await sql`
        select s.id, s.name, s.slug,
          (select count(*)::int from animals a where a.shelter_id = s.id and a.status = 'available')
            as available_animal_count
        from shelters s${filter}
        order by s.slug
        limit ${q.limit}`) as unknown as ShelterCountRow[];
      return rows.map(mapShelterDetail);
    });
  }

  @Get('shelters/:slug')
  async shelterDetail(@Param('slug') slug: string): Promise<ShelterDetail> {
    const row = await this.resolveShelter(slug);
    if (!row) throw new NotFoundException('Shelter not found');
    return mapShelterDetail(row);
  }

  @Get('shelters/:slug/animals')
  async animals(@Param('slug') slug: string, @Query() query: unknown) {
    const parsed = animalListQuerySchema.parse(query);
    const shelter = await this.resolveShelter(slug);
    if (!shelter) throw new NotFoundException('Shelter not found');
    // Status is forced to 'available' regardless of the query param.
    return this.animalsService.list(ANON_CTX, shelter.id, { ...parsed, status: 'available' });
  }

  private resolveShelter(slug: string): Promise<ShelterCountRow | null> {
    return this.tenants.withTenant(ANON_CTX, async sql => {
      const rows = (await sql`
        select s.id, s.name, s.slug,
          (select count(*)::int from animals a where a.shelter_id = s.id and a.status = 'available')
            as available_animal_count
        from shelters s
        where s.slug = ${slug}
        limit 1`) as unknown as ShelterCountRow[];
      return rows[0] ?? null;
    });
  }
}

@Controller()
export class HealthController {
  constructor(
    @Inject(TenantService) private readonly tenants: TenantService,
  ) {}

  @Get('healthz')
  healthz() {
    return { ok: true };
  }

  @Get('readyz')
  async readyz() {
    await this.tenants.service(sql => sql`select 1`);
    return { ok: true };
  }
}
