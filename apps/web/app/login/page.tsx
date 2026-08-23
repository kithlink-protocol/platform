'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';

import { apiFetch, ClientApiError } from '@/lib/client-api';

export default function LoginPage() {
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
      await apiFetch('/app/v1/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email, password }),
      });
      router.push('/dashboard');
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
      <h1 className="t-title">Log in</h1>
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
        <div className="form-row">
          <label htmlFor="password">Password</label>
          <input
            id="password"
            name="password"
            type="password"
            className="input"
            autoComplete="current-password"
            required
            value={password}
            onChange={event => setPassword(event.target.value)}
          />
        </div>
        {error ? (
          <p role="alert" className="alert alert-danger">
            {error}
          </p>
        ) : null}
        <button className="btn btn-primary" type="submit" disabled={submitting}>
          {submitting ? 'Logging in…' : 'Log in'}
        </button>
      </form>
      <p className="section-gap">
        New here? <Link href="/register">Create an account</Link>
      </p>
    </main>
  );
}
