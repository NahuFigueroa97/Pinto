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

// ============================================================
// Ruta pendiente desde una notificación
//
// window.location.assign() hace una navegación real contra el servidor
// local de Capacitor. Si ese servidor no resuelve la ruta, cae al
// index.html de la raíz: el usuario toca la notificación y aterriza en la
// home, sin el parámetro y sin ninguna pista de qué pasó.
//
// Los listeners de notificación viven fuera de React, así que no pueden
// usar useRouter(). La solución es dejar la ruta acá y que un componente
// montado dentro del árbol la consuma con router.push(), que hace routing
// del lado del cliente y no le pide nada al servidor.
// ============================================================

let pendingRoute: string | null = null;
const listeners = new Set<(route: string) => void>();

/** La llaman los listeners de notificación, desde fuera de React. */
export function requestNavigation(route: string) {
  if (listeners.size > 0) {
    listeners.forEach((fn) => fn(route));
    return;
  }
  // Arranque en frío: la app todavía no montó. Se guarda y la consume
  // el primer suscriptor.
  pendingRoute = route;
}

/** La usa el componente que hace el push. Devuelve la baja. */
export function onNavigationRequest(fn: (route: string) => void): () => void {
  listeners.add(fn);
  if (pendingRoute) {
    const route = pendingRoute;
    pendingRoute = null;
    fn(route);
  }
  return () => { listeners.delete(fn); };
}
