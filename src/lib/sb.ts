import type { PostgrestError, PostgrestSingleResponse } from '@supabase/supabase-js';

/**
 * Ejecuta una consulta de Supabase y **lanza** si falla.
 *
 * El patrón que había por toda la app era:
 *
 *     const { data } = await supabase.from('x').select();
 *     return data ?? [];
 *
 * Eso descarta `error`. Un fallo de RLS, una columna que no existe o un
 * corte de red terminaban devolviendo un array vacío, indistinguible de
 * "no hay datos". La pantalla dibujaba su estado vacío y el usuario no se
 * enteraba de nada: el chat parecía vacío cuando en realidad la consulta
 * había fallado.
 *
 * Con esto el error se propaga, react-query pasa a estado `error` y la UI
 * puede mostrarlo y ofrecer reintentar.
 */

/**
 * Se usa el tipo real de postgrest-js en vez de uno propio. La respuesta es
 * una unión discriminada con más campos que `data` y `error` (`count`,
 * `status`, `statusText`), y describirla a mano hace que TypeScript infiera
 * `T = never`: el archivo entero se llena de "Property 'x' does not exist
 * on type 'never'".
 *
 * Para un `.select()` sin `.single()`, T es el array: PostgrestResponse<Row>
 * no es más que PostgrestSingleResponse<Row[]>.
 */
export async function sb<T>(query: PromiseLike<PostgrestSingleResponse<T>>): Promise<T | null> {
  const { data, error } = await query;
  if (error) {
    // PGRST116 = .single() sin filas. No es un fallo: es "no existe".
    if (error.code === 'PGRST116') return null;
    const err = new Error(error.message || 'Error al consultar la base');
    (err as Error & { code?: string }).code = error.code;
    throw err;
  }
  return data;
}

/** Igual que `sb` pero para listados: nunca devuelve null. */
export async function sbList<T>(query: PromiseLike<PostgrestSingleResponse<T[]>>): Promise<T[]> {
  return (await sb(query)) ?? [];
}
