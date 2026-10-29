import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Rutas públicas que no deben ser interceptadas
  if (
    pathname.startsWith('/api') ||
    pathname.startsWith('/_next') ||
    pathname.includes('.') // archivos estáticos (favicon.ico, imágenes, fuentes, etc.)
  ) {
    return NextResponse.next();
  }

  const sesion = request.cookies.get('taller_sesion')?.value;

  // Si intenta acceder al login teniendo ya sesión activa, redirigir al inicio
  if (pathname.startsWith('/login')) {
    if (sesion) {
      const url = request.nextUrl.clone();
      url.pathname = '/';
      url.search = '';
      return NextResponse.redirect(url);
    }
    return NextResponse.next();
  }

  // Cualquier otra ruta exige sesión iniciada; si no hay sesión, obligar a ir a /login
  if (!sesion) {
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    if (pathname !== '/') {
      url.searchParams.set('volver', pathname);
    }
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico).*)'],
};
