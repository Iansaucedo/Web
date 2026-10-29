'use client';
import { useState } from 'react';
import Link from 'next/link';
import Card from '@mui/material/Card';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableContainer from '@mui/material/TableContainer';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import TextField from '@mui/material/TextField';
import { Cabecera, Carga } from '../../../../components/Comunes';
import { ChipEstado } from '../../../../components/ChipEstado';
import { useDatos } from '../../../../lib/hooks';
import { ESTADO_ORDEN, fechaHora } from '../../../../lib/formato';
import type { Lista, OrdenResumen } from '../../../../lib/tipos';

/** Órdenes en las que el mecánico ha registrado trabajo, para consultar qué se hizo. */
export default function Historial() {
  const [q, setQ] = useState('');
  const params = new URLSearchParams({ trabajadas: 'true' });
  if (q.trim()) params.set('q', q.trim());
  const ordenes = useDatos<Lista<OrdenResumen>>(`/ordenes?${params}`);
  return (
    <>
      <Cabecera titulo="Historial" subtitulo="Órdenes en las que has registrado trabajo." />
      <TextField label="Buscar por matrícula, cliente o número" value={q} onChange={(e) => setQ(e.target.value)} sx={{ maxWidth: 360, mb: 2 }} />
      <Carga {...ordenes}>
        {(d) => (
          <Card>
            <TableContainer>
              <Table aria-label="Historial de órdenes">
                <TableHead>
                  <TableRow><TableCell>Orden</TableCell><TableCell>Vehículo</TableCell><TableCell>Cliente</TableCell><TableCell>Entrada</TableCell><TableCell>Estado</TableCell></TableRow>
                </TableHead>
                <TableBody>
                  {d.datos.map((o) => (
                    <TableRow key={o.id} hover component={Link} href={`/mecanico/ordenes/${o.id}`} sx={{ textDecoration: 'none' }} data-testid="fila-orden">
                      <TableCell>{o.codigo}</TableCell>
                      <TableCell>{o.vehiculo.marca} {o.vehiculo.modelo} · {o.vehiculo.matricula}</TableCell>
                      <TableCell>{o.cliente.nombre}</TableCell>
                      <TableCell>{fechaHora(o.abiertaEn)}</TableCell>
                      <TableCell><ChipEstado {...ESTADO_ORDEN[o.estado]} /></TableCell>
                    </TableRow>
                  ))}
                  {!d.datos.length && <TableRow><TableCell colSpan={5}>{q ? 'Ninguna orden coincide.' : 'Aún no has registrado trabajo en ninguna orden.'}</TableCell></TableRow>}
                </TableBody>
              </Table>
            </TableContainer>
          </Card>
        )}
      </Carga>
    </>
  );
}
