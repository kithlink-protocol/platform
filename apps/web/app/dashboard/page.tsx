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

  async function onLogout() {
    setLoggingOut(true);
    await apiFetch('/app/v1/auth/logout', { method: 'POST' }).catch(() => undefined);
    router.push('/login');
  }

  if (sessionState.status === 'loading') {
    return (
      <main>
        <p className="muted">Loading…</p>
      </main>
    );
  }

  if (sessionState.status === 'error') {
    return (
      <main>
        <h1>Dashboard</h1>
        <p role="alert" className="error">
          {sessionState.message}
        </p>
        <Link href="/">Back to home</Link>
      </main>
    );
  }

  return (
    <main>
      <h1>Dashboard</h1>
      <p>
        Signed in as <strong>{sessionState.session.user.email}</strong>
      </p>
      <ul style={{ listStyle: 'none', padding: 0 }}>
        <li>
          <Link href="/applications">My applications</Link>
        </li>
        <li>
          <Link href="/artifacts">My artifacts</Link>
        </li>
        <li>
          <Link href="/profile">Profile</Link>
        </li>
      </ul>
      <button className="btn" type="button" onClick={onLogout} disabled={loggingOut}>
        {loggingOut ? 'Logging out…' : 'Log out'}
      </button>
    </main>
  );
}
