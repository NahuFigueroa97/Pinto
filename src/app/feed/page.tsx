'use client';

import Link from 'next/link';
import { useInfiniteQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { Clock, ChevronRight, RefreshCw } from 'lucide-react';
import { useBlockedIds, filterBlocked } from '@/lib/blocks';
import { PageSpinner } from '@/components/shared/PageSpinner';

// `joined_plan` se saco a proposito (ver 017_privacidad_social.sql): sumarse
// a un plan no es un acto publico y se publicaba con nombre y titulo para
// todo el mundo. El trigger ya no lo genera y las filas viejas se borraron.
const ACTION_LABELS: Record<string, { emoji: string; text: (m: any) => string }> = {
  created_plan: { emoji: '🎉', text: (m) => `creó el plan "${m?.title || ''}"` },
  completed_plan: { emoji: '✅', text: (m) => `completó "${m?.title || ''}"` },
  reviewed: { emoji: '⭐', text: () => `dejó una valoración` },
  uploaded_photo: { emoji: '📸', text: () => `subió una foto de la juntada` },
};

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'Ahora';
  if (mins < 60) return `Hace ${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `Hace ${hrs}h`;
  const days = Math.floor(hrs / 24);
  return `Hace ${days}d`;
}

/** Tamaño de tanda del feed. */
const FEED_PAGE = 20;

export default function FeedPage() {
  const { blockedSet } = useBlockedIds();

  /**
   * Feed paginado por cursor.
   *
   * Antes traía 50 filas con `select('*')` y el perfil embebido, y las
   * volvía a pedir cada 15 segundos. Multiplicado por toda la gente con la
   * app abierta eso es un goteo constante y caro para algo que cambia cada
   * varios minutos; y sin paginación el feed nunca podía mostrar más de 50
   * cosas por más que hubiera.
   *
   * Ahora: tandas de 20, cursor por `created_at` (hay índice descendente),
   * columnas explícitas y sin sondeo. Se refresca al entrar, al tocar
   * Actualizar y cuando llega una notificación (ver NotificationRouter).
   */
  const {
    data, isLoading, error, refetch, isFetching,
    fetchNextPage, hasNextPage, isFetchingNextPage,
  } = useInfiniteQuery({
    queryKey: ['activity_feed'],
    initialPageParam: null as string | null,
    queryFn: async ({ pageParam }) => {
      let q = supabase
        .from('activity_feed')
        .select('id, actor_id, action, target_type, target_id, metadata, created_at, actor:profiles(full_name, avatar_url)')
        .order('created_at', { ascending: false })
        .limit(FEED_PAGE);
      if (pageParam) q = q.lt('created_at', pageParam);

      const { data: rows, error: queryError } = await q;
      // El error se descartaba con `data ?? []`, así que un fallo de RLS o
      // de red se veía igual que "no hay actividad".
      if (queryError) throw queryError;
      return rows ?? [];
    },
    getNextPageParam: (ultima) =>
      ultima.length < FEED_PAGE ? undefined : (ultima[ultima.length - 1] as { created_at: string }).created_at,
    staleTime: 30_000,
  });

  // La actividad de personas bloqueadas no aparece en el feed
  const visibleFeed = filterBlocked<any>(data?.pages.flat(), blockedSet, item => item.actor_id);

  return (
    <div className="max-w-lg mx-auto pb-6">
      <header className="px-4 pt-6 pb-3 flex items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-display font-bold">📣 Actividad</h1>
          <p className="text-sm text-gray-500">Lo que está pasando en Pintó</p>
        </div>
        {/* Sin sondeo automático, el refresco tiene que ser explícito. */}
        <button
          onClick={() => void refetch()}
          disabled={isFetching}
          aria-label="Actualizar"
          className="p-2 -mr-1 text-gray-400 disabled:opacity-40"
        >
          <RefreshCw size={17} className={isFetching ? 'animate-spin' : ''} />
        </button>
      </header>

      <div className="px-4 space-y-2">
        {isLoading ? (
          <PageSpinner fullScreen={false} />
        ) : error ? (
          <div className="text-center py-16">
            <p className="text-4xl mb-3">😕</p>
            <p className="text-gray-600 font-medium">No se pudo cargar la actividad</p>
            <p className="text-xs text-gray-400 mt-1 px-6">{(error as Error).message}</p>
            <button
              onClick={() => refetch()}
              disabled={isFetching}
              className="mt-4 px-5 py-2.5 bg-brand-500 text-white rounded-xl font-medium text-sm disabled:opacity-50"
            >
              {isFetching ? 'Reintentando...' : 'Reintentar'}
            </button>
          </div>
        ) : !visibleFeed.length ? (
          <div className="text-center py-16 text-gray-400">
            <p className="text-4xl mb-3">📣</p>
            <p>Todavía no hay actividad</p>
          </div>
        ) : (
          visibleFeed.map((item: any) => {
            const action = ACTION_LABELS[item.action] || { emoji: '📋', text: () => item.action };
            return (
              <Link key={item.id}
                href={item.target_type === 'plan' ? `/planes/detalle?id=${item.target_id}` : '#'}
                className="flex items-center gap-3 p-3 bg-white rounded-xl border border-gray-100 shadow-sm">
                <span className="text-xl">{action.emoji}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm">
                    <span className="font-semibold">{item.actor?.full_name}</span>{' '}
                    <span className="text-gray-600">{action.text(item.metadata)}</span>
                  </p>
                  <p className="text-xs text-gray-400 mt-0.5 flex items-center gap-1">
                    <Clock size={10} /> {timeAgo(item.created_at)}
                  </p>
                </div>
                <ChevronRight size={14} className="text-gray-300 shrink-0" />
              </Link>
            );
          })
        )}

        {hasNextPage && !isLoading && !error && (
          <button
            onClick={() => void fetchNextPage()}
            disabled={isFetchingNextPage}
            className="w-full py-3 text-sm font-medium text-gray-500 bg-white border border-gray-100 rounded-xl disabled:opacity-50"
          >
            {isFetchingNextPage ? 'Cargando...' : 'Ver más actividad'}
          </button>
        )}
      </div>
    </div>
  );
}
