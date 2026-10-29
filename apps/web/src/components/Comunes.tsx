'use client';
// Piezas pequeñas que repiten todas las pantallas: cabecera, carga, error, vacío y confirmación.
import { useState, type ReactNode } from 'react';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import CircularProgress from '@mui/material/CircularProgress';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import type { ErrorApi } from '../lib/api';

export function Cabecera({ titulo, subtitulo, acciones }: { titulo: string; subtitulo?: ReactNode; acciones?: ReactNode }) {
  return (
    <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} sx={{ mb: 3, justifyContent: 'space-between', alignItems: { sm: 'center' } }}>
      <Box>
        <Typography variant="h4" component="h1">
          {titulo}
        </Typography>
        {subtitulo && (
          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
            {subtitulo}
          </Typography>
        )}
      </Box>
      {acciones && <Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap', gap: 1 }}>{acciones}</Stack>}
    </Stack>
  );
}

/** Carga / error / contenido. El error ofrece reintentar; nunca deja la pantalla en blanco. */
export function Carga<T>({ datos, error, recargar, children }: { datos: T | null; error: ErrorApi | null; recargar: () => void; children: (d: T) => ReactNode }) {
  if (error && !datos) {
    return (
      <Alert severity="error" action={<Button color="inherit" onClick={recargar}>Reintentar</Button>}>
        {error.message}
      </Alert>
    );
  }
  if (!datos) {
    return (
      <Box sx={{ display: 'grid', placeItems: 'center', py: 8 }} aria-busy="true">
        <CircularProgress aria-label="Cargando" />
      </Box>
    );
  }
  return <>{children(datos)}</>;
}

export function Vacio({ titulo, texto, accion }: { titulo: string; texto?: string; accion?: ReactNode }) {
  return (
    <Box sx={{ textAlign: 'center', py: 6, px: 2, border: 1, borderColor: 'divider', borderRadius: 3, borderStyle: 'dashed' }}>
      <Typography variant="h6">{titulo}</Typography>
      {texto && (
        <Typography variant="body2" color="text.secondary" sx={{ mt: 1, mb: accion ? 2 : 0 }}>
          {texto}
        </Typography>
      )}
      {accion}
    </Box>
  );
}

/** Diálogo de confirmación con estado de envío y error dentro del propio diálogo. */
export function Confirmar({
  abierto,
  titulo,
  children,
  textoConfirmar,
  peligro,
  ocupado,
  error,
  onCerrar,
  onConfirmar,
  deshabilitado,
}: {
  abierto: boolean;
  titulo: string;
  children?: ReactNode;
  textoConfirmar: string;
  peligro?: boolean;
  ocupado?: boolean;
  error?: string | null;
  onCerrar: () => void;
  onConfirmar: () => void;
  deshabilitado?: boolean;
}) {
  return (
    <Dialog open={abierto} onClose={ocupado ? undefined : onCerrar} fullWidth maxWidth="sm" aria-labelledby="titulo-dialogo">
      <DialogTitle id="titulo-dialogo">{titulo}</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ pt: 1 }}>
          {children}
          {error && <Alert severity="error">{error}</Alert>}
        </Stack>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button onClick={onCerrar} disabled={ocupado}>
          Volver
        </Button>
        <Button variant="contained" color={peligro ? 'error' : 'primary'} onClick={onConfirmar} disabled={ocupado || deshabilitado}>
          {ocupado ? 'Guardando…' : textoConfirmar}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

/** Estado simple para abrir un diálogo con un dato asociado. */
export function useDialogo<T = true>() {
  const [valor, setValor] = useState<T | null>(null);
  return { valor, abierto: valor !== null, abrir: (v: T) => setValor(v), cerrar: () => setValor(null) };
}

/** Miniaturas de las fotos de un trabajo; cada una abre la foto a tamaño completo. */
export function MiniaturasFotos({ fotos, trabajo, tamano = 72 }: { fotos: { id: string; url: string; descripcion: string | null }[]; trabajo: string; tamano?: number }) {
  if (!fotos.length) return null;
  return (
    <Stack direction="row" spacing={1} sx={{ mt: 1, flexWrap: 'wrap', gap: 1 }}>
      {fotos.map((f, i) => (
        <a key={f.id} href={f.url} target="_blank" rel="noreferrer noopener" aria-label={`Abrir foto ${i + 1} de «${trabajo}»`}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={f.url} alt={f.descripcion ?? `Foto ${i + 1} de «${trabajo}»`} width={tamano} height={tamano} loading="lazy" style={{ objectFit: 'cover', borderRadius: 8, display: 'block' }} />
        </a>
      ))}
    </Stack>
  );
}
