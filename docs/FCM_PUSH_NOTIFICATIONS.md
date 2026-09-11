# Notificaciones push con Firebase Cloud Messaging

Estado: **implementado y verificado en producción** (backend, 2026-09-11).
Este documento describe cómo funciona y cómo se pone en marcha.

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
                                          on_notification_queued (inmediato)
                                                         │
                                       pg_cron */5 (red de seguridad)
                                                         ▼
                                            Edge Function `send-push`
                                                         │
                                                         ├─ lee device_tokens
                                                         ├─ firma un JWT con la
                                                         │  cuenta de servicio
                                                         └─► FCM HTTP v1 ──► 📱
```

**Latencia: 1-3 segundos.** El trigger `on_notification_queued` invoca la
función apenas se encola algo; el cron cada 5 minutos solo reintenta lo que
haya quedado fallado.

Piezas:

| Pieza | Dónde |
|---|---|
| Registro / baja del token | `src/lib/pushNotifications.ts` |
| Notificación local + polling de respaldo | `src/lib/notifications.ts` |
| Tabla de tokens y cola | `supabase/migrations/011_push_checkin_blocks.sql` |
| Disparo inmediato y reintentos | `supabase/migrations/012_push_instantaneo.sql` |
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
supabase/migrations/012_push_instantaneo.sql
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

Habilitar `pg_cron` y `pg_net` (Dashboard → Database → Extensions).

La clave con la que el cron invoca la función se guarda en Vault, para que no
quede en texto plano dentro de la tabla `cron.job`:

```sql
select vault.create_secret(
  'PEGAR_ACA_LA_SERVICE_ROLE_KEY',   -- 'sb_secret_...' o el JWT service_role
  'service_role_key',
  'Para que el cron invoque send-push'
);
```

Y la URL del endpoint, que la migración 012 lee de ahí en vez de tener el
project ref hardcodeado:

```sql
select vault.create_secret(
  'https://<PROJECT_REF>.supabase.co/functions/v1/send-push',
  'edge_function_url',
  'Endpoint de send-push'
);
```

Con eso, la migración `012` deja programado el barrido cada 5 minutos:

```sql
select cron.schedule('send-push-sweep', '*/5 * * * *',
  'select public.sweep_notifications();');
```

La entrega normal **no** pasa por el cron: la hace el trigger
`on_notification_queued` en el momento. El barrido solo reencola lo que
quedó en `failed` (hasta 3 intentos, dentro de la hora) y vuelve a invocar
la función si hay algo pendiente.

> ⚠️ **El error más fácil de cometer acá.** Si el secret de Vault no existe,
> o está guardado con otro nombre, la subconsulta devuelve `NULL`,
> `'Bearer ' || NULL` da `NULL`, y pg_net **no manda el header**. La función
> responde `{"code":"UNAUTHORIZED_NO_AUTH_HEADER"}` y parece un problema de
> permisos cuando en realidad es un `NULL`. Antes de programar el cron,
> verificá qué se va a enviar:
>
> ```sql
> select jsonb_build_object(
>   'Content-Type', 'application/json',
>   'Authorization', 'Bearer ' || (
>     select decrypted_secret from vault.decrypted_secrets
>     where name = 'service_role_key'
>   )) as headers_que_se_envian;
> ```
>
> Y que la clave guardada sea la correcta y esté sola:
>
> ```sql
> select length(decrypted_secret)                as largo,
>        left(decrypted_secret, 12)              as empieza_con,
>        decrypted_secret like '%...%'           as tiene_placeholder,
>        decrypted_secret like 'sb_publishable%' as es_la_publica
> from vault.decrypted_secrets where name = 'service_role_key';
> ```
>
> `tiene_placeholder` y `es_la_publica` tienen que dar **false**. La
> `sb_publishable_` es la clave pública que va dentro del APK; la que va acá
> es `sb_secret_` (o el JWT `service_role` de *Legacy API Keys*).

### 5. Verificar

El chequeo clave es en dos etapas, porque **con la cola vacía la función ni
siquiera habla con Google**: devuelve `{"processed":0}` antes de pedir el token
OAuth. O sea que un `{"processed":0}` NO prueba que la credencial de Firebase
sirva.

**Etapa 1 — la función responde.** Invocala a mano:

```sql
select net.http_post(
  url     := 'https://<PROJECT_REF>.supabase.co/functions/v1/send-push',
  headers := jsonb_build_object(
    'Content-Type', 'application/json',
    'Authorization', 'Bearer ' || (
      select decrypted_secret from vault.decrypted_secrets
      where name = 'service_role_key'
    ))
);
```

pg_net es asíncrono: devuelve un id y la respuesta aparece unos segundos
después en otra tabla.

```sql
select status_code, left(content::text, 400)
from net._http_response order by created desc limit 1;
```

Esperado: `200` con `{"processed":0}`.

**Etapa 2 — la credencial de Firebase sirve.** Encolá algo para forzar el
OAuth:

```sql
select public.enqueue_notification(
  (select id from public.profiles limit 1),
  'Prueba', 'Validando credencial de Firebase', '/perfil', '{}'::jsonb
);
```

Volvé a invocar la función y mirá la respuesta:

| Respuesta | Qué significa |
|---|---|
| `{"processed":1,"sent":0,"skipped":1}` | ✅ **La credencial anda.** `skipped` porque todavía no hay ningún teléfono registrado |
| `{"processed":1,"sent":1}` | ✅ Y además había un dispositivo y la notificación salió |
| `{"error":"OAuth de Google falló (400)..."}` | ❌ El JSON de Firebase quedó mal pegado en el secret |

El caso bueno en una instalación nueva es **`skipped`**, no `sent`.

**Monitoreo corriente:**

```sql
-- ¿se están registrando tokens?
select user_id, platform, updated_at from device_tokens order by updated_at desc limit 10;

-- ¿se encolan eventos?
select status, count(*) from notification_queue group by status;

-- ¿por qué falló alguna?
select title, error, created_at from notification_queue
where status = 'failed' order by created_at desc limit 10;

-- ¿el cron corre? (ojo: 'succeeded' acá solo dice que encoló la request HTTP)
select status, return_message, start_time
from cron.job_run_details order by start_time desc limit 5;
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
