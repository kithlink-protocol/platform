import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Query,
  Req,
  Res,
  UnauthorizedException,
  UseGuards,
  Inject,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { verify as argonVerify, hash as argonHash } from '@node-rs/argon2';
import { createHash, randomBytes } from 'node:crypto';
import type { Request, Response } from 'express';
import {
  authSessionSchema,
  forgotPasswordSchema,
  loginSchema,
  registerSchema,
  resetPasswordSchema,
  userPublicSchema,
} from '@kithlink/contracts';
import { AuditService } from '../../common/audit.service';
import { isUniqueViolation } from '../../common/db.util';
import { Principal } from '../../common/principal';
import { SESSION_COOKIE_NAME, SessionGuard, sessionCookieOptions } from '../../common/session.guard';
import { emailVerifyEmail, OutboxService, passwordResetEmail } from '../notifications/notifications.module';
import { TenantService } from '../db.module';
import { createToken, hashToken } from './tokens.util';

interface UserRow {
  id: string;
  email: string;
  password_hash: string | null;
}

interface TokenRow {
  token_id: string;
  user_id: string;
}

@Controller('app/v1/auth')
export class AuthController {
  constructor(
    @Inject(TenantService) private readonly tenants: TenantService,
    @Inject(AuditService) private readonly audit: AuditService,
    @Inject(OutboxService) private readonly outbox: OutboxService,
    @Inject(ConfigService) private readonly config: ConfigService,
  ) {}

  private appUrl(): string {
    return this.config.get<string>('APP_URL') ?? 'http://localhost:3000';
  }

  @Post('register')
  async register(@Res({ passthrough: true }) res: Response, @Body() body: unknown) {
    const input = registerSchema.parse(body);
    const passwordHash = await argonHash(input.password);
    const token = randomBytes(32).toString('hex');
    const tokenHash = createHash('sha256').update(token).digest('hex');
    const verify = createToken();
    try {
      const user = await this.tenants.service(async sql => {
        const rows = (await sql`
          insert into users (email, password_hash)
          values (${input.email}, ${passwordHash})
          returning id, email`) as unknown as UserRow[];
        const created = rows[0]!;
        await this.audit.append(sql, created.id, null, 'user.registered', 'user', created.id, {});
        await sql`
          insert into sessions (user_id, token_hash, expires_at)
          values (${created.id}, ${tokenHash}, now() + interval '30 days')`;
        await sql`
          insert into email_verification_tokens (user_id, token_hash, expires_at)
          values (${created.id}, ${verify.tokenHash}, now() + interval '48 hours')`;
        await this.outbox.enqueue(
          sql,
          'auth.email_verify',
          emailVerifyEmail([created.email], `${this.appUrl()}/verify-email?token=${verify.raw}`),
        );
        return created;
      });
      res.cookie(SESSION_COOKIE_NAME, token, sessionCookieOptions());
      return userPublicSchema.parse({ id: user.id, email: user.email, emailVerified: false });
    } catch (error) {
      if (isUniqueViolation(error)) throw new ConflictException('Email already registered');
      throw error;
    }
  }

  @Post('forgot-password')
  async forgotPassword(@Body() body: unknown) {
    const input = forgotPasswordSchema.parse(body);
    await this.tenants.service(async sql => {
      const rows = (await sql`
        select id, email
        from users
        where email = ${input.email} and deleted_at is null
        limit 1`) as unknown as UserRow[];
      const user = rows[0];
      if (!user) return;
      const reset = createToken();
      await sql`
        insert into password_reset_tokens (user_id, token_hash, expires_at)
        values (${user.id}, ${reset.tokenHash}, now() + interval '1 hour')`;
      await this.outbox.enqueue(
        sql,
        'auth.password_reset',
        passwordResetEmail([user.email], `${this.appUrl()}/reset-password?token=${reset.raw}`),
      );
    });
    return { ok: true };
  }

  @Post('reset-password')
  async resetPassword(@Body() body: unknown) {
    const input = resetPasswordSchema.parse(body);
    const passwordHash = await argonHash(input.password);
    await this.tenants.service(async sql => {
      const found = (await sql`
        select t.id as token_id, u.id as user_id
        from password_reset_tokens t join users u on u.id = t.user_id
        where t.token_hash = ${hashToken(input.token)}
          and t.used_at is null
          and t.expires_at > now()
          and u.deleted_at is null
        limit 1`) as unknown as TokenRow[];
      const row = found[0];
      if (!row) throw new BadRequestException('Invalid or expired reset link');
      await sql`update users set password_hash = ${passwordHash} where id = ${row.user_id}`;
      await sql`update password_reset_tokens set used_at = now() where id = ${row.token_id}`;
      await sql`delete from sessions where user_id = ${row.user_id}`;
      await this.audit.append(
        sql,
        row.user_id,
        null,
        'auth.password_reset_completed',
        'user',
        row.user_id,
        {},
      );
    });
    return { ok: true };
  }

  @Get('verify-email')
  async verifyEmail(@Query('token') token: string | undefined) {
    if (!token || token.length < 10 || token.length > 200) {
      throw new BadRequestException('Invalid verification link');
    }
    await this.tenants.service(async sql => {
      const found = (await sql`
        select t.id as token_id, t.user_id
        from email_verification_tokens t join users u on u.id = t.user_id
        where t.token_hash = ${hashToken(token)}
          and t.used_at is null
          and t.expires_at > now()
          and u.deleted_at is null
        limit 1`) as unknown as TokenRow[];
      const row = found[0];
      if (!row) throw new BadRequestException('Invalid or expired verification link');
      await sql`
        update users set email_verified_at = coalesce(email_verified_at, now())
        where id = ${row.user_id}`;
      await sql`update email_verification_tokens set used_at = now() where id = ${row.token_id}`;
      await this.audit.append(
        sql,
        row.user_id,
        null,
        'auth.email_verified',
        'user',
        row.user_id,
        {},
      );
    });
    return { ok: true };
  }

  @Post('resend-verification')
  @UseGuards(SessionGuard)
  async resendVerification(@Principal() principal: Principal) {
    const verify = createToken();
    await this.tenants.service(async sql => {
      await sql`
        insert into email_verification_tokens (user_id, token_hash, expires_at)
        values (${principal.user.id}, ${verify.tokenHash}, now() + interval '48 hours')`;
      await this.outbox.enqueue(
        sql,
        'auth.email_verify',
        emailVerifyEmail([principal.user.email], `${this.appUrl()}/verify-email?token=${verify.raw}`),
      );
    });
    return { ok: true };
  }

  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(
    @Body() body: unknown,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const input = loginSchema.parse(body);
    const user = await this.tenants.service(async sql => {
      const rows = (await sql`
        select id, email, password_hash
        from users
        where email = ${input.email} and deleted_at is null
        limit 1`) as unknown as UserRow[];
      return rows[0] ?? null;
    });
    const verified = user?.password_hash
      ? await argonVerify(user.password_hash, input.password).catch(() => false)
      : false;
    if (!user || !verified) throw new UnauthorizedException('Invalid credentials');
    const token = randomBytes(32).toString('hex');
    const tokenHash = createHash('sha256').update(token).digest('hex');
    const uaHeader = req.headers['user-agent'];
    const userAgent = Array.isArray(uaHeader) ? uaHeader.join(', ') : (uaHeader ?? null);
    await this.tenants.service(async sql => {
      await sql`
        insert into sessions (user_id, token_hash, expires_at, user_agent)
        values (${user.id}, ${tokenHash}, now() + interval '30 days', ${userAgent})`;
      await this.audit.append(sql, user.id, null, 'auth.login', 'user', user.id, {});
    });
    res.cookie(SESSION_COOKIE_NAME, token, sessionCookieOptions());
    return userPublicSchema.parse({ id: user.id, email: user.email, emailVerified: false });
  }

  @Post('logout')
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const token = (req.cookies as Record<string, string | undefined> | undefined)?.[SESSION_COOKIE_NAME];
    if (token) {
      const tokenHash = createHash('sha256').update(token).digest('hex');
      await this.tenants.service(
        sql => sql`update sessions set expires_at = now() where token_hash = ${tokenHash}`,
      );
    }
    res.clearCookie(SESSION_COOKIE_NAME, { path: '/' });
    return { ok: true };
  }

  @Get('session')
  @UseGuards(SessionGuard)
  session(@Principal() principal: Principal) {
    return authSessionSchema.parse(principal);
  }
}
