/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        bank: {
          bg: '#0a0e1a',
          card: '#111827',
          border: '#374151',
          accent: '#10b981',
          'accent-glow': 'rgba(16, 185, 129, 0.3)',
          danger: '#ef4444',
          text: '#f9fafb',
          muted: '#9ca3af',
        },
      },
      fontFamily: {
        sans: ['Segoe UI', 'Helvetica Neue', 'sans-serif'],
        mono: ['Consolas', 'Monaco', 'monospace'],
      },
    },
  },
  plugins: [],
}