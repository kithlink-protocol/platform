import type { Metadata } from 'next';
import Link from 'next/link';
import type { ReactNode } from 'react';

import './globals.css';

export const metadata: Metadata = {
  title: {
    default: 'Kithlink',
    template: '%s · Kithlink',
  },
  description:
    'One pet adoption profile, verified once, shared with every shelter.',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <nav className="site-nav" aria-label="Primary">
          <Link href="/">Home</Link>
          <span aria-hidden="true">·</span>
          <Link href="/shelters">Shelters</Link>
          <span aria-hidden="true">·</span>
          <Link href="/dashboard">Dashboard</Link>
        </nav>
        <div className="container">{children}</div>
      </body>
    </html>
  );
}
