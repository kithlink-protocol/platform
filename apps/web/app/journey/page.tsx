'use client';

import { useSearchParams } from 'next/navigation';
import { Suspense, useCallback, useEffect, useState, type FormEvent } from 'react';

import type { JourneyChecklistItem, JourneyPublicView } from '@kithlink/contracts';
import { apiFetch, ClientApiError } from '@/lib/client-api';

const TRAIL_STEPS = [
  { offset: 2, label: 'First nights' },
  { offset: 14, label: 'Settling in' },
  { offset: 30, label: 'One month home' },
  { offset: 365, label: 'Gotcha Day' },
] as const;

const EDUCATION: Record<number, string> = {
  2: 'Decompression: quiet wins count.',
  14: 'The 3-3-3 rule: 3 days to decompress, 3 weeks to learn, 3 months to feel home.',
  30: 'One month home — you made it!',
  365: 'Happy Gotcha Day 🎉',
};

const MOODS = [
  { value: 1, emoji: '😟' },
  { value: 2, emoji: '😕' },
  { value: 3, emoji: '🙂' },
  { value: 4, emoji: '😄' },
  { value: 5, emoji: '🤩' },
] as const;

const TOPICS = [
  { value: 'potty', label: 'Potty' },
  { value: 'chewing', label: 'Chewing' },
  { value: 'intros', label: 'New pets' },
  { value: 'vet', label: 'Vet' },
  { value: 'food', label: 'Food' },
  { value: 'training', label: 'Training' },
  { value: 'other', label: 'Other' },
] as const;

const CONFETTI_COLORS = ['#C2410C', '#0F766E', '#B45309', '#15803D', '#FEF0E7'];

const CHECKLIST_CATEGORY_ORDER = ['health', 'supplies', 'home', 'social'] as const;

const CHECKLIST_CATEGORY_LABELS: Record<string, string> = {
  health: 'Health',
  supplies: 'Supplies',
  home: 'Home',
  social: 'Social',
};

function MoodRow({
  testid,
  question,
  value,
  onChange,
}: {
  testid: string;
  question: string;
  value: number | null;
  onChange: (value: number) => void;
}) {
  return (
    <div className="form-row">
      <span className="t-label" id={`${testid}-label`}>
        {question}
      </span>
      <div className="mood-row" role="radiogroup" aria-labelledby={`${testid}-label`} data-testid={testid}>
        {MOODS.map((mood) => (
          <button
            key={mood.value}
            type="button"
            role="radio"
            aria-checked={value === mood.value}
            aria-label={`${mood.value} — ${mood.emoji}`}
            className={`btn mood-btn${value === mood.value ? ' selected' : ''}`}
            onClick={() => onChange(mood.value)}
          >
            <span aria-hidden="true">{mood.emoji}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

export default function JourneyPage() {
  return (
    <Suspense fallback={<LoadingSkeleton />}>
      <JourneyInner />
    </Suspense>
  );
}

function LoadingSkeleton() {
  return (
    <main id="main-content" className="container prose">
      <div className="skeleton skeleton-title" />
      <div className="skeleton skeleton-line" />
      <div className="skeleton skeleton-card" />
    </main>
  );
}

function JourneyInner() {
  const params = useSearchParams();
  const token = params.get('jt') ?? '';

  const [view, setView] = useState<JourneyPublicView | null>(null);
  const [checklist, setChecklist] = useState<JourneyChecklistItem[]>([]);
  const [state, setState] = useState<'loading' | 'missing' | 'form' | 'done' | 'skipped'>('loading');
  const [petMood, setPetMood] = useState<number | null>(null);
  const [ownerMood, setOwnerMood] = useState<number | null>(null);
  const [topics, setTopics] = useState<string[]>([]);
  const [note, setNote] = useState('');
  const [wantFollowUp, setWantFollowUp] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) {
      setState('missing');
      return;
    }
    let cancelled = false;
    apiFetch<JourneyPublicView>(`/public/v1/journey?jt=${encodeURIComponent(token)}`)
      .then((data) => {
        if (cancelled) return;
        setView(data);
        setChecklist(data.checklist);
        if (data.alreadyDone) {
          setState('missing');
        } else {
          setState('form');
        }
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        if (
          err instanceof ClientApiError &&
          (err.status === 404 || err.status === 400)
        ) {
          setState('missing');
        } else {
          setError(err instanceof Error ? err.message : 'Something went wrong.');
        }
      });
    return () => {
      cancelled = true;
    };
  }, [token]);

  const respond = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      if (!view || petMood === null || ownerMood === null) return;
      setSubmitting(true);
      setError(null);
      try {
        await apiFetch('/public/v1/journey/respond', {
          method: 'POST',
          body: JSON.stringify({
            token,
            petMood,
            ownerMood,
            topics,
            ...(note.trim() ? { note: note.trim() } : {}),
            wantFollowUp,
          }),
        });
        setState('done');
      } catch (err: unknown) {
        setError(
          err instanceof Error ? err.message : 'Could not send your update. Please try again.'
        );
      } finally {
        setSubmitting(false);
      }
    },
    [view, petMood, ownerMood, topics, note, wantFollowUp, token]
  );

  async function skip() {
    setSubmitting(true);
    setError(null);
    try {
      await apiFetch('/public/v1/journey/skip', {
        method: 'POST',
        body: JSON.stringify({ token }),
      });
      setState('skipped');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Could not skip right now.');
    } finally {
      setSubmitting(false);
    }
  }

  function toggleTopic(topic: string) {
    setTopics((prev) =>
      prev.includes(topic)
        ? prev.filter((t) => t !== topic)
        : prev.length >= 4
          ? prev
          : [...prev, topic],
    );
  }

  async function toggleChecklistItem(label: string, done: boolean) {
    const previous = checklist;
    setChecklist((prev) =>
      prev.map((item) => (item.label === label ? { ...item, done } : item)),
    );
    try {
      await apiFetch('/public/v1/journey/checklist', {
        method: 'POST',
        body: JSON.stringify({ token, itemLabel: label, done }),
      });
    } catch {
      setChecklist(previous);
    }
  }

  if (error && state === 'loading') {
    return (
      <main id="main-content" className="container prose">
        <p role="alert" className="alert alert-danger">
          {error}
        </p>
      </main>
    );
  }

  if (state === 'loading') {
    return <LoadingSkeleton />;
  }

  if (state === 'missing') {
    return (
      <main id="main-content" className="container prose">
        <div className="card journey-warm" data-testid="journey-missing" role="status">
          <h1 className="t-title">No check-in needed</h1>
          <p>This link has expired or was already used — no worries!</p>
        </div>
      </main>
    );
  }

  if (!view) return null;

  if (state === 'skipped') {
    return (
      <main id="main-content" className="container prose">
        <div className="card journey-warm" role="status">
          <p>Okay, we&apos;ll check in later 💛</p>
        </div>
      </main>
    );
  }

  if (state === 'done') {
    const lowest = Math.min(petMood ?? 5, ownerMood ?? 5);
    const headline =
      lowest <= 2
        ? `Thanks for being honest — that helps ${view.animalName}.`
        : 'High paws! 🙌';
    return (
      <main id="main-content" className="container prose">
        <div className="confetti" aria-hidden="true">
          {Array.from({ length: 24 }, (_, i) => (
            <span
              key={i}
              className="confetti-piece"
              style={{
                left: `${(i * 37 + 11) % 100}%`,
                animationDelay: `${(i % 8) * 0.12}s`,
                background: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
              }}
            />
          ))}
        </div>
        <div className="card journey-done" data-testid="journey-done" role="status">
          <h1 className="t-title">{headline}</h1>
          <p className="badge" data-status="active">
            Day {view.dayOffset} badge earned
          </p>
          {wantFollowUp ? (
            <p>{view.shelterName} will reach out soon — zero pressure.</p>
          ) : null}
        </div>
      </main>
    );
  }

  const currentIndex = TRAIL_STEPS.findIndex((step) => step.offset === view.dayOffset);

  return (
    <main id="main-content" className="container prose">
      <header>
        <h1 className="t-title">{view.animalName}</h1>
        <p className="badge" data-status="pending">
          Day {view.dayOffset} · {view.dayLabel}
        </p>
      </header>

      <ol className="journey-trail">
        {TRAIL_STEPS.map((step, index) => {
          const phase = index < currentIndex ? 'done' : index === currentIndex ? 'current' : 'future';
          return (
            <li key={step.offset} className="trail-step">
              <span className={`trail-dot ${phase}`} data-testid="trail-dot" data-phase={phase} />
              <span className="trail-label">{step.label}</span>
            </li>
          );
        })}
      </ol>

      <p className="card journey-edu">{EDUCATION[view.dayOffset]}</p>

      <form onSubmit={respond}>
        <MoodRow
          testid="mood-pet"
          question={`How is ${view.animalName} doing?`}
          value={petMood}
          onChange={setPetMood}
        />
        <MoodRow
          testid="mood-owner"
          question="How are you doing?"
          value={ownerMood}
          onChange={setOwnerMood}
        />

        <fieldset className="form-row topic-group">
          <legend className="t-label">Anything on your mind?</legend>
          <div className="chip-row">
            {TOPICS.map((topic) => (
              <button
                key={topic.value}
                type="button"
                className={`chip${topics.includes(topic.value) ? ' chip-selected' : ''}`}
                data-testid="topic-chip"
                aria-pressed={topics.includes(topic.value)}
                onClick={() => toggleTopic(topic.value)}
              >
                {topic.label}
              </button>
            ))}
          </div>
        </fieldset>

        <div className="form-row">
          <label htmlFor="journey-note">Anything to share? Wins totally count 🎉</label>
          <textarea
            id="journey-note"
            className="input"
            rows={4}
            maxLength={1000}
            value={note}
            onChange={(event) => setNote(event.target.value)}
          />
        </div>

        <div className="form-row form-check">
          <input
            id="want-follow-up"
            type="checkbox"
            checked={wantFollowUp}
            onChange={(event) => setWantFollowUp(event.target.checked)}
          />
          <label htmlFor="want-follow-up">I&apos;d like the shelter team to reach out</label>
        </div>

        {error ? (
          <p role="alert" className="alert alert-danger">
            {error}
          </p>
        ) : null}

        <button
          className="btn btn-primary"
          type="submit"
          data-testid="journey-submit"
          disabled={submitting || petMood === null || ownerMood === null}
        >
          {submitting ? 'Sending…' : 'Send update'}
        </button>
      </form>

      {checklist.length > 0 ? (
        <section className="card section-gap" data-testid="getting-started-checklist">
          <h2 className="card-title">Getting Started Checklist</h2>
          <p className="t-meta">At your own pace — every win counts. 💛</p>
          {CHECKLIST_CATEGORY_ORDER.map((category) => {
            const items = checklist.filter((item) => item.category === category);
            if (items.length === 0) return null;
            return (
              <div key={category} className="form-row">
                <h3 className="t-label">{CHECKLIST_CATEGORY_LABELS[category]}</h3>
                <ul className="checklist-group">
                  {items.map((item) => (
                    <li key={item.label}>
                      <label>
                        <input
                          type="checkbox"
                          data-testid="checklist-item"
                          data-category={item.category}
                          checked={item.done}
                          onChange={(event) =>
                            toggleChecklistItem(item.label, event.target.checked)
                          }
                        />{' '}
                        {item.label}
                      </label>
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </section>
      ) : null}

      <button
        type="button"
        className="btn btn-ghost btn-sm journey-skip"
        onClick={skip}
        disabled={submitting}
      >
        Not now — maybe later
      </button>
    </main>
  );
}
