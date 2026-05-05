'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider, useAuth } from '@/lib/auth';
import { useState, useEffect, type ReactNode } from 'react';
import { initNotifications, startNotificationPolling, stopNotificationPolling } from '@/lib/notifications';

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
        {children}
      </AuthProvider>
    </QueryClientProvider>
  );
}
