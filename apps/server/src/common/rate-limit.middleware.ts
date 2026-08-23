import type { NextFunction, Request, Response } from 'express';

const SESSION_COOKIES = ['kithlink_session', '__Host-kithlink_session'];

export interface BucketConfig {
  limit: number;
  windowMs: number;
}

export const BUCKETS = {
  anon: { limit: 60, windowMs: 60_000 },
  auth: { limit: 300, windowMs: 60_000 },
  presign: { limit: 20, windowMs: 60_000 },
} as const;

export type BucketName = keyof typeof BUCKETS;

const PRESIGN_ROUTE = /^\/app\/v1\/me\/artifacts(?:\/[^/]+\/upload-complete)?$/;

export function classifyBucket(method: string, path: string, hasSession: boolean): BucketName {
  if (method === 'POST' && PRESIGN_ROUTE.test(path)) return 'presign';
  return hasSession ? 'auth' : 'anon';
}

export interface TokenBucketState {
  tokens: number;
  updatedAt: number;
}

export function tryConsume(
  state: TokenBucketState,
  config: BucketConfig,
  nowMs: number,
  cost = 1,
): { ok: boolean; retryAfterSec: number } {
  const elapsed = Math.max(0, nowMs - state.updatedAt);
  const refilled = Math.min(config.limit, state.tokens + (elapsed / config.windowMs) * config.limit);
  if (refilled < cost) {
    const deficit = cost - refilled;
    return { ok: false, retryAfterSec: Math.ceil((deficit * config.windowMs) / config.limit / 1000) };
  }
  state.tokens = refilled - cost;
  state.updatedAt = nowMs;
  return { ok: true, retryAfterSec: 0 };
}

const store = new Map<string, TokenBucketState>();

export function resetRateLimitStoreForTests(): void {
  store.clear();
}

function sessionToken(req: Request): string | null {
  const cookies = req.cookies as Record<string, string | undefined> | undefined;
  for (const name of SESSION_COOKIES) {
    const token = cookies?.[name];
    if (token) return token;
  }
  return null;
}

export function rateLimit(): (req: Request, res: Response, next: NextFunction) => void {
  return (req, res, next) => {
    if (process.env.RATE_LIMIT_OFF === '1') {
      next();
      return;
    }
    const token = sessionToken(req);
    const bucket = classifyBucket(req.method, req.path, token !== null);
    const key = `${req.ip ?? req.socket.remoteAddress ?? 'unknown'}:${bucket}`;
    let state = store.get(key);
    if (!state) {
      state = { tokens: BUCKETS[bucket].limit, updatedAt: Date.now() };
      store.set(key, state);
    }
    const result = tryConsume(state, BUCKETS[bucket], Date.now());
    if (!result.ok) {
      res.setHeader('Retry-After', String(result.retryAfterSec));
      res.status(429).type('application/problem+json').json({
        type: 'https://kithlink.org/problems/rate-limited',
        title: 'Too Many Requests',
        status: 429,
        detail: `Rate limit exceeded for the "${bucket}" bucket; retry later.`,
        instance: req.originalUrl,
      });
      return;
    }
    next();
  };
}
