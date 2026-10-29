'use client';
import Box from '@mui/material/Box';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { fechaHora, ESTADO_ORDEN } from '../lib/formato';
import type { EstadoOrden, OrdenDetalle } from '../lib/tipos';

/** Convierte cada evento de la orden en una frase. */
function frase(e: OrdenDetalle['eventos'][number]): string {
  const p = e.payload as Record<string, unknown>;
  switch (e.tipo) {
    case 'ESTADO_CAMBIADO':
      return (p.texto as string) ?? `Estado: ${ESTADO_ORDEN[p.a as EstadoOrden]?.texto ?? p.a}`;
    case 'SOLICITUD_CREADA':
      return `Presupuesto enviado: ${(p.trabajos as string[]).join(', ')}`;
    case 'PARTIDA_RESPONDIDA':
      return `${p.decision === 'ACEPTADA' ? 'Aceptado' : 'Rechazado'}: ${p.descripcion}`;
    case 'TRABAJO_REGISTRADO':
      return p.terminado ? `Terminado: ${p.trabajo}` : `${p.minutos} min en «${p.trabajo}»: ${p.descripcion}`;
    case 'PIEZA_USADA':
      return `Pieza montada: ${p.cantidad} × ${p.pieza}`;
    case 'PIEZA_QUITADA':
      return `Pieza retirada: ${p.cantidad} × ${p.descripcion} (${p.destino === 'DESECHADA' ? 'desechada' : 'se te devuelve'})`;
    case 'PUESTO_ASIGNADO':
      return `En ${p.puesto}`;
    case 'PEDIDO_ACTUALIZADO':
      return `Pedido de ${p.pieza}: ${String(p.estado).toLowerCase()}`;
    case 'KM_CORREGIDOS':
      return `Km de salida corregidos: ${Number(p.de).toLocaleString('es-ES')} → ${Number(p.a).toLocaleString('es-ES')} km`;
    case 'OBSERVACION':
      return `Nota: ${p.texto}`;
    default:
      return e.tipo;
  }
}

export function LineaTiempo({ eventos }: { eventos: OrdenDetalle['eventos'] }) {
  return (
    <Stack component="ol" spacing={0} sx={{ listStyle: 'none', p: 0, m: 0 }} aria-label="Línea de tiempo">
      {[...eventos].reverse().map((e, i) => (
        <Box component="li" key={e.id} sx={{ display: 'flex', gap: 2 }}>
          <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
            <Box sx={{ width: 12, height: 12, borderRadius: '50%', bgcolor: i === 0 ? 'primary.main' : 'divider', mt: 0.75 }} />
            {i < eventos.length - 1 && <Box sx={{ width: 2, flex: 1, bgcolor: 'divider' }} />}
          </Box>
          <Box sx={{ pb: 2 }}>
            <Typography variant="body2" sx={{ fontWeight: i === 0 ? 500 : 400 }}>{frase(e)}</Typography>
            <Typography variant="caption" color="text.secondary">{fechaHora(e.fecha)} · {e.actor}</Typography>
          </Box>
        </Box>
      ))}
    </Stack>
  );
}
