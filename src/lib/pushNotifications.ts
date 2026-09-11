import { PushNotifications, type Token } from '@capacitor/push-notifications';
import { Capacitor } from '@capacitor/core';
import { supabase } from './supabase';
import { PUSH_CHANNEL_ID, setPushActive, showForegroundNotification } from './notifications';
import { navigateTo } from './navigation';

/** Rutas a las que una notificación puede navegar. Nada fuera de esta lista. */
const ALLOWED_ROUTE_PREFIXES = [
  '/planes/detalle',
  '/planes/chat',
  '/planes',
  '/negocio/mensajes',
  '/negocio/reservas',
  '/negocio',
  '/mensajes',
  '/reservas',
  '/fidelidad',
  '/campana',
  '/perfil',
  '/feed',
];

/**
 * El payload de la notificación viene del servidor, pero tratarlo como una
 * URL arbitraria sería una redirección abierta dentro del WebView. Solo se
 * aceptan rutas internas conocidas.
 */
function safeRoute(raw: unknown): string | null {
  if (typeof raw !== 'string' || raw.length === 0) return null;
  // Nada de esquemas ni de "//host" (protocol-relative)
  if (!raw.startsWith('/') || raw.startsWith('//')) return null;
  const path = raw.split('?')[0];
  return ALLOWED_ROUTE_PREFIXES.some((p) => path === p || path.startsWith(`${p}/`) || path === `${p}/`)
    ? raw
    : null;
}

function routeFromData(data: Record<string, unknown> | undefined): string | null {
  if (!data) return null;

  // La ruta explícita que manda el servidor gana. Antes se miraba primero
  // data.planId, así que un aviso de chat —que trae planId Y route—
  // terminaba llevando al detalle del plan en vez de al chat.
  const explicit = safeRoute(data.route);
  if (explicit) return explicit;

  // Fallback para payloads que solo traen el id del plan
  if (typeof data.planId === 'string' && data.planId) {
    return `/planes/detalle?id=${encodeURIComponent(data.planId)}`;
  }
  return null;
}

// Estado a nivel de módulo: los listeners se registran UNA sola vez por
// arranque de la app. Antes initPushNotifications() se llamaba en cada evento
// de auth (incluido TOKEN_REFRESHED) y volvía a suscribir los 4 listeners, así
// que al tocar una notificación se disparaban N navegaciones.
let listenersReady = false;
let currentUserId: string | null = null;
let lastToken: string | null = null;

async function persistToken(token: string) {
  lastToken = token;
  if (!currentUserId) return;
  const { error } = await supabase.rpc('register_device_token', {
    p_token: token,
    p_platform: Capacitor.getPlatform() === 'ios' ? 'ios' : 'android',
  });
  if (error) {
    console.error('[push] no se pudo guardar el token:', error.message);
    return;
  }
  // Recién ahora el push está realmente operativo: el polling de respaldo
  // puede apagarse sin dejar al usuario sin avisos.
  setPushActive(true);
}

async function ensureListeners() {
  if (listenersReady) return;
  listenersReady = true;

  await PushNotifications.addListener('registration', (token: Token) => {
    // FCM rota el token; este listener se dispara también en la renovación.
    void persistToken(token.value);
  });

  await PushNotifications.addListener('registrationError', (err) => {
    console.error('[push] error de registro:', err.error);
  });

  // Con la app en primer plano, Android entrega el push a la app y NO dibuja
  // nada en la barra de estado. Sin esto, las notificaciones recibidas
  // mientras el usuario está usando Pintó se pierden en silencio.
  await PushNotifications.addListener('pushNotificationReceived', (notification) => {
    void showForegroundNotification(
      notification.title ?? 'Pintó',
      notification.body ?? '',
      routeFromData(notification.data as Record<string, unknown>),
    );
  });

  await PushNotifications.addListener('pushNotificationActionPerformed', (action) => {
    const route = routeFromData(action.notification.data as Record<string, unknown>);
    if (route) navigateTo(route);
  });
}

/**
 * Inicializa el push para el usuario logueado. Es idempotente: se puede
 * llamar varias veces sin duplicar listeners ni permisos.
 */
export async function initPushNotifications(userId: string) {
  if (!Capacitor.isNativePlatform()) return;

  const changedUser = currentUserId !== userId;
  currentUserId = userId;

  try {
    // Canal propio: sin esto Android agrupa todo en "Miscellaneous"
    // y se ignoran el icono y el color de la marca.
    if (Capacitor.getPlatform() === 'android') {
      await PushNotifications.createChannel({
        id: PUSH_CHANNEL_ID,
        name: 'Avisos de Pintó',
        description: 'Mensajes, reservas y novedades de tus planes',
        importance: 4,
        visibility: 1,
        lights: true,
        lightColor: '#FF6B4A',
        vibration: true,
      }).catch(() => { /* iOS o versiones viejas: no aplica */ });
    }

    let perm = await PushNotifications.checkPermissions();
    if (perm.receive === 'prompt' || perm.receive === 'prompt-with-rationale') {
      perm = await PushNotifications.requestPermissions();
    }
    if (perm.receive !== 'granted') {
      // Sin permiso no hay push: el polling de respaldo tiene que seguir vivo.
      setPushActive(false);
      return;
    }

    await ensureListeners();
    await PushNotifications.register();

    // Si cambió el usuario en el mismo aparato, reasignar el token que ya teníamos
    // (el evento 'registration' puede no volver a dispararse).
    if (changedUser && lastToken) await persistToken(lastToken);
  } catch (error) {
    console.error('[push] error inicializando:', error);
  }
}

/**
 * Al cerrar sesión hay que BORRAR el token del servidor. Si no, el próximo
 * usuario de ese teléfono sigue recibiendo los push del anterior.
 * Se llama antes de supabase.auth.signOut(), porque después el RPC ya no
 * tendría sesión con la que autenticar.
 */
export async function unregisterPush() {
  currentUserId = null;
  setPushActive(false);
  if (!Capacitor.isNativePlatform()) return;

  try {
    if (lastToken) {
      const { error } = await supabase.rpc('unregister_device_token', { p_token: lastToken });
      if (error) console.error('[push] no se pudo borrar el token:', error.message);
    }
    await PushNotifications.removeAllDeliveredNotifications();
  } catch (error) {
    console.error('[push] error al desregistrar:', error);
  }
}
