'use client';
import { useState } from 'react';
import Card from '@mui/material/Card';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableContainer from '@mui/material/TableContainer';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { Cabecera, Carga } from '../../../../components/Comunes';
import { ChipEstado } from '../../../../components/ChipEstado';
import { useDatos } from '../../../../lib/hooks';
import { CATEGORIAS, euros } from '../../../../lib/formato';
import type { Lista, Pieza } from '../../../../lib/tipos';

/** Catálogo en modo consulta: el mecánico ve qué hay y cuánto; solo el jefe cambia el stock. */
export default function CatalogoMecanico() {
  const [q, setQ] = useState('');
  const piezas = useDatos<Lista<Pieza>>(`/piezas${q.trim() ? `?q=${encodeURIComponent(q.trim())}` : ''}`);
  return (
    <>
      <Cabecera titulo="Catálogo de piezas" subtitulo="Consulta. Para usar una pieza, regístrala desde la orden; si falta, pídela." />
      <TextField label="Buscar por referencia o nombre" value={q} onChange={(e) => setQ(e.target.value)} sx={{ maxWidth: 360, mb: 2 }} />
      <Carga {...piezas}>
        {(d) => (
          <Card>
            <TableContainer>
              <Table aria-label="Catálogo de piezas">
                <TableHead>
                  <TableRow><TableCell>Referencia</TableCell><TableCell>Pieza</TableCell><TableCell align="right">Precio</TableCell><TableCell align="right">Stock</TableCell></TableRow>
                </TableHead>
                <TableBody>
                  {d.datos.map((p) => (
                    <TableRow key={p.id} data-testid="pieza">
                      <TableCell>{p.referencia}</TableCell>
                      <TableCell>{p.nombre}<Typography variant="caption" display="block" color="text.secondary">{CATEGORIAS[p.categoria] ?? p.categoria}</Typography></TableCell>
                      <TableCell align="right">{euros(p.precioCentimos)}</TableCell>
                      <TableCell align="right">{p.stock === 0 ? <ChipEstado tono="error" texto="Sin stock" /> : p.stockBajo ? <ChipEstado tono="aviso" texto={`${p.stock} · bajo`} /> : p.stock}</TableCell>
                    </TableRow>
                  ))}
                  {!d.datos.length && <TableRow><TableCell colSpan={4}>Ninguna pieza coincide.</TableCell></TableRow>}
                </TableBody>
              </Table>
            </TableContainer>
          </Card>
        )}
      </Carga>
    </>
  );
}
