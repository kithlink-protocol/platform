import type { Metadata } from 'next';
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
      <main>
        <h1>Shelters</h1>
        <p role="alert" className="error">
          {message}
        </p>
        <Link href="/">Back to home</Link>
      </main>
    );
  }

  return (
    <main>
      <p>
        <Link href="/">← Home</Link>
      </p>
      <h1>Shelters</h1>
      {shelters.length === 0 ? (
        <p className="muted">No shelters are listed yet.</p>
      ) : (
        <ul className="grid" style={{ listStyle: 'none' }}>
          {shelters.map((shelter) => (
            <li key={shelter.id}>
              <article className="card">
                <h2>
                  <Link href={`/shelters/${shelter.slug}`}>{shelter.name}</Link>
                </h2>
              </article>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
