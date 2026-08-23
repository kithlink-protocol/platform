import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { AnySql } from '@kithlink/db';
import {
  artifactPublicSchema,
  staffApplicationDetailSchema,
  verificationRevocationSchema,
  type ArtifactPublic,
  type CreateVerificationInput,
  type StaffApplicationDetail,
  type VerificationSummary,
} from '@kithlink/contracts';
import { AuditService } from '../../common/audit.service';
import { TenantService } from '../db.module';

interface ArtifactRow {
  id: string;
  type: string;
  state: string;
  confidence: string | null;
  extracted_json: Record<string, unknown> | null;
  network_verified: boolean;
  created_at: Date;
  mime: string | null;
  bytes: number | null;
  sha256: string | null;
}

interface VerificationRow {
  id: string;
  artifact_id: string;
  shelter_id: string;
  method: string;
  outcome: string;
  verified_at: Date;
  valid_until: Date | null;
  shelter_name?: string;
}

function mapVerifications(rows: VerificationRow[]): VerificationSummary[] {
  return rows.map(v => {
    const summary: VerificationSummary = {
      shelterName: v.shelter_name ?? '',
      outcome: v.outcome,
      method: v.method,
      verifiedAt: new Date(v.verified_at as unknown as string | Date).toISOString(),
    };
    if (v.valid_until) {
      summary.validUntil = new Date(v.valid_until as unknown as string | Date).toISOString();
    }
    return summary;
  });
}

function mapArtifact(
  row: ArtifactRow,
  verifications: VerificationRow[],
  viewerShelterId?: string,
): ArtifactPublic {
  return artifactPublicSchema.parse({
    id: row.id,
    type: row.type,
    state: row.state,
    mime: row.mime ?? undefined,
    bytes: row.bytes ?? undefined,
    sha256: row.sha256 ?? undefined,
    confidence: row.confidence === null ? null : Number(row.confidence),
    extracted: row.extracted_json ?? null,
    networkVerified:
      viewerShelterId
        ? verifications.some(v => v.outcome === 'confirmed' && v.shelter_id !== viewerShelterId)
        : row.network_verified,
    verifications: mapVerifications(verifications),
    createdAt: new Date(row.created_at as unknown as string | Date).toISOString(),
  });
}

async function selectVerificationRows(sql: AnySql, artifactId: string): Promise<VerificationRow[]> {
  const rows = await sql`
    select v.id, v.artifact_id, v.shelter_id, v.method, v.outcome, v.verified_at, v.valid_until,
           s.name as shelter_name
    from verifications v
    join shelters s on s.id = v.shelter_id
    where v.artifact_id = ${artifactId}::uuid
    order by v.verified_at desc, v.id desc`;
  return rows as unknown as VerificationRow[];
}

async function selectArtifactsForApplicant(
  sql: AnySql,
  applicantId: string,
): Promise<ArtifactRow[]> {
  const rows = await sql`
    select a.id, a.type, a.state, a.confidence, a.extracted_json, a.network_verified, a.created_at,
           f.mime, f.bytes, f.sha256
    from artifacts a
    left join artifact_files f on f.artifact_id = a.id
    where a.applicant_id = ${applicantId}::uuid
    order by a.created_at desc, a.id desc
    limit 200`;
  return rows as unknown as ArtifactRow[];
}

@Injectable()
export class VerificationsService {
  constructor(
    @Inject(TenantService) private readonly tenants: TenantService,
    @Inject(AuditService) private readonly audit: AuditService,
  ) {}

  async create(
    actorId: string,
    shelterId: string,
    artifactId: string,
    input: CreateVerificationInput,
  ): Promise<ArtifactPublic> {
    await this.tenants.withTenant(
      { userId: actorId, shelterId, roleClass: 'staff' },
      async sql => {
        const visible = (await sql`
          select a.id from artifacts a where a.id = ${artifactId}::uuid limit 1`) as unknown as {
          id: string;
        }[];
        if (!visible[0]) throw new NotFoundException('Artifact not found');
        await sql`
          insert into verifications (artifact_id, shelter_id, performed_by, method, outcome, notes_redacted, call_log_url, valid_until)
          values (${artifactId}::uuid, ${shelterId}::uuid, ${actorId}::uuid, ${input.method},
                  ${input.outcome}, ${input.notesRedacted ?? null}, ${input.callLogUrl ?? null},
                  ${input.validUntil ?? null}::timestamptz)`;
        await this.audit.append(sql, actorId, shelterId, 'artifact.verified', 'artifact', artifactId, {
          method: input.method,
          outcome: input.outcome,
        });
        // Staff RLS grants no artifacts write: flip role_class locally for these updates only.
        await sql`select set_config('kithlink.role_class', 'service', true)`;
        if (input.outcome === 'confirmed') {
          await sql`
            update artifacts set state = 'verified', updated_at = now()
            where id = ${artifactId}::uuid`;
        }
        await sql`
          update artifacts set
            network_verified = coalesce((
              select exists(
                select 1 from verifications v
                where v.artifact_id = artifacts.id
                  and v.outcome = 'confirmed'
                  and v.shelter_id <> ${shelterId}::uuid)),
            false),
            updated_at = now()
          where id = ${artifactId}::uuid`;
      },
    );
    const [row, verifications] = await this.tenants.service(async sql => {
      const artifactRows = (await sql`
        select a.id, a.type, a.state, a.confidence, a.extracted_json, a.network_verified, a.created_at,
               f.mime, f.bytes, f.sha256
        from artifacts a
        left join artifact_files f on f.artifact_id = a.id
        where a.id = ${artifactId}::uuid limit 1`) as unknown as ArtifactRow[];
      return [artifactRows[0], await selectVerificationRows(sql, artifactId)] as const;
    });
    if (!row) throw new BadRequestException('Artifact vanished during verification');
    return mapArtifact(row, verifications);
  }

  async staffGetApplication(
    actorId: string,
    shelterId: string,
    applicationId: string,
  ): Promise<StaffApplicationDetail> {
    const detail = await this.tenants.withTenant(
      { userId: actorId, shelterId, roleClass: 'staff' },
      async sql => {
        const apps = (await sql`
          select ap.id, ap.status, ap.answers_json, ap.submitted_at, ap.applicant_id, an.name as animal_name
          from applications ap
          join animals an on an.id = ap.animal_id
          where ap.id = ${applicationId}::uuid limit 1`) as unknown as {
          id: string;
          status: string;
          answers_json: Record<string, unknown>;
          submitted_at: Date | null;
          applicant_id: string;
          animal_name: string;
        }[];
        const application = apps[0];
        if (!application) throw new NotFoundException('Application not found');
        const artifacts = (await selectArtifactsForApplicant(
          sql,
          application.applicant_id,
        )) as ArtifactRow[];
        const artifactIds = artifacts.map(a => a.id);
        const verifications = artifactIds.length
          ? ((await sql`
              select v.id, v.artifact_id, v.shelter_id, v.method, v.outcome, v.verified_at, v.valid_until
              from verifications v
              where v.artifact_id = any(${artifactIds}::uuid[])
              order by v.verified_at desc, v.id desc`) as unknown as VerificationRow[])
          : [];
        const consents = (await sql`
          select cg.id, cg.scope, cg.status
          from consent_grants cg
          where cg.application_id = ${applicationId}::uuid
          order by cg.granted_at desc limit 1`) as unknown as {
          id: string;
          scope: string;
          status: string;
        }[];
        return { application, artifacts, verifications, consent: consents[0] ?? null };
      },
    );

    const shelterIds = [...new Set(detail.verifications.map(v => v.shelter_id))];
    const [names, applicant] = await this.tenants.service(async sql => {
      const shelters = shelterIds.length
        ? ((await sql`
            select id, name from shelters where id = any(${shelterIds}::uuid[])`) as unknown as {
            id: string;
            name: string;
          }[])
        : [];
      const profiles = (await sql`
        select legal_name, display_name, phone
        from applicant_profiles where id = ${detail.application.applicant_id}::uuid limit 1`) as unknown as {
        legal_name: string;
        display_name: string | null;
        phone: string | null;
      }[];
      return [
        new Map(shelters.map(s => [s.id, s.name])),
        profiles[0] ?? { legal_name: '', display_name: null, phone: null },
      ] as const;
    });
    for (const v of detail.verifications) v.shelter_name = names.get(v.shelter_id) ?? '';

    return staffApplicationDetailSchema.parse({
      application: {
        id: detail.application.id,
        status: detail.application.status,
        animalName: detail.application.animal_name,
        submittedAt: detail.application.submitted_at
          ? new Date(detail.application.submitted_at as unknown as string | Date).toISOString()
          : null,
        answers: detail.application.answers_json ?? {},
      },
      applicant: {
        legalName: applicant.legal_name,
        displayName: applicant.display_name,
        phone: applicant.phone,
      },
      consent: detail.consent
        ? { id: detail.consent.id, scope: detail.consent.scope, status: detail.consent.status }
        : { id: null, scope: null, status: null },
      artifacts: detail.artifacts.map(a =>
        mapArtifact(
          a,
          detail.verifications.filter(v => v.artifact_id === a.id),
          shelterId,
        ),
      ),
    });
  }

  async revokeOwn(userId: string, artifactId: string) {
    return this.tenants.withTenant({ userId, roleClass: 'applicant' }, async sql => {
      const owned = (await sql`
        select a.id from artifacts a
        join applicant_profiles ap on ap.id = a.applicant_id
        where a.id = ${artifactId}::uuid and ap.user_id = ${userId}::uuid limit 1`) as unknown as {
        id: string;
      }[];
      if (!owned[0]) throw new NotFoundException('Artifact not found');
      await sql`select set_config('kithlink.role_class', 'service', true)`;
      const revoked = (await sql`
        update verifications set outcome = 'revoked'
        where artifact_id = ${owned[0].id}::uuid and outcome <> 'revoked'
        returning id`) as unknown as { id: string }[];
      await sql`
        update artifacts set network_verified = false, updated_at = now()
        where id = ${owned[0].id}::uuid`;
      await this.audit.append(sql, userId, null, 'artifact.verifications_revoked', 'artifact', owned[0].id, {});
      return verificationRevocationSchema.parse({ revoked: revoked.length, networkVerified: false });
    });
  }
}
