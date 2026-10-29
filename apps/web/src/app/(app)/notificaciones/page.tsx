'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Card from '@mui/material/Card';
import Chip from '@mui/material/Chip';
import List from '@mui/material/List';
import ListItem from '@mui/material/ListItem';
import ListItemButton from '@mui/material/ListItemButton';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { visuallyHidden } from '@mui/utils';
import CheckIcon from '@mui/icons-material/Check';
import DoneAllIcon from '@mui/icons-material/DoneAll';
import EventIcon from '@mui/icons-material/EventOutlined';
import BuildIcon from '@mui/icons-material/Build';
import WarningIcon from '@mui/icons-material/WarningAmberOutlined';
import PhoneIcon from '@mui/icons-material/PhoneOutlined';
import PdfIcon from '@mui/icons-material/PictureAsPdfOutlined';
import NotificationsIcon from '@mui/icons-material/NotificationsOutlined';
import { Cabecera, Carga, Vacio } from '../../../components/Comunes';
import { useSesion } from '../../../components/Sesion';
import { api } from '../../../lib/api';
import { useDatos } from '../../../lib/hooks';
import { fechaCorta } from '../../../lib/formato';
import type { Lista, Notificacion } from '../../../lib/tipos';

type Filtro = 'todas' | 'noLeidas' | 'autorizaciones' | 'citas' | 'ordenes';
const FILTROS: [Filtro, string][] = [['todas', 'Todas'], ['noLeidas', 'No leídas'], ['autorizaciones', 'Autorizaciones'], ['citas', 'Citas'], ['ordenes', 'Órdenes']];

/** Grupo e icono de cada aviso, como en Figma («Cliente · Notificaciones»). */
function clase(tipo: string): { grupo: Filtro | null; icono: typeof EventIcon; destacado?: boolean } {
  if (tipo === 'SOLICITUD_AUTORIZACION') return { grupo: 'autorizaciones', icono: WarningIcon, destacado: true };
  if (tipo === 'HUECO_OFRECIDO' || tipo.startsWith('RESERVA_MULTIPLE')) return { grupo: 'citas', icono: PhoneIcon };
  if (tipo.startsWith('CITA_') || tipo === 'RECORDATORIO_CITA') return { grupo: 'citas', icono: EventIcon };
  if (tipo === 'ORDEN_COMPLETADA') return { grupo: 'ordenes', icono: PdfIcon };
  if (/ORDEN|VEHICULO|PIEZAS|REPARACION|ENTREGA/.test(tipo)) return { grupo: 'ordenes', icono: BuildIcon, destacado: true };
  return { grupo: null, icono: NotificationsIcon };
}

/** «Hace 12 min», «Hace 2 h», «Ayer» o la fecha. */
function cuando(iso: string) {
  const min = Math.round((Date.now() - new Date(iso).getTime()) / 60_000);
  if (min < 1) return 'Ahora';
  if (min < 60) return `Hace ${min} min`;
  if (min < 24 * 60) return `Hace ${Math.round(min / 60)} h`;
  if (min < 48 * 60) return 'Ayer';
  return fechaCorta(iso);
}

export default function Notificaciones() {
  const { usuario } = useSesion();
  const avisos = useDatos<Lista<Notificacion> & { noLeidas: number }>('/notificaciones');
  const [filtro, setFiltro] = useState<Filtro>('todas');
  const router = useRouter();
  const abrir = async (n: Notificacion) => {
    if (!n.leida) await api.post(`/notificaciones/${n.id}/leer`).catch(() => undefined);
    if (n.enlace) router.push(n.enlace);
    else void avisos.recargar();
  };
  return (
    <>
      <Cabecera
        titulo="Notificaciones"
        subtitulo={`También te las enviamos por email a ${usuario.email}`}
        acciones={
          avisos.datos?.noLeidas ? (
            <Button startIcon={<DoneAllIcon />} onClick={async () => { await api.post('/notificaciones/leer-todas'); void avisos.recargar(); }}>Marcar todas como leídas</Button>
          ) : undefined
        }
      />
      <Stack direction="row" role="group" aria-label="Filtrar avisos" sx={{ flexWrap: 'wrap', gap: 1, mb: 2 }}>
        {FILTROS.map(([f, texto]) => (
          <Chip
            key={f}
            label={texto}
            icon={filtro === f ? <CheckIcon /> : undefined}
            variant={filtro === f ? 'filled' : 'outlined'}
            color={filtro === f ? 'secondary' : 'default'}
            onClick={() => setFiltro(f)}
            aria-pressed={filtro === f}
          />
        ))}
      </Stack>
      <Carga {...avisos}>
        {(d) => {
          const lista = d.datos.filter((n) => filtro === 'todas' || (filtro === 'noLeidas' ? !n.leida : clase(n.tipo).grupo === filtro));
          return lista.length ? (
            <Card>
              <List disablePadding aria-label="Avisos">
                {lista.map((n) => {
                  const c = clase(n.tipo);
                  return (
                    <ListItem key={n.id} disablePadding divider>
                      <ListItemButton onClick={() => abrir(n)} sx={{ borderRadius: 0, gap: 2, py: 1.5 }} data-testid="aviso">
                        <Box aria-hidden="true" sx={{ width: 40, height: 40, borderRadius: '50%', display: 'grid', placeItems: 'center', flexShrink: 0, bgcolor: !n.leida && c.destacado ? 'secondary.light' : 'action.hover', color: 'text.primary' }}>
                          <c.icono fontSize="small" />
                        </Box>
                        <Box sx={{ flex: 1, minWidth: 0 }}>
                          <Typography sx={{ fontWeight: n.leida ? 400 : 500 }}>{n.mensaje}</Typography>
                        </Box>
                        <Typography variant="caption" color="text.secondary" sx={{ whiteSpace: 'nowrap' }}>{cuando(n.creadaEn)}</Typography>
                        <Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: n.leida ? 'transparent' : 'primary.main', flexShrink: 0 }} aria-hidden="true" />
                        {!n.leida && <Box component="span" sx={visuallyHidden}>Sin leer</Box>}
                      </ListItemButton>
                    </ListItem>
                  );
                })}
              </List>
            </Card>
          ) : (
            <Vacio titulo={filtro === 'todas' ? 'No tienes avisos' : 'No hay avisos con este filtro'} texto="Aquí verás los cambios de tus citas, órdenes y pedidos." />
          );
        }}
      </Carga>
    </>
  );
}
