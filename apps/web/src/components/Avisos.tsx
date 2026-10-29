'use client';
import { createContext, useCallback, useContext, useState, type ReactNode } from 'react';
import Snackbar from '@mui/material/Snackbar';
import Alert from '@mui/material/Alert';

type Gravedad = 'success' | 'error' | 'info' | 'warning';
const Ctx = createContext<{ avisar: (texto: string, gravedad?: Gravedad) => void }>({ avisar: () => undefined });

export function ProveedorAvisos({ children }: { children: ReactNode }) {
  const [aviso, setAviso] = useState<{ texto: string; gravedad: Gravedad; id: number } | null>(null);
  const avisar = useCallback((texto: string, gravedad: Gravedad = 'success') => setAviso({ texto, gravedad, id: Date.now() }), []);
  return (
    <Ctx.Provider value={{ avisar }}>
      {children}
      <Snackbar key={aviso?.id} open={Boolean(aviso)} autoHideDuration={5000} onClose={() => setAviso(null)} anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}>
        <Alert severity={aviso?.gravedad ?? 'success'} variant="filled" onClose={() => setAviso(null)} sx={{ width: '100%' }}>
          {aviso?.texto}
        </Alert>
      </Snackbar>
    </Ctx.Provider>
  );
}

export const useAvisos = () => useContext(Ctx);
