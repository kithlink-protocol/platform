import { afterEach, describe, expect, it, vi } from 'vitest';
import { PetfinderAdapter, mapSpecies, mapStatus, normalizeExternalStatus } from './petfinder';
import type { AnimalPayload } from './types';

const CTX = {
  credentials: { clientId: 'test-id', clientSecret: 'test-secret' },
  mode: 'dry_run',
} as const;

function animal(overrides: Partial<AnimalPayload> = {}): AnimalPayload {
  return {
    localId: 'a-1',
    externalId: null,
    name: 'Rex',
    species: 'dog',
    breed: 'lab mix',
    description: 'good boy',
    status: 'available',
    photoUrls: ['https://cdn.example.com/rex.jpg'],
    ...overrides,
  };
}

describe('mapSpecies', () => {
  it('keeps dog, cat and rabbit', () => {
    expect(mapSpecies('dog')).toBe('dog');
    expect(mapSpecies('Cat')).toBe('cat');
    expect(mapSpecies('RABBIT')).toBe('rabbit');
  });

  it('maps everything else to other', () => {
    expect(mapSpecies('iguana')).toBe('other');
  });
});

describe('mapStatus', () => {
  it('maps available to adoptable and pending verbatim', () => {
    expect(mapStatus('available')).toBe('adoptable');
    expect(mapStatus('pending')).toBe('pending');
  });

  it('maps adopted, draft and unavailable to remove', () => {
    expect(mapStatus('adopted')).toBe('remove');
    expect(mapStatus('draft')).toBe('remove');
    expect(mapStatus('unavailable')).toBe('remove');
  });
});

describe('normalizeExternalStatus', () => {
  it('round-trips known statuses and buckets unknown ones', () => {
    expect(normalizeExternalStatus('adoptable')).toBe('available');
    expect(normalizeExternalStatus('pending')).toBe('pending');
    expect(normalizeExternalStatus(undefined)).toBe('unavailable');
  });
});

describe('PetfinderAdapter dry-run decisions', () => {
  afterEach(() => vi.restoreAllMocks());

  it('pushes without network access in dry_run mode', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const adapter = new PetfinderAdapter();
    const results = await adapter.pushAnimals(CTX, [animal()]);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(results).toEqual([
      {
        localId: 'a-1',
        status: 'pushed',
        decision: 'dry-run would push Rex as type=dog status=adoptable',
      },
    ]);
  });

  it('reports a would-be removal without external id as skipped', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const adapter = new PetfinderAdapter();
    const results = await adapter.pushAnimals(CTX, [animal({ status: 'adopted' })]);
    expect(results[0]).toMatchObject({ status: 'skipped' });
    expect(results[0]!.decision).toBe('dry-run would remove Rex: no external id');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('removes adopted animals with an external id when live', async () => {
    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ access_token: 'tok', expires_in: 3600 }), { status: 200 }))
      .mockResolvedValueOnce(new Response(null, { status: 204 })));
    const adapter = new PetfinderAdapter();
    const results = await adapter.pushAnimals({ ...CTX, mode: 'live' }, [
      animal({ status: 'adopted', externalId: 'pf-9' }),
    ]);
    expect(results[0]).toMatchObject({
      status: 'skipped',
      externalId: 'pf-9',
      decision: 'removed Rex (pf-9)',
    });
  });

  it('posts the mapped payload to /v2/animals when live', async () => {
    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ access_token: 'tok', expires_in: 3600 }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ animal: { id: 7 } }), { status: 201 })));
    const adapter = new PetfinderAdapter();
    const results = await adapter.pushAnimals({ ...CTX, mode: 'live' }, [
      animal({ photoUrls: ['https://cdn.example.com/r.jpg', null] }),
    ]);
    expect(results[0]).toMatchObject({ status: 'pushed', externalId: '7' });
  });
});
