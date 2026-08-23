export type {
  AdapterCredentials,
  AnimalPayload,
  PushResult,
  SyncAdapter,
  SyncProviderName,
  TenantCtx,
} from './types';

export { AdoptAPetAdapter, mapSpecies as mapAdoptAPetSpecies, mapStatus as mapAdoptAPetStatus, normalizeExternalStatus as normalizeAdoptAPetStatus } from './adoptapet';
export { PetfinderAdapter, mapSpecies, mapStatus, normalizeExternalStatus } from './petfinder';

import { AdoptAPetAdapter } from './adoptapet';
import { PetfinderAdapter } from './petfinder';
import type { SyncAdapter, SyncProviderName } from './types';

export function getAdapter(provider: SyncProviderName): SyncAdapter {
  switch (provider) {
    case 'adoptapet':
      return new AdoptAPetAdapter();
    case 'petfinder':
      return new PetfinderAdapter();
  }
}
