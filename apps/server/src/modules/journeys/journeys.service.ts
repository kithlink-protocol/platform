import { ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { createHash, randomBytes } from 'node:crypto';
import type { AnySql } from '@kithlink/db';
import {
  journeyActionResultSchema,
  journeyDetailSchema,
  journeyListResponseSchema,
  journeyPublicViewSchema,
  labelForDay,
  type JourneyCaseResolveInput,
  type JourneyDetail,
  type JourneyPublicView,
  type JourneyRespondInput,
  type JourneyReturnInput,
  type JourneyStatusView,
} from '@kithlink/contracts';
import { AuditService } from '../../common/audit.service';
import { TenantService } from '../db.module';
import { OutboxService } from '../notifications/notifications.module';

export const JOURNEYS_CRON_INTERVAL_MS = 10 * 60 * 1000;

/** Touchpoints scheduled at adoption finalization (docs/design/12 §M5). */
const TOUCHPOINT_DAY_OFFSETS = [2, 14, 30, 365] as const;

/** Topics that quietly open a concern case when selected. */
const CONCERN_TOPICS = new Set<string>(['potty', 'chewing', 'vet', 'intros', 'training']);

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function toIso(value: unknown): string {
  return new Date(value as unknown as string | Date).toISOString();
}

interface ApplicationLinkRow {
  animal_id: string;
  shelter_id: string;
  adopter_user_id: string | null;
}

interface TouchpointRow {
  id: string;
  journey_id: string;
  day_offset: number;
}

interface RespondTargetRow extends TouchpointRow {
  status: string;
  shelter_id: string;
  journey_status: string;
}

interface PublicTouchpointRow {
  animal_name: string;
  shelter_name: string;
  day_offset: number;
  status: string;
  journey_status: string;
}

interface JourneyListRow {
  id: string;
  status: string;
  animal_name: string;
  adopter_email: string | null;
  day_offset: number | null;
  last_response_at: Date | null;
  has_open_case: boolean;
  min_pet_mood: number | null;
}

interface JourneyBaseRow {
  id: string;
  status: string;
  started_at: Date;
  animal_name: string;
  adopter_email: string | null;
}

interface DetailTouchpointRow {
  id: string;
  day_offset: number;
  sent_at: Date | null;
}

interface DetailResponseRow {
  touchpoint_id: string;
  day_offset: number;
  pet_mood: number;
  owner_mood: number;
  topics: unknown;
  note: string | null;
  has_concern: boolean;
  created_at: Date;
}

interface DetailCaseRow {
  id: string;
  kind: string;
  reason: string;
  status: string;
  opened_at: Date;
  resolved_at: Date | null;
  resolution_note: string | null;
}

interface DueTouchpointRow {
  id: string;
  token_raw: string;
  day_offset: number;
  pet_name: string;
  email: string | null;
}

@Injectable()
export class JourneysService {
  constructor(
    @Inject(TenantService) private readonly tenants: TenantService,
    @Inject(AuditService) private readonly audit: AuditService,
    @Inject(OutboxService) private readonly outbox: OutboxService,
  ) {}

  /** After-commit hook from ApplicationsService.decide(); unique application guard via ON CONFLICT. */
  async createForAdoption(applicationId: string): Promise<void> {
    await this.tenants.service(async sql => {
      const links = (await sql`
        select a.animal_id, a.shelter_id, ap.user_id as adopter_user_id
        from applications a
        join applicant_profiles ap on ap.id = a.applicant_id
        where a.id = ${applicationId}::uuid
        limit 1`) as unknown as ApplicationLinkRow[];
      const link = links[0];
      if (!link) return;
      const inserted = (await sql`
        insert into adoption_journeys (application_id, animal_id, shelter_id, adopter_user_id)
        values (${applicationId}::uuid, ${link.animal_id}::uuid, ${link.shelter_id}::uuid,
                ${link.adopter_user_id}::uuid)
        on conflict (application_id) do nothing
        returning id`) as unknown as { id: string }[];
      const journey = inserted[0];
      if (!journey) return;
      for (const offset of TOUCHPOINT_DAY_OFFSETS) {
        const tokenRaw = randomBytes(24).toString('hex');
        await sql`
          insert into journey_touchpoints (journey_id, day_offset, scheduled_for, token_raw, token_hash)
          values (${journey.id}::uuid, ${offset}, now() + make_interval(days => ${offset}::int),
                  ${tokenRaw}, ${sha256(tokenRaw)})`;
      }
    });
  }

  async publicView(token: string): Promise<JourneyPublicView> {
    const rows = (await this.tenants.service(async sql => {
      return sql`
        select a.name as animal_name, s.name as shelter_name,
               t.day_offset, t.status, j.status as journey_status
        from journey_touchpoints t
        join adoption_journeys j on j.id = t.journey_id
        join animals a on a.id = j.animal_id
        join shelters s on s.id = j.shelter_id
        where t.token_hash = ${sha256(token)}
        limit 1`;
    })) as unknown as PublicTouchpointRow[];
    const row = rows[0];
    if (!row || row.journey_status === 'returned' || row.journey_status === 'opted_out') {
      throw new NotFoundException('Check-in not found');
    }
    return journeyPublicViewSchema.parse({
      animalName: row.animal_name,
      shelterName: row.shelter_name,
      dayOffset: row.day_offset,
      dayLabel: labelForDay(row.day_offset),
      alreadyDone: row.status !== 'sent',
    });
  }

  async respond(input: JourneyRespondInput): Promise<{ ok: true }> {
    await this.tenants.service(async sql => {
      const targets = (await sql`
        select t.id, t.journey_id, t.day_offset, t.status,
               j.shelter_id, j.status as journey_status
        from journey_touchpoints t
        join adoption_journeys j on j.id = t.journey_id
        where t.token_hash = ${sha256(input.token)}
        limit 1`) as unknown as RespondTargetRow[];
      const target = targets[0];
      if (
        !target ||
        target.status !== 'sent' ||
        target.journey_status === 'returned' ||
        target.journey_status === 'opted_out'
      ) {
        throw new NotFoundException('Check-in not found');
      }
      const claimed = (await sql`
        update journey_touchpoints set status = 'done'
        where id = ${target.id}::uuid and status = 'sent'
        returning id`) as unknown as { id: string }[];
      if (!claimed[0]) throw new ConflictException('Check-in already answered');

      const concerningTopic = input.topics.find(topic => CONCERN_TOPICS.has(topic));
      const hasConcern = input.wantFollowUp || concerningTopic !== undefined;
      await sql`
        insert into journey_responses
          (touchpoint_id, journey_id, pet_mood, owner_mood, topics, note, has_concern)
        values (${target.id}::uuid, ${target.journey_id}::uuid, ${input.petMood}, ${input.ownerMood},
                ${JSON.stringify(input.topics)}::jsonb, ${input.note ?? null}, ${hasConcern})`;
      if (concerningTopic !== undefined) {
        await sql`
          insert into adoption_cases (journey_id, shelter_id, kind, reason)
          values (${target.journey_id}::uuid, ${target.shelter_id}::uuid, 'concern',
                  ${concerningTopic})`;
      } else if (input.wantFollowUp) {
        await sql`
          insert into adoption_cases (journey_id, shelter_id, kind, reason)
          values (${target.journey_id}::uuid, ${target.shelter_id}::uuid, 'concern', 'note')`;
      }
      await sql`
        update adoption_journeys set status = 'completed'
        where id = ${target.journey_id}::uuid and status = 'active'
          and not exists (
            select 1 from journey_touchpoints
            where journey_id = ${target.journey_id}::uuid and status <> 'done')`;
      // Meta carries ids only — never adopter identity or free-text content.
      await this.audit.append(sql, null, target.shelter_id, 'journey.respond_public', 'journey_touchpoint', target.id, {
        journeyId: target.journey_id,
        dayOffset: target.day_offset,
        hasConcern,
      });
    });
    return journeyActionResultSchema.parse({ ok: true });
  }

  async skip(token: string): Promise<{ ok: true }> {
    const skipped = (await this.tenants.service(async sql => {
      return sql`
        update journey_touchpoints set status = 'skipped'
        where token_hash = ${sha256(token)} and status = 'sent'
        returning id`;
    })) as unknown as { id: string }[];
    if (!skipped[0]) throw new NotFoundException('Check-in not found');
    return journeyActionResultSchema.parse({ ok: true });
  }

  async staffList(actorId: string, shelterId: string): Promise<{ items: JourneyStatusView[] }> {
    const rows = (await this.tenants.withTenant(
      { userId: actorId, shelterId, roleClass: 'staff' },
      async sql => {
        return sql`
          select j.id, j.status, an.name as animal_name, u.email as adopter_email,
                 coalesce(next_tp.day_offset, last_tp.day_offset) as day_offset,
                 lr.last_response_at, lr.min_pet_mood,
                 exists (
                   select 1 from adoption_cases c
                   where c.journey_id = j.id and c.status = 'open'
                 ) as has_open_case
          from adoption_journeys j
          join animals an on an.id = j.animal_id
          left join users u on u.id = j.adopter_user_id
          left join lateral (
            select min(t.day_offset) as day_offset from journey_touchpoints t
            where t.journey_id = j.id and t.status = 'scheduled'
          ) next_tp on true
          left join lateral (
            select max(t.day_offset) as day_offset from journey_touchpoints t
            where t.journey_id = j.id
          ) last_tp on true
          left join lateral (
            select max(r.created_at) as last_response_at, min(r.pet_mood) as min_pet_mood
            from journey_responses r where r.journey_id = j.id
          ) lr on true
          where j.shelter_id = ${shelterId}::uuid
          order by j.started_at desc, j.id desc
          limit 200`;
      },
    )) as unknown as JourneyListRow[];
    return journeyListResponseSchema.parse({
      items: rows.map(row => {
        const dayOffset = row.day_offset ?? 0;
        return {
          id: row.id,
          animalName: row.animal_name,
          adopterEmail: row.adopter_email,
          dayOffset,
          dayLabel: labelForDay(dayOffset),
          status: row.status as JourneyStatusView['status'],
          risk: row.has_open_case || (row.min_pet_mood !== null && row.min_pet_mood <= 2),
          lastResponseAt: row.last_response_at ? toIso(row.last_response_at) : null,
        };
      }),
    }) as { items: JourneyStatusView[] };
  }

  async staffGet(actorId: string, shelterId: string, journeyId: string): Promise<JourneyDetail> {
    const detail = await this.tenants.withTenant(
      { userId: actorId, shelterId, roleClass: 'staff' },
      async sql => {
        const bases = (await sql`
          select j.id, j.status, j.started_at, an.name as animal_name, u.email as adopter_email
          from adoption_journeys j
          join animals an on an.id = j.animal_id
          left join users u on u.id = j.adopter_user_id
          where j.id = ${journeyId}::uuid and j.shelter_id = ${shelterId}::uuid
          limit 1`) as unknown as JourneyBaseRow[];
        const base = bases[0];
        if (!base) throw new NotFoundException('Journey not found');
        const touchpoints = (await sql`
          select id, day_offset, sent_at
          from journey_touchpoints
          where journey_id = ${journeyId}::uuid
          order by day_offset asc`) as unknown as DetailTouchpointRow[];
        const responses = (await sql`
          select r.touchpoint_id, r.pet_mood, r.owner_mood, r.topics, r.note, r.has_concern,
                 r.created_at, t.day_offset
          from journey_responses r
          join journey_touchpoints t on t.id = r.touchpoint_id
          where r.journey_id = ${journeyId}::uuid
          order by r.created_at asc`) as unknown as DetailResponseRow[];
        const cases = (await sql`
          select id, kind, reason, status, opened_at, resolved_at, resolution_note
          from adoption_cases
          where journey_id = ${journeyId}::uuid
          order by opened_at asc`) as unknown as DetailCaseRow[];
        return { base, touchpoints, responses, cases };
      },
    );
    return journeyDetailSchema.parse({
      id: detail.base.id,
      animalName: detail.base.animal_name,
      adopterEmail: detail.base.adopter_email,
      status: detail.base.status,
      startedAt: toIso(detail.base.started_at),
      touchpoints: detail.touchpoints.map(t => ({
        dayOffset: t.day_offset,
        dayLabel: labelForDay(t.day_offset),
        sentAt: t.sent_at ? toIso(t.sent_at) : null,
      })),
      responses: detail.responses.map(r => ({
        touchpointId: r.touchpoint_id,
        dayOffset: r.day_offset,
        petMood: r.pet_mood,
        ownerMood: r.owner_mood,
        topics: Array.isArray(r.topics) ? r.topics.map(String) : [],
        note: r.note,
        hasConcern: r.has_concern,
        createdAt: toIso(r.created_at),
      })),
      cases: detail.cases.map(c => ({
        id: c.id,
        kind: c.kind as 'concern' | 'return',
        reason: c.reason,
        status: c.status as 'open' | 'resolved',
        openedAt: toIso(c.opened_at),
        resolvedAt: c.resolved_at ? toIso(c.resolved_at) : null,
        resolutionNote: c.resolution_note,
      })),
    });
  }

  async staffResolveCase(
    actorId: string,
    shelterId: string,
    caseId: string,
    input: JourneyCaseResolveInput,
  ): Promise<{ ok: true }> {
    await this.tenants.withTenant(
      { userId: actorId, shelterId, roleClass: 'staff' },
      async sql => {
        const updated = (await sql`
          update adoption_cases
          set status = 'resolved', resolution_note = ${input.resolutionNote}, resolved_at = now()
          where id = ${caseId}::uuid and shelter_id = ${shelterId}::uuid and status = 'open'
          returning id, journey_id`) as unknown as { id: string; journey_id: string }[];
        const resolved = updated[0];
        if (!resolved) throw new NotFoundException('Open case not found');
        await this.audit.append(sql, actorId, shelterId, 'journey.case_resolved', 'adoption_case', resolved.id, {
          journeyId: resolved.journey_id,
        });
      },
    );
    return journeyActionResultSchema.parse({ ok: true });
  }

  async staffReturnJourney(
    actorId: string,
    shelterId: string,
    journeyId: string,
    input: JourneyReturnInput,
  ): Promise<{ ok: true }> {
    await this.tenants.withTenant(
      { userId: actorId, shelterId, roleClass: 'staff' },
      async sql => {
        const bases = (await sql`
          select j.id, j.status, j.animal_id
          from adoption_journeys j
          where j.id = ${journeyId}::uuid and j.shelter_id = ${shelterId}::uuid
          limit 1`) as unknown as { id: string; status: string; animal_id: string }[];
        const base = bases[0];
        if (!base) throw new NotFoundException('Journey not found');
        if (base.status === 'returned') throw new ConflictException('Journey already returned');
        const returned = (await sql`
          update adoption_journeys set status = 'returned'
          where id = ${journeyId}::uuid and status <> 'returned'
          returning id`) as unknown as { id: string }[];
        if (!returned[0]) throw new ConflictException('Journey already returned');
        await sql`
          update animals set status = 'available', updated_at = now()
          where id = ${base.animal_id}::uuid`;
        const cases = (await sql`
          insert into adoption_cases (journey_id, shelter_id, kind, reason)
          values (${journeyId}::uuid, ${shelterId}::uuid, 'return', ${input.reason})
          returning id`) as unknown as { id: string }[];
        await this.audit.append(sql, actorId, shelterId, 'journey.returned', 'journey', journeyId, {
          animalId: base.animal_id,
          caseId: cases[0]?.id ?? null,
        });
      },
    );
    return journeyActionResultSchema.parse({ ok: true });
  }
}

/**
 * Cron body: sends due touchpoint emails through the transactional outbox.
 * Claim-then-enqueue in one tx so a crash cannot double-send.
 */
export async function runJourneysSweep(
  tenants: TenantService,
  outbox: OutboxService,
): Promise<number> {
  const appUrl = process.env.APP_URL ?? 'http://localhost:3000';
  const due = (await tenants.service(async sql => {
    return sql`
      select t.id, t.token_raw, t.day_offset, a.name as pet_name, u.email
      from journey_touchpoints t
      join adoption_journeys j on j.id = t.journey_id
      join animals a on a.id = j.animal_id
      left join users u on u.id = j.adopter_user_id and u.deleted_at is null
      where t.status = 'scheduled' and t.scheduled_for <= now()
      order by t.scheduled_for
      limit 50`;
  })) as unknown as DueTouchpointRow[];
  let sent = 0;
  for (const row of due) {
    if (!row.email) continue;
    try {
      await tenants.service(async sql => {
        const claimed = (await sql`
          update journey_touchpoints set status = 'sent', sent_at = now()
          where id = ${row.id}::uuid and status = 'scheduled'
          returning id`) as unknown as { id: string }[];
        if (!claimed[0]) return;
        const url = `${appUrl}/journey?jt=${row.token_raw}`;
        if (!row.email) return;
        // Extra keys ride along in payload_json for webhooks/consumers; the mail
        // dispatcher only reads to/subject/text.
        const payload = {
          to: [row.email],
          subject: `How's ${row.pet_name} settling in?`,
          text:
            `Hi there,\n\n` +
            `${labelForDay(row.day_offset)} with ${row.pet_name} — how are things going at home?\n\n` +
            `Share a quick update (takes about a minute, no login needed):\n${url}\n\n` +
            `Not a good time? Skip this check-in:\n${url}&skip=1`,
          petName: row.pet_name,
          dayOffset: row.day_offset,
          url,
          skipUrl: `${url}&skip=1`,
        };
        await outbox.enqueue(sql, 'journey.checkin', payload);
        sent++;
      });
    } catch (error) {
      console.warn(`[journeys] failed to dispatch touchpoint ${row.id}`, error);
    }
  }
  return sent;
}

/** Wired from main.api.ts next to the mail dispatcher cron. */
export function startJourneysScheduler(tenants: TenantService, outbox: OutboxService): void {
  const timer = setInterval(() => {
    void runJourneysSweep(tenants, outbox).catch((error: unknown) => {
      console.error('[journeys] check-in sweep failed', error);
    });
  }, JOURNEYS_CRON_INTERVAL_MS);
  timer.unref();
  console.log('[journeys] check-in scheduler enabled (10m interval)');
}
