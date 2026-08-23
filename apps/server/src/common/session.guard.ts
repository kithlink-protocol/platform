import { CanActivate, ExecutionContext, Injectable, UnauthorizedException,
  Inject,
} from '@nestjs/common';
import { createHash } from 'node:crypto';
import type { StaffRole } from '@kithlink/contracts';
import { TenantService } from '../modules/db.module';
import type { Principal, PrincipalRequest } from './principal';

export const IS_PROD = process.env.NODE_ENV === 'production';
export const SESSION_COOKIE_NAME = IS_PROD
  ? '__Host-kithlink_session'
  : 'kithlink_session';

export const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;

const LAST_SEEN_THROTTLE_MS = 5 * 60 * 1000;

interface SessionRow {
  session_id: string;
  user_id: string;
  email: string;
  email_verified_at: Date | null;
  last_seen_at: Date;
}

interface MembershipRow {
  shelter_id: string;
  role: StaffRole;
  shelter_name: string;
}

export function sessionCookieOptions() {
  return {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    maxAge: SESSION_TTL_MS,
    secure: IS_PROD,
  } as const;
}

@Injectable()
export class SessionGuard implements CanActivate {
  constructor(
    @Inject(TenantService) private readonly tenants: TenantService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<PrincipalRequest>();
    const token = (req.cookies as Record<string, string | undefined> | undefined)?.[SESSION_COOKIE_NAME];
    if (!token) throw new UnauthorizedException('Missing session cookie');
    const tokenHash = createHash('sha256').update(token).digest('hex');
    const principal = await this.tenants.withTenant({ roleClass: 'service' }, async sql => {
      const sessionRows = (await sql`
        select s.id as session_id, s.last_seen_at, u.id as user_id, u.email, u.email_verified_at
        from sessions s join users u on u.id = s.user_id
        where s.token_hash = ${tokenHash} and s.expires_at > now() and u.deleted_at is null
        limit 1`) as unknown as SessionRow[];
      const session = sessionRows[0];
      if (!session) return null;
      if (Date.now() - new Date(session.last_seen_at as unknown as string | Date).getTime() > LAST_SEEN_THROTTLE_MS) {
        await sql`update sessions set last_seen_at = now() where id = ${session.session_id}`;
      }
      const membershipRows = (await sql`
        select sm.shelter_id, sm.role, sh.name as shelter_name
        from staff_members sm join shelters sh on sh.id = sm.shelter_id
        where sm.user_id = ${session.user_id}
        order by sh.name`) as unknown as MembershipRow[];
      return {
        user: {
          id: session.user_id,
          email: session.email,
          emailVerified: session.email_verified_at !== null,
        },
        memberships: membershipRows.map(m => ({
          shelterId: m.shelter_id,
          shelterName: m.shelter_name,
          role: m.role,
        })),
      } satisfies Principal;
    });
    if (!principal) throw new UnauthorizedException('Invalid session');
    req.principal = principal;
    return true;
  }
}
