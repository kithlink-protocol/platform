'use client';

import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';

import { ApiError, apiFetch } from '@/lib/api';

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
    <main>
      <section className="card">
        <h1>Shelter staff sign-in</h1>
        <form onSubmit={onSubmit}>
          <fieldset disabled={pending}>
            <p>
              <label htmlFor="email">Email</label>
              <input
                id="email"
                name="email"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </p>
            <p>
              <label htmlFor="password">Password</label>
              <input
                id="password"
                name="password"
                type="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </p>
            {error ? (
              <p role="alert" className="error">
                {error}
              </p>
            ) : null}
            <button className="button" type="submit">
              {pending ? 'Signing in…' : 'Sign in'}
            </button>
          </fieldset>
        </form>
      </section>
    </main>
  );
}
