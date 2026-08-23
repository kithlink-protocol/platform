'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState, type FormEvent } from 'react';

import { ApiError, apiFetch } from '@/lib/api';
import type { AuthSession, SiteConfigResponse } from '@kithlink/contracts';

interface PublishInfo {
  slug: string;
  publishedAt: string;
}

const DEFAULT_COLOR = '#2563eb';

export default function SitePage() {
  const router = useRouter();
  const [shelterId, setShelterId] = useState<string | null>(null);
  const [slug, setSlug] = useState<string | null>(null);
  const [publishedAt, setPublishedAt] = useState<string | null>(null);
  const [heroTitle, setHeroTitle] = useState('');
  const [heroBody, setHeroBody] = useState('');
  const [themeSlug, setThemeSlug] = useState('default');
  const [logoUrl, setLogoUrl] = useState('');
  const [primaryColor, setPrimaryColor] = useState(DEFAULT_COLOR);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved'>('idle');
  const [publishing, setPublishing] = useState(false);
  const [publishError, setPublishError] = useState<string | null>(null);
  const [published, setPublished] = useState<PublishInfo | null>(null);

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
    apiFetch<SiteConfigResponse>(`/admin/v1/shelters/${encodeURIComponent(shelterId)}/site`)
      .then((data) => {
        if (cancelled) return;
        setSlug(data.slug);
        setHeroTitle(data.heroTitle);
        setHeroBody(data.heroBody);
        setThemeSlug(data.themeSlug);
        setLogoUrl(data.brand.logoUrl ?? '');
        setPrimaryColor(data.brand.primaryColor ?? DEFAULT_COLOR);
        setPublishedAt(data.publishedAt);
      })
      .catch((err: unknown) => {
        if (!cancelled) setLoadError(err instanceof Error ? err.message : 'Could not load site config.');
      });
    return () => {
      cancelled = true;
    };
  }, [shelterId]);

  async function onSave(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!shelterId) return;
    setSaveState('saving');
    try {
      await apiFetch(`/admin/v1/shelters/${encodeURIComponent(shelterId)}/site/config`, {
        method: 'PUT',
        body: JSON.stringify({
          heroTitle,
          heroBody,
          themeSlug,
          brand: {
            logoUrl: logoUrl.trim().length > 0 ? logoUrl.trim() : undefined,
            primaryColor,
          },
        }),
      });
      setSaveState('saved');
    } catch {
      setSaveState('idle');
      setPublishError('Could not save the site config. Please try again.');
    }
  }

  async function onPublish() {
    if (!shelterId) return;
    setPublishing(true);
    setPublishError(null);
    try {
      const res = await apiFetch<{ slug: string; publishedAt: string }>(
        `/admin/v1/shelters/${encodeURIComponent(shelterId)}/site/publish`,
        { method: 'POST' },
      );
      setPublished(res);
      setPublishedAt(res.publishedAt);
    } catch (err) {
      setPublishError(err instanceof Error ? err.message : 'Could not publish the site.');
    } finally {
      setPublishing(false);
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

  if (!shelterId || slug === null) {
    return (
      <main>
        <p>Loading…</p>
      </main>
    );
  }

  const shownPublishedAt = published?.publishedAt ?? publishedAt;

  return (
    <main>
      <header className="page-header">
        <h1 className="t-title">Shelter site</h1>
        <p className="t-meta">
          Public site for /{slug}
          {shownPublishedAt
            ? ` · last published ${new Date(shownPublishedAt).toISOString()}`
            : ''}
        </p>
        <p>
          <Link href="/dashboard">Back to dashboard</Link>
        </p>
      </header>

      <section className="card" aria-labelledby="site-form-heading">
        <h2 id="site-form-heading" className="t-heading">
          Site content
        </h2>
        <form onSubmit={onSave}>
          <div className="form-row">
            <label htmlFor="heroTitle">Hero title</label>
            <input
              id="heroTitle"
              name="heroTitle"
              type="text"
              maxLength={140}
              className="input"
              value={heroTitle}
              onChange={(e) => setHeroTitle(e.target.value)}
            />
          </div>
          <div className="form-row">
            <label htmlFor="heroBody">Hero body</label>
            <textarea
              id="heroBody"
              name="heroBody"
              maxLength={500}
              rows={4}
              className="input"
              value={heroBody}
              onChange={(e) => setHeroBody(e.target.value)}
            />
          </div>
          <div className="form-row">
            <label htmlFor="themeSlug">Theme</label>
            <select
              id="themeSlug"
              name="themeSlug"
              className="input"
              value={themeSlug}
              onChange={(e) => setThemeSlug(e.target.value)}
            >
              <option value="default">default</option>
              <option value="rescue-min">rescue-min</option>
            </select>
          </div>
          <div className="form-row">
            <label htmlFor="logoUrl">Logo URL</label>
            <input
              id="logoUrl"
              name="logoUrl"
              type="url"
              placeholder="https://…"
              className="input"
              value={logoUrl}
              onChange={(e) => setLogoUrl(e.target.value)}
            />
          </div>
          <div className="form-row">
            <label htmlFor="primaryColor">Primary color</label>
            <input
              id="primaryColor"
              name="primaryColor"
              type="color"
              pattern="#[0-9a-f]{6}"
              className="input"
              value={primaryColor}
              onChange={(e) => setPrimaryColor(e.target.value)}
            />
          </div>
          <button className="btn btn-primary" type="submit" disabled={saveState === 'saving'}>
            Save
          </button>
          {saveState === 'saved' ? (
            <span className="alert alert-ok" data-testid="site-saved">
              Saved.
            </span>
          ) : null}
        </form>
      </section>

      <section className="card section-gap" aria-labelledby="publish-heading">
        <h2 id="publish-heading" className="t-heading">
          Publish
        </h2>
        <button className="btn btn-primary" type="button" onClick={onPublish} disabled={publishing}>
          {publishing ? 'Publishing…' : 'Publish'}
        </button>
        {publishError ? (
          <p role="alert" className="alert alert-danger">
            {publishError}
          </p>
        ) : null}
        {shownPublishedAt ? (
          <p data-testid="published-at">
            Published at {new Date(shownPublishedAt).toISOString()}{' '}
            <a
              href={`${process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000'}/public/v1/sites/${slug}`}
              target="_blank"
              rel="noreferrer"
            >
              View site
            </a>
          </p>
        ) : (
          <p className="t-meta">Not published yet.</p>
        )}
      </section>
    </main>
  );
}
