'use client';
import { useState } from 'react';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import Checkbox from '@mui/material/Checkbox';
import Chip from '@mui/material/Chip';
import FormControlLabel from '@mui/material/FormControlLabel';
import FormGroup from '@mui/material/FormGroup';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { Cabecera, Carga, Vacio } from '../../../components/Comunes';
import { ChipEstado } from '../../../components/ChipEstado';
import { useSesion } from '../../../components/Sesion';
import { api } from '../../../lib/api';
import { useAccion, useDatos } from '../../../lib/hooks';
import { dia, diaLargo, hora, hoy, sumarDias } from '../../../lib/formato';
import type { DiaDisponible, Lista, ReservaMultiple, Vehiculo } from '../../../lib/tipos';
import type { Tono } from '../../../theme';

const ESTADO: Record<ReservaMultiple['estado'], { texto: string; tono: Tono }> = {
  EN_ESPERA: { texto: 'En espera', tono: 'aviso' },
  HUECO_OFRECIDO: { texto: 'Hueco ofrecido', tono: 'exito' },
  CONVERTIDA: { texto: 'Citas creadas', tono: 'info' },
  CANCELADA: { texto: 'Cancelada', tono: 'neutro' },
};

export default function Reservas() {
  const { usuario } = useSesion();
  const vehiculos = useDatos<Lista<Vehiculo>>('/vehiculos');
  const reservas = useDatos<Lista<ReservaMultiple>>('/reservas-multiples');
  const desde = sumarDias(hoy(), 1);
  const dias = useDatos<{ dias: DiaDisponible[] }>(`/disponibilidad?desde=${desde}&hasta=${sumarDias(desde, 20)}`);
  const [sel, setSel] = useState<string[]>([]);
  const [fechas, setFechas] = useState<string[]>([]);
  const enviar = useAccion();
  const accion = useAccion();

  if (usuario.cliente?.tipo !== 'EMPRESA') return <Alert severity="info">La reserva de varios vehículos es para empresas.</Alert>;

  const pedir = async () => {
    const ok = await enviar.ejecutar((clave) => api.post('/reservas-multiples', { vehiculoIds: sel, fechasPreferidas: fechas }, { claveIdempotencia: clave }), 'Solicitud enviada. Te avisaremos cuando haya hueco');
    if (ok) {
      setSel([]);
      setFechas([]);
      void reservas.recargar();
    }
  };
  const actuar = async (r: ReservaMultiple, que: 'aceptar' | 'cancelar') => {
    await accion.ejecutar(() => api.post(`/reservas-multiples/${r.id}/${que}`), que === 'aceptar' ? 'Citas creadas' : 'Reserva cancelada');
    void reservas.recargar();
  };

  return (
    <>
      <Cabecera titulo="Reserva múltiple" subtitulo="Trae varios vehículos el mismo día. El taller busca un hueco para todos entre tus fechas preferidas." />
      <Card sx={{ mb: 4 }}>
        <CardContent>
          <Typography variant="h6">Nueva solicitud</Typography>
          <Carga {...vehiculos}>
            {(v) => (
              <FormGroup sx={{ my: 1 }}>
                {v.datos.map((x) => (
                  <FormControlLabel key={x.id} control={<Checkbox checked={sel.includes(x.id)} onChange={(e) => setSel((s) => (e.target.checked ? [...s, x.id] : s.filter((y) => y !== x.id)))} />} label={`${x.marca} ${x.modelo} · ${x.matricula}`} />
                ))}
              </FormGroup>
            )}
          </Carga>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>Fechas preferidas (hasta 5)</Typography>
          <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
            {dias.datos?.dias.filter((d) => d.laborable).map((d) => (
              <Chip key={d.fecha} label={dia(d.fecha)} color={fechas.includes(d.fecha) ? 'primary' : 'default'} variant={fechas.includes(d.fecha) ? 'filled' : 'outlined'} onClick={() => setFechas((f) => (f.includes(d.fecha) ? f.filter((x) => x !== d.fecha) : f.length < 5 ? [...f, d.fecha] : f))} />
            ))}
          </Box>
          {enviar.error && <Alert severity="error" sx={{ mt: 2 }}>{enviar.error}</Alert>}
          <Button variant="contained" sx={{ mt: 2 }} disabled={sel.length < 2 || !fechas.length || enviar.ocupado} onClick={pedir}>
            Enviar solicitud ({sel.length} vehículos)
          </Button>
        </CardContent>
      </Card>

      <Typography variant="h5" component="h2" sx={{ mb: 2 }}>Tus solicitudes</Typography>
      {accion.error && <Alert severity="error" sx={{ mb: 2 }}>{accion.error}</Alert>}
      <Carga {...reservas}>
        {(r) =>
          r.datos.length ? (
            <Stack spacing={1.5}>
              {r.datos.map((x) => (
                <Card key={x.id} data-testid="reserva">
                  <CardContent sx={{ display: 'flex', gap: 2, flexWrap: 'wrap', alignItems: 'center' }}>
                    <Box sx={{ flex: 1, minWidth: 220 }}>
                      <Typography sx={{ fontWeight: 500 }}>{x.codigo} · {x.vehiculos.length} vehículos</Typography>
                      <Typography variant="body2" color="text.secondary">{x.vehiculos.map((v) => v.matricula).join(', ')}</Typography>
                      <Typography variant="body2" color="text.secondary">
                        {x.fechaOfrecida ? `Día ofrecido: ${diaLargo(x.fechaOfrecida)} · llegadas a las ${x.franjasOfrecidas.map(hora).join(', ')}` : `Prefieres: ${x.fechasPreferidas.map(dia).join(' · ')}`}
                      </Typography>
                    </Box>
                    <ChipEstado {...ESTADO[x.estado]} />
                    {x.estado === 'HUECO_OFRECIDO' && <Button variant="contained" disabled={accion.ocupado} onClick={() => actuar(x, 'aceptar')}>Aceptar el día</Button>}
                    {(x.estado === 'EN_ESPERA' || x.estado === 'HUECO_OFRECIDO') && <Button disabled={accion.ocupado} onClick={() => actuar(x, 'cancelar')}>Cancelar</Button>}
                  </CardContent>
                </Card>
              ))}
            </Stack>
          ) : (
            <Vacio titulo="No tienes solicitudes" />
          )
        }
      </Carga>
    </>
  );
}
