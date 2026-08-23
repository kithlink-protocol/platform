import { createHash, randomBytes } from 'node:crypto';

export interface AuthToken {
  raw: string;
  tokenHash: string;
}

/** Raw token is only ever returned here — the DB stores the sha256 hash. */
export function createToken(): AuthToken {
  const raw = randomBytes(32).toString('hex');
  return { raw, tokenHash: hashToken(raw) };
}

export function hashToken(raw: string): string {
  return createHash('sha256').update(raw).digest('hex');
}
