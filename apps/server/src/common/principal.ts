import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';
import type { Membership } from '@kithlink/contracts';

export interface Principal {
  user: { id: string; email: string; emailVerified: boolean };
  memberships: Membership[];
}

export interface PrincipalRequest extends Request {
  principal?: Principal;
}

export const Principal = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): Principal => {
    const req = ctx.switchToHttp().getRequest<PrincipalRequest>();
    if (!req.principal) throw new Error('Principal missing: SessionGuard must run first');
    return req.principal;
  },
);
