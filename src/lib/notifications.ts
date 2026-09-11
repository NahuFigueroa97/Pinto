import { LocalNotifications } from '@capacitor/local-notifications';
import { Capacitor } from '@capacitor/core';
import { supabase } from './supabase';
import { navigateTo } from './navigation';

/**
 * Notificaciones locales.
 *
 * Antes este archivo hacía polling cada 30 s reconstruyendo los avisos a mano
 * desde business_messages y reservations. Las tres consultas estaban rotas:
 *   - reservations no tiene columna created_at (es reserved_at) → 42703;
 *   - el embed profiles!business_messages_user_id_fkey no resolvía porque el
 *     FK apuntaba a auth.users → PGRST200;
 *   - la marca de tiempo se tomaba del reloj del cliente y se comparaba contra
 *     created_at del servidor, así que se perdían o repetían avisos.
 * Todos los errores se tragaban con `catch {}`, por eso nunca se notó.
 *
 * Ahora la fuente de verdad es public.notification_queue, que llenan los
 * triggers de la base (migración 011). El polling es solo el plan B para
 * cuando el push de FCM no está disponible.
 */

/**
 * Canal de notificaciones de Android 8+. El id tiene que coincidir con el
 * `channel_id` que manda la Edge Function (supabase/functions/send-push);
 * si no, Android usa el canal "Miscellaneous" por defecto y se ignoran el
 * icono y el color de la marca.
 */
export const PUSH_CHANNEL_ID = 'pinto_default';

const POLL_INTERVAL_MS = 45_000;
const LAST_SEEN_KEY = 'pinto:lastNotificationSeen';

let pollInterval: ReturnType<typeof setInterval> | null = null;
let initialTimeout: ReturnType<typeof setTimeout> | null = null;
let channelReady = false;

// Lo marca pushNotifications.ts cuando FCM quedó registrado de verdad.
// Con push activo el polling sobra y solo generaría avisos duplicados.
let pushActive = false;
export function setPushActive(value: boolean) {
  pushActive = value;
}

// Los ids de notificación de Android tienen que ser enteros de 32 bits y
// únicos. Un contador que arrancaba en 1 en cada arranque hacía que la
// notificación nueva pisara a la anterior.
let notificationSeq = Math.floor(Date.now() / 1000) % 1_000_000;
function nextNotificationId() {
  notificationSeq = (notificationSeq + 1) % 2_000_000_000;
  return notificationSeq;
}

function readLastSeen(): string {
  if (typeof window === 'undefined') return new Date().toISOString();
  try {
    return window.localStorage.getItem(LAST_SEEN_KEY) ?? new Date().toISOString();
  } catch {
    return new Date().toISOString();
  }
}

function writeLastSeen(iso: string) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(LAST_SEEN_KEY, iso);
  } catch { /* modo incógnito / storage bloqueado */ }
}

async function ensureChannel() {
  if (channelReady || Capacitor.getPlatform() !== 'android') return;
  channelReady = true;
  try {
    await LocalNotifications.createChannel({
      id: PUSH_CHANNEL_ID,
      name: 'Avisos de Pintó',
      description: 'Mensajes, reservas y novedades de tus planes',
      importance: 4,
      visibility: 1,
      lights: true,
      lightColor: '#FF6B4A',
      vibration: true,
    });
  } catch { /* no soportado */ }
}

export async function showForegroundNotification(title: string, body: string, route: string | null) {
  if (!Capacitor.isNativePlatform()) return;
  try {
    await ensureChannel();
    await LocalNotifications.schedule({
      notifications: [{
        id: nextNotificationId(),
        title,
        body,
        channelId: PUSH_CHANNEL_ID,
        // El drawable tiene que existir: antes apuntaba a
        // 'ic_stat_icon_config_sample', que no está en res/, y Android caía
        // al icono genérico del sistema.
        smallIcon: 'ic_stat_pinto',
        iconColor: '#FF6B4A',
        extra: route ? { route } : undefined,
      }],
    });
  } catch (err) {
    console.error('[notif] no se pudo mostrar la notificación local:', err);
  }
}

let tapListenerReady = false;

export async function initNotifications() {
  if (!Capacitor.isNativePlatform()) return;

  try {
    await ensureChannel();

    const perm = await LocalNotifications.requestPermissions();
    if (perm.display !== 'granted') return;

    if (!tapListenerReady) {
      tapListenerReady = true;
      await LocalNotifications.addListener('localNotificationActionPerformed', (action) => {
        const route = action.notification.extra?.route;
        if (typeof route === 'string' && route.startsWith('/') && !route.startsWith('//')) {
          navigateTo(route);
        }
      });
    }
  } catch (err) {
    console.error('[notif] init falló:', err);
  }
}

async function drainQueue(userId: string) {
  // Si el push nativo está funcionando, FCM ya entrega estos mismos avisos.
  if (pushActive) return;

  const since = readLastSeen();
  const { data, error } = await supabase
    .from('notification_queue')
    .select('id, title, body, route, created_at')
    .eq('user_id', userId)
    .gt('created_at', since)
    .order('created_at', { ascending: true })
    .limit(10);

  if (error) {
    console.error('[notif] polling falló:', error.message);
    return;
  }
  if (!data?.length) return;

  for (const n of data) {
    await showForegroundNotification(n.title, n.body, n.route ?? null);
  }

  // La marca se toma del created_at del servidor, no del reloj del teléfono:
  // así un desfase horario no se come ni duplica notificaciones.
  writeLastSeen(data[data.length - 1].created_at);
}

export function startNotificationPolling(userId: string) {
  stopNotificationPolling();

  initialTimeout = setTimeout(() => { void drainQueue(userId); }, 5_000);
  pollInterval = setInterval(() => { void drainQueue(userId); }, POLL_INTERVAL_MS);
}

export function stopNotificationPolling() {
  if (initialTimeout) {
    // El setTimeout inicial nunca se cancelaba: al cambiar de usuario o
    // remontar el provider quedaban varios pendientes en paralelo.
    clearTimeout(initialTimeout);
    initialTimeout = null;
  }
  if (pollInterval) {
    clearInterval(pollInterval);
    pollInterval = null;
  }
}
