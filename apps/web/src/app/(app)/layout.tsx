'use client';
import type { ReactNode } from 'react';
import { ProveedorSesion } from '../../components/Sesion';
import { Shell } from '../../components/Shell';

export default function LayoutApp({ children }: { children: ReactNode }) {
  return (
    <ProveedorSesion>
      <Shell>{children}</Shell>
    </ProveedorSesion>
  );
}
