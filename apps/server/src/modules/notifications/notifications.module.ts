import { Global, Inject, Injectable, Module, type OnApplicationShutdown } from '@nestjs/common';
import nodemailer from 'nodemailer';
import type { Transporter } from 'nodemailer';
import type { AnySql } from '@kithlink/db';
import { TenantService } from '../db.module';
import { S3Service } from '../s3/s3.module';

export interface OutboxEmailPayload {
  to: string[];
  subject: string;
  text: string;
}

/** m17 account deletion: S3 objects to crypto-shred from storage (docs/design/04 §6). */
export interface AccountArtifactPurgePayload {
  keys: string[];
}

/** Mail templates: plain-text bodies carrying the action URLs (docs/design/11 §4 item 5). */
export function passwordResetEmail(to: string[], resetUrl: string): OutboxEmailPayload {
  return {
    to,
    subject: 'Reset your Kithlink password',
    text:
      'We received a request to reset your Kithlink password.\n\n' +
      `Reset your password: ${resetUrl}\n\n` +
      'This link expires in 1 hour. If you did not request a reset, you can ignore this email.',
  };
}

export function emailVerifyEmail(to: string[], verifyUrl: string): OutboxEmailPayload {
  return {
    to,
    subject: 'Verify your Kithlink email',
    text:
      'Welcome to Kithlink!\n\n' +
      `Verify your email: ${verifyUrl}\n\n` +
      'This link expires in 48 hours.',
  };
}

@Injectable()
export class OutboxService {
  constructor(
    @Inject(TenantService) private readonly tenants: TenantService,
  ) {}

  /** Enqueue inside the caller's transaction so the event commits atomically with the write. */
  async enqueue(
    sql: AnySql,
    topic: string,
    payload: OutboxEmailPayload | AccountArtifactPurgePayload,
  ): Promise<void> {
    await sql`
      insert into outbox_events (topic, payload_json)
      values (${topic}, ${JSON.stringify(payload)}::jsonb)`;
  }

  async enqueueViaService(
    topic: string,
    payload: OutboxEmailPayload | AccountArtifactPurgePayload,
  ): Promise<void> {
    await this.tenants.service(sql => this.enqueue(sql, topic, payload));
  }
}

@Injectable()
export class MailDispatcher implements OnApplicationShutdown {
  private readonly transport: Transporter | null;
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor(
    @Inject(TenantService) private readonly tenants: TenantService,
    @Inject(S3Service) private readonly s3: S3Service,
  ) {
    this.transport = process.env.SMTP_URL ? nodemailer.createTransport(process.env.SMTP_URL) : null;
  }

  start(intervalMs = 10_000): void {
    if (!this.transport) {
      console.warn('[outbox] SMTP_URL not set; email events will queue unsent');
    }
    this.timer = setInterval(() => void this.drain(), intervalMs);
    this.timer.unref?.();
  }

  async drain(): Promise<number> {
    const rows = (await this.tenants.service(async sql => {
      return sql`
        select id, topic, payload_json
        from outbox_events
        where sent_at is null
        order by created_at
        limit 20`;
    })) as unknown as {
      id: string;
      topic: string;
      payload_json: OutboxEmailPayload | AccountArtifactPurgePayload;
    }[];
    let sent = 0;
    for (const row of rows) {
      try {
        if (row.topic === 'account.artifact_purge') {
          const purge = row.payload_json as AccountArtifactPurgePayload;
          for (const key of purge.keys ?? []) await this.s3.delete(key);
        } else {
          if (!this.transport) continue;
          const email = row.payload_json as OutboxEmailPayload;
          await this.transport.sendMail({
            from: process.env.MAIL_FROM ?? 'Kithlink <no-reply@localhost>',
            to: email.to,
            subject: email.subject,
            text: email.text,
          });
        }
        await this.tenants.service(
          async sql => sql`update outbox_events set sent_at = now() where id = ${row.id}::uuid`,
        );
        sent++;
      } catch (error) {
        console.warn(`[outbox] failed to deliver ${row.topic} event ${row.id}`, error);
      }
    }
    return sent;
  }

  onApplicationShutdown(): void {
    if (this.timer) clearInterval(this.timer);
  }
}

@Global()
@Module({
  providers: [OutboxService, MailDispatcher],
  exports: [OutboxService, MailDispatcher],
})
export class NotificationsModule {}
