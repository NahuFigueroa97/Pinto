/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          50: '#FFF5F2',
          100: '#FFE8E3',
          200: '#FFD0C5',
          300: '#FFB09E',
          400: '#FF8B70',
          500: '#FF6B4A',
          600: '#E85A3A',
          700: '#C44A30',
          800: '#9E3B26',
          900: '#7A2E1E',
        },
        accent: {
          50: '#F0ECFF',
          100: '#E1D9FF',
          200: '#C3B3FF',
          300: '#A48DFF',
          400: '#8E73FF',
          500: '#7C5CFC',
          600: '#6344E0',
          700: '#4D33B8',
          800: '#382490',
          900: '#261870',
        },
      },
      fontFamily: {
        // Las variables las define next/font en <html> (src/app/layout.tsx).
        sans: ['var(--font-inter)', 'system-ui', 'sans-serif'],
        display: ['var(--font-outfit)', 'system-ui', 'sans-serif'],
      },
      borderRadius: {
        '2xl': '1rem',
        '3xl': '1.5rem',
      },
    },
  },
  plugins: [],
};
