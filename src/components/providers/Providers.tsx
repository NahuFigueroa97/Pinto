'use client';

import { QueryClient, QueryClientProvider, useQueryClient } from '@tanstack/react-query';
import { AuthProvider, useAuth } from '@/lib/auth';
import { useState, useEffect, type ReactNode } from 'react';
import { initNotifications, startNotificationPolling, stopNotificationPolling } from '@/lib/notifications';
import { onNavigationRequest, navigateTo } from '@/lib/navigation';
import { useRouter, usePathname } from 'next/navigation';
import { ErrorBoundary } from '@/components/shared/ErrorBoundary';

function NotificationManager() {
  // Se depende de user.id y no del objeto `user`: supabase-js devuelve una
  // instancia nueva en cada refresco de token, así que con [user] el efecto
  // se reejecutaba cada hora y reiniciaba el polling sin necesidad.
  const userId = useAuth().user?.id ?? null;

  useEffect(() => {
    if (!userId) {
      stopNotificationPolling();
      return;
    }
    let cancelled = false;
    initNotifications().then(() => {
      if (!cancelled) startNotificationPolling(userId);
    });
    return () => {
      cancelled = true;
      stopNotificationPolling();
    };
  }, [userId]);

  return null;
}

/**
 * Ejecuta las navegaciones que piden los listeners de notificación.
 *
 * Antes esos listeners hacían window.location.assign(), o sea una petición
 * real al servidor local de Capacitor. Cuando ese servidor no resolvía la
 * ruta caía al index.html de la raíz y el usuario terminaba en la home, sin
 * el parámetro. Con router.push() la navegación es del lado del cliente:
 * no hay petición, no hay 404 y el query string llega intacto.
 */
function NotificationRouter() {
  const router = useRouter();
  const queryClient = useQueryClient();

  useEffect(() => onNavigationRequest((route) => {
    // Una notificación significa que algo cambió en el servidor. Con
    // staleTime de 60 s, react-query servía lo que tenía cacheado y la
    // pantalla de destino mostraba datos viejos: llegaba el aviso de "X
    // quiere sumarse", se abría el plan y la solicitud no estaba hasta
    // reiniciar la app.
    //
    // invalidateQueries() sin filtro solo refetchea las consultas activas,
    // así que el costo real es el de la pantalla a la que se entra.
    void queryClient.invalidateQueries();

    try {
      router.push(route);
    } catch {
      // Si el router no está disponible por lo que sea, al menos intentar
      // la navegación dura con la barra final normalizada.
      navigateTo(route);
    }
  }), [router, queryClient]);

  return null;
}

/**
 * El boundary se reinicia al cambiar de ruta.
 *
 * Sin la `key`, una pantalla que explotó dejaba el mensaje de error fijo:
 * el estado del boundary sobrevive a la navegación y el usuario veía "algo
 * se rompió" incluso en pantallas sanas.
 */
function RouteErrorBoundary({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  return <ErrorBoundary key={pathname}>{children}</ErrorBoundary>;
}

export function Providers({ children }: { children: ReactNode }) {
  const [queryClient] = useState(() => new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 1000 * 60,       // 1 min
        gcTime: 1000 * 60 * 5,      // 5 min
        retry: 1,
        refetchOnWindowFocus: false,
      },
    },
  }));

  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <NotificationManager />
        <NotificationRouter />
        <RouteErrorBoundary>{children}</RouteErrorBoundary>
      </AuthProvider>
    </QueryClientProvider>
  );
}
