import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import {
  publishResponseSchema,
  siteBrandSchema,
  siteConfigResponseSchema,
  type PublishResponse,
  type SiteConfigInput,
  type SiteConfigResponse,
} from '@kithlink/contracts';
import type { AnySql, TenantContext } from '@kithlink/db';
import { AuditService } from '../../common/audit.service';
import { TenantService } from '../db.module';
import { S3Service } from '../s3/s3.module';
import {
  renderAnimalsHtml,
  renderIndexHtml,
  renderLlmsTxt,
  renderSitemapTxt,
  type RenderAnimal,
} from './render';

interface SiteRow {
  id: string;
  shelter_id: string;
  theme_slug: string;
  brand: unknown;
  hero_title: string;
  hero_body: string;
  published_at: string | Date | null;
  slug: string;
  name: string;
}

function mapSiteRow(row: SiteRow): SiteConfigResponse {
  return siteConfigResponseSchema.parse({
    shelterId: row.shelter_id,
    slug: row.slug,
    themeSlug: row.theme_slug,
    brand: siteBrandSchema.parse(row.brand ?? {}),
    heroTitle: row.hero_title,
    heroBody: row.hero_body,
    publishedAt: row.published_at ? new Date(row.published_at as string | Date).toISOString() : null,
  });
}

@Injectable()
export class SitesService {
  constructor(
    @Inject(TenantService) private readonly tenants: TenantService,
    @Inject(S3Service) private readonly s3: S3Service,
    @Inject(AuditService) private readonly audit: AuditService,
  ) {}

  async getOrCreate(ctx: TenantContext, shelterId: string): Promise<SiteRow> {
    return this.tenants.withTenant(ctx, async sql => {
      await sql`insert into sites (shelter_id) values (${shelterId}::uuid) on conflict (shelter_id) do nothing`;
      const rows = (await sql`
        select s.id, s.shelter_id, s.theme_slug, s.brand, s.hero_title, s.hero_body, s.published_at,
               sh.slug, sh.name
        from sites s join shelters sh on sh.id = s.shelter_id
        where s.shelter_id = ${shelterId}::uuid limit 1`) as unknown as SiteRow[];
      const row = rows[0];
      if (!row) throw new NotFoundException('Shelter not found');
      return row;
    });
  }

  async getConfig(ctx: TenantContext, shelterId: string): Promise<SiteConfigResponse> {
    return mapSiteRow(await this.getOrCreate(ctx, shelterId));
  }

  async updateConfig(
    ctx: TenantContext,
    actorId: string,
    shelterId: string,
    input: SiteConfigInput,
  ): Promise<SiteConfigResponse> {
    await this.getOrCreate(ctx, shelterId);
    return this.tenants.withTenant(ctx, async sql => {
      await sql`
        update sites set
          theme_slug = ${input.themeSlug},
          brand = ${JSON.stringify(input.brand)}::jsonb,
          hero_title = ${input.heroTitle},
          hero_body = ${input.heroBody}
        where shelter_id = ${shelterId}::uuid`;
      await this.audit.append(sql, actorId, shelterId, 'site.config.updated', 'site', shelterId, {
        themeSlug: input.themeSlug,
      });
      const rows = (await sql`
        select s.id, s.shelter_id, s.theme_slug, s.brand, s.hero_title, s.hero_body, s.published_at,
               sh.slug, sh.name
        from sites s join shelters sh on sh.id = s.shelter_id
        where s.shelter_id = ${shelterId}::uuid limit 1`) as unknown as SiteRow[];
      if (!rows[0]) throw new NotFoundException('Site not found');
      return mapSiteRow(rows[0]);
    });
  }

  async publish(ctx: TenantContext, actorId: string, shelterId: string): Promise<PublishResponse> {
    const site = await this.getOrCreate(ctx, shelterId);
    const animals = await this.loadRenderAnimals(ctx, shelterId);
    const cfg = {
      shelterName: site.name,
      slug: site.slug,
      heroTitle: site.hero_title,
      heroBody: site.hero_body,
      brand: siteBrandSchema.parse(site.brand ?? {}),
      animals,
    };
    const buildId = randomUUID();
    const base = `sites/${site.slug}/builds/${buildId}`;
    await this.s3.put(`${base}/index.html`, Buffer.from(renderIndexHtml(cfg), 'utf8'), 'text/html; charset=utf-8');
    await this.s3.put(`${base}/animals.html`, Buffer.from(renderAnimalsHtml(cfg), 'utf8'), 'text/html; charset=utf-8');
    await this.s3.put(`${base}/sitemap.txt`, Buffer.from(renderSitemapTxt(site.slug), 'utf8'), 'text/plain; charset=utf-8');
    await this.s3.put(`${base}/llms.txt`, Buffer.from(renderLlmsTxt(cfg), 'utf8'), 'text/plain; charset=utf-8');
    await this.s3.put(`sites/${site.slug}/CURRENT`, Buffer.from(buildId, 'utf8'), 'text/plain; charset=utf-8');
    return this.tenants.withTenant(ctx, async sql => {
      await sql`update sites set published_at = now() where id = ${site.id}::uuid`;
      await this.audit.append(sql, actorId, shelterId, 'site.published', 'site', shelterId, {
        buildId,
        animalCount: animals.length,
      });
      return publishResponseSchema.parse({
        slug: site.slug,
        buildId,
        publishedAt: new Date().toISOString(),
        animalCount: animals.length,
      });
    });
  }

  loadRenderAnimals(ctx: TenantContext, shelterId: string): Promise<RenderAnimal[]> {
    return this.tenants.withTenant(ctx, sql => loadAvailable(sql, shelterId));
  }
}

interface AnimalRow {
  name: string;
  species: string;
  breed: string | null;
  status: string;
  description: string | null;
  alt_text: string | null;
}

export async function loadAvailable(sql: AnySql, shelterId: string): Promise<RenderAnimal[]> {
  const rows = (await sql`
    select a.name, a.species, a.breed, a.status, a.description,
           (select p.alt_text from animal_photos p where p.animal_id = a.id order by p.position limit 1) as alt_text
    from animals a
    where a.shelter_id = ${shelterId}::uuid and a.status = 'available'
    order by a.created_at`) as unknown as AnimalRow[];
  return rows.map(row => ({
    name: row.name,
    species: row.species,
    breed: row.breed,
    status: row.status,
    description: row.alt_text ?? row.description,
  }));
}
