'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState, type FormEvent } from 'react';

import { ApiError, apiFetch } from '@/lib/api';
import type { AuthSession, SyncRunSummary, SyncTargetPublic } from '@kithlink/contracts';

export default function SyncPage() {
  const router = useRouter();
  const [shelterId, setShelterId] = useState<string | null>(null);
  const [targets, setTargets] = useState<SyncTargetPublic[]>([]);
  const [provider, setProvider] = useState('petfinder');
  const [clientId, setClientId] = useState('');
  const [clientSecret, setClientSecret] = useState('');
  const [mode, setMode] = useState('dry_run');
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved'>('idle');
  const [running, setRunning] = useState(false);
  const [lastRun, setLastRun] = useState<SyncRunSummary | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    apiFetch<AuthSession>('/app/v1/auth/session')
      .then((data) => {
        if (cancelled) return;
        const first = data.memberships[0];
        if (!first) {
          router.replace('/dashboard');
          return;
        }
        setShelterId(first.shelterId);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        if (err instanceof ApiError && err.status === 401) {
          router.replace('/');
          return;
        }
        setLoadError(err instanceof Error ? err.message : 'Could not load your session.');
      });
    return () => {
      cancelled = true;
    };
  }, [router]);

  useEffect(() => {
    if (!shelterId) return;
    let cancelled = false;
    apiFetch<SyncTargetPublic[]>(`/admin/v1/shelters/${encodeURIComponent(shelterId)}/sync-targets`)
      .then((data) => {
        if (cancelled) return;
        setTargets(data);
        const existing = data.find((t) => t.provider === provider);
        if (existing) setMode(existing.mode);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [shelterId, provider]);

  async function onSave(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!shelterId) return;
    setSaveState('saving');
    setActionError(null);
    try {
      await apiFetch(`/admin/v1/shelters/${encodeURIComponent(shelterId)}/sync-targets`, {
        method: 'PUT',
        body: JSON.stringify({ provider, clientId, clientSecret, mode }),
      });
      setSaveState('saved');
    } catch (err) {
      setSaveState('idle');
      setActionError(err instanceof Error ? err.message : 'Could not save the sync target.');
    }
  }

  async function onRun() {
    if (!shelterId) return;
    setRunning(true);
    setActionError(null);
    try {
      const run = await apiFetch<SyncRunSummary>(
        `/admin/v1/shelters/${encodeURIComponent(shelterId)}/sync-targets/${provider}/run`,
        { method: 'POST' },
      );
      setLastRun(run);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Could not run the sync.');
    } finally {
      setRunning(false);
    }
  }

  if (loadError) {
    return (
      <main>
        <p role="alert" className="alert alert-danger">
          {loadError}
        </p>
      </main>
    );
  }

  if (!shelterId) {
    return (
      <main>
        <p>Loading…</p>
      </main>
    );
  }

  const currentTarget = targets.find((t) => t.provider === provider);

  return (
    <main>
      <header className="page-header">
        <h1 className="t-title">Listing sync</h1>
        <p className="t-lede">Push adoptable animals to external listing providers.</p>
        <p>
          <Link href="/dashboard">Back to dashboard</Link>
        </p>
      </header>

      <section className="card" aria-labelledby="sync-target-heading">
        <h2 id="sync-target-heading" className="t-heading">
          Provider target
        </h2>
        {currentTarget ? (
          <p className="t-meta">
            Configured: mode {currentTarget.mode}, status {currentTarget.status}
            {currentTarget.lastRunAt
              ? ` · last run ${new Date(currentTarget.lastRunAt).toISOString()}`
              : ''}
          </p>
        ) : (
          <p className="t-meta">Not configured for this provider yet.</p>
        )}
        <form onSubmit={onSave}>
          <div className="form-row">
            <label htmlFor="provider">Provider</label>
            <select
              id="provider"
              name="provider"
              className="input"
              value={provider}
              onChange={(e) => setProvider(e.target.value)}
            >
              <option value="petfinder">petfinder</option>
            </select>
          </div>
          <div className="form-row">
            <label htmlFor="clientId">Client ID</label>
            <input
              id="clientId"
              name="clientId"
              type="text"
              minLength={8}
              maxLength={200}
              required
              className="input"
              value={clientId}
              onChange={(e) => setClientId(e.target.value)}
            />
          </div>
          <div className="form-row">
            <label htmlFor="clientSecret">Client secret</label>
            <input
              id="clientSecret"
              name="clientSecret"
              type="password"
              minLength={8}
              maxLength={200}
              required
              autoComplete="off"
              className="input"
              value={clientSecret}
              onChange={(e) => setClientSecret(e.target.value)}
            />
          </div>
          <div className="form-row">
            <label htmlFor="mode">Mode</label>
            <select
              id="mode"
              name="mode"
              className="input"
              value={mode}
              onChange={(e) => setMode(e.target.value)}
            >
              <option value="dry_run">dry_run</option>
              <option value="live">live</option>
            </select>
          </div>
          <button className="btn btn-primary" type="submit" disabled={saveState === 'saving'}>
            Save target
          </button>
          {saveState === 'saved' ? (
            <span className="alert alert-ok" data-testid="sync-saved">
              Saved.
            </span>
          ) : null}
        </form>
      </section>

      <section className="card section-gap" aria-labelledby="sync-run-heading">
        <h2 id="sync-run-heading" className="t-heading">
          Run sync
        </h2>
        <button className="btn btn-primary" type="button" onClick={onRun} disabled={running}>
          {running ? 'Running…' : 'Run sync'}
        </button>
        {actionError ? (
          <p role="alert" className="alert alert-danger">
            {actionError}
          </p>
        ) : null}
        {lastRun ? (
          <p data-testid="run-summary">
            Pushed {lastRun.pushed}, failed {lastRun.failed}, {lastRun.decisionsCount} decisions.
          </p>
        ) : null}
      </section>
    </main>
  );
}
