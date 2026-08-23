'use client';

import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';

import type { ApplicationCreatedResponse } from '@kithlink/contracts';
import { apiFetch, ClientApiError } from '@/lib/client-api';

export default function ApplyPage() {
  const params = useParams<{ animalId: string }>();
  const router = useRouter();
  const animalId = typeof params.animalId === 'string' ? params.animalId : '';
  const [whyThisPet, setWhyThisPet] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    const answers = whyThisPet.trim() ? { why_this_pet: whyThisPet.trim() } : {};
    try {
      await apiFetch<ApplicationCreatedResponse>('/app/v1/applications', {
        method: 'POST',
        body: JSON.stringify({ animalId, answers }),
      });
      setSubmitted(true);
    } catch (err) {
      if (err instanceof ClientApiError && err.status === 400 && /profile/i.test(err.message)) {
        router.replace(`/profile?next=/apply/${animalId}`);
        return;
      }
      setError(
        err instanceof ClientApiError
          ? err.message
          : 'Something went wrong while submitting your application.'
      );
      setSubmitting(false);
    }
  }

  return (
    <main id="main-content" className="container prose">
      <h1 className="t-title">Apply for this pet</h1>
      {submitted ? (
        <>
          <p className="alert alert-ok" role="status" data-testid="success-msg">
            Application submitted.
          </p>
          <p>
            <Link href="/applications">View my applications</Link>
          </p>
        </>
      ) : (
        <>
          <p className="t-lede">Your reusable profile is attached automatically.</p>
          <form onSubmit={onSubmit}>
            <div className="form-row">
              <label htmlFor="why_this_pet">Why this pet?</label>
              <textarea
                id="why_this_pet"
                name="why_this_pet"
                rows={5}
                className="input"
                value={whyThisPet}
                onChange={event => setWhyThisPet(event.target.value)}
              />
            </div>
            {error ? (
              <p role="alert" className="alert alert-danger">
                {error}
              </p>
            ) : null}
            <button className="btn btn-primary" type="submit" disabled={submitting}>
              {submitting ? 'Submitting…' : 'Submit application'}
            </button>
          </form>
        </>
      )}
    </main>
  );
}
