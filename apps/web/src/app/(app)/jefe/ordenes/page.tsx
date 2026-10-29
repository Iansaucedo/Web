'use client';
import { useState } from 'react';
import Link from 'next/link';
import Card from '@mui/material/Card';
import MenuItem from '@mui/material/MenuItem';
import Stack from '@mui/material/Stack';
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

export default function Ordenes() {
  const [estado, setEstado] = useState('abiertas');
  const [q, setQ] = useState('');
  const params = new URLSearchParams(estado === 'abiertas' ? { abiertas: 'true' } : estado ? { estado } : {});
  if (q.trim()) params.set('q', q.trim());
  const ordenes = useDatos<Lista<OrdenResumen>>(`/ordenes?${params}`);
  return (
    <>
      <Cabecera titulo="Órdenes" />
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} sx={{ mb: 2 }}>
        <TextField label="Buscar por matrícula, cliente o número" value={q} onChange={(e) => setQ(e.target.value)} sx={{ maxWidth: 360 }} />
        <TextField select label="Estado" value={estado} onChange={(e) => setEstado(e.target.value)} sx={{ maxWidth: 260 }}>
          <MenuItem value="abiertas">Abiertas</MenuItem>
          <MenuItem value="">Todas</MenuItem>
          {Object.entries(ESTADO_ORDEN).map(([k, v]) => <MenuItem key={k} value={k}>{v.texto}</MenuItem>)}
        </TextField>
      </Stack>
      <Carga {...ordenes}>
        {(d) => (
          <Card>
            <TableContainer>
              <Table>
                <TableHead>
                  <TableRow><TableCell>Orden</TableCell><TableCell>Vehículo</TableCell><TableCell>Cliente</TableCell><TableCell>Puesto</TableCell><TableCell>Entrada</TableCell><TableCell>Estado</TableCell></TableRow>
                </TableHead>
                <TableBody>
                  {d.datos.map((o) => (
                    <TableRow key={o.id} hover component={Link} href={`/mecanico/ordenes/${o.id}`} sx={{ textDecoration: 'none' }} data-testid="fila-orden">
                      <TableCell>{o.codigo}</TableCell>
                      <TableCell>{o.vehiculo.marca} {o.vehiculo.modelo} · {o.vehiculo.matricula}</TableCell>
                      <TableCell>{o.cliente.nombre}</TableCell>
                      <TableCell>{o.puesto?.nombre ?? '—'}</TableCell>
                      <TableCell>{fechaHora(o.abiertaEn)}</TableCell>
                      <TableCell><ChipEstado {...ESTADO_ORDEN[o.estado]} /></TableCell>
                    </TableRow>
                  ))}
                  {!d.datos.length && <TableRow><TableCell colSpan={6}>No hay órdenes con estos filtros.</TableCell></TableRow>}
                </TableBody>
              </Table>
            </TableContainer>
          </Card>
        )}
      </Carga>
    </>
  );
}
