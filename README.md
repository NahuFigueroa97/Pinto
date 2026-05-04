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

El archivo `.env.local` ya debe existir con:

```env
NEXT_PUBLIC_SUPABASE_URL=https://ukipynbrluridibtgben.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=tu_anon_key_aqui
```

### 3. Crear tablas en Supabase

1. Ir al [Dashboard de Supabase](https://supabase.com/dashboard)
2. Abrir el **SQL Editor**
3. Ejecutar `supabase/migrations/001_schema.sql` (esquema + RLS + seed básico)
4. Ejecutar `supabase/migrations/002_seed_data.sql` (negocios y campañas demo)

### 4. Correr en desarrollo

```bash
npm run dev
```

La app estará en `http://localhost:3000`.

### 5. Build para producción

```bash
npm run build
```

### 6. Build para Android

```bash
npm run build:mobile    # Build + sync
npm run open:android    # Abre Android Studio
```

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
│   ├── favoritos/        # Favoritos del usuario
│   ├── reservas/         # Mis reservas
│   ├── perfil/           # Perfil
│   └── admin/            # Panel admin
├── components/
│   ├── layout/           # BottomNav, Header
│   └── providers/        # QueryClient, Auth
├── lib/
│   ├── supabase.ts       # Cliente Supabase
│   └── auth.tsx          # AuthContext + useAuth
├── types/
│   └── database.ts       # TypeScript types
└── supabase/
    └── migrations/       # SQL schema + seeds
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

## Roadmap post-MVP

- [ ] Notificaciones push (FCM via Capacitor)
- [ ] Chat entre usuario y negocio
- [ ] Mapas con ubicación de negocios
- [ ] Sistema de pagos para suscripciones
- [ ] Check-in con QR code
- [ ] Algoritmo de recomendaciones
