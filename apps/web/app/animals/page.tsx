import type { Metadata } from 'next';
import Link from 'next/link';

import { searchAnimals } from '@/lib/api';
import { FavoriteToggle } from '@/components/favorite-toggle';
import type { AnimalAgeClass, AnimalSearchItem } from '@kithlink/contracts';

interface AnimalsPageProps {
  searchParams: Record<string, string | string[] | undefined>;
}

export const metadata: Metadata = { title: 'Find a pet' };

const FILTER_KEYS = [
  'species',
  'sex',
  'size',
  'ageClass',
  'q',
  'shelterSlug',
  'nearLat',
  'nearLng',
  'radiusKm',
  'goodWithKids',
  'goodWithDogs',
  'goodWithCats',
  'energy',
] as const;

type FilterKey = (typeof FILTER_KEYS)[number];

type FilterQuery = Partial<Record<FilterKey, string>>;

function pick(
  params: AnimalsPageProps['searchParams'],
  key: string,
): string | undefined {
  const value = params[key];
  const raw = Array.isArray(value) ? value[0] : value;
  return raw !== undefined && raw !== '' ? raw : undefined;
}

function buildQuery(searchParams: AnimalsPageProps['searchParams']): FilterQuery {
  const query: FilterQuery = {};
  for (const key of FILTER_KEYS) {
    const value = pick(searchParams, key);
    if (value !== undefined) query[key] = value;
  }
  return query;
}

function toSearchParams(query: FilterQuery, cursor?: string): URLSearchParams {
  const usp = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== '') usp.set(key, value);
  }
  if (cursor) usp.set('cursor', cursor);
  return usp;
}

function ageClassLabel(ageClass: AnimalAgeClass): string {
  return ageClass.charAt(0).toUpperCase() + ageClass.slice(1);
}

function metaLine(animal: AnimalSearchItem): string {
  return [animal.sex !== 'unknown' ? animal.sex : null, animal.size ?? null, animal.breed ?? null]
    .filter(Boolean)
    .join(' · ');
}

export default async function AnimalsPage({ searchParams }: AnimalsPageProps) {
  const query = buildQuery(searchParams);
  const cursor = pick(searchParams, 'cursor');

  let items: AnimalSearchItem[] = [];
  let nextCursor: string | null = null;
  let failed = false;
  try {
    const result = await searchAnimals({ ...query, cursor });
    items = result.items;
    nextCursor = result.nextCursor;
  } catch {
    failed = true;
  }

  return (
    <main id="main-content" className="container">
      <header className="section-gap">
        <h1 className="t-title">Find a pet</h1>
        <p className="t-lede">Search available animals across every shelter on Kithlink.</p>
      </header>

      <form method="GET" action="/animals" aria-label="Search filters">
        <div className="form-row">
          <label htmlFor="f-q">Search</label>
          <input
            id="f-q"
            className="input"
            type="search"
            name="q"
            maxLength={120}
            defaultValue={query.q ?? ''}
            placeholder="Name, breed, or description"
          />
        </div>
        <div className="form-row">
          <label htmlFor="f-species">Species</label>
          <select id="f-species" className="input" name="species" defaultValue={query.species ?? ''}>
            <option value="">All species</option>
            <option value="dog">Dog</option>
            <option value="cat">Cat</option>
            <option value="other">Other</option>
          </select>
        </div>
        <div className="form-row">
          <label htmlFor="f-sex">Sex</label>
          <select id="f-sex" className="input" name="sex" defaultValue={query.sex ?? ''}>
            <option value="">Any sex</option>
            <option value="male">Male</option>
            <option value="female">Female</option>
          </select>
        </div>
        <div className="form-row">
          <label htmlFor="f-size">Size</label>
          <select id="f-size" className="input" name="size" defaultValue={query.size ?? ''}>
            <option value="">Any size</option>
            <option value="small">Small</option>
            <option value="medium">Medium</option>
            <option value="large">Large</option>
            <option value="xl">Extra large</option>
          </select>
        </div>
        <div className="form-row">
          <label htmlFor="f-age">Age group</label>
          <select id="f-age" className="input" name="ageClass" defaultValue={query.ageClass ?? ''}>
            <option value="">Any age</option>
            <option value="baby">Baby</option>
            <option value="young">Young</option>
            <option value="adult">Adult</option>
            <option value="senior">Senior</option>
          </select>
        </div>
        <fieldset className="form-row">
          <legend>Good with</legend>
          <div className="near-grid">
            <label>
              <input
                type="checkbox"
                name="goodWithKids"
                value="true"
                defaultChecked={query.goodWithKids === 'true'}
              />{' '}
              Kids
            </label>
            <label>
              <input
                type="checkbox"
                name="goodWithDogs"
                value="true"
                defaultChecked={query.goodWithDogs === 'true'}
              />{' '}
              Dogs
            </label>
            <label>
              <input
                type="checkbox"
                name="goodWithCats"
                value="true"
                defaultChecked={query.goodWithCats === 'true'}
              />{' '}
              Cats
            </label>
          </div>
        </fieldset>
        <div className="form-row">
          <label htmlFor="f-energy">Energy</label>
          <select id="f-energy" className="input" name="energy" defaultValue={query.energy ?? ''}>
            <option value="">Any energy</option>
            <option value="low">Low</option>
            <option value="medium">Medium</option>
            <option value="high">High</option>
          </select>
        </div>
        <fieldset className="form-row">
          <legend>Near</legend>
          <div className="near-grid">
            <label htmlFor="f-lat">
              Latitude
              <input
                id="f-lat"
                className="input"
                type="number"
                step="any"
                name="nearLat"
                defaultValue={query.nearLat ?? ''}
              />
            </label>
            <label htmlFor="f-lng">
              Longitude
              <input
                id="f-lng"
                className="input"
                type="number"
                step="any"
                name="nearLng"
                defaultValue={query.nearLng ?? ''}
              />
            </label>
            <label htmlFor="f-radius">
              Radius km
              <input
                id="f-radius"
                className="input"
                type="number"
                min="1"
                max="500"
                name="radiusKm"
                defaultValue={query.radiusKm ?? ''}
              />
            </label>
          </div>
        </fieldset>
        <div className="filter-actions">
          <button type="submit" className="btn btn-primary">
            Apply filters
          </button>
          <Link href="/animals" className="btn btn-ghost">
            Clear
          </Link>
        </div>
      </form>

      {failed ? (
        <p role="alert" className="alert alert-danger section-gap">
          Could not load animals. Please try again later.
        </p>
      ) : items.length === 0 ? (
        <div className="empty-state section-gap">
          <p>No animals match your filters.</p>
          <p className="t-meta">Try widening the search or clearing a filter.</p>
        </div>
      ) : (
        <>
          <ul className="grid-cards section-gap">
            {items.map((animal) => (
              <li key={animal.id}>
                <article
                  className="card card-link"
                  data-testid="animal-card"
                  data-species={animal.species}
                >
                  <h2 className="card-title">
                    <Link href={`/animals/${animal.id}`}>{animal.name}</Link>
                  </h2>
                  <FavoriteToggle animalId={animal.id} name={animal.name} />
                  <p>{animal.ageClass ? <span className="badge">{ageClassLabel(animal.ageClass)}</span> : null}</p>
                  <p className="t-meta">{metaLine(animal)}</p>
                  <p className="t-meta">
                    {animal.shelterName}
                    {animal.distanceKm !== null ? (
                      <>
                        {' '}
                        ·{' '}
                        <span className="badge" data-testid="distance-chip">
                          {animal.distanceKm} km
                        </span>
                      </>
                    ) : null}
                  </p>
                  <p>
                    <span className="badge" data-status={animal.status}>
                      {animal.status}
                    </span>
                  </p>
                </article>
              </li>
            ))}
          </ul>
          {nextCursor ? (
            <p className="section-gap">
              <Link
                className="btn btn-secondary"
                data-testid="load-more"
                href={`/animals?${toSearchParams(query, nextCursor).toString()}`}
              >
                Load more
              </Link>
            </p>
          ) : null}
        </>
      )}
    </main>
  );
}
