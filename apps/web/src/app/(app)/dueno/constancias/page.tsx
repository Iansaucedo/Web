'use client';
import Card from '@mui/material/Card';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableContainer from '@mui/material/TableContainer';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import { Cabecera, Carga } from '../../../../components/Comunes';
import { ChipEstado } from '../../../../components/ChipEstado';
import { useDatos } from '../../../../lib/hooks';
import { fechaHora } from '../../../../lib/formato';
import type { Lista } from '../../../../lib/tipos';

interface Constancia { id: string; entidad: string; entidadId: string; modo: 'BORRADO' | 'BAJA'; datos: Record<string, unknown>; motivo: string | null; usuario: string; fecha: string }

const resumen = (c: Constancia) => {
  const d = c.datos;
  if (c.entidad === 'Vehiculo') return `${d.matricula} · ${d.marca} ${d.modelo}`;
  if (c.entidad === 'Invitacion') return `${d.email} (${d.rol})`;
  if (c.entidad === 'Ausencia') return `Ausencia del ${String(d.fecha).slice(0, 10)}`;
  return c.entidadId;
};

export default function Constancias() {
  const c = useDatos<Lista<Constancia>>('/eliminaciones');
  return (
    <>
      <Cabecera titulo="Constancias de borrado" subtitulo="Copia de todo lo eliminado: qué era, quién lo eliminó, cuándo y por qué." />
      <Carga {...c}>
        {(d) => (
          <Card>
            <TableContainer>
              <Table>
                <TableHead><TableRow><TableCell>Fecha</TableCell><TableCell>Qué</TableCell><TableCell>Tipo</TableCell><TableCell>Quién</TableCell><TableCell>Motivo</TableCell></TableRow></TableHead>
                <TableBody>
                  {d.datos.map((x) => (
                    <TableRow key={x.id}>
                      <TableCell>{fechaHora(x.fecha)}</TableCell>
                      <TableCell>{x.entidad}: {resumen(x)}</TableCell>
                      <TableCell>{x.modo === 'BAJA' ? <ChipEstado tono="info" texto="Baja (se conserva)" /> : <ChipEstado tono="neutro" texto="Borrado (copia)" />}</TableCell>
                      <TableCell>{x.usuario}</TableCell>
                      <TableCell>{x.motivo ?? '—'}</TableCell>
                    </TableRow>
                  ))}
                  {!d.datos.length && <TableRow><TableCell colSpan={5}>No se ha eliminado nada.</TableCell></TableRow>}
                </TableBody>
              </Table>
            </TableContainer>
          </Card>
        )}
      </Carga>
    </>
  );
}
