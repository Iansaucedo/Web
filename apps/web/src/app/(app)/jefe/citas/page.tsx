'use client';
import { Suspense, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import IconButton from '@mui/material/IconButton';
import MenuItem from '@mui/material/MenuItem';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import AnteriorIcon from '@mui/icons-material/ChevronLeft';
import SiguienteIcon from '@mui/icons-material/ChevronRight';
import { Cabecera, Carga, Confirmar, Vacio, useDialogo } from '../../../../components/Comunes';
import { ChipEstado } from '../../../../components/ChipEstado';
import { api } from '../../../../lib/api';
import { useAccion, useDatos } from '../../../../lib/hooks';
import { ESTADO_CITA, diaLargo, hoy, sumarDias } from '../../../../lib/formato';
import type { Cita, DiaDisponible, Lista, Puesto } from '../../../../lib/tipos';

function Citas() {
  const params = useSearchParams();
  const [fecha, setFecha] = useState(params.get('fecha') ?? hoy());
  const citas = useDatos<Lista<Cita>>(`/citas?fecha=${fecha}`);
  const disp = useDatos<{ dias: DiaDisponible[] }>(`/disponibilidad?desde=${fecha}&hasta=${fecha}`);
  const puestos = useDatos<Lista<Puesto>>('/puestos');
  const recibir = useDialogo<Cita>();
  const noVino = useDialogo<Cita>();
  const cancelar = useDialogo<Cita>();
  const [km, setKm] = useState('');
  const [notas, setNotas] = useState('');
  const [puestoId, setPuestoId] = useState('');
  const [motivo, setMotivo] = useState('');
  const acc = useAccion();
  const esHoy = fecha === hoy();
  const recargar = () => { void citas.recargar(); void disp.recargar(); void puestos.recargar(); };
  const dia = disp.datos?.dias[0];

  return (
    <>
      <Cabecera
        titulo="Citas y recepción"
        subtitulo={dia ? `${dia.ocupadas} citas · capacidad ${dia.capacidad}${dia.ocupadas > dia.capacidad ? ' · ¡hay más citas de las que caben!' : ''}` : undefined}
        acciones={
          <Stack direction="row" sx={{ alignItems: 'center' }}>
            <IconButton aria-label="Día anterior" onClick={() => setFecha(sumarDias(fecha, -1))}><AnteriorIcon /></IconButton>
            <TextField type="date" size="small" value={fecha} onChange={(e) => e.target.value && setFecha(e.target.value)} sx={{ width: 170 }} inputProps={{ 'aria-label': 'Día' }} />
            <IconButton aria-label="Día siguiente" onClick={() => setFecha(sumarDias(fecha, 1))}><SiguienteIcon /></IconButton>
            {!esHoy && <Button onClick={() => setFecha(hoy())}>Hoy</Button>}
          </Stack>
        }
      />
      <Typography variant="h6" sx={{ mb: 2 }}>{diaLargo(fecha)}</Typography>
      {acc.error && !recibir.abierto && !noVino.abierto && !cancelar.abierto && <Alert severity="error" sx={{ mb: 2 }} onClose={acc.limpiarError}>{acc.error}</Alert>}
      <Carga {...citas}>
        {(d) =>
          d.datos.length ? (
            <Stack spacing={1.5}>
              {d.datos.map((c) => {
                const activa = c.estado === 'PENDIENTE' || c.estado === 'CONFIRMADA';
                const pasada = new Date(c.inicio) <= new Date();
                return (
                  <Card key={c.id} data-testid="cita">
                    <CardContent sx={{ display: 'flex', gap: 2, alignItems: 'center', flexWrap: 'wrap' }}>
                      <Typography variant="h5" component="p" sx={{ width: 64 }}>{c.hora}</Typography>
                      <Stack sx={{ flex: 1, minWidth: 220 }}>
                        <Typography sx={{ fontWeight: 500 }}>{c.vehiculo.marca} {c.vehiculo.modelo} · {c.vehiculo.matricula}</Typography>
                        <Typography variant="body2" color="text.secondary">{c.cliente.razonSocial ?? c.cliente.nombre} · {c.cliente.telefono}</Typography>
                        <Typography variant="body2">{c.descripcionProblema}</Typography>
                      </Stack>
                      <ChipEstado {...ESTADO_CITA[c.estado]} />
                      <Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap', gap: 1 }}>
                        {c.estado === 'PENDIENTE' && <Button variant="tonal" disabled={acc.ocupado} onClick={async () => { await acc.ejecutar(() => api.post(`/citas/${c.id}/confirmar`), 'Cita confirmada. El cliente recibe un email'); recargar(); }}>Confirmar</Button>}
                        {activa && esHoy && <Button variant="contained" onClick={() => { setKm(''); setNotas(''); setPuestoId(''); recibir.abrir(c); }}>Recibir</Button>}
                        {activa && pasada && <Button onClick={() => noVino.abrir(c)}>No vino</Button>}
                        {activa && <Button color="error" onClick={() => { setMotivo(''); cancelar.abrir(c); }}>Cancelar</Button>}
                        {c.ordenId && <Button href={`/mecanico/ordenes/${c.ordenId}`}>Ver orden</Button>}
                      </Stack>
                    </CardContent>
                  </Card>
                );
              })}
            </Stack>
          ) : (
            <Vacio titulo="No hay citas este día" />
          )
        }
      </Carga>

      <Confirmar
        abierto={recibir.abierto}
        titulo="Recibir vehículo"
        textoConfirmar="Abrir orden"
        ocupado={acc.ocupado}
        error={acc.error}
        deshabilitado={!km}
        onCerrar={() => { recibir.cerrar(); acc.limpiarError(); }}
        onConfirmar={async () => {
          const ok = await acc.ejecutar(() => api.post(`/citas/${recibir.valor!.id}/recibir`, { kmEntrada: Number(km), ...(notas ? { notasRecepcion: notas } : {}), ...(puestoId ? { puestoId } : {}) }), 'Orden abierta. El cliente recibe un aviso');
          if (ok) { recibir.cerrar(); recargar(); }
        }}
      >
        {recibir.valor && <Typography>{recibir.valor.vehiculo.marca} {recibir.valor.vehiculo.modelo} · {recibir.valor.vehiculo.matricula}</Typography>}
        <TextField label="Kilómetros" type="number" required value={km} onChange={(e) => setKm(e.target.value)} inputProps={{ min: 0 }} />
        <TextField select label="Puesto" value={puestoId} onChange={(e) => setPuestoId(e.target.value)}>
          <MenuItem value="">Sin puesto por ahora</MenuItem>
          {puestos.datos?.datos.filter((p) => p.activo).map((p) => (
            <MenuItem key={p.id} value={p.id} disabled={Boolean(p.ocupadoPor)}>{p.nombre}{p.ocupadoPor ? ` · ocupado (${p.ocupadoPor.matricula})` : ''}{p.mecanicoHoy ? ` · ${p.mecanicoHoy.nombre}` : ''}</MenuItem>
          ))}
        </TextField>
        <TextField label="Notas de recepción" multiline minRows={2} value={notas} onChange={(e) => setNotas(e.target.value)} helperText="Daños visibles, objetos en el coche… El cliente las verá." />
      </Confirmar>
      <Confirmar
        abierto={noVino.abierto}
        titulo="¿No se ha presentado?"
        textoConfirmar="Marcar no presentado"
        peligro
        ocupado={acc.ocupado}
        error={acc.error}
        onCerrar={() => { noVino.cerrar(); acc.limpiarError(); }}
        onConfirmar={async () => {
          const ok = await acc.ejecutar(() => api.post(`/citas/${noVino.valor!.id}/no-presentado`), 'Franja liberada. El cliente recibe un email');
          if (ok) { noVino.cerrar(); recargar(); }
        }}
      >
        <Typography>La franja quedará libre y avisaremos al cliente.</Typography>
      </Confirmar>
      <Confirmar
        abierto={cancelar.abierto}
        titulo="Cancelar la cita"
        textoConfirmar="Cancelar cita"
        peligro
        ocupado={acc.ocupado}
        error={acc.error}
        deshabilitado={!motivo.trim()}
        onCerrar={() => { cancelar.cerrar(); acc.limpiarError(); }}
        onConfirmar={async () => {
          const ok = await acc.ejecutar(() => api.post(`/citas/${cancelar.valor!.id}/cancelar`, { motivo }), 'Cita cancelada. El cliente recibe el motivo');
          if (ok) { cancelar.cerrar(); recargar(); }
        }}
      >
        <TextField label="Motivo (se envía al cliente)" required value={motivo} onChange={(e) => setMotivo(e.target.value)} />
      </Confirmar>
    </>
  );
}

export default function PaginaCitas() {
  return (
    <Suspense>
      <Citas />
    </Suspense>
  );
}
