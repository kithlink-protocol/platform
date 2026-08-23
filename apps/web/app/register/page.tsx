'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';

import { apiFetch, ClientApiError } from '@/lib/client-api';

export default function RegisterPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await apiFetch('/app/v1/auth/register', {
        method: 'POST',
        body: JSON.stringify({ email, password }),
      });
      router.push('/profile');
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
    <main>
      <h1>Create your account</h1>
      <form onSubmit={onSubmit}>
        <div className="form-row">
          <label htmlFor="email">Email</label>
          <input
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={event => setEmail(event.target.value)}
          />
        </div>
        <div className="form-row">
          <label htmlFor="password">Password</label>
          <input
            id="password"
            name="password"
            type="password"
            autoComplete="new-password"
            required
            minLength={10}
            value={password}
            onChange={event => setPassword(event.target.value)}
          />
          <p className="muted">At least 10 characters with upper case, lower case and a digit.</p>
        </div>
        {error ? (
          <p role="alert" className="error">
            {error}
          </p>
        ) : null}
        <button className="btn" type="submit" disabled={submitting}>
          {submitting ? 'Creating account…' : 'Create account'}
        </button>
      </form>
      <p>
        Already have an account? <Link href="/login">Log in</Link>
      </p>
    </main>
  );
}
