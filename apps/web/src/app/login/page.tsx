'use client';
import { Suspense, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import Divider from '@mui/material/Divider';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import BuildIcon from '@mui/icons-material/Build';
import LoginIcon from '@mui/icons-material/Login';
import EventIcon from '@mui/icons-material/EventOutlined';
import CheckIcon from '@mui/icons-material/CheckCircleOutline';
import TimelineIcon from '@mui/icons-material/Timeline';
import PdfIcon from '@mui/icons-material/PictureAsPdfOutlined';
import { api, mensajeError } from '../../lib/api';

// Pantalla «Acceso · Login» de Figma: panel de marca a la izquierda (solo en pantallas anchas) y tarjeta de acceso.
const ERRORES: Record<string, string> = {
  CUENTA_DESACTIVADA: 'Tu cuenta está dada de baja. Habla con el taller.',
  SIN_EMAIL: 'Google no nos ha dado un email verificado.',
  GOOGLE: 'No se ha podido entrar con Google. Inténtalo de nuevo.',
};
const VENTAJAS = [
  [EventIcon, 'Reserva cita en la franja que te venga bien'],
  [CheckIcon, 'Autoriza cada reparación antes de que la hagamos'],
  [TimelineIcon, 'Sigue en tiempo real lo que hace el mecánico'],
  [PdfIcon, 'Descarga el resumen con piezas, horas e importe'],
] as const;

function Login() {
  const params = useSearchParams();
  const error = params.get('error');
  const volver = params.get('volver');
  const destino = volver && volver.startsWith('/') && !volver.startsWith('//') ? volver : '/';
  const [email, setEmail] = useState('');
  const [fallo, setFallo] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const pruebas = process.env.NEXT_PUBLIC_ACCESO_PRUEBAS === '1';

  const entrarPruebas = async (e: React.FormEvent) => {
    e.preventDefault();
    setOcupado(true);
    try {
      await api.post('/auth/test-login', { email });
      window.location.href = destino;
    } catch (err) {
      setFallo(mensajeError(err));
      setOcupado(false);
    }
  };

  return (
    <Box component="main" sx={{ minHeight: '100vh', display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' } }}>
      <Box sx={{ bgcolor: 'primary.main', color: 'primary.contrastText', p: { xs: 3, md: 8 }, display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 3 }}>
        <Stack direction="row" spacing={1.5} sx={{ alignItems: 'center' }}>
          <Box sx={{ bgcolor: 'primary.light', color: 'primary.main', borderRadius: 2, p: 1, display: 'grid' }}><BuildIcon /></Box>
          <Typography variant="h5" component="p" sx={{ fontWeight: 500 }}>TallerPro</Typography>
        </Stack>
        <Typography variant="h5" component="p">Tu coche, en buenas manos. Y siempre sabrás qué le estamos haciendo.</Typography>
        <Stack component="ul" spacing={1.5} sx={{ listStyle: 'none', p: 0, m: 0, display: { xs: 'none', md: 'flex' } }}>
          {VENTAJAS.map(([Icono, texto]) => (
            <Stack component="li" key={texto} direction="row" spacing={1.5} sx={{ alignItems: 'center' }}>
              <Icono fontSize="small" aria-hidden />
              <Typography variant="body2">{texto}</Typography>
            </Stack>
          ))}
        </Stack>
      </Box>
      <Box sx={{ display: 'grid', placeItems: 'center', p: 2, bgcolor: 'background.default' }}>
        <Card sx={{ width: '100%', maxWidth: 420 }}>
          <CardContent sx={{ p: 4 }}>
            <Stack spacing={2.5}>
              <Typography variant="h5" component="h1">Entrar</Typography>
              <Typography variant="body2" color="text.secondary">Usa tu cuenta de Google. Si es tu primera vez, crearemos tu cuenta de cliente.</Typography>
              {error && <Alert severity="error">{ERRORES[error] ?? ERRORES.GOOGLE}</Alert>}
              {params.get('baja') === '1' && <Alert severity="info">Has dado de baja tu cuenta. Si cambias de idea, entra de nuevo en los próximos 14 días y podrás recuperarla.</Alert>}
              <Button variant="outlined" size="large" startIcon={<LoginIcon />} href="/api/auth/google" sx={{ alignSelf: 'center' }}>
                Continuar con Google
              </Button>
              <Divider />
              <Typography variant="caption" color="text.secondary">
                ¿Eres mecánico o jefe de taller? Entra con el email con el que te dieron de alta; tu rol se asigna automáticamente.
              </Typography>
              {pruebas && (
                <Box component="form" onSubmit={entrarPruebas}>
                  <Divider sx={{ mb: 2 }}>Solo entorno de pruebas</Divider>
                  <Stack spacing={1.5}>
                    <TextField label="Email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
                    {fallo && <Alert severity="error">{fallo}</Alert>}
                    <Button type="submit" variant="tonal" disabled={ocupado}>Entrar sin Google</Button>
                  </Stack>
                </Box>
              )}
            </Stack>
          </CardContent>
        </Card>
      </Box>
    </Box>
  );
}

export default function PaginaLogin() {
  return (
    <Suspense>
      <Login />
    </Suspense>
  );
}
