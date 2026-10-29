'use client';
import { useState } from 'react';
import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import Card from '@mui/material/Card';
import MenuItem from '@mui/material/MenuItem';
import Stack from '@mui/material/Stack';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableContainer from '@mui/material/TableContainer';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { Cabecera, Carga, Confirmar, useDialogo } from '../../../../components/Comunes';
import { ChipEstado } from '../../../../components/ChipEstado';
import { useSesion } from '../../../../components/Sesion';
import { api } from '../../../../lib/api';
import { useAccion, useDatos } from '../../../../lib/hooks';
import { ROL } from '../../../../lib/formato';
import type { Lista, Rol } from '../../../../lib/tipos';

interface UsuarioAdmin { id: string; email: string; nombre: string; rol: Rol; activo: boolean }

export default function Usuarios() {
  const { usuario } = useSesion();
  const [rol, setRol] = useState('');
  const [q, setQ] = useState('');
  const lista = useDatos<Lista<UsuarioAdmin>>(`/usuarios?${new URLSearchParams({ ...(rol ? { rol } : {}), ...(q ? { q } : {}) })}`);
  const baja = useDialogo<UsuarioAdmin>();
  const invitar = useDialogo();
  const [email, setEmail] = useState('');
  const acc = useAccion();
  return (
    <>
      <Cabecera titulo="Usuarios" acciones={<Button variant="contained" onClick={() => invitar.abrir(true)}>Invitar jefe de taller</Button>} />
      {acc.error && !baja.abierto && !invitar.abierto && <Alert severity="error" sx={{ mb: 2 }} onClose={acc.limpiarError}>{acc.error}</Alert>}
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} sx={{ mb: 2 }}>
        <TextField label="Buscar" value={q} onChange={(e) => setQ(e.target.value)} sx={{ maxWidth: 320 }} />
        <TextField select label="Rol" value={rol} onChange={(e) => setRol(e.target.value)} sx={{ maxWidth: 220 }}>
          <MenuItem value="">Todos</MenuItem>
          {Object.entries(ROL).map(([k, v]) => <MenuItem key={k} value={k}>{v}</MenuItem>)}
        </TextField>
      </Stack>
      <Carga {...lista}>
        {(d) => (
          <Card>
            <TableContainer>
              <Table>
                <TableHead><TableRow><TableCell>Nombre</TableCell><TableCell>Email</TableCell><TableCell>Rol</TableCell><TableCell>Estado</TableCell><TableCell /></TableRow></TableHead>
                <TableBody>
                  {d.datos.map((u) => (
                    <TableRow key={u.id}>
                      <TableCell>{u.nombre}</TableCell>
                      <TableCell>{u.email}</TableCell>
                      <TableCell>
                        {u.id === usuario.id || u.rol === 'CLIENTE' ? ROL[u.rol] : (
                          <TextField select size="small" label="Rol" value={u.rol} onChange={async (e) => { await acc.ejecutar(() => api.patch(`/usuarios/${u.id}`, { rol: e.target.value }), 'Rol cambiado'); void lista.recargar(); }} sx={{ minWidth: 170 }}>
                            <MenuItem value="MECANICO">Mecánico</MenuItem>
                            <MenuItem value="JEFE">Jefe de taller</MenuItem>
                            <MenuItem value="DUENO">Dueño</MenuItem>
                          </TextField>
                        )}
                      </TableCell>
                      <TableCell>{u.activo ? <ChipEstado tono="exito" texto="Activo" /> : <ChipEstado tono="neutro" texto="De baja" />}</TableCell>
                      <TableCell align="right">
                        {u.id !== usuario.id && (u.activo
                          ? <Button size="small" color="error" onClick={() => baja.abrir(u)}>Dar de baja</Button>
                          : <Button size="small" onClick={async () => { await acc.ejecutar(() => api.patch(`/usuarios/${u.id}`, { activo: true }), 'Usuario reactivado'); void lista.recargar(); }}>Reactivar</Button>)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          </Card>
        )}
      </Carga>
      <Confirmar abierto={baja.abierto} titulo="¿Dar de baja?" textoConfirmar="Dar de baja" peligro ocupado={acc.ocupado} error={acc.error} onCerrar={() => { baja.cerrar(); acc.limpiarError(); }}
        onConfirmar={async () => { const ok = await acc.ejecutar(() => api.patch(`/usuarios/${baja.valor!.id}`, { activo: false }), 'Usuario dado de baja'); if (ok) { baja.cerrar(); void lista.recargar(); } }}>
        <Typography>{baja.valor?.nombre} ({baja.valor?.email}) perderá el acceso al momento. Su historial se conserva.</Typography>
      </Confirmar>
      <Confirmar abierto={invitar.abierto} titulo="Invitar jefe de taller" textoConfirmar="Enviar invitación" ocupado={acc.ocupado} error={acc.error} deshabilitado={!email.includes('@')} onCerrar={() => { invitar.cerrar(); acc.limpiarError(); }}
        onConfirmar={async () => { const ok = await acc.ejecutar((clave) => api.post('/invitaciones', { email, rol: 'JEFE' }, { claveIdempotencia: clave }), 'Invitación enviada'); if (ok) { invitar.cerrar(); setEmail(''); } }}>
        <TextField label="Email de Google" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
      </Confirmar>
    </>
  );
}
