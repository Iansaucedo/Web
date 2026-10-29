'use client';
import { useState } from 'react';
import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import Chip from '@mui/material/Chip';
import Stack from '@mui/material/Stack';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableContainer from '@mui/material/TableContainer';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import DownloadIcon from '@mui/icons-material/Download';
import { Cabecera, Carga, Confirmar, useDialogo } from '../../../../components/Comunes';
import { ChipEstado } from '../../../../components/ChipEstado';
import { api } from '../../../../lib/api';
import { useAccion, useDatos } from '../../../../lib/hooks';
import { dia, FICHAJE, hoy, horasMin, sumarDias } from '../../../../lib/formato';
import type { Correccion, Fichaje, Jornada, Lista } from '../../../../lib/tipos';

export default function Jornadas() {
  const [desde, setDesde] = useState(sumarDias(hoy(), -6));
  const [hasta, setHasta] = useState(hoy());
  const jornadas = useDatos<Lista<Jornada>>(`/jornadas?desde=${desde}&hasta=${hasta}`);
  const pendientes = useDatos<Lista<Correccion>>('/correcciones?estado=PENDIENTE');
  const corregir = useDialogo<{ f: Fichaje; j: Jornada }>();
  const [horaNueva, setHoraNueva] = useState('');
  const [motivo, setMotivo] = useState('');
  const acc = useAccion();
  const recargar = () => { void jornadas.recargar(); void pendientes.recargar(); };

  return (
    <>
      <Cabecera
        titulo="Jornadas del equipo"
        acciones={<Button startIcon={<DownloadIcon />} href={`/api/jornadas.csv?desde=${desde}&hasta=${hasta}`}>Exportar CSV</Button>}
      />
      {acc.error && !corregir.abierto && <Alert severity="error" sx={{ mb: 2 }} onClose={acc.limpiarError}>{acc.error}</Alert>}
      <Carga {...pendientes}>
        {(p) =>
          p.datos.length ? (
            <Card sx={{ mb: 3, borderColor: 'warning.main' }}>
              <CardContent>
                <Typography variant="h6" sx={{ mb: 1 }}>Correcciones por revisar</Typography>
                <Stack spacing={1}>
                  {p.datos.map((c) => (
                    <Stack key={c.id} direction={{ xs: 'column', sm: 'row' }} spacing={1} sx={{ alignItems: { sm: 'center' }, justifyContent: 'space-between' }} data-testid="correccion">
                      <Typography variant="body2"><strong>{c.empleado}</strong> · {dia(c.fecha)} · {FICHAJE[c.tipo]} a las {c.hora} · «{c.motivo}»</Typography>
                      <Stack direction="row" spacing={1}>
                        <Button size="small" variant="contained" disabled={acc.ocupado} onClick={async () => { await acc.ejecutar(() => api.post(`/correcciones/${c.id}/aceptar`), 'Corrección aplicada'); recargar(); }}>Aceptar</Button>
                        <Button size="small" disabled={acc.ocupado} onClick={async () => { await acc.ejecutar(() => api.post(`/correcciones/${c.id}/rechazar`), 'Corrección rechazada'); recargar(); }}>Rechazar</Button>
                      </Stack>
                    </Stack>
                  ))}
                </Stack>
              </CardContent>
            </Card>
          ) : null
        }
      </Carga>
      <Stack direction="row" spacing={2} sx={{ mb: 2 }}>
        <TextField type="date" label="Desde" value={desde} onChange={(e) => e.target.value && setDesde(e.target.value)} InputLabelProps={{ shrink: true }} sx={{ maxWidth: 200 }} />
        <TextField type="date" label="Hasta" value={hasta} onChange={(e) => e.target.value && setHasta(e.target.value)} InputLabelProps={{ shrink: true }} sx={{ maxWidth: 200 }} />
      </Stack>
      <Carga {...jornadas}>
        {(d) => (
          <Card>
            <TableContainer>
              <Table size="small">
                <TableHead><TableRow><TableCell>Empleado</TableCell><TableCell>Día</TableCell><TableCell>Fichajes (pulsa para corregir)</TableCell><TableCell>Pausas</TableCell><TableCell>Trabajado</TableCell><TableCell /></TableRow></TableHead>
                <TableBody>
                  {d.datos.map((j) => (
                    <TableRow key={`${j.empleadoId}${j.fecha}`}>
                      <TableCell>{j.nombre}</TableCell>
                      <TableCell>{dia(j.fecha)}</TableCell>
                      <TableCell>
                        <Stack direction="row" sx={{ gap: 0.5, flexWrap: 'wrap' }}>
                          {j.fichajes.map((f) => (
                            <Chip key={f.id} size="small" variant="outlined" label={`${FICHAJE[f.tipo]} ${f.hora}${f.corregido ? ' ✎' : ''}`} onClick={() => { setHoraNueva(f.hora); setMotivo(''); corregir.abrir({ f, j }); }} />
                          ))}
                        </Stack>
                      </TableCell>
                      <TableCell>{j.minutosPausa} min</TableCell>
                      <TableCell>{horasMin(j.minutosTrabajados)}</TableCell>
                      <TableCell>{!j.completa ? <ChipEstado tono="aviso" texto="Incompleta" /> : j.corregida ? <ChipEstado tono="info" texto="Corregida" /> : null}</TableCell>
                    </TableRow>
                  ))}
                  {!d.datos.length && <TableRow><TableCell colSpan={6}>Nadie ha fichado en estas fechas.</TableCell></TableRow>}
                </TableBody>
              </Table>
            </TableContainer>
          </Card>
        )}
      </Carga>
      <Confirmar
        abierto={corregir.abierto}
        titulo="Corregir fichaje"
        textoConfirmar="Corregir"
        ocupado={acc.ocupado}
        error={acc.error}
        deshabilitado={!horaNueva || !motivo.trim()}
        onCerrar={() => { corregir.cerrar(); acc.limpiarError(); }}
        onConfirmar={async () => {
          const ok = await acc.ejecutar(() => api.post(`/fichajes/${corregir.valor!.f.id}/corregir`, { hora: horaNueva, motivo }), 'Fichaje corregido. Se avisa al empleado');
          if (ok) { corregir.cerrar(); recargar(); }
        }}
      >
        {corregir.valor && <Typography>{corregir.valor.j.nombre} · {dia(corregir.valor.j.fecha)} · {FICHAJE[corregir.valor.f.tipo]} a las {corregir.valor.f.hora}</Typography>}
        <TextField type="time" label="Hora correcta" value={horaNueva} onChange={(e) => setHoraNueva(e.target.value)} InputLabelProps={{ shrink: true }} />
        <TextField label="Motivo (obligatorio)" value={motivo} onChange={(e) => setMotivo(e.target.value)} />
        <Alert severity="info">El fichaje original no se borra: queda en el historial con quién lo corrigió y por qué.</Alert>
      </Confirmar>
    </>
  );
}
