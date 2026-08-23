import {
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { createHash, timingSafeEqual } from 'node:crypto';
import {
  fosterCheckInViewSchema,
  fosterHomeListResponseSchema,
  fosterHomeSchema,
  fosterPlacementListResponseSchema,
  fosterPlacementSchema,
  fosterUpdatesResponseSchema,
  type CreatePlacementInput,
  type FosterCheckInSubmitInput,
  type FosterHomeListResponse,
  type FosterHome,
  type FosterPlacement,
  type FosterPlacementListQuery,
  type FosterUpdatesResponse,
  type UpsertFosterHomeInput,
} from '@kithlink/contracts';
import { AuditService } from '../../common/audit.service';
import { TenantService } from '../db.module';
import { OutboxService } from '../notifications/notifications.module';

export const FOSTER_CRON_INTERVAL_MS = 10 * 60 * 1000;

interface FosterHomeRow {
  id: string;
  home_name: string;
  primary_contact_email: string;
  capacity: number;
  environment: unknown;
  skills: string[];
  active: boolean;
  current_placements: number;
}

interface FosterPlacementRow {
  id: string;
  home_id: string;
  animal_id: string;
  animal_name: string;
  started_at: Date;
  next_check_in: Date;
  status: string;
}

interface DueFosterRow {
  id: string;
  home_id: string;
  animal_id: string;
  started_at: Date;
  contact_email: string;
  home_name: string;
  animal_name: string;
}

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

/** Deterministic check-in key: sha256(homeId || animalId || startedAt ISO day). */
export function fosterCheckInKey(
  homeId: string,
  animalId: string,
  startedAt: Date | string,
): string {
  const isoDay = new Date(startedAt).toISOString().slice(0, 10);
  return sha256(`${homeId}${animalId}${isoDay}`);
}

function mapHome(row: FosterHomeRow): FosterHome {
  return fosterHomeSchema.parse({
    id: row.id,
    homeName: row.home_name,
    primaryContactEmail: row.primary_contact_email,
    capacity: row.capacity,
    environment:
      typeof row.environment === 'object' && row.environment !== null
        ? row.environment
        : {},
    skills: row.skills ?? [],
    active: row.active,
    currentPlacements: row.current_placements,
  });
}

function mapPlacement(row: FosterPlacementRow): FosterPlacement {
  return fosterPlacementSchema.parse({
    id: row.id,
    homeId: row.home_id,
    animalId: row.animal_id,
    animalName: row.animal_name,
    startedAt: new Date(row.started_at).toISOString(),
    nextCheckIn: new Date(row.next_check_in).toISOString(),
    status: row.status,
  });
}

@Injectable()
export class FostersService {
  constructor(
    @Inject(TenantService) private readonly tenants: TenantService,
    @Inject(AuditService) private readonly audit: AuditService,
  ) {}

  async staffListHomes(actorId: string, shelterId: string): Promise<FosterHomeListResponse> {
    const rows = (await this.tenants.withTenant(
      { userId: actorId, shelterId, roleClass: 'staff' },
      async sql => sql`
        select h.id, h.home_name, h.primary_contact_email, h.capacity, h.environment,
               h.skills, h.active,
               (select count(*)::int from foster_placements p
                 where p.home_id = h.id and p.status = 'active') as current_placements
        from foster_homes h
        order by h.created_at desc, h.id`,
    )) as unknown as FosterHomeRow[];
    return fosterHomeListResponseSchema.parse({ items: rows.map(mapHome) });
  }

  async staffCreateHome(
    actorId: string,
    shelterId: string,
    input: UpsertFosterHomeInput,
  ): Promise<FosterHome> {
    const row = (await this.tenants.withTenant(
      { userId: actorId, shelterId, roleClass: 'staff' },
      async tx => {
        const inserted = (await tx`
          insert into foster_homes (shelter_id, home_name, primary_contact_email, capacity, environment, skills, active)
          values (${shelterId}::uuid, ${input.homeName}, ${input.primaryContactEmail}, ${input.capacity},
                  ${JSON.stringify(input.environment ?? {})}::jsonb, ${input.skills}, ${input.active})
          returning id, home_name, primary_contact_email, capacity, environment, skills, active,
                    0::int as current_placements`) as unknown as FosterHomeRow[];
        await this.audit.append(tx, actorId, shelterId, 'foster.home_created', 'foster_home', inserted[0]?.id ?? null, {
          homeName: input.homeName,
        });
        return inserted[0]!;
      },
    )) as unknown as FosterHomeRow;
    return mapHome(row);
  }

  async staffUpdateHome(
    actorId: string,
    shelterId: string,
    homeId: string,
    input: UpsertFosterHomeInput,
  ): Promise<FosterHome> {
    const row = (await this.tenants.withTenant(
      { userId: actorId, shelterId, roleClass: 'staff' },
      async tx => {
        const updated = (await tx`
          update foster_homes set
            home_name = ${input.homeName},
            primary_contact_email = ${input.primaryContactEmail},
            capacity = ${input.capacity},
            environment = ${JSON.stringify(input.environment ?? {})}::jsonb,
            skills = ${input.skills},
            active = ${input.active}
          where id = ${homeId}::uuid
          returning id, home_name, primary_contact_email, capacity, environment, skills, active,
                    (select count(*)::int from foster_placements p
                      where p.home_id = foster_homes.id and p.status = 'active') as current_placements`) as unknown as FosterHomeRow[];
        if (!updated[0]) throw new NotFoundException(`Foster home ${homeId} does not exist`);
        await this.audit.append(tx, actorId, shelterId, 'foster.home_updated', 'foster_home', homeId, {
          active: input.active,
          capacity: input.capacity,
        });
        return updated[0];
      },
    )) as unknown as FosterHomeRow;
    return mapHome(row);
  }

  async staffListPlacements(
    actorId: string,
    shelterId: string,
    query: FosterPlacementListQuery,
  ): Promise<{ items: FosterPlacement[] }> {
    const rows = (await this.tenants.withTenant(
      { userId: actorId, shelterId, roleClass: 'staff' },
      async sql =>
        query.status === undefined
          ? ((await sql`
              select p.id, p.home_id, p.animal_id, a.name as animal_name,
                     p.started_at, p.next_check_in, p.status
              from foster_placements p
              join animals a on a.id = p.animal_id
              order by p.started_at desc, p.id
              limit 100`) as unknown as FosterPlacementRow[])
          : ((await sql`
              select p.id, p.home_id, p.animal_id, a.name as animal_name,
                     p.started_at, p.next_check_in, p.status
              from foster_placements p
              join animals a on a.id = p.animal_id
              where p.status = ${query.status}
              order by p.started_at desc, p.id
              limit 100`) as unknown as FosterPlacementRow[]),
    )) as unknown as FosterPlacementRow[];
    return fosterPlacementListResponseSchema.parse({ items: rows.map(mapPlacement) });
  }

  async staffCreatePlacement(
    actorId: string,
    shelterId: string,
    input: CreatePlacementInput,
  ): Promise<FosterPlacement> {
    const row = (await this.tenants.withTenant(
      { userId: actorId, shelterId, roleClass: 'staff' },
      async tx => {
        const homes = (await tx`
          select id from foster_homes where id = ${input.homeId}::uuid limit 1`) as unknown as {
          id: string;
        }[];
        if (!homes[0]) throw new NotFoundException(`Foster home ${input.homeId} does not exist`);
        const animals = (await tx`
          select id, status from animals where id = ${input.animalId}::uuid limit 1`) as unknown as {
          id: string;
          status: string;
        }[];
        if (!animals[0]) throw new NotFoundException(`Animal ${input.animalId} does not exist`);
        if (!['available', 'draft'].includes(animals[0].status)) {
          throw new ConflictException(
            `Animal ${input.animalId} has status '${animals[0].status}' and cannot be fostered`,
          );
        }
        const insertedRows = (await tx`
          insert into foster_placements (shelter_id, home_id, animal_id, next_check_in)
          values (${shelterId}::uuid, ${input.homeId}::uuid, ${input.animalId}::uuid,
                  now() + interval '7 days')
          returning id`) as unknown as { id: string }[];
        const full = (await tx`
          select p.id, p.home_id, p.animal_id, p.started_at, p.next_check_in, p.status,
                 a.name as animal_name
          from foster_placements p join animals a on a.id = p.animal_id
          where p.id = ${insertedRows[0]!.id}::uuid limit 1`) as unknown as FosterPlacementRow[];
        await this.audit.append(tx, actorId, shelterId, 'foster.placed', 'foster_placement', insertedRows[0]?.id ?? null, {
          animalId: input.animalId,
          homeId: input.homeId,
        });
        return full[0]!;
      },
    )) as unknown as FosterPlacementRow;
    return mapPlacement(row);
  }

  async staffClosePlacement(
    actorId: string,
    shelterId: string,
    placementId: string,
  ): Promise<FosterPlacement> {
    // Row fetch via service ctx so RLS variance cannot 404 a legitimate staff action.
    const baseRows = (await this.tenants.service(async sql => {
      return sql`
        select id, shelter_id from foster_placements where id = ${placementId}::uuid limit 1`;
    })) as unknown as { id: string; shelter_id: string }[];
    const base = baseRows[0];
    if (!base) throw new NotFoundException(`Placement ${placementId} does not exist`);
    if (base.shelter_id !== shelterId) {
      throw new NotFoundException(`Placement ${placementId} belongs to another shelter`);
    }
    const row = (await this.tenants.withTenant(
      { userId: actorId, shelterId, roleClass: 'staff' },
      async tx => {
        const closed = (await tx`
          update foster_placements p set ended_at = now(), status = 'closed'
          where p.id = ${placementId}::uuid and p.status = 'active'
          returning p.id, p.home_id, p.animal_id, p.started_at, p.next_check_in, p.status,
                    (select a.name from animals a where a.id = p.animal_id) as animal_name`) as unknown as FosterPlacementRow[];
        if (!closed[0]) throw new ConflictException('Placement already closed');
        await this.audit.append(tx, actorId, shelterId, 'foster.placement_closed', 'foster_placement', placementId, {});
        return closed[0];
      },
    )) as unknown as FosterPlacementRow;
    return mapPlacement(row);
  }

  async staffListUpdates(
    actorId: string,
    shelterId: string,
    placementId: string,
  ): Promise<FosterUpdatesResponse> {
    const rows = (await this.tenants.withTenant(
      { userId: actorId, shelterId, roleClass: 'staff' },
      async sql => sql`
        select u.id, u.notes, u.concerns, u.created_at
        from foster_updates u
        join foster_placements p on p.id = u.placement_id
        where u.placement_id = ${placementId}::uuid
        order by u.created_at desc, u.id
        limit 100`,
    )) as unknown as { id: string; notes: string; concerns: boolean; created_at: Date }[];
    return fosterUpdatesResponseSchema.parse({
      items: rows.map(row => ({
        id: row.id,
        notes: row.notes,
        concerns: row.concerns,
        createdAt: new Date(row.created_at).toISOString(),
      })),
    });
  }

  /** No session: foster contacts act via the deterministic link key only. */
  private async loadValidatedCheckIn(fp: string, k: string) {
    const rows = (await this.tenants.service(async sql => {
      return sql`
        select p.id, p.home_id, p.animal_id, p.started_at, p.status,
               h.home_name, a.name as animal_name
        from foster_placements p
        join foster_homes h on h.id = p.home_id
        join animals a on a.id = p.animal_id
        where p.id = ${fp}::uuid
        limit 1`;
    })) as unknown as (DueFosterRow & { status: string })[];
    const row = rows[0];
    if (!row || row.status !== 'active') {
      throw new NotFoundException('Check-in link is invalid or no longer active');
    }
    const expected = Buffer.from(fosterCheckInKey(row.home_id, row.animal_id, row.started_at), 'utf8');
    const provided = Buffer.from(k, 'utf8');
    if (expected.length !== provided.length || !timingSafeEqual(expected, provided)) {
      throw new NotFoundException('Check-in link is invalid or no longer active');
    }
    return row;
  }

  async publicViewCheckIn(fp: string, k: string) {
    const row = await this.loadValidatedCheckIn(fp, k);
    return fosterCheckInViewSchema.parse({
      animalName: row.animal_name,
      homeName: row.home_name,
    });
  }

  async publicSubmitCheckIn(input: FosterCheckInSubmitInput): Promise<{ ok: true }> {
    const row = await this.loadValidatedCheckIn(input.fp, input.k);
    await this.tenants.service(async sql => {
      await sql`
        insert into foster_updates (placement_id, notes, concerns)
        values (${row.id}::uuid, ${input.notes}, ${input.concerns})`;
    });
    return { ok: true };
  }
}

/**
 * Cron body: emails due foster check-ins through the transactional outbox.
 * Claim-then-enqueue in one tx so a crash cannot double-send.
 */
export async function runFosterSweep(
  tenants: TenantService,
  outbox: OutboxService,
): Promise<number> {
  const appUrl = process.env.APP_URL ?? 'http://localhost:3000';
  const due = (await tenants.service(async sql => {
    return sql`
      select p.id, p.home_id, p.animal_id, p.started_at,
             h.primary_contact_email as contact_email, h.home_name,
             a.name as animal_name
      from foster_placements p
      join foster_homes h on h.id = p.home_id
      join animals a on a.id = p.animal_id
      where p.status = 'active' and p.next_check_in <= now() and p.checkin_1_sent = false
      order by p.next_check_in
      limit 50`;
  })) as unknown as DueFosterRow[];
  let sent = 0;
  for (const row of due) {
    try {
      await tenants.service(async sql => {
        const claimed = (await sql`
          update foster_placements set checkin_1_sent = true
          where id = ${row.id}::uuid and checkin_1_sent = false
          returning id`) as unknown as { id: string }[];
        if (!claimed[0]) return;
        const url = `${appUrl}/foster-checkin?fp=${row.id}&k=${fosterCheckInKey(row.home_id, row.animal_id, row.started_at)}`;
        const payload = {
          to: [row.contact_email],
          subject: 'How is everyone doing? A quick update on your foster pet',
          text:
            `Hi there,\n\n` +
            `How is everyone doing with ${row.animal_name}? The shelter team would love ` +
            `a quick update — anything going well, anything concerning.\n\n` +
            `Share it here (takes about a minute, no login needed):\n${url}`,
          url,
        };
        await outbox.enqueue(sql, 'foster.checkin', payload);
        sent++;
      });
    } catch (error) {
      console.warn(`[fosters] failed to dispatch check-in for placement ${row.id}`, error);
    }
  }
  return sent;
}

/** Wired from main.api.ts alongside the journeys cron. */
export function startFosterScheduler(tenants: TenantService, outbox: OutboxService): void {
  const timer = setInterval(() => {
    void runFosterSweep(tenants, outbox).catch((error: unknown) => {
      console.error('[fosters] check-in sweep failed', error);
    });
  }, FOSTER_CRON_INTERVAL_MS);
  timer.unref();
  console.log('[fosters] check-in scheduler enabled (10m interval)');
}
