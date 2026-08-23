'use client';

import Link from 'next/link';
import { useState, type FormEvent } from 'react';

import { apiFetch, ClientApiError } from '@/lib/client-api';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await apiFetch('/app/v1/auth/forgot-password', {
        method: 'POST',
        body: JSON.stringify({ email }),
      });
      setSent(true);
    } catch (err) {
      setError(
        err instanceof ClientApiError
          ? err.message
          : 'Something went wrong. Please try again later.'
      );
      setSubmitting(false);
    }
  }

  return (
    <main id="main-content" className="container prose">
      <h1 className="t-title">Forgot your password?</h1>
      {sent ? (
        <>
          <p role="alert" className="alert alert-ok">
            If that email exists we sent a link.
          </p>
          <p className="section-gap">
            <Link href="/login">Back to log in</Link>
          </p>
        </>
      ) : (
        <form onSubmit={onSubmit}>
          <div className="form-row">
            <label htmlFor="email">Email</label>
            <input
              id="email"
              name="email"
              type="email"
              className="input"
              autoComplete="email"
              required
              value={email}
              onChange={event => setEmail(event.target.value)}
            />
          </div>
          {error ? (
            <p role="alert" className="alert alert-danger">
              {error}
            </p>
          ) : null}
          <button className="btn btn-primary" type="submit" disabled={submitting}>
            {submitting ? 'Sending…' : 'Send reset link'}
          </button>
        </form>
      )}
      {!sent ? (
        <p className="section-gap">
          <Link href="/login">Back to log in</Link>
        </p>
      ) : null}
    </main>
  );
}
