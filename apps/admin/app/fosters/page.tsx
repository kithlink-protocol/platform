'use client';

import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState, type FormEvent } from 'react';

import { ApiError, apiFetch } from '@/lib/api';
import type {
  AnimalPublic,
  AuthSession,
  FosterHome,
  FosterPlacement,
} from '@kithlink/contracts';

function formatDay(value: string): string {
  return new Date(value).toLocaleDateString();
}

export default function FostersPage() {
  const router = useRouter();
  const [session, setSession] = useState<AuthSession | null>(null);
  const [homes, setHomes] = useState<FosterHome[] | null>(null);
  const [placements, setPlacements] = useState<FosterPlacement[]>([]);
  const [animals, setAnimals] = useState<AnimalPublic[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const [homeName, setHomeName] = useState('');
  const [homeEmail, setHomeEmail] = useState('');
  const [homeCapacity, setHomeCapacity] = useState('1');
  const [placeHomeId, setPlaceHomeId] = useState('');
  const [placeAnimalId, setPlaceAnimalId] = useState('');

  useEffect(() => {
    let cancelled = false;
    apiFetch<AuthSession>('/app/v1/auth/session')
      .then((data) => {
        if (!cancelled) setSession(data);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        if (err instanceof ApiError && err.status === 401) {
          router.replace('/');
          return;
        }
        setError(err instanceof Error ? err.message : 'Could not load your session.');
      });
    return () => {
      cancelled = true;
    };
  }, [router]);

  const shelterId = session?.memberships[0]?.shelterId ?? null;

  const refetch = useCallback(() => {
    if (!shelterId) return;
    apiFetch<{ items: FosterHome[] }>(
      `/admin/v1/shelters/${encodeURIComponent(shelterId)}/fosters/homes`,
    )
      .then((data) => setHomes(data.items))
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : 'Could not load foster homes.');
      });
    apiFetch<{ items: FosterPlacement[] }>(
      `/admin/v1/shelters/${encodeURIComponent(shelterId)}/fosters/placements?status=active`,
    )
      .then((data) => setPlacements(data.items))
      .catch(() => undefined);
    apiFetch<{ items: AnimalPublic[] }>(
      `/admin/v1/shelters/${encodeURIComponent(shelterId)}/animals?limit=50`,
    )
      .then((data) => setAnimals(data.items))
      .catch(() => undefined);
  }, [shelterId]);

  useEffect(() => {
    refetch();
  }, [refetch]);

  const addHome = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!shelterId) return;
    setFormError(null);
    setPending(true);
    try {
      await apiFetch(`/admin/v1/shelters/${encodeURIComponent(shelterId)}/fosters/homes`, {
        method: 'POST',
        body: JSON.stringify({
          homeName: homeName,
          primaryContactEmail: homeEmail,
          capacity: Number(homeCapacity),
        }),
      });
      setHomeName('');
      setHomeEmail('');
      setHomeCapacity('1');
      refetch();
    } catch (err: unknown) {
      setFormError(err instanceof Error ? err.message : 'Could not add foster home.');
    } finally {
      setPending(false);
    }
  };

  const toggleActive = async (home: FosterHome) => {
    if (!shelterId) return;
    setPending(true);
    try {
      await apiFetch(
        `/admin/v1/shelters/${encodeURIComponent(shelterId)}/fosters/homes/${encodeURIComponent(home.id)}`,
        {
          method: 'PATCH',
          body: JSON.stringify({
            homeName: home.homeName,
            primaryContactEmail: home.primaryContactEmail,
            capacity: home.capacity,
            skills: home.skills,
            active: !home.active,
          }),
        },
      );
      refetch();
    } catch (err: unknown) {
      setFormError(err instanceof Error ? err.message : 'Could not update foster home.');
    } finally {
      setPending(false);
    }
  };

  const addPlacement = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!shelterId || !placeHomeId || !placeAnimalId) return;
    setFormError(null);
    setPending(true);
    try {
      await apiFetch(
        `/admin/v1/shelters/${encodeURIComponent(shelterId)}/fosters/placements`,
        {
          method: 'POST',
          body: JSON.stringify({ homeId: placeHomeId, animalId: placeAnimalId }),
        },
      );
      setPlaceAnimalId('');
      refetch();
    } catch (err: unknown) {
      setFormError(err instanceof Error ? err.message : 'Could not create placement.');
    } finally {
      setPending(false);
    }
  };

  const closePlacement = async (placementId: string) => {
    if (!shelterId) return;
    setPending(true);
    try {
      await apiFetch(
        `/admin/v1/shelters/${encodeURIComponent(shelterId)}/fosters/placements/${encodeURIComponent(placementId)}/close`,
        { method: 'POST' },
      );
      refetch();
    } catch (err: unknown) {
      setFormError(err instanceof Error ? err.message : 'Could not close placement.');
    } finally {
      setPending(false);
    }
  };

  const homeNameFor = (homeId: string): string =>
    homes?.find(h => h.id === homeId)?.homeName ?? homeId;

  return (
    <main>
      <header className="page-header">
        <h1 className="t-title">Fosters</h1>
        <p className="t-meta">Foster homes and placements for your shelter.</p>
      </header>

      {error && homes === null ? (
        <p role="alert" className="alert alert-danger">
          {error}
        </p>
      ) : null}
      {formError ? (
        <p role="alert" className="alert alert-danger">
          {formError}
        </p>
      ) : null}

      <section aria-labelledby="homes-heading" className="card section-gap">
        <h2 id="homes-heading" className="t-heading">
          Foster homes
        </h2>
        {!homes ? (
          <p>Loading…</p>
        ) : homes.length === 0 ? (
          <p className="muted">No foster homes yet.</p>
        ) : (
          <table data-testid="foster-homes-table" className="table">
            <thead>
              <tr>
                <th scope="col">Name</th>
                <th scope="col">Contact email</th>
                <th scope="col">Capacity</th>
                <th scope="col">Active placements</th>
                <th scope="col">Active</th>
              </tr>
            </thead>
            <tbody>
              {homes.map(home => (
                <tr key={home.id} data-testid="foster-homes-row">
                  <td>{home.homeName}</td>
                  <td>{home.primaryContactEmail}</td>
                  <td>{home.capacity}</td>
                  <td>{home.currentPlacements}</td>
                  <td>
                    <button
                      type="button"
                      className={home.active ? 'btn btn-primary' : 'btn btn-secondary'}
                      aria-pressed={home.active}
                      disabled={pending}
                      onClick={() => void toggleActive(home)}
                    >
                      {home.active ? 'Active' : 'Inactive'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        <form onSubmit={event => void addHome(event)} className="section-gap">
          <div className="form-row">
            <label htmlFor="foster-name">Home name</label>
            <input
              id="foster-name"
              data-testid="foster-name"
              value={homeName}
              onChange={event => setHomeName(event.target.value)}
              required
              minLength={2}
              maxLength={120}
            />
          </div>
          <div className="form-row">
            <label htmlFor="foster-email">Primary contact email</label>
            <input
              id="foster-email"
              data-testid="foster-email"
              type="email"
              value={homeEmail}
              onChange={event => setHomeEmail(event.target.value)}
              required
            />
          </div>
          <div className="form-row">
            <label htmlFor="foster-capacity">Capacity (1–20)</label>
            <input
              id="foster-capacity"
              data-testid="foster-capacity"
              type="number"
              min={1}
              max={20}
              value={homeCapacity}
              onChange={event => setHomeCapacity(event.target.value)}
              required
            />
          </div>
          <button className="btn btn-primary" type="submit" disabled={pending}>
            {pending ? 'Saving…' : 'Add foster home'}
          </button>
        </form>
      </section>

      <section aria-labelledby="placements-heading" className="card section-gap">
        <h2 id="placements-heading" className="t-heading">
          Placements
        </h2>
        <form onSubmit={event => void addPlacement(event)} className="btn-row">
          <select
            data-testid="place-home"
            value={placeHomeId}
            onChange={event => setPlaceHomeId(event.target.value)}
            aria-label="Foster home"
            required
          >
            <option value="">Choose a foster home…</option>
            {(homes ?? [])
              .filter(home => home.active)
              .map(home => (
                <option key={home.id} value={home.id}>
                  {home.homeName}
                </option>
              ))}
          </select>
          <select
            data-testid="place-animal"
            value={placeAnimalId}
            onChange={event => setPlaceAnimalId(event.target.value)}
            aria-label="Animal"
            required
          >
            <option value="">Choose an animal…</option>
            {animals.map(animal => (
              <option key={animal.id} value={animal.id}>
                {animal.name} ({animal.status})
              </option>
            ))}
          </select>
          <button
            className="btn btn-primary"
            type="submit"
            data-testid="place-add"
            disabled={pending || !placeHomeId || !placeAnimalId}
          >
            Place
          </button>
        </form>

        {placements.length === 0 ? (
          <p className="muted section-gap">No active placements.</p>
        ) : (
          <table data-testid="foster-placements-table" className="table section-gap">
            <thead>
              <tr>
                <th scope="col">Animal</th>
                <th scope="col">Home</th>
                <th scope="col">Next check-in</th>
                <th scope="col">Status</th>
                <th scope="col" />
              </tr>
            </thead>
            <tbody>
              {placements.map(placement => (
                <tr key={placement.id} data-testid="foster-placements-row">
                  <td>{placement.animalName}</td>
                  <td>{homeNameFor(placement.homeId)}</td>
                  <td>{formatDay(placement.nextCheckIn)}</td>
                  <td>
                    <span className="badge" data-status={placement.status}>
                      {placement.status}
                    </span>
                  </td>
                  <td>
                    <button
                      type="button"
                      className="btn btn-secondary"
                      data-testid="close-placement"
                      disabled={pending}
                      onClick={() => void closePlacement(placement.id)}
                    >
                      Close
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </main>
  );
}
