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

// Tamaños en rem, no en px: así la app respeta el tamaño de letra que la persona elige en el navegador (baja visión).
// El interlineado va sin unidades para que crezca con la letra y las líneas no se monten.
const rem = (px: number) => `${px / 16}rem`;

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
    h4: { fontSize: rem(28), lineHeight: 36 / 28, fontWeight: 400 }, // headline small
    h5: { fontSize: rem(22), lineHeight: 28 / 22, fontWeight: 400 }, // title large
    h6: { fontSize: rem(16), lineHeight: 24 / 16, fontWeight: 500 }, // title medium
    body1: { fontSize: rem(16), lineHeight: 24 / 16 },
    body2: { fontSize: rem(14), lineHeight: 20 / 14 },
    caption: { fontSize: rem(12), lineHeight: 16 / 12 },
    button: { fontSize: rem(14), lineHeight: 20 / 14, fontWeight: 500, textTransform: 'none' },
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
        sizeLarge: { borderRadius: 28, minHeight: 56, fontSize: rem(16) }, // tablet del taller
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
    // Borde de los campos con contraste 3:1 como mínimo (WCAG 1.4.11): el gris por defecto de MUI se quedaba en 1,7:1
    // y con baja visión no se veía dónde estaba cada campo.
    MuiOutlinedInput: { styleOverrides: { root: { borderRadius: 4 }, notchedOutline: { borderColor: m3.outline } } },
    // Opción elegida de los grupos de botones (Gráfico/Tabla, Aceptar/Rechazar…): el gris al 8 % de MUI apenas
    // se distinguía (1,2:1). Ahora va rellena con el color del botón y texto blanco.
    MuiToggleButton: {
      styleOverrides: {
        root: ({ ownerState, theme: t }) => {
          const color = ownerState.color && ownerState.color !== 'standard' ? t.palette[ownerState.color].main : m3.primary;
          return { '&.Mui-selected, &.Mui-selected:hover': { backgroundColor: color, color: '#FFFFFF' } };
        },
      },
    },
    MuiListItemButton: {
      styleOverrides: {
        root: {
          borderRadius: 28,
          minHeight: 56,
          '&.Mui-selected': { backgroundColor: m3.secondaryContainer, color: m3.onSecondaryContainer },
          // El relleno de la entrada actual apenas contrasta con el menú (1,2:1): también va en negrita.
          '&.Mui-selected .MuiListItemText-primary': { fontWeight: 700 },
        },
      },
    },
    // Tablas en pantallas estrechas. El contenedor es el que desplaza en horizontal:
    // - `position: relative` para que lo posicionado en absoluto dentro (p. ej. los textos `visuallyHidden` de las
    //   cabeceras) se recorte con él. Si no, se colocaba respecto a la página y la ensanchaba (en /jefe/empresas,
    //   303 px de más en móvil).
    // - En móvil la tabla no baja de 560 px y sus celdas no parten el texto: cada fila queda en una línea y la
    //   tabla se desplaza dentro de su tarjeta, en vez de aplastar las columnas («lun, 9 nov» salía en tres líneas).
    MuiTableContainer: { styleOverrides: { root: { position: 'relative' } } },
    MuiTable: { styleOverrides: { root: { '@media (max-width:599.95px)': { minWidth: 560 } } } },
    MuiTableCell: { styleOverrides: { root: { '@media (max-width:599.95px)': { whiteSpace: 'nowrap' } } } },
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
