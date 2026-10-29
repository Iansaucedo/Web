/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  poweredByHeader: false,
  // El navegador solo habla con este dominio; /api/* se reenvía a Express.
  // Así la cookie de sesión es first-party también en *.azurewebsites.net.
  async rewrites() {
    return [{ source: '/api/:path*', destination: `${process.env.API_INTERNAL_URL ?? 'http://localhost:4000'}/api/:path*` }];
  },
  async redirects() {
    // Enlaces que llegan desde los emails.
    return [{ source: '/citas', destination: '/ordenes', permanent: false }];
  },
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
        ],
      },
    ];
  },
};

export default nextConfig;
