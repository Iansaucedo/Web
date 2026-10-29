'use client';
import { useState } from 'react';
import Alert from '@mui/material/Alert';
import FormControlLabel from '@mui/material/FormControlLabel';
import Switch from '@mui/material/Switch';
import Button from '@mui/material/Button';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import Grid from '@mui/material/Grid2';
import IconButton from '@mui/material/IconButton';
import MenuItem from '@mui/material/MenuItem';
import Stack from '@mui/material/Stack';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import DeleteIcon from '@mui/icons-material/DeleteOutline';
import { Cabecera, Carga, Confirmar, useDialogo } from '../../../../components/Comunes';
import { ChipEstado } from '../../../../components/ChipEstado';
import { useSesion } from '../../../../components/Sesion';
import { api } from '../../../../lib/api';
import { useAccion, useDatos } from '../../../../lib/hooks';
import { dia, diaLargo, hoy, sumarDias } from '../../../../lib/formato';
import type { DiaDisponible, Lista, Mecanico, Puesto, TipoAusencia } from '../../../../lib/tipos';

interface Asignacion { puestoId: string; puesto: string; empleadoId: string; mecanico: string }
interface Ausencia { id: string; empleadoId: string; mecanico: string; fecha: string; tipo: TipoAusencia; nota: string | null }

const TIPOS: Record<TipoAusencia, { texto: string; tono: 'info' | 'aviso' | 'error' | 'neutro' }> = {
  VACACIONES: { texto: 'Vacaciones', tono: 'info' },
  BAJA_MEDICA: { texto: 'Baja médica', tono: 'error' },
  PERSONAL: { texto: 'Asuntos propios', tono: 'aviso' },
  OTRA: { texto: 'Ausencia', tono: 'neutro' },
};
interface Invitacion { id: string; email: string; rol: string; creadaPor: string; usadaEn: string | null }

export default function Personal() {
  const { usuario } = useSesion();
  const [fecha, setFecha] = useState(hoy());
  const [verBajas, setVerBajas] = useState(false);
  const mecanicos = useDatos<Lista<Mecanico>>(`/mecanicos${verBajas ? '?incluirBajas=true' : ''}`);
  const bajaEmpleado = useDialogo<Mecanico>();
  const [motivoBaja, setMotivoBaja] = useState('');
  const [hastaAus, setHastaAus] = useState('');
  const [tipoAus, setTipoAus] = useState<TipoAusencia>('VACACIONES');
  const [notaAus, setNotaAus] = useState('');
  const puestos = useDatos<Lista<Puesto>>('/puestos');
  const asignaciones = useDatos<Lista<Asignacion>>(`/asignaciones?fecha=${fecha}`);
  const ausencias = useDatos<Lista<Ausencia>>(`/ausencias?desde=${hoy()}&hasta=${sumarDias(hoy(), 30)}`);
  const disp = useDatos<{ dias: DiaDisponible[] }>(`/disponibilidad?desde=${fecha}&hasta=${fecha}`);
  const invitaciones = useDatos<Lista<Invitacion>>('/invitaciones');
  const ausencia = useDialogo<Mecanico>();
  const invitar = useDialogo();
  const nuevoPuesto = useDialogo();
  const [fAus, setFAus] = useState(hoy());
  const [email, setEmail] = useState('');
  const [rol, setRol] = useState('MECANICO');
  const [nombrePuesto, setNombrePuesto] = useState('');
  const acc = useAccion();
  const recargarTodo = () => { void mecanicos.recargar(); void asignaciones.recargar(); void ausencias.recargar(); void disp.recargar(); void puestos.recargar(); };
  const ausentesDia = new Set(ausencias.datos?.datos.filter((a) => a.fecha === fecha).map((a) => a.empleadoId));
  const d = disp.datos?.dias[0];

  return (
    <>
      <Cabecera titulo="Personal y puestos" acciones={<><Button variant="tonal" onClick={() => nuevoPuesto.abrir(true)}>Nuevo puesto</Button><Button variant="contained" onClick={() => invitar.abrir(true)}>Dar de alta</Button></>} />
      {acc.error && !ausencia.abierto && !invitar.abierto && !nuevoPuesto.abierto && <Alert severity="error" sx={{ mb: 2 }} onClose={acc.limpiarError}>{acc.error}</Alert>}
      <Grid container spacing={3}>
        <Grid size={{ xs: 12, lg: 6 }}>
          <Card>
            <CardContent>
              <Stack direction="row" sx={{ justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
                <Typography variant="h6">Mecánicos</Typography>
                <FormControlLabel control={<Switch checked={verBajas} onChange={(e) => setVerBajas(e.target.checked)} />} label="Ver bajas" />
              </Stack>
              <Carga {...mecanicos}>
                {(m) => (
                  <Table size="small">
                    <TableBody>
                      {m.datos.map((x) => (
                        <TableRow key={x.empleadoId}>
                          <TableCell><Typography sx={{ fontWeight: 500 }}>{x.nombre}</Typography><Typography variant="caption" color="text.secondary">{x.email}</Typography></TableCell>
                          <TableCell>{!x.activo ? <ChipEstado tono="neutro" texto="De baja" /> : x.ausenteHoy ? <ChipEstado tono="error" texto="Ausente hoy" /> : x.puestosHoy.length ? x.puestosHoy.join(', ') : <ChipEstado tono="aviso" texto="Sin puesto hoy" />}</TableCell>
                          <TableCell align="right">
                            {x.activo ? (
                              <Stack direction="row" spacing={0.5} sx={{ justifyContent: 'flex-end' }}>
                                <Button size="small" onClick={() => { setFAus(hoy()); setHastaAus(''); setTipoAus('VACACIONES'); setNotaAus(''); ausencia.abrir(x); }}>Ausencia</Button>
                                <Button size="small" color="error" onClick={() => { setMotivoBaja(''); bajaEmpleado.abrir(x); }}>Dar de baja</Button>
                              </Stack>
                            ) : (
                              <Button size="small" onClick={async () => { await acc.ejecutar(() => api.post(`/empleados/${x.empleadoId}/reactivar`), `${x.nombre} reactivado`); recargarTodo(); }}>Reactivar</Button>
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                      {!m.datos.length && <TableRow><TableCell>No hay mecánicos. Dales de alta con su email de Google.</TableCell></TableRow>}
                    </TableBody>
                  </Table>
                )}
              </Carga>
              {Boolean(ausencias.datos?.datos.length) && (
                <>
                  <Typography variant="subtitle2" sx={{ mt: 2 }}>Próximas ausencias</Typography>
                  {ausencias.datos!.datos.map((a) => (
                    <Stack key={a.id} direction="row" sx={{ alignItems: 'center', justifyContent: 'space-between' }}>
                      <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}><Typography variant="body2">{a.mecanico} · {dia(a.fecha)}</Typography><ChipEstado {...TIPOS[a.tipo]} /></Stack>
                      <IconButton aria-label={`Quitar ausencia de ${a.mecanico}`} size="small" onClick={async () => { await acc.ejecutar(() => api.delete(`/ausencias/${a.id}`), 'Ausencia quitada'); recargarTodo(); }}><DeleteIcon fontSize="small" /></IconButton>
                    </Stack>
                  ))}
                </>
              )}
            </CardContent>
          </Card>
        </Grid>
        <Grid size={{ xs: 12, lg: 6 }}>
          <Card>
            <CardContent>
              <Stack direction="row" sx={{ justifyContent: 'space-between', alignItems: 'center', mb: 1, gap: 1, flexWrap: 'wrap' }}>
                <Typography variant="h6">Puestos el {diaLargo(fecha)}</Typography>
                <TextField type="date" size="small" value={fecha} onChange={(e) => e.target.value && setFecha(e.target.value)} sx={{ width: 170 }} inputProps={{ min: hoy(), 'aria-label': 'Día de las asignaciones' }} />
              </Stack>
              {d && <Typography variant="body2" color={d.ocupadas > d.capacidad ? 'error' : 'text.secondary'} sx={{ mb: 2 }}>Capacidad: {d.capacidad} vehículos · {d.ocupadas} citas</Typography>}
              <Carga {...puestos}>
                {(p) => (
                  <Stack spacing={1.5}>
                    {p.datos.map((x) => {
                      const asig = asignaciones.datos?.datos.find((a) => a.puestoId === x.id);
                      return (
                        <Stack key={x.id} direction="row" spacing={1} sx={{ alignItems: 'center' }}>
                          <Typography sx={{ width: 110, fontWeight: 500 }}>{x.nombre}</Typography>
                          {x.activo ? (
                            <TextField
                              select
                              size="small"
                              label="Mecánico"
                              value={asig?.empleadoId ?? ''}
                              onChange={async (e) => { await acc.ejecutar(() => api.put('/asignaciones', { fecha, puestoId: x.id, empleadoId: e.target.value || null }), 'Asignación guardada'); recargarTodo(); }}
                            >
                              <MenuItem value="">Sin mecánico</MenuItem>
                              {mecanicos.datos?.datos.map((m) => <MenuItem key={m.empleadoId} value={m.empleadoId} disabled={ausentesDia.has(m.empleadoId)}>{m.nombre}{ausentesDia.has(m.empleadoId) ? ' (ausente)' : ''}</MenuItem>)}
                            </TextField>
                          ) : (
                            <ChipEstado tono="neutro" texto="Desactivado" />
                          )}
                          <Button size="small" onClick={async () => { await acc.ejecutar(() => api.patch(`/puestos/${x.id}`, { activo: !x.activo }), x.activo ? 'Puesto desactivado' : 'Puesto activado'); recargarTodo(); }}>{x.activo ? 'Desactivar' : 'Activar'}</Button>
                        </Stack>
                      );
                    })}
                  </Stack>
                )}
              </Carga>
            </CardContent>
          </Card>
        </Grid>
        <Grid size={12}>
          <Card>
            <CardContent>
              <Typography variant="h6" sx={{ mb: 1 }}>Altas pendientes</Typography>
              <Carga {...invitaciones}>
                {(i) => (
                  <Table size="small">
                    <TableHead><TableRow><TableCell>Email</TableCell><TableCell>Rol</TableCell><TableCell>Estado</TableCell><TableCell /></TableRow></TableHead>
                    <TableBody>
                      {i.datos.map((x) => (
                        <TableRow key={x.id}>
                          <TableCell>{x.email}</TableCell>
                          <TableCell>{x.rol === 'JEFE' ? 'Jefe de taller' : 'Mecánico'}</TableCell>
                          <TableCell>{x.usadaEn ? <ChipEstado tono="exito" texto="Ya ha entrado" /> : <ChipEstado tono="aviso" texto="Pendiente" />}</TableCell>
                          <TableCell align="right">{!x.usadaEn && <Button size="small" color="error" onClick={async () => { await acc.ejecutar(() => api.delete(`/invitaciones/${x.id}`), 'Alta anulada'); void invitaciones.recargar(); }}>Anular</Button>}</TableCell>
                        </TableRow>
                      ))}
                      {!i.datos.length && <TableRow><TableCell colSpan={4}>No hay altas.</TableCell></TableRow>}
                    </TableBody>
                  </Table>
                )}
              </Carga>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      <Confirmar abierto={ausencia.abierto} titulo={`Ausencia de ${ausencia.valor?.nombre ?? ''}`} textoConfirmar="Guardar ausencia" ocupado={acc.ocupado} error={acc.error} onCerrar={() => { ausencia.cerrar(); acc.limpiarError(); }}
        onConfirmar={async () => {
          const ok = await acc.ejecutar(() => api.post('/ausencias', { empleadoId: ausencia.valor!.empleadoId, desde: fAus, ...(hastaAus ? { hasta: hastaAus } : {}), tipo: tipoAus, ...(notaAus.trim() ? { nota: notaAus } : {}) }), 'Ausencia guardada. La capacidad baja esos días');
          if (ok) { ausencia.cerrar(); recargarTodo(); }
        }}>
        <TextField select label="Tipo" value={tipoAus} onChange={(e) => setTipoAus(e.target.value as TipoAusencia)}>
          {Object.entries(TIPOS).map(([k, v]) => <MenuItem key={k} value={k}>{v.texto}</MenuItem>)}
        </TextField>
        <Stack direction="row" spacing={2}>
          <TextField type="date" label="Desde" value={fAus} onChange={(e) => setFAus(e.target.value)} inputProps={{ min: hoy() }} InputLabelProps={{ shrink: true }} />
          <TextField type="date" label="Hasta (incluido)" value={hastaAus} onChange={(e) => setHastaAus(e.target.value)} inputProps={{ min: fAus }} InputLabelProps={{ shrink: true }} helperText="Vacío: un solo día" />
        </Stack>
        <TextField label="Nota (opcional)" value={notaAus} onChange={(e) => setNotaAus(e.target.value)} inputProps={{ maxLength: 200 }} />
        <Alert severity="info">Se quitarán sus puestos esos días y bajará la capacidad. Si sobran citas, te avisaremos.</Alert>
      </Confirmar>
      <Confirmar abierto={bajaEmpleado.abierto} titulo={`Dar de baja a ${bajaEmpleado.valor?.nombre ?? ''}`} textoConfirmar="Dar de baja" peligro ocupado={acc.ocupado} error={acc.error} deshabilitado={!motivoBaja.trim()} onCerrar={() => { bajaEmpleado.cerrar(); acc.limpiarError(); }}
        onConfirmar={async () => {
          const ok = await acc.ejecutar(() => api.post(`/empleados/${bajaEmpleado.valor!.empleadoId}/baja`, { motivo: motivoBaja }), 'Empleado dado de baja');
          if (ok) { bajaEmpleado.cerrar(); recargarTodo(); }
        }}>
        <Typography>Perderá el acceso al momento y dejará de contar para la capacidad. Su historial se conserva y queda constancia. Podrás reactivarlo.</Typography>
        <TextField label="Motivo (obligatorio)" value={motivoBaja} onChange={(e) => setMotivoBaja(e.target.value)} />
      </Confirmar>
      <Confirmar abierto={invitar.abierto} titulo="Dar de alta a un empleado" textoConfirmar="Enviar invitación" ocupado={acc.ocupado} error={acc.error} deshabilitado={!email.includes('@')} onCerrar={() => { invitar.cerrar(); acc.limpiarError(); }}
        onConfirmar={async () => {
          const ok = await acc.ejecutar((clave) => api.post('/invitaciones', { email, rol }, { claveIdempotencia: clave }), 'Invitación enviada');
          if (ok) { invitar.cerrar(); setEmail(''); void invitaciones.recargar(); }
        }}>
        <TextField label="Email de Google" type="email" value={email} onChange={(e) => setEmail(e.target.value)} helperText="Entrará con esta cuenta de Google y tendrá el rol directamente" />
        <TextField select label="Rol" value={rol} onChange={(e) => setRol(e.target.value)}>
          <MenuItem value="MECANICO">Mecánico</MenuItem>
          {usuario.rol === 'DUENO' && <MenuItem value="JEFE">Jefe de taller</MenuItem>}
        </TextField>
      </Confirmar>
      <Confirmar abierto={nuevoPuesto.abierto} titulo="Nuevo puesto" textoConfirmar="Crear" ocupado={acc.ocupado} error={acc.error} deshabilitado={!nombrePuesto.trim()} onCerrar={() => { nuevoPuesto.cerrar(); acc.limpiarError(); }}
        onConfirmar={async () => {
          const ok = await acc.ejecutar(() => api.post('/puestos', { nombre: nombrePuesto }), 'Puesto creado');
          if (ok) { nuevoPuesto.cerrar(); setNombrePuesto(''); recargarTodo(); }
        }}>
        <TextField label="Nombre" value={nombrePuesto} onChange={(e) => setNombrePuesto(e.target.value)} helperText="Por ejemplo: Elevador 4" />
      </Confirmar>
    </>
  );
}
