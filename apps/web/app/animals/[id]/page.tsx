import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';

import { getAnimal, resolveAssetUrl } from '@/lib/api';
import { FavoriteToggle } from '@/components/favorite-toggle';
import type { AnimalDetail } from '@kithlink/contracts';

interface AnimalDetailPageProps {
  params: { id: string };
}

async function loadAnimal(id: string) {
  try {
    return await getAnimal(id);
  } catch {
    return null;
  }
}

export async function generateMetadata({ params }: AnimalDetailPageProps): Promise<Metadata> {
  const animal = await loadAnimal(params.id);
  return { title: animal ? animal.name : 'Animal' };
}

function traitLabel(key: string, value: unknown): string | null {
  switch (key) {
    case 'goodWithKids':
      return value === true ? 'Good with kids' : null;
    case 'goodWithDogs':
      return value === true ? 'Good with dogs' : null;
    case 'goodWithCats':
      return value === true ? 'Good with cats' : null;
    case 'specialNeeds':
      return value === true ? 'Special needs' : null;
    case 'energyLevel':
      return typeof value === 'string' ? `Energy: ${value}` : null;
    default:
      return typeof value === 'string' || typeof value === 'number'
        ? `${key}: ${value}`
        : null;
  }
}

function ageFromBirthYear(birthYear: number | null): string | null {
  if (birthYear === null) return null;
  const years = new Date().getUTCFullYear() - birthYear;
  return `${years} ${years === 1 ? 'year' : 'years'}`;
}

function animalHeroPhoto(animal: AnimalDetail): AnimalDetail['photos'][number] | null {
  return animal.photos.find(photo => photo.url !== null) ?? null;
}

export default async function AnimalDetailPage({ params }: AnimalDetailPageProps) {
  const animal = await loadAnimal(params.id);
  if (!animal) notFound();

  const traitChips = Object.entries(animal.traits)
    .map(([key, value]) => traitLabel(key, value))
    .filter((label): label is string => label !== null);

  const vaccinations = Array.isArray(animal.medical.vaccinations)
    ? animal.medical.vaccinations.filter((v): v is string => typeof v === 'string')
    : [];

  const hero = animalHeroPhoto(animal);

  const sterilized =
    Boolean(animal.medical.spayNeuter) || animal.sterilization.status === 'completed';

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Animal',
    name: animal.name,
    species: animal.species,
    breed: animal.breed ?? undefined,
    sex: animal.sex,
    birthDate: animal.birthYear !== null ? String(animal.birthYear) : undefined,
    description: animal.description ?? undefined,
    homeLocation: {
      '@type': 'Place',
      name: animal.shelter.name,
      address: [animal.shelter.city, animal.shelter.state].filter(Boolean).join(', ') || undefined,
    },
  };

  return (
    <main id="main-content" className="container">
      <p className="section-gap">
        <Link href="/animals" className="t-caption">
          ← All pets
        </Link>
      </p>

      <div className="detail-grid">
        <section aria-label={`${animal.name} details`}>
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
              <span>{animal.name.charAt(0).toUpperCase()}</span>
            </div>
          )}
          <h1 className="t-title">{animal.name}</h1>
          <FavoriteToggle animalId={animal.id} name={animal.name} />
          <p>
            <span className="badge" data-status={animal.status}>
              {animal.status}
            </span>
            {animal.ageClass ? (
              <>
                {' '}
                <span className="badge">{animal.ageClass}</span>
              </>
            ) : null}
            {sterilized ? (
              <>
                {' '}
                <span className="badge" data-testid="steril-chip">
                  Spay/neutered
                </span>
              </>
            ) : null}
          </p>

          {animal.description ? (
            <p className="section-gap">{animal.description}</p>
          ) : (
            <p className="t-meta section-gap">No description yet.</p>
          )}

          {traitChips.length > 0 ? (
            <section aria-labelledby="traits-heading" className="section-gap">
              <h2 id="traits-heading" className="t-heading">
                Traits
              </h2>
              <p>
                {traitChips.map(label => (
                  <span key={label} className="badge">
                    {label}
                  </span>
                ))}
              </p>
            </section>
          ) : null}

          {vaccinations.length > 0 ? (
            <section aria-labelledby="medical-heading" className="section-gap">
              <h2 id="medical-heading" className="t-heading">
                Medical highlights
              </h2>
              <ul className="timeline">
                {vaccinations.map(vaccine => (
                  <li key={vaccine}>{vaccine}</li>
                ))}
              </ul>
            </section>
          ) : null}

          {animal.observations.length > 0 ? (
            <details className="section-gap">
              <summary className="t-heading">Behavior notes from the shelter</summary>
              <p className="t-caption">Observations are snapshots in time — not verdicts.</p>
              <ul className="timeline">
                {animal.observations.map(observation => (
                  <li key={observation.id}>
                    {new Date(observation.createdAt).toISOString().slice(0, 10)}
                    {observation.fasScore !== null ? ` · stress ${observation.fasScore}/4` : null}
                    {observation.tags.length > 0 ? ` · ${observation.tags.join(', ')}` : null}
                    {observation.note ? (
                      <p>{observation.note}</p>
                    ) : null}
                  </li>
                ))}
              </ul>
            </details>
          ) : null}
        </section>

        <aside aria-label="Shelter and apply">
          <div className="card">
            <h2 className="card-title">
              <Link href={`/shelters/${animal.shelter.slug}`}>{animal.shelter.name}</Link>
            </h2>
            {[animal.shelter.city, animal.shelter.state].filter(Boolean).join(', ') ? (
              <p className="t-meta">
                {[animal.shelter.city, animal.shelter.state].filter(Boolean).join(', ')}
              </p>
            ) : null}
            <dl className="t-meta">
              <div>
                <dt>Sex</dt>
                <dd>{animal.sex}</dd>
              </div>
              <div>
                <dt>Size</dt>
                <dd>{animal.size ?? 'Unknown'}</dd>
              </div>
              <div>
                <dt>Age</dt>
                <dd>{ageFromBirthYear(animal.birthYear) ?? 'Unknown'}</dd>
              </div>
              <div>
                <dt>Listed</dt>
                <dd>{new Date(animal.createdAt).toISOString().slice(0, 10)}</dd>
              </div>
            </dl>
            <p className="section-gap">
              <Link className="btn btn-primary" data-testid="apply-link" href={`/apply/${animal.id}`}>
                Apply to adopt
              </Link>
            </p>
          </div>
        </aside>
      </div>

      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
    </main>
  );
}
