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
        <h1 className="t-title">Application · {detail.application.animalName}</h1>
        <p className="t-meta">
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
        <p role="alert" className="alert alert-danger">
          {error}
        </p>
      ) : null}

      <div className="detail-grid">
        <div className="detail-main">
          <section aria-labelledby="applicant-heading" className="card">
            <h2 id="applicant-heading" className="t-heading">
              Applicant
            </h2>
            <p>Legal name: {detail.applicant.legalName}</p>
            {detail.applicant.displayName ? (
              <p>Display name: {detail.applicant.displayName}</p>
            ) : null}
            {detail.applicant.phone ? <p>Phone: {detail.applicant.phone}</p> : null}
          </section>

          <section aria-labelledby="answers-heading" className="card section-gap">
            <h2 id="answers-heading" className="t-heading">
              Questionnaire
            </h2>
            <pre data-testid="answers-json" className="answers-pre">
              {JSON.stringify(detail.application.answers, null, 2)}
            </pre>
          </section>

          <section aria-labelledby="artifacts-heading" className="section-gap">
            <h2 id="artifacts-heading" className="t-heading">
              Artifacts
            </h2>
            {detail.artifacts.length === 0 ? (
              <div className="empty-state">No artifacts uploaded.</div>
            ) : (
              detail.artifacts.map((artifact) => (
                <article
                  key={artifact.id}
                  className="card section-gap"
                  data-testid="artifact-card"
                >
                  <h3 className="t-subheading">
                    {artifact.type}{' '}
                    <span
                      className="badge"
                      data-testid="artifact-state"
                      data-status={artifact.state}
                    >
                      {artifact.state}
                    </span>{' '}
                    {artifact.networkVerified ? (
                      <span
                        className="badge"
                        data-testid="network-badge"
                        data-status="active"
                      >
                        network verified
                      </span>
                    ) : null}
                  </h3>
                  {artifact.extracted ? (
                    <pre className="answers-pre">
                      {JSON.stringify(artifact.extracted, null, 2)}
                    </pre>
                  ) : null}
                  <div className="btn-row">
                    <button
                      type="button"
                      className="btn btn-primary"
                      disabled={pending !== null}
                      onClick={() =>
                        recordVerification(artifact, 'landlord_call', 'confirmed', true)
                      }
                    >
                      Confirm landlord call
                    </button>
                    <button
                      type="button"
                      className="btn btn-danger"
                      disabled={pending !== null}
                      onClick={() =>
                        recordVerification(artifact, 'landlord_call', 'discrepancy', true)
                      }
                    >
                      Mark discrepancy
                    </button>
                    {artifact.networkVerified &&
                    !hasOwnConfirmedVerification(artifact) ? (
                      <button
                        type="button"
                        className="btn btn-secondary"
                        disabled={pending !== null}
                        onClick={() =>
                          recordVerification(
                            artifact,
                            'prior_verification',
                            'confirmed',
                            false,
                          )
                        }
                      >
                        Accept prior verification
                      </button>
                    ) : null}
                  </div>
                  {artifact.verifications.length > 0 ? (
                    <details>
                      <summary className="t-label">
                        Verifications ({artifact.verifications.length})
                      </summary>
                      <ul
                        className="timeline"
                        data-testid="verification-timeline"
                      >
                        {artifact.verifications.map((v, index) => (
                          <li key={index}>
                            <span className="t-meta">
                              {v.shelterName} · {v.method} ·{' '}
                              <span className="badge" data-status={v.outcome}>
                                {v.outcome}
                              </span>{' '}
                              · {formatDate(v.verifiedAt)}
                              {v.validUntil
                                ? ` · valid until ${formatDate(v.validUntil)}`
                                : ''}
                            </span>
                          </li>
                        ))}
                      </ul>
                    </details>
                  ) : null}
                </article>
              ))
            )}
          </section>
        </div>

        <aside className="card detail-aside">
          <h2 className="t-heading">Summary</h2>
          <dl>
            <dt className="t-subheading">Consent</dt>
            <dd className="t-meta">
              {detail.consent.id
                ? `${detail.consent.scope} (${detail.consent.status})`
                : 'none'}
            </dd>
            <dt className="t-subheading">Shelter</dt>
            <dd className="t-meta">{shelterName || '—'}</dd>
          </dl>
        </aside>
      </div>
    </main>
  );
}
