'use client';
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import CircularProgress from '@mui/material/CircularProgress';
import Typography from '@mui/material/Typography';
import { useDatos } from '../lib/hooks';
import type { Usuario } from '../lib/tipos';
import { CuentaEnBaja } from './CuentaEnBaja';

const Ctx = createContext<{ usuario: Usuario; recargar: () => Promise<void> } | null>(null);

/** Pausa antes del reintento n (2, 4, 8, 16, 30 s…). */
const pausa = (n: number) => Math.min(30_000, 2_000 * 2 ** n);

/**
 * Carga el usuario con sesión.
 * - Sin sesión (401): a /login. La API ya ha borrado la cookie, así que el login no rebota de vuelta aquí.
 * - Cualquier otro fallo (API caída o arrancando, 429, 500): se queda en la página y reintenta con pausas
 *   crecientes. Antes también mandaba a /login, el middleware devolvía a / porque la cookie seguía ahí, y la
 *   página entraba en un bucle de redirecciones que además mantenía saturada la API.
 */
export function ProveedorSesion({ children }: { children: ReactNode }) {
  const { datos, error, recargar } = useDatos<Usuario>('/auth/me');
  const [intentos, setIntentos] = useState(0);
  const sinSesion = error?.estado === 401;

  useEffect(() => {
    if (sinSesion && !window.location.pathname.startsWith('/login')) {
      window.location.href = `/login?volver=${encodeURIComponent(window.location.pathname)}`;
    }
  }, [sinSesion]);

  useEffect(() => {
    if (!error || sinSesion || datos) return;
    const t = setTimeout(() => {
      setIntentos((n) => n + 1);
      void recargar();
    }, pausa(intentos));
    return () => clearTimeout(t);
  }, [error, sinSesion, datos, intentos, recargar]);

  if (!datos) {
    if (error && !sinSesion) {
      return (
        <Box component="main" sx={{ display: 'grid', placeItems: 'center', minHeight: '100vh', p: 2, textAlign: 'center' }}>
          <Box sx={{ maxWidth: 420 }}>
            <Typography variant="h5" component="h1">No podemos conectar con el taller</Typography>
            <Typography color="text.secondary" sx={{ mt: 1, mb: 3 }} role="status">
              {error.estado === 429 ? 'Hay muchas peticiones seguidas.' : 'El servidor no responde ahora mismo.'} Lo volvemos a intentar solo en unos segundos.
            </Typography>
            <Button variant="contained" onClick={() => { setIntentos(0); void recargar(); }}>Reintentar ahora</Button>
          </Box>
        </Box>
      );
    }
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
