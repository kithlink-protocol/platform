import { BadRequestException, ConflictException, Inject,
  Injectable, NotFoundException,
} from '@nestjs/common';
import type { AnySql } from '@kithlink/db';
import {
  applicationCreatedResponseSchema,
  applicationListResponseSchema,
  applicationNotesResponseSchema,
  applicationNoteSchema,
  applicationPublicSchema,
  applicantHistorySchema,
  type AddApplicationNoteInput,
  type ApplicationCreatedResponse,
  type ApplicationDecisionInput,
  type ApplicationNotesResponse,
  type ApplicationNote,
  type ApplicationPublic,
  type ApplicantHistory,
  type ArtifactPublic,
  type CreateApplicationInput,
  type StaffApplicationListQuery,
} from '@kithlink/contracts';
import { decodeCursor, encodeCursor } from '../../common/cursor.util';
import { isUniqueViolation } from '../../common/db.util';
import { AuditService } from '../../common/audit.service';
import { TenantService } from '../db.module';
import { OutboxService } from '../notifications/notifications.module';
import { JourneysService } from '../journeys/journeys.service';
import {
  mapArtifact,
  selectArtifactsForApplicant,
  selectVerificationRows,
  type ArtifactRow,
} from '../verifications/verifications.service';

interface ApplicationRow {
  id: string;
  status: string;
  animal_id: string;
  shelter_id: string;
  submitted_at: Date | null;
  created_at: Date;
  decision_note?: string | null;
}

const TERMINAL_STATUSES = new Set(['approved', 'denied', 'withdrawn', 'adopted', 'expired']);

export const APPLICATION_TRANSITIONS: Record<string, string[]> = {
  draft: [],
  submitted: ['in_review', 'denied', 'withdrawn'],
  in_review: ['info_requested', 'approved', 'denied'],
  info_requested: ['in_review', 'denied', 'withdrawn'],
  approved: ['adopted'],
  denied: [],
  withdrawn: [],
  adopted: [],
  expired: [],
};

function mapApplication(
  row: ApplicationRow,
  names: { animalName: string | undefined; shelterName: string | undefined },
): ApplicationPublic {
  return applicationPublicSchema.parse({
    id: row.id,
    status: row.status,
    animalId: row.animal_id,
    animalName: names.animalName ?? '',
    shelterId: row.shelter_id,
    shelterName: names.shelterName ?? '',
    submittedAt: row.submitted_at
      ? new Date(row.submitted_at as unknown as string | Date).toISOString()
      : null,
    createdAt: new Date(row.created_at as unknown as string | Date).toISOString(),
  });
}

@Injectable()
export class ApplicationsService {
  constructor(
    @Inject(TenantService) private readonly tenants: TenantService,
    @Inject(AuditService) private readonly audit: AuditService,
    @Inject(OutboxService) private readonly outbox: OutboxService,
    @Inject(JourneysService) private readonly journeys: JourneysService,
  ) {}

  private async loadNames(animalIds: string[], shelterIds: string[]): Promise<{
    animals: Map<string, string>;
    shelters: Map<string, string>;
  }> {
    const [animals, shelters] = await this.tenants.service(async sql => {
      const a = animalIds.length
        ? (await sql`
            select id, name from animals where id = any(${animalIds}::uuid[])`) as unknown as {
            id: string;
            name: string;
          }[]
        : [];
      const s = shelterIds.length
        ? (await sql`
            select id, name from shelters where id = any(${shelterIds}::uuid[])`) as unknown as {
            id: string;
            name: string;
          }[]
        : [];
      return [a, s] as const;
    });
    return {
      animals: new Map(animals.map(r => [r.id, r.name])),
      shelters: new Map(shelters.map(r => [r.id, r.name])),
    };
  }

  async create(userId: string, input: CreateApplicationInput): Promise<ApplicationCreatedResponse> {
    const context = await this.tenants.service(async sql => {
      const profiles = (await sql`
        select id from applicant_profiles where user_id = ${userId}::uuid limit 1`) as unknown as {
        id: string;
      }[];
      const animals = (await sql`
        select a.id, a.name, a.status, a.shelter_id, s.name as shelter_name
        from animals a join shelters s on s.id = a.shelter_id
        where a.id = ${input.animalId}::uuid limit 1`) as unknown as {
        id: string;
        name: string;
        status: string;
        shelter_id: string;
        shelter_name: string;
      }[];
      return { profileId: profiles[0]?.id ?? null, animal: animals[0] ?? null };
    });
    if (!context.animal) throw new NotFoundException('Animal not found');
    if (!context.profileId) {
      throw new BadRequestException('Complete your applicant profile before applying');
    }
    if (context.animal.status !== 'available') {
      throw new BadRequestException('Animal is not available for adoption');
    }

    let created: ApplicationRow & { consentGrantId: string };
    try {
      created = await this.tenants.withTenant({ userId, roleClass: 'applicant' }, async sql => {
        const insertedApp = (await sql`
          insert into applications (animal_id, shelter_id, applicant_id, status, answers_json, submitted_at)
          values (${input.animalId}::uuid, ${context.animal!.shelter_id}::uuid, ${context.profileId!}::uuid,
                  'submitted', ${JSON.stringify(input.answers)}::jsonb, now())
          returning id, status, animal_id, shelter_id, submitted_at, created_at`) as unknown as ApplicationRow[];
        const app = insertedApp[0]!;
        const insertedGrant = (await sql`
          insert into consent_grants (applicant_id, shelter_id, application_id, scope, status)
          values (${context.profileId!}::uuid, ${context.animal!.shelter_id}::uuid, ${app.id}::uuid,
                  'application_review', 'active')
          returning id`) as unknown as { id: string }[];
        await this.audit.append(sql, userId, context.animal!.shelter_id, 'application.submitted', 'application', app.id, {
          animalId: input.animalId,
        });
        return { ...app, consentGrantId: insertedGrant[0]!.id };
      });
    } catch (error) {
      if (isUniqueViolation(error)) throw new ConflictException('Already applied to this animal');
      throw error;
    }

    const staffEmails = await this.tenants.service(async sql => {
      const rows = (await sql`
        select u.email from staff_members sm
        join users u on u.id = sm.user_id and u.deleted_at is null
        where sm.shelter_id = ${context.animal!.shelter_id}::uuid`) as unknown as { email: string }[];
      return rows.map(r => r.email);
    });
    if (staffEmails.length > 0) {
      await this.outbox.enqueueViaService('application.submitted', {
        to: staffEmails,
        subject: `New adoption application for ${context.animal.name}`,
        text: `An applicant submitted an application for ${context.animal.name} at ${context.animal.shelter_name}.`,
      });
    }

    return applicationCreatedResponseSchema.parse({
      application: mapApplication(created, {
        animalName: context.animal.name,
        shelterName: context.animal.shelter_name,
      }),
      consentGrantId: created.consentGrantId,
    });
  }

  async listMine(userId: string): Promise<{ items: ApplicationPublic[] }> {
    const rows = (await this.tenants.withTenant({ userId, roleClass: 'applicant' }, async sql => {
      return sql`
        select id, status, animal_id, shelter_id, submitted_at, created_at
        from applications
        order by created_at desc, id desc
        limit 100`;
    })) as unknown as ApplicationRow[];
    const names = await this.loadNames(
      rows.map(r => r.animal_id),
      rows.map(r => r.shelter_id),
    );
    return {
      items: rows.map(row =>
        mapApplication(row, {
          animalName: names.animals.get(row.animal_id),
          shelterName: names.shelters.get(row.shelter_id),
        }),
      ),
    };
  }

  async staffList(
    actorId: string,
    shelterId: string,
    q: StaffApplicationListQuery,
  ): Promise<{ items: ApplicationPublic[]; nextCursor: string | null }> {
    const cursor = q.cursor ? decodeCursor(q.cursor) : null;
    if (q.cursor && !cursor) throw new BadRequestException('Invalid cursor');
    const rows = (await this.tenants.withTenant(
      { userId: actorId, shelterId, roleClass: 'staff' },
      async sql => {
        const statusFrag = q.status ? sql` and a.status = ${q.status}` : sql``;
        const cursorFrag = cursor
          ? sql` and (a.created_at, a.id) < (${cursor.createdAt}::timestamptz, ${cursor.id}::uuid)`
          : sql``;
        return sql`
          select a.id, a.status, a.animal_id, a.shelter_id, a.submitted_at, a.created_at
          from applications a
          where a.shelter_id = ${shelterId}::uuid${statusFrag}${cursorFrag}
          order by a.created_at desc, a.id desc
          limit ${q.limit + 1}`;
      },
    )) as unknown as ApplicationRow[];
    const page = rows.slice(0, q.limit);
    const names = await this.loadNames(
      page.map(r => r.animal_id),
      [shelterId],
    );
    const items = page.map(row =>
      mapApplication(row, {
        animalName: names.animals.get(row.animal_id),
        shelterName: names.shelters.get(row.shelter_id),
      }),
    );
    const hasMore = rows.length > q.limit;
    const last = page[page.length - 1];
    const nextCursor =
      hasMore && last
        ? encodeCursor({ createdAt: new Date(last.created_at as unknown as string | Date).toISOString(), id: last.id })
        : null;
    return applicationListResponseSchema.parse({ items, nextCursor });
  }

  async decide(
    actorId: string,
    shelterId: string,
    applicationId: string,
    input: ApplicationDecisionInput,
  ): Promise<ApplicationPublic> {
    const allowed = APPLICATION_TRANSITIONS;
    const row = (await this.tenants.withTenant(
      { userId: actorId, shelterId, roleClass: 'staff' },
      async sql => {
        const currentRows = (await sql`
          select id, status from applications where id = ${applicationId}::uuid limit 1`) as unknown as {
          id: string;
          status: string;
        }[];
        const current = currentRows[0];
        if (!current) throw new NotFoundException('Application not found');
        if (!(allowed[current.status] ?? []).includes(input.status)) {
          throw new BadRequestException(`Invalid transition ${current.status} -> ${input.status}`);
        }
        const terminal = TERMINAL_STATUSES.has(input.status);
        const updatedRows = (await sql`
          update applications set
            status = ${input.status},
            decided_at = case when ${terminal} then now() else decided_at end,
            decision_note = coalesce(${input.note ?? null}, decision_note),
            updated_at = now()
          where id = ${applicationId}::uuid
          returning id, status, animal_id, shelter_id, submitted_at, created_at, decision_note`) as unknown as ApplicationRow[];
        const updated = updatedRows[0]!;
        await this.audit.append(sql, actorId, shelterId, 'application.status_changed', 'application', updated.id, {
          from: current.status,
          to: input.status,
          note: input.note ?? null,
        });
        return updated;
      },
    )) as ApplicationRow;

    // After-commit side effect: adoption finalization starts the M5 journey.
    if (input.status === 'adopted') {
      try {
        await this.journeys.createForAdoption(applicationId);
      } catch (error) {
        console.error(`[journeys] journey creation failed for application ${applicationId}`, error);
      }
    }

    if (TERMINAL_STATUSES.has(input.status)) {
      await this.tenants.service(async sql => {
        await sql`
          update consent_grants set expires_at = now() + interval '90 days'
          where application_id = ${applicationId}::uuid and status = 'active'`;
      });
    }

    const notify = await this.tenants.service(async sql => {
      const emails = (await sql`
        select u.email
        from applications a
        join applicant_profiles ap on ap.id = a.applicant_id
        join users u on u.id = ap.user_id and u.deleted_at is null
        where a.id = ${applicationId}::uuid`) as unknown as { email: string }[];
      const names = (await sql`
        select an.name as animal_name, s.name as shelter_name
        from applications a
        join animals an on an.id = a.animal_id
        join shelters s on s.id = a.shelter_id
        where a.id = ${applicationId}::uuid`) as unknown as {
        animal_name: string;
        shelter_name: string;
      }[];
      return { email: emails[0]?.email ?? null, ...names[0] };
    });
    if (notify.email) {
      await this.outbox.enqueueViaService('application.status_changed', {
        to: [notify.email],
        subject: `Your application is now ${input.status}`,
        text: `Your application for ${notify.animal_name ?? 'the animal'} at ${notify.shelter_name ?? 'the shelter'} moved to "${input.status}".${input.note ? `\n\nNote: ${input.note}` : ''}`,
      });
    }

    const names = await this.loadNames([row.animal_id], [row.shelter_id]);
    return mapApplication(row, {
      animalName: names.animals.get(row.animal_id),
      shelterName: names.shelters.get(row.shelter_id),
    });
  }

  private async assertApplicationInTenant(sql: AnySql, applicationId: string): Promise<void> {
    const rows = (await sql`
      select id from applications where id = ${applicationId}::uuid limit 1`) as unknown as {
      id: string;
    }[];
    if (!rows[0]) throw new NotFoundException('Application not found');
  }

  async staffGetApplicantHistory(
    actorId: string,
    shelterId: string,
    applicationId: string,
  ): Promise<ApplicantHistory> {
    const gathered = await this.tenants.withTenant(
      { userId: actorId, shelterId, roleClass: 'staff' },
      async sql => {
        const currentRows = (await sql`
          select ap.id, ap.applicant_id
          from applications ap
          where ap.id = ${applicationId}::uuid limit 1`) as unknown as {
          id: string;
          applicant_id: string;
        }[];
        const current = currentRows[0];
        if (!current) throw new NotFoundException('Application not found');
        const atShelter = (await sql`
          select ap.id, ap.status, ap.submitted_at, ap.decided_at, an.name as animal_name
          from applications ap
          join animals an on an.id = ap.animal_id
          where ap.applicant_id = ${current.applicant_id}::uuid
            and ap.shelter_id = ${shelterId}::uuid
          order by ap.submitted_at desc nulls last, ap.created_at desc, ap.id desc`) as unknown as {
          id: string;
          status: string;
          animal_name: string;
          submitted_at: Date | null;
          decided_at: Date | null;
        }[];
        // RLS already gates artifacts to those covered by an active consent grant.
        const artifacts = (await selectArtifactsForApplicant(
          sql,
          current.applicant_id,
        )) as ArtifactRow[];
        await this.audit.append(sql, actorId, shelterId, 'applicant.history_viewed', 'application', current.id, {
          applicantId: current.applicant_id,
        });
        return { applicantId: current.applicant_id, atShelter, artifacts };
      },
    );

    // Full cross-shelter provenance per artifact via service ctx.
    const sharedArtifacts = await this.tenants.service(async sql => {
      const out: ArtifactPublic[] = [];
      for (const artifact of gathered.artifacts) {
        const verifications = await selectVerificationRows(sql, artifact.id);
        out.push(mapArtifact(artifact, verifications, shelterId));
      }
      return out;
    });

    const profile = await this.tenants.service(async sql => {
      const rows = (await sql`
        select legal_name, display_name, phone
        from applicant_profiles where id = ${gathered.applicantId}::uuid limit 1`) as unknown as {
        legal_name: string;
        display_name: string | null;
        phone: string | null;
      }[];
      return rows[0] ?? { legal_name: '', display_name: null, phone: null };
    });

    return applicantHistorySchema.parse({
      profile: {
        legalName: profile.legal_name,
        ...(profile.display_name ? { displayName: profile.display_name } : {}),
        ...(profile.phone ? { phone: profile.phone } : {}),
      },
      applicationsAtShelter: gathered.atShelter.map(a => ({
        id: a.id,
        animalName: a.animal_name,
        status: a.status,
        submittedAt: a.submitted_at
          ? new Date(a.submitted_at as unknown as string | Date).toISOString()
          : null,
        decidedAt: a.decided_at
          ? new Date(a.decided_at as unknown as string | Date).toISOString()
          : null,
      })),
      sharedArtifacts,
      generatedAt: new Date().toISOString(),
    });
  }

  async staffListNotes(
    actorId: string,
    shelterId: string,
    applicationId: string,
  ): Promise<ApplicationNotesResponse> {
    const rows = (await this.tenants.withTenant(
      { userId: actorId, shelterId, roleClass: 'staff' },
      async sql => {
        await this.assertApplicationInTenant(sql, applicationId);
        return sql`
          select n.id, n.body, n.created_at, u.email as author_email
          from application_notes n
          left join users u on u.id = n.author_id
          where n.application_id = ${applicationId}::uuid
          order by n.created_at asc, n.id asc`;
      },
    )) as unknown as {
      id: string;
      body: string;
      created_at: Date;
      author_email: string | null;
    }[];
    return applicationNotesResponseSchema.parse({
      items: rows.map(n =>
        applicationNoteSchema.parse({
          id: n.id,
          authorName: n.author_email ?? null,
          body: n.body,
          createdAt: new Date(n.created_at as unknown as string | Date).toISOString(),
        }),
      ),
    });
  }

  async staffAddNote(
    actorId: string,
    shelterId: string,
    applicationId: string,
    input: AddApplicationNoteInput,
  ): Promise<ApplicationNote> {
    const inserted = await this.tenants.withTenant(
      { userId: actorId, shelterId, roleClass: 'staff' },
      async sql => {
        await this.assertApplicationInTenant(sql, applicationId);
        const rows = (await sql`
          insert into application_notes (application_id, shelter_id, author_id, body)
          values (${applicationId}::uuid, ${shelterId}::uuid, ${actorId}::uuid, ${input.body})
          returning id, body, created_at`) as unknown as {
          id: string;
          body: string;
          created_at: Date;
        }[];
        await this.audit.append(sql, actorId, shelterId, 'application.note_added', 'application_note', rows[0]!.id, {});
        return rows[0]!;
      },
    );
    const authorEmail = await this.tenants.service(async sql => {
      const rows = (await sql`
        select email from users where id = ${actorId}::uuid limit 1`) as unknown as {
        email: string;
      }[];
      return rows[0]?.email ?? null;
    });
    return applicationNoteSchema.parse({
      id: inserted.id,
      authorName: authorEmail,
      body: inserted.body,
      createdAt: new Date(inserted.created_at as unknown as string | Date).toISOString(),
    });
  }
}
