# Auditoría técnica — Pintó · septiembre 2026

Revisión completa del repositorio con vistas a la publicación en Google Play:
notificaciones (Firebase), seguridad, corrección funcional y cumplimiento de
las políticas de la tienda.

**Alcance revisado:** 42 páginas de `src/app`, 8 módulos de `src/lib`, los 9
archivos de migración SQL, el proyecto Android completo y la configuración de
Capacitor / Next.

**Estado:** los hallazgos marcados ✅ están corregidos en este mismo cambio.
Los marcados ⚠️ requieren una acción tuya fuera del repo.

---

## Resumen

| Severidad | Hallazgos | Corregidos |
|---|---|---|
| 🔴 Bloqueante de release | 9 | 9 |
| 🟠 Alto | 14 | 14 |
| 🟡 Medio | 18 | 16 |
| 🔵 Bajo / deuda | 10 | 6 |

Lo más importante en una línea: **el build de release de Android no compilaba,
el push nunca funcionó, cualquier usuario podía volverse administrador y el
"borrado de cuenta" no borraba nada.**

---

## 🔴 Bloqueantes

### 1. El AAB de release no compilaba ✅

`res/values/styles.xml` referencia `@color/colorPrimary`, `@color/colorPrimaryDark`
y `@color/colorAccent`, pero **`res/values/colors.xml` no existía** — probablemente
`@capacitor/assets` regeneró `res/` y se lo llevó puesto.

`:app:processReleaseResources` falla con `resource color/colorPrimary not found`.
No había forma de generar el `.aab`.

→ Se creó `android/app/src/main/res/values/colors.xml` con los colores de marca.

### 2. Escalada de privilegios: cualquiera podía ser admin ✅

Dos caminos independientes, ambos explotables con solo la `anon key` (que viaja
dentro del APK y es pública por diseño):

```js
// a) desde una sesión existente
supabase.from('profiles').update({ role: 'admin' }).eq('id', miId)
// la policy profiles_update_own solo comprueba auth.uid() = id,
// no restringe qué columnas se tocan

// b) directamente en el alta
POST /auth/v1/signup { email, password, data: { role: 'admin' } }
// handle_new_user() copiaba raw_user_meta_data->>'role' sin validar
```

Por la misma vía se podía poner `is_verified: true` (insignia ✅ falsa) y
`reputation_score: 100`.

→ Trigger `protect_profile_columns()` que revierte las columnas privilegiadas, y
lista blanca de roles en `handle_new_user()`. Un usuario solo puede pasar de
`user` a `business` (el alta de negocio legítima).

### 3. El push nunca funcionó ✅

`initPushNotifications()` guardaba el token en `profiles.fcm_token`. **Esa columna
no existe en ninguna migración** — solo aparecía en la documentación. El `update`
devolvía error 42703, que se logueaba a consola y nada más.

Además no había ninguna Edge Function ni proceso que enviara nada a FCM: aunque
el token se hubiera guardado, no había emisor.

→ Ver §"Firebase" más abajo. Implementación completa.

### 4. El borrado de cuenta no borraba nada ✅

`/perfil/eliminar` decía *"permanente e irreversible"* y mostraba "Cuenta
eliminada", pero:

- `activity_feed.user_id` y `loyalty_cards.user_id` **no existen** (las columnas
  son `actor_id` y `business_id`) → error 42703 descartado;
- `plan_chat_messages`, `plan_reviews`, `user_reports`, `loyalty_stamps` y
  `reservations` **no tenían policy de DELETE** → RLS filtraba a 0 filas *sin
  devolver error*;
- el usuario de `auth.users` nunca se borraba → podía volver a iniciar sesión;
- los archivos de Storage quedaban.

En la práctica solo se renombraba el perfil a "Usuario eliminado". Google Play
exige borrado real de cuenta y datos: esto es motivo de rechazo o de baja.

→ RPC `delete_my_account()` (SECURITY DEFINER, una transacción) que borra
contenido, actividad, planes, negocio, tokens, archivos y la fila de `auth.users`.

### 5. Fuga de chats privados por sombreado de columnas en RLS ✅

```sql
CREATE POLICY "chat_select" ON plan_chat_messages FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM social_plan_members m
    WHERE m.plan_id = plan_id AND m.user_id = auth.uid()  -- ⚠️
  ));
```

`plan_id` sin calificar resuelve al `plan_id` de la tabla **interna**
(`social_plan_members`), porque en PostgreSQL el scope más cercano gana. La
condición queda `m.plan_id = m.plan_id`: siempre verdadera.

Resultado real: **cualquiera que fuera miembro de UN plan podía leer el chat
privado de TODOS los planes de la app.** Mismo bug en `chat_insert`,
`reviews_insert` y `plan_photos_insert` (permitía escribir en planes ajenos y
manipular reputaciones).

El mismo error al revés en `plans_select` (`m.plan_id = id` → `m.id`) hacía que
los miembros de un plan privado *no* pudieran verlo — ese fallaba cerrado.

→ Todas las políticas recalificadas con el nombre completo de la tabla externa.

### 6. Cualquiera podía pisar o borrar el avatar de otro ✅

Las policies de Storage de la migración 007:

```sql
-- INSERT: compara la carpeta contra el literal 'avatars', no contra el uid
WITH CHECK (bucket_id = 'avatars' AND (storage.foldername(name))[1] = 'avatars')
-- UPDATE y DELETE: solo comprueban el bucket
USING (bucket_id = 'avatars')
```

Cualquier usuario autenticado podía sobrescribir o borrar el avatar de cualquier
otro. Y `plan_photos_delete_own` usaba `(storage.foldername(name))[3]`, un índice
que no existe en la ruta real, así que nadie podía borrar sus propias fotos y los
archivos quedaban huérfanos para siempre.

→ Rutas reorganizadas a `<uid>/avatar.<ext>` y policies que comparan contra
`auth.uid()`. Límite de 5 MB y solo jpeg/png/webp a nivel bucket.

### 7. Falta el bloqueo de usuarios ✅

Google Play exige, para apps sociales con contenido generado por usuarios, un
sistema in-app de **denuncia y de bloqueo**. Pintó solo tenía denuncia, y encima
el link a `/reportar` estaba únicamente en el detalle de un plan: desde el perfil
de una persona no se podía ni reportar ni bloquear.

→ Tabla `user_blocks` + RLS, botones de bloquear/denunciar en `/perfil/ver`,
filtrado en planes, feed y chat, y bloqueo a nivel servidor de las solicitudes
para unirse.

### 8. QR de reserva falso y fidelidad inoperante ✅

`src/lib/qr.ts` dibujaba un patrón *con pinta de* QR: los tres cuadrados de las
esquinas y el resto de los módulos rellenados con
`(charCode + x*7 + y*13) % 3 !== 0`. Sin datos codificados, sin bits de formato,
sin corrección de errores. Ningún lector del mundo podía leerlo. El propio
comentario del archivo lo admitía, pero la pantalla le decía al usuario *"el
negocio escaneará tu QR"*.

Peor: **no había ningún lector en la app**, y **nada escribía nunca en
`loyalty_stamps`**, así que "Mis tarjetas de fidelidad" estaba siempre vacía por
más que el usuario visitara el local. `checkins` y `redemptions` eran tablas
muertas.

Publicar con funciones visiblemente rotas es motivo de rechazo por *Minimum
Functionality*.

→ QR real (librería `qrcode`) + código corto de 8 caracteres, pantalla
`/negocio/checkin` con lector por cámara (`BarcodeDetector`) y carga manual de
respaldo, y RPCs `redeem_reservation()` / `redeem_loyalty_card()` que registran
el check-in, suman el sello y permiten canjear el premio.

### 9. Nivel de API de Android desactualizado ✅ ⚠️

Estaba en `targetSdkVersion 35`. Play exige apuntar a un API reciente para poder
publicar (35 desde el 31/08/2025, 36 desde el 31/08/2026).

→ Se subió a 36 (`compileSdk` y `targetSdk`) y con ello AGP a 8.9.1, que es la
primera versión que soporta `compileSdk 36`. El wrapper de Gradle ya estaba en
8.11.1, que es suficiente.

⚠️ **Hay que correr un build real de Gradle**: acá no hay SDK de Android ni red
para Maven, así que el cambio de AGP no se pudo compilar.

---

## Firebase / notificaciones

El pedido explícito era revisar que "funcione bien el tema de las notificaciones
con Firebase". **No funcionaba en absoluto.** Lo que había:

| Componente | Estado antes |
|---|---|
| `google-services.json` | ✅ correcto (`com.pinto.social`, proyecto `pinto-4737a`) |
| Plugin de Gradle | ✅ aplicado |
| `POST_NOTIFICATIONS` | ✅ declarado |
| Guardado del token | ❌ columna inexistente |
| Envío desde el servidor | ❌ no existía |
| Icono de notificación | ❌ no existía el drawable |
| Canal de Android 8+ | ❌ no se creaba |
| Meta-data de FCM en el manifiesto | ❌ ausentes |
| `PushNotifications` en `capacitor.config.ts` | ❌ ausente |

### Problemas concretos corregidos ✅

**Fuga de listeners.** `initPushNotifications()` se llamaba desde
`onAuthStateChange` **en todos los eventos**, incluidos `TOKEN_REFRESHED` (cada
hora) y cada vuelta a primer plano. Cada llamada re-suscribía los 4 listeners de
Capacitor sin quitar los anteriores. Después de un día de uso, tocar una
notificación disparaba N navegaciones y N escrituras en la base.
→ Registro idempotente + solo en `INITIAL_SESSION` / `SIGNED_IN`.

**El token no se borraba al salir.** `unregisterPush()` tenía el comentario
*"limpiamos el token"* y no lo limpiaba. El siguiente usuario de ese teléfono
habría recibido los push del anterior. Problema de privacidad, no solo de UX.
→ RPC `unregister_device_token()` llamado **antes** de `signOut()` (después ya no
habría sesión con la que autenticar).

**Redirección abierta.** `window.location.href = data.route` tomaba la ruta del
payload sin validarla.
→ Lista blanca `ALLOWED_ROUTE_PREFIXES`.

**Icono roto.** El manifiesto no declaraba `default_notification_icon`, así que
Android usaba el icono del launcher a todo color y lo convertía en máscara de
alfa: un cuadrado blanco. Y las notificaciones locales pedían
`smallIcon: 'ic_stat_icon_config_sample'`, un drawable que no está en `res/`
(Android caía al icono genérico del sistema).
→ `ic_stat_pinto.xml` (blanco sobre transparente) + los tres meta-data de FCM.

**Push en primer plano invisible.** Con la app abierta, Android entrega el
mensaje a la app y no dibuja nada. No había handler.
→ `pushNotificationReceived` lanza una notificación local equivalente.

**Token de push habría sido público.** El diseño documentado lo ponía en
`profiles`, que tiene `SELECT USING (true)`.
→ Tabla `device_tokens` aparte, sin lectura pública, una fila por dispositivo.

### El polling "de respaldo" estaba roto entero ✅

`src/lib/notifications.ts` consultaba cada 30 s para generar avisos locales. Las
tres consultas fallaban:

1. `.gt('created_at', ...)` sobre `reservations` — **esa columna no existe**, es
   `reserved_at` → 42703. *Nunca* se notificó una reserva nueva.
2. El embed `profiles!business_messages_user_id_fkey` — el FK apuntaba a
   `auth.users`, no a `profiles`, así que PostgREST devolvía PGRST200. *Nunca* se
   notificó un mensaje a un negocio.
3. La marca de tiempo se tomaba del **reloj del cliente** y se comparaba contra
   `created_at` del **servidor**: con cualquier desfase se perdían o duplicaban
   avisos.

Todo dentro de `catch { /* silent */ }`, por eso nadie lo notó nunca.

→ Ahora la fuente de verdad es `notification_queue`, que llenan triggers de la
base; el polling solo actúa si el push nativo no está disponible, y avanza con el
`created_at` del servidor.

### Lo nuevo

- `public.device_tokens` — tokens por dispositivo, RLS estricta.
- `public.notification_queue` — cola que llenan los triggers.
- Triggers para: mensaje a negocio, respuesta del negocio, reserva nueva,
  solicitud de plan, respuesta a la solicitud, chat del plan, check-in y canje.
- `supabase/functions/send-push/index.ts` — Edge Function que firma un JWT
  RS256 con la cuenta de servicio, llama a FCM HTTP v1, marca el resultado y
  purga los tokens de aparatos que desinstalaron la app.

⚠️ **Falta tu parte:** cargar el secret `FCM_SERVICE_ACCOUNT`, desplegar la
función y programarla. Paso a paso en
[FCM_PUSH_NOTIFICATIONS.md](./FCM_PUSH_NOTIFICATIONS.md).

---

## 🟠 Altos

| # | Hallazgo | Estado |
|---|---|---|
| 10 | **XSS en el mapa.** `/cerca` interpolaba `item.title` (texto de usuario) crudo en el HTML del popup de Leaflet. Un plan llamado `<img src=x onerror=...>` ejecutaba JS dentro del WebView, con acceso a la sesión de Supabase en localStorage y a los plugins de Capacitor. | ✅ `textContent` y nodos del DOM |
| 11 | **Bandeja del negocio siempre vacía.** El mismo embed roto de arriba hacía que `/negocio/mensajes` mostrara "Sin mensajes aún" aunque hubiera consultas. El negocio no podía leer ni responder a ningún cliente. | ✅ FK reapuntado a `profiles` |
| 12 | **El usuario no podía leer las respuestas.** Podía escribirle a un negocio desde `/campana`, pero no existía ninguna pantalla de bandeja de entrada. La conversación era de ida nada más. | ✅ Nueva `/mensajes` |
| 13 | **"Reservas por aprobar" siempre vacía.** `.order('created_at')` sobre `reservations` → 42703 → `data` null. El panel del negocio nunca mostró una reserva. | ✅ `reserved_at` |
| 14 | **Suplantación en el feed.** `feed_insert WITH CHECK (true)`: cualquiera podía insertar actividad con el `actor_id` de otra persona. | ✅ `actor_id = auth.uid()` |
| 15 | **Planes privados en el feed público.** El trigger publicaba el título de *todos* los planes, incluidos los marcados como privados, y `feed_select` es público. | ✅ Trigger filtra por visibilidad + se limpian los existentes |
| 16 | **Sellos de fidelidad auto-otorgados.** `stamps_insert WITH CHECK (true)`: cualquiera podía insertarse una tarjeta con `stamps_count = 999` y reclamar el premio. | ✅ Solo el dueño del negocio |
| 17 | **Suplantación de negocios en el chat.** `FOR ALL USING (user_id = auth.uid())` dejaba a un usuario insertar mensajes con `sender_role = 'business'`, haciéndose pasar por el local. | ✅ Policies separadas por rol |
| 18 | **Moderación saltada.** Los negocios se creaban con `status: 'active'` mandado desde el cliente, salteando el circuito de aprobar/rechazar del panel de admin. Igual con `is_featured` en campañas. | ✅ Triggers que fuerzan `pending` |
| 19 | **GPS exacto público.** Al crear un plan se guardaba la ubicación precisa del creador, y `plans_select` es público: cualquiera, incluso sin sesión, podía leer coordenadas exactas de personas. | ✅ Redondeo a ~110 m |
| 20 | **`profiles.latitude/longitude` públicas.** Nunca se escribían ni se leían, pero con `SELECT USING (true)` habrían quedado expuestas el día que alguien las usara. | ✅ Columnas eliminadas |
| 21 | **La limpieza diaria nunca corría.** `run_all_cleanups()` consultaba `public.notifications`, una tabla que no existe. La función abortaba entera, así que *ninguna* limpieza se ejecutaba. | ✅ Referencia eliminada |
| 22 | **El admin no podía verificar perfiles.** El botón "✅ Verificar" hacía un `update` sobre `profiles` ajenos, que `profiles_update_own` bloquea. Actualizaba 0 filas en silencio. | ✅ Policy de admin |
| 23 | **Métricas inflables.** `analytics_insert WITH CHECK (true)` permitía inflar las vistas de cualquier negocio desde afuera, sin sesión. | ✅ Requiere sesión |

---

## 🟡 Medios

| # | Hallazgo | Estado |
|---|---|---|
| 24 | **Las fuentes nunca se cargaban.** El `@import url(fonts.googleapis.com)` de `globals.css` estaba después de `@tailwind`, o sea después de miles de reglas. Por especificación CSS, un `@import` que no está al principio de la hoja es inválido y el navegador lo descarta: Inter y Outfit no se aplicaban en ninguna pantalla. Verificado en el CSS compilado (offset 36901 de 41454). Además, en una app empaquetada pedir las fuentes por red significa sin conexión = sin fuentes, y la IP del usuario a Google en cada arranque. | ✅ `next/font/google`, self-hosted en el APK |
| 25 | **"¡Clave actualizada!" mentiroso.** `/actualizar-clave` corría `Promise.race` contra un `setTimeout(5000)` que resolvía `{ error: null }`: si la llamada tardaba, la pantalla anunciaba éxito aunque la contraseña **no** se hubiera cambiado. | ✅ Sin race |
| 26 | **Recuperación de contraseña rota en el celular.** `redirectTo` caía en `window.location.origin`, que en el APK es `https://localhost` (lo fija Capacitor). El mail llevaba a un host inexistente. | ✅ Exige `NEXT_PUBLIC_SITE_URL` ⚠️ hay que definirla |
| 27 | **Marcadores invisibles en el mapa.** Leaflet deriva `marker-icon-2x.png` y `marker-shadow.png` por sustitución de texto; el bundler solo emite `marker-icon.png`, así que en cualquier pantalla retina (todos los celulares) daban 404. | ✅ `divIcon` propio |
| 28 | **Importes mil veces menores.** Al aprobar una reserva se hacía `parseFloat(price_text.replace(...))`: `"$1.500"` → `1.5`. Cada ingreso se registraba mil veces por debajo. Y en gastos, `type="number"` rechazaba `1.500,50` y `parseFloat` daba `NaN` → insert fallido (la columna es NOT NULL). | ✅ `src/lib/money.ts` con tests, y el importe lo confirma el negocio |
| 29 | **Horarios que se corrían 3 h por edición.** `new Date(x).toISOString().slice(0,16)` devuelve UTC y se metía en un `datetime-local`, que es hora local. En Argentina (UTC−3) cada edición desplazaba la campaña 3 horas más. | ✅ Conversión local |
| 30 | **Moderación con falsos positivos masivos.** El filtro usaba `includes()` por subcadena con términos como `arma`, `hotel`, `cama`, `oral`, `anal`, `pete`, `hot`. Bloqueaba *"armamos una juntada"*, *"en el Hotel Ancasti"*, *"competencia de pádel"*, *"análisis de laboratorio"*, *"salimos del canal"*… | ✅ Límites de palabra, con pruebas |
| 31 | **Contenido sin moderar.** El filtro solo corría en el título y la descripción de un plan. Bio, nombre, mensajes de chat y consultas a negocios pasaban sin filtro. | ✅ Aplicado en los 4 lugares |
| 32 | **Filtro de categoría inerte.** La `queryKey` de `/planes` no incluía `catFilter`: react-query servía el caché y los botones parecían no hacer nada. | ✅ |
| 33 | **Panel de admin con 3 etiquetas para 5 tabs.** "Verificaciones" y "Métricas" se dibujaban las dos como "Reportes". | ✅ |
| 34 | **Spinners infinitos.** `/negocio/mensajes`, `/negocio/finanzas` y `/negocio/fidelidad` hacían `if (!business) return <spinner/>`: una cuenta de negocio sin negocio creado se quedaba girando para siempre. | ✅ Estado vacío con CTA |
| 35 | **"1 clientes participando" siempre.** PostgREST devuelve el agregado como `[{count: N}]`; la vista hacía `.length`, que da 1 (o 0) tenga 0 o 300 clientes. | ✅ |
| 36 | **Fotos huérfanas en Storage.** La ruta repetía el nombre del bucket (`plan-photos/<plan>/...`), así que la policy de borrado nunca coincidía, y al borrar una foto solo se eliminaba la fila de la base: el archivo seguía público para siempre. | ✅ Ruta corregida + borrado del objeto |
| 37 | **Imágenes base64 dentro de Postgres.** El fallback de subida guardaba la foto entera como data URL en una columna `text`, y se devolvía completa en cada listado. | ✅ Compresión más fuerte y tope de 200 KB |
| 38 | **Errores tragados.** `catch {}` y `if (!data) return []` en varias consultas convertían fallos de la base en "no hay resultados". Es la razón de que varios de estos bugs convivieran meses sin detectarse. | ✅ En las rutas críticas |
| 39 | **Sin confirmación de edad ni consentimiento.** `/seguridad-infantil` declara un mínimo de 13 años, pero el alta no preguntaba nada ni enlazaba la política de privacidad. | ✅ Checkbox obligatorio con enlaces |
| 40 | **Páginas legales inalcanzables.** `/privacidad` y `/seguridad-infantil` existían pero no estaban enlazadas desde ningún lado: eran rutas muertas. | ✅ Pie de `/perfil` |
| 41 | **Permiso de ubicación sin contexto.** `useUserLocation()` llama a `requestLocation()` en el `useEffect` de montaje, así que abrir la pestaña Planes dispara el diálogo de GPS sin explicar para qué. Play pide *prominent disclosure*. | ⬜ Ver pendientes |

---

## 🔵 Bajos / deuda

| # | Hallazgo | Estado |
|---|---|---|
| 42 | `android:allowBackup="true"` copiaba el `localStorage` del WebView —donde vive el token de sesión de Supabase— al backup de Google Drive. | ✅ `false` |
| 43 | Sin `<uses-feature required="false">`: Play excluía del catálogo a los dispositivos sin GPS o sin cámara. | ✅ |
| 44 | Sin `keystore.properties`, `signingConfig` apuntaba a `storeFile '/dev/null'` y el build fallaba con un error críptico de keystore. | ✅ Config condicional |
| 45 | `google-services.json` faltante se tragaba con un `try/catch`: el APK compilaba igual, sin push y sin pista de por qué. | ✅ Falla con mensaje claro |
| 46 | `versionName "1.0"` contra `2.0.0` en `package.json`. | ✅ Alineados |
| 47 | `/planes/mis-planes` no está enlazada desde ningún lado. | ⬜ |
| 48 | `checkins` y `redemptions` eran tablas muertas. | ✅ Las usa el check-in |
| 49 | **`@capacitor/cli` en v7 con todo lo demás en v8.** Capacitor exige que el CLI coincida en major con `core` y las plataformas; un CLI v7 puede generar mal `capacitor.build.gradle` / `capacitor.settings.gradle`. | ✅ CLI a `^8.3.1`, `cap sync android` verificado |
| 50 | `*.jks` y `*.keystore` estaban **comentados** en `android/.gitignore`. Si la keystore de firma se sube y se filtra, no hay forma de revocarla: Play te ata a esa clave de por vida. | ✅ Descomentados |
| 51 | 44 archivos de `android/.next/` (salida de `next build`) están versionados por error. | ⬜ `git rm -r --cached android/.next` (ya está en `.gitignore`) |

---

## ⚠️ Pendientes que dependen de vos

1. **Compilar el Android.** Acá no hay SDK ni red para Maven. Correr
   `npm run build:mobile && cd android && ./gradlew bundleRelease` y verificar
   el salto de AGP 8.7.2 → 8.9.1 y `compileSdk 36`.

2. **Aplicar las migraciones.** Antes, correr `000_diagnostico.sql`: el estado
   real de la base **no coincide** con el historial del repo (al intentar la
   `010` falló con `relation "public.business_messages" does not exist`, o sea
   que la `005` nunca se aplicó). El diagnóstico no modifica nada y lista qué
   falta.

   Después, las que falten en orden, y por último `010` y `011`. Ambas son
   idempotentes y arrancan con un preflight que falla de entrada listando todo
   lo que falta, en vez de morirse a mitad de camino con un 42P01.

   - La `010` **elimina** `profiles.latitude` y `profiles.longitude` (columnas
     que la app nunca escribió) y **crea los buckets de Storage si faltan**.
   - No correr `007` ni la sección de Storage de `009` *después* de la `010`:
     recrearían las policies inseguras que la `010` reemplaza.
   - Si falta la `005`, la función "Consultale al negocio" viene fallando en
     producción desde siempre: la tabla `business_messages` no existe.

3. **Configurar el envío de push**: secret `FCM_SERVICE_ACCOUNT`, desplegar
   `send-push`, programar el cron. Ver
   [FCM_PUSH_NOTIFICATIONS.md](./FCM_PUSH_NOTIFICATIONS.md).

4. **Definir `NEXT_PUBLIC_SITE_URL`** en `.env.local` apuntando a donde estén
   publicadas las páginas (por ejemplo la GitHub Pages de `docs/`). Sin esto la
   recuperación de contraseña muestra un error explícito en vez de mandar un mail
   que no sirve. Ojo: `.env.local` no está en el repo y `next build` inlinea
   estas variables **en tiempo de build**.

5. **Revisar los negocios ya existentes.** Ahora las altas entran como
   `pending`. Los que estaban en `active` siguen así, pero conviene mirarlos.

6. **Programar `run_all_cleanups()`** con `pg_cron` — nunca llegó a activarse.

7. **`android:allowBackup="false"`** hace que los usuarios pierdan el estado
   local al cambiar de teléfono. Es lo correcto para una app con tokens de
   sesión, pero confirmalo.

8. **Prominent disclosure de ubicación (#41).** Play pide una pantalla propia,
   antes del diálogo del sistema, que explique para qué se usa el GPS. Hoy el
   permiso se pide al montar `/planes`. Es un cambio de flujo, no un bug: lo dejé
   documentado en vez de rediseñar la navegación por mi cuenta.

9. **Dependencias.** `npm audit` marca 1 crítica y 3 altas, todas de `next@14.2.35`
   (la última de la rama 14) y de `ws` vía `@supabase/realtime-js`. En la
   práctica **no aplican a esta app**: los avisos de Next son del servidor
   (Image Optimizer, Server Actions, middleware, rewrites) y acá se usa
   `output: 'export'`, o sea un bundle estático dentro del APK sin servidor; y
   verifiqué que `ws` no entra al bundle (es la implementación de Node y la app
   no usa Realtime). Aun así conviene planificar el salto a Next 15/16 fuera del
   ciclo de release.

10. **Play Console**: cuestionario de Data Safety (declarar ubicación, fotos,
    mensajes e identificador de dispositivo), URL de la política de privacidad,
    URL de estándares de seguridad infantil, y clasificación de contenido
    coherente con una app social con chat y fotos.

---

## Verificación hecha

| Qué | Cómo | Resultado |
|---|---|---|
| Tipos | `npx tsc --noEmit` | Sin errores |
| Lint | `npx next lint` | Solo avisos de `<img>` (correctos: el export estático usa `unoptimized`) |
| Build web | `npx next build` | 44 rutas generadas |
| Fuentes | Inspección del CSS compilado | 38 `@font-face`, 9 `.woff2` en el bundle, cero `@import` remotos |
| SQL | Parser real de PostgreSQL (`pglast`) sobre las 11 migraciones | 383 sentencias, sin errores de sintaxis |
| plpgsql | `parse_plpgsql` sobre los cuerpos de función | 33 funciones, sin errores |
| Parser de importes | Casos es-AR (`$1.500`, `1.500,50`, `1,500.50`, `2x1`, …) | 14/14 |
| Moderación | 10 frases legítimas + 8 que deben bloquearse | 18/18 |
| Cruce esquema↔código | Script que compara cada columna usada contra el DDL | Las 3 discrepancias encontradas, corregidas |
| Capacitor | `npx cap sync android` | OK: 8 plugins detectados, `capacitor.config.json` con el bloque `PushNotifications` |
| Recursos Android | Parseo XML de manifiesto y `res/` | Bien formados; el `pathData` del icono tiene 2 subpaths cerrados y `fillType="evenOdd"` |
| Build Android | — | ⚠️ **No ejecutado**: no hay SDK de Android en este entorno |
| Push en dispositivo | — | ⚠️ **No ejecutado**: requiere el secret de FCM y un teléfono |

---

## Anexo — Spinners sin salida (13/09)

El spinner infinito volvió cinco veces en pantallas distintas. Cada vez se
arregló esa pantalla; cada vez reapareció en otra. El problema no era
ninguna de ellas.

### Las tres causas reales

1. **`fetchWithTimeout` confiaba en el `AbortController`.** Llamaba a
   `controller.abort()` a los 20 s y devolvía la promesa de `fetch` tal
   cual. Eso da por sentado que `fetch` honra el abort — y el WebView de
   Android, con la red inestable, a veces deja la promesa sin resolver *ni*
   rechazar aunque la aborten. Cuando pasa, react-query se queda en
   `pending` para siempre: ni error, ni reintento, ni timeout. Ahora el
   plazo es un `Promise.race` contra un temporizador que **rechaza**, así
   que se cumple colabore o no el WebView.

2. **`onAuthStateChange` sin `try/finally`.** Si `fetchProfile` fallaba, el
   callback quedaba rechazado y `setLoading(false)` no corría nunca. Toda
   pantalla que mira `auth.loading` —o sea casi todas— quedaba cargando
   hasta reiniciar la app. Bastaba un fallo de red al abrirla. Se agregó
   `finally`, `.catch()` en el `getSession()` de respaldo, y un límite de
   15 s como último recurso: es mejor arrancar sin sesión que no arrancar.

3. **No había ningún error boundary.** Un error de render desmontaba el
   árbol entero y dejaba la pantalla en blanco o congelada en el fallback
   de `<Suspense>`, sin mensaje. En el navegador queda el stack en la
   consola; en el teléfono de alguien, nada.

### La garantía estructural

Las causas puntuales se arreglan, pero la forma `if (isLoading) return
<spinner/>` —32 veces en el repo— vuelve a aparecer en la próxima pantalla
que alguien escriba. Por eso:

- **`<PageSpinner>`**: a los 10 s ofrece reintentar, volver, ir al inicio y
  abrir el diagnóstico. Reemplaza los 32 spinners crudos y los 13
  *fallbacks* de `<Suspense>`. No adivina la causa; garantiza que ninguna
  pantalla sea un callejón sin salida.
- **`npm run check:spinners`**, dentro de `npm run verify`: falla si
  aparece una rueda de carga que no pase por `<PageSpinner>` o
  `<QueryState>`.

### De paso

- `perfil/ver` y `planes/detalle` mostraban "no encontrado" ante un error
  de red o de RLS. Un fallo y una ausencia no son lo mismo.
- **Visto del chat**: `mark_chat_read` solo corría al montar y dentro del
  efecto de auto-scroll condicionado a `atBottom`, que en pleno scroll
  suave vale `false`. Si abrías el chat y te quedabas adentro, tu marca de
  lectura quedaba clavada en el momento en que entraste: los mensajes
  posteriores no contaban como leídos ni siquiera al responderlos, y quien
  los mandó veía "Todavía no lo vio nadie" para siempre. Ahora se marca con
  cada mensaje nuevo y al volver del segundo plano, con guarda de
  `visibilityState` para no mentir, y el error del RPC se muestra en vez de
  tragarse con `void`.

---

## Anexo — Auditoría para uso masivo (13/09)

### Privacidad: el feed era la punta del iceberg

"En el feed sale quién se une a cuál plan, debería ser secreto."

Correcto, y había algo bastante peor debajo. La policy
`members_select USING (true)` dejaba que **cualquiera, incluso sin sesión**,
listara todos los miembros de todos los planes. Una sola consulta bajaba el
grafo social completo de la ciudad: quién sale con quién y a dónde. Tapar la
línea del feed y dejar eso abierto no habría arreglado nada.

`017_privacidad_social.sql`:

- La lista de miembros la ve sólo quien es del plan. Para el resto, el plan
  dice cuánta gente va, no quién.
- El feed deja de publicar `joined_plan` (trigger y función eliminados, filas
  existentes borradas). Crear un plan público es deliberado; sumarse a uno no.
- El feed deja de ser legible sin sesión.
- Efecto colateral bueno: en el perfil de otra persona, "planes recientes"
  pasa a mostrar sólo los que compartieron con vos, porque la policy filtra
  el resto. Se renombró para que diga lo que muestra.

La policy no puede consultar `social_plan_members` directamente —RLS sobre
una tabla que se lee a sí misma entra en recursión infinita—, así que el
`EXISTS` va en una función `SECURITY DEFINER`.

### Rendimiento: por qué se sentía lenta la mensajería

El chat bajaba **200 mensajes con el perfil embebido cada 3 segundos**. Con
mil chats abiertos son unas 300 consultas por segundo devolviendo 200 filas
cada una.

Y escondido ahí, un bug de fondo: `.order('created_at', ascending: true)
.limit(200)` trae los 200 mensajes **más viejos**. En cuanto un chat pasara
de 200, la gente se quedaba mirando el historial antiguo y los mensajes
nuevos no aparecían nunca.

Ahora la primera carga trae los últimos 50 y el sondeo pide sólo lo
posterior al último mensaje que ya se tiene: casi siempre cero filas. El
corte sale del `created_at` de una fila que vino del servidor, así que no
depende del reloj del teléfono. Botón "ver mensajes anteriores" para el
historial.

Lo mismo en el resto:

- Los listados mostraban "3/6" embebiendo las filas de miembros sólo para
  contarlas, en seis pantallas. Ahora es `social_plans.members_count`,
  mantenido por trigger: cuesta lo mismo con 10 planes que con 100.000.
- El feed pagina por cursor en tandas de 20, con columnas explícitas y sin
  sondeo (se refresca al entrar, al tocar Actualizar y cuando llega una
  notificación). Antes traía 50 filas cada 15 s y no había forma de ver nada
  más viejo que eso.
- `/planes` tenía `limit(30)` sin decirlo: ahora hay "ver más planes".
- Índice parcial `idx_social_plans_listado` con exactamente las condiciones
  del listado (`status='open' AND visibility='public'`, ordenado por fecha).

### Abuso: la clave anónima viaja en el APK

Es pública por diseño, así que **todo lo que se valide sólo en el cliente no
se valida**. No había ningún límite: con un script y esa clave se podía
inundar el chat de un plan o crear diez mil planes. Ni siquiera hace falta
mala intención — un bucle mal escrito alcanza.

`018_limites_abuso.sql` agrega límites holgados (20 mensajes/minuto, 10
planes/día, 40 solicitudes/día, 20 denuncias/día) y un tope de 2.000
caracteres por mensaje.

**Lo que deliberadamente NO se hizo**: replicar el filtro de palabras en SQL.
Se desincroniza de la lista del cliente en la primera corrección, y los
falsos positivos en un chat entre amigos —donde se putea de cariño— cuestan
más de lo que evitan. Lo que Google Play exige para contenido de usuarios es
que haya forma de denunciar y de bloquear, y las dos existen. Si en algún
momento hace falta filtrar de verdad, el lugar es un trigger que **marque
para revisión**, no una lista que rebote mensajes.

### Visto: "no sale bien la info"

El panel mostraba el mensaje recortado a una línea y una hora sin explicar de
qué era. La marca de lectura es **una por persona y por plan**, no una por
mensaje: decir "lo leyó a las 14:32" sería inventar. Ahora muestra el mensaje
completo con su hora de envío, avatares, leídos y pendientes, y dice
explícitamente que la hora es la de la última vez que esa persona abrió el
chat.

### Lo que queda pendiente para escalar de verdad

1. **Realtime en lugar de sondeo.** El chat pasó de 200 filas cada 3 s a
   ~0 filas cada 4 s, pero sigue siendo una petición por chat abierto. Con
   Supabase Realtime serían cero hasta que pase algo. Es el próximo salto,
   y obliga a revisar que `ws` no entre al bundle del APK.
2. **Imágenes sin redimensionar.** Los avatares y las fotos se sirven al
   tamaño original desde Storage. Supabase tiene transformaciones; hoy una
   foto de 4 MB se baja entera para mostrarla en 96 píxeles.
3. **Fan-out de notificaciones.** `notify_on_plan_chat` inserta una fila en
   `notification_queue` por miembro y por mensaje. Con grupos grandes y
   mucho tráfico conviene agrupar.
