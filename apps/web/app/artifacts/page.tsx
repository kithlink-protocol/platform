'use client';

import Link from 'next/link';
import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';

import { apiFetch, ClientApiError } from '@/lib/client-api';
import type {
  ArtifactInitUploadResponse,
  ArtifactType,
  ArtifactWithVerifications,
} from '@kithlink/contracts';
import { ARTIFACT_MAX_BYTES, artifactMimes, artifactTypes } from '@kithlink/contracts';

export default function ArtifactsPage() {
  const fileRef = useRef<HTMLInputElement>(null);
  const [artifacts, setArtifacts] = useState<ArtifactWithVerifications[]>([]);
  const [listError, setListError] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [type, setType] = useState<ArtifactType>('other');
  const [busy, setBusy] = useState(false);

  const loadArtifacts = useCallback(async () => {
    try {
      const page = await apiFetch<{ items: ArtifactWithVerifications[] }>(
        '/app/v1/me/artifacts?limit=100'
      );
      setArtifacts(page.items);
      setListError(null);
    } catch (err) {
      setListError(
        err instanceof ClientApiError
          ? err.message
          : 'Something went wrong while loading your artifacts.'
      );
    }
  }, []);

  useEffect(() => {
    void loadArtifacts();
  }, [loadArtifacts]);

  async function onUpload(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const file = fileRef.current?.files?.[0];
    if (!file) return;
    if (!(artifactMimes as readonly string[]).includes(file.type)) {
      setUploadError('Only PDF, PNG, JPEG or WebP files are supported.');
      return;
    }
    if (file.size < 1 || file.size > ARTIFACT_MAX_BYTES) {
      setUploadError('Files must be between 1 byte and 25 MB.');
      return;
    }
    setBusy(true);
    setUploadError(null);
    setStatus('Uploading…');
    try {
      const bytes = await file.arrayBuffer();
      const init = await apiFetch<ArtifactInitUploadResponse>('/app/v1/me/artifacts', {
        method: 'POST',
        body: JSON.stringify({ type, mime: file.type, bytes: file.size }),
      });
      const putRes = await fetch(init.upload.url, {
        method: 'PUT',
        headers: { 'Content-Type': file.type },
        body: bytes,
      });
      if (!putRes.ok) throw new ClientApiError(putRes.status, 'Upload to storage failed.');
      const digest = await crypto.subtle.digest('SHA-256', bytes);
      const sha256 = Array.from(new Uint8Array(digest))
        .map(byte => byte.toString(16).padStart(2, '0'))
        .join('');
      await apiFetch(`/app/v1/me/artifacts/${init.artifact.id}/upload-complete`, {
        method: 'POST',
        body: JSON.stringify({ sha256 }),
      });
      setType('other');
      if (fileRef.current) fileRef.current.value = '';
      setStatus(`Uploaded “${file.name}”.`);
      await loadArtifacts();
    } catch (err) {
      setStatus(null);
      setUploadError(
        err instanceof ClientApiError
          ? err.message
          : 'Something went wrong while uploading the file.'
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <main>
      <h1>My artifacts</h1>

      <section aria-labelledby="artifact-list-heading">
        <h2 id="artifact-list-heading">Documents</h2>
        {listError ? (
          <p role="alert" className="error">
            {listError}
          </p>
        ) : artifacts.length === 0 ? (
          <p className="muted">No documents uploaded yet.</p>
        ) : (
          <ul className="grid" style={{ listStyle: 'none' }}>
            {artifacts.map(artifact => (
              <li key={artifact.id}>
                <article className="card" data-testid="artifact-card">
                  <span className="badge">{artifact.type}</span>{' '}
                  <span className="badge" data-status={artifact.state}>
                    {artifact.state}
                  </span>
                  {typeof artifact.confidence === 'number' ? (
                    <p className="muted">Confidence {Math.round(artifact.confidence * 100)}%</p>
                  ) : null}
                </article>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="artifact-upload-heading">
        <h2 id="artifact-upload-heading">Upload a document</h2>
        <form onSubmit={onUpload}>
          <div className="form-row">
            <label htmlFor="artifact-type">Document type</label>
            <select
              id="artifact-type"
              name="type"
              value={type}
              onChange={event => setType(event.target.value as ArtifactType)}
            >
              {artifactTypes.map(option => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </div>
          <div className="form-row">
            <label htmlFor="artifact-file">File</label>
            <input
              id="artifact-file"
              name="file"
              ref={fileRef}
              type="file"
              accept=".pdf,image/png,image/jpeg,image/webp"
              required
            />
          </div>
          {uploadError ? (
            <p role="alert" className="error">
              {uploadError}
            </p>
          ) : null}
          {status ? (
            <p role="status" className="success">
              {status}
            </p>
          ) : null}
          <button className="btn" type="submit" disabled={busy}>
            {busy ? 'Uploading…' : 'Upload'}
          </button>
        </form>
      </section>

      <p>
        <Link href="/dashboard">← Back to dashboard</Link>
      </p>
    </main>
  );
}
