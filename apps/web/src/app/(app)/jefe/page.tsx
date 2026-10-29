'use client';
import Link from 'next/link';
import Card from '@mui/material/Card';
import CardActionArea from '@mui/material/CardActionArea';
import CardContent from '@mui/material/CardContent';
import Grid from '@mui/material/Grid2';
import Typography from '@mui/material/Typography';
import { Cabecera, Carga } from '../../../components/Comunes';
import { ChipEstado } from '../../../components/ChipEstado';
import { useDatos } from '../../../lib/hooks';
import { ESTADO_ORDEN, diaLargo, hoy } from '../../../lib/formato';
import type { Cita, Correccion, DiaDisponible, Lista, Pedido, Puesto, ReservaMultiple } from '../../../lib/tipos';

function Kpi({ titulo, valor, enlace, aviso }: { titulo: string; valor: string | number; enlace: string; aviso?: boolean }) {
  return (
    <Card sx={aviso ? { borderColor: 'warning.main' } : undefined}>
      <CardActionArea component={Link} href={enlace}>
        <CardContent>
          <Typography variant="body2" color="text.secondary">{titulo}</Typography>
          <Typography variant="h4" component="p" sx={{ mt: 1 }}>{valor}</Typography>
        </CardContent>
      </CardActionArea>
    </Card>
  );
}

export default function PanelTaller() {
  const d = hoy();
  const puestos = useDatos<Lista<Puesto>>('/puestos');
  const citas = useDatos<Lista<Cita>>(`/citas?fecha=${d}`);
  const pedidos = useDatos<Lista<Pedido>>('/pedidos?estado=PENDIENTE');
  const correcciones = useDatos<Lista<Correccion>>('/correcciones?estado=PENDIENTE');
  const reservas = useDatos<Lista<ReservaMultiple>>('/reservas-multiples?estado=EN_ESPERA');
  const disp = useDatos<{ dias: DiaDisponible[] }>(`/disponibilidad?desde=${d}&hasta=${d}`);
  const porRecibir = citas.datos?.datos.filter((c) => c.estado === 'PENDIENTE' || c.estado === 'CONFIRMADA').length;
  const hoyDia = disp.datos?.dias[0];
  return (
    <>
      <Cabecera titulo="Panel del taller" subtitulo={diaLargo(d)} />
      <Grid container spacing={2} sx={{ mb: 4 }}>
        <Grid size={{ xs: 6, md: 3 }}><Kpi titulo="Vehículos por recibir hoy" valor={porRecibir ?? '…'} enlace="/jefe/citas" /></Grid>
        <Grid size={{ xs: 6, md: 3 }}><Kpi titulo="Ocupación de hoy" valor={hoyDia ? `${hoyDia.ocupadas} / ${hoyDia.capacidad}` : '…'} enlace="/jefe/personal" aviso={Boolean(hoyDia && hoyDia.ocupadas > hoyDia.capacidad)} /></Grid>
        <Grid size={{ xs: 6, md: 3 }}><Kpi titulo="Pedidos por aprobar" valor={pedidos.datos?.datos.length ?? '…'} enlace="/jefe/pedidos" aviso={Boolean(pedidos.datos?.datos.length)} /></Grid>
        <Grid size={{ xs: 6, md: 3 }}><Kpi titulo="Correcciones de fichaje" valor={correcciones.datos?.datos.length ?? '…'} enlace="/jefe/jornadas" aviso={Boolean(correcciones.datos?.datos.length)} /></Grid>
        {Boolean(reservas.datos?.datos.length) && <Grid size={{ xs: 12, md: 3 }}><Kpi titulo="Empresas esperando hueco" valor={reservas.datos!.datos.length} enlace="/jefe/empresas" aviso /></Grid>}
      </Grid>
      <Typography variant="h5" component="h2" sx={{ mb: 2 }}>Puestos</Typography>
      <Carga {...puestos}>
        {(p) => (
          <Grid container spacing={2}>
            {p.datos.filter((x) => x.activo).map((x) => (
              <Grid key={x.id} size={{ xs: 12, sm: 6, lg: 4 }}>
                <Card data-testid="puesto">
                  <CardActionArea component={Link} href={x.ocupadoPor ? `/mecanico/ordenes/${x.ocupadoPor.ordenId}` : '/jefe/citas'}>
                    <CardContent>
                      <Typography variant="h6">{x.nombre}</Typography>
                      <Typography variant="body2" color={x.mecanicoHoy ? 'text.secondary' : 'warning.main'}>{x.mecanicoHoy ? x.mecanicoHoy.nombre : 'Sin mecánico hoy'}</Typography>
                      <Typography sx={{ mt: 1.5, mb: 1 }}>{x.ocupadoPor ? `${x.ocupadoPor.codigo} · ${x.ocupadoPor.matricula}` : 'Libre'}</Typography>
                      {x.ocupadoPor ? <ChipEstado {...ESTADO_ORDEN[x.ocupadoPor.estado]} /> : <ChipEstado tono="neutro" texto="Libre" />}
                    </CardContent>
                  </CardActionArea>
                </Card>
              </Grid>
            ))}
          </Grid>
        )}
      </Carga>
    </>
  );
}
