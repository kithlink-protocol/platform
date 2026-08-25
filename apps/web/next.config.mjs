/** @type {import('next').NextConfig} */
const isExport = process.env.NEXT_OUTPUT_MODE === 'export';
const apiUrl = process.env.API_URL ?? 'http://localhost:4000';

const nextConfig = {
  ...(isExport ? { output: 'export', images: { unoptimized: true } } : { output: 'standalone' }),
  async rewrites() {
    if (isExport) return [];
    return [{ source: '/api/:path*', destination: `${apiUrl}/:path*` }];
  },
};

export default nextConfig;
