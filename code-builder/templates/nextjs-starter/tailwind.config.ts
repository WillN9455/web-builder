import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './src/pages/**/*.{ts,tsx}',
    './src/components/**/*.{ts,tsx}',
    './src/app/**/*.{ts,tsx}',
  ],
  // Safety wrapper — prevents accidental production CSS leaks
  safelist: ['dark'],
  darkMode: 'class',
  theme: {
    container: {
      center: true,
      padding: '2rem',
      screens: {
        '2xl': '1400px',
      },
    },
    extend: {
      colors: {
        // Brand palette — compiled from design-system/tokens
        brand: {
          50: 'var(--color-brand-primary-50)',
          100: 'var(--color-brand-primary-100)',
          200: 'var(--color-brand-primary-200)',
          500: 'var(--color-brand-primary-500)',
          700: 'var(--color-brand-primary-700)',
          900: 'var(--color-brand-primary-900)',
        },
        // Semantic palette
        success: {
          500: 'var(--color-success-500)',
          700: 'var(--color-success-700)',
        },
        warning: {
          500: 'var(--color-warning-500)',
          700: 'var(--color-warning-700)',
        },
        error: {
          500: 'var(--color-error-500)',
          700: 'var(--color-error-700)',
        },
        info: {
          500: 'var(--color-info-500)',
          700: 'var(--color-info-700)',
        },
        // Neutral palette
        neutral: {
          50: 'var(--color-neutral-50)',
          100: 'var(--color-neutral-100)',
          200: 'var(--color-neutral-200)',
          400: 'var(--color-neutral-400)',
          600: 'var(--color-neutral-600)',
          800: 'var(--color-neutral-800)',
          900: 'var(--color-neutral-900)',
        },
      },
      fontFamily: {
        sans: ['var(--font-sans)'],
      },
      spacing: {
        '1': 'var(--space-1)',
        '2': 'var(--space-2)',
        '3': 'var(--space-3)',
        '4': 'var(--space-4)',
        '6': 'var(--space-6)',
        '8': 'var(--space-8)',
        '12': 'var(--space-12)',
        '16': 'var(--space-16)',
      },
      fontSize: {
        xs: ['var(--text-xs)'],
        sm: ['var(--text-sm)'],
        base: ['var(--text-base)'],
        lg: ['var(--text-lg)'],
        xl: ['var(--text-xl)'],
        '2xl': ['var(--text-2xl)'],
        '3xl': ['var(--text-3xl)'],
        '4xl': ['var(--text-4xl)'],
      },
    },
  },
  plugins: [],
};

export default config;
