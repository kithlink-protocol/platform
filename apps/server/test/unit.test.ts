import { describe, expect, it } from 'vitest';
import { UnauthorizedException } from '@nestjs/common';
import { registerSchema, staffRoles } from '@kithlink/contracts';
import { decodeCursor, encodeCursor } from '../src/common/cursor.util';
import { exceptionToProblem } from '../src/common/problem.util';
import { STAFF_ROLE_RANK, hasSufficientRole } from '../src/common/roles';

describe('staff role ranks', () => {
  it('orders viewer < volunteer < coordinator < admin < owner', () => {
    const ordered = [...staffRoles].sort((a, b) => STAFF_ROLE_RANK[a] - STAFF_ROLE_RANK[b]);
    expect(ordered).toEqual(['viewer', 'volunteer', 'coordinator', 'admin', 'owner']);
  });

  it('grants access by the minimum rank of required roles', () => {
    expect(hasSufficientRole('owner', ['admin', 'owner'])).toBe(true);
    expect(hasSufficientRole('admin', ['admin', 'owner'])).toBe(true);
    expect(hasSufficientRole('coordinator', ['admin', 'owner'])).toBe(false);
    expect(hasSufficientRole('volunteer', ['viewer'])).toBe(true);
  });
});

describe('cursor codec', () => {
  it('roundtrips a payload', () => {
    const payload = { createdAt: '2026-08-01T10:00:00.000Z', id: '11111111-2222-4333-8444-555555555555' };
    expect(decodeCursor(encodeCursor(payload))).toEqual(payload);
  });

  it('rejects garbage', () => {
    expect(decodeCursor('not-a-cursor')).toBeNull();
    expect(decodeCursor(Buffer.from(JSON.stringify(['oops']), 'utf8').toString('base64url'))).toBeNull();
  });
});

describe('problem mapping', () => {
  it('maps ZodError to 400 with issue messages', () => {
    const result = registerSchema.safeParse({ email: 'nope', password: 'short' });
    if (result.success) throw new Error('expected validation failure');
    const problem = exceptionToProblem(result.error);
    expect(problem.status).toBe(400);
    expect(problem.title).toBe('Validation failed');
    expect(problem.detail).toContain('password');
    expect(problem.detail).toContain('email');
  });

  it('maps HttpException to its status and message', () => {
    const problem = exceptionToProblem(new UnauthorizedException('Invalid credentials'));
    expect(problem.status).toBe(401);
    expect(problem.title).toBe('Unauthorized');
    expect(problem.detail).toBe('Invalid credentials');
  });

  it('maps unknown errors to 500 without detail', () => {
    const problem = exceptionToProblem(new Error('boom'));
    expect(problem.status).toBe(500);
    expect(problem.title).toBe('Internal Server Error');
  });
});
