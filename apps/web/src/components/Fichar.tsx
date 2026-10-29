'use client';
import { useState } from 'react';
import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import LinearProgress from '@mui/material/LinearProgress';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import PlayIcon from '@mui/icons-material/PlayArrow';
import PauseIcon from '@mui/icons-material/Pause';
import CoffeeIcon from '@mui/icons-material/Coffee';
import StopIcon from '@mui/icons-material/Stop';
import { Confirmar } from './Comunes';
import { api } from '../lib/api';
import { useAccion, useDatos } from '../lib/hooks';
import { FICHAJE, horasMin } from '../lib/formato';
import type { Fichaje, Resumen, TipoFichaje } from '../lib/tipos';

interface Hoy {
  fecha: string;
  fichajes: Fichaje[];
  permitidos: TipoFichaje[];
  resumen: Resumen;
  jornadaMinutos: number;
}

const BOTON: Record<TipoFichaje, { texto: string; icono: typeof PlayIcon; variante: 'contained' | 'tonal' | 'outlined' }> = {
  ENTRADA: { texto: 'Fichar entrada', icono: PlayIcon, variante: 'contained' },
  INICIO_PAUSA: { texto: 'Empezar pausa', icono: PauseIcon, variante: 'tonal' },
  FIN_PAUSA: { texto: 'Volver de la pausa', icono: CoffeeIcon, variante: 'contained' },
  SALIDA: { texto: 'Fichar salida', icono: StopIcon, variante: 'outlined' },
};

/** Tarjeta de fichaje: solo ofrece los botones que el orden de la jornada permite. */
export function TarjetaFichaje() {
  const hoy = useDatos<Hoy>('/fichajes/hoy');
  const { ejecutar, ocupado, error } = useAccion();
  const [salida, setSalida] = useState(false);
  const fichar = async (tipo: TipoFichaje) => {
    await ejecutar(() => api.post('/fichajes', { tipo }), `${FICHAJE[tipo]} registrada`);
    setSalida(false);
    void hoy.recargar();
  };
  const d = hoy.datos;
  const ultimo = d?.fichajes.at(-1);
  const estado = !ultimo || ultimo.tipo === 'SALIDA' ? 'Fuera de jornada' : ultimo.tipo === 'INICIO_PAUSA' ? `En pausa desde las ${ultimo.hora}` : `Trabajando desde las ${d!.fichajes.find((f) => f.tipo === 'ENTRADA')?.hora ?? ultimo.hora}`;
  return (
    <Card data-testid="fichaje">
      <CardContent>
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} sx={{ justifyContent: 'space-between', alignItems: { sm: 'center' } }}>
          <div>
            <Typography variant="overline" color="text.secondary">Mi jornada de hoy</Typography>
            <Typography variant="h6">{d ? estado : '…'}</Typography>
            {d && <Typography variant="body2" color="text.secondary">Trabajado: {horasMin(d.resumen.minutosTrabajados)} de {horasMin(d.jornadaMinutos)}</Typography>}
          </div>
          <Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap', gap: 1 }}>
            {d?.permitidos.map((t) => {
              const b = BOTON[t];
              return (
                <Button key={t} size="large" variant={b.variante} startIcon={<b.icono />} disabled={ocupado} onClick={() => (t === 'SALIDA' ? setSalida(true) : fichar(t))}>
                  {b.texto}
                </Button>
              );
            })}
          </Stack>
        </Stack>
        {d && <LinearProgress variant="determinate" value={Math.min(100, (d.resumen.minutosTrabajados / d.jornadaMinutos) * 100)} sx={{ mt: 2, height: 8, borderRadius: 4 }} aria-label="Progreso de la jornada" />}
        {error && !salida && <Alert severity="error" sx={{ mt: 2 }}>{error}</Alert>}
      </CardContent>
      <Confirmar abierto={salida} titulo="¿Fichar la salida?" textoConfirmar="Fichar salida" ocupado={ocupado} error={error} onCerrar={() => setSalida(false)} onConfirmar={() => fichar('SALIDA')}>
        {d && <Typography>Hoy llevas {horasMin(d.resumen.minutosTrabajados)} trabajadas y {d.resumen.minutosPausa} min de pausa. Si te equivocas, puedes pedir una corrección.</Typography>}
      </Confirmar>
    </Card>
  );
}
