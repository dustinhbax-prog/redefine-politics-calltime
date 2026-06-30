/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        mono: ['JetBrains Mono', 'Consolas', 'monospace'],
        display: ['Archivo', 'system-ui', '-apple-system', 'Segoe UI', 'sans-serif'],
        sans: ['Inter', 'system-ui', '-apple-system', 'Segoe UI', 'sans-serif'],
      },
      colors: {
        terminal: {
          bg:     'var(--color-bg)',
          panel:  'var(--color-panel)',
          border: 'var(--color-border)',
          muted:  'var(--color-muted)',
          text:   'var(--color-text)',
          accent: 'var(--color-accent)',
          green:  'var(--color-green)',
          red:    'var(--color-red)',
          blue:   'var(--color-blue)',
        },
      },
      keyframes: {
        shake: {
          '0%, 100%': { transform: 'translateX(0)' },
          '20%, 60%': { transform: 'translateX(-8px)' },
          '40%, 80%': { transform: 'translateX(8px)' },
        },
      },
      animation: {
        shake: 'shake 0.6s ease-in-out',
      },
    },
  },
  plugins: [],
}
