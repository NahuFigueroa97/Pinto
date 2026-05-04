# Push Notifications con Firebase Cloud Messaging (FCM)

## Requisitos previos

1. Crear proyecto en [Firebase Console](https://console.firebase.google.com/)
2. Agregar apps: Android (`com.pinto.app`) e iOS
3. Descargar `google-services.json` (Android) y `GoogleService-Info.plist` (iOS)

## Instalación

```bash
npm install @capacitor/push-notifications
npx cap sync
```

## Configuración Android

1. Copiar `google-services.json` a `android/app/`
2. En `android/build.gradle`:
```gradle
buildscript {
    dependencies {
        classpath 'com.google.gms:google-services:4.4.0'
    }
}
```
3. En `android/app/build.gradle`:
```gradle
apply plugin: 'com.google.gms.google-services'
```

## Configuración iOS

1. Copiar `GoogleService-Info.plist` a `ios/App/App/`
2. En Xcode, habilitar "Push Notifications" en Capabilities
3. Generar APNs key en Apple Developer Portal y subirla a Firebase

## Configuración Capacitor

Agregar en `capacitor.config.ts`:

```typescript
plugins: {
  PushNotifications: {
    presentationOptions: ["badge", "sound", "alert"],
  },
}
```

## Implementación en el código

```typescript
// src/lib/push.ts
import { PushNotifications } from '@capacitor/push-notifications';
import { Capacitor } from '@capacitor/core';

export async function initPush() {
  if (!Capacitor.isNativePlatform()) return;

  const perm = await PushNotifications.requestPermissions();
  if (perm.receive !== 'granted') return;

  await PushNotifications.register();

  PushNotifications.addListener('registration', (token) => {
    // Guardar token en Supabase
    console.log('FCM Token:', token.value);
    // await supabase.from('profiles').update({ fcm_token: token.value }).eq('id', userId);
  });

  PushNotifications.addListener('pushNotificationReceived', (notification) => {
    console.log('Push received:', notification);
  });

  PushNotifications.addListener('pushNotificationActionPerformed', (notification) => {
    // Navigate to relevant page based on notification data
    const data = notification.notification.data;
    if (data.plan_id) {
      window.location.href = `/planes/detalle?id=${data.plan_id}`;
    }
  });
}
```

## Enviar desde servidor

Para enviar push desde Supabase Edge Functions:

```typescript
// supabase/functions/send-push/index.ts
import { createClient } from '@supabase/supabase-js';

Deno.serve(async (req) => {
  const { user_id, title, body, data } = await req.json();

  // Obtener FCM token del usuario
  const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  const { data: profile } = await supabase.from('profiles').select('fcm_token').eq('id', user_id).single();
  if (!profile?.fcm_token) return new Response('No token', { status: 404 });

  // Enviar via FCM HTTP v1 API
  const response = await fetch(
    `https://fcm.googleapis.com/v1/projects/YOUR_PROJECT_ID/messages:send`,
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${await getAccessToken()}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        message: {
          token: profile.fcm_token,
          notification: { title, body },
          data,
        }
      })
    }
  );

  return new Response(JSON.stringify({ ok: response.ok }));
});
```

## Columna necesaria en BD

```sql
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS fcm_token text;
```

## Notas

- En web, FCM no funciona con Capacitor; se mantiene el polling actual como fallback
- El token se renueva periódicamente; actualizarlo en cada `registration` event
- Para testing, usar el composer de Firebase Console
