'use client';

import Link from 'next/link';
import { useEffect, useState, type FormEvent } from 'react';

import { apiFetch, ClientApiError } from '@/lib/client-api';
import type {
  ApplicantProfilePublic,
  RentalPropertyPublic,
  UniversalApplication,
  UpsertApplicantProfileInput,
} from '@kithlink/contracts';

type ProfileResponse = ApplicantProfilePublic & { address?: string | null };

type SectionKey = keyof UniversalApplication;

const SECTIONS: { key: SectionKey; label: string }[] = [
  { key: 'household', label: 'Household' },
  { key: 'residence', label: 'Residence' },
  { key: 'landlord', label: 'Landlord' },
  { key: 'currentPets', label: 'Current Pets' },
  { key: 'petHistory', label: 'Pet History' },
  { key: 'lifestyle', label: 'Lifestyle' },
  { key: 'preferences', label: 'Preferences' },
  { key: 'vetCare', label: 'Vet Care' },
];

type FieldType = 'text' | 'textarea' | 'number' | 'bool' | 'select';

interface FieldDef {
  name: string;
  label: string;
  type: FieldType;
  max?: number;
  rows?: number;
  options?: readonly string[];
  csv?: boolean;
}

const SECTION_FIELDS: Record<SectionKey, FieldDef[]> = {
  household: [
    { name: 'adults', label: 'Adults in home', type: 'number' },
    { name: 'childrenAges', label: 'Children ages', type: 'text', csv: true },
    { name: 'allAgreed', label: 'Everyone in the household agrees to adopt', type: 'bool' },
    { name: 'primaryCaregiver', label: 'Primary caregiver', type: 'text', max: 200 },
    { name: 'allergies', label: 'Allergies', type: 'textarea', max: 500, rows: 2 },
  ],
  residence: [
    {
      name: 'type',
      label: 'Residence type',
      type: 'select',
      options: ['house', 'apartment', 'condo', 'townhouse', 'mobile', 'other'],
    },
    { name: 'ownOrRent', label: 'Own or rent', type: 'select', options: ['own', 'rent'] },
    { name: 'yard', label: 'Yard', type: 'bool' },
    { name: 'fenceType', label: 'Fence type', type: 'text', max: 120 },
    { name: 'hoursAlonePerDay', label: 'Hours pet is alone per day', type: 'number' },
    {
      name: 'petLocation',
      label: 'Where will the pet stay',
      type: 'select',
      options: ['indoors', 'outdoors', 'both'],
    },
  ],
  landlord: [
    { name: 'name', label: 'Landlord name', type: 'text', max: 200 },
    { name: 'phone', label: 'Landlord phone', type: 'text', max: 30 },
    { name: 'propertyName', label: 'Property name', type: 'text', max: 200 },
    { name: 'city', label: 'City', type: 'text', max: 120 },
    { name: 'state', label: 'State', type: 'text', max: 2 },
    { name: 'petPolicyKnown', label: 'Pet policy confirmed', type: 'bool' },
    { name: 'petDeposit', label: 'Pet deposit ($)', type: 'number' },
    { name: 'monthlyPetRent', label: 'Monthly pet rent ($)', type: 'number' },
    { name: 'breedRestrictions', label: 'Breed restrictions', type: 'text', max: 300 },
    { name: 'weightLimit', label: 'Weight limit (lbs)', type: 'number' },
    { name: 'approvalConfirmed', label: 'Landlord approval confirmed', type: 'bool' },
  ],
  currentPets: [],
  petHistory: [
    { name: 'hadPetsBefore', label: 'Had pets before', type: 'bool' },
    { name: 'previousPetsDesc', label: 'Previous pets', type: 'textarea', max: 600, rows: 3 },
    { name: 'everSurrendered', label: 'Ever surrendered a pet', type: 'bool' },
    { name: 'surrenderReason', label: 'If so, why', type: 'textarea', max: 400, rows: 2 },
  ],
  lifestyle: [
    { name: 'exercisePlan', label: 'Exercise plan', type: 'textarea', max: 400, rows: 2 },
    { name: 'trainingPlan', label: 'Training plan', type: 'textarea', max: 400, rows: 2 },
    { name: 'behaviorPlan', label: 'Behavior issue plan', type: 'textarea', max: 400, rows: 2 },
    { name: 'transportPlan', label: 'Transport plan', type: 'text', max: 200 },
    { name: 'careIfUnable', label: 'Care if you are unable', type: 'text', max: 300 },
  ],
  preferences: [
    {
      name: 'sexPreference',
      label: 'Sex preference',
      type: 'select',
      options: ['male', 'female', 'no_preference'],
    },
    {
      name: 'sizePreference',
      label: 'Size preference',
      type: 'select',
      options: ['small', 'medium', 'large', 'xl', 'no_preference'],
    },
    { name: 'ageRange', label: 'Age range', type: 'text', max: 60 },
    { name: 'traitsWanted', label: 'Traits wanted', type: 'text', max: 300 },
  ],
  vetCare: [
    { name: 'currentVet', label: 'Current vet', type: 'text', max: 200 },
    { name: 'financialReady', label: 'Financially ready for vet care', type: 'bool' },
    { name: 'insuranceConsidered', label: 'Pet insurance considered', type: 'bool' },
  ],
};

function fieldValue(value: Record<string, unknown>, def: FieldDef): string {
  const v = value[def.name];
  if (def.csv) return Array.isArray(v) ? v.join(', ') : '';
  if (v === undefined || v === null) return '';
  return String(v);
}

function parseFieldValue(def: FieldDef, raw: string): unknown {
  if (def.csv) return raw.split(',').map(s => Number(s.trim())).filter(n => Number.isInteger(n));
  if (def.type === 'number') {
    if (raw.trim() === '') return undefined;
    const n = Number(raw);
    return Number.isFinite(n) ? n : undefined;
  }
  if (def.type === 'select') return raw === '' ? undefined : raw;
  return raw;
}

interface SectionFieldsProps {
  value: Record<string, unknown>;
  fields: FieldDef[];
  prefix: string;
  onChange: (name: string, next: unknown) => void;
}

function SectionFields({ value, fields, prefix, onChange }: SectionFieldsProps) {
  return (
    <>
      {fields.map(def => (
        <div className="form-row" key={def.name}>
          <label htmlFor={`${prefix}-${def.name}`}>{def.label}</label>
          {def.type === 'bool' ? (
            <label htmlFor={`${prefix}-${def.name}`}>
              <input
                id={`${prefix}-${def.name}`}
                type="checkbox"
                checked={Boolean(value[def.name])}
                onChange={event => onChange(def.name, event.target.checked)}
              />
            </label>
          ) : def.type === 'select' ? (
            <select
              id={`${prefix}-${def.name}`}
              className="input"
              value={fieldValue(value, def)}
              onChange={event => onChange(def.name, parseFieldValue(def, event.target.value))}
            >
              <option value="">—</option>
              {(def.options ?? []).map(opt => (
                <option key={opt} value={opt}>
                  {opt}
                </option>
              ))}
            </select>
          ) : def.type === 'textarea' ? (
            <textarea
              id={`${prefix}-${def.name}`}
              rows={def.rows ?? 2}
              maxLength={def.max}
              className="input"
              value={fieldValue(value, def)}
              onChange={event => onChange(def.name, parseFieldValue(def, event.target.value))}
            />
          ) : (
            <input
              id={`${prefix}-${def.name}`}
              type={def.type === 'number' ? 'number' : 'text'}
              maxLength={def.max}
              className="input"
              value={fieldValue(value, def)}
              onChange={event => onChange(def.name, parseFieldValue(def, event.target.value))}
            />
          )}
        </div>
      ))}
    </>
  );
}

function UniversalApplicationPanel() {
  const [uni, setUni] = useState<UniversalApplication>({});
  const [loaded, setLoaded] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [open, setOpen] = useState<SectionKey | null>(null);
  const [status, setStatus] = useState<Record<string, string | undefined>>({});
  const [suggestions, setSuggestions] = useState<RentalPropertyPublic[]>([]);

  useEffect(() => {
    let active = true;
    apiFetch<UniversalApplication>('/app/v1/me/universal-application')
      .then(data => {
        if (!active) return;
        setUni(data);
        setLoaded(true);
      })
      .catch((err: unknown) => {
        if (!active) return;
        setLoadError(
          err instanceof ClientApiError
            ? err.message
            : 'Something went wrong while loading your universal application.'
        );
        setLoaded(true);
      });
    return () => {
      active = false;
    };
  }, []);

  const landlordName = uni.landlord?.propertyName ?? '';
  const landlordCity = uni.landlord?.city ?? '';

  useEffect(() => {
    if (open !== 'landlord' || landlordName.trim().length < 2) {
      setSuggestions([]);
      return;
    }
    const timer = setTimeout(() => {
      const params = new URLSearchParams({ q: landlordName.trim() });
      if (landlordCity.trim() !== '') params.set('city', landlordCity.trim());
      apiFetch<RentalPropertyPublic[]>(`/public/v1/rental-properties/search?${params.toString()}`)
        .then(results => setSuggestions(results.slice(0, 5)))
        .catch(() => setSuggestions([]));
    }, 300);
    return () => clearTimeout(timer);
  }, [open, landlordName, landlordCity]);

  function setSection(key: SectionKey, next: Record<string, unknown>) {
    setUni(prev => ({ ...prev, [key]: next }) as UniversalApplication);
  }

  async function saveSection(key: SectionKey) {
    setStatus(prev => ({ ...prev, [key]: 'saving' }));
    try {
      const body =
        key === 'currentPets'
          ? { currentPets: uni.currentPets ?? [] }
          : { [key]: uni[key] ?? {} };
      const saved = await apiFetch<UniversalApplication>('/app/v1/me/universal-application', {
        method: 'PUT',
        body: JSON.stringify(body),
      });
      setUni(saved);
      setStatus(prev => ({ ...prev, [key]: 'saved' }));
    } catch (err) {
      setStatus(prev => ({
        ...prev,
        [key]: err instanceof ClientApiError ? `error: ${err.message}` : 'error',
      }));
    }
  }

  async function confirmRental(property: RentalPropertyPublic) {
    try {
      await apiFetch('/app/v1/me/rental-properties', {
        method: 'POST',
        body: JSON.stringify({
          displayName: property.displayName,
          city: property.city,
          state: property.state,
          petPolicy: property.petPolicy,
        }),
      });
      setSection('landlord', {
        ...(uni.landlord ?? {}),
        propertyName: property.displayName,
        city: property.city,
        state: property.state,
        petPolicyKnown: property.petPolicy.allowed,
        petDeposit: property.petPolicy.deposit,
        monthlyPetRent: property.petPolicy.monthlyRent,
      });
      setSuggestions([]);
    } catch (err) {
      setStatus(prev => ({
        ...prev,
        landlord: err instanceof ClientApiError ? `error: ${err.message}` : 'error',
      }));
    }
  }

  function updatePet(index: number, patch: Record<string, unknown>) {
    const pets = [...(uni.currentPets ?? [])];
    pets[index] = { ...pets[index], ...patch };
    setUni(prev => ({ ...prev, currentPets: pets }));
  }

  function removePet(index: number) {
    setUni(prev => ({
      ...prev,
      currentPets: (prev.currentPets ?? []).filter((_, i) => i !== index),
    }));
  }

  if (!loaded && !loadError) return <p className="muted">Loading…</p>;

  return (
    <section className="section-gap" aria-labelledby="universal-app-heading">
      <h2 id="universal-app-heading">Universal Application</h2>
      <p className="muted">Fill once, share with every shelter you apply to.</p>
      {loadError ? (
        <p role="alert" className="alert alert-danger">
          {loadError}
        </p>
      ) : null}
      {SECTIONS.map(({ key, label }) => {
        const isOpen = open === key;
        const value = (uni[key] ?? {}) as Record<string, unknown>;
        return (
          <div key={key} data-testid={`universal-section-${key}`}>
            <button
              type="button"
              className="btn btn-secondary"
              aria-expanded={isOpen}
              aria-controls={`universal-panel-${key}`}
              onClick={() => setOpen(isOpen ? null : key)}
            >
              {isOpen ? '▾' : '▸'} {label}
            </button>
            {isOpen ? (
              <div id={`universal-panel-${key}`}>
                {key === 'currentPets' ? (
                  <>
                    {(uni.currentPets ?? []).map((pet, index) => (
                      <fieldset key={index} className="section-gap">
                        <legend>Pet {index + 1}</legend>
                        <div className="form-row">
                          <label htmlFor={`pet-${index}-species`}>Species</label>
                          <select
                            id={`pet-${index}-species`}
                            className="input"
                            value={pet.species ?? 'dog'}
                            onChange={event =>
                              updatePet(index, {
                                species: event.target.value as 'dog' | 'cat' | 'other',
                              })
                            }
                          >
                            <option value="dog">dog</option>
                            <option value="cat">cat</option>
                            <option value="other">other</option>
                          </select>
                        </div>
                        <div className="form-row">
                          <label htmlFor={`pet-${index}-age`}>Age</label>
                          <input
                            id={`pet-${index}-age`}
                            type="text"
                            maxLength={30}
                            className="input"
                            value={pet.age ?? ''}
                            onChange={event => updatePet(index, { age: event.target.value })}
                          />
                        </div>
                        <div className="form-row">
                          <label htmlFor={`pet-${index}-spayed`}>Spayed/neutered</label>
                          <input
                            id={`pet-${index}-spayed`}
                            type="checkbox"
                            checked={Boolean(pet.spayed)}
                            onChange={event =>
                              updatePet(index, { spayed: event.target.checked })
                            }
                          />
                        </div>
                        <div className="form-row">
                          <label htmlFor={`pet-${index}-getsAlong`}>Gets along with</label>
                          <input
                            id={`pet-${index}-getsAlong`}
                            type="text"
                            maxLength={300}
                            className="input"
                            value={pet.getsAlongWith ?? ''}
                            onChange={event =>
                              updatePet(index, { getsAlongWith: event.target.value })
                            }
                          />
                        </div>
                        <button type="button" className="btn" onClick={() => removePet(index)}>
                          Remove pet
                        </button>
                      </fieldset>
                    ))}
                    <button
                      type="button"
                      className="btn"
                      disabled={(uni.currentPets ?? []).length >= 8}
                      onClick={() =>
                        setUni(prev => ({
                          ...prev,
                          currentPets: [...(prev.currentPets ?? []), { species: 'dog', age: '' }],
                        }))
                      }
                    >
                      Add pet
                    </button>
                  </>
                ) : (
                  <SectionFields
                    value={value}
                    fields={SECTION_FIELDS[key]}
                    prefix={`universal-${key}`}
                    onChange={(name, next) =>
                      setSection(key, { ...value, [name]: next })
                    }
                  />
                )}
                {key === 'landlord' && suggestions.length > 0 ? (
                  <div className="form-row" data-testid="rental-suggestions">
                    <p className="muted">Known properties — click to prefill:</p>
                    {suggestions.map(s => (
                      <button
                        key={s.id}
                        type="button"
                        className="input"
                        data-testid="rental-suggestion"
                        onClick={() => confirmRental(s)}
                      >
                        <strong>{s.displayName}</strong> — {s.city}, {s.state} · pets{' '}
                        {s.petPolicy.allowed ? 'allowed' : 'not allowed'}
                        {s.petPolicy.deposit !== undefined
                          ? ` · deposit $${s.petPolicy.deposit}`
                          : ''}
                        {s.petPolicy.monthlyRent !== undefined
                          ? ` · $${s.petPolicy.monthlyRent}/mo pet rent`
                          : ''}{' '}
                        · confirmed ×{s.confirmedCount}
                      </button>
                    ))}
                  </div>
                ) : null}
                {status[key] === 'saved' ? (
                  <p role="status" className="alert alert-ok" data-testid={`universal-saved-${key}`}>
                    Saved
                  </p>
                ) : null}
                {status[key]?.startsWith('error') ? (
                  <p role="alert" className="alert alert-danger">
                    {status[key]!.startsWith('error: ')
                      ? status[key]!.slice('error: '.length)
                      : 'Something went wrong while saving this section.'}
                  </p>
                ) : null}
                <button
                  type="button"
                  className="btn btn-primary"
                  data-testid={`universal-save-${key}`}
                  disabled={status[key] === 'saving'}
                  onClick={() => void saveSection(key)}
                >
                  {status[key] === 'saving' ? 'Saving…' : `Save ${label.toLowerCase()}`}
                </button>
              </div>
            ) : null}
          </div>
        );
      })}
    </section>
  );
}

export default function ProfilePage() {
  const [loading, setLoading] = useState(true);
  const [legalName, setLegalName] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let active = true;
    apiFetch<ProfileResponse | null>('/app/v1/me/profile')
      .then(profile => {
        if (!active) return;
        if (profile) {
          setLegalName(profile.legalName);
          setDisplayName(profile.displayName ?? '');
          setPhone(profile.phone ?? '');
          setAddress(profile.address ?? '');
        }
        setLoading(false);
      })
      .catch((err: unknown) => {
        if (!active) return;
        if (err instanceof ClientApiError && err.status === 404) {
          setLoading(false);
          return;
        }
        setError(
          err instanceof ClientApiError
            ? err.message
            : 'Something went wrong while loading your profile.'
        );
        setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    setSaved(false);
    const body: UpsertApplicantProfileInput = {
      legalName,
      displayName: displayName.trim() ? displayName.trim() : null,
      phone: phone.trim() ? phone.trim() : null,
      address: address.trim() ? address.trim() : null,
    };
    try {
      await apiFetch('/app/v1/me/profile', { method: 'PUT', body: JSON.stringify(body) });
      setSaved(true);
    } catch (err) {
      setError(
        err instanceof ClientApiError
          ? err.message
          : 'Something went wrong while saving your profile.'
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <main id="main-content" className="container prose">
      <h1 className="t-title">Your profile</h1>
      {loading ? (
        <p className="muted">Loading…</p>
      ) : (
        <>
          <form onSubmit={onSubmit}>
            <div className="form-row">
              <label htmlFor="legalName">Legal name</label>
              <input
                id="legalName"
                name="legalName"
                type="text"
                className="input"
                autoComplete="name"
                required
                minLength={2}
                value={legalName}
                onChange={event => setLegalName(event.target.value)}
              />
            </div>
            <div className="form-row">
              <label htmlFor="displayName">Display name</label>
              <input
                id="displayName"
                name="displayName"
                type="text"
                className="input"
                value={displayName}
                onChange={event => setDisplayName(event.target.value)}
              />
            </div>
            <div className="form-row">
              <label htmlFor="phone">Phone</label>
              <input
                id="phone"
                name="phone"
                type="tel"
                className="input"
                placeholder="+15551230000"
                value={phone}
                onChange={event => setPhone(event.target.value)}
              />
            </div>
            <div className="form-row">
              <label htmlFor="address">Address</label>
              <textarea
                id="address"
                name="address"
                rows={3}
                className="input"
                value={address}
                onChange={event => setAddress(event.target.value)}
              />
            </div>
            {error ? (
              <p role="alert" className="alert alert-danger">
                {error}
              </p>
            ) : null}
            {saved ? (
              <p role="status" className="alert alert-ok" data-testid="success-msg">
                Profile saved
              </p>
            ) : null}
            <button className="btn btn-primary" type="submit" disabled={saving}>
              {saving ? 'Saving…' : 'Save profile'}
            </button>
          </form>
          <UniversalApplicationPanel />
          <p className="section-gap">
            <Link href="/dashboard">← Back to dashboard</Link>
          </p>
        </>
      )}
    </main>
  );
}
