'use client';

import { Capacitor } from '@capacitor/core';
import { Haptics, ImpactStyle, NotificationType } from '@capacitor/haptics';

/**
 * Respuesta háptica.
 *
 * El plugin ya estaba en package.json y no se usaba en ningún lado. Es
 * buena parte de lo que separa "una web adentro de un APK" de algo que se
 * siente una app: tocar un botón y que el teléfono conteste.
 *
 * Todo es "mejor si está": en el navegador no hay vibración y no pasa nada,
 * y si el usuario la tiene desactivada en el sistema, el plugin no hace
 * ruido. Por eso nunca se propaga un error — que falle la vibración no
 * puede romper la acción que la disparó.
 */

const disponible = () => Capacitor.isNativePlatform();

async function seguro(fn: () => Promise<unknown>) {
  if (!disponible()) return;
  try { await fn(); } catch { /* sin motor háptico, o permiso denegado */ }
}

/** Toque corto: navegar, seleccionar, abrir algo. */
export const tap = () => seguro(() => Haptics.impact({ style: ImpactStyle.Light }));

/** Algo con peso: enviar un mensaje, sumarse a un plan. */
export const golpe = () => seguro(() => Haptics.impact({ style: ImpactStyle.Medium }));

/** Salió bien: se aceptó la solicitud, se canjeó el QR. */
export const exito = () => seguro(() => Haptics.notification({ type: NotificationType.Success }));

/** Salió mal: no se pudo enviar, faltan datos. */
export const error = () => seguro(() => Haptics.notification({ type: NotificationType.Error }));

/** Aviso intermedio: llegaste a un límite, hay algo que confirmar. */
export const aviso = () => seguro(() => Haptics.notification({ type: NotificationType.Warning }));
