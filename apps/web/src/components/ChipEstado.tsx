// Equivalente en código del componente «Chip de estado» de Figma:
// cada tono lleva color e icono, para que el estado se entienda sin depender del color.
import Chip from '@mui/material/Chip';
import CheckIcon from '@mui/icons-material/Check';
import WarningIcon from '@mui/icons-material/Warning';
import CancelIcon from '@mui/icons-material/Cancel';
import InfoIcon from '@mui/icons-material/Info';
import ScheduleIcon from '@mui/icons-material/Schedule';
import { estados, type Tono } from '../theme';

const ICONO: Record<Tono, typeof CheckIcon> = {
  exito: CheckIcon,
  aviso: WarningIcon,
  error: CancelIcon,
  info: InfoIcon,
  neutro: ScheduleIcon,
};

export function ChipEstado({ tono, texto }: { tono: Tono; texto: string }) {
  const Icono = ICONO[tono];
  const { fondo, texto: color } = estados[tono];
  return (
    <Chip
      size="small"
      label={texto}
      icon={<Icono sx={{ fontSize: 16, color: `${color} !important` }} />}
      sx={{ bgcolor: fondo, color }}
    />
  );
}
