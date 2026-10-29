'use client';
import { useState } from 'react';
import Card from '@mui/material/Card';
import CardActionArea from '@mui/material/CardActionArea';
import CardContent from '@mui/material/CardContent';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { Cabecera } from '../../../../components/Comunes';
import { HistorialVehiculo } from '../../../../components/Historial';
import { useDatos } from '../../../../lib/hooks';
import type { Lista, Vehiculo } from '../../../../lib/tipos';

export default function Trazabilidad() {
  const [q, setQ] = useState('');
  const [sel, setSel] = useState<Vehiculo | null>(null);
  const res = useDatos<Lista<Vehiculo>>(q.trim().length >= 2 ? `/vehiculos?q=${encodeURIComponent(q.trim())}` : null);
  return (
    <>
      <Cabecera titulo="Trazabilidad" subtitulo="Qué piezas se pusieron y quitaron en cada vehículo, cuándo y quién." />
      <TextField label="Matrícula, marca o cliente" value={q} onChange={(e) => { setQ(e.target.value); setSel(null); }} sx={{ maxWidth: 420, mb: 2 }} autoFocus />
      {!sel && res.datos && (
        <Stack spacing={1}>
          {res.datos.datos.map((v) => (
            <Card key={v.id}>
              <CardActionArea onClick={() => setSel(v)}>
                <CardContent><Typography sx={{ fontWeight: 500 }}>{v.matricula} · {v.marca} {v.modelo}</Typography><Typography variant="body2" color="text.secondary">{v.cliente.razonSocial ?? v.cliente.nombre}</Typography></CardContent>
              </CardActionArea>
            </Card>
          ))}
          {!res.datos.datos.length && <Typography color="text.secondary">Ningún vehículo coincide.</Typography>}
        </Stack>
      )}
      {sel && (
        <>
          <Typography variant="h5" component="h2" sx={{ mb: 2 }}>{sel.matricula} · {sel.marca} {sel.modelo}</Typography>
          <HistorialVehiculo vehiculoId={sel.id} />
        </>
      )}
    </>
  );
}
