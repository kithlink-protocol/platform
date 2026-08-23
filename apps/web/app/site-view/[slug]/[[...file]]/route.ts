export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const API_URL = process.env.API_URL ?? 'http://localhost:4000';

export async function GET(
  _req: Request,
  { params }: { params: { slug: string; file?: string[] } },
) {
  const file = params.file?.join('/') ?? 'index.html';
  if (file.split('/').some(part => part === '..' || part === '')) {
    return new Response('Bad request', { status: 400 });
  }

  let upstream: Response;
  try {
    upstream = await fetch(
      `${API_URL}/public/v1/sites/${encodeURIComponent(params.slug)}/${file}`,
      { cache: 'no-store' },
    );
  } catch {
    return new Response('Site upstream unavailable', { status: 502 });
  }

  if (!upstream.ok || upstream.body === null) {
    const status = upstream.status === 404 ? 404 : 502;
    return new Response(status === 404 ? 'Not found' : 'Site upstream error', {
      status,
    });
  }

  const headers = new Headers();
  headers.set(
    'Content-Type',
    upstream.headers.get('content-type') ?? 'text/html; charset=utf-8',
  );
  headers.set('Cache-Control', 'public, max-age=60');
  return new Response(upstream.body, { status: 200, headers });
}
