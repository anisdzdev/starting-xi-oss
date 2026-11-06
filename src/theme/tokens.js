/**
 * Design tokens — single source of truth (THEME SHEET).
 *
 * Plain CommonJS so it can be consumed by BOTH:
 *  - tailwind.config.js (Node, at build time)
 *  - src/theme/index.ts (typed re-export for runtime use)
 *
 * Structure: `themes.dark` / `themes.light` hold every SEMANTIC color the app
 * uses. Components only ever reference semantic names (bg, surface, primary…),
 * so a light theme later means filling in `themes.light` and switching the
 * NativeWind strategy — no component changes.
 *
 * Palette direction: FIFA World Cup 26 brand energy — deep navy pitch-night
 * base, pitch-green primary, and the WC26 accent set (electric purple, royal
 * blue, cyan, lime, hot pink, red) for gradients, highlights and data viz.
 */

/** Raw WC26-inspired accent palette (theme-independent, used for accents/gradients/viz). */
const wc = {
  purple: '#6A2FE0',
  blue: '#2D5BFF',
  royal: '#1F2EB8',
  cyan: '#3EE6D8',
  lime: '#B9E84A',
  green: '#34D399',
  pink: '#ED4C8B',
  red: '#F03A3A',
  orange: '#FF6A3D',
  gold: '#F5C543',
};

const dark = {
  // Surfaces
  bg: '#0A0E16', // pitch-night navy, app background
  surface: '#121829', // cards, sheets
  surfaceRaised: '#1A2238', // elevated cards, modals
  surfaceGlass: 'rgba(26, 34, 56, 0.62)', // glass cards
  border: '#26304A', // hairlines, dividers
  borderGlass: 'rgba(124, 140, 178, 0.22)',
  overlay: 'rgba(4, 7, 14, 0.74)', // scrims behind modals/sheets

  // Text
  text: '#F4F6FB',
  textMuted: '#93A0BC',
  textFaint: '#5A6781',

  // Brand
  primary: wc.green, // pitch green — main actions
  primaryPressed: '#10B981',
  onPrimary: '#06251A',
  accent: wc.purple, // WC26 electric purple — highlights

  // WC26 accent set (same in both themes; semantic aliases below shift)
  accentPurple: wc.purple,
  accentBlue: wc.blue,
  accentCyan: wc.cyan,
  accentLime: wc.lime,
  accentPink: wc.pink,
  accentOrange: wc.orange,
  accentGold: wc.gold,

  // Semantic
  success: wc.green,
  warning: wc.gold,
  danger: wc.red,
  dangerPressed: '#D32B2B',
  onDanger: '#2B0707',
  info: wc.blue,

  // Fantasy-specific
  live: wc.red,
  captain: wc.gold,
  rankUp: wc.green,
  rankDown: wc.red,

  // Skeleton shimmer
  skeletonBase: '#1A2238',
  skeletonHighlight: '#26304A',
};

const light = {
  bg: '#F6F8FC',
  surface: '#FFFFFF',
  surfaceRaised: '#FFFFFF',
  surfaceGlass: 'rgba(255, 255, 255, 0.7)',
  border: '#E1E7F2',
  borderGlass: 'rgba(31, 46, 90, 0.14)',
  overlay: 'rgba(15, 23, 42, 0.45)',

  text: '#0E1424',
  textMuted: '#4A5874',
  textFaint: '#93A0BC',

  primary: '#0FA968',
  primaryPressed: '#0B8A55',
  onPrimary: '#FFFFFF',
  accent: wc.purple,

  accentPurple: wc.purple,
  accentBlue: wc.blue,
  accentCyan: '#14B8AA',
  accentLime: '#84B520',
  accentPink: wc.pink,
  accentOrange: wc.orange,
  accentGold: '#D19F1A',

  success: '#0FA968',
  warning: '#D19F1A',
  danger: wc.red,
  dangerPressed: '#D32B2B',
  onDanger: '#FFFFFF',
  info: wc.blue,

  live: wc.red,
  captain: '#D19F1A',
  rankUp: '#0FA968',
  rankDown: wc.red,

  skeletonBase: '#E1E7F2',
  skeletonHighlight: '#F0F4FA',
};

const themes = { dark, light };

/** Gradient pairs/triples for Screen glows, hero cards, live accents. */
const gradients = {
  pitch: [wc.green, wc.cyan], // primary energy
  hype: ["#cd2121", wc.red], // WC26 hero
  live: [wc.red, wc.pink], // live match
  sunset: [wc.orange, wc.pink, wc.purple], // celebration
  gold: [wc.gold, wc.orange], // captain / winners
  night: ['#0A0E16', '#121A2E'], // screen base wash
};

/** 4pt base grid. Use these names in both Tailwind classes and StyleSheet. */
const spacing = {
  none: 0,
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  '2xl': 32,
  '3xl': 48,
  '4xl': 64,
};

const radii = {
  none: 0,
  sm: 6,
  md: 10,
  lg: 14,
  xl: 20,
  '2xl': 28,
  full: 9999,
};

/** [fontSize, lineHeight] pairs. */
const typeScale = {
  xs: [12, 16],
  sm: [14, 20],
  base: [16, 24],
  lg: [18, 26],
  xl: [20, 28],
  '2xl': [24, 32],
  '3xl': [30, 38],
  display: [36, 44],
  hero: [48, 54],
};

const fontWeights = {
  regular: '400',
  medium: '500',
  semibold: '600',
  bold: '700',
};

// Layout constraints. webMaxWidth keeps the app a phone-shaped column on
// desktop browsers (the root layout applies it on web only).
const layout = {
  webMaxWidth: 480,
};

// Backward-compatible aliases (tailwind.config.js + existing code import these).
const colors = dark;
const colorsLight = light;

module.exports = {
  themes,
  wc,
  gradients,
  colors,
  colorsLight,
  spacing,
  radii,
  typeScale,
  fontWeights,
  layout,
};
