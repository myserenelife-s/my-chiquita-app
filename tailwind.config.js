/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        'dark-emerald': {
          50: '#ecfdf5',
          100: '#d1fae5',
          200: '#a7f3d0',
          300: '#6ee7b7',
          400: '#34d399',
          500: '#10b981',
          600: '#059669',
          700: '#047857',
          800: '#065f46',
          900: '#064e3b',
          950: '#022c22',
        },
        'neon-green': {
          400: '#4ade80',
          500: '#22c55e',
          600: '#16a34a',
          glow: '#00ff88',
        },
        'deep-black': {
          DEFAULT: '#0a0f0d',
          lighter: '#0f1612',
          card: '#111916',
        }
      },
      boxShadow: {
        'neon-sm': '0 0 10px rgba(34, 197, 94, 0.3)',
        'neon': '0 0 20px rgba(34, 197, 94, 0.4)',
        'neon-lg': '0 0 30px rgba(34, 197, 94, 0.5)',
        'neon-xl': '0 0 40px rgba(0, 255, 136, 0.6)',
      },
      backdropBlur: {
        xs: '2px',
      }
    },
  },
  plugins: [],
}
