/**
 * Fechas locales.
 *
 * `new Date().toISOString().split('T')[0]` devuelve la fecha en **UTC**, no la
 * del usuario. En Argentina (UTC-3) eso significa que entre las 21:00 y las
 * 23:59 el "hoy" calculado ya es el día siguiente.
 *
 * Los filtros de /planes, /cerca y /planes/random preguntaban
 * `plan_date >= <hoy en UTC>`, así que durante esas tres horas todos los
 * planes de hoy desaparecían de la app — justo en la franja en la que
 * alguien busca qué hacer esa noche. En el feed sí se veían, porque el feed
 * no filtra por fecha.
 *
 * social_plans.plan_date es un `date` sin zona horaria: representa un día del
 * calendario local, así que hay que compararlo contra la fecha local.
 */

/** Fecha local en formato YYYY-MM-DD, que es como se guarda plan_date. */
export function localDateString(date: Date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** Hoy, en la zona horaria del dispositivo. */
export function today(): string {
  return localDateString();
}

/** Interpreta un `date` de Postgres (YYYY-MM-DD) como medianoche local. */
export function parsePlanDate(value: string): Date {
  // `new Date('2026-09-10')` lo parsea como UTC y en Argentina muestra el 9.
  // Con la hora explícita, el runtime lo toma como local.
  return new Date(`${value}T00:00:00`);
}
