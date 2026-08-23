import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  NotFoundException,
  Post,
  Res,
  UseGuards,
} from '@nestjs/common';
import { verify as argonVerify } from '@node-rs/argon2';
import { z } from 'zod';
import type { Response } from 'express';
import { passwordSchema } from '@kithlink/contracts';
import { AuditService } from '../../common/audit.service';
import { CryptoUtil } from '../../common/crypto.util';
import { SessionGuard } from '../../common/session.guard';
import { AccountArtifactPurgePayload, OutboxService } from '../notifications/notifications.module';
import { TenantService } from '../db.module';
import { Principal } from '../../common/principal';
interface ProfileExportRow {
  id: string;
  legal_name: string;
  display_name: string | null;
  phone: string | null;
  address_enc: string | null;
  created_at: Date;
}

interface ArtifactMetaRow {
  type: string;
  state: string;
  created_at: Date;
}

interface ApplicationExportRow {
  animal_name: string;
  shelter_name: string;
  status: string;
  created_at: Date;
  submitted_at: Date | null;
  decided_at: Date | null;
  answers_json: Record<string, unknown>;
}

interface FavoriteExportRow {
  animal_id: string;
  animal_name: string;
  created_at: Date;
}

interface ConsentExportRow {
  scope: string;
  status: string;
  granted_at: Date;
  revoked_at: Date | null;
  expires_at: Date | null;
}

interface UserDeleteRow {
  id: string;
  password_hash: string | null;
}

interface StorageKeyRow {
  storage_key: string;
}

function iso(value: Date | null): string | null {
  return value ? new Date(value as unknown as string | Date).toISOString() : null;
}

@UseGuards(SessionGuard)
@Controller('app/v1/me')
export class MeLifecycleController {
  constructor(
    @Inject(TenantService) private readonly tenants: TenantService,
    @Inject(AuditService) private readonly audit: AuditService,
    @Inject(OutboxService) private readonly outbox: OutboxService,
    @Inject(CryptoUtil) private readonly crypto: CryptoUtil,
  ) {}

  @Get('export')
  async exportMe(@Principal() principal: Principal, @Res({ passthrough: true }) res: Response) {
    const data = await this.tenants.service(async sql => {
      const profileRows = (await sql`
        select id, legal_name, display_name, phone, address_enc, created_at
        from applicant_profiles
        where user_id = ${principal.user.id}::uuid
        limit 1`) as unknown as ProfileExportRow[];
      const profileRow = profileRows[0];
      let address: string | null = null;
      if (profileRow?.address_enc) {
        // The user's own data — decrypt for their export (docs/design/07 §5).
        try {
          address = this.crypto.open(profileRow.address_enc);
        } catch {
          address = null;
        }
      }
      const artifactRows = (await sql`
        select a.type, a.state, a.created_at
        from artifacts a join applicant_profiles ap on ap.id = a.applicant_id
        where ap.user_id = ${principal.user.id}::uuid
        order by a.created_at`) as unknown as ArtifactMetaRow[];
      const applicationRows = (await sql`
        select an.name as animal_name, sh.name as shelter_name, app.status,
               app.created_at, app.submitted_at, app.decided_at, app.answers_json
        from applications app
        join animals an on an.id = app.animal_id
        join shelters sh on sh.id = app.shelter_id
        where app.applicant_id in (
          select id from applicant_profiles where user_id = ${principal.user.id}::uuid)
        order by app.created_at`) as unknown as ApplicationExportRow[];
      const favoriteRows = (await sql`
        select fa.animal_id, an.name as animal_name, fa.created_at
        from favorite_animals fa join animals an on an.id = fa.animal_id
        where fa.user_id = ${principal.user.id}::uuid
        order by fa.created_at desc`) as unknown as FavoriteExportRow[];
      const consentRows = (await sql`
        select c.scope, c.status, c.granted_at, c.revoked_at, c.expires_at
        from consent_grants c join applicant_profiles ap on ap.id = c.applicant_id
        where ap.user_id = ${principal.user.id}::uuid
        order by c.granted_at`) as unknown as ConsentExportRow[];
      await this.audit.append(
        sql,
        principal.user.id,
        null,
        'account.exported',
        'user',
        principal.user.id,
        {},
      );
      return {
        exportedAt: new Date().toISOString(),
        profile: profileRow
          ? {
              legalName: profileRow.legal_name,
              displayName: profileRow.display_name,
              phone: profileRow.phone,
              address,
              createdAt: iso(profileRow.created_at),
            }
          : null,
        artifacts: artifactRows.map(a => ({
          type: a.type,
          state: a.state,
          createdAt: iso(a.created_at),
        })),
        applications: applicationRows.map(a => ({
          animal: a.animal_name,
          shelter: a.shelter_name,
          status: a.status,
          dates: {
            created: iso(a.created_at),
            submitted: iso(a.submitted_at),
            decided: iso(a.decided_at),
          },
          answers: a.answers_json ?? {},
        })),
        favorites: favoriteRows.map(f => ({
          animalId: f.animal_id,
          animalName: f.animal_name,
          addedAt: iso(f.created_at),
        })),
        consents: consentRows.map(c => ({
          scope: c.scope,
          status: c.status,
          grantedAt: iso(c.granted_at),
          revokedAt: iso(c.revoked_at),
          expiresAt: iso(c.expires_at),
        })),
      };
    });
    const stamp = new Date().toISOString().slice(0, 10);
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="kithlink-export-${stamp}.json"`);
    return data;
  }

  @HttpCode(HttpStatus.OK)
  @Post('delete')
  async deleteMe(@Principal() principal: Principal, @Body() body: unknown) {
    const input = z.object({ password: passwordSchema }).parse(body);
    await this.tenants.service(async sql => {
      const rows = (await sql`
        select id, password_hash
        from users
        where id = ${principal.user.id}::uuid and deleted_at is null
        limit 1`) as unknown as UserDeleteRow[];
      const user = rows[0];
      if (!user) throw new NotFoundException('Account not found');
      const verified = user.password_hash
        ? await argonVerify(user.password_hash, input.password).catch(() => false)
        : false;
      if (!verified) throw new ForbiddenException('Invalid password');

      // Tombstone the account; citext unique blocks email reuse after deletion — acceptable.
      // Crypto-shred note (docs/design/04 §6): the envelope KEK is platform-level until a
      // per-user KEK ships; we destroy every sealed column instead of a per-user key.
      await sql`
        update users set
          deleted_at = now(),
          email = ${`deleted-${principal.user.id}@invalid`},
          password_hash = null,
          totp_secret_enc = null
        where id = ${principal.user.id}::uuid`;
      await sql`
        update applicant_profiles set
          legal_name = '[deleted]',
          display_name = null,
          phone = null,
          address_enc = null,
          updated_at = now()
        where user_id = ${principal.user.id}::uuid`;
      await sql`delete from sessions where user_id = ${principal.user.id}::uuid`;
      await sql`
        update consent_grants set status = 'revoked', revoked_at = now()
        where status in ('granted', 'active')
          and applicant_id in (
            select id from applicant_profiles where user_id = ${principal.user.id}::uuid)`;
      await sql`delete from favorite_animals where user_id = ${principal.user.id}::uuid`;
      // Applications/artifacts metadata stay as shelter legal records; only the S3 objects go.
      const keyRows = (await sql`
        select af.storage_key
        from artifact_files af
        join artifacts a on a.id = af.artifact_id
        join applicant_profiles ap on ap.id = a.applicant_id
        where ap.user_id = ${principal.user.id}::uuid`) as unknown as StorageKeyRow[];
      await this.outbox.enqueue(sql, 'account.artifact_purge', {
        keys: keyRows.map(k => k.storage_key),
      } satisfies AccountArtifactPurgePayload);
      await this.audit.append(
        sql,
        principal.user.id,
        null,
        'account.deleted',
        'user',
        principal.user.id,
        {},
      );
    });
    return { ok: true };
  }
}
