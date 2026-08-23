import Link from 'next/link';

const steps = [
  {
    title: 'Build your profile once',
    body: 'Create one reusable adopter profile — household, experience, and preferences — instead of retyping it for every shelter.',
  },
  {
    title: 'Upload documents once',
    body: 'Add your lease and vet or ID documents a single time. They are encrypted at rest (AES-256-GCM) and never shared without your consent.',
  },
  {
    title: 'Apply anywhere',
    body: 'Apply to any animal on Kithlink. Your verification travels with you, shared only with shelters you consent to — revoke anytime.',
  },
];

type Feature = {
  title: string;
  body: string;
  span2?: boolean;
};

const features: Feature[] = [
  {
    title: 'Reusable verified profile',
    body: 'Fill out your profile once and apply everywhere. Uploaded artifacts are encrypted at rest with AES-256-GCM and travel tamper-evidently between shelters.',
    span2: true,
  },
  {
    title: 'Consent-gated sharing',
    body: 'You decide who sees what, per shelter. Revoke anytime; shelters can view your documents only while an application is in review.',
  },
  {
    title: 'Application pipeline',
    body: 'Every application moves through a clear status machine with email updates at each step.',
  },
  {
    title: 'One-click shelter website',
    body: 'Each shelter gets a free public website on a kithlink subdomain or its own domain — animals included, zero code.',
    span2: true,
  },
  {
    title: 'Syndication built in',
    body: 'Listings reach Petfinder through the push adapter and stay available via RSS out of the box.',
  },
  {
    title: 'Open source',
    body: 'The core is AGPLv3, themes are MIT, and self-hosting is free under Docker Compose.',
  },
];

const faqs = [
  {
    q: 'Is it really free?',
    a: 'Yes. Kithlink is open source: the core is AGPLv3 and themes are MIT-licensed. You can self-host the whole platform free, and shelter websites are hosted at no cost.',
  },
  {
    q: 'Who can see my documents?',
    a: 'Only staff at shelters where you have an active consent — created when you apply. Other shelters never see file contents; at most they see that a document was previously confirmed by another shelter.',
  },
  {
    q: 'Do you make adoption decisions?',
    a: 'No. Shelters review applications and set outcomes themselves in their own pipeline. Kithlink provides the tools and an audit trail of staff actions, never decisions.',
  },
  {
    q: 'Can we use our own domain?',
    a: 'Every shelter gets a free subdomain today (for example happytail.sites.localhost in development). Verified custom domains are on the roadmap — point DNS at the site host once verified.',
  },
];

export default function HomePage() {
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: 'Kithlink',
    url: 'https://kithlink.org',
    description:
      'One pet adoption profile, filled out once, verified, and shared securely with every shelter you apply to.',
  };

  return (
    <main id="main-content">
      <section className="hero">
        <div className="container">
          <h1 className="t-display">Adopt with confidence. Run your shelter in minutes.</h1>
          <p className="t-lede">
            Kithlink gives adopters one reusable, verified profile — and gives
            shelters a free website, applicant pipeline, and syndication, with
            zero code.
          </p>
          <div className="hero-actions">
            <Link className="btn btn-primary" href="/shelters">
              Browse shelters
            </Link>
            <Link className="btn btn-secondary" href="/register?intent=shelter">
              Launch your shelter site
            </Link>
          </div>
        </div>
      </section>

      <div className="container section-gap">
        <section aria-labelledby="how-it-works">
          <h2 id="how-it-works" className="t-title">
            How it works
          </h2>
          <ul className="grid-bento section-gap">
            {steps.map((step, index) => (
              <li key={step.title}>
                <article className="card">
                  <p className="t-meta">{String(index + 1).padStart(2, '0')}</p>
                  <h3 className="t-heading">{step.title}</h3>
                  <p className="muted">{step.body}</p>
                </article>
              </li>
            ))}
          </ul>
        </section>

        <section aria-labelledby="features" className="section-gap">
          <h2 id="features" className="t-title">
            What ships in the box
          </h2>
          <ul className="grid-bento section-gap">
            {features.map(feature => (
              <li key={feature.title} className={feature.span2 ? 'bento-span-2' : undefined}>
                <article className="card">
                  <h3 className="t-heading">{feature.title}</h3>
                  <p className="muted">{feature.body}</p>
                </article>
              </li>
            ))}
          </ul>
        </section>

        <section aria-labelledby="for-shelters" className="section-gap">
          <div className="card">
            <h2 id="for-shelters" className="t-title">
              For shelters
            </h2>
            <ul className="menu muted">
              <li>15-minute setup — publish your site the same day.</li>
              <li>Volunteer-friendly admin with roles and audit trail.</li>
              <li>Works alongside your existing Petfinder listing.</li>
            </ul>
            <Link className="btn btn-primary" href="/register?intent=shelter">
              Launch your shelter site
            </Link>
          </div>
        </section>

        <section aria-labelledby="faq" className="section-gap">
          <h2 id="faq" className="t-title">
            FAQ
          </h2>
          <div className="menu section-gap">
            {faqs.map(faq => (
              <details key={faq.q} className="card">
                <summary className="t-subheading">{faq.q}</summary>
                <p className="muted">{faq.a}</p>
              </details>
            ))}
          </div>
        </section>
      </div>

      <footer className="site-footer">
        <div className="container menu">
          <nav aria-label="Footer">
            <ul className="nav-links">
              <li>
                <a href="https://github.com/Krishnacore/kithlink">Docs</a>
              </li>
              <li>
                <a href="https://github.com/Krishnacore/kithlink">GitHub</a>
              </li>
              <li>
                <span className="t-meta">License: AGPLv3 / MIT</span>
              </li>
            </ul>
          </nav>
        </div>
      </footer>

      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
    </main>
  );
}
