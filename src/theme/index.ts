/**
 * Typed access to the theme sheet defined in ./tokens.js.
 * Import from here in app code: `import { colors, spacing, gradients } from '@/theme';`
 * Tailwind classes (via tailwind.config.js) use the exact same values.
 *
 * Light theme later: components already only use semantic names; swap by
 * returning `themes.light` from `useThemeColors()` (plus NativeWind's
 * dark-variant strategy for className colors).
 */

type ThemeColors = Record<string, string>;

// eslint-disable-next-line @typescript-eslint/no-require-imports -- tokens.js must stay CJS so tailwind.config.js can require it too
const tokens = require('./tokens.js') as {
  themes: { dark: ThemeColors; light: ThemeColors };
  wc: Record<string, string>;
  gradients: Record<string, string[]>;
  colors: ThemeColors;
  colorsLight: ThemeColors;
  spacing: Record<string, number>;
  radii: Record<string, number>;
  typeScale: Record<string, [number, number]>;
  fontWeights: Record<string, string>;
  layout: { webMaxWidth: number };
};

export const themes = tokens.themes;
export const wc = tokens.wc;
export const gradients = tokens.gradients;
export const colors = tokens.colors; // = themes.dark (dark-first)
export const colorsLight = tokens.colorsLight;
export const spacing = tokens.spacing;
export const radii = tokens.radii;
export const typeScale = tokens.typeScale;
export const fontWeights = tokens.fontWeights;
export const layout = tokens.layout;

export type ThemeName = keyof typeof themes;
export type ColorToken = keyof typeof colors;
export type SpacingToken = keyof typeof spacing;
export type RadiusToken = keyof typeof radii;
export type GradientToken = keyof typeof gradients;

export function getTheme(name: ThemeName): ThemeColors {
  return themes[name];
}

/**
 * Runtime theme colors. The app is dark-first; when light mode lands, make
 * this read the user/system scheme — call sites won't change.
 */
export function useThemeColors(): ThemeColors {
  return themes.dark;
}
