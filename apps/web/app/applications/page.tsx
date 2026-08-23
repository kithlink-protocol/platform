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
    <main>
      <h1>My applications</h1>
      {loading ? (
        <p className="muted">Loading…</p>
      ) : error ? (
        <p role="alert" className="error">
          {error}
        </p>
      ) : applications.length === 0 ? (
        <p className="muted">
          You have not applied to any animals yet. <Link href="/shelters">Browse shelters</Link>
        </p>
      ) : (
        <ul className="grid" style={{ listStyle: 'none' }}>
          {applications.map(application => (
            <li key={application.id}>
              <article className="card">
                <h2>{application.animalName}</h2>
                <p className="muted">{application.shelterName}</p>
                <span className="badge" data-status={application.status} data-testid="status-badge">
                  {application.status}
                </span>
              </article>
            </li>
          ))}
        </ul>
      )}
      <p>
        <Link href="/dashboard">← Back to dashboard</Link>
      </p>
    </main>
  );
}
