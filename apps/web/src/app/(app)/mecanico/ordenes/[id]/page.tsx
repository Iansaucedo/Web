'use client';
import { use } from 'react';
import { OrdenTaller } from '../../../../../components/OrdenTaller';

export default function OrdenMecanico({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return <OrdenTaller id={id} />;
}
