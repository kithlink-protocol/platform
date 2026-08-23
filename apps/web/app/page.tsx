import Link from 'next/link';

const features = [
  {
    title: 'Verified once, trusted everywhere',
    body: 'Upload your documents a single time. Kithlink verifies them and every shelter you apply to receives the same portable, tamper-evident artifacts — no re-sending, no re-explaining.',
  },
  {
    title: 'Shelters in control',
    body: 'Applicants grant consent per shelter, and shelters see exactly what was shared. Revoking consent stops all sharing immediately.',
  },
  {
    title: 'Free shelter websites',
    body: 'Every shelter gets a one-click public website with its adoptable animals, hosted by Kithlink at no cost — no developer required.',
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
          <h1 className="t-display">One profile. Every shelter.</h1>
          <p className="t-lede">
            One pet adoption profile, filled out once and shared securely with
            every shelter you apply to.
          </p>
          <div className="hero-actions">
            <Link className="btn btn-primary" href="/shelters">
              Browse shelters
            </Link>
            <Link className="btn btn-ghost" href="/shelters">
              For shelters
            </Link>
          </div>
        </div>
      </section>
      <div className="container section-gap">
        <section aria-label="Why Kithlink">
          <ul className="grid-bento">
            {features.map(feature => (
              <li key={feature.title}>
                <article className="card">
                  <h2 className="t-heading">{feature.title}</h2>
                  <p className="muted">{feature.body}</p>
                </article>
              </li>
            ))}
          </ul>
        </section>
      </div>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
    </main>
  );
}
