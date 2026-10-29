'use client';
import { useState } from 'react';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import Grid from '@mui/material/Grid2';
import MenuItem from '@mui/material/MenuItem';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { Cabecera, Carga } from '../../../components/Comunes';
import { GraficoBarras } from '../../../components/GraficoBarras';
import { useDatos } from '../../../lib/hooks';
import { dia, euros, horasMin, hoy, sumarDias } from '../../../lib/formato';

interface Estadisticas {
  facturacion: { base: number; iva: number; total: number };
  ordenes: { abiertas: number; completadas: number; rechazadas: number; ticketMedioCentimos: number; horasMediasReparacion: number };
  citas: { total: number; canceladas: number; noPresentado: number };
  trabajosFrecuentes: { descripcion: string; veces: number }[];
  mecanicos: { nombre: string; minutosRegistrados: number; ordenes: number }[];
  porDia: { fecha: string; facturadoCentimos: number; citas: number }[];
}

function Dato({ titulo, valor, detalle }: { titulo: string; valor: string; detalle?: string }) {
  return (
    <Card sx={{ height: '100%' }}>
      <CardContent>
        <Typography variant="body2" color="text.secondary">{titulo}</Typography>
        <Typography variant="h4" component="p" sx={{ mt: 1 }}>{valor}</Typography>
        {detalle && <Typography variant="caption" color="text.secondary">{detalle}</Typography>}
      </CardContent>
    </Card>
  );
}

export default function Estadisticas() {
  const [dias, setDias] = useState('30');
  const hasta = hoy();
  const desde = sumarDias(hasta, -(Number(dias) - 1));
  const e = useDatos<Estadisticas>(`/estadisticas?desde=${desde}&hasta=${hasta}`);
  return (
    <>
      <Cabecera
        titulo="Estadísticas"
        subtitulo={`Del ${dia(desde)} al ${dia(hasta)}`}
        acciones={
          <TextField select size="small" label="Periodo" value={dias} onChange={(x) => setDias(x.target.value)} sx={{ width: 180 }}>
            <MenuItem value="7">Últimos 7 días</MenuItem>
            <MenuItem value="30">Últimos 30 días</MenuItem>
            <MenuItem value="90">Últimos 90 días</MenuItem>
            <MenuItem value="365">Último año</MenuItem>
          </TextField>
        }
      />
      <Carga {...e}>
        {(d) => {
          const tasa = d.citas.total ? Math.round((d.citas.noPresentado / d.citas.total) * 100) : 0;
          return (
            <Stack spacing={3}>
              <Grid container spacing={2}>
                <Grid size={{ xs: 6, md: 3 }}><Dato titulo="Facturado (IVA incl.)" valor={euros(d.facturacion.total)} detalle={`Base ${euros(d.facturacion.base)}`} /></Grid>
                <Grid size={{ xs: 6, md: 3 }}><Dato titulo="Órdenes completadas" valor={String(d.ordenes.completadas)} detalle={`Ticket medio ${euros(d.ordenes.ticketMedioCentimos)}`} /></Grid>
                <Grid size={{ xs: 6, md: 3 }}><Dato titulo="Tiempo medio de reparación" valor={`${d.ordenes.horasMediasReparacion.toLocaleString('es-ES')} h`} detalle={`${d.ordenes.abiertas} vehículos en el taller ahora`} /></Grid>
                <Grid size={{ xs: 6, md: 3 }}><Dato titulo="Citas" valor={String(d.citas.total)} detalle={`${d.citas.canceladas} canceladas · ${tasa} % no presentado`} /></Grid>
              </Grid>
              <Card>
                <CardContent>
                  <GraficoBarras titulo="Facturación por día" valor="Facturado" datos={d.porDia.map((x) => ({ x: x.fecha, y: x.facturadoCentimos }))} etiqueta={dia} formato={(n) => euros(n).replace(/,00\s/, ' ')} />
                </CardContent>
              </Card>
              <Grid container spacing={2}>
                <Grid size={{ xs: 12, md: 6 }}>
                  <Card sx={{ height: '100%' }}>
                    <CardContent>
                      <Typography variant="h6" sx={{ mb: 1 }}>Trabajos más frecuentes</Typography>
                      {d.trabajosFrecuentes.map((t) => <Stack key={t.descripcion} direction="row" sx={{ justifyContent: 'space-between', py: 0.5 }}><Typography variant="body2">{t.descripcion}</Typography><Typography variant="body2">{t.veces}</Typography></Stack>)}
                      {!d.trabajosFrecuentes.length && <Typography color="text.secondary">Sin datos en este periodo.</Typography>}
                    </CardContent>
                  </Card>
                </Grid>
                <Grid size={{ xs: 12, md: 6 }}>
                  <Card sx={{ height: '100%' }}>
                    <CardContent>
                      <Typography variant="h6" sx={{ mb: 1 }}>Horas registradas por mecánico</Typography>
                      {d.mecanicos.map((m) => <Stack key={m.nombre} direction="row" sx={{ justifyContent: 'space-between', py: 0.5 }}><Typography variant="body2">{m.nombre}</Typography><Typography variant="body2">{horasMin(m.minutosRegistrados)} · {m.ordenes} órdenes</Typography></Stack>)}
                      {!d.mecanicos.length && <Typography color="text.secondary">Sin datos en este periodo.</Typography>}
                    </CardContent>
                  </Card>
                </Grid>
              </Grid>
            </Stack>
          );
        }}
      </Carga>
    </>
  );
}
