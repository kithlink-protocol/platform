'use client';

import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';

import { apiFetch } from '@/lib/api';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(null);
    try {
      await apiFetch('/app/v1/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email, password }),
      });
      router.push('/dashboard');
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Sign-in failed. Please try again.',
      );
      setPending(false);
    }
  }

  return (
    <main className="auth-main">
      <section className="card auth-card">
        <p className="wordmark">Kithlink</p>
        <h1 className="t-title">Shelter staff sign-in</h1>
        <form onSubmit={onSubmit}>
          <fieldset disabled={pending}>
            <div className="form-row">
              <label htmlFor="email">Email</label>
              <input
                id="email"
                name="email"
                type="email"
                autoComplete="email"
                required
                className="input"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
            <div className="form-row">
              <label htmlFor="password">Password</label>
              <input
                id="password"
                name="password"
                type="password"
                autoComplete="current-password"
                required
                className="input"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
            {error ? (
              <p role="alert" className="alert alert-danger">
                {error}
              </p>
            ) : null}
            <button className="btn btn-primary" type="submit">
              {pending ? 'Signing in…' : 'Sign in'}
            </button>
          </fieldset>
        </form>
      </section>
    </main>
  );
}
