'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';

import type { Favorite } from '@kithlink/contracts';

import { apiFetch, ClientApiError } from '@/lib/client-api';

type FavoritesState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; items: Favorite[] };

type Suggestion = { id: string; name: string; status: string };

async function fetchSuggestions(animalId: string): Promise<Suggestion[]> {
  const detail = await apiFetch<{ species: string }>(
    `/public/v1/animals/${encodeURIComponent(animalId)}`,
  );
  const res = await apiFetch<{
    items: Array<{ id: string; name: string; species: string; status: string }>;
  }>(`/public/v1/animals?species=${encodeURIComponent(detail.species)}&limit=24`);
  return res.items
    .filter(
      (item) =>
        item.id !== animalId && item.species === detail.species && item.status === 'available',
    )
    .slice(0, 3)
    .map((item) => ({ id: item.id, name: item.name, status: item.status }));
}

export default function FavoritesPage() {
  const [state, setState] = useState<FavoritesState>({ status: 'loading' });
  const [suggestions, setSuggestions] = useState<Record<string, Suggestion[]>>({});

  const reload = useCallback(() => {
    setState({ status: 'loading' });
    apiFetch<{ items: Favorite[] }>('/app/v1/me/favorites')
      .then((res) => {
        setState({ status: 'ready', items: res.items });
        const adopted = res.items.filter((item) => item.animalStatus !== 'available');
        for (const item of adopted) {
          fetchSuggestions(item.animalId)
            .then((friends) =>
              setSuggestions((prev) => ({ ...prev, [item.animalId]: friends })),
            )
            .catch(() => undefined);
        }
      })
      .catch((error: unknown) => {
        setState({
          status: 'error',
          message:
            error instanceof ClientApiError && error.status === 401
              ? 'Sign in to keep a list of favorite pets.'
              : 'Could not load your favorites. Please try again later.',
        });
      });
  }, []);

  useEffect(reload, [reload]);

  async function remove(animalId: string) {
    if (state.status !== 'ready') return;
    const previous = state.items;
    setState({ status: 'ready', items: previous.filter(item => item.animalId !== animalId) });
    try {
      await apiFetch(`/app/v1/me/favorites/${encodeURIComponent(animalId)}`, {
        method: 'DELETE',
      });
    } catch {
      setState({ status: 'ready', items: previous });
    }
  }

  return (
    <main id="main-content" className="container">
      <header className="section-gap">
        <h1 className="t-title">Favorites</h1>
        <p className="t-lede">Pets you saved while browsing.</p>
      </header>

      {state.status === 'loading' ? (
        <p className="section-gap t-meta">Loading…</p>
      ) : state.status === 'error' ? (
        <p role="alert" className="alert alert-danger section-gap">
          {state.message}
        </p>
      ) : state.items.length === 0 ? (
        <div className="empty-state section-gap" data-testid="favorites-empty">
          <p>No favorites yet.</p>
          <p>
            <Link href="/animals" className="btn btn-primary btn-sm">
              Browse pets
            </Link>
          </p>
        </div>
      ) : (
        <ul className="grid-cards section-gap">
          {state.items.map(item => (
            <li key={item.id}>
              <article className="card" data-testid="favorite-card">
                <h2 className="card-title">
                  <Link href={`/animals/${item.animalId}`}>{item.animalName}</Link>
                </h2>
                <p className="t-meta">{item.shelterName}</p>
                <p>
                  <span className="badge" data-status={item.animalStatus}>
                    {item.animalStatus}
                  </span>
                </p>
                <p className="t-meta">Saved {new Date(item.addedAt).toISOString().slice(0, 10)}</p>
                {item.animalStatus !== 'available' ? (
                  <div data-testid="favorite-adopted-note">
                    <p>
                      {item.animalName} found their forever home 💛 Here are some friends who are
                      still looking…
                    </p>
                    {(suggestions[item.animalId] ?? []).length > 0 ? (
                      <ul>
                        {(suggestions[item.animalId] ?? []).map((friend) => (
                          <li key={friend.id}>
                            <Link href={`/animals/${friend.id}`}>{friend.name}</Link>
                          </li>
                        ))}
                      </ul>
                    ) : null}
                  </div>
                ) : null}
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  onClick={() => void remove(item.animalId)}
                >
                  Remove
                </button>
              </article>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
