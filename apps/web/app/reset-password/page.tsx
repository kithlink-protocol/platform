'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Suspense, useState, type FormEvent } from 'react';

import { apiFetch, ClientApiError } from '@/lib/client-api';

function ResetPasswordForm() {
  const searchParams = useSearchParams();
  const token = searchParams.get('token');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (password !== confirm) {
      setError('Passwords do not match.');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await apiFetch('/app/v1/auth/reset-password', {
        method: 'POST',
        body: JSON.stringify({ token, password }),
      });
      setDone(true);
    } catch (err) {
      setError(
        err instanceof ClientApiError
          ? err.message
          : 'Something went wrong. Please try again later.'
      );
      setSubmitting(false);
    }
  }

  if (!token) {
    return (
      <>
        <p role="alert" className="alert alert-danger">
          This reset link is missing its token. Request a new one below.
        </p>
        <p className="section-gap">
          <Link href="/forgot-password">Request a new link</Link>
        </p>
      </>
    );
  }

  if (done) {
    return (
      <>
        <p role="alert" className="alert alert-ok">
          Your password has been updated. Log in with your new password.
        </p>
        <p className="section-gap">
          <Link href="/login">Go to log in</Link>
        </p>
      </>
    );
  }

  return (
    <form onSubmit={onSubmit}>
      <div className="form-row">
        <label htmlFor="password">New password</label>
        <input
          id="password"
          name="password"
          type="password"
          className="input"
          autoComplete="new-password"
          required
          minLength={10}
          value={password}
          onChange={event => setPassword(event.target.value)}
        />
      </div>
      <div className="form-row">
        <label htmlFor="confirm">Confirm new password</label>
        <input
          id="confirm"
          name="confirm"
          type="password"
          className="input"
          autoComplete="new-password"
          required
          minLength={10}
          value={confirm}
          onChange={event => setConfirm(event.target.value)}
        />
      </div>
      {error ? (
        <p role="alert" className="alert alert-danger">
          {error}
        </p>
      ) : null}
      <button className="btn btn-primary" type="submit" disabled={submitting}>
        {submitting ? 'Updating…' : 'Update password'}
      </button>
    </form>
  );
}

export default function ResetPasswordPage() {
  return (
    <main id="main-content" className="container prose">
      <h1 className="t-title">Choose a new password</h1>
      <Suspense fallback={<p className="muted">Loading…</p>}>
        <ResetPasswordForm />
      </Suspense>
    </main>
  );
}
