import { PHASE_PRODUCTION_BUILD, PHASE_DEVELOPMENT_SERVER } from 'next/constants.js';
import { execSync } from 'node:child_process';

/**
 * Commit con el que se compiló, visible en la app.
 *
 * Depurar a ciegas "¿estás probando la última build?" cuesta más que el bug
 * en sí. Con esto, el pie de /perfil dice exactamente qué se está corriendo.
 */
function buildId() {
  try {
    const sha = execSync('git rev-parse --short HEAD', { stdio: ['ignore', 'pipe', 'ignore'] })
      .toString().trim();
    const dirty = execSync('git status --porcelain', { stdio: ['ignore', 'pipe', 'ignore'] })
      .toString().trim().length > 0;
    return dirty ? `${sha}+` : sha;
  } catch {
    return 'dev';
  }
}

/**
 * Validación temprana de las variables de entorno.
 *
 * Sin esto, si falta NEXT_PUBLIC_SUPABASE_URL el build recorre las 44 páginas,
 * falla en todas con "Export encountered errors on following paths" y la causa
 * real ("supabaseUrl is required") queda sepultada 50 líneas más arriba, entre
 * los warnings de ESLint. Pasó de verdad.
 */
function checkEnv(phase) {
  if (phase !== PHASE_PRODUCTION_BUILD && phase !== PHASE_DEVELOPMENT_SERVER) return;

  // `next lint` también reporta phase-production-build, así que la fase sola
  // no alcanza para distinguirlo. Lintear no debería exigir credenciales:
  // se corre en CI y en pre-commit, donde no hay .env.local.
  if (process.argv.some((a) => a === 'lint' || a.endsWith('/lint'))) return;

  const required = ['NEXT_PUBLIC_SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_ANON_KEY'];
  const missing = required.filter((k) => !process.env[k]);

  if (missing.length > 0) {
    console.error(`
╭──────────────────────────────────────────────────────────────╮
│  Faltan variables de entorno                                 │
╰──────────────────────────────────────────────────────────────╯

  ${missing.map((k) => `✗ ${k}`).join('\n  ')}

  Creá un archivo .env.local en la raíz del proyecto:

    NEXT_PUBLIC_SUPABASE_URL=https://<TU_PROJECT_REF>.supabase.co
    NEXT_PUBLIC_SUPABASE_ANON_KEY=<tu anon / publishable key>
    NEXT_PUBLIC_SITE_URL=https://<usuario>.github.io/Pinto

  Los valores están en Supabase Dashboard > Project Settings > API Keys.
  Ver .env.example y README.md.

  Ojo: estas variables se inlinean en tiempo de build. Si las cambiás
  hay que rehacer el build y el 'cap sync'.
`);
    process.exit(1);
  }

  // No corta el build: la app funciona, solo queda rota la recuperación
  // de contraseña (ver docs/AUDITORIA_2026-09.md, hallazgo #26).
  const site = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (!site) {
    console.warn(
      '\n⚠  NEXT_PUBLIC_SITE_URL no está definida: la recuperación de contraseña ' +
      'va a mostrar un error en vez de mandar el mail, y los planes se van a ' +
      'compartir sin link.\n',
    );
  } else if (/[<>{}\s]/.test(site) || /tu-dominio|donde-publiques|ejemplo\.com/i.test(site)) {
    // Pasó de verdad: se copió el ejemplo del README tal cual y el link que
    // se compartía por WhatsApp decía "donde-publiques-la-web".
    console.warn(
      `\n⚠  NEXT_PUBLIC_SITE_URL parece el texto de ejemplo y no una URL real:\n` +
      `     ${site}\n` +
      `   Se va a ignorar (los planes se comparten sin link). Poné la URL donde\n` +
      `   publicaste la web, p. ej. https://tuusuario.github.io/Pinto\n`,
    );
  }
}

/**
 * Prefijo de ruta, sólo para la web.
 *
 * GitHub Pages sirve un repo de proyecto bajo /<repo>/, así que la web
 * necesita que todas las rutas y los assets lleven ese prefijo. La APK NO:
 * Capacitor sirve desde la raíz de su propio servidor local, y con prefijo
 * no encontraría nada.
 *
 * Por eso sale de una variable y no está fija: el workflow de Pages la
 * define, y `npm run android:dev` no.
 */
const basePath = process.env.NEXT_PUBLIC_BASE_PATH || '';

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'export',
  ...(basePath ? { basePath, assetPrefix: basePath } : {}),
  env: {
    NEXT_PUBLIC_BUILD_ID: buildId(),
    NEXT_PUBLIC_BUILD_DATE: new Date().toISOString().slice(0, 16).replace('T', ' '),
  },
  images: {
    unoptimized: true,
  },
  trailingSlash: true,
};

export default (phase) => {
  checkEnv(phase);
  return nextConfig;
};
