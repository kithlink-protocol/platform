'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { apiFetch } from '@/lib/client-api';
import { useSession } from '@/lib/use-session';

export default function DashboardPage() {
  const router = useRouter();
  const sessionState = useSession();
  const [loggingOut, setLoggingOut] = useState(false);
  const [resending, setResending] = useState(false);
  const [resent, setResent] = useState(false);

  async function onLogout() {
    setLoggingOut(true);
    await apiFetch('/app/v1/auth/logout', { method: 'POST' }).catch(() => undefined);
    router.push('/login');
  }

  async function onResend() {
    setResending(true);
    try {
      await apiFetch('/app/v1/auth/resend-verification', { method: 'POST' });
      setResent(true);
    } catch {
      // banner stays; the user can retry
    } finally {
      setResending(false);
    }
  }

  if (sessionState.status === 'loading') {
    return (
      <main id="main-content" className="container prose">
        <p className="muted">Loading…</p>
      </main>
    );
  }

  if (sessionState.status === 'error') {
    return (
      <main id="main-content" className="container prose">
        <h1 className="t-title">Dashboard</h1>
        <p role="alert" className="alert alert-danger">
          {sessionState.message}
        </p>
        <p>
          <Link href="/">Back to home</Link>
        </p>
      </main>
    );
  }

  return (
    <main id="main-content" className="container prose">
      <h1 className="t-title">Dashboard</h1>
      <p className="t-lede">
        Signed in as <strong>{sessionState.session.user.email}</strong>
      </p>
      {sessionState.session.user.emailVerified === false ? (
        <p role="alert" className="alert alert-warn">
          Verify your email — check your inbox{' '}
          <button
            type="button"
            className="btn btn-secondary"
            onClick={onResend}
            disabled={resending || resent}
          >
            {resent ? 'Sent' : resending ? 'Sending…' : 'Resend'}
          </button>
        </p>
      ) : null}
      <ul className="menu">
        <li>
          <Link className="card card-link" href="/applications">
            My applications
          </Link>
        </li>
        <li>
          <Link className="card card-link" href="/artifacts">
            My artifacts
          </Link>
        </li>
        <li>
          <Link className="card card-link" href="/profile">
            Profile
          </Link>
        </li>
      </ul>
      <button className="btn btn-secondary" type="button" onClick={onLogout} disabled={loggingOut}>
        {loggingOut ? 'Logging out…' : 'Log out'}
      </button>
    </main>
  );
}
