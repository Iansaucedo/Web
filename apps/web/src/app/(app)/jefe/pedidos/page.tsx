'use client';
import { useState } from 'react';
import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import Stack from '@mui/material/Stack';
import Tab from '@mui/material/Tab';
import Tabs from '@mui/material/Tabs';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { Cabecera, Carga, Confirmar, Vacio, useDialogo } from '../../../../components/Comunes';
import { ChipEstado } from '../../../../components/ChipEstado';
import { api } from '../../../../lib/api';
import { useAccion, useDatos } from '../../../../lib/hooks';
import { ESTADO_PEDIDO, fechaHora } from '../../../../lib/formato';
import type { Lista, Pedido } from '../../../../lib/tipos';

const PESTANAS = [['PENDIENTE', 'Por aprobar'], ['APROBADO', 'Aprobados'], ['PEDIDO', 'Pedidos'], ['RECIBIDO', 'Recibidos'], ['RECHAZADO', 'Rechazados']];

export default function Pedidos() {
  const [estado, setEstado] = useState('PENDIENTE');
  const pedidos = useDatos<Lista<Pedido>>(`/pedidos?estado=${estado}`);
  const rechazar = useDialogo<Pedido>();
  const [motivo, setMotivo] = useState('');
  const acc = useAccion();
  const hacer = async (p: Pedido, accion: string, texto: string) => {
    await acc.ejecutar(() => api.post(`/pedidos/${p.id}/${accion}`), texto);
    void pedidos.recargar();
  };
  return (
    <>
      <Cabecera titulo="Pedidos de piezas" />
      <Tabs value={estado} onChange={(_, v) => setEstado(v)} variant="scrollable" sx={{ mb: 2 }}>
        {PESTANAS.map(([v, t]) => <Tab key={v} value={v} label={t} />)}
      </Tabs>
      {acc.error && !rechazar.abierto && <Alert severity="error" sx={{ mb: 2 }} onClose={acc.limpiarError}>{acc.error}</Alert>}
      <Carga {...pedidos}>
        {(d) =>
          d.datos.length ? (
            <Stack spacing={1.5}>
              {d.datos.map((p) => (
                <Card key={p.id} data-testid="pedido">
                  <CardContent sx={{ display: 'flex', gap: 2, flexWrap: 'wrap', alignItems: 'center' }}>
                    <Stack sx={{ flex: 1, minWidth: 240 }}>
                      <Typography sx={{ fontWeight: 500 }}>{p.cantidad} × {p.pieza ? `${p.pieza.nombre} (${p.pieza.referencia})` : p.descripcionLibre}</Typography>
                      <Typography variant="body2" color="text.secondary">{p.orden.codigo} · {p.orden.matricula} · {p.trabajo}</Typography>
                      <Typography variant="caption" color="text.secondary">Pedido por {p.mecanico} · {fechaHora(p.creadoEn)}</Typography>
                    </Stack>
                    <ChipEstado {...ESTADO_PEDIDO[p.estado]} />
                    <Stack direction="row" spacing={1}>
                      {p.estado === 'PENDIENTE' && <><Button variant="contained" disabled={acc.ocupado} onClick={() => hacer(p, 'aprobar', 'Pedido aprobado. Avisamos al mecánico')}>Aprobar</Button><Button color="error" onClick={() => { setMotivo(''); rechazar.abrir(p); }}>Rechazar</Button></>}
                      {p.estado === 'APROBADO' && <Button variant="tonal" disabled={acc.ocupado} onClick={() => hacer(p, 'pedido', 'Marcado como pedido al proveedor')}>Marcar pedido</Button>}
                      {(p.estado === 'APROBADO' || p.estado === 'PEDIDO') && <Button variant="contained" disabled={acc.ocupado} onClick={() => hacer(p, 'recibir', p.pieza ? 'Recibido. El stock se ha actualizado' : 'Recibido. Avisamos al mecánico')}>Recibido</Button>}
                    </Stack>
                  </CardContent>
                </Card>
              ))}
            </Stack>
          ) : (
            <Vacio titulo="No hay pedidos aquí" />
          )
        }
      </Carga>
      <Confirmar
        abierto={rechazar.abierto}
        titulo="Rechazar pedido"
        textoConfirmar="Rechazar"
        peligro
        ocupado={acc.ocupado}
        error={acc.error}
        deshabilitado={!motivo.trim()}
        onCerrar={() => { rechazar.cerrar(); acc.limpiarError(); }}
        onConfirmar={async () => {
          const ok = await acc.ejecutar(() => api.post(`/pedidos/${rechazar.valor!.id}/rechazar`, { motivo }), 'Pedido rechazado');
          if (ok) { rechazar.cerrar(); void pedidos.recargar(); }
        }}
      >
        <TextField label="Motivo (lo verá el mecánico)" required value={motivo} onChange={(e) => setMotivo(e.target.value)} />
      </Confirmar>
    </>
  );
}
