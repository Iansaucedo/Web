'use client';
// Controles comunes de los listados paginados: resumen, orden, tamaño de página y navegación entre páginas.
import { useState, type ReactNode } from 'react';
import IconButton from '@mui/material/IconButton';
import InputAdornment from '@mui/material/InputAdornment';
import MenuItem from '@mui/material/MenuItem';
import Pagination from '@mui/material/Pagination';
import Stack from '@mui/material/Stack';
import TableCell, { type TableCellProps } from '@mui/material/TableCell';
import TableSortLabel from '@mui/material/TableSortLabel';
import TextField from '@mui/material/TextField';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import useMediaQuery from '@mui/material/useMediaQuery';
import type { Theme } from '@mui/material/styles';
import ArrowUpIcon from '@mui/icons-material/ArrowUpward';
import ArrowDownIcon from '@mui/icons-material/ArrowDownward';
import { TAMANOS_PAGINA, type Dir, type Listado, type TamanoPagina } from '../lib/hooks';

export interface OpcionOrden {
  valor: string;
  texto: string;
  /** Sentido con el que se aplica al elegirlo (las fechas, por ejemplo, mejor de la más reciente a la más antigua). */
  dir?: Dir;
}

const num = (n: number) => n.toLocaleString('es-ES');
const ETIQUETAS: Record<string, string> = { first: 'Primera página', last: 'Última página', next: 'Página siguiente', previous: 'Página anterior' };

/**
 * Pie de un listado paginado.
 * - «26–50 de 312 órdenes».
 * - Ordenar por (si se pasan `ordenes`) y sentido ascendente/descendente.
 * - Elementos por página: 10, 25, 50 o 100.
 * - Páginas con primera, anterior, siguiente y última, y un campo para saltar a una página concreta.
 * Con pocos elementos (caben en la página más pequeña) solo muestra el resumen.
 */
export function Paginacion<T>({
  listado,
  nombre,
  ordenes,
  tamanos = TAMANOS_PAGINA,
}: {
  listado: Listado<T>;
  /** Cómo se llaman los elementos: ['orden', 'órdenes']. */
  nombre: [singular: string, plural: string];
  ordenes?: OpcionOrden[];
  tamanos?: readonly TamanoPagina[];
}) {
  const movil = useMediaQuery((t: Theme) => t.breakpoints.down('sm'));
  const [salto, setSalto] = useState('');
  const d = listado.datos;
  if (!d) return null;
  const { total, paginas } = d;
  const desde = total ? (listado.pagina - 1) * listado.porPagina + 1 : 0;
  const hasta = Math.min(total, listado.pagina * listado.porPagina);
  const resumen = total === 0 ? `Ningún ${nombre[0]}` : total === 1 ? `1 ${nombre[0]}` : hasta - desde + 1 === total ? `${num(total)} ${nombre[1]}` : `${num(desde)}–${num(hasta)} de ${num(total)} ${nombre[1]}`;
  const pocos = total <= Math.min(...tamanos) && listado.pagina === 1;
  const opcionActual = ordenes?.find((o) => o.valor === listado.orden) ?? ordenes?.[0];
  const dirActual: Dir = listado.dir ?? opcionActual?.dir ?? 'asc';

  const saltar = () => {
    const p = Number(salto);
    if (Number.isInteger(p) && p >= 1 && p <= paginas) listado.irA(p);
    setSalto('');
  };

  return (
    <Stack
      component="nav"
      aria-label={`Paginación de ${nombre[1]}`}
      direction={{ xs: 'column', md: 'row' }}
      spacing={1.5}
      sx={{ mt: 2, alignItems: { md: 'center' }, justifyContent: 'space-between', flexWrap: 'wrap', rowGap: 1.5 }}
    >
      <Typography variant="body2" color="text.secondary" role="status" aria-live="polite">
        {resumen}
        {listado.cargando && ' · cargando…'}
      </Typography>
      {!pocos && (
        <Stack direction="row" sx={{ flexWrap: 'wrap', gap: 1.5, alignItems: 'center' }}>
          {ordenes && ordenes.length > 1 && (
            <Stack direction="row" spacing={0.5} sx={{ alignItems: 'center' }}>
              <TextField
                select
                size="small"
                label="Ordenar por"
                value={opcionActual?.valor ?? ''}
                onChange={(e) => {
                  const o = ordenes.find((x) => x.valor === e.target.value);
                  if (o) listado.ordenar(o.valor, o.dir ?? 'asc');
                }}
                sx={{ minWidth: 160 }}
              >
                {ordenes.map((o) => <MenuItem key={o.valor} value={o.valor}>{o.texto}</MenuItem>)}
              </TextField>
              <Tooltip title={dirActual === 'asc' ? 'Ascendente (pulsa para invertir)' : 'Descendente (pulsa para invertir)'}>
                <IconButton
                  aria-label={`Orden ${dirActual === 'asc' ? 'ascendente' : 'descendente'}. Invertir`}
                  onClick={() => opcionActual && listado.ordenar(opcionActual.valor, dirActual === 'asc' ? 'desc' : 'asc')}
                >
                  {dirActual === 'asc' ? <ArrowUpIcon fontSize="small" /> : <ArrowDownIcon fontSize="small" />}
                </IconButton>
              </Tooltip>
            </Stack>
          )}
          <TextField
            select
            size="small"
            label="Por página"
            value={listado.porPagina}
            onChange={(e) => listado.cambiarPorPagina(Number(e.target.value) as TamanoPagina)}
            sx={{ width: 110 }}
          >
            {tamanos.map((n) => <MenuItem key={n} value={n}>{n}</MenuItem>)}
          </TextField>
          {paginas > 1 && (
            <Pagination
              count={paginas}
              page={Math.min(listado.pagina, paginas)}
              onChange={(_, p) => listado.irA(p)}
              showFirstButton
              showLastButton
              siblingCount={movil ? 0 : 1}
              boundaryCount={1}
              size={movil ? 'small' : 'medium'}
              color="primary"
              getItemAriaLabel={(tipo, p, actual) => (tipo === 'page' ? `${actual ? 'Página actual, ' : 'Ir a la '}página ${p}` : (ETIQUETAS[tipo] ?? ''))}
            />
          )}
          {paginas > 5 && (
            <TextField
              size="small"
              label="Ir a"
              value={salto}
              onChange={(e) => setSalto(e.target.value.replace(/\D/g, ''))}
              onKeyDown={(e) => e.key === 'Enter' && saltar()}
              onBlur={() => salto && saltar()}
              slotProps={{ htmlInput: { inputMode: 'numeric', 'aria-label': `Ir a la página (1 a ${paginas})` }, input: { endAdornment: <InputAdornment position="end">/{paginas}</InputAdornment> } }}
              sx={{ width: 110 }}
            />
          )}
        </Stack>
      )}
    </Stack>
  );
}

/** Cabecera de columna que ordena el listado al pulsarla (y muestra el sentido actual). */
export function CeldaOrden<T>({
  listado,
  campo,
  dirInicial = 'asc',
  children,
  ...props
}: { listado: Listado<T>; campo: string; dirInicial?: Dir; children: ReactNode } & Omit<TableCellProps, 'children'>) {
  const activa = listado.orden === campo;
  const dir = activa ? (listado.dir ?? dirInicial) : dirInicial;
  return (
    <TableCell sortDirection={activa ? dir : false} {...props}>
      <TableSortLabel active={activa} direction={dir} onClick={() => listado.ordenar(campo, activa ? (dir === 'asc' ? 'desc' : 'asc') : dirInicial)}>
        {children}
      </TableSortLabel>
    </TableCell>
  );
}
