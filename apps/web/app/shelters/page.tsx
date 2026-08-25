import type { Metadata } from 'next';

export const dynamic = "force-static";
import Link from 'next/link';

import { ApiError, listShelters } from '@/lib/api';
import type { ShelterPublic } from '@kithlink/contracts';

export const metadata: Metadata = {
  title: 'Shelters',
};

export default async function SheltersPage() {
  let shelters: ShelterPublic[];
  try {
    shelters = await listShelters();
  } catch (error) {
    const message =
      error instanceof ApiError
        ? error.message
        : 'Something went wrong while loading shelters. Please try again later.';
    return (
      <main id="main-content" className="container prose">
        <h1 className="t-title">Shelters</h1>
        <p role="alert" className="alert alert-danger">
          {message}
        </p>
        <p>
          <Link href="/">← Home</Link>
        </p>
      </main>
    );
  }

  return (
    <main id="main-content" className="container">
      <div className="shelter-header">
        <p>
          <Link href="/" className="t-caption">
            ← Home
          </Link>
        </p>
        <h1 className="t-title">Shelters</h1>
      </div>
      <div className="toolbar">
        <input
          className="input"
          type="search"
          placeholder="Search shelters"
          aria-label="Search shelters"
          disabled
        />
        <select className="input" aria-label="Filter by species" disabled>
          <option value="">All species</option>
        </select>
      </div>
      {shelters.length === 0 ? (
        <div className="empty-state">No shelters are listed yet.</div>
      ) : (
        <ul className="grid-cards">
          {shelters.map((shelter) => (
            <li key={shelter.id}>
              <article className="card card-link">
                <h2 className="card-title">
                  <Link href={`/shelters/${shelter.slug}`}>{shelter.name}</Link>
                </h2>
                <p className="t-meta">{shelter.slug}</p>
              </article>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
