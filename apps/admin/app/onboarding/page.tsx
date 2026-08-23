'use client';

import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';

import { ApiError, apiFetch } from '@/lib/api';
import type { AuthSession, TaskTemplate } from '@kithlink/contracts';

const ROLE_ORDER = ['owner', 'admin', 'coordinator', 'volunteer', 'viewer'] as const;
type EditorRole = (typeof ROLE_ORDER)[number];

interface DraftTemplate {
  key: string;
  id?: string;
  role: EditorRole;
  title: string;
  description: string;
}

function groupByRole(templates: TaskTemplate[]): [string, TaskTemplate[]][] {
  const groups = new Map<string, TaskTemplate[]>();
  for (const template of templates) {
    const list = groups.get(template.role) ?? [];
    list.push(template);
    groups.set(template.role, list);
  }
  return Array.from(groups.entries()).sort(
    (a, b) =>
      ROLE_ORDER.indexOf(a[0] as EditorRole) - ROLE_ORDER.indexOf(b[0] as EditorRole) ||
      a[0].localeCompare(b[0]),
  );
}

let draftKeyCounter = 0;
function nextDraftKey(): string {
  draftKeyCounter += 1;
  return `draft-${draftKeyCounter}`;
}

export default function OnboardingPage() {
  const router = useRouter();
  const [session, setSession] = useState<AuthSession | null>(null);
  const [defaults, setDefaults] = useState<TaskTemplate[]>([]);
  const [shelterTemplates, setShelterTemplates] = useState<DraftTemplate[]>([]);
  const [role, setRole] = useState<EditorRole>('coordinator');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    let cancelled = false;
    apiFetch<AuthSession>('/app/v1/auth/session')
      .then((data) => {
        if (!cancelled) setSession(data);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        if (err instanceof ApiError && err.status === 401) {
          router.replace('/');
          return;
        }
        setError(err instanceof Error ? err.message : 'Could not load your session.');
      });
    return () => {
      cancelled = true;
    };
  }, [router]);

  const shelterId = session?.memberships[0]?.shelterId ?? null;

  const refetch = useCallback(() => {
    if (!shelterId) return;
    apiFetch<{ defaults: TaskTemplate[]; shelter: TaskTemplate[] }>(
      `/admin/v1/shelters/${encodeURIComponent(shelterId)}/task-templates`,
    )
      .then((data) => {
        setDefaults(data.defaults);
        setShelterTemplates(
          data.shelter.map((t) => ({
            key: nextDraftKey(),
            ...(t.id ? { id: t.id } : {}),
            role: t.role,
            title: t.title,
            description: t.description,
          })),
        );
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : 'Could not load task templates.');
      });
  }, [shelterId]);

  useEffect(() => {
    refetch();
  }, [refetch]);

  function addDraft() {
    const trimmedTitle = title.trim();
    const trimmedDescription = description.trim();
    if (!trimmedTitle || !trimmedDescription) return;
    setShelterTemplates((current) => [
      ...current,
      { key: nextDraftKey(), role, title: trimmedTitle, description: trimmedDescription },
    ]);
    setTitle('');
    setDescription('');
    setSaved(false);
  }

  function removeDraft(key: string) {
    setShelterTemplates((current) => current.filter((d) => d.key !== key));
    setSaved(false);
  }

  async function save() {
    if (!shelterId) return;
    setPending(true);
    setError(null);
    try {
      await apiFetch(`/admin/v1/shelters/${encodeURIComponent(shelterId)}/task-templates`, {
        method: 'PUT',
        body: JSON.stringify({
          templates: shelterTemplates.map((d) => ({
            ...(d.id ? { id: d.id } : {}),
            role: d.role,
            title: d.title,
            description: d.description,
          })),
        }),
      });
      setSaved(true);
      refetch();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Could not save task templates.');
    } finally {
      setPending(false);
    }
  }

  return (
    <main>
      <header className="page-header">
        <h1 className="t-title">Onboarding</h1>
        <p className="t-meta">
          Platform defaults are read-only; add your shelter-specific onboarding tasks here.
        </p>
      </header>

      {error ? (
        <p role="alert" className="alert alert-danger">
          {error}
        </p>
      ) : null}

      <div className="detail-grid">
        <section aria-labelledby="defaults-heading" className="card">
          <h2 id="defaults-heading" className="t-heading">
            Platform defaults
          </h2>
          {defaults.length === 0 ? (
            <div className="empty-state">No platform defaults yet.</div>
          ) : (
            <div data-testid="task-defaults">
              {groupByRole(defaults).map(([groupName, items]) => (
                <div key={groupName} className="section-gap">
                  <h3 className="t-subheading">{groupName}</h3>
                  <ul className="timeline">
                    {items.map((item) => (
                      <li key={item.id} data-testid="task-default-item">
                        <span className="t-label">{item.title}</span>{' '}
                        <span className="t-meta">{item.description}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          )}
        </section>

        <section aria-labelledby="shelter-heading" className="card detail-aside">
          <h2 id="shelter-heading" className="t-heading">
            Shelter-specific tasks
          </h2>
          <div className="btn-row">
            <label className="t-label" htmlFor="task-role">
              Role
            </label>
            <select
              id="task-role"
              data-testid="task-role"
              value={role}
              onChange={(e) => setRole(e.target.value as EditorRole)}
            >
              {ROLE_ORDER.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          </div>
          <input
            type="text"
            data-testid="task-title"
            aria-label="Task title"
            placeholder="Task title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
          <textarea
            data-testid="task-description"
            aria-label="Task description"
            rows={3}
            placeholder="Task description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
          <button
            type="button"
            className="btn btn-secondary"
            data-testid="task-add"
            disabled={title.trim().length === 0 || description.trim().length === 0}
            onClick={addDraft}
          >
            Add task
          </button>

          {shelterTemplates.length === 0 ? (
            <div className="empty-state section-gap">No shelter-specific tasks yet.</div>
          ) : (
            <ul className="timeline section-gap" data-testid="task-list">
              {shelterTemplates.map((draft) => (
                <li key={draft.key} data-testid="task-row">
                  <span className="t-label">{draft.title}</span>{' '}
                  <span className="badge">{draft.role}</span>{' '}
                  <span className="t-meta">{draft.description}</span>{' '}
                  <button
                    type="button"
                    className="btn btn-danger"
                    data-testid="task-remove"
                    onClick={() => removeDraft(draft.key)}
                  >
                    Remove
                  </button>
                </li>
              ))}
            </ul>
          )}

          <button
            type="button"
            className="btn btn-primary"
            data-testid="task-save"
            disabled={pending}
            onClick={save}
          >
            Save tasks
          </button>
          {saved ? (
            <p className="t-meta" role="status" data-testid="task-saved">
              Saved.
            </p>
          ) : null}
        </section>
      </div>
    </main>
  );
}
