const { colors, spacing, radii, typeScale } = require('./src/theme/tokens.js');

/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./app/**/*.{ts,tsx}', './src/**/*.{ts,tsx}'],
  presets: [require('nativewind/preset')],
  darkMode: 'class',
  theme: {
    extend: {
      // Semantic colors come straight from the theme sheet (dark palette);
      // when light mode lands, switch to CSS-variable values here.
      colors,
      spacing: Object.fromEntries(Object.entries(spacing).map(([k, v]) => [k, `${v}px`])),
      borderRadius: Object.fromEntries(Object.entries(radii).map(([k, v]) => [k, `${v}px`])),
      fontSize: Object.fromEntries(
        Object.entries(typeScale).map(([k, [size, lh]]) => [k, [`${size}px`, `${lh}px`]])
      ),
    },
  },
  plugins: [],
};
