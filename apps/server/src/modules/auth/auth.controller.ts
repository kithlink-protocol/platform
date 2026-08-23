import {
  Body,
  ConflictException,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  Res,
  UnauthorizedException,
  UseGuards,
  Inject,
} from '@nestjs/common';
import { verify as argonVerify, hash as argonHash } from '@node-rs/argon2';
import { createHash, randomBytes } from 'node:crypto';
import type { Request, Response } from 'express';
import { authSessionSchema, loginSchema, registerSchema, userPublicSchema } from '@kithlink/contracts';
import { AuditService } from '../../common/audit.service';
import { isUniqueViolation } from '../../common/db.util';
import { Principal } from '../../common/principal';
import { SESSION_COOKIE_NAME, SessionGuard, sessionCookieOptions } from '../../common/session.guard';
import { TenantService } from '../db.module';

interface UserRow {
  id: string;
  email: string;
  password_hash: string | null;
}

@Controller('app/v1/auth')
export class AuthController {
  constructor(
    @Inject(TenantService) private readonly tenants: TenantService,
    @Inject(AuditService) private readonly audit: AuditService,
  ) {}

  @Post('register')
  async register(@Res({ passthrough: true }) res: Response, @Body() body: unknown) {
    const input = registerSchema.parse(body);
    const passwordHash = await argonHash(input.password);
    const token = randomBytes(32).toString('hex');
    const tokenHash = createHash('sha256').update(token).digest('hex');
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
        return created;
      });
      res.cookie(SESSION_COOKIE_NAME, token, sessionCookieOptions());
      return userPublicSchema.parse({ id: user.id, email: user.email, emailVerified: false });
    } catch (error) {
      if (isUniqueViolation(error)) throw new ConflictException('Email already registered');
      throw error;
    }
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
