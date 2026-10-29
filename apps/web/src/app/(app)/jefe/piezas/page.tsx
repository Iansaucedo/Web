'use client';
import { useState } from 'react';
import Button from '@mui/material/Button';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import Chip from '@mui/material/Chip';
import Dialog from '@mui/material/Dialog';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import Grid from '@mui/material/Grid2';
import IconButton from '@mui/material/IconButton';
import Menu from '@mui/material/Menu';
import MenuItem from '@mui/material/MenuItem';
import Stack from '@mui/material/Stack';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableContainer from '@mui/material/TableContainer';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import EditIcon from '@mui/icons-material/EditOutlined';
import { Cabecera, Carga, Confirmar, useDialogo } from '../../../../components/Comunes';
import { ChipEstado } from '../../../../components/ChipEstado';
import { api } from '../../../../lib/api';
import { useAccion, useDatos } from '../../../../lib/hooks';
import { CATEGORIAS, euros, fechaHora, hora, hoy } from '../../../../lib/formato';
import type { Lista, MovimientoStock, Pieza } from '../../../../lib/tipos';

// Pantalla «Jefe · Catálogo de piezas» de Figma: tabla con lápiz por fila (menú de acciones) y panel «Movimientos de hoy».
const TIPO_MOV: Record<MovimientoStock['tipo'], string> = { ALTA: 'Alta', AJUSTE: 'Ajuste', CUADRE: 'Cuadre de inventario', USO: 'Usada en reparación', RECEPCION: 'Pedido recibido' };
type Filtro = '' | 'stockBajo' | 'inactivas';

export default function Catalogo() {
  const [q, setQ] = useState('');
  const [filtro, setFiltro] = useState<Filtro>('');
  const piezas = useDatos<Lista<Pieza>>(`/piezas?${new URLSearchParams({ ...(q ? { q } : {}), ...(filtro ? { [filtro]: 'true' } : {}) })}`);
  const movimientos = useDatos<Lista<MovimientoStock & { pieza: string }>>(`/movimientos-stock?fecha=${hoy()}`);
  const [menu, setMenu] = useState<{ ancla: HTMLElement; pieza: Pieza } | null>(null);
  const nueva = useDialogo();
  const ajuste = useDialogo<Pieza>();
  const cuadre = useDialogo<Pieza>();
  const historial = useDialogo<Pieza>();
  const borrar = useDialogo<Pieza>();
  const [f, setF] = useState({ referencia: '', nombre: '', categoria: 'OTRAS', precio: '', stock: '0', minimo: '2' });
  const [delta, setDelta] = useState('');
  const [real, setReal] = useState('');
  const [motivo, setMotivo] = useState('');
  const acc = useAccion();
  const recargar = () => { void piezas.recargar(); void movimientos.recargar(); };
  const abrir = (d: { abrir: (p: Pieza) => void }) => { const p = menu!.pieza; setMenu(null); setMotivo(''); setDelta(''); setReal(String(p.stock)); d.abrir(p); };

  return (
    <>
      <Cabecera titulo="Catálogo de piezas" subtitulo={piezas.datos ? `${piezas.datos.datos.length} referencias · ${piezas.datos.datos.filter((p) => p.stockBajo).length} con stock bajo` : undefined} acciones={<Button variant="contained" onClick={() => nueva.abrir(true)}>Nueva pieza</Button>} />
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} sx={{ mb: 2, alignItems: { sm: 'center' } }}>
        <TextField label="Buscar por referencia o nombre" value={q} onChange={(e) => setQ(e.target.value)} sx={{ maxWidth: 420 }} />
        <Stack direction="row" spacing={1}>
          {([['stockBajo', 'Stock bajo'], ['inactivas', 'Inactivas']] as const).map(([v, t]) => (
            <Chip key={v} label={t} variant={filtro === v ? 'filled' : 'outlined'} color={filtro === v ? 'primary' : 'default'} onClick={() => setFiltro(filtro === v ? '' : v)} aria-pressed={filtro === v} />
          ))}
        </Stack>
      </Stack>
      <Grid container spacing={3}>
        <Grid size={{ xs: 12, lg: 8 }}>
          <Carga {...piezas}>
            {(d) => (
              <Card>
                <TableContainer>
                  <Table>
                    <TableHead><TableRow><TableCell>Referencia</TableCell><TableCell>Pieza</TableCell><TableCell align="right">Precio</TableCell><TableCell>Stock</TableCell><TableCell /></TableRow></TableHead>
                    <TableBody>
                      {d.datos.map((p) => (
                        <TableRow key={p.id} sx={{ opacity: p.activa ? 1 : 0.6 }}>
                          <TableCell>{p.referencia}</TableCell>
                          <TableCell>{p.nombre}<Typography variant="caption" display="block" color="text.secondary">{CATEGORIAS[p.categoria] ?? p.categoria}</Typography></TableCell>
                          <TableCell align="right">{euros(p.precioCentimos)}</TableCell>
                          <TableCell>
                            <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
                              <span>{p.stock}</span>
                              {p.stock === 0 ? <ChipEstado tono="error" texto="Sin stock" /> : p.stockBajo ? <ChipEstado tono="aviso" texto="Bajo" /> : null}
                            </Stack>
                          </TableCell>
                          <TableCell align="right">
                            <IconButton aria-label={`Acciones de ${p.referencia}`} aria-haspopup="menu" onClick={(e) => setMenu({ ancla: e.currentTarget, pieza: p })}><EditIcon /></IconButton>
                          </TableCell>
                        </TableRow>
                      ))}
                      {!d.datos.length && <TableRow><TableCell colSpan={5}>No hay piezas.</TableCell></TableRow>}
                    </TableBody>
                  </Table>
                </TableContainer>
              </Card>
            )}
          </Carga>
          <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: 'block' }}>Solo el jefe (y el dueño) cambia el stock, siempre con motivo. Todo queda en el historial de cada pieza.</Typography>
        </Grid>
        <Grid size={{ xs: 12, lg: 4 }}>
          <Card>
            <CardContent>
              <Typography variant="h6">Movimientos de hoy</Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>Piezas usadas, recibidas y ajustadas, para revisarlas.</Typography>
              <Carga {...movimientos}>
                {(m) => (
                  <Stack spacing={1.5}>
                    {m.datos.map((x) => (
                      <div key={x.id}>
                        <Typography variant="body2" sx={{ fontWeight: 500 }}>{x.delta > 0 ? `+${x.delta}` : x.delta} {x.pieza}</Typography>
                        <Typography variant="caption" color="text.secondary">{TIPO_MOV[x.tipo]}{x.ordenCodigo ? ` · ${x.ordenCodigo}` : ''} · {x.usuario} · {hora(x.fecha)}{x.motivo ? ` · ${x.motivo}` : ''}</Typography>
                      </div>
                    ))}
                    {!m.datos.length && <Typography variant="body2" color="text.secondary">Hoy no ha habido movimientos.</Typography>}
                  </Stack>
                )}
              </Carga>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      <Menu anchorEl={menu?.ancla} open={Boolean(menu)} onClose={() => setMenu(null)}>
        <MenuItem onClick={() => abrir(ajuste)}>Ajustar stock</MenuItem>
        <MenuItem onClick={() => abrir(cuadre)}>Cuadrar con el inventario</MenuItem>
        <MenuItem onClick={() => abrir(historial)}>Historial de stock</MenuItem>
        <MenuItem onClick={() => abrir(borrar)} sx={{ color: 'error.main' }}>Eliminar del catálogo</MenuItem>
      </Menu>

      <Confirmar
        abierto={nueva.abierto}
        titulo="Nueva pieza en el catálogo"
        textoConfirmar="Guardar pieza"
        ocupado={acc.ocupado}
        error={acc.error}
        deshabilitado={!f.referencia || !f.nombre || !f.precio}
        onCerrar={() => { nueva.cerrar(); acc.limpiarError(); }}
        onConfirmar={async () => {
          const ok = await acc.ejecutar((clave) => api.post('/piezas', { referencia: f.referencia, nombre: f.nombre, categoria: f.categoria, precioCentimos: Math.round(Number(f.precio.replace(',', '.')) * 100), stock: Number(f.stock), stockMinimo: Number(f.minimo) }, { claveIdempotencia: clave }), 'Pieza añadida');
          if (ok) { nueva.cerrar(); setF({ referencia: '', nombre: '', categoria: 'OTRAS', precio: '', stock: '0', minimo: '2' }); recargar(); }
        }}
      >
        <Stack direction="row" spacing={2}>
          <TextField label="Referencia" value={f.referencia} onChange={(e) => setF({ ...f, referencia: e.target.value })} />
          <TextField select label="Categoría" value={f.categoria} onChange={(e) => setF({ ...f, categoria: e.target.value })}>
            {Object.entries(CATEGORIAS).map(([k, v]) => <MenuItem key={k} value={k}>{v}</MenuItem>)}
          </TextField>
        </Stack>
        <TextField label="Nombre" value={f.nombre} onChange={(e) => setF({ ...f, nombre: e.target.value })} />
        <Stack direction="row" spacing={2}>
          <TextField label="Precio sin IVA (€)" value={f.precio} onChange={(e) => setF({ ...f, precio: e.target.value })} inputProps={{ inputMode: 'decimal' }} />
          <TextField label="Stock inicial" type="number" value={f.stock} onChange={(e) => setF({ ...f, stock: e.target.value })} />
        </Stack>
        <TextField label="Stock mínimo" type="number" value={f.minimo} onChange={(e) => setF({ ...f, minimo: e.target.value })} helperText="Avisaremos cuando quede menos" />
      </Confirmar>
      <Confirmar
        abierto={ajuste.abierto}
        titulo={`Ajustar stock · ${ajuste.valor?.nombre ?? ''}`}
        textoConfirmar="Ajustar"
        ocupado={acc.ocupado}
        error={acc.error}
        deshabilitado={!delta || Number(delta) === 0 || !motivo.trim()}
        onCerrar={() => { ajuste.cerrar(); acc.limpiarError(); }}
        onConfirmar={async () => {
          const ok = await acc.ejecutar(() => api.post(`/piezas/${ajuste.valor!.id}/ajuste-stock`, { delta: Number(delta), motivo }), 'Stock ajustado. Queda registrado');
          if (ok) { ajuste.cerrar(); recargar(); }
        }}
      >
        <TextField label="Unidades (+ entran, − salen)" type="number" value={delta} onChange={(e) => setDelta(e.target.value)} helperText={`Ahora hay ${ajuste.valor?.stock ?? 0}`} />
        <TextField label="Motivo (obligatorio)" value={motivo} onChange={(e) => setMotivo(e.target.value)} />
      </Confirmar>
      <Confirmar
        abierto={cuadre.abierto}
        titulo={`Cuadrar stock · ${cuadre.valor?.nombre ?? ''}`}
        textoConfirmar="Cuadrar"
        ocupado={acc.ocupado}
        error={acc.error}
        deshabilitado={real === '' || Number(real) < 0 || !motivo.trim()}
        onCerrar={() => { cuadre.cerrar(); acc.limpiarError(); }}
        onConfirmar={async () => {
          const ok = await acc.ejecutar(() => api.post(`/piezas/${cuadre.valor!.id}/cuadre`, { stockReal: Number(real), motivo }), 'Stock cuadrado. Queda registrado');
          if (ok) { cuadre.cerrar(); recargar(); }
        }}
      >
        <Typography variant="body2" color="text.secondary">Tras contar las unidades del almacén. El stock pasa a ser el número contado.</Typography>
        <Stack direction="row" spacing={2}>
          <TextField label="Stock en el sistema" value={String(cuadre.valor?.stock ?? 0)} disabled />
          <TextField label="Unidades contadas" type="number" value={real} onChange={(e) => setReal(e.target.value)} inputProps={{ min: 0 }} />
        </Stack>
        <TextField label="Motivo (obligatorio)" value={motivo} onChange={(e) => setMotivo(e.target.value)} helperText={real !== '' && cuadre.valor ? `Diferencia: ${Number(real) - cuadre.valor.stock > 0 ? '+' : ''}${Number(real) - cuadre.valor.stock}. Queda registrado en el historial de la pieza con tu nombre.` : undefined} />
      </Confirmar>
      <Confirmar
        abierto={borrar.abierto}
        titulo={`¿Eliminar ${borrar.valor?.nombre ?? ''}?`}
        textoConfirmar="Eliminar"
        peligro
        ocupado={acc.ocupado}
        error={acc.error}
        onCerrar={() => { borrar.cerrar(); acc.limpiarError(); }}
        onConfirmar={async () => {
          const ok = await acc.ejecutar(() => api.delete(`/piezas/${borrar.valor!.id}`, motivo.trim() ? { motivo } : {}), 'Pieza eliminada del catálogo');
          if (ok) { borrar.cerrar(); recargar(); }
        }}
      >
        <Typography>Saldrá del catálogo. Si ya se usó en reparaciones, su historial se conserva. Queda constancia de quién la eliminó.</Typography>
        <TextField label="Motivo (opcional)" value={motivo} onChange={(e) => setMotivo(e.target.value)} />
      </Confirmar>
      <Dialog open={historial.abierto} onClose={historial.cerrar} fullWidth maxWidth="md">
        <DialogTitle>Historial de stock · {historial.valor?.nombre}</DialogTitle>
        <DialogContent>{historial.valor && <Movimientos piezaId={historial.valor.id} />}</DialogContent>
      </Dialog>
    </>
  );
}

function Movimientos({ piezaId }: { piezaId: string }) {
  const m = useDatos<Lista<MovimientoStock>>(`/piezas/${piezaId}/movimientos`);
  return (
    <Carga {...m}>
      {(d) => (
        <>
          <TableContainer>
            <Table size="small">
              <TableHead><TableRow><TableCell>Fecha</TableCell><TableCell>Movimiento</TableCell><TableCell align="right">Cambio</TableCell><TableCell align="right">Stock</TableCell><TableCell>Quién · motivo</TableCell></TableRow></TableHead>
              <TableBody>
                {d.datos.map((x) => (
                  <TableRow key={x.id}>
                    <TableCell>{fechaHora(x.fecha)}</TableCell>
                    <TableCell>{TIPO_MOV[x.tipo]}{x.ordenCodigo ? ` · ${x.ordenCodigo}` : ''}</TableCell>
                    <TableCell align="right">{x.delta > 0 ? `+${x.delta}` : x.delta}</TableCell>
                    <TableCell align="right">{x.stockAntes} → {x.stockDespues}</TableCell>
                    <TableCell>{x.usuario}{x.motivo ? ` · ${x.motivo}` : ''}</TableCell>
                  </TableRow>
                ))}
                {!d.datos.length && <TableRow><TableCell colSpan={5}>Sin movimientos.</TableCell></TableRow>}
              </TableBody>
            </Table>
          </TableContainer>
          <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: 'block' }}>La suma de los cambios es el stock actual.</Typography>
        </>
      )}
    </Carga>
  );
}
