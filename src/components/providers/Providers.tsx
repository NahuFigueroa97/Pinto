'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider, useAuth } from '@/lib/auth';
import { useState, useEffect, type ReactNode } from 'react';
import { initNotifications, startNotificationPolling, stopNotificationPolling } from '@/lib/notifications';

function NotificationManager() {
  const { user, role } = useAuth();

  useEffect(() => {
    if (user) {
      initNotifications().then(() => {
        startNotificationPolling(user.id, role);
      });
    } else {
      stopNotificationPolling();
    }
    return () => stopNotificationPolling();
  }, [user, role]);

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
