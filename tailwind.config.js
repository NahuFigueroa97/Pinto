/** @type {import('tailwindcss').Config} */
module.exports = {
  // 'class' y no 'media': el usuario puede elegir claro u oscuro aunque el
  // sistema diga otra cosa. El valor por defecto sigue el sistema; ver el
  // script anti-parpadeo en src/app/layout.tsx.
  darkMode: 'class',
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        /*
          Colores semánticos, no literales.

          El modo oscuro estaba hecho a mano en cero lugares y la app tenía
          unas 870 clases de color fijas: bg-white, text-gray-400,
          border-gray-100... Agregarle `dark:` a cada una es imposible de
          mantener y se desincroniza a la primera pantalla nueva.

          Con estos tokens la pantalla dice QUÉ es cada cosa —superficie,
          texto principal, texto secundario, línea— y el tema decide de qué
          color. Una pantalla nueva sale bien en los dos modos sin escribir
          nada extra.

          Los valores son tripletes RGB sueltos (globals.css) para que
          Tailwind pueda componer opacidad: bg-surface/80 funciona igual.
        */
        canvas:       'rgb(var(--c-canvas) / <alpha-value>)',
        surface:      'rgb(var(--c-surface) / <alpha-value>)',
        subtle:       'rgb(var(--c-subtle) / <alpha-value>)',
        line:         'rgb(var(--c-line) / <alpha-value>)',
        'line-strong':'rgb(var(--c-line-strong) / <alpha-value>)',
        ink:          'rgb(var(--c-ink) / <alpha-value>)',
        'ink-soft':   'rgb(var(--c-ink-soft) / <alpha-value>)',
        muted:        'rgb(var(--c-muted) / <alpha-value>)',
        faint:        'rgb(var(--c-faint) / <alpha-value>)',

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
