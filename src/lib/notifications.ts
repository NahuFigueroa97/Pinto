import { LocalNotifications } from '@capacitor/local-notifications';
import { Capacitor } from '@capacitor/core';
import { supabase } from './supabase';

// Track what we've already notified to avoid duplicates
let lastCheckedMessages = new Date().toISOString();
let lastCheckedReservations = new Date().toISOString();
let notificationId = 1;
let pollInterval: ReturnType<typeof setInterval> | null = null;

export async function initNotifications() {
  if (!Capacitor.isNativePlatform()) return;

  try {
    const perm = await LocalNotifications.requestPermissions();
    if (perm.display !== 'granted') return;

    // Listen for notification taps
    LocalNotifications.addListener('localNotificationActionPerformed', (action) => {
      const data = action.notification.extra;
      if (data?.route && typeof window !== 'undefined') {
        window.location.hash = '';
        window.location.href = data.route;
      }
    });
  } catch {
    // Not on native platform
  }
}

async function sendNotification(title: string, body: string, route?: string) {
  if (!Capacitor.isNativePlatform()) return;
  try {
    await LocalNotifications.schedule({
      notifications: [{
        title,
        body,
        id: notificationId++,
        extra: route ? { route } : undefined,
        smallIcon: 'ic_stat_icon_config_sample',
        iconColor: '#7C3AED',
      }],
    });
  } catch { /* ignore on web */ }
}

async function checkForNewMessages(userId: string, role: string) {
  try {
    if (role === 'business') {
      // Business: check for new user messages
      const { data: biz } = await supabase
        .from('businesses').select('id, name').eq('owner_user_id', userId).maybeSingle();
      if (!biz) return;

      const { data: msgs } = await supabase
        .from('business_messages')
        .select('id, message, user:profiles!business_messages_user_id_fkey(full_name)')
        .eq('business_id', biz.id)
        .eq('sender_role', 'user')
        .eq('is_read', false)
        .gt('created_at', lastCheckedMessages)
        .order('created_at', { ascending: false })
        .limit(5);

      if (msgs && msgs.length > 0) {
        if (msgs.length === 1) {
          const m = msgs[0] as any;
          sendNotification(
            `💬 ${m.user?.full_name ?? 'Nuevo mensaje'}`,
            m.message.substring(0, 100),
            '/negocio/mensajes'
          );
        } else {
          sendNotification(
            `💬 ${msgs.length} mensajes nuevos`,
            'Tenés consultas de clientes por responder',
            '/negocio/mensajes'
          );
        }
      }
    } else {
      // User: check for business replies
      const { data: msgs } = await supabase
        .from('business_messages')
        .select('id, message, business:businesses!business_messages_business_id_fkey(name)')
        .eq('user_id', userId)
        .eq('sender_role', 'business')
        .eq('is_read', false)
        .gt('created_at', lastCheckedMessages)
        .order('created_at', { ascending: false })
        .limit(5);

      if (msgs && msgs.length > 0) {
        const m = msgs[0] as any;
        sendNotification(
          `🏪 ${m.business?.name ?? 'Respuesta'}`,
          m.message.substring(0, 100),
          '/perfil'
        );
      }
    }
    lastCheckedMessages = new Date().toISOString();
  } catch { /* silent */ }
}

async function checkForNewReservations(userId: string, role: string) {
  if (role !== 'business') return;
  try {
    const { data: biz } = await supabase
      .from('businesses').select('id').eq('owner_user_id', userId).maybeSingle();
    if (!biz) return;

    const { data: camps } = await supabase
      .from('campaigns').select('id').eq('business_id', biz.id);
    if (!camps?.length) return;

    const { data: reservations } = await supabase
      .from('reservations')
      .select('id, party_size, user:profiles(full_name), campaign:campaigns(title)')
      .in('campaign_id', camps.map(c => c.id))
      .eq('status', 'confirmed')
      .gt('created_at', lastCheckedReservations)
      .limit(5);

    if (reservations && reservations.length > 0) {
      const r = reservations[0] as any;
      sendNotification(
        `🙋 Nueva reserva!`,
        `${r.user?.full_name ?? 'Alguien'} reservó ${r.campaign?.title ?? 'tu promo'} (${r.party_size} pers.)`,
        '/negocio'
      );
    }
    lastCheckedReservations = new Date().toISOString();
  } catch { /* silent */ }
}

export function startNotificationPolling(userId: string, role: string) {
  stopNotificationPolling();

  // Initial check after 5 seconds
  setTimeout(() => {
    checkForNewMessages(userId, role);
    checkForNewReservations(userId, role);
  }, 5000);

  // Then every 30 seconds
  pollInterval = setInterval(() => {
    checkForNewMessages(userId, role);
    checkForNewReservations(userId, role);
  }, 30000);
}

export function stopNotificationPolling() {
  if (pollInterval) {
    clearInterval(pollInterval);
    pollInterval = null;
  }
}
