'use client';
import { use, useState } from 'react';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import Divider from '@mui/material/Divider';
import Grid from '@mui/material/Grid2';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import ToggleButton from '@mui/material/ToggleButton';
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup';
import Typography from '@mui/material/Typography';
import PdfIcon from '@mui/icons-material/PictureAsPdfOutlined';
import { Cabecera, Carga, Confirmar, MiniaturasFotos } from '../../../../components/Comunes';
import { ChipEstado } from '../../../../components/ChipEstado';
import { LineaTiempo } from '../../../../components/LineaTiempo';
import { api } from '../../../../lib/api';
import { useAccion, useDatos } from '../../../../lib/hooks';
import { ESTADO_ORDEN, euros, fechaHora } from '../../../../lib/formato';
import type { OrdenDetalle, Solicitud } from '../../../../lib/tipos';

type Decision = 'ACEPTADA' | 'RECHAZADA';

function Responder({ solicitud, iva, onHecho }: { solicitud: Solicitud; iva: number; onHecho: () => void }) {
  const [decisiones, setDecisiones] = useState<Record<string, Decision>>({});
  const [comentario, setComentario] = useState('');
  const [confirmando, setConfirmando] = useState(false);
  const { ejecutar, ocupado, error } = useAccion();
  const todas = solicitud.partidas.every((p) => decisiones[p.id]);
  const aceptadas = solicitud.partidas.filter((p) => decisiones[p.id] === 'ACEPTADA');
  const base = aceptadas.reduce((s, p) => s + p.importeEstimadoCentimos, 0);
  const total = base + Math.round((base * iva) / 100);

  const enviar = async () => {
    const r = await ejecutar(() => api.post(`/solicitudes/${solicitud.id}/responder`, { decisiones, ...(comentario.trim() ? { comentario } : {}) }), 'Respuesta enviada al taller');
    setConfirmando(false);
    if (r) onHecho();
  };

  return (
    <Card sx={{ borderColor: 'warning.main', borderWidth: 2 }} data-testid="responder">
      <CardContent>
        <Typography variant="h6">El taller necesita tu aprobación</Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          Acepta o rechaza cada trabajo. No haremos nada que no apruebes. Importes sin IVA, orientativos.
        </Typography>
        <Stack divider={<Divider />} spacing={2}>
          {solicitud.partidas.map((p) => (
            <Stack key={p.id} direction={{ xs: 'column', sm: 'row' }} spacing={2} sx={{ alignItems: { sm: 'center' } }}>
              <Box sx={{ flex: 1 }}>
                <Typography sx={{ fontWeight: 500 }}>{p.descripcion}</Typography>
                <Typography variant="body2" color="text.secondary">{euros(p.importeEstimadoCentimos)} · {p.horasEstimadas} h estimadas</Typography>
                <MiniaturasFotos fotos={p.fotos} trabajo={p.descripcion} />
              </Box>
              <ToggleButtonGroup exclusive size="small" value={decisiones[p.id] ?? null} onChange={(_, v: Decision | null) => v && setDecisiones((d) => ({ ...d, [p.id]: v }))} aria-label={`Decisión para ${p.descripcion}`}>
                <ToggleButton value="ACEPTADA" color="success">Aceptar</ToggleButton>
                <ToggleButton value="RECHAZADA" color="error">Rechazar</ToggleButton>
              </ToggleButtonGroup>
            </Stack>
          ))}
        </Stack>
        <TextField sx={{ mt: 3 }} label="Comentario para el taller (opcional)" value={comentario} onChange={(e) => setComentario(e.target.value)} inputProps={{ maxLength: 1000 }} />
        <Stack direction="row" sx={{ mt: 2, alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 2 }}>
          <Typography variant="body2" color="text.secondary">
            {todas ? `Aceptas ${aceptadas.length} de ${solicitud.partidas.length} · ${euros(total)} con IVA` : `Falta decidir ${solicitud.partidas.length - Object.keys(decisiones).length} trabajo(s)`}
          </Typography>
          <Button variant="contained" disabled={!todas} onClick={() => setConfirmando(true)}>Enviar respuesta</Button>
        </Stack>
      </CardContent>
      <Confirmar abierto={confirmando} titulo="¿Enviar tu respuesta?" textoConfirmar="Enviar" ocupado={ocupado} error={error} onCerrar={() => setConfirmando(false)} onConfirmar={enviar}>
        <Typography>Solo se puede responder una vez.</Typography>
        <Stack component="ul" sx={{ pl: 2, m: 0 }}>
          {solicitud.partidas.map((p) => (
            <li key={p.id}>
              <Typography variant="body2">{decisiones[p.id] === 'ACEPTADA' ? '✓ Aceptas' : '✕ Rechazas'}: {p.descripcion}</Typography>
            </li>
          ))}
        </Stack>
        {aceptadas.length === 0 && <Alert severity="warning">No aceptas ningún trabajo. Si es el primer presupuesto, la orden se cerrará y podrás recoger el vehículo.</Alert>}
      </Confirmar>
    </Card>
  );
}

export default function DetalleOrden({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const orden = useDatos<OrdenDetalle>(`/ordenes/${id}`);
  const config = useDatos<{ ivaPorcentaje: number }>('/config');
  return (
    <Carga {...orden}>
      {(o) => {
        const pendiente = o.solicitudes.find((s) => s.estado === 'PENDIENTE');
        const trabajos = o.solicitudes.flatMap((s) => s.partidas);
        return (
          <>
            <Cabecera
              titulo={`${o.vehiculo.marca} ${o.vehiculo.modelo}`}
              subtitulo={`${o.codigo} · ${o.vehiculo.matricula} · entrada ${fechaHora(o.abiertaEn)} · ${o.kmEntrada.toLocaleString('es-ES')} km${o.kmSalida !== null ? ` → ${o.kmSalida.toLocaleString('es-ES')} km` : ''}`}
              acciones={<ChipEstado {...ESTADO_ORDEN[o.estado]} />}
            />
            <Grid container spacing={3}>
              <Grid size={{ xs: 12, md: 7 }}>
                <Stack spacing={3}>
                  {pendiente && config.datos && <Responder solicitud={pendiente} iva={config.datos.ivaPorcentaje} onHecho={orden.recargar} />}
                  {o.entregaEstimada && o.estado !== 'ENTREGADA' && <Alert severity="info">Entrega prevista: {fechaHora(o.entregaEstimada)}</Alert>}
                  {o.factura && (
                    <Card>
                      <CardContent>
                        <Stack direction="row" sx={{ justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
                          <Typography variant="h6">Factura</Typography>
                          <Button startIcon={<PdfIcon />} href={`/api/ordenes/${o.id}/factura.pdf`} target="_blank">Descargar PDF</Button>
                        </Stack>
                        {o.factura.lineas.map((l, i) => (
                          <Stack key={i} direction="row" sx={{ justifyContent: 'space-between', py: 0.5 }}>
                            <Typography variant="body2">{l.concepto}</Typography>
                            <Typography variant="body2">{euros(l.importeCentimos)}</Typography>
                          </Stack>
                        ))}
                        <Divider sx={{ my: 1 }} />
                        <Stack direction="row" sx={{ justifyContent: 'space-between' }}><Typography variant="body2">Base</Typography><Typography variant="body2">{euros(o.factura.base)}</Typography></Stack>
                        <Stack direction="row" sx={{ justifyContent: 'space-between' }}><Typography variant="body2">IVA</Typography><Typography variant="body2">{euros(o.factura.iva)}</Typography></Stack>
                        <Stack direction="row" sx={{ justifyContent: 'space-between', mt: 0.5 }}><Typography variant="h6">Total</Typography><Typography variant="h6" data-testid="total-factura">{euros(o.factura.total)}</Typography></Stack>
                      </CardContent>
                    </Card>
                  )}
                  <Card>
                    <CardContent>
                      <Typography variant="h6" sx={{ mb: 1 }}>Trabajos</Typography>
                      {!trabajos.length && <Typography color="text.secondary">El mecánico está haciendo el diagnóstico. Te enviaremos el presupuesto antes de hacer nada.</Typography>}
                      <Stack divider={<Divider />} spacing={1.5}>
                        {trabajos.map((p) => (
                          <Stack key={p.id} direction="row" sx={{ justifyContent: 'space-between', gap: 2 }}>
                            <div>
                              <Typography sx={{ fontWeight: 500 }}>{p.descripcion}</Typography>
                              <Typography variant="body2" color="text.secondary">{euros(p.importeEstimadoCentimos)} + IVA{p.terminadaEn ? ' · terminado' : ''}</Typography>
                            </div>
                            <ChipEstado tono={p.estado === 'ACEPTADA' ? 'exito' : p.estado === 'RECHAZADA' ? 'error' : 'aviso'} texto={p.estado === 'ACEPTADA' ? 'Aceptado' : p.estado === 'RECHAZADA' ? 'Rechazado' : 'Por decidir'} />
                          </Stack>
                        ))}
                      </Stack>
                      {trabajos.length > 0 && !o.factura && (
                        <Typography variant="body2" sx={{ mt: 2 }}>Estimado: <strong>{euros(o.presupuesto.total)}</strong> IVA incluido</Typography>
                      )}
                    </CardContent>
                  </Card>
                  {o.observaciones.length > 0 && (
                    <Card>
                      <CardContent>
                        <Typography variant="h6" sx={{ mb: 1 }}>Notas del taller</Typography>
                        {o.observaciones.map((x) => (
                          <Typography key={x.id} variant="body2" sx={{ mb: 1 }}>{x.texto} <Typography component="span" variant="caption" color="text.secondary">· {x.autor}, {fechaHora(x.fecha)}</Typography></Typography>
                        ))}
                      </CardContent>
                    </Card>
                  )}
                </Stack>
              </Grid>
              <Grid size={{ xs: 12, md: 5 }}>
                <Card>
                  <CardContent>
                    <Typography variant="h6" sx={{ mb: 2 }}>Seguimiento</Typography>
                    <LineaTiempo eventos={o.eventos} />
                  </CardContent>
                </Card>
              </Grid>
            </Grid>
          </>
        );
      }}
    </Carga>
  );
}
