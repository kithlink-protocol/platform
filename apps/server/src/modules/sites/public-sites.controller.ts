import { BadRequestException, Controller, Get, Inject, NotFoundException, Param, Res } from '@nestjs/common';
import type { Response } from 'express';
import { TenantService } from '../db.module';
import { S3Service } from '../s3/s3.module';
import { loadAvailable } from './sites.service';
import { escapeHtml } from './render';

const ANON_CTX = { roleClass: 'anonymous' } as const;
const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const ALLOWED_FILES = new Set(['index.html', 'animals.html', 'sitemap.txt']);

@Controller('public/v1/sites')
export class PublicSitesController {
  constructor(
    @Inject(TenantService) private readonly tenants: TenantService,
    @Inject(S3Service) private readonly s3: S3Service,
  ) {}

  @Get(':slug')
  async index(@Param('slug') slug: string, @Res() res: Response): Promise<void> {
    await this.serve(slug, 'index.html', res);
  }

  @Get(':slug/:file')
  async file(@Param('slug') slug: string, @Param('file') file: string, @Res() res: Response): Promise<void> {
    if (file !== 'CURRENT' && !ALLOWED_FILES.has(file)) throw new NotFoundException('File not found');
    await this.serve(slug, file, res);
  }

  private async serve(slug: string, file: string, res: Response): Promise<void> {
    if (!SLUG_RE.test(slug)) throw new BadRequestException('Invalid slug');
    let key: string;
    let contentType: string;
    if (file === 'CURRENT') {
      key = `sites/${slug}/CURRENT`;
      contentType = 'text/plain; charset=utf-8';
    } else {
      let buildId: string;
      try {
        buildId = (await this.s3.get(`sites/${slug}/CURRENT`)).toString('utf8').trim();
      } catch {
        throw new NotFoundException('Site not published');
      }
      key = `sites/${slug}/builds/${buildId}/${file}`;
      contentType = file.endsWith('.html') ? 'text/html; charset=utf-8' : 'text/plain; charset=utf-8';
    }
    let body: Buffer;
    try {
      body = await this.s3.get(key);
    } catch {
      throw new NotFoundException('Site asset not found');
    }
    res.setHeader('Cache-Control', 'public, max-age=60');
    res.setHeader('Content-Type', contentType);
    res.send(body);
  }
}

@Controller('public/v1/feed/shelters')
export class PublicFeedController {
  constructor(@Inject(TenantService) private readonly tenants: TenantService) {}

  @Get(':slug/rss.xml')
  async rss(@Param('slug') slug: string, @Res() res: Response): Promise<void> {
    if (!SLUG_RE.test(slug)) throw new BadRequestException('Invalid slug');
    const xml = await this.tenants.withTenant(ANON_CTX, async sql => {
      const shelters = (await sql`
        select id, name from shelters where slug = ${slug} limit 1`) as unknown as {
        id: string;
        name: string;
      }[];
      const shelter = shelters[0];
      if (!shelter) throw new NotFoundException('Shelter not found');
      const animals = await loadAvailable(sql, shelter.id);
      const items = animals
        .map(
          animal =>
            '<item>\n<title>' + escapeHtml(animal.name) + '</title>\n' +
            '<description>' +
            escapeHtml(`${animal.species} · ${animal.breed ?? 'Mixed'} · ${animal.description ?? ''}`) +
            '</description>\n</item>',
        )
        .join('\n');
      return (
        '<?xml version="1.0" encoding="UTF-8"?>\n<rss version="2.0">\n<channel>\n' +
        '<title>' + escapeHtml(shelter.name) + '</title>\n' +
        '<link>/public/v1/sites/' + escapeHtml(slug) + '</link>\n' +
        '<description>' + escapeHtml(`Adoptable animals at ${shelter.name}`) + '</description>\n' +
        items +
        '\n</channel>\n</rss>'
      );
    });
    res.setHeader('Cache-Control', 'public, max-age=300');
    res.setHeader('Content-Type', 'application/rss+xml; charset=utf-8');
    res.send(xml);
  }
}
