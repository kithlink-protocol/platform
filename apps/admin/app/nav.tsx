'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const LINKS = [
  { href: '/dashboard', label: 'Dashboard' },
  { href: '/applications', label: 'Applications' },
  { href: '/site', label: 'Site' },
  { href: '/sync', label: 'Sync' },
] as const;

export function AdminNav() {
  const pathname = usePathname();
  return (
    <nav className="nav" aria-label="Primary">
      <Link className="wordmark" href="/">
        Kithlink
      </Link>
      <div className="nav-links">
        {LINKS.map((link) => {
          const active =
            pathname === link.href || pathname.startsWith(link.href + '/');
          return (
            <Link
              key={link.href}
              href={link.href}
              aria-current={active ? 'page' : undefined}
              className={active ? 'active' : undefined}
            >
              {link.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
