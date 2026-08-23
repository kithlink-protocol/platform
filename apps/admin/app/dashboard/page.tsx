'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

import { ApiError, apiFetch } from '@/lib/api';
import type {
  AnimalPublic,
  ApplicationPublic,
  AuthSession,
  Membership,
  SiteConfigResponse,
} from '@kithlink/contracts';

const OPEN_STATUSES = new Set(['draft', 'submitted', 'in_review', 'info_requested']);

function formatDay(value: string | null): string {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '—' : date.toISOString().slice(0, 10);
}

export default function DashboardPage() {
  const router = useRouter();
  const [session, setSession] = useState<AuthSession | null>(null);
  const [sessionError, setSessionError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [animals, setAnimals] = useState<AnimalPublic[] | null>(null);
  const [animalsError, setAnimalsError] = useState<string | null>(null);
  const [applications, setApplications] = useState<ApplicationPublic[] | null>(null);
  const [sitePublishedAt, setSitePublishedAt] = useState<string | null>(null);

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
    setApplications(null);
    setSitePublishedAt(null);
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
    apiFetch<{ items: ApplicationPublic[] }>(
      `/admin/v1/shelters/${encodeURIComponent(selectedId)}/applications?limit=50`,
    )
      .then((data) => {
        if (!cancelled) setApplications(data.items);
      })
      .catch(() => undefined);
    apiFetch<SiteConfigResponse>(
      `/admin/v1/shelters/${encodeURIComponent(selectedId)}/site`,
    )
      .then((data) => {
        if (!cancelled) setSitePublishedAt(data.publishedAt);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [selectedId]);

  if (sessionError) {
    return (
      <main>
        <p role="alert" className="alert alert-danger">
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

  const availableCount =
    animals?.filter((animal) => animal.status === 'available').length ?? 0;
  const openApplicationsCount =
    applications?.filter((application) => OPEN_STATUSES.has(application.status))
      .length ?? 0;

  return (
    <main>
      <header className="page-header">
        <h1 className="t-title">Dashboard</h1>
        <p className="t-meta">Signed in as {session.user.email}</p>
      </header>

      <div className="stat-row">
        <div className="card stat">
          <span className="stat-value">{availableCount}</span>
          <span className="stat-label">Animals available</span>
        </div>
        <div className="card stat">
          <span className="stat-value">{openApplicationsCount}</span>
          <span className="stat-label">Open applications</span>
        </div>
        <div className="card stat">
          <span className="stat-value">{formatDay(sitePublishedAt)}</span>
          <span className="stat-label">Site published</span>
        </div>
      </div>

      <section aria-labelledby="shelters-heading">
        <h2 id="shelters-heading" className="t-heading">
          Your shelters
        </h2>
        {session.memberships.length === 0 ? (
          <p className="muted t-lede">
            You are not a member of any shelter yet. Ask a shelter admin to add
            you.
          </p>
        ) : (
          <div className="btn-row" role="group" aria-label="Select a shelter">
            {session.memberships.map((membership) => (
              <button
                key={membership.shelterId}
                type="button"
                className={
                  membership.shelterId === selectedId
                    ? 'btn btn-primary'
                    : 'btn btn-secondary'
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
        <section aria-labelledby="animals-heading" className="section-gap">
          <h2 id="animals-heading" className="t-heading">
            Animals at {selectedShelter.shelterName}
          </h2>
          {animalsError ? (
            <p role="alert" className="alert alert-danger">
              {animalsError}
            </p>
          ) : animals === null ? (
            <p>Loading…</p>
          ) : animals.length === 0 ? (
            <p className="muted">No animals recorded yet.</p>
          ) : (
            <table className="table">
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
