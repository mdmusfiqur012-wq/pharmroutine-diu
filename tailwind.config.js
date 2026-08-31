/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter Variable', 'Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
      },
      colors: {
        /* brand = DIU deep university blue (primary actions & major UI) */
        brand: {
          50: '#eff6ff',
          100: '#dbeafe',
          200: '#bfdbfe',
          300: '#93c5fd',
          400: '#60a5fa',
          500: '#3b82f6',
          600: '#2563eb',
          700: '#1d4ed8',
          800: '#1e40af',
          900: '#1e3a8a',
          950: '#172554',
        },
        /* daffodil = fresh daffodil green (secondary, success, labs) */
        daffodil: {
          50: '#f0fdf4',
          100: '#dcfce7',
          200: '#bbf7d0',
          300: '#86efac',
          400: '#4ade80',
          500: '#22c55e',
          600: '#16a34a',
          700: '#15803d',
          800: '#166534',
          900: '#14532d',
          950: '#052e16',
        },
        accent: {
          50: '#fffbeb',
          100: '#fef3c7',
          200: '#fde68a',
          300: '#fcd34d',
          400: '#fbbf24',
          500: '#f59e0b',
          600: '#d97706',
          700: '#b45309',
          800: '#92400e',
          900: '#78350f',
        },
      },
      boxShadow: {
        card: '0 1px 2px 0 rgb(30 58 138 / 0.04), 0 4px 16px -4px rgb(30 58 138 / 0.08)',
        'card-hover': '0 2px 4px -1px rgb(30 58 138 / 0.06), 0 18px 40px -12px rgb(29 78 216 / 0.22), 0 0 0 1px rgb(255 255 255 / 0.7) inset',
        glass: '0 8px 32px -8px rgb(30 58 138 / 0.16), 0 2px 8px -2px rgb(22 163 74 / 0.08), 0 0 0 1px rgb(255 255 255 / 0.6) inset',
        'glass-hover': '0 22px 56px -16px rgb(29 78 216 / 0.30), 0 6px 16px -6px rgb(22 163 74 / 0.16), 0 0 0 1px rgb(255 255 255 / 0.8) inset',
        'glow-blue': '0 10px 30px -8px rgb(37 99 235 / 0.45)',
        'glow-green': '0 10px 30px -8px rgb(22 163 74 / 0.45)',
        float: '0 20px 50px -20px rgb(30 58 138 / 0.35), 0 2px 6px -2px rgb(30 58 138 / 0.15)',
      },
      keyframes: {
        'fade-in': {
          '0%': { opacity: '0', transform: 'translateY(6px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        'scale-in': {
          '0%': { opacity: '0', transform: 'scale(0.96)' },
          '100%': { opacity: '1', transform: 'scale(1)' },
        },
        shimmer: {
          '100%': { transform: 'translateX(100%)' },
        },
        float: {
          '0%,100%': { transform: 'translateY(0)' },
          '50%': { transform: 'translateY(-10px)' },
        },
        'float-slow': {
          '0%,100%': { transform: 'translateY(0) rotate(0deg)' },
          '50%': { transform: 'translateY(-16px) rotate(3deg)' },
        },
        'pulse-glow': {
          '0%,100%': { opacity: '0.55' },
          '50%': { opacity: '1' },
        },
        'gradient-x': {
          '0%,100%': { backgroundPosition: '0% 50%' },
          '50%': { backgroundPosition: '100% 50%' },
        },
        orbit: {
          '0%': { transform: 'rotate(0deg)' },
          '100%': { transform: 'rotate(360deg)' },
        },
      },
      animation: {
        'fade-in': 'fade-in .35s ease-out both',
        'scale-in': 'scale-in .18s ease-out both',
        float: 'float 6s ease-in-out infinite',
        'float-slow': 'float-slow 9s ease-in-out infinite',
        'pulse-glow': 'pulse-glow 4s ease-in-out infinite',
        'gradient-x': 'gradient-x 6s ease infinite',
        orbit: 'orbit 22s linear infinite',
      },
    },
  },
  plugins: [],
};
