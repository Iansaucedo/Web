'use client';
import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import MuiLink from '@mui/material/Link';
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
import { useListado } from '../../../../lib/hooks';
import { CeldaOrden, Paginacion } from '../../../../components/Paginacion';
import { ESTADO_ORDEN, fechaHora } from '../../../../lib/formato';
import type { OrdenResumen } from '../../../../lib/tipos';

export default function Ordenes() {
  const router = useRouter();
  const [estado, setEstado] = useState('abiertas');
  const [q, setQ] = useState('');
  const ordenes = useListado<OrdenResumen>(
    '/ordenes',
    { abiertas: estado === 'abiertas' && 'true', estado: estado !== 'abiertas' && estado, q: q.trim() },
    { orden: 'abiertaEn', dir: 'desc' },
  );
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
              <Table aria-label="Órdenes">
                <TableHead>
                  <TableRow>
                    <CeldaOrden listado={ordenes} campo="numero" dirInicial="desc">Orden</CeldaOrden>
                    <CeldaOrden listado={ordenes} campo="matricula">Vehículo</CeldaOrden>
                    <TableCell>Cliente</TableCell>
                    <TableCell>Puesto</TableCell>
                    <CeldaOrden listado={ordenes} campo="abiertaEn" dirInicial="desc">Entrada</CeldaOrden>
                    <CeldaOrden listado={ordenes} campo="estado">Estado</CeldaOrden>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {d.datos.map((o) => (
                    // La fila entera se puede pulsar con el ratón, pero el enlace es el código: un <a> como fila (role=row)
                    // dejaba de anunciarse como enlace en los lectores de pantalla.
                    <TableRow key={o.id} hover onClick={() => router.push(`/mecanico/ordenes/${o.id}`)} sx={{ cursor: 'pointer' }} data-testid="fila-orden">
                      <TableCell><MuiLink component={Link} href={`/mecanico/ordenes/${o.id}`} underline="hover" aria-label={`Orden ${o.codigo}, ${o.vehiculo.matricula}`} onClick={(e) => e.stopPropagation()}>{o.codigo}</MuiLink></TableCell>
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
      <Paginacion listado={ordenes} nombre={['orden', 'órdenes']} />
    </>
  );
}
