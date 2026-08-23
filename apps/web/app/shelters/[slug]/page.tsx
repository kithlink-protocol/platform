import type { Metadata } from 'next';
import Link from 'next/link';

import { ApiError, getShelter, listShelterAnimals } from '@/lib/api';
import type { AnimalPublic, ShelterDetail } from '@kithlink/contracts';

interface ShelterPageProps {
  params: { slug: string };
}

async function loadShelter(slug: string): Promise<
  { ok: true; shelter: ShelterDetail; animals: AnimalPublic[] } | { ok: false; message: string }
> {
  try {
    const shelter = await getShelter(slug);
    let animals: AnimalPublic[] = [];
    try {
      animals = await listShelterAnimals(slug);
    } catch {
      animals = [];
    }
    return { ok: true, shelter, animals };
  } catch (error) {
    return {
      ok: false,
      message:
        error instanceof ApiError
          ? error.message
          : 'Something went wrong while loading this shelter. Please try again later.',
    };
  }
}

export async function generateMetadata({ params }: ShelterPageProps): Promise<Metadata> {
  const result = await loadShelter(params.slug);
  return { title: result.ok ? result.shelter.name : 'Shelter' };
}

export default async function ShelterDetailPage({ params }: ShelterPageProps) {
  const result = await loadShelter(params.slug);

  if (!result.ok) {
    return (
      <main>
        <p role="alert" className="error">
          {result.message}
        </p>
        <Link href="/shelters">Back to shelters</Link>
      </main>
    );
  }

  const { shelter, animals } = result;

  return (
    <main>
      <p>
        <Link href="/shelters">← All shelters</Link>
      </p>
      <header className="card">
        <h1>{shelter.name}</h1>
        <p className="muted">
          {shelter.availableAnimalCount}{' '}
          {shelter.availableAnimalCount === 1 ? 'animal' : 'animals'} available
        </p>
      </header>

      <section aria-labelledby="animals-heading">
        <h2 id="animals-heading">Animals</h2>
        {animals.length === 0 ? (
          <p className="muted">No animals available.</p>
        ) : (
          <ul className="grid" style={{ listStyle: 'none' }}>
            {animals.map((animal) => (
              <li key={animal.id}>
                <article className="card" data-testid="animal-card">
                  <h3>{animal.name}</h3>
                  <p className="muted">
                    {animal.species}
                    {animal.breed ? ` · ${animal.breed}` : ''}
                  </p>
                  <span className="badge" data-status={animal.status}>
                    {animal.status}
                  </span>
                  {animal.status === 'available' ? (
                    <p style={{ marginBottom: 0 }}>
                      <Link className="button" data-testid="apply-link" href={`/apply/${animal.id}`}>
                        Apply
                      </Link>
                    </p>
                  ) : null}
                </article>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
