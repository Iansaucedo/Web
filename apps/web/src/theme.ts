// Tema de MUI alineado con el diseño de Figma (Material 3, paleta «Cyan LT»).
// MUI implementa Material 2 por defecto: aquí se ajustan colores, formas y
// tipografía para que los componentes se parezcan a las pantallas diseñadas.
import { createTheme } from '@mui/material/styles';

// Tokens de Figma (colección M3, modo Cyan LT).
export const m3 = {
  primary: '#01687D',
  onPrimary: '#FFFFFF',
  primaryContainer: '#9AE5FD',
  onPrimaryContainer: '#2F4B54',
  secondaryContainer: '#CEE7F0',
  onSecondaryContainer: '#344A52',
  error: '#B3261E',
  surface: '#F5FAFD',
  surfaceContainerLowest: '#FFFFFF',
  surfaceContainerLow: '#EFF4F7',
  surfaceContainer: '#EAEFF1',
  surfaceContainerHigh: '#E4E9EB',
  onSurface: '#171C1E',
  onSurfaceVariant: '#40484B',
  outline: '#70787C',
  outlineVariant: '#BFC8CC',
} as const;

// Colección local «Estados» de Figma: fondo y texto de cada tono de chip.
export const estados = {
  exito: { fondo: '#D7F2DE', texto: '#0E4F22' },
  aviso: { fondo: '#FFE8BF', texto: '#6A3D00' },
  error: { fondo: '#FFDAD6', texto: '#8C1D18' },
  info: { fondo: '#D4EBFA', texto: '#0B4A72' },
  neutro: { fondo: '#E6EBEE', texto: '#3D474C' },
} as const;

export type Tono = keyof typeof estados;

declare module '@mui/material/styles' {
  interface Palette {
    estados: typeof estados;
    m3: typeof m3;
  }
  interface PaletteOptions {
    estados?: typeof estados;
    m3?: typeof m3;
  }
}

export const theme = createTheme({
  palette: {
    mode: 'light',
    primary: { main: m3.primary, contrastText: m3.onPrimary },
    secondary: { main: m3.onSecondaryContainer, light: m3.secondaryContainer },
    error: { main: m3.error },
    success: { main: estados.exito.texto, light: estados.exito.fondo },
    warning: { main: estados.aviso.texto, light: estados.aviso.fondo },
    info: { main: estados.info.texto, light: estados.info.fondo },
    background: { default: m3.surface, paper: m3.surfaceContainerLowest },
    text: { primary: m3.onSurface, secondary: m3.onSurfaceVariant },
    divider: m3.outlineVariant,
    estados,
    m3,
  },
  shape: { borderRadius: 12 },
  typography: {
    fontFamily: 'Roboto, system-ui, sans-serif',
    // Escala M3 usada en Figma
    h4: { fontSize: 28, lineHeight: '36px', fontWeight: 400 }, // headline small
    h5: { fontSize: 22, lineHeight: '28px', fontWeight: 400 }, // title large
    h6: { fontSize: 16, lineHeight: '24px', fontWeight: 500 }, // title medium
    body1: { fontSize: 16, lineHeight: '24px' },
    body2: { fontSize: 14, lineHeight: '20px' },
    caption: { fontSize: 12, lineHeight: '16px' },
    button: { fontSize: 14, lineHeight: '20px', fontWeight: 500, textTransform: 'none' },
  },
  // Accesibilidad: la escala visual no decide el nivel del encabezado. Cada página tiene un h1
  // (Cabecera) y las secciones y tarjetas son h2/h3, sin saltos.
  // (`variantMapping` va en components.MuiTypography.)
  components: {
    MuiTypography: { defaultProps: { variantMapping: { h4: 'h2', h5: 'h2', h6: 'h2', subtitle1: 'p', subtitle2: 'p' } } },
    MuiCssBaseline: {
      styleOverrides: {
        // Foco de teclado siempre visible (WCAG 2.4.7 / 2.4.11), con contraste sobre cualquier fondo.
        ':focus-visible': { outline: `3px solid ${m3.primary}`, outlineOffset: 2 },
        '.MuiButtonBase-root.Mui-focusVisible': { outline: `3px solid ${m3.primary}`, outlineOffset: 2 },
        '@media (prefers-reduced-motion: reduce)': { '*, *::before, *::after': { animationDuration: '0.01ms !important', transitionDuration: '0.01ms !important' } },
      },
    },
    MuiButton: {
      defaultProps: { disableElevation: true },
      styleOverrides: {
        root: { borderRadius: 20, paddingInline: 16, minHeight: 40 },
        sizeLarge: { borderRadius: 28, minHeight: 56, fontSize: 16 }, // tablet del taller
        outlined: { borderColor: m3.outlineVariant },
      },
      variants: [
        // «tonal» de M3 (el botón secundario de las pantallas)
        {
          props: { variant: 'tonal' },
          style: { backgroundColor: m3.secondaryContainer, color: m3.onSecondaryContainer },
        },
      ],
    },
    MuiCard: {
      defaultProps: { variant: 'outlined' },
      styleOverrides: { root: { borderRadius: 12, borderColor: m3.outlineVariant } },
    },
    MuiPaper: { styleOverrides: { rounded: { borderRadius: 12 } } },
    MuiDialog: { styleOverrides: { paper: { borderRadius: 28, padding: 4 } } },
    MuiChip: { styleOverrides: { root: { borderRadius: 8, fontWeight: 500 } } },
    MuiTextField: { defaultProps: { variant: 'outlined', fullWidth: true } },
    MuiOutlinedInput: { styleOverrides: { root: { borderRadius: 4 } } },
    MuiListItemButton: {
      styleOverrides: {
        root: {
          borderRadius: 28,
          minHeight: 56,
          '&.Mui-selected': { backgroundColor: m3.secondaryContainer, color: m3.onSecondaryContainer },
        },
      },
    },
    MuiAppBar: {
      defaultProps: { elevation: 0, color: 'inherit' },
      styleOverrides: { root: { borderBottom: `1px solid ${m3.outlineVariant}` } },
    },
  },
});

declare module '@mui/material/Button' {
  interface ButtonPropsVariantOverrides {
    tonal: true;
  }
}
