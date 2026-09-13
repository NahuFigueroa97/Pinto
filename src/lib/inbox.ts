'use client';

import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from './supabase';
import { useAuth } from './auth';

/**
 * Bandeja de avisos.
 *
 * La app no tenía memoria de lo que te pasaba: si el push se deslizaba sin
 * abrir, no quedaba en ningún lado. Los datos ya estaban en
 * `notification_queue`; lo único que faltaba era el `read_at` (migración
 * 019) y una pantalla.
 */

export interface Aviso {
  id: string;
  title: string;
  body: string;
  route: string | null;
  data: Record<string, unknown>;
  created_at: string;
  read_at: string | null;
}

export const UNREAD_KEY = ['avisos_sin_leer'] as const;
export const AVISOS_KEY = ['avisos'] as const;

const PAGE = 20;

/** Cuántos avisos sin leer. Alimenta el globito de la barra de navegación. */
export function useUnreadCount() {
  const { user } = useAuth();

  const { data } = useQuery({
    queryKey: [...UNREAD_KEY, user?.id],
    queryFn: async () => {
      const { data: n, error } = await supabase.rpc('unread_notification_count');
      if (error) {
        // Lo más probable: falta correr 019_bandeja_notificaciones.sql. Sin
        // globito la app funciona; en silencio, no se entiende por qué.
        console.error('[avisos] no se pudo contar los sin leer:', error.message);
        return 0;
      }
      return (n as number) ?? 0;
    },
    enabled: !!user,
    // Más corto que el resto: es la señal de "pasó algo" y tiene que
    // sentirse viva. Es un entero, no cuesta nada.
    staleTime: 15_000,
    refetchInterval: 60_000,
  });

  return data ?? 0;
}

/** La lista, paginada por cursor sobre created_at. */
export function useAvisos() {
  const { user } = useAuth();

  return useInfiniteQuery({
    queryKey: [...AVISOS_KEY, user?.id],
    initialPageParam: null as string | null,
    queryFn: async ({ pageParam }) => {
      let q = supabase
        .from('notification_queue')
        .select('id, title, body, route, data, created_at, read_at')
        .order('created_at', { ascending: false })
        .limit(PAGE);
      if (pageParam) q = q.lt('created_at', pageParam);

      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as Aviso[];
    },
    getNextPageParam: (ultima) =>
      ultima.length < PAGE ? undefined : ultima[ultima.length - 1].created_at,
    enabled: !!user,
    staleTime: 15_000,
  });
}

/** Marcar leídos: todos, o los que se pasen. */
export function useMarkRead() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (ids?: string[]) => {
      const { error } = await supabase.rpc('mark_notifications_read', {
        p_ids: ids && ids.length ? ids : null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: UNREAD_KEY });
      void queryClient.invalidateQueries({ queryKey: AVISOS_KEY });
    },
  });
}
