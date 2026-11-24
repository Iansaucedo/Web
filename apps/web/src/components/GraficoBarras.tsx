'use client';
import { useState } from 'react';
import Box from '@mui/material/Box';
import Table from '@mui/material/Table';
import TableContainer from '@mui/material/TableContainer';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import ToggleButton from '@mui/material/ToggleButton';
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup';
import Typography from '@mui/material/Typography';

// Una sola serie: un tono (validado: croma y contraste sobre la superficie clara), sin leyenda.
const COLOR = '#0086A3';
const REJILLA = '#E4E9EB';

/** Columnas con tooltip al pasar el ratón y vista de tabla equivalente. */
export function GraficoBarras({ datos, etiqueta, valor, formato, titulo }: { datos: { x: string; y: number }[]; etiqueta: (x: string) => string; valor: string; formato: (n: number) => string; titulo: string }) {
  const [vista, setVista] = useState<'grafico' | 'tabla'>('grafico');
  const [activo, setActivo] = useState<number | null>(null);
  const max = Math.max(1, ...datos.map((d) => d.y));
  const paso = 10 ** Math.floor(Math.log10(max));
  const tope = Math.ceil(max / paso) * paso;
  const ancho = 720;
  const alto = 220;
  const izq = 72;
  const der = 28; // margen para que la última fecha no se corte
  const abajo = 28;
  const banda = (ancho - izq - der) / Math.max(1, datos.length);
  const barra = Math.min(24, banda - 2);
  const y = (v: number) => (alto - abajo) * (1 - v / tope);
  // Sin repetir etiquetas: con importes muy pequeños, la mitad y el tope se redondeaban al mismo texto.
  const ticks = [0, tope / 2, tope].filter((t, i, todos) => todos.findIndex((o) => formato(o) === formato(t)) === i);
  const vacio = datos.every((d) => d.y === 0);
  return (
    <Box>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
        <Typography variant="h6">{titulo}</Typography>
        <ToggleButtonGroup size="small" exclusive value={vista} onChange={(_, v) => v && setVista(v)} aria-label="Vista">
          <ToggleButton value="grafico">Gráfico</ToggleButton>
          <ToggleButton value="tabla">Tabla</ToggleButton>
        </ToggleButtonGroup>
      </Box>
      {vista === 'tabla' ? (
        <TableContainer>
          <Table size="small" aria-label={titulo}>
            <TableHead><TableRow><TableCell>Día</TableCell><TableCell align="right">{valor}</TableCell></TableRow></TableHead>
            <TableBody>{datos.map((d) => <TableRow key={d.x}><TableCell>{etiqueta(d.x)}</TableCell><TableCell align="right">{formato(d.y)}</TableCell></TableRow>)}</TableBody>
          </Table>
        </TableContainer>
      ) : vacio ? (
        // Todo a cero: un eje vacío con marcas inventadas no dice nada.
        <Typography color="text.secondary" sx={{ py: 4, textAlign: 'center' }}>Sin datos en este periodo.</Typography>
      ) : (
        <Box sx={{ overflowX: 'auto' }}>
         {/* Firefox no deduce la altura de un <svg> con viewBox dentro de un contenedor con scroll: se fija la proporción. */}
         <Box sx={{ position: 'relative', minWidth: 640 }}>
          <svg viewBox={`0 0 ${ancho} ${alto}`} width="100%" preserveAspectRatio="xMidYMid meet" role="img" aria-label={`${titulo}. Usa la vista de tabla para leer los valores.`} style={{ display: 'block', width: '100%', height: 'auto', aspectRatio: `${ancho} / ${alto}` }}>
            {ticks.map((t) => (
              <g key={t}>
                <line x1={izq} x2={ancho} y1={y(t)} y2={y(t)} stroke={REJILLA} strokeWidth={1} />
                <text x={izq - 8} y={y(t) + 4} textAnchor="end" fontSize={13} fill="#40484B">{formato(t)}</text>
              </g>
            ))}
            {datos.map((d, i) => {
              const cx = izq + banda * i + banda / 2;
              const h = Math.max(0, (alto - abajo) - y(d.y));
              const r = Math.min(4, h);
              const x0 = cx - barra / 2;
              const top = y(d.y);
              const paso = Math.ceil(datos.length / 10);
              const esUltimo = i === datos.length - 1;
              const esMultiplo = i % paso === 0;
              const muyCercaDelFinal = datos.length - 1 - i < paso * 0.75;
              const mostrarTexto = (esMultiplo && !muyCercaDelFinal) || esUltimo;
              return (
                <g key={d.x} onMouseEnter={() => setActivo(i)} onMouseLeave={() => setActivo(null)}>
                  <rect x={izq + banda * i} y={0} width={banda} height={alto - abajo} fill="transparent" />
                  {h > 0 && (
                    <path
                      d={`M${x0},${alto - abajo} V${top + r} Q${x0},${top} ${x0 + r},${top} H${x0 + barra - r} Q${x0 + barra},${top} ${x0 + barra},${top + r} V${alto - abajo} Z`}
                      fill={COLOR}
                      opacity={activo === null || activo === i ? 1 : 0.45}
                    />
                  )}
                  {mostrarTexto && (
                    <text x={cx} y={alto - 8} textAnchor="middle" fontSize={13} fill="#40484B">{etiqueta(d.x)}</text>
                  )}
                </g>
              );
            })}
          </svg>
          {activo !== null && (
            <Box role="status" sx={{ position: 'absolute', top: 4, left: `${((izq + banda * activo + banda / 2) / ancho) * 100}%`, transform: 'translateX(-50%)', bgcolor: 'background.paper', border: 1, borderColor: 'divider', borderRadius: 2, px: 1.5, py: 0.75, boxShadow: 1, pointerEvents: 'none', whiteSpace: 'nowrap' }}>
              <Typography variant="caption" color="text.secondary">{etiqueta(datos[activo].x)}</Typography>
              <Typography variant="body2" sx={{ fontWeight: 500 }}>{formato(datos[activo].y)}</Typography>
            </Box>
          )}
         </Box>
        </Box>
      )}
    </Box>
  );
}
