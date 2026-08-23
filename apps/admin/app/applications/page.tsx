'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

import { ApiError, apiFetch } from '@/lib/api';
import type { ApplicationPublic, AuthSession } from '@kithlink/contracts';

export default function ApplicationsPage() {
  const router = useRouter();
  const [session, setSession] = useState<AuthSession | null>(null);
  const [applications, setApplications] = useState<ApplicationPublic[] | null>(null);
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

  useEffect(() => {
    const shelterId = session?.memberships[0]?.shelterId;
    if (!shelterId) return;
    let cancelled = false;
    apiFetch<{ items: ApplicationPublic[] }>(
      `/admin/v1/shelters/${encodeURIComponent(shelterId)}/applications?limit=50`,
    )
      .then((data) => {
        if (!cancelled) setApplications(data.items);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setError(
          err instanceof Error ? err.message : 'Could not load applications.',
        );
      });
    return () => {
      cancelled = true;
    };
  }, [session]);

  if (error) {
    return (
      <main>
        <p role="alert" className="alert alert-danger">
          {error}
        </p>
      </main>
    );
  }

  return (
    <main>
      <header className="page-header">
        <h1 className="t-title">Applications</h1>
        <p className="t-lede">
          {session
            ? `Reviewing applications for ${session.memberships[0]?.shelterName ?? 'your shelter'}`
            : 'Loading…'}
        </p>
      </header>

      {applications === null ? (
        <section aria-labelledby="applications-heading">
          <h2 id="applications-heading" className="t-heading">
            Loading applications…
          </h2>
        </section>
      ) : applications.length === 0 ? (
        <section aria-labelledby="applications-heading">
          <div className="empty-state">
            <h2 id="applications-heading" className="t-heading">
              No applications yet.
            </h2>
          </div>
        </section>
      ) : (
        <section aria-labelledby="applications-heading">
          <h2 id="applications-heading" className="t-heading">
            Submitted applications
          </h2>
          <table className="table">
            <thead>
              <tr>
                <th scope="col">Animal</th>
                <th scope="col">Status</th>
                <th scope="col">Submitted</th>
              </tr>
            </thead>
            <tbody>
              {applications.map((application) => (
                <tr key={application.id} data-testid="application-row">
                  <td>
                    <Link href={`/applications/${application.id}`}>
                      {application.animalName}
                    </Link>
                  </td>
                  <td>
                    <span className="badge" data-status={application.status}>
                      {application.status}
                    </span>
                  </td>
                  <td className="mono t-meta">
                    {application.submittedAt
                      ? new Date(application.submittedAt).toLocaleString()
                      : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
    </main>
  );
}
