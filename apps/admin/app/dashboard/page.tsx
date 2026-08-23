'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

import { ApiError, apiFetch } from '@/lib/api';
import type { AnimalPublic, AuthSession, Membership } from '@kithlink/contracts';

export default function DashboardPage() {
  const router = useRouter();
  const [session, setSession] = useState<AuthSession | null>(null);
  const [sessionError, setSessionError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [animals, setAnimals] = useState<AnimalPublic[] | null>(null);
  const [animalsError, setAnimalsError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    apiFetch<AuthSession>('/app/v1/auth/session')
      .then((data) => {
        if (!cancelled) {
          setSession(data);
          const first: Membership | undefined = data.memberships[0];
          if (first) setSelectedId(first.shelterId);
        }
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        if (err instanceof ApiError && err.status === 401) {
          router.replace('/');
          return;
        }
        setSessionError(
          err instanceof Error
            ? err.message
            : 'Could not load your session. Please try again.',
        );
      });
    return () => {
      cancelled = true;
    };
  }, [router]);

  useEffect(() => {
    if (!selectedId) return;
    let cancelled = false;
    setAnimals(null);
    setAnimalsError(null);
    apiFetch<{ items: AnimalPublic[] }>(
      `/admin/v1/shelters/${encodeURIComponent(selectedId)}/animals?limit=25`,
    )
      .then((data) => {
        if (!cancelled) setAnimals(data.items);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setAnimalsError(
          err instanceof Error ? err.message : 'Could not load animals.',
        );
      });
    return () => {
      cancelled = true;
    };
  }, [selectedId]);

  if (sessionError) {
    return (
      <main>
        <p role="alert" className="error">
          {sessionError}
        </p>
      </main>
    );
  }

  if (!session) {
    return (
      <main>
        <p>Loading…</p>
      </main>
    );
  }

  const selectedShelter =
    session.memberships.find(
      (membership: Membership) => membership.shelterId === selectedId,
    ) ?? null;

  return (
    <main>
      <header className="card">
        <h1>Dashboard</h1>
        <p className="muted">Signed in as {session.user.email}</p>
        <p>
          <Link href="/applications">Applications</Link>{' '}
          <Link href="/site">Site</Link>{' '}
          <Link href="/sync">Sync</Link>
        </p>
      </header>

      <section aria-labelledby="shelters-heading">
        <h2 id="shelters-heading">Your shelters</h2>
        {session.memberships.length === 0 ? (
          <p className="muted">
            You are not a member of any shelter yet. Ask a shelter admin to add
            you.
          </p>
        ) : (
          <div className="grid" role="group" aria-label="Select a shelter">
            {session.memberships.map((membership) => (
              <button
                key={membership.shelterId}
                type="button"
                className={
                  membership.shelterId === selectedId
                    ? 'button'
                    : 'button button-secondary'
                }
                aria-pressed={membership.shelterId === selectedId}
                onClick={() => setSelectedId(membership.shelterId)}
              >
                {membership.shelterName} ({membership.role})
              </button>
            ))}
          </div>
        )}
      </section>

      {selectedShelter ? (
        <section aria-labelledby="animals-heading">
          <h2 id="animals-heading">
            Animals at {selectedShelter.shelterName}
          </h2>
          {animalsError ? (
            <p role="alert" className="error">
              {animalsError}
            </p>
          ) : animals === null ? (
            <p>Loading…</p>
          ) : animals.length === 0 ? (
            <p className="muted">No animals recorded yet.</p>
          ) : (
            <table>
              <thead>
                <tr>
                  <th scope="col">Name</th>
                  <th scope="col">Species</th>
                  <th scope="col">Status</th>
                </tr>
              </thead>
              <tbody>
                {animals.map((animal) => (
                  <tr key={animal.id}>
                    <td>{animal.name}</td>
                    <td>{animal.species}</td>
                    <td>
                      <span className="badge" data-status={animal.status}>
                        {animal.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      ) : null}
    </main>
  );
}
