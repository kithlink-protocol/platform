import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import {
  syncRunSchema,
  syncTargetPublicSchema,
  type CreateSyncTargetInput,
  type SyncRunSummary,
  type SyncTargetPublic,
} from '@kithlink/contracts';
import type { AnySql, TenantContext } from '@kithlink/db';
import { AuditService } from '../../common/audit.service';
import { CryptoUtil } from '../../common/crypto.util';
import { TenantService } from '../db.module';
import { PetfinderAdapter } from '@kithlink/sync-adapters';
import type { AnimalPayload, PushResult, SyncAdapter, TenantCtx } from '@kithlink/sync-adapters';

interface TargetRow {
  id: string;
  shelter_id: string;
  provider: string;
  credentials_enc: string;
  mode: string;
  status: string;
  last_run_at: string | Date | null;
}

function mapTarget(row: TargetRow): SyncTargetPublic {
  return syncTargetPublicSchema.parse({
    provider: row.provider,
    mode: row.mode,
    status: row.status,
    lastRunAt: row.last_run_at ? new Date(row.last_run_at as string | Date).toISOString() : null,
  });
}

function makeAdapter(provider: string): SyncAdapter {
  if (provider === 'petfinder') return new PetfinderAdapter();
  throw new BadRequestException('Provider not supported yet');
}

@Injectable()
export class SyncService {
  constructor(
    @Inject(TenantService) private readonly tenants: TenantService,
    @Inject(CryptoUtil) private readonly crypto: CryptoUtil,
    @Inject(AuditService) private readonly audit: AuditService,
  ) {}

  async upsertTarget(
    ctx: TenantContext,
    actorId: string,
    shelterId: string,
    input: CreateSyncTargetInput,
  ): Promise<SyncTargetPublic> {
    const sealed = this.crypto.seal(
      JSON.stringify({ clientId: input.clientId, clientSecret: input.clientSecret }),
    );
    return this.tenants.withTenant(ctx, async sql => {
      const rows = (await sql`
        insert into sync_targets (shelter_id, provider, credentials_enc, mode)
        values (${shelterId}::uuid, ${input.provider}, ${sealed}, ${input.mode})
        on conflict (shelter_id, provider)
        do update set credentials_enc = excluded.credentials_enc, mode = excluded.mode, status = 'active'
        returning id, shelter_id, provider, credentials_enc, mode, status, last_run_at`) as unknown as TargetRow[];
      const row = rows[0];
      if (!row) throw new NotFoundException('Shelter not found');
      await this.audit.append(sql, actorId, shelterId, 'sync.target.upserted', 'sync_target', row.id, {
        provider: input.provider,
        mode: input.mode,
      });
      return mapTarget(row);
    });
  }

  async listTargets(ctx: TenantContext, shelterId: string): Promise<SyncTargetPublic[]> {
    return this.tenants.withTenant(ctx, async sql => {
      const rows = (await sql`
        select id, shelter_id, provider, credentials_enc, mode, status, last_run_at
        from sync_targets where shelter_id = ${shelterId}::uuid order by provider`) as unknown as TargetRow[];
      return rows.map(mapTarget);
    });
  }

  async runManual(
    ctx: TenantContext,
    _actorId: string,
    shelterId: string,
    provider: string,
  ): Promise<SyncRunSummary> {
    const target = await this.findTarget(ctx, shelterId, provider);
    const payloads = await this.buildPayloads(ctx, shelterId);
    return this.execute(target, 'manual', payloads).then(async summary => {
      await this.touchLastRun(shelterId, target.id);
      return summary;
    });
  }

  async runAllLive(trigger = 'cron'): Promise<void> {
    const targets = await this.tenants.service(async sql => {
      return sql`
        select id, shelter_id, provider, credentials_enc, mode, status, last_run_at
        from sync_targets where mode = 'live' and status = 'active'`;
    }) as unknown as TargetRow[];
    for (const target of targets) {
      try {
        const payloads = await this.buildPayloadsService(target.shelter_id);
        await this.execute(target, trigger, payloads);
        await this.touchLastRun(target.shelter_id, target.id);
      } catch (error) {
        console.error(`[sync] target ${target.id} run failed`, error);
      }
    }
  }

  private async findTarget(ctx: TenantContext, shelterId: string, provider: string): Promise<TargetRow> {
    const rows = (await this.tenants.withTenant(ctx, async sql => {
      return sql`
        select id, shelter_id, provider, credentials_enc, mode, status, last_run_at
        from sync_targets
        where shelter_id = ${shelterId}::uuid and provider = ${provider}
        limit 1`;
    })) as unknown as TargetRow[];
    const row = rows[0];
    if (!row) throw new NotFoundException('Sync target not configured');
    return row;
  }

  private async touchLastRun(shelterId: string, targetId: string): Promise<void> {
    await this.tenants.service(async sql => {
      await sql`update sync_targets set last_run_at = now() where id = ${targetId}::uuid and shelter_id = ${shelterId}::uuid`;
    });
  }

  private buildPayloads(ctx: TenantContext, shelterId: string): Promise<AnimalPayload[]> {
    return this.tenants.withTenant(ctx, sql => loadPayloads(sql, shelterId));
  }

  private buildPayloadsService(shelterId: string): Promise<AnimalPayload[]> {
    return this.tenants.service(sql => loadPayloads(sql, shelterId));
  }

  private async execute(target: TargetRow, trigger: string, payloads: AnimalPayload[]): Promise<SyncRunSummary> {
    let creds: { clientId?: string; clientSecret?: string };
    try {
      creds = JSON.parse(this.crypto.open(target.credentials_enc)) as { clientId?: string };
    } catch {
      throw new Error('stored credentials unreadable');
    }
    if (!creds.clientId || !creds.clientSecret) throw new Error('stored credentials incomplete');
    const adapterCtx: TenantCtx = {
      credentials: { clientId: creds.clientId, clientSecret: creds.clientSecret },
      mode: target.mode === 'live' ? 'live' : 'dry_run',
    };
    const runRows = (await this.tenants.service(async sql => {
      return sql`
        insert into sync_runs (target_id, "trigger") values (${target.id}::uuid, ${trigger})
        returning id, started_at`;
    })) as unknown as { id: string; started_at: string | Date }[];
    const run = runRows[0]!;
    const startedAt = new Date(run.started_at as string | Date).toISOString();

    let results: PushResult[] = [];
    try {
      results = await makeAdapter(target.provider).pushAnimals(adapterCtx, payloads);
    } catch (error) {
      results = payloads.map(animal => ({
        localId: animal.localId,
        status: 'failed' as const,
        decision: `adapter error: ${(error as Error).message}`,
      }));
    }
    const pushed = results.filter(r => r.status === 'pushed').length;
    const failed = results.filter(r => r.status === 'failed').length;
    await this.tenants.service(async sql => {
      await sql`
        update sync_runs set
          finished_at = now(),
          pushed = ${pushed},
          failed = ${failed},
          decisions_json = ${JSON.stringify(results)}::jsonb
        where id = ${run.id}::uuid`;
    });
    return syncRunSchema.parse({
      id: run.id,
      trigger,
      startedAt,
      finishedAt: new Date().toISOString(),
      pushed,
      pulled: 0,
      failed,
      decisionsCount: results.length,
    });
  }
}

interface PayloadRow {
  id: string;
  external_ref: string | null;
  name: string;
  species: string;
  breed: string | null;
  description: string | null;
}

async function loadPayloads(sql: AnySql, shelterId: string): Promise<AnimalPayload[]> {
  const rows = (await sql`
    select a.id, a.name, a.species, a.breed, a.description,
           coalesce(a.external_refs ->> 'petfinder', a.external_refs ->> 'external_id') as external_ref
    from animals a
    where a.shelter_id = ${shelterId}::uuid and a.status = 'available'
    order by a.created_at`) as unknown as PayloadRow[];
  return rows.map(row => ({
    localId: row.id,
    externalId: row.external_ref,
    name: row.name,
    species: row.species,
    breed: row.breed,
    description: row.description,
    status: 'available' as const,
    photoUrls: [],
  }));
}
