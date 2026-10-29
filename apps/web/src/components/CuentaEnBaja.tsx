'use client';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import BuildIcon from '@mui/icons-material/Build';
import { api } from '../lib/api';
import { useAccion } from '../lib/hooks';
import { fechaHora } from '../lib/formato';

/** Única pantalla disponible para un cliente que se dio de baja y aún está en plazo de recuperar la cuenta. */
export function CuentaEnBaja({ hasta, onRecuperada }: { hasta: string; onRecuperada: () => Promise<void> }) {
  const acc = useAccion();
  const salir = async () => {
    await api.post('/auth/logout').catch(() => undefined);
    window.location.href = '/login';
  };
  return (
    <Box component="main" sx={{ minHeight: '100vh', display: 'grid', placeItems: 'center', bgcolor: 'background.default', p: 2 }}>
      <Card sx={{ width: '100%', maxWidth: 480 }}>
        <CardContent sx={{ p: 4 }}>
          <Stack spacing={2.5}>
            <BuildIcon color="primary" sx={{ fontSize: 40 }} />
            <Typography variant="h4" component="h1">Tu cuenta está dada de baja</Typography>
            <Typography color="text.secondary">
              Puedes recuperarla hasta el <strong>{fechaHora(hasta)}</strong>. Después la desvincularemos de tu cuenta de Google.
            </Typography>
            <Alert severity="info">Las citas que tenías se cancelaron al darte de baja. Si recuperas la cuenta, tendrás que reservar de nuevo.</Alert>
            {acc.error && <Alert severity="error">{acc.error}</Alert>}
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5}>
              <Button
                variant="contained"
                size="large"
                disabled={acc.ocupado}
                onClick={async () => {
                  const ok = await acc.ejecutar(() => api.post('/perfil/reactivar'), 'Cuenta recuperada. ¡Bienvenido de nuevo!');
                  if (ok) await onRecuperada();
                }}
              >
                Recuperar mi cuenta
              </Button>
              <Button size="large" onClick={salir}>Cerrar sesión</Button>
            </Stack>
          </Stack>
        </CardContent>
      </Card>
    </Box>
  );
}
