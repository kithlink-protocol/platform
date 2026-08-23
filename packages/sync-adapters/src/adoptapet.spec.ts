import { afterEach, describe, expect, it, vi } from 'vitest';
import { AdoptAPetAdapter, mapSpecies, mapStatus, normalizeExternalStatus } from './adoptapet';
import type { AnimalPayload } from './types';

const CTX = {
  credentials: { clientId: 'test-api-key', clientSecret: 'unused' },
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
  it('keeps dog and cat', () => {
    expect(mapSpecies('dog')).toBe('dog');
    expect(mapSpecies('Cat')).toBe('cat');
  });

  it('maps everything else to small animal', () => {
    expect(mapSpecies('rabbit')).toBe('small animal');
    expect(mapSpecies('iguana')).toBe('small animal');
  });
});

describe('mapStatus', () => {
  it('maps available and pending verbatim', () => {
    expect(mapStatus('available')).toBe('available');
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
    expect(normalizeExternalStatus('available')).toBe('available');
    expect(normalizeExternalStatus('pending')).toBe('pending');
    expect(normalizeExternalStatus(undefined)).toBe('unavailable');
  });
});

describe('AdoptAPetAdapter dry-run decisions', () => {
  afterEach(() => vi.restoreAllMocks());

  it('pushes without network access in dry_run mode', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const adapter = new AdoptAPetAdapter();
    const results = await adapter.pushAnimals(CTX, [animal()]);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(results).toEqual([
      {
        localId: 'a-1',
        status: 'pushed',
        decision: 'dry-run would push Rex as species=dog status=available',
      },
    ]);
  });

  it('reports a would-be removal without external id as skipped', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const adapter = new AdoptAPetAdapter();
    const results = await adapter.pushAnimals(CTX, [animal({ status: 'adopted' })]);
    expect(results[0]).toMatchObject({ status: 'skipped' });
    expect(results[0]!.decision).toBe('dry-run would remove Rex: no external id');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('removes adopted animals with an external id when live', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
    vi.stubGlobal('fetch', fetchMock);
    const adapter = new AdoptAPetAdapter();
    const results = await adapter.pushAnimals({ ...CTX, mode: 'live' }, [
      animal({ status: 'adopted', externalId: 'ap-9' }),
    ]);
    expect(results[0]).toMatchObject({
      status: 'skipped',
      externalId: 'ap-9',
      decision: 'removed Rex (ap-9)',
    });
    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.adoptapet.com/v2/pets/ap-9',
      expect.objectContaining({ method: 'DELETE' }),
    );
  });

  it('posts the mapped payload to /v2/pets with the api key when live', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ pet: { id: 42 } }), { status: 201 }),
    );
    vi.stubGlobal('fetch', fetchMock);
    const adapter = new AdoptAPetAdapter();
    const results = await adapter.pushAnimals({ ...CTX, mode: 'live' }, [
      animal({ species: 'rabbit', photoUrls: ['https://cdn.example.com/r.jpg', null] }),
    ]);
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(String(init.body)) as Record<string, unknown>;
    expect(body.api_key).toBe('test-api-key');
    expect(body.species).toBe('small animal');
    expect(body.status).toBe('available');
    expect(body.photo_urls).toEqual(['https://cdn.example.com/r.jpg']);
    expect(results[0]).toMatchObject({ status: 'pushed', externalId: '42' });
  });
});
