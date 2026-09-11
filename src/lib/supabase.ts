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

// NOTE: When you run `supabase gen types typescript` to generate DB types,
// add the Database generic back: createClient<Database>(...)
export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    flowType: 'implicit',
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});
