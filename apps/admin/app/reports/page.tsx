'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

import { ApiError, apiFetch } from '@/lib/api';
import type { AuthSession, Membership } from '@kithlink/contracts';

const API_URL = '/api';

const REPORTS = [
  {
    key: 'outcomes',
    title: 'Outcomes',
    description:
      'Adoption, denial and return counts with average hours to decision for the selected range.',
  },
  {
    key: 'length-of-stay',
    title: 'Length of stay',
    description: 'Per-animal days from application submission to adoption decision.',
  },
  {
    key: 'checkins',
    title: 'Post-adoption check-ins',
    description: 'Journey check-in responses with moods, concerns and topics.',
  },
] as const;

type ReportKey = (typeof REPORTS)[number]['key'];

function isoDay(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

export default function ReportsPage() {
  const router = useRouter();
  const [session, setSession] = useState<AuthSession | null>(null);
  const [sessionError, setSessionError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const now = Date.now();
  const [from, setFrom] = useState(() => isoDay(now - 365 * 24 * 60 * 60 * 1000));
  const [to, setTo] = useState(() => isoDay(now));
  const [error, setError] = useState<string | null>(null);
  const [busyKey, setBusyKey] = useState<ReportKey | null>(null);

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

  const download = async (report: ReportKey): Promise<void> => {
    if (!selectedId) return;
    setError(null);
    setBusyKey(report);
    try {
      const params = new URLSearchParams();
      if (from) params.set('from', from);
      if (to) params.set('to', to);
      const res = await fetch(
        `${API_URL}/admin/v1/shelters/${encodeURIComponent(selectedId)}/reports/${report}.csv?${params.toString()}`,
        { credentials: 'include' },
      );
      if (res.status === 403) {
        setError('You do not have permission to export this report.');
        return;
      }
      if (!res.ok) {
        setError(`Download failed (HTTP ${res.status}). Please try again later.`);
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `${report}-${to.replace(/-/g, '')}.csv`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
    } catch {
      setError('Could not reach the Kithlink API. Please try again later.');
    } finally {
      setBusyKey(null);
    }
  };

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

  return (
    <main>
      <header className="page-header">
        <h1 className="t-title">Reports</h1>
        <p className="t-meta">Export CSV reports for your shelter.</p>
      </header>

      <section aria-labelledby="shelters-heading" className="section-gap">
        <h2 id="shelters-heading" className="t-heading">
          Shelter
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

      <div className="stat-row section-gap">
        {REPORTS.map((report) => (
          <div className="card stat" key={report.key}>
            <h2 className="t-heading">{report.title}</h2>
            <p className="muted t-lede">{report.description}</p>
            <label htmlFor={`report-from-${report.key}`}>From</label>
            <input
              id={`report-from-${report.key}`}
              data-testid="report-from"
              type="date"
              value={from}
              onChange={(event) => setFrom(event.target.value)}
            />
            <label htmlFor={`report-to-${report.key}`}>To</label>
            <input
              id={`report-to-${report.key}`}
              data-testid="report-to"
              type="date"
              value={to}
              onChange={(event) => setTo(event.target.value)}
            />
            <button
              type="button"
              className="btn btn-primary"
              data-testid={`report-download-${report.key}`}
              disabled={!selectedId || busyKey !== null}
              onClick={() => void download(report.key)}
            >
              Download CSV
            </button>
          </div>
        ))}
      </div>

      {error ? (
        <p role="alert" className="alert alert-danger">
          {error}
        </p>
      ) : null}
    </main>
  );
}
