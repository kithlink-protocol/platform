'use client';

import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';

import { ApiError, apiFetch } from '@/lib/api';
import type {
  ArtifactWithVerifications,
  AuthSession,
  StaffApplicationDetail,
} from '@kithlink/contracts';

function formatDate(value: string | null | undefined): string {
  return value ? new Date(value).toLocaleString() : '—';
}

export default function ApplicationDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const applicationId = typeof params.id === 'string' ? params.id : '';
  const [session, setSession] = useState<AuthSession | null>(null);
  const [detail, setDetail] = useState<StaffApplicationDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<string | null>(null);

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
  const shelterName = session?.memberships[0]?.shelterName ?? '';

  const refetch = useCallback(() => {
    if (!shelterId || !applicationId) return;
    apiFetch<StaffApplicationDetail>(
      `/admin/v1/shelters/${encodeURIComponent(shelterId)}/applications/${applicationId}`,
    )
      .then((data) => setDetail(data))
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : 'Could not load the application.');
      });
  }, [shelterId, applicationId]);

  useEffect(() => {
    refetch();
  }, [refetch]);

  async function recordVerification(
    artifact: ArtifactWithVerifications,
    method: string,
    outcome: string,
    withNotes: boolean,
  ) {
    if (!shelterId) return;
    let notes: string | null = null;
    if (withNotes) {
      notes = window.prompt('Verification notes (redacted)');
      if (notes === null) return;
    }
    setPending(artifact.id + method + outcome);
    setError(null);
    try {
      await apiFetch(
        `/admin/v1/shelters/${encodeURIComponent(shelterId)}/artifacts/${artifact.id}/verifications`,
        {
          method: 'POST',
          body: JSON.stringify({
            method,
            outcome,
            ...(notes ? { notesRedacted: notes } : {}),
          }),
        },
      );
      refetch();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Verification failed. Please try again.');
    } finally {
      setPending(null);
    }
  }

  function hasOwnConfirmedVerification(artifact: ArtifactWithVerifications): boolean {
    return artifact.verifications.some(
      (v) => v.outcome === 'confirmed' && v.shelterName === shelterName,
    );
  }

  if (error && !detail) {
    return (
      <main>
        <p role="alert" className="error">
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
      <header className="card">
        <h1>Application · {detail.application.animalName}</h1>
        <p className="muted">
          Status{' '}
          <span className="badge" data-status={detail.application.status}>
            {detail.application.status}
          </span>{' '}
          · Submitted {formatDate(detail.application.submittedAt)}
        </p>
        <p>
          <Link href="/applications">← All applications</Link>
        </p>
      </header>

      {error ? (
        <p role="alert" className="error">
          {error}
        </p>
      ) : null}

      <section aria-labelledby="applicant-heading" className="card">
        <h2 id="applicant-heading">Applicant</h2>
        <p>Legal name: {detail.applicant.legalName}</p>
        {detail.applicant.displayName ? <p>Display name: {detail.applicant.displayName}</p> : null}
        {detail.applicant.phone ? <p>Phone: {detail.applicant.phone}</p> : null}
        <p>
          Consent: {detail.consent.id ? `${detail.consent.scope} (${detail.consent.status})` : 'none'}
        </p>
      </section>

      <section aria-labelledby="answers-heading" className="card">
        <h2 id="answers-heading">Questionnaire</h2>
        <pre data-testid="answers-json">{JSON.stringify(detail.application.answers, null, 2)}</pre>
      </section>

      <section aria-labelledby="artifacts-heading">
        <h2 id="artifacts-heading">Artifacts</h2>
        {detail.artifacts.length === 0 ? (
          <p className="muted">No artifacts uploaded.</p>
        ) : (
          detail.artifacts.map((artifact) => (
            <article key={artifact.id} className="card" data-testid="artifact-card">
              <h3>
                {artifact.type}{' '}
                <span className="badge" data-testid="artifact-state" data-status={artifact.state}>
                  {artifact.state}
                </span>{' '}
                {artifact.networkVerified ? (
                  <span className="badge" data-testid="network-badge">
                    network verified
                  </span>
                ) : null}
              </h3>
              {artifact.extracted ? (
                <pre>{JSON.stringify(artifact.extracted, null, 2)}</pre>
              ) : null}
              <div className="grid">
                <button
                  type="button"
                  className="button"
                  disabled={pending !== null}
                  onClick={() =>
                    recordVerification(artifact, 'landlord_call', 'confirmed', true)
                  }
                >
                  Confirm landlord call
                </button>
                <button
                  type="button"
                  className="button button-secondary"
                  disabled={pending !== null}
                  onClick={() =>
                    recordVerification(artifact, 'landlord_call', 'discrepancy', true)
                  }
                >
                  Mark discrepancy
                </button>
                {artifact.networkVerified && !hasOwnConfirmedVerification(artifact) ? (
                  <button
                    type="button"
                    className="button button-secondary"
                    disabled={pending !== null}
                    onClick={() =>
                      recordVerification(artifact, 'prior_verification', 'confirmed', false)
                    }
                  >
                    Accept prior verification
                  </button>
                ) : null}
              </div>
              {artifact.verifications.length > 0 ? (
                <details>
                  <summary>
                    Verifications ({artifact.verifications.length})
                  </summary>
                  <ul data-testid="verification-timeline">
                    {artifact.verifications.map((v, index) => (
                      <li key={index}>
                        {v.shelterName} · {v.method} ·{' '}
                        <span className="badge" data-status={v.outcome}>
                          {v.outcome}
                        </span>{' '}
                        · {formatDate(v.verifiedAt)}
                        {v.validUntil ? ` · valid until ${formatDate(v.validUntil)}` : ''}
                      </li>
                    ))}
                  </ul>
                </details>
              ) : null}
            </article>
          ))
        )}
      </section>
    </main>
  );
}
