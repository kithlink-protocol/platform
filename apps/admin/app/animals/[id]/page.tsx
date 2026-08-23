'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useCallback, useEffect, useState, type FormEvent } from 'react';

import { ApiError, apiFetch } from '@/lib/api';
import {
  OBSERVATION_TAGS,
  type AnimalPublic,
  type AuthSession,
  type BehaviorObservation,
} from '@kithlink/contracts';

const FAS_LABELS: Record<number, string> = {
  0: '0 — Relaxed',
  1: '1 — Slightly tense',
  2: '2 — Uneasy',
  3: '3 — Stressed',
  4: '4 — Very stressed',
};

function formatDay(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toISOString().slice(0, 10);
}

export default function AnimalDetailPage() {
  const params = useParams<{ id: string }>();
  const animalId = typeof params.id === 'string' ? params.id : '';

  const [shelterId, setShelterId] = useState<string | null>(null);
  const [animal, setAnimal] = useState<AnimalPublic | null>(null);
  const [observations, setObservations] = useState<BehaviorObservation[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [fasScore, setFasScore] = useState('');
  const [selectedTags, setSelectedTags] = useState<Set<string>>(new Set());
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    apiFetch<AuthSession>('/app/v1/auth/session')
      .then((data) => {
        if (cancelled) return;
        const first = data.memberships[0];
        if (!first) return;
        setShelterId(first.shelterId);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        if (err instanceof ApiError && err.status === 401) window.location.href = '/';
        setLoadError(err instanceof Error ? err.message : 'Could not load your session.');
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!shelterId || !animalId) return;
    let cancelled = false;
    apiFetch<AnimalPublic>(
      `/admin/v1/shelters/${encodeURIComponent(shelterId)}/animals/${encodeURIComponent(animalId)}`,
    )
      .then((data) => {
        if (!cancelled) setAnimal(data);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setLoadError(err instanceof Error ? err.message : 'Could not load this animal.');
      });
    return () => {
      cancelled = true;
    };
  }, [shelterId, animalId]);

  const loadObservations = useCallback(() => {
    if (!shelterId || !animalId) return;
    apiFetch<{ items: BehaviorObservation[] }>(
      `/admin/v1/shelters/${encodeURIComponent(shelterId)}/animals/${encodeURIComponent(animalId)}/observations`,
    )
      .then((data) => setObservations(data.items))
      .catch((err: unknown) =>
        setLoadError(err instanceof Error ? err.message : 'Could not load observations.'),
      );
  }, [shelterId, animalId]);

  useEffect(() => {
    loadObservations();
  }, [loadObservations]);

  function toggleTag(tag: string) {
    setSelectedTags(prev => {
      const next = new Set(prev);
      if (next.has(tag)) next.delete(tag);
      else next.add(tag);
      return next;
    });
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!shelterId || !animalId || saving) return;
    setSaving(true);
    setSaveError(null);
    setSavedAt(null);
    try {
      await apiFetch(
        `/admin/v1/shelters/${encodeURIComponent(shelterId)}/animals/${encodeURIComponent(animalId)}/observations`,
        {
          method: 'POST',
          body: JSON.stringify({
            fasScore: fasScore === '' ? null : Number(fasScore),
            tags: Array.from(selectedTags),
            note: note === '' ? null : note,
          }),
        },
      );
      setFasScore('');
      setSelectedTags(new Set());
      setNote('');
      setSavedAt(new Date().toISOString());
      loadObservations();
    } catch (err: unknown) {
      setSaveError(err instanceof Error ? err.message : 'Could not save the observation.');
    } finally {
      setSaving(false);
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

  return (
    <main>
      <header className="page-header">
        <p className="t-meta">
          <Link href="/dashboard">← Dashboard</Link>
        </p>
        <h1 className="t-title">{animal ? animal.name : 'Animal'}</h1>
        {animal ? (
          <div className="btn-row">
            <span className="badge" data-status={animal.status}>
              {animal.status}
            </span>
            <span className="badge">{animal.species}</span>
            {animal.breed ? <span className="badge">{animal.breed}</span> : null}
            {animal.ageClass ? <span className="badge">{animal.ageClass}</span> : null}
            {animal.sex !== 'unknown' ? <span className="badge">{animal.sex}</span> : null}
          </div>
        ) : (
          <p>Loading…</p>
        )}
      </header>

      <section aria-labelledby="observations-heading" className="section-gap">
        <h2 id="observations-heading" className="t-heading">
          Observations
        </h2>
        <p className="t-caption">Observations are snapshots in time — not verdicts.</p>
        {observations === null ? (
          <p>Loading…</p>
        ) : observations.length === 0 ? (
          <p className="muted">No observations recorded yet.</p>
        ) : (
          <ul className="timeline">
            {observations.map(observation => (
              <li key={observation.id} data-testid="obs-item">
                <strong>{formatDay(observation.createdAt)}</strong>{' '}
                {observation.fasScore !== null ? (
                  <span className="badge">{FAS_LABELS[observation.fasScore]}</span>
                ) : null}
                {observation.tags.map(tag => (
                  <span key={tag} className="badge">
                    {tag}
                  </span>
                ))}
                {observation.note ? <p>{observation.note}</p> : null}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="add-observation-heading" className="section-gap card">
        <h2 id="add-observation-heading" className="card-title">
          Add observation
        </h2>
        <form onSubmit={submit}>
          <label htmlFor="obs-fas-input">Stress level (0 = relaxed)</label>
          <select
            id="obs-fas-input"
            data-testid="obs-fas"
            value={fasScore}
            onChange={event => setFasScore(event.target.value)}
          >
            <option value="">Not recorded</option>
            {Object.entries(FAS_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>

          <fieldset>
            <legend>Tags</legend>
            <div className="btn-row">
              {OBSERVATION_TAGS.map(tag => (
                <button
                  key={tag}
                  type="button"
                  data-testid="obs-tag"
                  className={selectedTags.has(tag) ? 'btn btn-primary' : 'btn btn-secondary'}
                  aria-pressed={selectedTags.has(tag)}
                  onClick={() => toggleTag(tag)}
                >
                  {tag}
                </button>
              ))}
            </div>
          </fieldset>

          <label htmlFor="obs-note-input">Note</label>
          <textarea
            id="obs-note-input"
            data-testid="obs-note"
            maxLength={1000}
            rows={3}
            value={note}
            onChange={event => setNote(event.target.value)}
            placeholder="What did you see?"
          />

          {saveError ? (
            <p role="alert" className="alert alert-danger">
              {saveError}
            </p>
          ) : null}
          {savedAt && !saveError ? (
            <p role="status" className="muted t-caption">
              Observation saved.
            </p>
          ) : null}

          <button type="submit" className="btn btn-primary" data-testid="obs-add" disabled={saving}>
            {saving ? 'Saving…' : 'Add observation'}
          </button>
        </form>
      </section>
    </main>
  );
}
