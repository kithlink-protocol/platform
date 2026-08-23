'use client';

import { useEffect, useState } from 'react';

import type { FavoritesResponse } from '@kithlink/contracts';

import { apiFetch, ClientApiError } from '@/lib/client-api';

// Module-level caches: one session probe + one favorites fetch per page load,
// no matter how many heart toggles are rendered.
let sessionPromise: Promise<boolean> | null = null;
let favoritesPromise: Promise<Set<string>> | null = null;

function loadSignedIn(): Promise<boolean> {
  sessionPromise ??= apiFetch('/app/v1/auth/session')
    .then(() => true)
    .catch(() => false);
  return sessionPromise;
}

function loadFavoriteIds(): Promise<Set<string>> {
  favoritesPromise ??= apiFetch<FavoritesResponse>('/app/v1/me/favorites')
    .then(res => new Set(res.items.map(item => item.animalId)))
    .catch(() => new Set<string>());
  return favoritesPromise;
}

interface FavoriteToggleProps {
  animalId: string;
  name?: string;
}

/** Heart toggle, visible only when a session exists; optimistic with revert on failure. */
export function FavoriteToggle({ animalId, name }: FavoriteToggleProps) {
  const [visible, setVisible] = useState(false);
  const [active, setActive] = useState(false);

  useEffect(() => {
    let mounted = true;
    void loadSignedIn().then(signedIn => {
      if (!mounted) return;
      if (!signedIn) return;
      setVisible(true);
      void loadFavoriteIds().then(ids => {
        if (mounted) setActive(ids.has(animalId));
      });
    });
    return () => {
      mounted = false;
    };
  }, [animalId]);

  if (!visible) return null;

  async function toggle() {
    const next = !active;
    setActive(next);
    try {
      await apiFetch(`/app/v1/me/favorites/${encodeURIComponent(animalId)}`, {
        method: next ? 'PUT' : 'DELETE',
      });
    } catch (error) {
      if (error instanceof ClientApiError && error.status === 401) {
        setVisible(false);
        return;
      }
      setActive(!next);
    }
  }

  return (
    <button
      type="button"
      className="fav-toggle"
      data-testid="fav-toggle"
      aria-pressed={active}
      aria-label={active ? `Remove ${name ?? 'pet'} from favorites` : `Add ${name ?? 'pet'} to favorites`}
      onClick={() => void toggle()}
    >
      {active ? '♥' : '♡'}
    </button>
  );
}
