import type { Metadata } from 'next';
import Link from 'next/link';

import { ApiError, getShelter, listShelterAnimals, resolveAssetUrl } from '@/lib/api';
import { FavoriteToggle } from '@/components/favorite-toggle';
import type { AnimalPublic, ShelterDetail } from '@kithlink/contracts';

export function generateStaticParams() { return [{ slug: 'preview' }, { id: 'preview' }]; }

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

function animalMetaLine(animal: AnimalPublic): string {
  return [
    animal.species,
    animal.breed ?? null,
    animal.sex !== 'unknown' ? animal.sex : null,
    animal.size ?? null,
  ]
    .filter(Boolean)
    .join(' · ');
}

function animalHeroPhoto(animal: AnimalPublic): AnimalPublic['photos'][number] | null {
  return animal.photos.find(photo => photo.url !== null) ?? null;
}

export default async function ShelterDetailPage({ params }: ShelterPageProps) {
  const result = await loadShelter(params.slug);

  if (!result.ok) {
    return (
      <main id="main-content" className="container prose">
        <p role="alert" className="alert alert-danger">
          {result.message}
        </p>
        <p>
          <Link href="/shelters">Back to shelters</Link>
        </p>
      </main>
    );
  }

  const { shelter, animals } = result;

  return (
    <main id="main-content" className="container">
      <header className="shelter-header">
        <p>
          <Link href="/shelters" className="t-caption">
            ← All shelters
          </Link>
        </p>
        <h1 className="t-title">{shelter.name}</h1>
        {[shelter.city, shelter.state].filter(Boolean).join(', ') ? (
          <p className="t-meta" data-testid="shelter-location">
            {[shelter.city, shelter.state].filter(Boolean).join(', ')}
          </p>
        ) : null}
        <p className="t-meta">
          {shelter.availableAnimalCount}{' '}
          {shelter.availableAnimalCount === 1 ? 'animal' : 'animals'} available
        </p>
      </header>

      <section aria-labelledby="animals-heading">
        <h2 id="animals-heading" className="t-heading">
          Animals
        </h2>
        {animals.length === 0 ? (
          <div className="empty-state">No animals available.</div>
        ) : (
          <ul className="grid-cards section-gap">
            {animals.map((animal) => {
              const hero = animalHeroPhoto(animal);
              return (
                <li key={animal.id}>
                  <article className="card" data-testid="animal-card">
                    {hero && hero.url ? (
                      <div className="animal-photo">
                        <img
                          src={resolveAssetUrl(hero.url)}
                          alt={hero.altText ?? `${animal.name} photo`}
                          loading="lazy"
                        />
                      </div>
                    ) : (
                      <div className="animal-photo" aria-hidden="true">
                        <span>{animal.species.charAt(0).toUpperCase()}</span>
                      </div>
                    )}
                    <h3 className="card-title">{animal.name}</h3>
                    <FavoriteToggle animalId={animal.id} name={animal.name} />
                    <p className="t-meta">{animalMetaLine(animal)}</p>
                    <p>
                      <span className="badge" data-status={animal.status}>
                        {animal.status}
                      </span>
                    </p>
                    {animal.status === 'available' ? (
                      <p>
                        <Link
                          className="btn btn-primary btn-sm"
                          data-testid="apply-link"
                          href={`/apply/${animal.id}`}
                        >
                          Apply
                        </Link>
                      </p>
                    ) : null}
                  </article>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </main>
  );
}
