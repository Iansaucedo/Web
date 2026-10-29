'use client';
import { useState } from 'react';
import Link from 'next/link';
import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import Card from '@mui/material/Card';
import CardActionArea from '@mui/material/CardActionArea';
import CardContent from '@mui/material/CardContent';
import Grid from '@mui/material/Grid2';
import IconButton from '@mui/material/IconButton';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import CloseIcon from '@mui/icons-material/Close';
import { Cabecera, Carga, Confirmar, Vacio, useDialogo } from '../../../components/Comunes';
import { ChipEstado } from '../../../components/ChipEstado';
import { api } from '../../../lib/api';
import { useAccion, useDatos } from '../../../lib/hooks';
import { ESTADO_CITA, ESTADO_ORDEN, diaLargo, fechaHora } from '../../../lib/formato';
import type { Cita, Lista, OrdenResumen } from '../../../lib/tipos';

export default function MisOrdenes() {
  const ordenes = useDatos<Lista<OrdenResumen>>('/ordenes');
  const citas = useDatos<Lista<Cita>>('/citas');
  const cancelar = useDialogo<Cita>();
  const [motivo, setMotivo] = useState('');
  const { ejecutar, ocupado, error, limpiarError } = useAccion();

  const proximas = citas.datos?.datos.filter((c) => c.estado === 'PENDIENTE' || c.estado === 'CONFIRMADA') ?? [];
  const porResponder = ordenes.datos?.datos.filter((o) => o.estado === 'ESPERANDO_AUTORIZACION') ?? [];

  const confirmarCancelacion = async () => {
    const ok = await ejecutar(() => api.post(`/citas/${cancelar.valor!.id}/cancelar`, motivo ? { motivo } : {}), 'Cita cancelada. La franja queda libre');
    if (ok) {
      cancelar.cerrar();
      setMotivo('');
      void citas.recargar();
    }
  };

  return (
    <>
      <Cabecera titulo="Mis órdenes" acciones={<Button variant="contained" component={Link} href="/reservar">Reservar cita</Button>} />
      {porResponder.map((o) => (
        <Alert key={o.id} severity="warning" sx={{ mb: 2 }} action={<Button color="inherit" component={Link} href={`/ordenes/${o.id}`}>Revisar</Button>}>
          {o.codigo} · {o.vehiculo.marca} {o.vehiculo.modelo}: el taller necesita tu aprobación para seguir.
        </Alert>
      ))}

      <Typography variant="h5" component="h2" sx={{ mb: 2 }}>Próximas citas</Typography>
      <Carga {...citas}>
        {() =>
          proximas.length ? (
            <Stack spacing={1.5} sx={{ mb: 4 }}>
              {proximas.map((c) => (
                <Card key={c.id} data-testid="cita">
                  <CardContent sx={{ display: 'flex', gap: 2, alignItems: 'center', flexWrap: 'wrap' }}>
                    <Stack sx={{ flex: 1, minWidth: 200 }}>
                      <Typography variant="h6">{diaLargo(c.fecha)} · {c.hora}</Typography>
                      <Typography variant="body2" color="text.secondary">{c.vehiculo.marca} {c.vehiculo.modelo} · {c.vehiculo.matricula}</Typography>
                    </Stack>
                    <ChipEstado {...ESTADO_CITA[c.estado]} />
                    <Tooltip title={c.puedeCambiar ? 'Cancelar la cita' : 'Faltan menos de 24 h: llama al taller para cancelar'}>
                      <span>
                        <IconButton aria-label="Cancelar la cita" onClick={() => cancelar.abrir(c)} disabled={!c.puedeCambiar}>
                          <CloseIcon />
                        </IconButton>
                      </span>
                    </Tooltip>
                  </CardContent>
                </Card>
              ))}
            </Stack>
          ) : (
            <Typography color="text.secondary" sx={{ mb: 4 }}>No tienes citas pendientes.</Typography>
          )
        }
      </Carga>

      <Typography variant="h5" component="h2" sx={{ mb: 2 }}>Reparaciones</Typography>
      <Carga {...ordenes}>
        {(d) =>
          d.datos.length ? (
            <Grid container spacing={2}>
              {d.datos.map((o) => (
                <Grid key={o.id} size={{ xs: 12, md: 6 }}>
                  <Card data-testid="orden">
                    <CardActionArea component={Link} href={`/ordenes/${o.id}`}>
                      <CardContent>
                        <Stack direction="row" sx={{ justifyContent: 'space-between', alignItems: 'flex-start', gap: 1 }}>
                          <div>
                            <Typography variant="overline" color="text.secondary">{o.codigo}</Typography>
                            <Typography variant="h6">{o.vehiculo.marca} {o.vehiculo.modelo}</Typography>
                            <Typography variant="body2" color="text.secondary">{o.vehiculo.matricula}</Typography>
                          </div>
                          <ChipEstado {...ESTADO_ORDEN[o.estado]} />
                        </Stack>
                        {o.entregaEstimada && o.estado !== 'ENTREGADA' && (
                          <Typography variant="body2" sx={{ mt: 1.5 }}>Entrega prevista: {fechaHora(o.entregaEstimada)}</Typography>
                        )}
                      </CardContent>
                    </CardActionArea>
                  </Card>
                </Grid>
              ))}
            </Grid>
          ) : (
            <Vacio titulo="Aún no tienes reparaciones" texto="Cuando dejes tu vehículo en el taller, aquí verás cómo va." />
          )
        }
      </Carga>

      <Confirmar
        abierto={cancelar.abierto}
        titulo="¿Cancelar la cita?"
        textoConfirmar="Cancelar cita"
        peligro
        ocupado={ocupado}
        error={error}
        onCerrar={() => { cancelar.cerrar(); limpiarError(); }}
        onConfirmar={confirmarCancelacion}
      >
        {cancelar.valor && (
          <Typography>
            {diaLargo(cancelar.valor.fecha)} a las {cancelar.valor.hora} · {cancelar.valor.vehiculo.matricula}. La franja quedará libre para otros clientes.
          </Typography>
        )}
        <TextField label="Motivo (opcional)" value={motivo} onChange={(e) => setMotivo(e.target.value)} inputProps={{ maxLength: 300 }} />
      </Confirmar>
    </>
  );
}
