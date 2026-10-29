'use client';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import Stack from '@mui/material/Stack';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import Typography from '@mui/material/Typography';
import { Carga } from './Comunes';
import { ChipEstado } from './ChipEstado';
import { useDatos } from '../lib/hooks';
import { ESTADO_ORDEN, fechaCorta, fechaHora } from '../lib/formato';
import type { EstadoOrden, Vehiculo } from '../lib/tipos';

interface Historial {
  vehiculo: Vehiculo;
  ordenes: {
    id: string;
    numero: number;
    estado: EstadoOrden;
    abiertaEn: string;
    completadaEn: string | null;
    kmEntrada: number;
    trabajos: {
      descripcion: string;
      estado: string;
      piezasUsadas: { referencia: string; nombre: string; cantidad: number; fecha: string; mecanico: string }[];
      piezasQuitadas: { descripcion: string; cantidad: number; destino: string; fecha: string; mecanico: string }[];
    }[];
  }[];
}

/** Trazabilidad de un vehículo: cada orden con lo que se montó y lo que se quitó, cuándo y quién. */
export function HistorialVehiculo({ vehiculoId }: { vehiculoId: string }) {
  const h = useDatos<Historial>(`/vehiculos/${vehiculoId}/historial`);
  return (
    <Carga {...h}>
      {(d) =>
        !d.ordenes.length ? (
          <Typography color="text.secondary">Este vehículo aún no ha pasado por el taller.</Typography>
        ) : (
          <Stack spacing={2}>
            {d.ordenes.map((o) => (
              <Card key={o.id}>
                <CardContent>
                  <Stack direction="row" sx={{ justifyContent: 'space-between', mb: 1, gap: 1, flexWrap: 'wrap' }}>
                    <Typography variant="h6">OR-{String(o.numero).padStart(4, '0')} · {fechaCorta(o.abiertaEn)} · {o.kmEntrada.toLocaleString('es-ES')} km</Typography>
                    <ChipEstado {...ESTADO_ORDEN[o.estado]} />
                  </Stack>
                  <Table size="small" aria-label="Piezas">
                    <TableHead>
                      <TableRow>
                        <TableCell>Trabajo</TableCell>
                        <TableCell>Pieza</TableCell>
                        <TableCell>Movimiento</TableCell>
                        <TableCell>Fecha · mecánico</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {o.trabajos.flatMap((t) => [
                        ...t.piezasUsadas.map((p, i) => (
                          <TableRow key={`u${t.descripcion}${i}`}>
                            <TableCell>{t.descripcion}</TableCell>
                            <TableCell>{p.cantidad} × {p.nombre} ({p.referencia})</TableCell>
                            <TableCell>Montada</TableCell>
                            <TableCell>{fechaHora(p.fecha)} · {p.mecanico}</TableCell>
                          </TableRow>
                        )),
                        ...t.piezasQuitadas.map((p, i) => (
                          <TableRow key={`q${t.descripcion}${i}`}>
                            <TableCell>{t.descripcion}</TableCell>
                            <TableCell>{p.cantidad} × {p.descripcion}</TableCell>
                            <TableCell>{p.destino === 'DESECHADA' ? 'Retirada · desechada' : 'Retirada · devuelta al cliente'}</TableCell>
                            <TableCell>{fechaHora(p.fecha)} · {p.mecanico}</TableCell>
                          </TableRow>
                        )),
                      ])}
                      {!o.trabajos.some((t) => t.piezasUsadas.length || t.piezasQuitadas.length) && (
                        <TableRow><TableCell colSpan={4}>Sin movimientos de piezas. Trabajos: {o.trabajos.map((t) => t.descripcion).join(', ') || '—'}</TableCell></TableRow>
                      )}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            ))}
          </Stack>
        )
      }
    </Carga>
  );
}
