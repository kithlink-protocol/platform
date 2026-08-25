export const runtime = 'nodejs';
export const dynamic = process.env.NEXT_OUTPUT_MODE === 'export'
  ? 'force-static'
  : 'force-dynamic';
export function generateStaticParams() {
  if (process.env.NEXT_OUTPUT_MODE === 'export') {
    return [{ slug: '_excluded', file: ['_skip'] }];
  }
  return [];
}

const API_URL = process.env.API_URL ?? 'http://localhost:4000';

export async function GET(
  req: Request,
  { params }: { params: { slug: string; file?: string[] } },
): Promise<Response> {
  if (process.env.NEXT_OUTPUT_MODE === 'export') {
    return new Response('Static export — site serving requires the API server.', { status: 501 });
  }
  const { slug, file } = params;
  if (!slug || slug.includes('..')) return new Response('Not found', { status: 404 });
  const filePath = (file ?? ['index.html']).join('/');
  const upstream = await fetch(`${API_URL}/public/v1/sites/${encodeURIComponent(slug)}/${filePath}`);
  if (!upstream.ok) {
    return new Response(upstream.body, { status: upstream.status });
  }
  const headers = new Headers();
  upstream.headers.forEach((v, k) => {
    if (k !== 'transfer-encoding' && k !== 'content-encoding') headers.set(k, v);
  });
  return new Response(upstream.body, { status: 200, headers });
}
