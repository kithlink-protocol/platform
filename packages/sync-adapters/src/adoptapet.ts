import type { AdapterCredentials, AnimalPayload, PushResult, SyncAdapter, TenantCtx } from './types';

const API_BASE = process.env.ADOPTPET_API_BASE ?? 'https://api.adoptapet.com';
const DRY_RUN = 'dry-run would push';
const DRY_REMOVE = 'dry-run would remove';

export function mapSpecies(species: string): string {
  const lowered = species.toLowerCase();
  if (lowered === 'dog' || lowered === 'cat') return lowered;
  return 'small animal';
}

type AdoptAPetStatus = 'available' | 'pending' | 'remove';

export function mapStatus(status: string): AdoptAPetStatus {
  switch (status) {
    case 'available':
      return 'available';
    case 'pending':
      return 'pending';
    default:
      return 'remove';
  }
}

interface AdoptAPetPetResponse {
  pet?: { id?: number | string; status?: string };
  id?: number | string;
  status?: string;
}

export class AdoptAPetAdapter implements SyncAdapter {
  readonly provider = 'adoptapet' as const;
  readonly capabilities = { push: true, pull: false, photos: true, remove: true };

  private readonly forceDryRun: boolean;

  constructor(opts: { dryRun?: boolean } = {}) {
    this.forceDryRun = opts.dryRun ?? false;
  }

  private isDryRun(t: TenantCtx): boolean {
    return this.forceDryRun || t.mode === 'dry_run' || process.env.ADOPTAPET_MODE === 'dry_run';
  }

  private static apiKey(creds: AdapterCredentials): string {
    return creds.clientId;
  }

  async pushAnimals(t: TenantCtx, animals: AnimalPayload[]): Promise<PushResult[]> {
    const dryRun = this.isDryRun(t);
    const results: PushResult[] = [];
    for (const animal of animals) {
      try {
        results.push(await this.pushOne(t, animal, dryRun));
      } catch (error) {
        results.push({
          localId: animal.localId,
          status: 'failed',
          decision: `push failed: ${(error as Error).message}`,
        });
      }
    }
    return results;
  }

  private async pushOne(t: TenantCtx, animal: AnimalPayload, dryRun: boolean): Promise<PushResult> {
    const species = mapSpecies(animal.species);
    const status = mapStatus(animal.status);
    if (status === 'remove') {
      if (!animal.externalId) {
        return {
          localId: animal.localId,
          status: 'skipped',
          decision: `${DRY_REMOVE} ${animal.name}: no external id`,
        };
      }
      if (!dryRun) await this.removeAnimal(t, animal.externalId);
      return {
        localId: animal.localId,
        externalId: animal.externalId,
        status: 'skipped',
        decision: `${dryRun ? DRY_REMOVE : 'removed'} ${animal.name} (${animal.externalId})`,
      };
    }
    if (dryRun) {
      return {
        localId: animal.localId,
        status: 'pushed',
        decision: `${DRY_RUN} ${animal.name} as species=${species} status=${status}`,
      };
    }
    const photos = animal.photoUrls.filter((url): url is string => Boolean(url));
    const res = await fetch(`${API_BASE}/v2/pets`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        api_key: AdoptAPetAdapter.apiKey(t.credentials),
        name: animal.name,
        species,
        primary_breed: animal.breed ?? undefined,
        description: animal.description ?? undefined,
        status,
        photo_urls: photos.length > 0 ? photos : undefined,
      }),
    });
    if (!res.ok) throw new Error(`adoptapet push failed with ${res.status}`);
    const body = (await res.json()) as AdoptAPetPetResponse;
    const externalId = String(body.pet?.id ?? body.id ?? '');
    return {
      localId: animal.localId,
      externalId: externalId || undefined,
      status: 'pushed',
      decision: `pushed ${animal.name} to adoptapet as species=${species} status=${status}`,
    };
  }

  async removeAnimal(t: TenantCtx, externalId: string): Promise<void> {
    if (this.isDryRun(t)) return;
    await fetch(`${API_BASE}/v2/pets/${encodeURIComponent(externalId)}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${AdoptAPetAdapter.apiKey(t.credentials)}` },
    }).catch(() => undefined);
  }

  async fetchOne(t: TenantCtx, externalId: string): Promise<{ status: string } | null> {
    if (this.isDryRun(t)) return null;
    const res = await fetch(`${API_BASE}/v2/pets/${encodeURIComponent(externalId)}`, {
      headers: { Authorization: `Bearer ${AdoptAPetAdapter.apiKey(t.credentials)}` },
    });
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`adoptapet fetch failed with ${res.status}`);
    const body = (await res.json()) as AdoptAPetPetResponse;
    const raw = body.pet?.status ?? body.status;
    return { status: normalizeExternalStatus(raw) };
  }
}

export function normalizeExternalStatus(raw: string | undefined): string {
  switch ((raw ?? '').toLowerCase()) {
    case 'available':
      return 'available';
    case 'pending':
      return 'pending';
    default:
      return 'unavailable';
  }
}
