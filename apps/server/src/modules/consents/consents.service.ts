import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { consentGrantSchema, type ConsentGrant } from '@kithlink/contracts';
import { AuditService } from '../../common/audit.service';
import { TenantService } from '../db.module';

interface ConsentRow {
  id: string;
  shelter_id: string;
  scope: string;
  status: string;
  granted_at: Date;
  expires_at: Date | null;
}

@Injectable()
export class ConsentsService {
  constructor(
    @Inject(TenantService) private readonly tenants: TenantService,
    @Inject(AuditService) private readonly audit: AuditService,
  ) {}

  async listMine(userId: string): Promise<ConsentGrant[]> {
    const rows = (await this.tenants.withTenant({ userId, roleClass: 'applicant' }, async sql => {
      return sql`
        select id, shelter_id, scope, status, granted_at, expires_at
        from consent_grants
        order by granted_at desc
        limit 200`;
    })) as unknown as ConsentRow[];
    const shelterNames = await this.tenants.service(async sql => {
      if (rows.length === 0) return [] as { id: string; name: string }[];
      const names = (await sql`
        select id, name from shelters where id = any(${rows.map(r => r.shelter_id)}::uuid[])`) as unknown as {
        id: string;
        name: string;
      }[];
      return names;
    });
    const nameById = new Map(shelterNames.map(s => [s.id, s.name]));
    return rows.map(row =>
      consentGrantSchema.parse({
        id: row.id,
        shelterId: row.shelter_id,
        shelterName: nameById.get(row.shelter_id) ?? '',
        scope: row.scope,
        status: row.status,
        grantedAt: new Date(row.granted_at as unknown as string | Date).toISOString(),
        expiresAt: row.expires_at
          ? new Date(row.expires_at as unknown as string | Date).toISOString()
          : null,
      }),
    );
  }

  async revoke(userId: string, grantId: string): Promise<void> {
    await this.tenants.withTenant({ userId, roleClass: 'applicant' }, async sql => {
      const rows = (await sql`
        update consent_grants set status = 'revoked', revoked_at = now()
        where id = ${grantId}::uuid and status in ('granted','active')
        returning id, shelter_id`) as unknown as { id: string; shelter_id: string }[];
      const row = rows[0];
      if (!row) throw new NotFoundException('Consent grant not found');
      await this.audit.append(sql, userId, row.shelter_id, 'consent.revoked', 'consent_grant', row.id, {});
    });
  }
}
