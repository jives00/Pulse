/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./app/**/*.{ts,tsx}', './src/**/*.{ts,tsx}'],
  presets: [require('nativewind/preset')],
  theme: {
    extend: {
      colors: {
        dram: {
          bg: '#111111',
          card: '#1C1C1C',
          accent: '#D4A843',
          border: '#2A2A2A',
          text: '#FFFFFF',
          muted: '#888888',
        },
      },
    },
  },
  plugins: [],
};
