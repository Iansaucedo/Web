'use client';
import { createContext, useContext, useEffect, type ReactNode } from 'react';
import Box from '@mui/material/Box';
import CircularProgress from '@mui/material/CircularProgress';
import { useDatos } from '../lib/hooks';
import type { Usuario } from '../lib/tipos';
import { CuentaEnBaja } from './CuentaEnBaja';

const Ctx = createContext<{ usuario: Usuario; recargar: () => Promise<void> } | null>(null);

/** Carga el usuario con sesión. Si no hay sesión, redirige a /login. */
export function ProveedorSesion({ children }: { children: ReactNode }) {
  const { datos, error, recargar } = useDatos<Usuario>('/auth/me');

  useEffect(() => {
    if (error && typeof window !== 'undefined' && !window.location.pathname.startsWith('/login')) {
      window.location.href = `/login?volver=${encodeURIComponent(window.location.pathname)}`;
    }
  }, [error]);

  if (!datos) {
    return (
      <Box sx={{ display: 'grid', placeItems: 'center', height: '100vh' }} aria-busy="true">
        <CircularProgress aria-label="Cargando" />
      </Box>
    );
  }
  // Cuenta en autobaja: solo se puede recuperar o salir.
  if (datos.enBaja) return <CuentaEnBaja hasta={datos.enBaja.hasta} onRecuperada={recargar} />;
  return <Ctx.Provider value={{ usuario: datos, recargar }}>{children}</Ctx.Provider>;
}

export function useSesion() {
  const c = useContext(Ctx);
  if (!c) throw new Error('useSesion fuera de ProveedorSesion');
  return c;
}
