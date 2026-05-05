import { PushNotifications } from '@capacitor/push-notifications';
import { Capacitor } from '@capacitor/core';
import { supabase } from './supabase';

/**
 * Inicializa las push notifications con FCM.
 * Llamar una vez después del login del usuario.
 */
export async function initPushNotifications(userId: string) {
  // Solo funciona en dispositivos nativos
  if (!Capacitor.isNativePlatform()) {
    console.log('Push notifications solo disponibles en dispositivo nativo');
    return;
  }

  try {
    // Pedir permisos
    let permStatus = await PushNotifications.checkPermissions();

    if (permStatus.receive === 'prompt') {
      permStatus = await PushNotifications.requestPermissions();
    }

    if (permStatus.receive !== 'granted') {
      console.warn('Permisos de notificaciones denegados');
      return;
    }

    // Registrar el dispositivo
    await PushNotifications.register();

    // Listener: token recibido → guardarlo en Supabase
    PushNotifications.addListener('registration', async (token) => {
      console.log('FCM Token:', token.value);
      
      // Guardar token en el perfil del usuario
      const { error } = await supabase
        .from('profiles')
        .update({ fcm_token: token.value })
        .eq('id', userId);

      if (error) {
        console.error('Error guardando FCM token:', error);
      }
    });

    // Listener: error al registrar
    PushNotifications.addListener('registrationError', (err) => {
      console.error('Error en registro de push:', err.error);
    });

    // Listener: notificación recibida con la app abierta
    PushNotifications.addListener('pushNotificationReceived', (notification) => {
      console.log('Notificación recibida:', notification);
      // Podés mostrar un toast o actualizar un badge
    });

    // Listener: usuario tocó la notificación
    PushNotifications.addListener('pushNotificationActionPerformed', (action) => {
      console.log('Notificación tocada:', action);
      
      const data = action.notification.data;
      
      // Navegar según el tipo de notificación
      if (data?.planId) {
        window.location.href = `/planes/detalle?id=${data.planId}`;
      } else if (data?.route) {
        window.location.href = data.route;
      }
    });

  } catch (error) {
    console.error('Error inicializando push notifications:', error);
  }
}

/**
 * Eliminar registro de push (llamar al hacer logout)
 */
export async function unregisterPush() {
  if (!Capacitor.isNativePlatform()) return;
  
  try {
    await PushNotifications.removeAllListeners();
    // No hay un método unregister() directo, pero limpiamos el token
  } catch (error) {
    console.error('Error al desregistrar push:', error);
  }
}
