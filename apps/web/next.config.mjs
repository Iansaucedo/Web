// Política de contenido. Next y MUI (emotion) meten scripts y estilos en línea, por eso 'unsafe-inline';
// en desarrollo, la recarga en caliente necesita además 'unsafe-eval'. Las fotos antiguas pueden venir por https.
const desarrollo = process.env.NODE_ENV !== 'production';
const CSP = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${desarrollo ? " 'unsafe-eval'" : ''}`,
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' data: https://fonts.gstatic.com",
  "img-src 'self' data: blob: https:",
  `connect-src 'self'${desarrollo ? ' ws:' : ''}`,
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join('; ');

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
        // Páginas de la web. /api/* no: Express pone sus propias cabeceras (Helmet) y un PDF con esta CSP no se vería.
        source: '/:path((?!api/).*)',
        headers: [
          { key: 'Content-Security-Policy', value: CSP },
          // Solo tiene efecto servida por HTTPS (en localhost por HTTP el navegador la ignora).
          { key: 'Strict-Transport-Security', value: 'max-age=31536000; includeSubDomains' },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
        ],
      },
    ];
  },
};

export default nextConfig;
