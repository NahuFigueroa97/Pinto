# Notificaciones push con Firebase Cloud Messaging

Estado: **implementado**. Este documento describe cómo funciona hoy y qué
falta configurar por fuera del repo.

> La versión anterior de este documento describía un diseño que nunca se
> llegó a implementar (una columna `profiles.fcm_token` que no existía en
> ninguna migración) y mencionaba el package `com.pinto.app`, que no es el
> real. Ver [AUDITORIA_2026-09.md](./AUDITORIA_2026-09.md).

---

## Arquitectura

```
  App (Capacitor)                Supabase                        FCM
  ───────────────                ────────                        ───
  initPushNotifications()
        │
        ├─ register() ──► token de FCM
        │                       │
        │                       └─► rpc register_device_token()
        │                                   └─► public.device_tokens
        │
        │
  evento de negocio            triggers de BD
  (mensaje, reserva,     ──►   notify_on_*()  ──► public.notification_queue
   solicitud, chat)                                      │
                                                         │  pg_cron (cada min)
                                                         ▼
                                            Edge Function `send-push`
                                                         │
                                                         ├─ lee device_tokens
                                                         ├─ firma un JWT con la
                                                         │  cuenta de servicio
                                                         └─► FCM HTTP v1 ──► 📱
```

Piezas:

| Pieza | Dónde |
|---|---|
| Registro / baja del token | `src/lib/pushNotifications.ts` |
| Notificación local + polling de respaldo | `src/lib/notifications.ts` |
| Tabla de tokens y cola | `supabase/migrations/011_push_checkin_blocks.sql` |
| Envío a FCM | `supabase/functions/send-push/index.ts` |
| Icono, color y canal de Android | `android/app/src/main/AndroidManifest.xml` |

### Por qué los tokens no van en `profiles`

`profiles` tiene `CREATE POLICY "profiles_select" ... USING (true)`: lo lee
cualquiera, incluso sin sesión. Un `fcm_token` ahí habría quedado público.
`device_tokens` no tiene lectura pública; la Edge Function llega con la
`service_role` key, que omite RLS.

### Por qué hay una cola y no un envío directo

El cliente no puede mandar push (no debe tener credenciales de FCM) y una
Edge Function llamada desde el cliente sería igual de manipulable. Los
triggers de la base encolan a partir de hechos ya validados por RLS.

---

## Puesta en marcha

### 1. Migraciones

En el SQL Editor de Supabase, en orden:

```
supabase/migrations/010_security_fixes.sql
supabase/migrations/011_push_checkin_blocks.sql
```

### 2. Cuenta de servicio de Firebase

Firebase Console → ⚙️ Configuración del proyecto → **Cuentas de servicio** →
*Generar nueva clave privada*. Se descarga un JSON.

Supabase Dashboard → Edge Functions → **Secrets**:

```
FCM_SERVICE_ACCOUNT = <el contenido completo del JSON, en una sola línea>
```

> Ese JSON es una credencial con permiso para mandarle push a todos tus
> usuarios. No va al repositorio.

### 3. Desplegar la función

```bash
supabase functions deploy send-push
```

### 4. Programar el envío

Habilitar `pg_cron` y `pg_net` (Dashboard → Database → Extensions) y correr:

```sql
select cron.schedule(
  'send-push',
  '* * * * *',
  $$
  select net.http_post(
    url     := 'https://<PROJECT_REF>.supabase.co/functions/v1/send-push',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer <SERVICE_ROLE_KEY>')
  );
  $$
);
```

Alternativa sin cron: un **Database Webhook** sobre `INSERT` en
`notification_queue` que llame a la misma función (llega antes, pero hace
una request por notificación).

### 5. Verificar

```sql
-- ¿se están registrando tokens?
select user_id, platform, updated_at from device_tokens order by updated_at desc limit 10;

-- ¿se encolan eventos?
select status, count(*) from notification_queue group by status;

-- ¿por qué falló alguna?
select title, error, created_at from notification_queue
where status = 'failed' order by created_at desc limit 10;
```

`status = 'skipped'` significa que el destinatario no tiene ningún
dispositivo registrado: es normal para usuarios que solo entran por web o
que nunca dieron permiso de notificaciones.

---

## Configuración de Android

Ya está en el repo, pero conviene saber qué hace cada parte:

- `android/app/google-services.json` — package `com.pinto.social`, proyecto
  `pinto-4737a`. El build **falla a propósito** si falta, en vez de compilar
  un APK sin push.
- `AndroidManifest.xml` declara `default_notification_icon`,
  `default_notification_color` y `default_notification_channel_id`. Sin
  esto, una notificación recibida con la app cerrada se dibuja con el icono
  del launcher, que Android convierte en máscara de alfa: el usuario ve un
  cuadrado blanco.
- `res/drawable/ic_stat_pinto.xml` — el icono, blanco sobre transparente.
- El canal `pinto_default` se crea desde JS en `initPushNotifications()` y
  tiene que coincidir con el `channel_id` que manda la Edge Function.
- `POST_NOTIFICATIONS` está declarado (obligatorio desde Android 13).

## Configuración de iOS

Pendiente. Falta:

1. `GoogleService-Info.plist` en `ios/App/App/`.
2. Capability **Push Notifications** en Xcode.
3. Clave APNs del Apple Developer Portal subida a Firebase.

`capacitor.config.ts` ya declara `PushNotifications.presentationOptions`.

---

## Comportamiento en la app

| Situación | Qué pasa |
|---|---|
| App cerrada / en segundo plano | Android dibuja la notificación con el icono y color de marca |
| App en primer plano | Android entrega el push a la app sin dibujar nada, así que `pushNotificationReceived` lanza una notificación local equivalente |
| El usuario la toca | Se navega a la ruta del payload, validada contra una lista blanca (`ALLOWED_ROUTE_PREFIXES`) |
| Sin permiso de notificaciones | Queda activo el polling de `notification_queue` cada 45 s |
| En web | No hay push nativo; solo el polling |

El token se borra del servidor en el `signOut()`. Si no, el próximo usuario
de ese teléfono recibiría los avisos del anterior.

## Eventos que generan push

| Trigger | Destinatario |
|---|---|
| `notify_on_business_message` | El negocio (consulta nueva) o el usuario (respuesta) |
| `notify_on_reservation` | El negocio |
| `notify_on_plan_request` | El creador del plan, y el solicitante al ser aceptado/rechazado |
| `notify_on_plan_chat` | Los miembros del plan, salteando bloqueos mutuos |
| `redeem_reservation()` | El usuario, al validar su check-in |
| `redeem_loyalty_card()` | El usuario, al canjear el premio |

Para agregar uno nuevo alcanza con llamar a
`public.enqueue_notification(user_id, title, body, route, data)` desde un
trigger `SECURITY DEFINER`.

## Probar sin esperar al cron

```sql
select public.enqueue_notification(
  '<tu-user-id>', 'Prueba', 'Hola desde Pintó', '/perfil', '{}'::jsonb
);
```

y después invocar la función a mano:

```bash
curl -X POST 'https://<PROJECT_REF>.supabase.co/functions/v1/send-push' \
  -H "Authorization: Bearer $SERVICE_ROLE_KEY"
```

Devuelve `{ processed, sent, skipped, failed, pruned }`.
