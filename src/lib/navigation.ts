/**
 * Navegación fuera del router de Next.
 *
 * El proyecto usa `output: 'export'` con `trailingSlash: true`, así que las
 * páginas quedan en disco como `/planes/chat/index.html` y hay que pedirlas
 * como `/planes/chat/`. Una navegación dura a `/planes/chat?id=x` (sin la
 * barra) no la resuelve el servidor local de Capacitor: el WebView queda en
 * blanco o colgado.
 *
 * Dentro de React esto no se nota porque <Link> hace routing del lado del
 * cliente y nunca pide nada al servidor. El problema aparece en los <a href>
 * sueltos y en window.location, que es como se navega desde el listener de
 * una notificación (viene de afuera de React).
 */

/** Agrega la barra final antes del query string. */
export function toAppUrl(route: string): string {
  const [path, query] = route.split('?');
  const withSlash = path.endsWith('/') ? path : `${path}/`;
  return query ? `${withSlash}?${query}` : withSlash;
}

/** Navegación dura, solo para cuando no hay router disponible. */
export function navigateTo(route: string) {
  if (typeof window === 'undefined') return;
  window.location.assign(toAppUrl(route));
}
