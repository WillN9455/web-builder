/** @type {import('tailwindcss').Config} */
// Token wiring: every color/font maps to the CSS custom properties in
// app/globals.css, which are compiled from the project's design-system/tokens/.
// Never hardcode hex values here — change the tokens, not this file.
module.exports = {
  content: ['./app/**/*.{ts,tsx}', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        'brand-primary': {
          50: 'var(--color-brand-primary-50)',
          100: 'var(--color-brand-primary-100)',
          200: 'var(--color-brand-primary-200)',
          500: 'var(--color-brand-primary-500)',
          700: 'var(--color-brand-primary-700)',
          900: 'var(--color-brand-primary-900)',
        },
        neutral: {
          50: 'var(--color-neutral-50)',
          100: 'var(--color-neutral-100)',
          200: 'var(--color-neutral-200)',
          400: 'var(--color-neutral-400)',
          600: 'var(--color-neutral-600)',
          800: 'var(--color-neutral-800)',
          900: 'var(--color-neutral-900)',
        },
        success: { 500: 'var(--color-success-500)', 700: 'var(--color-success-700)' },
        warning: { 500: 'var(--color-warning-500)', 700: 'var(--color-warning-700)' },
        error: { 500: 'var(--color-error-500)', 700: 'var(--color-error-700)' },
        info: { 500: 'var(--color-info-500)', 700: 'var(--color-info-700)' },
      },
      fontFamily: {
        sans: ['var(--font-sans)'],
      },
    },
  },
  plugins: [],
};