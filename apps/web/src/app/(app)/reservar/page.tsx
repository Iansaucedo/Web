'use client';
import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import Chip from '@mui/material/Chip';
import MenuItem from '@mui/material/MenuItem';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { Cabecera, Carga, Confirmar, Vacio } from '../../../components/Comunes';
import { api } from '../../../lib/api';
import { useAccion, useDatos } from '../../../lib/hooks';
import { dia, diaLargo, hoy, sumarDias } from '../../../lib/formato';
import type { Cita, DiaDisponible, Lista, Vehiculo } from '../../../lib/tipos';

const DIAS = 21;

export default function Reservar() {
  const router = useRouter();
  const vehiculos = useDatos<Lista<Vehiculo>>('/vehiculos');
  const desde = hoy();
  const disp = useDatos<{ dias: DiaDisponible[] }>(`/disponibilidad?desde=${desde}&hasta=${sumarDias(desde, DIAS - 1)}`);
  const [vehiculoId, setVehiculoId] = useState('');
  const [fecha, setFecha] = useState<string | null>(null);
  const [franja, setFranja] = useState<{ inicio: string; hora: string } | null>(null);
  const [problema, setProblema] = useState('');
  const [confirmando, setConfirmando] = useState(false);
  const { ejecutar, ocupado, error } = useAccion();

  const diaSel = useMemo(() => disp.datos?.dias.find((d) => d.fecha === fecha), [disp.datos, fecha]);
  const vehiculo = vehiculos.datos?.datos.find((v) => v.id === vehiculoId);
  const listo = vehiculoId && franja && problema.trim().length > 0;

  const reservar = async () => {
    const cita = await ejecutar(
      (clave) => api.post<Cita>('/citas', { vehiculoId, inicio: franja!.inicio, descripcionProblema: problema }, { claveIdempotencia: clave }),
      'Cita solicitada. Te avisaremos cuando el taller la confirme',
    );
    if (cita) router.push('/ordenes');
    else {
      // Si la franja se ha llenado mientras tanto, se refresca la disponibilidad.
      void disp.recargar();
    }
  };

  return (
    <>
      <Cabecera titulo="Reservar cita" subtitulo="Elige el vehículo, el día y la hora a la que lo traerás." />
      <Carga {...vehiculos}>
        {(v) =>
          !v.datos.length ? (
            <Vacio titulo="Primero registra tu vehículo" texto="Necesitamos la matrícula y el modelo para preparar la cita." accion={<Button variant="contained" component={Link} href="/vehiculos?nuevo=1">Añadir vehículo</Button>} />
          ) : (
            <Stack spacing={3}>
              <Card>
                <CardContent>
                  <Typography variant="h6" sx={{ mb: 2 }}>1 · Vehículo</Typography>
                  <TextField select label="Vehículo" value={vehiculoId} onChange={(e) => setVehiculoId(e.target.value)} sx={{ maxWidth: 420 }}>
                    {v.datos.map((x) => (
                      <MenuItem key={x.id} value={x.id}>{x.marca} {x.modelo} · {x.matricula}</MenuItem>
                    ))}
                  </TextField>
                </CardContent>
              </Card>

              <Card>
                <CardContent>
                  <Typography variant="h6" sx={{ mb: 2 }}>2 · Día y hora</Typography>
                  <Carga {...disp}>
                    {(d) => (
                      <>
                        <Box role="listbox" aria-label="Días disponibles" sx={{ display: 'flex', gap: 1, overflowX: 'auto', pb: 1 }}>
                          {d.dias.filter((x) => x.laborable).map((x) => {
                            const lleno = x.lleno || !x.franjas.some((f) => f.libres > 0);
                            return (
                              <Chip
                                key={x.fecha}
                                role="option"
                                aria-selected={fecha === x.fecha}
                                label={lleno ? `${dia(x.fecha)} · completo` : dia(x.fecha)}
                                color={fecha === x.fecha ? 'primary' : 'default'}
                                variant={fecha === x.fecha ? 'filled' : 'outlined'}
                                disabled={lleno}
                                onClick={() => { setFecha(x.fecha); setFranja(null); }}
                              />
                            );
                          })}
                        </Box>
                        {diaSel && (
                          <Box sx={{ mt: 2 }}>
                            <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>Hora de llegada el {diaLargo(diaSel.fecha)}</Typography>
                            <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(88px, 1fr))', gap: 1 }}>
                              {diaSel.franjas.map((f) => (
                                <Button key={f.inicio} variant={franja?.inicio === f.inicio ? 'contained' : 'outlined'} disabled={!f.libres} onClick={() => setFranja(f)} aria-pressed={franja?.inicio === f.inicio}>
                                  {f.hora}
                                </Button>
                              ))}
                            </Box>
                          </Box>
                        )}
                      </>
                    )}
                  </Carga>
                </CardContent>
              </Card>

              <Card>
                <CardContent>
                  <Typography variant="h6" sx={{ mb: 2 }}>3 · ¿Qué le pasa?</Typography>
                  <TextField label="Describe el problema" multiline minRows={3} value={problema} onChange={(e) => setProblema(e.target.value)} inputProps={{ maxLength: 2000 }} helperText="Ruidos, testigos encendidos, desde cuándo… cuanto más detalle, mejor." />
                </CardContent>
              </Card>

              {error && !confirmando && <Alert severity="error">{error}</Alert>}
              <Button variant="contained" size="large" disabled={!listo} onClick={() => setConfirmando(true)} sx={{ alignSelf: 'flex-start' }}>
                Revisar y confirmar
              </Button>
            </Stack>
          )
        }
      </Carga>
      <Confirmar
        abierto={confirmando}
        titulo="Confirmar la cita"
        textoConfirmar="Solicitar cita"
        ocupado={ocupado}
        error={error}
        onCerrar={() => setConfirmando(false)}
        onConfirmar={async () => { await reservar(); setConfirmando(false); }}
      >
        {vehiculo && franja && fecha && (
          <Stack spacing={1}>
            <Typography><strong>Vehículo:</strong> {vehiculo.marca} {vehiculo.modelo} · {vehiculo.matricula}</Typography>
            <Typography><strong>Día:</strong> {diaLargo(fecha)} a las {franja.hora}</Typography>
            <Typography><strong>Problema:</strong> {problema}</Typography>
            <Alert severity="info">El taller la confirmará y te avisaremos. Puedes cancelarla hasta 24 h antes.</Alert>
          </Stack>
        )}
      </Confirmar>
    </>
  );
}
