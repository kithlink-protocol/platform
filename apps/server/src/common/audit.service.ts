import { createHash } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import type { AnySql } from '@kithlink/db';

@Injectable()
export class AuditService {
  async append(
    sql: AnySql,
    actorId: string | null,
    shelterId: string | null,
    action: string,
    entityType: string,
    entityId: string | null,
    meta: Record<string, unknown> = {},
  ): Promise<void> {
    await sql`select pg_advisory_xact_lock(hashtext('audit_chain'))`;
    const priorRows = (await sql`select current_setting('kithlink.role_class', true) as rc`) as unknown as {
      rc: string | null;
    }[];
    // audit_read is service-only; flip the GUC locally inside the caller's tx, then restore.
    await sql`select set_config('kithlink.role_class', 'service', true)`;
    let prevHash: string | null;
    try {
      const rows = (await sql`select hash from audit_logs order by created_at desc limit 1`) as unknown as {
        hash: string;
      }[];
      prevHash = rows[0]?.hash ?? null;
    } finally {
      await sql`select set_config('kithlink.role_class', ${priorRows[0]?.rc ?? ''}, true)`;
    }
    const payload = JSON.stringify({ actorId, action, entityType, entityId, meta });
    const hash = createHash('sha256').update(`${prevHash ?? ''}${payload}`).digest('hex');
    await sql`
      insert into audit_logs (actor_id, shelter_id, action, entity_type, entity_id, meta, prev_hash, hash)
      values (${actorId}, ${shelterId}, ${action}, ${entityType}, ${entityId}, ${JSON.stringify(meta)}::jsonb, ${prevHash}, ${hash})`;
  }
}
