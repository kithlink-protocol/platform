'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';

import type { ApplicationPublic } from '@kithlink/contracts';
import { apiFetch, ClientApiError } from '@/lib/client-api';

export default function ApplicationsPage() {
  const [applications, setApplications] = useState<ApplicationPublic[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    apiFetch<{ items: ApplicationPublic[] }>('/app/v1/me/applications?limit=100')
      .then(page => {
        if (!active) return;
        setApplications(page.items);
        setLoading(false);
      })
      .catch((err: unknown) => {
        if (!active) return;
        setError(
          err instanceof ClientApiError
            ? err.message
            : 'Something went wrong while loading your applications.'
        );
        setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  return (
    <main id="main-content" className="container prose">
      <h1 className="t-title">My applications</h1>
      {loading ? (
        <p className="muted">Loading…</p>
      ) : error ? (
        <p role="alert" className="alert alert-danger">
          {error}
        </p>
      ) : applications.length === 0 ? (
        <div className="empty-state">
          You have not applied to any animals yet.{' '}
          <Link href="/shelters">Browse shelters</Link>
        </div>
      ) : (
        <ul className="grid-cards section-gap">
          {applications.map(application => (
            <li key={application.id}>
              <article className="card">
                <h2 className="card-title">{application.animalName}</h2>
                <p className="t-meta">{application.shelterName}</p>
                <p>
                  <span
                    className="badge"
                    data-status={application.status}
                    data-testid="status-badge"
                  >
                    {application.status}
                  </span>
                </p>
              </article>
            </li>
          ))}
        </ul>
      )}
      <p className="section-gap">
        <Link href="/dashboard">← Back to dashboard</Link>
      </p>
    </main>
  );
}
