'use client';
import { useEffect, useState } from 'react';
import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import Checkbox from '@mui/material/Checkbox';
import FormControlLabel from '@mui/material/FormControlLabel';
import FormGroup from '@mui/material/FormGroup';
import Grid from '@mui/material/Grid2';
import MenuItem from '@mui/material/MenuItem';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { Cabecera, Carga } from '../../../../components/Comunes';
import { api } from '../../../../lib/api';
import { useAccion, useDatos } from '../../../../lib/hooks';
import type { Config } from '../../../../lib/tipos';

const DIAS = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];
const aHora = (m: number) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
const aMin = (h: string) => Number(h.slice(0, 2)) * 60 + Number(h.slice(3, 5));

export default function Configuracion() {
  const c = useDatos<Config>('/config');
  const [f, setF] = useState<Config | null>(null);
  const acc = useAccion();
  useEffect(() => { if (c.datos) setF(c.datos); }, [c.datos]);
  const num = (k: keyof Config) => ({ value: String(f?.[k] ?? ''), onChange: (e: React.ChangeEvent<HTMLInputElement>) => setF((x) => x && { ...x, [k]: Number(e.target.value) }) });
  return (
    <>
      <Cabecera titulo="Configuración" subtitulo="Capacidad, horario, tarifa e IVA del taller." />
      <Carga {...c}>
        {() =>
          f && (
            <Card sx={{ maxWidth: 760 }}>
              <CardContent sx={{ p: 3 }}>
                <Typography variant="h6" sx={{ mb: 2 }}>Horario y capacidad</Typography>
                <Grid container spacing={2}>
                  <Grid size={{ xs: 6, sm: 3 }}><TextField type="time" label="Apertura" value={aHora(f.aperturaMinutos)} onChange={(e) => setF({ ...f, aperturaMinutos: aMin(e.target.value) })} InputLabelProps={{ shrink: true }} /></Grid>
                  <Grid size={{ xs: 6, sm: 3 }}><TextField type="time" label="Cierre" value={aHora(f.cierreMinutos)} onChange={(e) => setF({ ...f, cierreMinutos: aMin(e.target.value) })} InputLabelProps={{ shrink: true }} /></Grid>
                  <Grid size={{ xs: 6, sm: 3 }}>
                    <TextField select label="Franja" value={String(f.minutosFranja)} onChange={(e) => setF({ ...f, minutosFranja: Number(e.target.value) })}>
                      {[15, 20, 30, 60].map((m) => <MenuItem key={m} value={String(m)}>{m} min</MenuItem>)}
                    </TextField>
                  </Grid>
                  <Grid size={{ xs: 6, sm: 3 }}><TextField type="number" label="Llegadas por franja" {...num('recepcionesPorFranja')} /></Grid>
                  <Grid size={{ xs: 6, sm: 4 }}><TextField type="number" label="Vehículos por mecánico" {...num('vehiculosPorMecanico')} /></Grid>
                  <Grid size={{ xs: 6, sm: 4 }}><TextField type="number" label="Horas mínimas para cancelar" {...num('horasMinimasCancelar')} /></Grid>
                  <Grid size={{ xs: 6, sm: 4 }}><TextField type="number" label="Jornada (min/día)" {...num('jornadaMinutosDia')} /></Grid>
                </Grid>
                <FormGroup row sx={{ mt: 2 }}>
                  {DIAS.map((d, i) => (
                    <FormControlLabel key={d} label={d} control={<Checkbox checked={f.diasLaborables.includes(i + 1)} onChange={(e) => setF({ ...f, diasLaborables: e.target.checked ? [...f.diasLaborables, i + 1].sort() : f.diasLaborables.filter((x) => x !== i + 1) })} />} />
                  ))}
                </FormGroup>
                <Typography variant="h6" sx={{ mt: 3, mb: 2 }}>Precios</Typography>
                <Grid container spacing={2}>
                  <Grid size={{ xs: 6, sm: 4 }}><TextField label="Tarifa por hora (€)" value={(f.tarifaHoraCentimos / 100).toString().replace('.', ',')} onChange={(e) => setF({ ...f, tarifaHoraCentimos: Math.round(Number(e.target.value.replace(',', '.')) * 100) || 0 })} inputProps={{ inputMode: 'decimal' }} /></Grid>
                  <Grid size={{ xs: 6, sm: 4 }}><TextField type="number" label="IVA (%)" {...num('ivaPorcentaje')} /></Grid>
                </Grid>
                {acc.error && <Alert severity="error" sx={{ mt: 2 }}>{acc.error}</Alert>}
                <Button
                  variant="contained"
                  sx={{ mt: 3 }}
                  disabled={acc.ocupado}
                  onClick={async () => {
                    const { zonaHoraria: _z, ...cuerpo } = f;
                    const ok = await acc.ejecutar(() => api.put('/config', cuerpo), 'Configuración guardada');
                    if (ok) void c.recargar();
                  }}
                >
                  Guardar
                </Button>
              </CardContent>
            </Card>
          )
        }
      </Carga>
    </>
  );
}
