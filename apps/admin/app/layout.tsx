import type { Metadata } from 'next';
import type { ReactNode } from 'react';

import { AdminNav } from './nav';
import './globals.css';

export const metadata: Metadata = {
  title: {
    default: 'Kithlink Admin',
    template: '%s · Kithlink Admin',
  },
  description: 'Shelter dashboard for managing animals and adoption applications.',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <a className="skip-link" href="#main">
          Skip to content
        </a>
        <AdminNav />
        <div className="container" id="main">
          {children}
        </div>
      </body>
    </html>
  );
}
