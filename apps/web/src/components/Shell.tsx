'use client';
import { useEffect, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import AppBar from '@mui/material/AppBar';
import Badge from '@mui/material/Badge';
import Box from '@mui/material/Box';
import Divider from '@mui/material/Divider';
import Drawer from '@mui/material/Drawer';
import IconButton from '@mui/material/IconButton';
import List from '@mui/material/List';
import ListItem from '@mui/material/ListItem';
import ListItemButton from '@mui/material/ListItemButton';
import ListItemIcon from '@mui/material/ListItemIcon';
import ListItemText from '@mui/material/ListItemText';
import ListSubheader from '@mui/material/ListSubheader';
import Menu from '@mui/material/Menu';
import MenuItem from '@mui/material/MenuItem';
import Popover from '@mui/material/Popover';
import Toolbar from '@mui/material/Toolbar';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import Button from '@mui/material/Button';
import useMediaQuery from '@mui/material/useMediaQuery';
import MenuIcon from '@mui/icons-material/Menu';
import NotificationsIcon from '@mui/icons-material/NotificationsOutlined';
import BuildIcon from '@mui/icons-material/Build';
import HomeIcon from '@mui/icons-material/HomeOutlined';
import EventIcon from '@mui/icons-material/EventOutlined';
import CarIcon from '@mui/icons-material/DirectionsCarOutlined';
import TruckIcon from '@mui/icons-material/LocalShippingOutlined';
import ScheduleIcon from '@mui/icons-material/ScheduleOutlined';
import DashboardIcon from '@mui/icons-material/DashboardOutlined';
import InventoryIcon from '@mui/icons-material/Inventory2Outlined';
import GroupIcon from '@mui/icons-material/GroupOutlined';
import ChartIcon from '@mui/icons-material/InsertChartOutlined';
import SettingsIcon from '@mui/icons-material/SettingsOutlined';
import HistoryIcon from '@mui/icons-material/HistoryOutlined';
import ListIcon from '@mui/icons-material/ListAltOutlined';
import PhoneIcon from '@mui/icons-material/PhoneOutlined';
import PersonIcon from '@mui/icons-material/PersonOutlined';
import TimelineIcon from '@mui/icons-material/TimelineOutlined';
import LogoutIcon from '@mui/icons-material/LogoutOutlined';
import Avatar from '@mui/material/Avatar';
import { useSesion } from './Sesion';
import { api } from '../lib/api';
import { useDatos } from '../lib/hooks';
import { fechaHora, ROL } from '../lib/formato';
import type { Lista, Notificacion, Rol } from '../lib/tipos';

type Entrada = { texto: string; ruta: string; icono: typeof HomeIcon };
type Grupo = { titulo?: string; entradas: Entrada[] };

// Grupos y nombres tal como están en Figma («Menú lateral / <rol>» en Componentes).
function menu(rol: Rol, empresa: boolean): Grupo[] {
  const taller: Entrada[] = [
    { texto: 'Órdenes', ruta: '/jefe/ordenes', icono: BuildIcon },
    { texto: 'Pedidos de piezas', ruta: '/jefe/pedidos', icono: TruckIcon },
    { texto: 'Catálogo de piezas', ruta: '/jefe/piezas', icono: InventoryIcon },
    { texto: 'Empresas en espera', ruta: '/jefe/empresas', icono: PhoneIcon },
  ];
  const personal: Grupo = {
    titulo: 'Personal',
    entradas: [
      { texto: 'Mecánicos y puestos', ruta: '/jefe/personal', icono: GroupIcon },
      { texto: 'Jornadas del equipo', ruta: '/jefe/jornadas', icono: ScheduleIcon },
    ],
  };
  switch (rol) {
    case 'CLIENTE':
      return [
        {
          entradas: [
            { texto: 'Mis órdenes', ruta: '/ordenes', icono: DashboardIcon },
            { texto: 'Reservar cita', ruta: '/reservar', icono: EventIcon },
            { texto: 'Mis vehículos', ruta: '/vehiculos', icono: CarIcon },
            ...(empresa ? [{ texto: 'Reserva múltiple', ruta: '/reservas', icono: GroupIcon }] : []),
            { texto: 'Notificaciones', ruta: '/notificaciones', icono: NotificationsIcon },
            { texto: 'Mi perfil', ruta: '/perfil', icono: PersonIcon },
          ],
        },
      ];
    case 'MECANICO':
      return [
        {
          titulo: 'Hoy',
          entradas: [
            { texto: 'Mis órdenes de hoy', ruta: '/mecanico', icono: BuildIcon },
            { texto: 'Mi jornada', ruta: '/mecanico/jornada', icono: HistoryIcon },
          ],
        },
        {
          titulo: 'Consulta',
          entradas: [
            { texto: 'Historial', ruta: '/mecanico/historial', icono: TimelineIcon },
            { texto: 'Catálogo de piezas', ruta: '/mecanico/piezas', icono: InventoryIcon },
            { texto: 'Notificaciones', ruta: '/notificaciones', icono: NotificationsIcon },
          ],
        },
      ];
    case 'JEFE':
      return [
        {
          titulo: 'Hoy',
          entradas: [
            { texto: 'Panel del taller', ruta: '/jefe', icono: DashboardIcon },
            { texto: 'Mi jornada', ruta: '/mecanico/jornada', icono: HistoryIcon },
            { texto: 'Citas y recepción', ruta: '/jefe/citas', icono: EventIcon },
          ],
        },
        { titulo: 'Taller', entradas: taller },
        personal,
      ];
    case 'DUENO':
      return [
        {
          titulo: 'Negocio',
          entradas: [
            { texto: 'Estadísticas', ruta: '/dueno', icono: ChartIcon },
            { texto: 'Trazabilidad', ruta: '/dueno/trazabilidad', icono: HistoryIcon },
            { texto: 'Usuarios y jefes', ruta: '/dueno/usuarios', icono: GroupIcon },
            { texto: 'Configuración', ruta: '/dueno/configuracion', icono: SettingsIcon },
            { texto: 'Constancias de borrado', ruta: '/dueno/constancias', icono: ListIcon },
          ],
        },
        {
          titulo: 'Taller',
          entradas: [
            { texto: 'Panel del taller', ruta: '/jefe', icono: DashboardIcon },
            { texto: 'Citas y recepción', ruta: '/jefe/citas', icono: EventIcon },
            ...taller,
          ],
        },
        personal,
      ];
  }
}

/** Título de la barra superior para rutas que no están en el menú (detalle de una orden, etc.). */
function tituloDe(ruta: string, activa?: Entrada) {
  if (/^\/(mecanico\/)?ordenes\/[^/]+$/.test(ruta)) return 'Orden';
  return activa?.texto ?? 'TallerPro';
}

const iniciales = (nombre: string) =>
  nombre
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join('');

const ANCHO = 280;

function Campana() {
  const [ancla, setAncla] = useState<HTMLElement | null>(null);
  const { datos, recargar } = useDatos<Lista<Notificacion> & { noLeidas: number }>('/notificaciones');
  const router = useRouter();
  // Sin WebSockets (requisito): los avisos se consultan cada minuto mientras la pestaña está visible.
  useEffect(() => {
    const t = setInterval(() => {
      if (document.visibilityState === 'visible') void recargar();
    }, 60_000);
    return () => clearInterval(t);
  }, [recargar]);
  const abrir = async (n: Notificacion) => {
    setAncla(null);
    if (!n.leida) await api.post(`/notificaciones/${n.id}/leer`).catch(() => undefined);
    void recargar();
    if (n.enlace) router.push(n.enlace);
  };
  return (
    <>
      <Tooltip title="Avisos">
        <IconButton
          aria-label={`Avisos${datos?.noLeidas ? `: ${datos.noLeidas} sin leer` : ''}`}
          onClick={(e) => {
            setAncla(e.currentTarget);
            void recargar();
          }}
        >
          <Badge badgeContent={datos?.noLeidas ? <span aria-hidden="true">{datos.noLeidas}</span> : undefined} color="error">
            <NotificationsIcon />
          </Badge>
        </IconButton>
      </Tooltip>
      <Popover open={Boolean(ancla)} anchorEl={ancla} onClose={() => setAncla(null)} anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }} transformOrigin={{ vertical: 'top', horizontal: 'right' }}>
        <Box sx={{ width: { xs: 320, sm: 380 }, maxHeight: 480, overflow: 'auto' }}>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', px: 2, py: 1.5 }}>
            <Typography variant="h6">Avisos</Typography>
            {Boolean(datos?.noLeidas) && (
              <Button size="small" onClick={async () => { await api.post('/notificaciones/leer-todas'); void recargar(); }}>
                Marcar todo como leído
              </Button>
            )}
          </Box>
          <Divider />
          {!datos?.datos.length && <Typography sx={{ p: 2 }} color="text.secondary">No tienes avisos.</Typography>}
          <List dense disablePadding>
            {datos?.datos.map((n) => (
              <ListItem key={n.id} disablePadding>
                <ListItemButton onClick={() => abrir(n)} sx={{ borderRadius: 0, alignItems: 'flex-start', bgcolor: n.leida ? undefined : 'action.hover' }}>
                  <ListItemText primary={n.leida ? n.mensaje : `${n.mensaje} (sin leer)`} secondary={fechaHora(n.creadaEn)} primaryTypographyProps={{ fontWeight: n.leida ? 400 : 500 }} />
                </ListItemButton>
              </ListItem>
            ))}
          </List>
        </Box>
      </Popover>
    </>
  );
}

/** Zonas de la web de cada rol. El servidor ya lo impide (403); esto evita pantallas llenas de errores. */
const ZONAS: Record<Rol, string[]> = {
  CLIENTE: ['/ordenes', '/citas', '/reservar', '/vehiculos', '/reservas', '/perfil', '/notificaciones'],
  MECANICO: ['/mecanico', '/notificaciones'],
  JEFE: ['/jefe', '/mecanico', '/notificaciones'],
  DUENO: ['/dueno', '/jefe', '/mecanico', '/notificaciones'],
};
export const puedeVer = (rol: Rol, ruta: string) => ruta === '/' || ZONAS[rol].some((z) => ruta === z || ruta.startsWith(`${z}/`));

function SinAcceso({ rol }: { rol: Rol }) {
  return (
    <Box sx={{ textAlign: 'center', py: 8 }}>
      <Typography variant="h4" component="h1">No tienes acceso</Typography>
      <Typography color="text.secondary" sx={{ mt: 1, mb: 3 }}>Esta página no es para tu tipo de cuenta.</Typography>
      <Button variant="contained" component={Link} href={rutaInicio(rol)}>Ir a mi inicio</Button>
    </Box>
  );
}

export function Shell({ children }: { children: ReactNode }) {
  const { usuario } = useSesion();
  const ruta = usePathname();
  const movil = useMediaQuery('(max-width:899px)');
  const [abierto, setAbierto] = useState(false);
  const [menuUsuario, setMenuUsuario] = useState<HTMLElement | null>(null);
  const grupos = menu(usuario.rol, usuario.cliente?.tipo === 'EMPRESA');
  const todas = grupos.flatMap((g) => g.entradas);
  const activa = todas.filter((e) => ruta === e.ruta || ruta.startsWith(`${e.ruta}/`)).sort((a, b) => b.ruta.length - a.ruta.length)[0];

  const salir = async () => {
    await api.post('/auth/logout').catch(() => undefined);
    window.location.href = '/login';
  };

  const navegacion = (
    <Box component="nav" aria-label="Menú principal" sx={{ p: 1.5, pt: 0 }}>
      {grupos.map((g, i) => (
        <List key={i} subheader={g.titulo ? <ListSubheader sx={{ bgcolor: 'transparent' }}>{g.titulo}</ListSubheader> : undefined}>
          {g.entradas.map((e) => (
            <ListItem key={e.ruta} disablePadding>
              <ListItemButton component={Link} href={e.ruta} selected={activa?.ruta === e.ruta} aria-current={activa?.ruta === e.ruta ? 'page' : undefined} onClick={() => setAbierto(false)}>
                <ListItemIcon sx={{ minWidth: 40 }}>
                  <e.icono />
                </ListItemIcon>
                <ListItemText primary={e.texto} />
              </ListItemButton>
            </ListItem>
          ))}
        </List>
      ))}
    </Box>
  );

  // Como en Figma: la marca arriba del menú lateral y «Cerrar sesión» abajo del todo.
  const lateral = (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <Box component={Link} href="/" sx={{ display: 'flex', alignItems: 'center', gap: 1.5, px: 3, py: 2.5, color: 'text.primary', textDecoration: 'none' }}>
        <Box sx={{ width: 40, height: 40, borderRadius: 2, bgcolor: 'primary.main', color: 'primary.contrastText', display: 'grid', placeItems: 'center' }} aria-hidden="true">
          <BuildIcon />
        </Box>
        <Box>
          <Typography variant="h6" component="span" sx={{ display: 'block', lineHeight: 1.2 }}>TallerPro</Typography>
          <Typography variant="caption" color="text.secondary">{ROL[usuario.rol]}</Typography>
        </Box>
      </Box>
      <Box sx={{ flex: 1, overflowY: 'auto' }}>{navegacion}</Box>
      <List sx={{ p: 1.5 }}>
        <ListItem disablePadding>
          <ListItemButton onClick={salir}>
            <ListItemIcon sx={{ minWidth: 40 }}><LogoutIcon /></ListItemIcon>
            <ListItemText primary="Cerrar sesión" />
          </ListItemButton>
        </ListItem>
      </List>
    </Box>
  );
  const nombre = usuario.cliente?.razonSocial ?? usuario.nombre;

  return (
    <Box sx={{ display: 'flex', minHeight: '100vh', bgcolor: 'background.default' }}>
      <Box
        component="a"
        href="#contenido"
        sx={{ position: 'absolute', left: 8, top: -48, zIndex: (t) => t.zIndex.tooltip, bgcolor: 'primary.main', color: 'primary.contrastText', px: 2, py: 1, borderRadius: 2, '&:focus': { top: 8 } }}
      >
        Saltar al contenido
      </Box>
      <AppBar position="fixed" sx={{ width: { md: `calc(100% - ${ANCHO}px)` }, ml: { md: `${ANCHO}px` }, bgcolor: 'background.paper' }}>
        <Toolbar sx={{ gap: 1 }}>
          {movil && (
            <IconButton aria-label="Abrir menú" onClick={() => setAbierto(true)} edge="start">
              <MenuIcon />
            </IconButton>
          )}
          <Typography variant="h6" component="p" noWrap sx={{ flexGrow: 1, color: 'text.primary' }} data-testid="titulo-barra">
            {tituloDe(ruta, activa)}
          </Typography>
          <Campana />
          <IconButton onClick={(e) => setMenuUsuario(e.currentTarget)} aria-haspopup="menu" aria-expanded={Boolean(menuUsuario)} aria-label={`${iniciales(nombre)}: menú de ${nombre}`}>
            <Avatar sx={{ width: 32, height: 32, fontSize: 14, bgcolor: 'secondary.light', color: 'secondary.main' }}>{iniciales(nombre)}</Avatar>
          </IconButton>
          <Menu anchorEl={menuUsuario} open={Boolean(menuUsuario)} onClose={() => setMenuUsuario(null)}>
            <MenuItem disabled sx={{ opacity: '1 !important' }}>
              <ListItemText primary={nombre} secondary={ROL[usuario.rol]} />
            </MenuItem>
            {usuario.rol === 'CLIENTE' && (
              <MenuItem component={Link} href="/perfil" onClick={() => setMenuUsuario(null)}>
                Mi perfil
              </MenuItem>
            )}
            <MenuItem onClick={salir}>Cerrar sesión</MenuItem>
          </Menu>
        </Toolbar>
      </AppBar>
      <Drawer
        variant={movil ? 'temporary' : 'permanent'}
        open={movil ? abierto : true}
        onClose={() => setAbierto(false)}
        sx={{ width: ANCHO, flexShrink: 0, '& .MuiDrawer-paper': { width: ANCHO, boxSizing: 'border-box', borderRight: 0, bgcolor: 'background.default' } }}
      >
        {lateral}
      </Drawer>
      <Box component="main" id="contenido" tabIndex={-1} sx={{ flexGrow: 1, minWidth: 0, p: { xs: 2, md: 4 }, maxWidth: 1280, '&:focus': { outline: 'none' } }}>
        <Toolbar />
        {puedeVer(usuario.rol, ruta) ? children : <SinAcceso rol={usuario.rol} />}
      </Box>
    </Box>
  );
}

export function rutaInicio(rol: Rol) {
  return { CLIENTE: '/ordenes', MECANICO: '/mecanico', JEFE: '/jefe', DUENO: '/dueno' }[rol];
}
