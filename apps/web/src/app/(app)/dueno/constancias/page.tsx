'use client';
import { useState } from 'react';
import MenuItem from '@mui/material/MenuItem';
import TextField from '@mui/material/TextField';
import Card from '@mui/material/Card';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableContainer from '@mui/material/TableContainer';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import { Cabecera, Carga } from '../../../../components/Comunes';
import { ChipEstado } from '../../../../components/ChipEstado';
import { useListado } from '../../../../lib/hooks';
import { Paginacion, CeldaOrden } from '../../../../components/Paginacion';
import { fechaHora } from '../../../../lib/formato';

interface Constancia { id: string; entidad: string; entidadId: string; modo: 'BORRADO' | 'BAJA'; datos: Record<string, unknown>; motivo: string | null; usuario: string; fecha: string }

const resumen = (c: Constancia) => {
  const d = c.datos;
  if (c.entidad === 'Vehiculo') return `${d.matricula} · ${d.marca} ${d.modelo}`;
  if (c.entidad === 'Invitacion') return `${d.email} (${d.rol})`;
  if (c.entidad === 'Ausencia') return `Ausencia del ${String(d.fecha).slice(0, 10)}`;
  return c.entidadId;
};

export default function Constancias() {
  const [entidad, setEntidad] = useState('');
  const c = useListado<Constancia>('/eliminaciones', { entidad }, { orden: 'fecha', dir: 'desc' });
  return (
    <>
      <Cabecera titulo="Constancias de borrado" subtitulo="Copia de todo lo eliminado: qué era, quién lo eliminó, cuándo y por qué." />
      <TextField select label="Qué" value={entidad} onChange={(e) => setEntidad(e.target.value)} sx={{ maxWidth: 240, mb: 2 }}>
        <MenuItem value="">Todo</MenuItem>
        {[['Usuario', 'Usuarios'], ['Vehiculo', 'Vehículos'], ['Pieza', 'Piezas'], ['Invitacion', 'Invitaciones'], ['Ausencia', 'Ausencias']].map(([v, t]) => <MenuItem key={v} value={v}>{t}</MenuItem>)}
      </TextField>
      <Carga {...c}>
        {(d) => (
          <Card>
            <TableContainer>
              <Table>
                <TableHead><TableRow><CeldaOrden listado={c} campo="fecha" dirInicial="desc">Fecha</CeldaOrden><CeldaOrden listado={c} campo="entidad">Qué</CeldaOrden><TableCell>Tipo</TableCell><TableCell>Quién</TableCell><TableCell>Motivo</TableCell></TableRow></TableHead>
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
      <Paginacion listado={c} nombre={['constancia', 'constancias']} />
    </>
  );
}
