'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const links = [
  { href: '/', label: 'Home' },
  { href: '/animals', label: 'Find a pet' },
  { href: '/shelters', label: 'Shelters' },
  { href: '/favorites', label: 'Favorites' },
  { href: '/dashboard', label: 'Dashboard' },
];

export function SiteNav() {
  const pathname = usePathname();

  return (
    <header className="site-header">
      <nav className="nav" aria-label="Primary">
        <div className="container nav-inner">
          <Link className="nav-brand" href="/">
            Kithlink
          </Link>
          <div className="nav-links">
            {links.map(link => {
              const active =
                link.href === '/'
                  ? pathname === '/'
                  : pathname.startsWith(link.href);
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  className={active ? 'active' : undefined}
                  aria-current={active ? 'page' : undefined}
                >
                  {link.label}
                </Link>
              );
            })}
          </div>
        </div>
      </nav>
    </header>
  );
}
