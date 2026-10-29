import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import { Proveedores } from '../components/Proveedores';

export const metadata: Metadata = { title: 'TallerPro', description: 'Citas, reparaciones y seguimiento del taller' };
export const viewport: Viewport = { width: 'device-width', initialScale: 1, themeColor: '#01687D' };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="es">
      <head>
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Roboto:wght@400;500;700&display=swap" />
      </head>
      <body>
        <Proveedores>{children}</Proveedores>
      </body>
    </html>
  );
}
