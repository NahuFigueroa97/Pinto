# Pintó — Plataforma de Activación Comercial Local

> "Encontrá qué hacer hoy cerca tuyo: promos, planes y experiencias reales."

## Stack

- **Frontend:** Next.js 14 + TypeScript + Tailwind CSS
- **Backend:** Supabase (Auth, Postgres, RLS)
- **State:** TanStack Query
- **Forms:** React Hook Form + Zod
- **Mobile:** Capacitor (Android/iOS)
- **Icons:** Lucide React

## Setup

### 1. Instalar dependencias

```bash
npm install
```

### 2. Configurar variables de entorno

Crear `.env.local` (no está versionado):

```env
NEXT_PUBLIC_SUPABASE_URL=https://ukipynbrluridibtgben.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=tu_anon_key_aqui
# URL pública donde están publicadas las páginas. Obligatoria para que el mail
# de recuperación de contraseña no apunte a https://localhost dentro del APK.
NEXT_PUBLIC_SITE_URL=https://tu-dominio-o-github-pages
```

> `next build` inlinea estas variables **en tiempo de build**: si cambian hay
> que recompilar y volver a hacer `cap sync`.

### 3. Crear tablas en Supabase

Ir al [Dashboard de Supabase](https://supabase.com/dashboard) → **SQL Editor**.

Si la base ya existe, primero correr `supabase/migrations/000_diagnostico.sql`:
no modifica nada y lista qué migraciones están aplicadas y cuáles no. El
historial del repo y el estado real de la base pueden no coincidir.

Después ejecutar los archivos que falten **en orden numérico**, del `001` al
`011`. Las `010` y `011` son idempotentes y arrancan con un preflight que falla
de entrada, listando todo lo que falta, si detectan migraciones previas sin
aplicar.

> ⚠️ No correr `007_avatar_storage.sql` ni la sección de Storage de
> `009_auto_cleanup.sql` **después** de la `010`: recrearían las policies
> inseguras que la 010 reemplaza. La `010` ya crea los buckets si faltan.

> `010_security_fixes.sql` corrige agujeros de seguridad reales (escalada a
> admin, fuga de chats privados, avatares sobrescribibles). No es opcional.
> Detalle en [docs/AUDITORIA_2026-09.md](docs/AUDITORIA_2026-09.md).

### 4. Correr en desarrollo

```bash
npm run dev
```

La app estará en `http://localhost:3000`.

### 5. Build para producción

```bash
npm run build
```

### 6. Notificaciones push

Requiere configuración fuera del repo (cuenta de servicio de Firebase, desplegar
la Edge Function y programarla). Paso a paso en
[docs/FCM_PUSH_NOTIFICATIONS.md](docs/FCM_PUSH_NOTIFICATIONS.md).

### 7. Build para Android

```bash
npm run build:mobile    # Build + sync
npm run open:android    # Abre Android Studio
```

Para firmar el release, crear `android/keystore.properties` (no versionado):

```properties
RELEASE_STORE_FILE=/ruta/absoluta/al/pinto.keystore
RELEASE_STORE_PASSWORD=...
RELEASE_KEY_ALIAS=...
RELEASE_KEY_PASSWORD=...
```

Sin ese archivo el build de release compila sin firmar, en vez de fallar con un
error críptico de keystore.

## Estructura del Proyecto

```
src/
├── app/                  # Páginas (App Router)
│   ├── page.tsx          # Home (feed de campañas)
│   ├── login/            # Login
│   ├── registro/         # Registro (user/business)
│   ├── explorar/         # Explorar negocios
│   ├── campana/[id]/     # Detalle de campaña
│   ├── negocio/          # Dashboard del negocio
│   │   ├── nuevo/        # Crear negocio
│   │   ├── campanas/     # Gestión de campañas
│   │   └── reservas/     # Reservas recibidas
│   │   ├── checkin/      # Lector de QR para validar reservas
│   │   └── fidelidad/    # Tarjetas de fidelidad del negocio
│   ├── favoritos/        # Favoritos del usuario
│   ├── reservas/         # Mis reservas (+ QR de check-in)
│   ├── mensajes/         # Bandeja de entrada del usuario
│   ├── planes/           # Planes sociales (chat, fotos, valorar)
│   ├── perfil/           # Perfil (+ editar, ver, eliminar cuenta)
│   ├── privacidad/       # Política de privacidad
│   ├── seguridad-infantil/
│   └── admin/            # Panel admin
├── components/
│   ├── layout/           # BottomNav, Header
│   └── providers/        # QueryClient, Auth
├── lib/
│   ├── supabase.ts       # Cliente Supabase
│   ├── auth.tsx          # AuthContext + useAuth
│   ├── pushNotifications.ts  # FCM: registro y baja del token
│   ├── notifications.ts  # Notificaciones locales + polling de respaldo
│   ├── blocks.ts         # Bloqueo de usuarios
│   ├── moderation.ts     # Filtro de contenido
│   ├── money.ts          # Parseo de importes en formato es-AR
│   ├── qr.ts             # QR de reserva
│   └── geolocation.ts    # Ubicación y distancias
├── types/
│   └── database.ts       # TypeScript types

supabase/
├── migrations/           # SQL schema + RLS + seeds (001 → 011)
└── functions/
    └── send-push/        # Edge Function que entrega los push por FCM
```

## Roles

| Rol | Acceso |
|-----|--------|
| `user` | Explorar, reservar, favoritos |
| `business` | Dashboard, campañas, métricas |
| `admin` | Gestión global, moderar, destacar |

## Decisiones Técnicas

- **Static Export** para compatibilidad con Capacitor
- **Client-side rendering** con TanStack Query para data fetching
- **RLS policies** en todas las tablas para seguridad
- **Trigger SQL** para auto-crear perfil al registrarse
- **Analytics events** table para tracking de conversiones
- **Demo user** en seed data para testing rápido

## Estado

- [x] Notificaciones push (FCM vía Capacitor) — falta configurar Firebase
- [x] Chat entre usuario y negocio
- [x] Mapas con ubicación de negocios
- [x] Check-in con QR code y programa de fidelidad
- [x] Bloqueo y denuncia de usuarios
- [ ] Sistema de pagos para suscripciones
- [ ] Algoritmo de recomendaciones
- [ ] Soporte de iOS (falta `GoogleService-Info.plist` y la clave APNs)

## Antes de publicar en Google Play

Leer [docs/AUDITORIA_2026-09.md](docs/AUDITORIA_2026-09.md): tiene el detalle de
los bugs corregidos y la lista de lo que queda por hacer fuera del repo
(migraciones, secrets de Firebase, cuestionario de Data Safety).
