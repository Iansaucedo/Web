'use client';
import { useState } from 'react';
import Link from 'next/link';
import Card from '@mui/material/Card';
import CardActionArea from '@mui/material/CardActionArea';
import CardContent from '@mui/material/CardContent';
import Grid from '@mui/material/Grid2';
import Stack from '@mui/material/Stack';
import ToggleButton from '@mui/material/ToggleButton';
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup';
import Typography from '@mui/material/Typography';
import { Cabecera, Carga, Vacio } from '../../../components/Comunes';
import { ChipEstado } from '../../../components/ChipEstado';
import { TarjetaFichaje } from '../../../components/Fichar';
import { useDatos } from '../../../lib/hooks';
import { ESTADO_ORDEN, fechaHora } from '../../../lib/formato';
import type { Lista, OrdenResumen } from '../../../lib/tipos';

export default function PanelMecanico() {
  const [ver, setVer] = useState<'mias' | 'todas'>('mias');
  const ordenes = useDatos<Lista<OrdenResumen>>(ver === 'mias' ? '/ordenes?mias=true' : '/ordenes?abiertas=true');
  return (
    <>
      <Cabecera titulo="Mis órdenes de hoy" />
      <Stack spacing={3}>
        <TarjetaFichaje />
        <ToggleButtonGroup exclusive size="small" value={ver} onChange={(_, v) => v && setVer(v)} aria-label="Qué órdenes ver">
          <ToggleButton value="mias">Mis puestos de hoy</ToggleButton>
          <ToggleButton value="todas">Todo el taller</ToggleButton>
        </ToggleButtonGroup>
        <Carga {...ordenes}>
          {(d) =>
            d.datos.length ? (
              <Grid container spacing={2}>
                {d.datos.map((o) => (
                  <Grid key={o.id} size={{ xs: 12, md: 6 }}>
                    <Card data-testid="orden">
                      <CardActionArea component={Link} href={`/mecanico/ordenes/${o.id}`}>
                        <CardContent>
                          <Stack direction="row" sx={{ justifyContent: 'space-between', gap: 1 }}>
                            <div>
                              <Typography variant="overline" color="text.secondary">{o.codigo} · {o.puesto?.nombre ?? 'Sin puesto'}</Typography>
                              <Typography variant="h6">{o.vehiculo.marca} {o.vehiculo.modelo}</Typography>
                              <Typography variant="body2" color="text.secondary">{o.vehiculo.matricula} · {o.cliente.nombre}</Typography>
                            </div>
                            <ChipEstado {...ESTADO_ORDEN[o.estado]} />
                          </Stack>
                          {o.entregaEstimada && <Typography variant="body2" sx={{ mt: 1 }}>Entrega: {fechaHora(o.entregaEstimada)}</Typography>}
                        </CardContent>
                      </CardActionArea>
                    </Card>
                  </Grid>
                ))}
              </Grid>
            ) : (
              <Vacio titulo={ver === 'mias' ? 'No tienes vehículos en tus puestos' : 'No hay órdenes abiertas'} texto={ver === 'mias' ? 'Si deberías tenerlos, pide al jefe que te asigne un puesto.' : undefined} />
            )
          }
        </Carga>
      </Stack>
    </>
  );
}
