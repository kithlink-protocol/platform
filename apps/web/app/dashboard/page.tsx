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
  const [exporting, setExporting] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirmText, setConfirmText] = useState('');
  const [deletePassword, setDeletePassword] = useState('');
  const [dangerError, setDangerError] = useState<string | null>(null);

  async function onExport() {
    setExporting(true);
    try {
      const res = await fetch('/api/app/v1/me/export', { credentials: 'include' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `kithlink-export-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      setDangerError('Export failed. Please try again later.');
    } finally {
      setExporting(false);
    }
  }

  async function onDeleteAccount() {
    setDeleting(true);
    setDangerError(null);
    try {
      await apiFetch('/app/v1/me/delete', {
        method: 'POST',
        body: JSON.stringify({ password: deletePassword }),
      });
      router.push('/');
    } catch (error) {
      setDangerError(error instanceof Error ? error.message : 'Something went wrong.');
      setDeleting(false);
    }
  }

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
      <section className="card" data-testid="danger-zone">
        <h2 className="card-title">Danger zone</h2>
        <p className="muted">
          Download everything Kithlink stores about you, or permanently delete your account.
        </p>
        <button
          type="button"
          className="btn btn-secondary"
          onClick={onExport}
          disabled={exporting}
        >
          {exporting ? 'Preparing…' : 'Export my data'}
        </button>
        <div>
          <input
            data-testid="delete-confirm"
            aria-label="Type DELETE to confirm account deletion"
            value={confirmText}
            onChange={e => setConfirmText(e.target.value)}
            placeholder="Type DELETE"
          />
          <input
            data-testid="delete-password"
            type="password"
            aria-label="Confirm your password"
            autoComplete="current-password"
            value={deletePassword}
            onChange={e => setDeletePassword(e.target.value)}
            placeholder="Password"
          />
          <button
            type="button"
            className="btn btn-danger"
            data-testid="delete-account"
            onClick={onDeleteAccount}
            disabled={deleting || confirmText !== 'DELETE' || deletePassword.length === 0}
          >
            {deleting ? 'Deleting…' : 'Delete account'}
          </button>
        </div>
        {dangerError ? (
          <p role="alert" className="alert alert-danger">
            {dangerError}
          </p>
        ) : null}
      </section>
      <button className="btn btn-secondary" type="button" onClick={onLogout} disabled={loggingOut}>
        {loggingOut ? 'Logging out…' : 'Log out'}
      </button>
    </main>
  );
}
