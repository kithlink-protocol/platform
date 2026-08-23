import {
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  artifactPageSchema,
  artifactPublicSchema,
  type ArtifactInitUploadInput,
  type ArtifactPublic,
  type ArtifactWithVerifications,
} from '@kithlink/contracts';
import { AuditService } from '../../common/audit.service';
import { isUniqueViolation } from '../../common/db.util';
import { CryptoUtil } from '../../common/crypto.util';
import { TenantService } from '../db.module';
import { ParseQueue } from '../parse/queue';
import { S3Service } from '../s3/s3.module';

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

function mapArtifact(row: ArtifactRow): ArtifactPublic {
  return artifactPublicSchema.parse({
    id: row.id,
    type: row.type,
    state: row.state,
    mime: row.mime ?? undefined,
    bytes: row.bytes ?? undefined,
    sha256: row.sha256 ?? undefined,
    confidence: row.confidence === null ? null : Number(row.confidence),
    extracted: row.extracted_json ?? null,
    networkVerified: row.network_verified,
    createdAt: new Date(row.created_at as unknown as string | Date).toISOString(),
  });
}

@Injectable()
export class ArtifactsService {
  constructor(
    @Inject(TenantService) private readonly tenants: TenantService,
    @Inject(S3Service) private readonly s3: S3Service,
    @Inject(CryptoUtil) private readonly crypto: CryptoUtil,
    @Inject(AuditService) private readonly audit: AuditService,
    @Inject(ParseQueue) private readonly parseQueue: ParseQueue,
  ) {}

  private rawKey(userId: string, artifactId: string): string {
    return `artifacts/${userId}/${artifactId}`;
  }

  async initUpload(
    userId: string,
    input: ArtifactInitUploadInput,
  ): Promise<{
    artifact: { id: string; type: string; state: string };
    uploadUrl: string;
    fields: Record<string, string> | null;
    expiresIn: number;
  }> {
    const profileId = await this.ensureProfileId(userId);
    const artifactId = await this.tenants.withTenant({ userId, roleClass: 'applicant' }, async sql => {
      const rows = (await sql`
        insert into artifacts (applicant_id, type, state)
        values (${profileId}::uuid, ${input.type}, 'uploaded')
        returning id`) as unknown as { id: string }[];
      const row = rows[0]!;
      await this.audit.append(sql, userId, null, 'artifact.upload_initialized', 'artifact', row.id, {
        type: input.type,
      });
      return row.id;
    });
    const presigned = await this.s3.presignPut(
      this.rawKey(userId, artifactId),
      input.mime,
      input.bytes,
      600,
    );
    return {
      artifact: { id: artifactId, type: input.type, state: 'uploaded' },
      uploadUrl: presigned.url,
      fields: presigned.fields,
      expiresIn: 600,
    };
  }

  async uploadComplete(
    userId: string,
    artifactId: string,
    body: { sha256: string; mime?: string },
  ): Promise<ArtifactPublic> {
    const rawKey = this.rawKey(userId, artifactId);
    const encKey = `${rawKey}.enc`;
    const head = await this.s3.head(rawKey);
    if (!head) throw new ConflictException('Uploaded object not found in storage');
    if (head.bytes <= 0 || head.bytes > 26_214_400) throw new ConflictException('Object size out of allowed range');

    const rawBytes = await this.s3.get(rawKey);
    const actualSha = this.crypto.sha256Hex(rawBytes);
    if (actualSha !== body.sha256.toLowerCase()) throw new ConflictException('sha256 mismatch');

    const sealed = this.crypto.seal(rawBytes.toString('base64'));
    const edekWrapped = JSON.parse(Buffer.from(sealed, 'base64').toString('utf8')).wrappedDek as string;

    await this.tenants.withTenant({ userId, roleClass: 'applicant' }, async sql => {
      const rows = (await sql`
        select state from artifacts where id = ${artifactId}::uuid limit 1`) as unknown as {
        state: string;
      }[];
      if (!rows[0]) throw new NotFoundException('Artifact not found');
      if (rows[0].state !== 'uploaded') throw new ConflictException('Artifact already processed');

      await this.s3.put(encKey, Buffer.from(sealed, 'utf8'), 'application/octet-stream');
      await this.s3.delete(rawKey);

      await sql`
        insert into artifact_files (artifact_id, version, storage_key, edek_wrapped, sha256, mime, bytes, uploaded_by)
        values (${artifactId}::uuid, 1, ${encKey}, ${edekWrapped}, ${actualSha},
                ${body.mime ?? head.mime ?? 'application/octet-stream'}, ${head.bytes}, ${userId}::uuid)`;
      const updated = (await sql`
        update artifacts set state = 'parsing', updated_at = now()
        where id = ${artifactId}::uuid and state = 'uploaded'
        returning id`) as unknown as { id: string }[];
      if (updated[0]) {
        await this.audit.append(sql, userId, null, 'artifact.upload_completed', 'artifact', artifactId, {
          sha256: actualSha,
          bytes: head.bytes,
        });
      }
    });

    await this.parseQueue.enqueue(artifactId);
    const mapped = await this.getById(userId, artifactId);
    if (!mapped) throw new NotFoundException('Artifact not found');
    return mapped;
  }

  async getById(userId: string, artifactId: string): Promise<ArtifactPublic | null> {
    const rows = await this.selectArtifacts({ userId, artifactId });
    return rows[0] ? mapArtifact(rows[0]) : null;
  }

  async listMine(
    userId: string,
    includeVerifications: boolean,
  ): Promise<{ items: ArtifactWithVerifications[]; nextCursor: string | null }> {
    const rows = await this.selectArtifacts({ userId });
    const items = rows.map(row => {
      const base = mapArtifact(row);
      return includeVerifications ? { ...base, verifications: [] } : base;
    });
    return artifactPageSchema.parse({ items, nextCursor: null });
  }

  async getFileOwn(userId: string, artifactId: string): Promise<{ buffer: Buffer; mime: string }> {
    return this.tenants.withTenant({ userId, roleClass: 'applicant' }, async sql => {
      const rows = (await sql`
        select f.storage_key, f.mime
        from artifacts a join artifact_files f on f.artifact_id = a.id
        where a.id = ${artifactId}::uuid limit 1`) as unknown as {
        storage_key: string;
        mime: string;
      }[];
      const row = rows[0];
      if (!row) throw new NotFoundException('Artifact not found');
      const sealed = (await this.s3.get(row.storage_key)).toString('utf8');
      const buffer = Buffer.from(this.crypto.open(sealed), 'base64');
      await this.audit.append(sql, userId, null, 'artifact.file_downloaded', 'artifact', artifactId, {});
      return { buffer, mime: row.mime };
    });
  }

  async manualExtract(
    userId: string,
    artifactId: string,
    extracted: Record<string, unknown>,
  ): Promise<ArtifactPublic> {
    await this.tenants.withTenant({ userId, roleClass: 'applicant' }, async sql => {
      const rows = (await sql`
        update artifacts set
          extracted_json = ${JSON.stringify(extracted)}::jsonb,
          state = 'pending_review',
          updated_at = now()
        where id = ${artifactId}::uuid
        returning id`) as unknown as { id: string }[];
      if (!rows[0]) throw new NotFoundException('Artifact not found');
      await this.audit.append(sql, userId, null, 'artifact.manual_extract', 'artifact', artifactId, {
        fields: Object.keys(extracted),
      });
    });
    const mapped = await this.getById(userId, artifactId);
    if (!mapped) throw new NotFoundException('Artifact not found');
    return mapped;
  }

  async staffList(shelterId: string, actorId: string, applicantId: string): Promise<{ items: ArtifactPublic[]; nextCursor: string | null }> {
    const rows = await this.selectArtifacts({ shelterId, actorId, applicantId });
    const items = rows.map(mapArtifact);
    return artifactPageSchema.parse({ items, nextCursor: null });
  }

  async staffGetFile(shelterId: string, artifactId: string, actorId: string): Promise<{ buffer: Buffer; mime: string }> {
    const granted = (await this.tenants.service(async sql => {
      return sql`
        select cg.id from artifacts a
        join consent_grants cg on cg.applicant_id = a.applicant_id
        where a.id = ${artifactId}::uuid and cg.shelter_id = ${shelterId}::uuid
          and cg.status = 'active' and now() < COALESCE(cg.revoked_at, cg.expires_at, 'infinity')
        limit 1`;
    })) as unknown as { id: string }[];
    if (!granted[0]) throw new ForbiddenException('No active consent for this applicant');

    return this.tenants.withTenant({ userId: actorId, shelterId, roleClass: 'staff' }, async sql => {
      const rows = (await sql`
        select f.storage_key, f.mime
        from artifacts a join artifact_files f on f.artifact_id = a.id
        where a.id = ${artifactId}::uuid limit 1`) as unknown as {
        storage_key: string;
        mime: string;
      }[];
      const row = rows[0];
      if (!row) throw new NotFoundException('Artifact not found');
      const sealed = (await this.s3.get(row.storage_key)).toString('utf8');
      const buffer = Buffer.from(this.crypto.open(sealed), 'base64');
      await this.audit.append(sql, actorId, shelterId, 'artifact.staff_file_downloaded', 'artifact', artifactId, {});
      return { buffer, mime: row.mime };
    });
  }

  private async ensureProfileId(userId: string): Promise<string> {
    return this.tenants.service(async sql => {
      const existing = (await sql`
        select id from applicant_profiles where user_id = ${userId}::uuid limit 1`) as unknown as {
        id: string;
      }[];
      if (existing[0]) return existing[0].id;
      try {
        const inserted = (await sql`
          insert into applicant_profiles (user_id, legal_name)
          values (${userId}::uuid, '')
          returning id`) as unknown as { id: string }[];
        return inserted[0]!.id;
      } catch (error) {
        if (isUniqueViolation(error)) {
          const rows = (await sql`
            select id from applicant_profiles where user_id = ${userId}::uuid limit 1`) as unknown as {
            id: string;
          }[];
          return rows[0]!.id;
        }
        throw error;
      }
    });
  }

  /** RLS is the visibility backstop here: staff rows vanish once consent expires/revokes. */
  private selectArtifacts(scope:
    | { userId: string; artifactId?: string }
    | { shelterId: string; actorId: string; applicantId: string }): Promise<ArtifactRow[]> {
    if ('shelterId' in scope) {
      return this.tenants.withTenant(
        { userId: scope.actorId, shelterId: scope.shelterId, roleClass: 'staff' },
        async sql => {
          const rows = (await sql`
            select a.id, a.type, a.state, a.confidence, a.extracted_json, a.network_verified, a.created_at,
                   f.mime, f.bytes, f.sha256
            from artifacts a
            left join artifact_files f on f.artifact_id = a.id
            where a.applicant_id = ${scope.applicantId}::uuid
            order by a.created_at desc, a.id desc
            limit 200`) as unknown as ArtifactRow[];
          return rows;
        },
      );
    }
    return this.tenants.withTenant(
      { userId: scope.userId, roleClass: 'applicant' },
      async sql => {
        const filter = scope.artifactId ? sql` and a.id = ${scope.artifactId}::uuid` : sql``;
        const rows = (await sql`
          select a.id, a.type, a.state, a.confidence, a.extracted_json, a.network_verified, a.created_at,
                 f.mime, f.bytes, f.sha256
          from artifacts a
          join applicant_profiles ap on ap.id = a.applicant_id
          left join artifact_files f on f.artifact_id = a.id
          where ap.user_id = ${scope.userId}::uuid${filter}
          order by a.created_at desc, a.id desc
          limit 200`) as unknown as ArtifactRow[];
        return rows;
      },
    );
  }
}
