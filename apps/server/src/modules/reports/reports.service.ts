import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import { AuditService } from '../../common/audit.service';
import { TenantService } from '../db.module';

export interface ReportRange {
  from: Date;
  to: Date;
}

const DEFAULT_RANGE_MS = 365 * 24 * 60 * 60 * 1000;

const OUTCOME_STATUSES = ['adopted', 'denied', 'returned'] as const;

export function escapeCsv(value: unknown): string {
  const raw = value === null || value === undefined ? '' : String(value);
  return /[",\n\r]/.test(raw) ? `"${raw.replace(/"/g, '""')}"` : raw;
}

export function resolveReportRange(query: unknown): ReportRange {
  const params = (query ?? {}) as Record<string, unknown>;
  const toRaw = typeof params.to === 'string' && params.to.length > 0 ? params.to : undefined;
  const to = parseDateParam(toRaw, new Date());
  const fromRaw =
    typeof params.from === 'string' && params.from.length > 0 ? params.from : undefined;
  const from = parseDateParam(fromRaw, new Date(to.getTime() - DEFAULT_RANGE_MS));
  if (from.getTime() > to.getTime()) {
    throw new BadRequestException('from must not be after to');
  }
  return { from, to };
}

function parseDateParam(raw: string | undefined, fallback: Date): Date {
  if (raw === undefined) return fallback;
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) {
    throw new BadRequestException('from and to must be valid ISO dates');
  }
  return parsed;
}

interface OutcomeRow {
  status: string;
  count: number;
  avg_hours_to_decision: number | null;
}

interface LosRow {
  animal_name: string;
  submitted_at: Date | string;
  decided_at: Date | string;
  los_days: number;
}

interface CheckinRow {
  day_offset: number;
  created_at: Date;
  pet_mood: number;
  owner_mood: number;
  has_concern: boolean;
  topics: unknown;
}

function formatNumber(value: number): string {
  return String(Math.round(value * 100) / 100);
}

function toIso(value: Date | string): string {
  return new Date(value).toISOString();
}

@Injectable()
export class ReportsService {
  constructor(
    @Inject(TenantService) private readonly tenants: TenantService,
    @Inject(AuditService) private readonly audit: AuditService,
  ) {}

  async outcomesCsv(actorId: string, shelterId: string, range: ReportRange): Promise<string> {
    const rows = (await this.tenants.withTenant(
      { userId: actorId, shelterId, roleClass: 'staff' },
      async sql => {
        const result = (await sql`
          with decided as (
            select status, decided_at, submitted_at
            from applications
            where shelter_id = ${shelterId}::uuid
              and status in ('adopted', 'denied')
              and decided_at is not null
              and submitted_at is not null
              and decided_at >= ${toIso(range.from)} and decided_at <= ${toIso(range.to)}
          )
          select d.status::text as status, count(*)::int as count,
                 round(avg(extract(epoch from (d.decided_at - d.submitted_at)) / 3600.0)::numeric, 2)::float8
                   as avg_hours_to_decision
          from decided d group by d.status
          union all
          select 'returned' as status, count(*)::int as count, null::float8 as avg_hours_to_decision
          from adoption_cases c
          join adoption_journeys j on j.id = c.journey_id
          join applications a on a.id = j.application_id
          where c.shelter_id = ${shelterId}::uuid
            and c.kind = 'return'
            and c.opened_at >= ${toIso(range.from)} and c.opened_at <= ${toIso(range.to)}
            and a.status = 'adopted'`) as unknown as OutcomeRow[];
        await this.appendAudit(sql, actorId, shelterId, 'outcomes', range);
        return result;
      },
    )) as unknown as OutcomeRow[];
    const byStatus = new Map(rows.map(row => [row.status, row]));
    const lines = ['status,count,avg_hours_to_decision'];
    for (const status of OUTCOME_STATUSES) {
      const row =
        byStatus.get(status) ?? { status, count: 0, avg_hours_to_decision: null as number | null };
      lines.push(
        [
          escapeCsv(row.status),
          escapeCsv(row.count),
          escapeCsv(
            row.avg_hours_to_decision === null ? '' : formatNumber(row.avg_hours_to_decision),
          ),
        ].join(','),
      );
    }
    return `${lines.join('\n')}\n`;
  }

  async lengthOfStayCsv(
    actorId: string,
    shelterId: string,
    range: ReportRange,
  ): Promise<string> {
    const rows = (await this.tenants.withTenant(
      { userId: actorId, shelterId, roleClass: 'staff' },
      async sql => {
        const result = (await sql`
          select a.name as animal_name, ap.submitted_at, ap.decided_at,
                 extract(day from (ap.decided_at - ap.submitted_at))::int as los_days
          from applications ap
          join animals a on a.id = ap.animal_id
          where ap.shelter_id = ${shelterId}::uuid
            and ap.status = 'adopted'
            and ap.decided_at is not null
            and ap.submitted_at is not null
            and ap.decided_at >= ${toIso(range.from)} and ap.decided_at <= ${toIso(range.to)}
          order by ap.decided_at asc`) as unknown as LosRow[];
        await this.appendAudit(sql, actorId, shelterId, 'length-of-stay', range);
        return result;
      },
    )) as unknown as LosRow[];
    const avg =
      rows.length === 0
        ? null
        : rows.reduce((sum, row) => sum + row.los_days, 0) / rows.length;
    const header = `# generated_at=${new Date().toISOString()},avg_los_days=${
      avg === null ? '' : formatNumber(avg)
    }`;
    const lines = ['animal_name,submitted_at,decided_at,los_days'];
    for (const row of rows) {
      lines.push(
        [
          escapeCsv(row.animal_name),
          escapeCsv(toIso(row.submitted_at)),
          escapeCsv(toIso(row.decided_at)),
          escapeCsv(row.los_days),
        ].join(','),
      );
    }
    return `${[header, ...lines].join('\n')}\n`;
  }

  async checkinsCsv(actorId: string, shelterId: string, range: ReportRange): Promise<string> {
    const rows = (await this.tenants.withTenant(
      { userId: actorId, shelterId, roleClass: 'staff' },
      async sql => {
        const result = (await sql`
          select t.day_offset, r.created_at, r.pet_mood, r.owner_mood, r.has_concern, r.topics
          from journey_responses r
          join adoption_journeys j on j.id = r.journey_id
          join journey_touchpoints t on t.id = r.touchpoint_id
          where j.shelter_id = ${shelterId}::uuid
            and r.created_at >= ${toIso(range.from)} and r.created_at <= ${toIso(range.to)}
          order by r.created_at asc`) as unknown as CheckinRow[];
        await this.appendAudit(sql, actorId, shelterId, 'checkins', range);
        return result;
      },
    )) as unknown as CheckinRow[];
    const lines = ['day_offset,response_created_at,pet_mood,owner_mood,has_concern,topics'];
    for (const row of rows) {
      const topics = Array.isArray(row.topics) ? row.topics.map(String).join('|') : '';
      lines.push(
        [
          escapeCsv(row.day_offset),
          escapeCsv(toIso(row.created_at)),
          escapeCsv(row.pet_mood),
          escapeCsv(row.owner_mood),
          escapeCsv(row.has_concern),
          escapeCsv(topics),
        ].join(','),
      );
    }
    return `${lines.join('\n')}\n`;
  }

  private appendAudit(
    sql: Parameters<AuditService['append']>[0],
    actorId: string,
    shelterId: string,
    report: string,
    range: ReportRange,
  ): Promise<void> {
    return this.audit.append(sql, actorId, shelterId, 'report.exported', 'report', null, {
      report,
      from: range.from.toISOString(),
      to: range.to.toISOString(),
    });
  }
}
