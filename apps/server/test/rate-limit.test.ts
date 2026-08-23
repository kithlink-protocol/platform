import { describe, expect, it } from 'vitest';
import {
  BUCKETS,
  classifyBucket,
  tryConsume,
  type TokenBucketState,
} from '../src/common/rate-limit.middleware';

function fresh(limit: number): TokenBucketState {
  return { tokens: limit, updatedAt: 0 };
}

describe('classifyBucket', () => {
  it('routes artifact init and upload-complete posts to the presign bucket', () => {
    expect(classifyBucket('POST', '/app/v1/me/artifacts', true)).toBe('presign');
    expect(classifyBucket('POST', '/app/v1/me/artifacts/abc123/upload-complete', true)).toBe('presign');
    expect(classifyBucket('GET', '/app/v1/me/artifacts', true)).toBe('auth');
  });

  it('uses the auth bucket when a session cookie is present and anon otherwise', () => {
    expect(classifyBucket('GET', '/app/v1/auth/session', true)).toBe('auth');
    expect(classifyBucket('GET', '/public/v1/shelters', false)).toBe('anon');
  });
});

describe('tryConsume token bucket', () => {
  it('drains tokens until exhausted, then reports retry-after', () => {
    const cfg = { limit: 3, windowMs: 60_000 };
    const state = fresh(cfg.limit);
    for (let i = 0; i < 3; i++) {
      expect(tryConsume(state, cfg, 1000).ok).toBe(true);
    }
    const blocked = tryConsume(state, cfg, 1001);
    expect(blocked.ok).toBe(false);
    expect(blocked.retryAfterSec).toBeGreaterThan(0);
  });

  it('refills proportionally to elapsed time', () => {
    const cfg = { limit: 60, windowMs: 60_000 };
    const state = fresh(cfg.limit);
    for (let i = 0; i < 60; i++) tryConsume(state, cfg, 0);
    expect(tryConsume(state, cfg, 30_000).ok).toBe(true);
  });

  it('caps refill at the burst limit', () => {
    const cfg = BUCKETS.presign;
    const state = fresh(cfg.limit);
    tryConsume(state, cfg, 0, 5);
    expect(tryConsume(state, { ...cfg, windowMs: 24 * 3600 * 1000 }, 1).ok).toBe(true);
  });

  it('exposes distinct configs per bucket name', () => {
    expect(BUCKETS.anon.limit).toBe(60);
    expect(BUCKETS.auth.limit).toBe(300);
    expect(BUCKETS.presign.limit).toBe(20);
  });
});
