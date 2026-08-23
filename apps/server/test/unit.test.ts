import { describe, expect, it } from 'vitest';
import { UnauthorizedException } from '@nestjs/common';
import { registerSchema, staffRoles } from '@kithlink/contracts';
import { mapSpecies, mapStatus, PetfinderAdapter } from '@kithlink/sync-adapters';
import { decodeCursor, encodeCursor } from '../src/common/cursor.util';
import { exceptionToProblem } from '../src/common/problem.util';
import { STAFF_ROLE_RANK, hasSufficientRole } from '../src/common/roles';
import { CryptoUtil } from '../src/common/crypto.util';
import { computeConfidence } from '../src/modules/parse/score';
import { escapeHtml } from '../src/modules/sites/render';

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

describe('escapeHtml', () => {
  it('escapes script tags', () => {
    expect(escapeHtml('<script>alert("x")</script>')).toBe('&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;');
  });

  it('escapes quotes', () => {
    expect(escapeHtml('"double" and \'single\'')).toBe('&quot;double&quot; and &#39;single&#39;');
  });

  it('escapes ampersands without double-escaping entities', () => {
    expect(escapeHtml('Tom & Jerry & <b>bold</b>')).toBe('Tom &amp; Jerry &amp; &lt;b&gt;bold&lt;/b&gt;');
    expect(escapeHtml('&amp;&lt;')).toBe('&amp;amp;&amp;lt;');
  });

  it('leaves safe text untouched', () => {
    expect(escapeHtml('Happy Tails Every Day')).toBe('Happy Tails Every Day');
  });
});

describe('petfinder adapter mappings', () => {
  it('maps species dog/cat/rabbit and falls back to other', () => {
    expect(mapSpecies('dog')).toBe('dog');
    expect(mapSpecies('cat')).toBe('cat');
    expect(mapSpecies('rabbit')).toBe('rabbit');
    expect(mapSpecies('ferret')).toBe('other');
  });

  it('maps statuses available/pending and removals', () => {
    expect(mapStatus('available')).toBe('adoptable');
    expect(mapStatus('pending')).toBe('pending');
    expect(mapStatus('adopted')).toBe('remove');
    expect(mapStatus('unavailable')).toBe('remove');
    expect(mapStatus('draft')).toBe('remove');
  });

  it('logs dry-run decisions without network calls', async () => {
    const adapter = new PetfinderAdapter({ dryRun: true });
    const results = await adapter.pushAnimals(
      { credentials: { clientId: 'id-12345678', clientSecret: 'secret-12345678' }, mode: 'dry_run' },
      [
        {
          localId: 'a1',
          externalId: null,
          name: 'Rex',
          species: 'dog',
          breed: 'Lab mix',
          description: null,
          status: 'available',
          photoUrls: [null, 'https://example.com/rex.jpg'],
        },
        {
          localId: 'a2',
          externalId: 'ext-9',
          name: 'Old Tom',
          species: 'cat',
          breed: null,
          description: null,
          status: 'adopted',
          photoUrls: [],
        },
      ],
    );
    expect(results).toHaveLength(2);
    const push = results[0]!;
    expect(push.status).toBe('pushed');
    expect(push.decision).toBe('dry-run would push Rex as type=dog status=adoptable');
    expect(push.externalId).toBeUndefined();
    const remove = results[1]!;
    expect(remove.status).toBe('skipped');
    expect(remove.externalId).toBe('ext-9');
    expect(remove.decision).toContain('dry-run would remove Old Tom (ext-9)');
  });
});

describe('confidence scoring', () => {
  it('scores fully grounded, complete extractions high', () => {
    const score = computeConfidence({
      ocrMean: 0.95,
      groundedRatio: 1,
      completeness: 1,
      consistency: 1,
      classifierAgreement: 1,
    });
    expect(score).toBeGreaterThan(0.8);
    expect(score).toBeLessThanOrEqual(1);
  });

  it('scores ungrounded extractions below the pending_review threshold', () => {
    const score = computeConfidence({
      ocrMean: 0.9,
      groundedRatio: 0,
      completeness: 0.4,
      consistency: 0.5,
      classifierAgreement: 0.5,
    });
    expect(score).toBeLessThan(0.55);
  });

  it('weights match doc04 V4 and clamp to [0,1]', () => {
    expect(computeConfidence({ ocrMean: 5, groundedRatio: -2, completeness: 0.5, consistency: 0.5, classifierAgreement: 1 })).toBeLessThanOrEqual(1);
    expect(computeConfidence({ ocrMean: 0, groundedRatio: 0, completeness: 0, consistency: 0, classifierAgreement: 0 })).toBe(0);
  });
});

describe('crypto seal/open', () => {
  const crypto = new CryptoUtil(Buffer.from('k'.repeat(32)).toString('base64'));

  it('roundtrips plaintext', () => {
    const secret = '12 Secret St, Springfield';
    expect(crypto.open(crypto.seal(secret))).toBe(secret);
  });

  it('detects tampered ciphertext', () => {
    const sealed = crypto.seal('address');
    const envelope = JSON.parse(Buffer.from(sealed, 'base64').toString('utf8')) as { ct: string };
    const tampered = Buffer.from(
      JSON.stringify({ ...envelope, ct: Buffer.from('evil').toString('base64') }),
      'utf8',
    ).toString('base64');
    expect(() => crypto.open(tampered)).toThrow();
  });

  it('rejects malformed payloads', () => {
    expect(() => crypto.open('not-base64-json!!')).toThrow();
  });

  it('hashes deterministically', () => {
    expect(crypto.sha256Hex(Buffer.from('abc'))).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    );
  });
});
