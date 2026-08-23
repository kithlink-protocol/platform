import { NextResponse, type NextRequest } from 'next/server';

const PRIMARY_HOSTS = (
  process.env.APP_PRIMARY_HOSTS ?? 'localhost:3000,127.0.0.1:3000'
)
  .split(',')
  .map(host => host.trim().toLowerCase())
  .filter(Boolean);

const API_URL = process.env.API_URL ?? 'http://localhost:4000';

export const config = {
  matcher: ['/((?!api/|_next/|favicon.ico|.*\\..*).*)'],
};

export async function middleware(req: NextRequest) {
  const hostWithPort = (req.headers.get('host') ?? '').trim().toLowerCase();
  const bareHost = hostWithPort.split(':')[0] ?? '';
  if (
    !bareHost ||
    PRIMARY_HOSTS.includes(hostWithPort) ||
    PRIMARY_HOSTS.includes(bareHost)
  ) {
    return NextResponse.next();
  }

  let slug: string | undefined;
  try {
    const res = await fetch(
      `${API_URL}/public/v1/sites/resolve?host=${encodeURIComponent(bareHost)}`,
      { cache: 'no-store' },
    );
    if (res.ok) {
      const data = (await res.json()) as { slug?: unknown };
      if (typeof data.slug === 'string' && data.slug) slug = data.slug;
    }
  } catch {
    return NextResponse.next();
  }
  if (!slug) return NextResponse.next();

  const pathname = req.nextUrl.pathname === '/' ? '' : req.nextUrl.pathname;
  return NextResponse.rewrite(
    new URL(`/site-view/${slug}${pathname}${req.nextUrl.search}`, req.url),
  );
}
