'use client';

import { App } from '@capacitor/app';
import { Capacitor } from '@capacitor/core';
import { safeRoute } from './pushNotifications';
import { requestNavigation } from './navigation';

/**
 * Links que abren la app.
 *
 * El botón de compartir por WhatsApp ya existía, pero el link caía en el
 * navegador: el amigo que lo recibía veía una web, no Pintó. Se perdía ahí
 * el efecto que justifica tener el botón, y en Argentina WhatsApp es EL
 * canal de crecimiento.
 *
 * El intent-filter está en AndroidManifest.xml; esto es la otra mitad, la
 * que traduce la URL entrante en una navegación adentro de la app.
 */

/**
 * Saca la ruta interna de una URL entrante.
 *
 * Con https la parte útil es pathname + query. Con un esquema propio
 * (pinto://planes/detalle?id=x) el parser mete "planes" en `host` y deja
 * "/detalle" en `pathname`, así que hay que volver a pegarlos.
 */
export function rutaDesdeUrl(raw: string): string | null {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }

  const esWeb = url.protocol === 'https:' || url.protocol === 'http:';
  const camino = esWeb ? url.pathname : `/${url.host}${url.pathname}`;
  const limpio = camino.replace(/\/+$/, '') || '/';

  // safeRoute es la misma lista blanca que usa el push: una URL que llega de
  // afuera no puede convertirse en una navegación arbitraria adentro del
  // WebView.
  return safeRoute(`${limpio}${url.search}`);
}

let yaEscuchando = false;

/** Engancha el listener. Idempotente: llamarlo dos veces no duplica nada. */
export async function initDeepLinks(): Promise<void> {
  if (yaEscuchando || !Capacitor.isNativePlatform()) return;
  yaEscuchando = true;

  await App.addListener('appUrlOpen', ({ url }) => {
    const ruta = rutaDesdeUrl(url);
    if (!ruta) return;
    // Mismo camino que las notificaciones: requestNavigation deja la ruta
    // pendiente y el router del cliente la ejecuta. Una navegación dura acá
    // volvería a pedirle la página al servidor de Capacitor y terminaría en
    // la home, que es el bug que ya tuvimos.
    requestNavigation(ruta);
  });

  // La app pudo haberse abierto DESDE un link, con el listener todavía sin
  // enganchar. Sin esto, el primer link tras un arranque en frío se pierde.
  try {
    const lanzada = await App.getLaunchUrl();
    if (lanzada?.url) {
      const ruta = rutaDesdeUrl(lanzada.url);
      if (ruta) requestNavigation(ruta);
    }
  } catch { /* algunas plataformas no lo implementan */ }
}
