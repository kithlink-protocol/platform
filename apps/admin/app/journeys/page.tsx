'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';

import { ApiError, apiFetch } from '@/lib/api';
import type { AuthSession, JourneyListResponse } from '@kithlink/contracts';

export default function JourneysPage() {
  const router = useRouter();
  const [session, setSession] = useState<AuthSession | null>(null);
  const [items, setItems] = useState<JourneyListResponse['items'] | null>(null);
  const [error, setError] = useState<string | null>(null);

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
    apiFetch<JourneyListResponse>(`/admin/v1/shelters/${encodeURIComponent(shelterId)}/journeys`)
      .then((data) => setItems(data.items))
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : 'Could not load journeys.');
      });
  }, [shelterId]);

  useEffect(() => {
    refetch();
  }, [refetch]);

  return (
    <main>
      <header className="page-header">
        <h1 className="t-title">Journeys</h1>
        <p className="t-meta">Post-adoption check-ins for your shelter.</p>
      </header>

      {error && items === null ? (
        <p role="alert" className="alert alert-danger">
          {error}
        </p>
      ) : null}

      {!items ? (
        <p>Loading…</p>
      ) : items.length === 0 ? (
        <div className="empty-state">No adoption journeys yet.</div>
      ) : (
        <table data-testid="journeys-table" className="table">
          <thead>
            <tr>
              <th scope="col">Animal</th>
              <th scope="col">Adopter email</th>
              <th scope="col">Day</th>
              <th scope="col">Status</th>
              <th scope="col">Risk</th>
            </tr>
          </thead>
          <tbody>
            {items.map((journey) => (
              <tr
                key={journey.id}
                data-testid="journeys-row"
                className="card-link"
                onClick={() => router.push(`/journeys/${journey.id}`)}
                style={{ cursor: 'pointer' }}
              >
                <td>
                  <Link href={`/journeys/${journey.id}`}>{journey.animalName}</Link>
                </td>
                <td>{journey.adopterEmail ?? '—'}</td>
                <td>
                  <span className="badge" title={journey.dayLabel}>
                    Day {journey.dayOffset}
                  </span>
                </td>
                <td>
                  <span className="badge" data-status={journey.status}>
                    {journey.status}
                  </span>
                </td>
                <td>
                  {journey.risk ? (
                    <span className="badge badge-danger" data-status="danger">
                      needs attention
                    </span>
                  ) : (
                    '—'
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </main>
  );
}
