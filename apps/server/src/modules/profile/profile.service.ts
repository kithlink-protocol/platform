import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { applicantProfilePublicSchema, type ApplicantProfilePublic, type UpsertApplicantProfileInput } from '@kithlink/contracts';
import { AuditService } from '../../common/audit.service';
import { CryptoUtil } from '../../common/crypto.util';
import { TenantService } from '../db.module';

interface ProfileRawRow {
  id: string;
  legal_name: string;
  display_name: string | null;
  phone: string | null;
  created_at: Date;
}

function mapProfile(row: ProfileRawRow): ApplicantProfilePublic {
  return applicantProfilePublicSchema.parse({
    id: row.id,
    legalName: row.legal_name,
    displayName: row.display_name,
    phone: row.phone,
    createdAt: new Date(row.created_at as unknown as string | Date).toISOString(),
  });
}

@Injectable()
export class ProfileService {
  constructor(
    @Inject(TenantService) private readonly tenants: TenantService,
    @Inject(CryptoUtil) private readonly crypto: CryptoUtil,
    @Inject(AuditService) private readonly audit: AuditService,
  ) {}

  async ensureProfile(userId: string): Promise<string> {
    return this.tenants.service(async sql => {
      const existing = (await sql`
        select id from applicant_profiles where user_id = ${userId}::uuid limit 1`) as unknown as {
        id: string;
      }[];
      if (existing[0]) return existing[0].id;
      const inserted = (await sql`
        insert into applicant_profiles (user_id, legal_name)
        values (${userId}::uuid, '')
        on conflict (user_id) do nothing
        returning id`) as unknown as { id: string }[];
      if (inserted[0]) return inserted[0].id;
      const rows = (await sql`
        select id from applicant_profiles where user_id = ${userId}::uuid limit 1`) as unknown as {
        id: string;
      }[];
      return rows[0]!.id;
    });
  }

  async upsertMe(
    userId: string,
    input: UpsertApplicantProfileInput,
  ): Promise<ApplicantProfilePublic> {
    const profileId = await this.ensureProfile(userId);
    const addressEnc = input.address !== undefined && input.address !== null
      ? this.crypto.seal(input.address)
      : undefined;
    return this.tenants.withTenant({ userId, roleClass: 'applicant' }, async sql => {
      const rows = (await sql`
        update applicant_profiles set
          legal_name = ${input.legalName},
          display_name = ${input.displayName ?? null},
          phone = ${input.phone ?? null},
          address_enc = coalesce(${addressEnc ?? null}, address_enc),
          updated_at = now()
        where id = ${profileId}::uuid
        returning id, legal_name, display_name, phone, created_at`) as unknown as ProfileRawRow[];
      const row = rows[0];
      if (!row) throw new NotFoundException('Profile not found');
      await this.audit.append(sql, userId, null, 'profile.updated', 'applicant_profile', row.id, {});
      return mapProfile(row);
    });
  }

  async getMe(userId: string): Promise<ApplicantProfilePublic> {
    return this.tenants.withTenant({ userId, roleClass: 'applicant' }, async sql => {
      const rows = (await sql`
        select id, legal_name, display_name, phone, created_at
        from applicant_profiles
        where user_id = ${userId}::uuid
        limit 1`) as unknown as ProfileRawRow[];
      const row = rows[0];
      if (!row) throw new NotFoundException('Profile not found');
      return mapProfile(row);
    });
  }
}
