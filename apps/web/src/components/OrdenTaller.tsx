'use client';
import { useState } from 'react';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import Divider from '@mui/material/Divider';
import FormControlLabel from '@mui/material/FormControlLabel';
import Grid from '@mui/material/Grid2';
import IconButton from '@mui/material/IconButton';
import MenuItem from '@mui/material/MenuItem';
import Stack from '@mui/material/Stack';
import Switch from '@mui/material/Switch';
import Tab from '@mui/material/Tab';
import Tabs from '@mui/material/Tabs';
import TextField from '@mui/material/TextField';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import AddIcon from '@mui/icons-material/Add';
import CloseIcon from '@mui/icons-material/Close';
import DeleteIcon from '@mui/icons-material/DeleteOutline';
import PhoneIcon from '@mui/icons-material/PhoneOutlined';
import { Cabecera, Carga, Confirmar, MiniaturasFotos, useDialogo } from './Comunes';
import { ChipEstado } from './ChipEstado';
import { LineaTiempo } from './LineaTiempo';
import { useSesion } from './Sesion';
import { api, mensajeError } from '../lib/api';
import { useAccion, useDatos } from '../lib/hooks';
import { ESTADO_ORDEN, ESTADO_PEDIDO, euros, fechaHora, horasMin } from '../lib/formato';
import type { Lista, OrdenDetalle, Partida, Pieza, Puesto } from '../lib/tipos';

type Recargar = () => Promise<void>;

const TIPOS_FOTO = ['image/jpeg', 'image/png', 'image/webp'];
const MAX_FOTOS = 6;

type FotoSubida = { id: string; url: string };

/** Fotos de un trabajo: se suben al elegirlas y se adjuntan al enviar la solicitud. */
function FotosTrabajo({ fotos, onCambio, n }: { fotos: FotoSubida[]; onCambio: (f: FotoSubida[]) => void; n: number }) {
  const [subiendo, setSubiendo] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const elegir = async (archivos: FileList | null) => {
    if (!archivos?.length) return;
    setError(null);
    const nuevas: FotoSubida[] = [];
    setSubiendo(true);
    try {
      for (const a of Array.from(archivos).slice(0, MAX_FOTOS - fotos.length)) {
        if (!TIPOS_FOTO.includes(a.type)) { setError(`«${a.name}» no es JPEG, PNG ni WebP`); continue; }
        if (a.size > 5 * 1024 * 1024) { setError(`«${a.name}» pasa de 5 MB`); continue; }
        try {
          nuevas.push(await api.subir<FotoSubida>('/fotos', a));
        } catch (e) {
          setError(mensajeError(e));
        }
      }
    } finally {
      setSubiendo(false);
      onCambio([...fotos, ...nuevas]);
    }
  };
  return (
    <Stack spacing={1}>
      <Typography variant="body2" sx={{ fontWeight: 500 }} id={`fotos-${n}`}>Fotos</Typography>
      <Stack direction="row" spacing={1.5} sx={{ alignItems: 'center', flexWrap: 'wrap', gap: 1 }} aria-labelledby={`fotos-${n}`}>
        {fotos.map((f, i) => (
          <Box key={f.id} sx={{ position: 'relative' }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={f.url} alt={`Foto ${i + 1} del trabajo ${n}`} width={64} height={64} style={{ objectFit: 'cover', borderRadius: 8, display: 'block' }} />
            <IconButton size="small" aria-label={`Quitar foto ${i + 1} del trabajo ${n}`} onClick={() => onCambio(fotos.filter((x) => x.id !== f.id))} sx={{ position: 'absolute', top: -10, right: -10, bgcolor: 'background.paper', boxShadow: 1, '&:hover': { bgcolor: 'background.paper' } }}>
              <CloseIcon fontSize="small" />
            </IconButton>
          </Box>
        ))}
        {fotos.length < MAX_FOTOS && (
          <Button component="label" variant="outlined" startIcon={<AddIcon />} disabled={subiendo}>
            {subiendo ? 'Subiendo…' : 'Añadir foto'}
            <input hidden type="file" accept={TIPOS_FOTO.join(',')} multiple capture="environment" aria-label={`Añadir foto al trabajo ${n}`} onChange={(e) => { void elegir(e.target.files); e.target.value = ''; }} />
          </Button>
        )}
        <Typography variant="caption" color="text.secondary">El cliente verá las fotos junto al trabajo</Typography>
      </Stack>
      {error && <Alert severity="error" onClose={() => setError(null)}>{error}</Alert>}
    </Stack>
  );
}

function NuevaSolicitud({ ordenId, tarifa, abierto, onCerrar, onHecho }: { ordenId: string; tarifa: number; abierto: boolean; onCerrar: () => void; onHecho: Recargar }) {
  const vacia = { descripcion: '', horas: '1', piezas: '0', fotos: [] as FotoSubida[] };
  const [lineas, setLineas] = useState([vacia]);
  const { ejecutar, ocupado, error, limpiarError } = useAccion();
  const importe = (l: typeof vacia) => Math.round(Number(l.horas || 0) * tarifa) + Math.round(Number(l.piezas.replace(',', '.') || 0) * 100);
  const validas = lineas.every((l) => l.descripcion.trim().length >= 3 && Number(l.horas) >= 0);
  const enviar = async () => {
    const ok = await ejecutar(
      (clave) => api.post(`/ordenes/${ordenId}/solicitudes`, { partidas: lineas.map((l) => ({ descripcion: l.descripcion, horasEstimadas: Number(l.horas), piezasEstimadasCentimos: Math.round(Number(l.piezas.replace(',', '.') || 0) * 100), fotoIds: l.fotos.map((f) => f.id) })) }, { claveIdempotencia: clave }),
      'Presupuesto enviado al cliente',
    );
    if (ok) {
      setLineas([vacia]);
      onCerrar();
      await onHecho();
    }
  };
  return (
    <Confirmar abierto={abierto} titulo="Pedir autorización al cliente" textoConfirmar="Enviar al cliente" ocupado={ocupado} error={error} onCerrar={() => { limpiarError(); onCerrar(); }} onConfirmar={enviar} deshabilitado={!validas}>
      <Typography variant="body2" color="text.secondary">El cliente acepta o rechaza cada trabajo. Importe = horas × tarifa + piezas (sin IVA).</Typography>
      {lineas.map((l, i) => (
        <Stack key={i} spacing={1.5} sx={{ p: 2, border: 1, borderColor: 'divider', borderRadius: 2 }}>
          <Stack direction="row" spacing={1}>
            <TextField label={`Trabajo ${i + 1}`} value={l.descripcion} onChange={(e) => setLineas(lineas.map((x, j) => (j === i ? { ...x, descripcion: e.target.value } : x)))} />
            {lineas.length > 1 && <IconButton aria-label="Quitar trabajo" onClick={() => setLineas(lineas.filter((_, j) => j !== i))}><DeleteIcon /></IconButton>}
          </Stack>
          <Stack direction="row" spacing={1.5}>
            <TextField select label="Horas" value={l.horas} onChange={(e) => setLineas(lineas.map((x, j) => (j === i ? { ...x, horas: e.target.value } : x)))}>
              {['0', '0.25', '0.5', '0.75', '1', '1.5', '2', '2.5', '3', '4', '5', '6', '8', '10', '12', '16'].map((h) => <MenuItem key={h} value={h}>{h.replace('.', ',')} h</MenuItem>)}
            </TextField>
            <TextField label="Piezas (€)" value={l.piezas} onChange={(e) => setLineas(lineas.map((x, j) => (j === i ? { ...x, piezas: e.target.value } : x)))} inputProps={{ inputMode: 'decimal' }} />
          </Stack>
          <FotosTrabajo n={i + 1} fotos={l.fotos} onCambio={(fotos) => setLineas((ls) => ls.map((x, j) => (j === i ? { ...x, fotos } : x)))} />
          <Typography variant="body2">Importe: <strong>{euros(importe(l))}</strong> + IVA</Typography>
        </Stack>
      ))}
      <Button onClick={() => setLineas([...lineas, vacia])} sx={{ alignSelf: 'flex-start' }}>Añadir otro trabajo</Button>
    </Confirmar>
  );
}

function RegistrarPieza({ partida, abierto, onCerrar, onHecho }: { partida: Partida | null; abierto: boolean; onCerrar: () => void; onHecho: Recargar }) {
  const [tab, setTab] = useState(0);
  const piezas = useDatos<Lista<Pieza>>(abierto ? '/piezas' : null);
  const [piezaId, setPiezaId] = useState('');
  const [cantidad, setCantidad] = useState('1');
  const [descripcion, setDescripcion] = useState('');
  const [destino, setDestino] = useState('DESECHADA');
  const { ejecutar, ocupado, error, limpiarError } = useAccion();
  const pieza = piezas.datos?.datos.find((p) => p.id === piezaId);
  const n = Number(cantidad);
  const guardar = async () => {
    const ruta = ['piezas-usadas', 'piezas-quitadas', 'pedidos'][tab];
    const cuerpo =
      tab === 0 ? { piezaId, cantidad: n } : tab === 1 ? { descripcion, cantidad: n, destino } : piezaId ? { piezaId, cantidad: n } : { descripcionLibre: descripcion, cantidad: n };
    const ok = await ejecutar((clave) => api.post(`/partidas/${partida!.id}/${ruta}`, cuerpo, { claveIdempotencia: clave }), ['Pieza registrada', 'Pieza retirada registrada', 'Pedido enviado al jefe'][tab]);
    if (ok) {
      setPiezaId('');
      setDescripcion('');
      setCantidad('1');
      onCerrar();
      await onHecho();
    }
  };
  const valido = n >= 1 && Number.isInteger(n) && (tab === 0 ? Boolean(piezaId) && (!pieza || pieza.stock >= n) : tab === 1 ? descripcion.trim().length > 0 : Boolean(piezaId) || descripcion.trim().length >= 3);
  return (
    <Confirmar abierto={abierto} titulo={`Piezas · ${partida?.descripcion ?? ''}`} textoConfirmar={['Registrar', 'Registrar', 'Pedir'][tab]} ocupado={ocupado} error={error} onCerrar={() => { limpiarError(); onCerrar(); }} onConfirmar={guardar} deshabilitado={!valido}>
      <Tabs value={tab} onChange={(_, v) => { setTab(v); limpiarError(); }} variant="fullWidth">
        <Tab label="Del almacén" />
        <Tab label="Quitada" />
        <Tab label="Pedir" />
      </Tabs>
      {tab !== 1 && (
        <TextField select label={tab === 2 ? 'Pieza del catálogo (opcional)' : 'Pieza'} value={piezaId} onChange={(e) => setPiezaId(e.target.value)}>
          {tab === 2 && <MenuItem value="">No está en el catálogo</MenuItem>}
          {piezas.datos?.datos.map((p) => (
            <MenuItem key={p.id} value={p.id} disabled={tab === 0 && p.stock === 0}>
              {p.nombre} · {p.referencia} · {p.stock} en stock · {euros(p.precioCentimos)}
            </MenuItem>
          ))}
        </TextField>
      )}
      {(tab === 1 || (tab === 2 && !piezaId)) && <TextField label={tab === 1 ? '¿Qué has quitado?' : 'Describe la pieza'} value={descripcion} onChange={(e) => setDescripcion(e.target.value)} />}
      <TextField label="Cantidad" type="number" value={cantidad} onChange={(e) => setCantidad(e.target.value)} inputProps={{ min: 1, max: 100 }} error={tab === 0 && Boolean(pieza) && pieza!.stock < n} helperText={tab === 0 && pieza && pieza.stock < n ? `Solo hay ${pieza.stock}. Pídela en la pestaña «Pedir»` : undefined} />
      {tab === 1 && (
        <TextField select label="Destino" value={destino} onChange={(e) => setDestino(e.target.value)}>
          <MenuItem value="DESECHADA">Desechada</MenuItem>
          <MenuItem value="DEVUELTA_CLIENTE">Se devuelve al cliente</MenuItem>
        </TextField>
      )}
    </Confirmar>
  );
}

function TrabajoAceptado({ p, ordenId, editable, onHecho }: { p: Partida; ordenId: string; editable: boolean; onHecho: Recargar }) {
  const [horas, setHoras] = useState(false);
  const [piezas, setPiezas] = useState(false);
  const [terminar, setTerminar] = useState(false);
  const [minutos, setMinutos] = useState('60');
  const [nota, setNota] = useState('');
  const acc = useAccion();
  return (
    <Box>
      <Stack direction="row" sx={{ justifyContent: 'space-between', gap: 1, flexWrap: 'wrap' }}>
        <div>
          <Typography sx={{ fontWeight: 500 }}>{p.descripcion}</Typography>
          <Typography variant="body2" color="text.secondary">
            {horasMin(p.minutosRegistrados)} registradas de {p.horasEstimadas} h · {euros(p.importeEstimadoCentimos)} estimado
          </Typography>
        </div>
        {p.terminadaEn ? <ChipEstado tono="exito" texto="Terminado" /> : <ChipEstado tono="info" texto="En curso" />}
      </Stack>
      <MiniaturasFotos fotos={p.fotos} trabajo={p.descripcion} tamano={56} />
      {(p.piezasUsadas.length > 0 || p.piezasQuitadas.length > 0 || p.pedidos.length > 0) && (
        <Stack sx={{ mt: 1, pl: 1 }} spacing={0.5}>
          {p.piezasUsadas.map((u) => <Typography key={u.id} variant="body2">+ {u.cantidad} × {u.pieza} ({u.mecanico})</Typography>)}
          {p.piezasQuitadas.map((q) => <Typography key={q.id} variant="body2">− {q.cantidad} × {q.descripcion} · {q.destino === 'DESECHADA' ? 'desechada' : 'para el cliente'}</Typography>)}
          {p.pedidos.map((x) => <Stack key={x.id} direction="row" spacing={1} sx={{ alignItems: 'center' }}><Typography variant="body2">Pedido: {x.cantidad} × {x.pieza}</Typography><ChipEstado {...ESTADO_PEDIDO[x.estado]} /></Stack>)}
        </Stack>
      )}
      {editable && !p.terminadaEn && (
        <Stack direction="row" spacing={1} sx={{ mt: 1.5, flexWrap: 'wrap', gap: 1 }}>
          <Button size="small" variant="tonal" onClick={() => setHoras(true)}>Registrar horas</Button>
          <Button size="small" variant="tonal" onClick={() => setPiezas(true)}>Registrar pieza</Button>
          <Button size="small" onClick={() => setTerminar(true)}>Marcar terminado</Button>
        </Stack>
      )}
      <Confirmar
        abierto={horas}
        titulo="Registrar horas"
        textoConfirmar="Registrar"
        ocupado={acc.ocupado}
        error={acc.error}
        onCerrar={() => setHoras(false)}
        deshabilitado={!nota.trim()}
        onConfirmar={async () => {
          const ok = await acc.ejecutar((clave) => api.post(`/ordenes/${ordenId}/trabajos`, { partidaId: p.id, minutos: Number(minutos), descripcion: nota }, { claveIdempotencia: clave }), 'Horas registradas');
          if (ok) { setHoras(false); setNota(''); await onHecho(); }
        }}
      >
        <TextField select label="Tiempo" value={minutos} onChange={(e) => setMinutos(e.target.value)}>
          {[15, 30, 45, 60, 90, 120, 180, 240, 300, 360, 480].map((m) => <MenuItem key={m} value={String(m)}>{horasMin(m)}</MenuItem>)}
        </TextField>
        <TextField label="¿Qué has hecho?" value={nota} onChange={(e) => setNota(e.target.value)} multiline minRows={2} />
      </Confirmar>
      <RegistrarPieza partida={p} abierto={piezas} onCerrar={() => setPiezas(false)} onHecho={onHecho} />
      <Confirmar
        abierto={terminar}
        titulo="¿Marcar el trabajo como terminado?"
        textoConfirmar="Terminado"
        ocupado={acc.ocupado}
        error={acc.error}
        onCerrar={() => setTerminar(false)}
        onConfirmar={async () => {
          const ok = await acc.ejecutar(() => api.post(`/partidas/${p.id}/terminar`), 'Trabajo terminado');
          if (ok) { setTerminar(false); await onHecho(); }
        }}
      >
        <Typography>Después no se podrán registrar más horas ni piezas en «{p.descripcion}».</Typography>
      </Confirmar>
    </Box>
  );
}

const kmValidos = (valor: string, kmEntrada: number) => /^\d{1,7}$/.test(valor) && Number(valor) >= kmEntrada;

function CampoKmSalida({ valor, onCambio, kmEntrada, ayuda }: { valor: string; onCambio: (v: string) => void; kmEntrada: number; ayuda?: string }) {
  const menor = valor !== '' && /^\d+$/.test(valor) && Number(valor) < kmEntrada;
  return (
    <TextField
      label="Kilómetros a la salida"
      required
      value={valor}
      onChange={(e) => onCambio(e.target.value.replace(/\D/g, ''))}
      slotProps={{ htmlInput: { inputMode: 'numeric', 'aria-describedby': 'km-salida-ayuda' } }}
      error={menor}
      helperText={<span id="km-salida-ayuda">{menor ? `No pueden ser menos que a la entrada (${kmEntrada.toLocaleString('es-ES')} km)` : ayuda ?? `A la entrada: ${kmEntrada.toLocaleString('es-ES')} km`}</span>}
    />
  );
}

/** Resumen de la orden en los modales de completar y entregar (como en Figma). */
function ResumenOrden({ o, entrega = false }: { o: OrdenDetalle; entrega?: boolean }) {
  const aceptadas = o.solicitudes.flatMap((s) => s.partidas).filter((p) => p.estado === 'ACEPTADA');
  const filas: [string, string][] = [
    ['Trabajos hechos', entrega ? String(aceptadas.filter((p) => p.terminadaEn).length) : `${aceptadas.filter((p) => p.terminadaEn).length} de ${aceptadas.length} aceptados`],
    ['Tiempo registrado', horasMin(aceptadas.reduce((s, p) => s + p.minutosRegistrados, 0))],
  ];
  if (!entrega) {
    filas.push(['Piezas usadas', String(aceptadas.reduce((s, p) => s + p.piezasUsadas.reduce((x, u) => x + u.cantidad, 0), 0))]);
    filas.push(['Piezas quitadas', String(aceptadas.reduce((s, p) => s + p.piezasQuitadas.reduce((x, q) => x + q.cantidad, 0), 0))]);
  }
  filas.push(o.factura ? ['Total (IVA incl.)', euros(o.factura.total)] : entrega ? ['Total', 'Nada que cobrar'] : ['Total estimado', `${euros(o.presupuesto.total)} IVA incl.`]);
  return (
    <Box component="dl" sx={{ bgcolor: 'action.hover', borderRadius: 2, p: 2, m: 0, display: 'grid', gridTemplateColumns: '1fr auto', rowGap: 1 }}>
      {filas.map(([k, v]) => (
        <Box key={k} sx={{ display: 'contents' }}>
          <Typography component="dt" variant="body2" color="text.secondary">{k}</Typography>
          <Typography component="dd" variant="body2" sx={{ m: 0, textAlign: 'right' }}>{v}</Typography>
        </Box>
      ))}
    </Box>
  );
}

export function OrdenTaller({ id }: { id: string }) {
  const { usuario } = useSesion();
  const orden = useDatos<OrdenDetalle>(`/ordenes/${id}`);
  const config = useDatos<{ tarifaHoraCentimos: number }>('/config');
  const puestos = useDatos<Lista<Puesto>>(usuario.rol === 'JEFE' || usuario.rol === 'DUENO' ? '/puestos' : null);
  const solicitud = useDialogo();
  const obs = useDialogo();
  const completar = useDialogo();
  const entregar = useDialogo();
  const [texto, setTexto] = useState('');
  const [interna, setInterna] = useState(false);
  const [diagnostico, setDiagnostico] = useState<string | null>(null);
  const [entrega, setEntrega] = useState<string | null>(null);
  const [kmSalida, setKmSalida] = useState('');
  const acc = useAccion();
  const gestion = usuario.rol === 'JEFE' || usuario.rol === 'DUENO';

  return (
    <Carga {...orden}>
      {(o) => {
        const editable = o.estado === 'EN_REPARACION' || o.estado === 'ESPERANDO_PIEZAS';
        const partidas = o.solicitudes.flatMap((s) => s.partidas);
        const recargar = orden.recargar;
        const entregaLocal = o.entregaEstimada ? new Date(new Date(o.entregaEstimada).getTime() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16) : '';
        return (
          <>
            <Cabecera
              titulo={`${o.vehiculo.marca} ${o.vehiculo.modelo} · ${o.vehiculo.matricula}`}
              subtitulo={<>{o.codigo} · {o.cliente.nombre} · <a href={`tel:${o.cliente.telefono}`}><PhoneIcon sx={{ fontSize: 14, verticalAlign: 'middle' }} /> {o.cliente.telefono}</a> · {o.puesto?.nombre ?? 'sin puesto'} · {o.kmEntrada.toLocaleString('es-ES')} km{o.kmSalida !== null ? ` → ${o.kmSalida.toLocaleString('es-ES')} km` : ''}</>}
              acciones={<ChipEstado {...ESTADO_ORDEN[o.estado]} />}
            />
            {acc.error && <Alert severity="error" sx={{ mb: 2 }} onClose={acc.limpiarError}>{acc.error}</Alert>}
            <Grid container spacing={3}>
              <Grid size={{ xs: 12, md: 7 }}>
                <Stack spacing={3}>
                  <Card>
                    <CardContent>
                      <Stack spacing={2}>
                        <Typography variant="h6">Diagnóstico</Typography>
                        <Typography variant="body2" color="text.secondary">El cliente dijo: «{o.descripcionProblema}»{o.notasRecepcion ? ` · Recepción: ${o.notasRecepcion}` : ''}</Typography>
                        <TextField label="Diagnóstico" multiline minRows={2} value={diagnostico ?? o.diagnostico ?? ''} onChange={(e) => setDiagnostico(e.target.value)} disabled={o.estado === 'ENTREGADA'} />
                        <TextField label="Entrega estimada (la ve el cliente)" type="datetime-local" value={entrega ?? entregaLocal} onChange={(e) => setEntrega(e.target.value)} InputLabelProps={{ shrink: true }} disabled={o.estado === 'ENTREGADA'} />
                        <Button
                          variant="tonal"
                          sx={{ alignSelf: 'flex-start' }}
                          disabled={acc.ocupado || (diagnostico === null && entrega === null)}
                          onClick={async () => {
                            const ok = await acc.ejecutar(() => api.patch(`/ordenes/${o.id}`, { ...(diagnostico !== null ? { diagnostico } : {}), ...(entrega !== null ? { entregaEstimada: entrega ? new Date(entrega).toISOString() : null } : {}) }), 'Guardado');
                            if (ok) { setDiagnostico(null); setEntrega(null); await recargar(); }
                          }}
                        >
                          Guardar
                        </Button>
                      </Stack>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardContent>
                      <Stack direction="row" sx={{ justifyContent: 'space-between', alignItems: 'center', mb: 2, gap: 1, flexWrap: 'wrap' }}>
                        <Typography variant="h6">Trabajos</Typography>
                        <Button variant="contained" disabled={!(o.estado === 'EN_DIAGNOSTICO' || o.estado === 'EN_REPARACION')} onClick={() => solicitud.abrir(true)}>Pedir autorización</Button>
                      </Stack>
                      {o.estado === 'ESPERANDO_AUTORIZACION' && <Alert severity="warning" sx={{ mb: 2 }}>Esperando la respuesta del cliente.</Alert>}
                      {!partidas.length && <Typography color="text.secondary">Aún no hay trabajos propuestos.</Typography>}
                      <Stack divider={<Divider />} spacing={2}>
                        {partidas.map((p) =>
                          p.estado === 'ACEPTADA' ? (
                            <TrabajoAceptado key={p.id} p={p} ordenId={o.id} editable={editable} onHecho={recargar} />
                          ) : (
                            <Stack key={p.id} direction="row" sx={{ justifyContent: 'space-between' }}>
                              <Typography color={p.estado === 'RECHAZADA' ? 'text.secondary' : undefined} sx={{ textDecoration: p.estado === 'RECHAZADA' ? 'line-through' : undefined }}>{p.descripcion}</Typography>
                              <ChipEstado tono={p.estado === 'RECHAZADA' ? 'error' : 'aviso'} texto={p.estado === 'RECHAZADA' ? 'Rechazado' : 'Sin respuesta'} />
                            </Stack>
                          ),
                        )}
                      </Stack>
                    </CardContent>
                  </Card>

                  <Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap', gap: 1 }}>
                    {o.estado === 'EN_REPARACION' && <Button variant="outlined" disabled={acc.ocupado} onClick={async () => { await acc.ejecutar(() => api.post(`/ordenes/${o.id}/estado`, { estado: 'ESPERANDO_PIEZAS' }), 'El cliente sabrá que esperamos piezas'); await recargar(); }}>Esperando piezas</Button>}
                    {o.estado === 'ESPERANDO_PIEZAS' && <Button variant="contained" disabled={acc.ocupado} onClick={async () => { await acc.ejecutar(() => api.post(`/ordenes/${o.id}/estado`, { estado: 'EN_REPARACION' }), 'Reparación reanudada'); await recargar(); }}>Reanudar reparación</Button>}
                    {(o.estado === 'EN_REPARACION' || o.estado === 'ESPERANDO_PIEZAS') && (
                      <Tooltip title={o.motivoNoCompletable ?? ''}>
                        <span><Button variant="contained" color="success" disabled={Boolean(o.motivoNoCompletable)} onClick={() => { setKmSalida(''); completar.abrir(true); }}>Marcar completada</Button></span>
                      </Tooltip>
                    )}
                    {gestion && (o.estado === 'COMPLETADA' || o.estado === 'RECHAZADA') && <Button variant="contained" onClick={() => { setKmSalida(o.kmSalida !== null ? String(o.kmSalida) : ''); entregar.abrir(true); }}>Entregar vehículo</Button>}
                    {o.estado !== 'ENTREGADA' && <Button onClick={() => obs.abrir(true)}>Añadir observación</Button>}
                    {gestion && o.estado !== 'ENTREGADA' && puestos.datos && (
                      <TextField
                        select
                        size="small"
                        label="Puesto"
                        value={o.puesto?.id ?? ''}
                        sx={{ minWidth: 180, width: 'auto' }}
                        onChange={async (e) => { await acc.ejecutar(() => api.post(`/ordenes/${o.id}/puesto`, { puestoId: e.target.value }), 'Vehículo movido'); await recargar(); }}
                      >
                        {puestos.datos.datos.filter((p) => p.activo).map((p) => (
                          <MenuItem key={p.id} value={p.id} disabled={Boolean(p.ocupadoPor && p.ocupadoPor.ordenId !== o.id)}>{p.nombre}{p.ocupadoPor && p.ocupadoPor.ordenId !== o.id ? ` (ocupado: ${p.ocupadoPor.matricula})` : ''}</MenuItem>
                        ))}
                      </TextField>
                    )}
                  </Stack>
                  {o.motivoNoCompletable && editable && <Typography variant="body2" color="text.secondary">Para completar: {o.motivoNoCompletable.toLowerCase()}.</Typography>}
                  {o.factura && <Alert severity="success" action={<Button color="inherit" href={`/api/ordenes/${o.id}/factura.pdf`} target="_blank">PDF</Button>}>Factura: {euros(o.factura.total)} IVA incluido</Alert>}

                  {o.observaciones.length > 0 && (
                    <Card>
                      <CardContent>
                        <Typography variant="h6" sx={{ mb: 1 }}>Observaciones</Typography>
                        {o.observaciones.map((x) => (
                          <Stack key={x.id} direction="row" spacing={1} sx={{ mb: 1, alignItems: 'baseline' }}>
                            {x.interna && <ChipEstado tono="neutro" texto="Interna" />}
                            <Typography variant="body2">{x.texto} <Typography component="span" variant="caption" color="text.secondary">· {x.autor}, {fechaHora(x.fecha)}</Typography></Typography>
                          </Stack>
                        ))}
                      </CardContent>
                    </Card>
                  )}
                </Stack>
              </Grid>
              <Grid size={{ xs: 12, md: 5 }}>
                <Card><CardContent><Typography variant="h6" sx={{ mb: 2 }}>Línea de tiempo</Typography><LineaTiempo eventos={o.eventos} /></CardContent></Card>
              </Grid>
            </Grid>

            {config.datos && <NuevaSolicitud ordenId={o.id} tarifa={config.datos.tarifaHoraCentimos} abierto={solicitud.abierto} onCerrar={solicitud.cerrar} onHecho={recargar} />}
            <Confirmar
              abierto={obs.abierto}
              titulo="Añadir observación"
              textoConfirmar="Añadir"
              ocupado={acc.ocupado}
              error={acc.error}
              deshabilitado={!texto.trim()}
              onCerrar={obs.cerrar}
              onConfirmar={async () => {
                const ok = await acc.ejecutar(() => api.post(`/ordenes/${o.id}/observaciones`, { texto, interna }), 'Observación añadida');
                if (ok) { obs.cerrar(); setTexto(''); setInterna(false); await recargar(); }
              }}
            >
              <TextField label="Observación" multiline minRows={3} value={texto} onChange={(e) => setTexto(e.target.value)} />
              <FormControlLabel control={<Switch checked={interna} onChange={(e) => setInterna(e.target.checked)} />} label={interna ? 'Interna: solo la ve el taller' : 'Visible para el cliente en su línea de tiempo'} />
            </Confirmar>
            <Confirmar
              abierto={completar.abierto}
              titulo="¿Marcar la orden como completada?"
              textoConfirmar="Marcar completada"
              ocupado={acc.ocupado}
              error={acc.error}
              deshabilitado={!kmValidos(kmSalida, o.kmEntrada)}
              onCerrar={completar.cerrar}
              onConfirmar={async () => {
                const ok = await acc.ejecutar(() => api.post(`/ordenes/${o.id}/completar`, { kmSalida: Number(kmSalida) }), 'Orden completada. El cliente recibe la factura');
                if (ok) { completar.cerrar(); await recargar(); }
              }}
            >
              <Typography variant="body2" color="text.secondary">Se generará el PDF de resumen y se avisará al cliente para que recoja el vehículo.</Typography>
              <ResumenOrden o={o} />
              <CampoKmSalida valor={kmSalida} onCambio={setKmSalida} kmEntrada={o.kmEntrada} />
              <Alert severity="warning">Después ya no podrás registrar trabajo ni piezas en esta orden.</Alert>
            </Confirmar>
            <Confirmar
              abierto={entregar.abierto}
              titulo="Entregar vehículo"
              textoConfirmar="Entregar"
              ocupado={acc.ocupado}
              error={acc.error}
              deshabilitado={!kmValidos(kmSalida, o.kmEntrada)}
              onCerrar={entregar.cerrar}
              onConfirmar={async () => {
                const ok = await acc.ejecutar(() => api.post(`/ordenes/${o.id}/entregar`, { kmSalida: Number(kmSalida) }), 'Vehículo entregado. El puesto queda libre');
                if (ok) { entregar.cerrar(); await recargar(); }
              }}
            >
              <Typography variant="body2" color="text.secondary">{o.codigo} · {o.vehiculo.marca} {o.vehiculo.modelo} {o.vehiculo.matricula} · {o.cliente.nombre}</Typography>
              <ResumenOrden o={o} entrega />
              <CampoKmSalida valor={kmSalida} onCambio={setKmSalida} kmEntrada={o.kmEntrada} ayuda={o.kmSalida !== null ? 'Los puso el mecánico al completar; corrígelos si no coinciden' : undefined} />
              {o.factura && <Button variant="outlined" href={`/api/ordenes/${o.id}/factura.pdf`} target="_blank" sx={{ alignSelf: 'center' }}>Ver PDF de resumen</Button>}
              <Typography variant="body2" color="text.secondary">Al entregar, {o.puesto ? `el ${o.puesto.nombre.toLowerCase()}` : 'el puesto'} queda libre y la orden pasa a «Entregada».</Typography>
            </Confirmar>
          </>
        );
      }}
    </Carga>
  );
}
