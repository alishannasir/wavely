/** @type {import('tailwindcss').Config} */
const c = (name) => `rgb(var(--c-${name}) / <alpha-value>)`;

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: { DEFAULT: c('brand'), 700: c('brand-700'), 50: c('brand-50') },
        accent: { DEFAULT: c('accent'), 700: c('accent-700') },
        danger: { DEFAULT: c('danger'), 700: c('danger-700') },
        page: c('page'),
        surface: { DEFAULT: c('surface'), 2: c('surface-2') },
        line: c('line'),
        stage: c('stage'),
        ink: c('ink'),
        muted: c('muted'),
        warn: c('warn'),
      },
      keyframes: {
        'logo-bob': {
          '0%, 100%': { transform: 'translateY(0)' },
          '50%': { transform: 'translateY(-6px)' },
        },
      },
      animation: {
        'logo-bob': 'logo-bob 1.3s ease-in-out infinite',
      },
      fontFamily: {
        display: ['Fredoka', 'system-ui', 'sans-serif'],
        body: ['"Source Sans 3"', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
};
