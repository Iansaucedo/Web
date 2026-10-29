'use client';
import { useState } from 'react';
import Button from '@mui/material/Button';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import MenuItem from '@mui/material/MenuItem';
import Stack from '@mui/material/Stack';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import TableContainer from '@mui/material/TableContainer';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { Cabecera, Carga, Confirmar } from '../../../../components/Comunes';
import { ChipEstado } from '../../../../components/ChipEstado';
import { TarjetaFichaje } from '../../../../components/Fichar';
import { api } from '../../../../lib/api';
import { useAccion, useDatos } from '../../../../lib/hooks';
import { dia, FICHAJE, hoy, horasMin, sumarDias } from '../../../../lib/formato';
import type { Correccion, Jornada, Lista } from '../../../../lib/tipos';

export default function MiJornada() {
  const hasta = hoy();
  const desde = sumarDias(hasta, -13);
  const jornadas = useDatos<Lista<Jornada>>(`/jornadas?desde=${desde}&hasta=${hasta}`);
  const correcciones = useDatos<Lista<Correccion>>('/correcciones');
  const [abierto, setAbierto] = useState(false);
  const [f, setF] = useState({ fecha: hasta, tipo: 'SALIDA', hora: '', motivo: '' });
  const { ejecutar, ocupado, error, limpiarError } = useAccion();

  const pedir = async () => {
    const ok = await ejecutar((clave) => api.post('/correcciones', f, { claveIdempotencia: clave }), 'Solicitud enviada al jefe de taller');
    if (ok) {
      setAbierto(false);
      void correcciones.recargar();
    }
  };

  return (
    <>
      <Cabecera titulo="Mi jornada" acciones={<Button variant="tonal" onClick={() => setAbierto(true)}>Solicitar corrección</Button>} />
      <Stack spacing={3}>
        <TarjetaFichaje />
        <Card>
          <CardContent>
            <Typography variant="h6" sx={{ mb: 1 }}>Últimas dos semanas</Typography>
            <Carga {...jornadas}>
              {(d) => (
                <TableContainer>
                  <Table size="small">
                    <TableHead>
                      <TableRow><TableCell>Día</TableCell><TableCell>Entrada</TableCell><TableCell>Salida</TableCell><TableCell>Pausas</TableCell><TableCell>Trabajado</TableCell><TableCell /></TableRow>
                    </TableHead>
                    <TableBody>
                      {d.datos.map((j) => (
                        <TableRow key={j.fecha}>
                          <TableCell>{dia(j.fecha)}</TableCell>
                          <TableCell>{j.entrada ?? '—'}</TableCell>
                          <TableCell>{j.salida ?? '—'}</TableCell>
                          <TableCell>{j.minutosPausa} min</TableCell>
                          <TableCell>{horasMin(j.minutosTrabajados)}</TableCell>
                          <TableCell>{!j.completa ? <ChipEstado tono="aviso" texto="Incompleta" /> : j.corregida ? <ChipEstado tono="info" texto="Corregida" /> : null}</TableCell>
                        </TableRow>
                      ))}
                      {!d.datos.length && <TableRow><TableCell colSpan={6}>Sin fichajes en estos días.</TableCell></TableRow>}
                    </TableBody>
                  </Table>
                </TableContainer>
              )}
            </Carga>
          </CardContent>
        </Card>
        <Card>
          <CardContent>
            <Typography variant="h6" sx={{ mb: 1 }}>Mis solicitudes de corrección</Typography>
            <Carga {...correcciones}>
              {(d) => (
                <Stack spacing={1}>
                  {d.datos.map((c) => (
                    <Stack key={c.id} direction="row" sx={{ justifyContent: 'space-between', alignItems: 'center' }}>
                      <Typography variant="body2">{dia(c.fecha)} · {FICHAJE[c.tipo]} a las {c.hora} · {c.motivo}</Typography>
                      <ChipEstado tono={c.estado === 'ACEPTADA' ? 'exito' : c.estado === 'RECHAZADA' ? 'error' : 'aviso'} texto={c.estado === 'PENDIENTE' ? 'Pendiente' : c.estado === 'ACEPTADA' ? 'Aceptada' : 'Rechazada'} />
                    </Stack>
                  ))}
                  {!d.datos.length && <Typography color="text.secondary" variant="body2">No has pedido ninguna corrección.</Typography>}
                </Stack>
              )}
            </Carga>
          </CardContent>
        </Card>
      </Stack>
      <Confirmar abierto={abierto} titulo="Solicitar corrección" textoConfirmar="Enviar" ocupado={ocupado} error={error} onCerrar={() => { setAbierto(false); limpiarError(); }} onConfirmar={pedir} deshabilitado={!f.hora || !f.motivo.trim()}>
        <Typography variant="body2" color="text.secondary">Si olvidaste fichar o fichaste mal. El jefe de taller la revisará; el fichaje original no se borra.</Typography>
        <TextField label="Día" type="date" value={f.fecha} onChange={(e) => setF({ ...f, fecha: e.target.value })} inputProps={{ max: hasta }} InputLabelProps={{ shrink: true }} />
        <TextField select label="Fichaje" value={f.tipo} onChange={(e) => setF({ ...f, tipo: e.target.value })}>
          {Object.entries(FICHAJE).map(([v, t]) => <MenuItem key={v} value={v}>{t}</MenuItem>)}
        </TextField>
        <TextField label="Hora correcta" type="time" value={f.hora} onChange={(e) => setF({ ...f, hora: e.target.value })} InputLabelProps={{ shrink: true }} />
        <TextField label="Motivo" value={f.motivo} onChange={(e) => setF({ ...f, motivo: e.target.value })} inputProps={{ maxLength: 200 }} />
      </Confirmar>
    </>
  );
}
