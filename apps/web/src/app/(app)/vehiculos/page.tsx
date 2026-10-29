'use client';
import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import Button from '@mui/material/Button';
import Card from '@mui/material/Card';
import CardActions from '@mui/material/CardActions';
import CardContent from '@mui/material/CardContent';
import Dialog from '@mui/material/Dialog';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import Grid from '@mui/material/Grid2';
import MenuItem from '@mui/material/MenuItem';
import TextField from '@mui/material/TextField';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import { Cabecera, Carga, Confirmar, Vacio, useDialogo } from '../../../components/Comunes';
import { HistorialVehiculo } from '../../../components/Historial';
import { api } from '../../../lib/api';
import { useAccion, useDatos } from '../../../lib/hooks';
import type { Lista, Vehiculo } from '../../../lib/tipos';

const COMBUSTIBLES = [['GASOLINA', 'Gasolina'], ['DIESEL', 'Diésel'], ['HIBRIDO', 'Híbrido'], ['ELECTRICO', 'Eléctrico'], ['GLP', 'GLP']];
const MARCAS = ['Audi', 'BMW', 'Citroën', 'Dacia', 'Fiat', 'Ford', 'Hyundai', 'Kia', 'Mercedes-Benz', 'Nissan', 'Opel', 'Peugeot', 'Renault', 'Seat', 'Škoda', 'Tesla', 'Toyota', 'Volkswagen', 'Volvo', 'Otra'];

function NuevoVehiculo({ abierto, onCerrar, onCreado }: { abierto: boolean; onCerrar: () => void; onCreado: () => void }) {
  const [f, setF] = useState({ matricula: '', marca: '', otraMarca: '', modelo: '', anio: '', combustible: '', kilometros: '', bastidor: '' });
  const { ejecutar, ocupado, error, limpiarError } = useAccion();
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => setF((x) => ({ ...x, [k]: e.target.value }));
  const guardar = async () => {
    const cuerpo = {
      matricula: f.matricula,
      marca: f.marca === 'Otra' ? f.otraMarca : f.marca,
      modelo: f.modelo,
      ...(f.anio ? { anio: Number(f.anio) } : {}),
      ...(f.combustible ? { combustible: f.combustible } : {}),
      ...(f.kilometros ? { kilometros: Number(f.kilometros) } : {}),
      ...(f.bastidor ? { bastidor: f.bastidor } : {}),
    };
    const ok = await ejecutar((clave) => api.post('/vehiculos', cuerpo, { claveIdempotencia: clave }), 'Vehículo añadido');
    if (ok) {
      onCreado();
      onCerrar();
    }
  };
  return (
    <Confirmar abierto={abierto} titulo="Añadir vehículo" textoConfirmar="Guardar" ocupado={ocupado} error={error} onCerrar={() => { limpiarError(); onCerrar(); }} onConfirmar={guardar} deshabilitado={!f.matricula || !f.marca || !f.modelo}>
      <TextField label="Matrícula" required value={f.matricula} onChange={set('matricula')} inputProps={{ autoCapitalize: 'characters' }} helperText="Ejemplo: 1234 ABC" />
      <TextField select label="Marca" required value={f.marca} onChange={set('marca')}>
        {MARCAS.map((m) => <MenuItem key={m} value={m}>{m}</MenuItem>)}
      </TextField>
      {f.marca === 'Otra' && <TextField label="¿Qué marca?" required value={f.otraMarca} onChange={set('otraMarca')} />}
      <TextField label="Modelo" required value={f.modelo} onChange={set('modelo')} />
      <Grid container spacing={2}>
        <Grid size={6}><TextField label="Año" type="number" value={f.anio} onChange={set('anio')} /></Grid>
        <Grid size={6}>
          <TextField select label="Combustible" value={f.combustible} onChange={set('combustible')}>
            <MenuItem value="">Sin indicar</MenuItem>
            {COMBUSTIBLES.map(([v, t]) => <MenuItem key={v} value={v}>{t}</MenuItem>)}
          </TextField>
        </Grid>
      </Grid>
      <TextField label="Kilómetros" type="number" value={f.kilometros} onChange={set('kilometros')} />
      <TextField label="Bastidor (VIN, opcional)" value={f.bastidor} onChange={set('bastidor')} helperText="17 caracteres. Está en la ficha técnica" />
    </Confirmar>
  );
}

function Vehiculos() {
  const params = useSearchParams();
  const v = useDatos<Lista<Vehiculo>>('/vehiculos');
  const [nuevo, setNuevo] = useState(false);
  const [historial, setHistorial] = useState<Vehiculo | null>(null);
  const borrar = useDialogo<Vehiculo>();
  const [motivo, setMotivo] = useState('');
  const acc = useAccion();
  useEffect(() => setNuevo(params.get('nuevo') === '1'), [params]);
  return (
    <>
      <Cabecera titulo="Mis vehículos" acciones={<Button variant="contained" onClick={() => setNuevo(true)}>Añadir vehículo</Button>} />
      <Carga {...v}>
        {(d) =>
          d.datos.length ? (
            <Grid container spacing={2}>
              {d.datos.map((x) => (
                <Grid key={x.id} size={{ xs: 12, sm: 6, lg: 4 }}>
                  <Card data-testid="vehiculo">
                    <CardContent>
                      <Typography variant="h6">{x.marca} {x.modelo}</Typography>
                      <Typography color="text.secondary">{x.matricula}{x.anio ? ` · ${x.anio}` : ''}</Typography>
                      {x.kilometros !== null && <Typography variant="body2" sx={{ mt: 1 }}>{x.kilometros.toLocaleString('es-ES')} km</Typography>}
                    </CardContent>
                    <CardActions>
                      <Button onClick={() => setHistorial(x)}>Historial</Button>
                      <Tooltip title={x.enTaller ? 'Está en el taller: podrás eliminarlo cuando lo recojas' : ''}>
                        <span><Button color="error" disabled={x.enTaller} onClick={() => { setMotivo(''); borrar.abrir(x); }} aria-label={`Eliminar ${x.matricula}`}>Eliminar</Button></span>
                      </Tooltip>
                    </CardActions>
                  </Card>
                </Grid>
              ))}
            </Grid>
          ) : (
            <Vacio titulo="Aún no tienes vehículos" texto="Añade tu coche para poder reservar cita." accion={<Button variant="contained" onClick={() => setNuevo(true)}>Añadir vehículo</Button>} />
          )
        }
      </Carga>
      <NuevoVehiculo abierto={nuevo} onCerrar={() => setNuevo(false)} onCreado={v.recargar} />
      <Confirmar
        abierto={borrar.abierto}
        titulo={`¿Eliminar ${borrar.valor?.matricula ?? ''}?`}
        textoConfirmar="Eliminar"
        peligro
        ocupado={acc.ocupado}
        error={acc.error}
        onCerrar={() => { borrar.cerrar(); acc.limpiarError(); }}
        onConfirmar={async () => {
          const ok = await acc.ejecutar(() => api.delete(`/vehiculos/${borrar.valor!.id}`, motivo.trim() ? { motivo } : {}), 'Vehículo eliminado');
          if (ok !== undefined) { borrar.cerrar(); void v.recargar(); }
        }}
      >
        <Typography>Dejará de aparecer en tu cuenta y no podrás reservar con él. Si ya pasó por el taller, su historial de reparaciones se conserva y el taller guarda una copia.</Typography>
        <TextField label="Motivo (opcional)" value={motivo} onChange={(e) => setMotivo(e.target.value)} inputProps={{ maxLength: 300 }} />
      </Confirmar>
      <Dialog open={Boolean(historial)} onClose={() => setHistorial(null)} fullWidth maxWidth="md">
        <DialogTitle>Historial · {historial?.matricula}</DialogTitle>
        <DialogContent>{historial && <HistorialVehiculo vehiculoId={historial.id} />}</DialogContent>
      </Dialog>
    </>
  );
}

export default function PaginaVehiculos() {
  return (
    <Suspense>
      <Vehiculos />
    </Suspense>
  );
}
