'use client';

import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';

import { ApiError, apiFetch } from '@/lib/api';
import type { AuthSession, JourneyDetail } from '@kithlink/contracts';

function formatDate(value: string | null | undefined): string {
  return value ? new Date(value).toLocaleString() : '—';
}

export default function JourneyDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const journeyId = typeof params.id === 'string' ? params.id : '';
  const [session, setSession] = useState<AuthSession | null>(null);
  const [detail, setDetail] = useState<JourneyDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

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
    if (!shelterId || !journeyId) return;
    apiFetch<JourneyDetail>(
      `/admin/v1/shelters/${encodeURIComponent(shelterId)}/journeys/${journeyId}`,
    )
      .then((data) => setDetail(data))
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : 'Could not load the journey.');
      });
  }, [shelterId, journeyId]);

  useEffect(() => {
    refetch();
  }, [refetch]);

  async function resolveCase(caseId: string) {
    if (!shelterId) return;
    const resolutionNote = window.prompt('Resolution note');
    if (resolutionNote === null || resolutionNote.trim().length === 0) return;
    setPending(true);
    setError(null);
    try {
      await apiFetch(
        `/admin/v1/shelters/${encodeURIComponent(shelterId)}/journeys/cases/${caseId}/resolve`,
        { method: 'POST', body: JSON.stringify({ resolutionNote }) },
      );
      refetch();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Could not resolve the case.');
    } finally {
      setPending(false);
    }
  }

  async function logReturn() {
    if (!shelterId || !journeyId) return;
    if (!window.confirm('Log a return intake for this adoption?')) return;
    const reason = window.prompt('Reason for the return intake');
    if (reason === null || reason.trim().length === 0) return;
    setPending(true);
    setError(null);
    try {
      await apiFetch(
        `/admin/v1/shelters/${encodeURIComponent(shelterId)}/journeys/${journeyId}/return`,
        { method: 'POST', body: JSON.stringify({ reason }) },
      );
      refetch();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Could not log the return.');
    } finally {
      setPending(false);
    }
  }

  if (error && !detail) {
    return (
      <main>
        <p role="alert" className="alert alert-danger">
          {error}
        </p>
      </main>
    );
  }

  if (!detail) {
    return (
      <main>
        <p>Loading…</p>
      </main>
    );
  }

  return (
    <main>
      <header className="page-header">
        <h1 className="t-title">Journey · {detail.animalName}</h1>
        <p className="t-meta">
          Status{' '}
          <span className="badge" data-status={detail.status}>
            {detail.status}
          </span>{' '}
          · Adopter {detail.adopterEmail ?? '—'} · Started {formatDate(detail.startedAt)}
        </p>
        <p>
          <Link href="/journeys">← All journeys</Link>
        </p>
      </header>

      {error ? (
        <p role="alert" className="alert alert-danger">
          {error}
        </p>
      ) : null}

      <section aria-labelledby="timeline-heading" className="card">
        <h2 id="timeline-heading" className="t-heading">
          Touchpoints &amp; responses
        </h2>
        <ul className="timeline" data-testid="journey-timeline">
          {detail.touchpoints.map((touchpoint) => {
            const response = detail.responses.find((r) => r.dayOffset === touchpoint.dayOffset);
            return (
              <li key={`${touchpoint.dayOffset}-${response?.createdAt ?? 'none'}`}>
                <strong>Day {touchpoint.dayOffset}</strong> · {touchpoint.dayLabel}
                {' '}· sent {formatDate(touchpoint.sentAt)}
                {response ? (
                  <span className="t-meta">
                    {' '}· pet {response.petMood}/5 · owner {response.ownerMood}/5
                    {response.topics.length > 0 ? ` · ${response.topics.join(', ')}` : ''}
                    {response.note ? ` · “${response.note}”` : ''}
                    {response.hasConcern ? ' · flagged' : ''}
                  </span>
                ) : (
                  <span className="t-meta"> · no response yet</span>
                )}
              </li>
            );
          })}
        </ul>
      </section>

      <section aria-labelledby="cases-heading" className="card section-gap">
        <h2 id="cases-heading" className="t-heading">
          Cases
        </h2>
        {detail.cases.length === 0 ? (
          <div className="empty-state">No cases on this journey.</div>
        ) : (
          <ul>
            {detail.cases.map((adoptionCase) => (
              <li key={adoptionCase.id} className="case-row">
                <span className="badge" data-status={adoptionCase.status === 'open' ? 'danger' : 'ok'}>
                  {adoptionCase.kind} · {adoptionCase.status}
                </span>{' '}
                <span className="t-meta">
                  {adoptionCase.reason} · opened {formatDate(adoptionCase.openedAt)}
                  {adoptionCase.resolvedAt ? ` · resolved ${formatDate(adoptionCase.resolvedAt)}` : ''}
                  {adoptionCase.resolutionNote ? ` · ${adoptionCase.resolutionNote}` : ''}
                </span>
                {adoptionCase.status === 'open' ? (
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    data-testid="case-resolve"
                    disabled={pending}
                    onClick={() => resolveCase(adoptionCase.id)}
                  >
                    Resolve
                  </button>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </section>

      {detail.status !== 'returned' ? (
        <div className="btn-row section-gap">
          <button
            type="button"
            className="btn btn-danger"
            data-testid="return-intake"
            disabled={pending}
            onClick={logReturn}
          >
            Log return intake
          </button>
        </div>
      ) : null}
    </main>
  );
}
