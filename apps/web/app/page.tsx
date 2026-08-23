import Link from 'next/link';

export default function HomePage() {
  return (
    <main className="page">
      <section className="card">
        <h1>Kithlink</h1>
        <p>
          One pet adoption profile, filled out once and shared securely with
          every shelter you apply to.
        </p>
        <Link className="button" href="/shelters">
          Browse shelters
        </Link>
      </section>
    </main>
  );
}
