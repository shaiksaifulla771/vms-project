/** @type {import('tailwindcss').Config} */
// Zoho-style minimal palette: white surfaces, grey text/borders, ONE accent (blue).
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        ink: { DEFAULT: '#1f2937', soft: '#4b5563', muted: '#6b7280', faint: '#9ca3af' },
        line: { DEFAULT: '#e5e7eb', strong: '#d1d5db' },
        panel: '#f9fafb',
        accent: { DEFAULT: '#2563eb', hover: '#1d4ed8', soft: '#eff6ff' },
        danger: '#dc2626',
      },
      fontSize: { xs2: ['11px', '16px'] },
    },
  },
  plugins: [],
};
