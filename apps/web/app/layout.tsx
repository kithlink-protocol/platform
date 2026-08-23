import type { Metadata } from 'next';
import type { ReactNode } from 'react';

import { SiteNav } from '@/components/site-nav';

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
        <a className="skip-link" href="#main-content">
          Skip to content
        </a>
        <SiteNav />
        {children}
        <footer className="site-footer">
          <div className="container">
            <p className="t-caption">
              Kithlink — one profile, verified once, shared with every shelter.
            </p>
          </div>
        </footer>
      </body>
    </html>
  );
}
