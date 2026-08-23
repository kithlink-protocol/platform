import { describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import { UnauthorizedException } from '@nestjs/common';
import { addApplicationNoteSchema, ageToAgeClass, applicantHistorySchema, labelForDay, registerSchema, staffRoles } from '@kithlink/contracts';
import { mapSpecies, mapStatus, PetfinderAdapter } from '@kithlink/sync-adapters';
import { decodeCursor, encodeCursor } from '../src/common/cursor.util';
import { haversineKm } from '../src/common/geo';
import { exceptionToProblem } from '../src/common/problem.util';
import { STAFF_ROLE_RANK, hasSufficientRole } from '../src/common/roles';
import { CryptoUtil } from '../src/common/crypto.util';
import { createToken, hashToken } from '../src/modules/auth/tokens.util';
import { computeConfidence } from '../src/modules/parse/score';
import { escapeHtml } from '../src/modules/sites/render';

describe('auth token hashing', () => {
  it('roundtrips a raw token to its sha256 hash', () => {
    const { raw, tokenHash } = createToken();
    expect(raw).toMatch(/^[0-9a-f]{64}$/);
    expect(hashToken(raw)).toBe(tokenHash);
  });

  it('hashes deterministically and never stores the raw value', () => {
    expect(hashToken('abc')).toBe(createHash('sha256').update('abc').digest('hex'));
    expect(hashToken('abc')).not.toBe('abc');
  });
});

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

describe('applicant history contract', () => {
  it('parses a full history fixture', () => {
    const parsed = applicantHistorySchema.parse({
      profile: { legalName: 'Ada Lovelace', displayName: 'Ada', phone: '+14155551234' },
      applicationsAtShelter: [
        {
          id: '11111111-2222-4333-8444-555555555555',
          animalName: 'Biscuit',
          status: 'submitted',
          submittedAt: '2026-08-01T10:00:00.000Z',
          decidedAt: null,
        },
      ],
      sharedArtifacts: [
        {
          id: '22222222-3333-4333-8444-555555555555',
          type: 'gov_id',
          state: 'verified',
          confidence: null,
          extracted: null,
          networkVerified: true,
          verifications: [
            {
              shelterName: 'Happytail Rescue',
              outcome: 'confirmed',
              method: 'landlord_call',
              verifiedAt: '2026-08-02T10:00:00.000Z',
            },
          ],
          createdAt: '2026-08-01T09:00:00.000Z',
        },
      ],
      generatedAt: '2026-08-03T10:00:00.000Z',
    });
    expect(parsed.applicationsAtShelter[0]?.status).toBe('submitted');
    expect(parsed.sharedArtifacts[0]?.verifications[0]?.method).toBe('landlord_call');
  });

  it('accepts a minimal fixture and validates note bodies', () => {
    const minimal = applicantHistorySchema.parse({
      profile: { legalName: 'No Extras' },
      applicationsAtShelter: [],
      sharedArtifacts: [],
      generatedAt: '2026-08-03T10:00:00.000Z',
    });
    expect(minimal.profile.displayName).toBeUndefined();
    expect(minimal.profile.phone).toBeUndefined();

    expect(addApplicationNoteSchema.safeParse({ body: '' }).success).toBe(false);
    expect(addApplicationNoteSchema.safeParse({ body: 'x'.repeat(4001) }).success).toBe(false);
    expect(addApplicationNoteSchema.safeParse({ body: 'Called references.' }).success).toBe(true);
  });
});

describe('ageToAgeClass boundaries', () => {
  const now = new Date(Date.UTC(2026, 7, 23));

  it('buckets by whole-year age: baby <1, young 1-2, adult 3-7, senior 8+', () => {
    expect(ageToAgeClass(2026, now)).toBe('baby');
    expect(ageToAgeClass(2025, now)).toBe('young');
    expect(ageToAgeClass(2024, now)).toBe('young');
    expect(ageToAgeClass(2023, now)).toBe('adult');
    expect(ageToAgeClass(2019, now)).toBe('adult');
    expect(ageToAgeClass(2018, now)).toBe('senior');
    expect(ageToAgeClass(2000, now)).toBe('senior');
  });

  it('treats future birth years as baby and null as unknown', () => {
    expect(ageToAgeClass(2030, now)).toBe('baby');
    expect(ageToAgeClass(null, now)).toBeNull();
  });
});

describe('haversineKm', () => {
  it('is zero for identical points', () => {
    expect(haversineKm(45.5, -122.6, 45.5, -122.6)).toBe(0);
  });

  it('matches known great-circle distances', () => {
    const oneDegreeLat = haversineKm(0, 0, 1, 0);
    expect(oneDegreeLat).toBeGreaterThan(110);
    expect(oneDegreeLat).toBeLessThan(112);
    const pdxToAustin = haversineKm(45.52, -122.68, 30.27, -97.74);
    expect(pdxToAustin).toBeGreaterThan(2700);
    expect(pdxToAustin).toBeLessThan(2950);
  });
});

describe('labelForDay', () => {
  it('maps the four touchpoint offsets to gentle labels', () => {
    expect(labelForDay(2)).toBe('First nights');
    expect(labelForDay(14)).toBe('Settling in');
    expect(labelForDay(30)).toBe('One month home');
    expect(labelForDay(365)).toBe('Gotcha Day anniversary');
  });

  it('falls back to Day N for unknown offsets', () => {
    expect(labelForDay(7)).toBe('Day 7');
    expect(labelForDay(0)).toBe('Day 0');
  });
});
