'use client';
import type { ReactNode } from 'react';
import { ThemeProvider } from '@mui/material/styles';
import CssBaseline from '@mui/material/CssBaseline';
import { AppRouterCacheProvider } from '@mui/material-nextjs/v15-appRouter';
import { theme } from '../theme';
import { ProveedorAvisos } from './Avisos';

export function Proveedores({ children }: { children: ReactNode }) {
  return (
    <AppRouterCacheProvider>
      <ThemeProvider theme={theme}>
        <CssBaseline />
        <ProveedorAvisos>{children}</ProveedorAvisos>
      </ThemeProvider>
    </AppRouterCacheProvider>
  );
}
