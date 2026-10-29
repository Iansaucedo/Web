'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import ToggleButton from '@mui/material/ToggleButton';
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup';
import Typography from '@mui/material/Typography';
import { Cabecera } from '../../../components/Comunes';
import { useSesion } from '../../../components/Sesion';
import { api } from '../../../lib/api';
import { useAccion, useDatos } from '../../../lib/hooks';
import { Confirmar } from '../../../components/Comunes';
import type { Lista, OrdenResumen } from '../../../lib/tipos';

export default function Perfil() {
  const { usuario, recargar } = useSesion();
  const router = useRouter();
  const c = usuario.cliente;
  const [tipo, setTipo] = useState<'INDIVIDUAL' | 'EMPRESA'>(c?.tipo ?? 'INDIVIDUAL');
  const [telefono, setTelefono] = useState(c?.telefono ?? '');
  const [razonSocial, setRazonSocial] = useState(c?.razonSocial ?? '');
  const [nif, setNif] = useState(c?.nif ?? '');
  const { ejecutar, ocupado, error } = useAccion();
  const nuevo = !c;
  const enTaller = useDatos<Lista<OrdenResumen>>(usuario.rol === 'CLIENTE' && c ? '/ordenes?abiertas=true' : null);
  const [baja, setBaja] = useState(false);
  const [confirmacion, setConfirmacion] = useState('');
  const [motivo, setMotivo] = useState('');
  const accBaja = useAccion();

  if (usuario.rol !== 'CLIENTE') return <Alert severity="info">Solo los clientes tienen perfil.</Alert>;

  const guardar = async (e: React.FormEvent) => {
    e.preventDefault();
    const ok = await ejecutar(() => api.put('/perfil', tipo === 'EMPRESA' ? { tipo, telefono, razonSocial, nif } : { tipo, telefono }), 'Perfil guardado');
    if (ok) {
      await recargar();
      if (nuevo) router.push('/reservar');
    }
  };

  return (
    <>
      <Cabecera titulo={nuevo ? 'Completa tu perfil' : 'Mi perfil'} subtitulo={nuevo ? 'Solo una vez. Lo necesitamos para avisarte y para la factura.' : usuario.email} />
      <Card sx={{ maxWidth: 560 }}>
        <CardContent component="form" onSubmit={guardar} sx={{ p: 3 }}>
          <Stack spacing={2.5}>
            <div>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }} id="tipo-cliente">¿Eres particular o empresa?</Typography>
              <ToggleButtonGroup exclusive value={tipo} onChange={(_, v) => v && setTipo(v)} aria-labelledby="tipo-cliente" disabled={!nuevo}>
                <ToggleButton value="INDIVIDUAL">Particular</ToggleButton>
                <ToggleButton value="EMPRESA">Empresa</ToggleButton>
              </ToggleButtonGroup>
              {tipo === 'EMPRESA' && <Typography variant="caption" display="block" sx={{ mt: 1 }} color="text.secondary">Una empresa usa una sola cuenta para todos sus vehículos.</Typography>}
            </div>
            <TextField label="Teléfono" required value={telefono} onChange={(e) => setTelefono(e.target.value)} inputProps={{ inputMode: 'tel', autoComplete: 'tel' }} helperText="Te llamaremos solo si hace falta" />
            {tipo === 'EMPRESA' && (
              <>
                <TextField label="Razón social" required value={razonSocial} onChange={(e) => setRazonSocial(e.target.value)} />
                <TextField label="NIF / CIF" required value={nif} onChange={(e) => setNif(e.target.value)} helperText="Aparecerá en las facturas" />
              </>
            )}
            {error && <Alert severity="error">{error}</Alert>}
            <Button type="submit" variant="contained" disabled={ocupado} sx={{ alignSelf: 'flex-start' }}>
              {nuevo ? 'Continuar' : 'Guardar'}
            </Button>
          </Stack>
        </CardContent>
      </Card>
      {!nuevo && (
        <Card sx={{ maxWidth: 560, mt: 3, borderColor: 'error.light' }}>
          <CardContent sx={{ p: 3 }}>
            <Typography variant="h6" component="h2">Darme de baja</Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mt: 1, mb: 2 }}>
              Se cancelarán tus citas pendientes y no podrás usar la cuenta. Tendrás 14 días para recuperarla entrando de nuevo; después la desvincularemos de Google. Conservamos el historial de reparaciones y facturas.
            </Typography>
            {Boolean(enTaller.datos?.datos.length) && (
              <Alert severity="warning" sx={{ mb: 2 }}>Tienes un vehículo en el taller ({enTaller.datos!.datos[0].codigo}). Podrás darte de baja cuando lo recojas.</Alert>
            )}
            <Button color="error" variant="outlined" disabled={!enTaller.datos || Boolean(enTaller.datos.datos.length)} onClick={() => { setConfirmacion(''); setBaja(true); }}>
              Darme de baja
            </Button>
          </CardContent>
        </Card>
      )}
      <Confirmar
        abierto={baja}
        titulo="¿Darte de baja?"
        textoConfirmar="Darme de baja"
        peligro
        ocupado={accBaja.ocupado}
        error={accBaja.error}
        deshabilitado={confirmacion !== 'DAR DE BAJA'}
        onCerrar={() => { setBaja(false); accBaja.limpiarError(); }}
        onConfirmar={async () => {
          const ok = await accBaja.ejecutar(() => api.post('/perfil/baja', { confirmacion, ...(motivo.trim() ? { motivo } : {}) }));
          if (ok) window.location.href = '/login?baja=1';
        }}
      >
        <Typography>Se cancelarán todas tus citas pendientes y no se recuperarán aunque vuelvas.</Typography>
        <TextField label="Motivo (opcional)" value={motivo} onChange={(e) => setMotivo(e.target.value)} inputProps={{ maxLength: 300 }} />
        <TextField label="Escribe DAR DE BAJA para confirmar" value={confirmacion} onChange={(e) => setConfirmacion(e.target.value.toUpperCase())} autoComplete="off" />
      </Confirmar>
    </>
  );
}
