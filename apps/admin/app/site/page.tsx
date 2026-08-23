'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState, type FormEvent } from 'react';

import { ApiError, apiFetch } from '@/lib/api';
import type { AuthSession, CustomDomain, SiteConfigResponse } from '@kithlink/contracts';

interface PublishInfo {
  slug: string;
  publishedAt: string;
}

interface SetupInfo {
  slug: string;
  subdomain: string;
  publishedAt: string;
  animalCount: number;
}

const DEFAULT_COLOR = '#2563eb';
const ROOT_DOMAIN = process.env.NEXT_PUBLIC_SITES_ROOT_DOMAIN ?? 'sites.localhost';

function siteUrl(subdomain: string): string {
  return `${subdomain.endsWith('.localhost') ? 'http' : 'https'}://${subdomain}`;
}

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
  const [settingUp, setSettingUp] = useState(false);
  const [setupError, setSetupError] = useState<string | null>(null);
  const [setupInfo, setSetupInfo] = useState<SetupInfo | null>(null);
  const [domains, setDomains] = useState<CustomDomain[]>([]);
  const [domainsError, setDomainsError] = useState<string | null>(null);
  const [domainInput, setDomainInput] = useState('');
  const [addingDomain, setAddingDomain] = useState(false);
  const [verifyingId, setVerifyingId] = useState<string | null>(null);
  const [domainActionError, setDomainActionError] = useState<string | null>(null);

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

  async function onSetup() {
    if (!shelterId) return;
    setSettingUp(true);
    setSetupError(null);
    try {
      const res = await apiFetch<SetupInfo>(
        `/admin/v1/shelters/${encodeURIComponent(shelterId)}/site/setup`,
        { method: 'POST' },
      );
      setSetupInfo(res);
      setPublished({ slug: res.slug, publishedAt: res.publishedAt });
      setPublishedAt(res.publishedAt);
    } catch (err) {
      setSetupError(err instanceof Error ? err.message : 'Could not launch the site.');
    } finally {
      setSettingUp(false);
    }
  }

  useEffect(() => {
    if (!shelterId) return;
    let cancelled = false;
    apiFetch<CustomDomain[]>(`/admin/v1/shelters/${encodeURIComponent(shelterId)}/site/domains`)
      .then((data) => {
        if (!cancelled) setDomains(data);
      })
      .catch((err: unknown) => {
        if (!cancelled)
          setDomainsError(err instanceof Error ? err.message : 'Could not load custom domains.');
      });
    return () => {
      cancelled = true;
    };
  }, [shelterId]);

  async function onAddDomain(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!shelterId || domainInput.trim().length === 0) return;
    setAddingDomain(true);
    setDomainActionError(null);
    try {
      const res = await apiFetch<CustomDomain & { instructions: string }>(
        `/admin/v1/shelters/${encodeURIComponent(shelterId)}/site/domains`,
        { method: 'POST', body: JSON.stringify({ domain: domainInput.trim().toLowerCase() }) },
      );
      setDomains((prev) => [...prev, res]);
      setDomainInput('');
    } catch (err) {
      setDomainActionError(err instanceof Error ? err.message : 'Could not add the domain.');
    } finally {
      setAddingDomain(false);
    }
  }

  async function onVerifyDomain(id: string) {
    if (!shelterId) return;
    setVerifyingId(id);
    setDomainActionError(null);
    try {
      const res = await apiFetch<CustomDomain>(
        `/admin/v1/shelters/${encodeURIComponent(shelterId)}/site/domains/${encodeURIComponent(id)}/verify`,
        { method: 'POST' },
      );
      setDomains((prev) => prev.map((d) => (d.id === res.id ? res : d)));
    } catch (err) {
      setDomainActionError(err instanceof Error ? err.message : 'Could not verify the domain yet.');
    } finally {
      setVerifyingId(null);
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

      <section className="card section-gap" aria-labelledby="onboarding-heading">
        <h2 id="onboarding-heading" className="t-heading">
          Launch
        </h2>
        {!shownPublishedAt && !setupInfo ? (
          <>
            <p className="t-meta">
              Publish your shelter site in one click with sensible defaults and a{' '}
              {ROOT_DOMAIN} subdomain.
            </p>
            <button
              data-testid="setup-cta"
              className="btn btn-primary"
              type="button"
              onClick={onSetup}
              disabled={settingUp}
            >
              {settingUp ? 'Launching…' : 'Launch your shelter site'}
            </button>
            {setupError ? (
              <p role="alert" className="alert alert-danger">
                {setupError}
              </p>
            ) : null}
          </>
        ) : setupInfo ? (
          <div data-testid="setup-done">
            <p>
              Your site is live at{' '}
              <a href={siteUrl(setupInfo.subdomain)} target="_blank" rel="noreferrer">
                {siteUrl(setupInfo.subdomain)}
              </a>{' '}
              ({setupInfo.animalCount} adoptable animals)
            </p>
            <a href="#site-form">Customize</a>
          </div>
        ) : (
          <p className="t-meta">
            Your subdomain:{' '}
            <a
              href={siteUrl(`${slug}.${ROOT_DOMAIN}`)}
              target="_blank"
              rel="noreferrer"
            >
              {slug}.{ROOT_DOMAIN}
            </a>
          </p>
        )}
      </section>

      <section id="site-form" className="card" aria-labelledby="site-form-heading">
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

      <section className="card section-gap" aria-labelledby="domains-heading">
        <h2 id="domains-heading" className="t-heading">
          Custom domain
        </h2>
        {domainsError ? (
          <p role="alert" className="alert alert-danger">
            {domainsError}
          </p>
        ) : null}
        <form onSubmit={onAddDomain}>
          <div className="form-row">
            <label htmlFor="domainInput">Domain</label>
            <input
              id="domainInput"
              name="domainInput"
              data-testid="domain-input"
              type="text"
              placeholder="adopt.example.org"
              className="input"
              value={domainInput}
              onChange={(e) => setDomainInput(e.target.value)}
            />
          </div>
          <button
            className="btn btn-primary"
            type="submit"
            disabled={addingDomain || domainInput.trim().length === 0}
          >
            {addingDomain ? 'Adding…' : 'Add domain'}
          </button>
        </form>
        {domainActionError ? (
          <p role="alert" className="alert alert-danger">
            {domainActionError}
          </p>
        ) : null}
        {domains.length > 0 ? (
          <ul>
            {domains.map((d) => (
              <li key={d.id} data-testid="domain-row">
                <span>{d.domain}</span>{' '}
                <span className={d.verified ? 'alert alert-ok' : 't-meta'}>
                  {d.verified ? 'verified' : 'pending'}
                </span>
                <div className="form-row">
                  <code>{d.verificationToken}</code>
                </div>
                {!d.verified ? (
                  <>
                    <div className="form-row">
                      <code>
                        Create TXT record _kithlink.{d.domain} with value kithlink-verify=
                        {d.verificationToken}
                      </code>
                    </div>
                    <button
                      data-testid="domain-verify"
                      className="btn btn-primary"
                      type="button"
                      onClick={() => onVerifyDomain(d.id)}
                      disabled={verifyingId === d.id}
                    >
                      {verifyingId === d.id ? 'Verifying…' : 'Verify'}
                    </button>
                  </>
                ) : null}
              </li>
            ))}
          </ul>
        ) : (
          <p className="t-meta">No custom domains yet.</p>
        )}
      </section>
    </main>
  );
}
