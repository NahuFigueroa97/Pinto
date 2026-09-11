import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

// El `!` de antes mentía: si la variable faltaba, createClient tiraba
// "supabaseUrl is required" durante el prerender de CADA una de las 44
// páginas del export estático, y el error real quedaba enterrado bajo
// "Export encountered errors on following paths". next.config.mjs ahora
// corta antes, pero este mensaje cubre el caso de que alguien importe
// este módulo por fuera del build de Next.
if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    'Faltan NEXT_PUBLIC_SUPABASE_URL y/o NEXT_PUBLIC_SUPABASE_ANON_KEY. ' +
    'Copiá .env.example a .env.local y completalas. Recordá que se inlinean ' +
    'en tiempo de build: hay que rehacer `next build` y `npx cap sync`.',
  );
}

/**
 * fetch con límite de tiempo.
 *
 * Sin esto, una petición que se cuelga —no que falla— deja a react-query en
 * `pending` para siempre y el usuario ve un spinner eterno, sin error y sin
 * forma de reintentar. Pasó en la home ("Buscando planes...") y en el feed.
 * Con el abort, el cuelgue se convierte en un error normal que react-query
 * reintenta y la UI puede mostrar.
 */
const REQUEST_TIMEOUT_MS = 20_000;

/**
 * Detecta la app nativa sin importar @capacitor/core, para no arrastrar el
 * runtime de Capacitor al prerender del export estático. Capacitor inyecta
 * window.Capacitor antes del bundle de la app; si por lo que sea todavía no
 * está, devuelve false y se mantiene el comportamiento anterior.
 */
function isNativeApp(): boolean {
  if (typeof window === 'undefined') return false;
  const cap = (window as unknown as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor;
  return cap?.isNativePlatform?.() === true;
}

function fetchWithTimeout(input: RequestInfo | URL, init: RequestInit = {}): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  // Si quien llama ya pasó un signal, se respeta y se encadena.
  init.signal?.addEventListener('abort', () => controller.abort(), { once: true });

  return fetch(input, { ...init, signal: controller.signal })
    .catch((err) => {
      if (err?.name === 'AbortError') {
        throw new Error('La conexión tardó demasiado. Revisá tu internet y probá de nuevo.');
      }
      throw err;
    })
    .finally(() => clearTimeout(timer));
}

// NOTE: When you run `supabase gen types typescript` to generate DB types,
// add the Database generic back: createClient<Database>(...)
export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    flowType: 'implicit',
    autoRefreshToken: true,
    // Solo en web. En la app nativa NO hay sesión en la URL: Capacitor sirve
    // desde https://localhost y el login es por password, así que supabase-js
    // tomaba un lock en cada carga de página para inspeccionar una URL que
    // nunca va a traer tokens.
    //
    // En web SÍ hace falta: /actualizar-clave recibe el token del mail en el
    // hash de la URL, y sin esto la recuperación de contraseña se rompe.
    detectSessionInUrl: !isNativeApp(),
  },
  global: { fetch: fetchWithTimeout },
});
