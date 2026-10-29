'use client';
import { useState } from 'react';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import Grid from '@mui/material/Grid2';
import MenuItem from '@mui/material/MenuItem';
import Stack from '@mui/material/Stack';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableContainer from '@mui/material/TableContainer';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import TextField from '@mui/material/TextField';
import ToggleButton from '@mui/material/ToggleButton';
import Typography from '@mui/material/Typography';
import { visuallyHidden } from '@mui/utils';
import CalendarIcon from '@mui/icons-material/CalendarMonthOutlined';
import CheckIcon from '@mui/icons-material/Check';
import PhoneIcon from '@mui/icons-material/PhoneOutlined';
import { Cabecera, Carga, Confirmar, Vacio, useDialogo } from '../../../../components/Comunes';
import { ChipEstado } from '../../../../components/ChipEstado';
import { api } from '../../../../lib/api';
import { useAccion, useDatos } from '../../../../lib/hooks';
import { dia, hora, hoy, sumarDias } from '../../../../lib/formato';
import type { DiaDisponible, Lista, ReservaMultiple } from '../../../../lib/tipos';

const libres = (d: DiaDisponible) => Math.max(0, d.capacidad - d.ocupadas);
const enumerar = (xs: string[]) => (xs.length <= 1 ? (xs[0] ?? '') : `${xs.slice(0, -1).join(', ')} y ${xs.at(-1)}`);

function Cifra({ titulo, valor, detalle }: { titulo: string; valor: number; detalle: string }) {
  return (
    <Card>
      <CardContent>
        <Typography variant="body2" color="text.secondary">{titulo}</Typography>
        <Typography variant="h4" component="p" sx={{ my: 0.5 }}>{valor}</Typography>
        <Typography variant="caption" color="text.secondary">{detalle}</Typography>
      </CardContent>
    </Card>
  );
}

export default function Empresas() {
  const reservas = useDatos<Lista<ReservaMultiple>>('/reservas-multiples');
  const desde = sumarDias(hoy(), 1);
  const disp = useDatos<{ dias: DiaDisponible[] }>(`/disponibilidad?desde=${desde}&hasta=${sumarDias(desde, 30)}`);
  const ofrecer = useDialogo<ReservaMultiple>();
  const confirmar = useDialogo<ReservaMultiple>();
  const [fecha, setFecha] = useState('');
  const [franjas, setFranjas] = useState<string[]>([]);
  const acc = useAccion();

  const dias = disp.datos?.dias ?? [];
  /** Primer día preferido en el que caben todos los vehículos (lo que en Figma es «Hueco encontrado»). */
  const huecoPara = (r: ReservaMultiple) => dias.find((d) => r.fechasPreferidas.includes(d.fecha) && libres(d) >= r.vehiculos.length && d.franjas.filter((f) => f.libres > 0).length >= r.vehiculos.length);
  const elegirDia = (r: ReservaMultiple, f: string) => {
    setFecha(f);
    // Propone las primeras franjas libres; el jefe puede cambiarlas.
    setFranjas((dias.find((d) => d.fecha === f)?.franjas ?? []).filter((x) => x.libres > 0).slice(0, r.vehiculos.length).map((x) => x.hora));
  };
  const diaElegido = dias.find((d) => d.fecha === fecha);
  const n = ofrecer.valor?.vehiculos.length ?? 0;

  return (
    <>
      <Cabecera titulo="Empresas esperando hueco" subtitulo="Reservas múltiples pendientes. Cuando hay capacidad, el sistema propone un día; llama a la empresa y confirma." />
      <Carga {...reservas}>
        {(d) => {
          const espera = d.datos.filter((r) => r.estado === 'EN_ESPERA');
          const ofrecidas = d.datos.filter((r) => r.estado === 'HUECO_OFRECIDO');
          const mes = hoy().slice(0, 7);
          const convertidas = d.datos.filter((r) => r.estado === 'CONVERTIDA' && r.convertidaEn?.slice(0, 7) === mes);
          return (
            <Stack spacing={3}>
              <Grid container spacing={2}>
                <Grid size={{ xs: 12, sm: 4 }}><Cifra titulo="Solicitudes en espera" valor={espera.length} detalle={`${espera.reduce((s, r) => s + r.vehiculos.length, 0)} vehículos en total`} /></Grid>
                <Grid size={{ xs: 12, sm: 4 }}><Cifra titulo="Con hueco disponible" valor={espera.filter(huecoPara).length} detalle="Pendientes de llamar" /></Grid>
                <Grid size={{ xs: 12, sm: 4 }}><Cifra titulo="Convertidas este mes" valor={convertidas.length} detalle={`${convertidas.reduce((s, r) => s + r.vehiculos.length, 0)} citas creadas`} /></Grid>
              </Grid>

              {espera.length ? (
                <Card>
                  <TableContainer>
                    <Table aria-label="Empresas en espera">
                      <TableHead>
                        <TableRow><TableCell>Solicitud</TableCell><TableCell>Empresa</TableCell><TableCell>Vehículos</TableCell><TableCell>Fechas preferidas</TableCell><TableCell>Hueco encontrado</TableCell><TableCell>Teléfono</TableCell><TableCell><Box component="span" sx={visuallyHidden}>Acciones</Box></TableCell></TableRow>
                      </TableHead>
                      <TableBody>
                        {espera.map((r) => {
                          const h = huecoPara(r);
                          return (
                            <TableRow key={r.id} data-testid="reserva">
                              <TableCell>{r.codigo}</TableCell>
                              <TableCell>{r.cliente.nombre}</TableCell>
                              <TableCell>{r.vehiculos.length}</TableCell>
                              <TableCell>{r.fechasPreferidas.map(dia).join(' · ')}</TableCell>
                              <TableCell>{h ? <ChipEstado tono="exito" texto={`${dia(h.fecha)} · ${libres(h)} libres`} /> : <ChipEstado tono="neutro" texto="Sin hueco todavía" />}</TableCell>
                              <TableCell>{r.cliente.telefono}</TableCell>
                              <TableCell>
                                <Stack direction="row" spacing={1} sx={{ justifyContent: 'flex-end' }}>
                                  <Button variant="outlined" startIcon={<PhoneIcon />} href={`tel:${r.cliente.telefono}`} aria-label={`Llamar a ${r.cliente.nombre}`}>Llamar</Button>
                                  <Button variant="contained" startIcon={<CalendarIcon />} onClick={() => { acc.limpiarError(); elegirDia(r, h?.fecha ?? ''); ofrecer.abrir(r); }}>Ofrecer hueco</Button>
                                </Stack>
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </TableContainer>
                </Card>
              ) : (
                <Vacio titulo="Ninguna empresa está esperando" />
              )}

              {ofrecidas.length > 0 && (
                <Card>
                  <CardContent sx={{ pb: 0 }}><Typography variant="h6" component="h2">Ofrecidas · esperando respuesta</Typography></CardContent>
                  <TableContainer>
                    <Table aria-label="Ofrecidas, esperando respuesta">
                      <TableHead>
                        <TableRow><TableCell>Solicitud</TableCell><TableCell>Empresa</TableCell><TableCell>Vehículos</TableCell><TableCell>Hueco ofrecido</TableCell><TableCell>Estado</TableCell><TableCell><Box component="span" sx={visuallyHidden}>Acciones</Box></TableCell></TableRow>
                      </TableHead>
                      <TableBody>
                        {ofrecidas.map((r) => (
                          <TableRow key={r.id} data-testid="reserva-ofrecida">
                            <TableCell>{r.codigo}</TableCell>
                            <TableCell>{r.cliente.nombre}</TableCell>
                            <TableCell>{r.vehiculos.length}</TableCell>
                            <TableCell>{dia(r.fechaOfrecida!)} · {enumerar(r.franjasOfrecidas.map(hora))}</TableCell>
                            <TableCell><ChipEstado tono="aviso" texto="Esperando confirmación de la empresa" /></TableCell>
                            <TableCell align="right"><Button onClick={() => { acc.limpiarError(); confirmar.abrir(r); }}>Confirmar ya</Button></TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </TableContainer>
                </Card>
              )}
            </Stack>
          );
        }}
      </Carga>

      <Confirmar
        abierto={ofrecer.abierto}
        titulo={`Ofrecer hueco a ${ofrecer.valor?.cliente.nombre ?? ''}`}
        textoConfirmar="Enviar oferta"
        ocupado={acc.ocupado}
        error={acc.error}
        deshabilitado={!fecha || franjas.length !== n}
        onCerrar={() => { ofrecer.cerrar(); acc.limpiarError(); }}
        onConfirmar={async () => {
          const ok = await acc.ejecutar(() => api.post(`/reservas-multiples/${ofrecer.valor!.id}/ofrecer`, { fecha, franjas }), 'Hueco ofrecido. La empresa recibe un email');
          if (ok) { ofrecer.cerrar(); void reservas.recargar(); void disp.recargar(); }
        }}
      >
        {ofrecer.valor && <Typography variant="body2" color="text.secondary">{ofrecer.valor.codigo} · {n} vehículos · teléfono {ofrecer.valor.cliente.telefono}</Typography>}
        <TextField select label="Día" value={fecha} onChange={(e) => ofrecer.valor && elegirDia(ofrecer.valor, e.target.value)}>
          {dias.filter((x) => x.laborable).map((x) => (
            <MenuItem key={x.fecha} value={x.fecha} disabled={libres(x) < n}>
              {dia(x.fecha)} · {libres(x)} huecos libres{ofrecer.valor?.fechasPreferidas.includes(x.fecha) ? ' · preferido' : ''}
            </MenuItem>
          ))}
        </TextField>
        {diaElegido && (
          <Stack spacing={1}>
            <Typography variant="body2" id="franjas-entrega" sx={{ fontWeight: 500 }}>Franjas de entrega</Typography>
            <Typography variant="caption" color="text.secondary">Elige {n}, una por vehículo ({franjas.length} de {n}).</Typography>
            <Stack direction="row" role="group" aria-labelledby="franjas-entrega" sx={{ flexWrap: 'wrap', gap: 1 }}>
              {diaElegido.franjas.map((f) => {
                const sel = franjas.includes(f.hora);
                return (
                  <ToggleButton
                    key={f.hora}
                    value={f.hora}
                    size="small"
                    selected={sel}
                    disabled={!sel && (f.libres < 1 || franjas.length >= n)}
                    onChange={() => setFranjas(sel ? franjas.filter((x) => x !== f.hora) : [...franjas, f.hora].sort())}
                    aria-label={`${f.hora}${f.libres < 1 ? ', llena' : ''}`}
                    sx={{ px: 1.5, borderRadius: 2 }}
                  >
                    {sel && <CheckIcon fontSize="small" sx={{ mr: 0.5 }} />}{f.hora}
                  </ToggleButton>
                );
              })}
            </Stack>
          </Stack>
        )}
        <Alert severity="info" icon={<PhoneIcon />}>Se enviará un email y un aviso en la web. Si llamas por teléfono y aceptan, pulsa «Confirmar ya» en la lista.</Alert>
      </Confirmar>

      <Confirmar
        abierto={confirmar.abierto}
        titulo="¿La empresa ha aceptado por teléfono?"
        textoConfirmar="Confirmar ya"
        ocupado={acc.ocupado}
        error={acc.error}
        onCerrar={() => { confirmar.cerrar(); acc.limpiarError(); }}
        onConfirmar={async () => {
          const ok = await acc.ejecutar(() => api.post(`/reservas-multiples/${confirmar.valor!.id}/aceptar`), 'Citas creadas. La empresa recibe la confirmación por email');
          if (ok) { confirmar.cerrar(); void reservas.recargar(); void disp.recargar(); }
        }}
      >
        {confirmar.valor && (
          <Typography>
            Se crean {confirmar.valor.vehiculos.length} citas confirmadas para {confirmar.valor.cliente.nombre} el {dia(confirmar.valor.fechaOfrecida!)} a las {enumerar(confirmar.valor.franjasOfrecidas.map(hora))}.
          </Typography>
        )}
      </Confirmar>
    </>
  );
}
