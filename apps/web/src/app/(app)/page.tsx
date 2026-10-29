'use client';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useSesion } from '../../components/Sesion';
import { rutaInicio } from '../../components/Shell';

/** El inicio lleva al panel de cada rol; un cliente sin perfil va primero a completarlo. */
export default function Inicio() {
  const { usuario } = useSesion();
  const router = useRouter();
  useEffect(() => {
    router.replace(usuario.rol === 'CLIENTE' && !usuario.cliente ? '/perfil' : rutaInicio(usuario.rol));
  }, [usuario, router]);
  return null;
}
