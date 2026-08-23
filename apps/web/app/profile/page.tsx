'use client';

import Link from 'next/link';
import { useEffect, useState, type FormEvent } from 'react';

import { apiFetch, ClientApiError } from '@/lib/client-api';
import type {
  ApplicantProfilePublic,
  UpsertApplicantProfileInput,
} from '@kithlink/contracts';

type ProfileResponse = ApplicantProfilePublic & { address?: string | null };

export default function ProfilePage() {
  const [loading, setLoading] = useState(true);
  const [legalName, setLegalName] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let active = true;
    apiFetch<ProfileResponse | null>('/app/v1/me/profile')
      .then(profile => {
        if (!active) return;
        if (profile) {
          setLegalName(profile.legalName);
          setDisplayName(profile.displayName ?? '');
          setPhone(profile.phone ?? '');
          setAddress(profile.address ?? '');
        }
        setLoading(false);
      })
      .catch((err: unknown) => {
        if (!active) return;
        if (err instanceof ClientApiError && err.status === 404) {
          setLoading(false);
          return;
        }
        setError(
          err instanceof ClientApiError
            ? err.message
            : 'Something went wrong while loading your profile.'
        );
        setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    setSaved(false);
    const body: UpsertApplicantProfileInput = {
      legalName,
      displayName: displayName.trim() ? displayName.trim() : null,
      phone: phone.trim() ? phone.trim() : null,
      address: address.trim() ? address.trim() : null,
    };
    try {
      await apiFetch('/app/v1/me/profile', { method: 'PUT', body: JSON.stringify(body) });
      setSaved(true);
    } catch (err) {
      setError(
        err instanceof ClientApiError
          ? err.message
          : 'Something went wrong while saving your profile.'
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <main id="main-content" className="container prose">
      <h1 className="t-title">Your profile</h1>
      {loading ? (
        <p className="muted">Loading…</p>
      ) : (
        <>
          <form onSubmit={onSubmit}>
            <div className="form-row">
              <label htmlFor="legalName">Legal name</label>
              <input
                id="legalName"
                name="legalName"
                type="text"
                className="input"
                autoComplete="name"
                required
                minLength={2}
                value={legalName}
                onChange={event => setLegalName(event.target.value)}
              />
            </div>
            <div className="form-row">
              <label htmlFor="displayName">Display name</label>
              <input
                id="displayName"
                name="displayName"
                type="text"
                className="input"
                value={displayName}
                onChange={event => setDisplayName(event.target.value)}
              />
            </div>
            <div className="form-row">
              <label htmlFor="phone">Phone</label>
              <input
                id="phone"
                name="phone"
                type="tel"
                className="input"
                placeholder="+15551230000"
                value={phone}
                onChange={event => setPhone(event.target.value)}
              />
            </div>
            <div className="form-row">
              <label htmlFor="address">Address</label>
              <textarea
                id="address"
                name="address"
                rows={3}
                className="input"
                value={address}
                onChange={event => setAddress(event.target.value)}
              />
            </div>
            {error ? (
              <p role="alert" className="alert alert-danger">
                {error}
              </p>
            ) : null}
            {saved ? (
              <p role="status" className="alert alert-ok" data-testid="success-msg">
                Profile saved
              </p>
            ) : null}
            <button className="btn btn-primary" type="submit" disabled={saving}>
              {saving ? 'Saving…' : 'Save profile'}
            </button>
          </form>
          <p className="section-gap">
            <Link href="/dashboard">← Back to dashboard</Link>
          </p>
        </>
      )}
    </main>
  );
}
