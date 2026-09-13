'use client';

import Link from 'next/link';
import { useInfiniteQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { Clock, ChevronRight, RefreshCw } from 'lucide-react';
import { useBlockedIds, filterBlocked } from '@/lib/blocks';
import { PageSpinner } from '@/components/shared/PageSpinner';
import { SkeletonLista } from '@/components/shared/Skeleton';
import { PullToRefresh } from '@/components/shared/PullToRefresh';

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
    <PullToRefresh onRefresh={() => refetch()}>
    <div className="max-w-lg mx-auto pb-6">
      <header className="px-4 pt-6 pb-3 flex items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-display font-bold">📣 Actividad</h1>
          <p className="text-sm text-muted">Lo que está pasando en Pintó</p>
        </div>
        {/* Sin sondeo automático, el refresco tiene que ser explícito. */}
        <button
          onClick={() => void refetch()}
          disabled={isFetching}
          aria-label="Actualizar"
          className="p-2 -mr-1 text-faint disabled:opacity-40"
        >
          <RefreshCw size={17} className={isFetching ? 'animate-spin' : ''} />
        </button>
      </header>

      <div className="px-4 space-y-2">
        {isLoading ? (
          <PageSpinner fullScreen={false} onRetry={() => void refetch()} skeleton={<SkeletonLista cuantos={5} variante="fila" />} />
        ) : error ? (
          <div className="text-center py-16">
            <p className="text-4xl mb-3">😕</p>
            <p className="text-muted font-medium">No se pudo cargar la actividad</p>
            <p className="text-xs text-faint mt-1 px-6">{(error as Error).message}</p>
            <button
              onClick={() => refetch()}
              disabled={isFetching}
              className="mt-4 px-5 py-2.5 bg-brand-500 text-white rounded-xl font-medium text-sm disabled:opacity-50"
            >
              {isFetching ? 'Reintentando...' : 'Reintentar'}
            </button>
          </div>
        ) : !visibleFeed.length ? (
          <div className="text-center py-14 px-6">
            <p className="text-5xl mb-4">📣</p>
            <p className="font-semibold text-ink">Todavía no pasó nada</p>
            <p className="text-sm text-muted mt-1 leading-relaxed">
              Acá vas a ver los planes que va armando la gente de Catamarca.
              Si arrancás vos, aparece el tuyo.
            </p>
            <Link
              href="/planes/crear"
              className="mt-5 inline-flex items-center justify-center min-h-[48px] px-6 py-3 bg-brand-500 text-white font-bold rounded-2xl text-sm active:scale-95 transition shadow-lg shadow-brand-500/20"
            >
              Armar un plan
            </Link>
          </div>
        ) : (
          visibleFeed.map((item: any) => {
            const action = ACTION_LABELS[item.action] || { emoji: '📋', text: () => item.action };
            return (
              <Link key={item.id}
                href={item.target_type === 'plan' ? `/planes/detalle?id=${item.target_id}` : '#'}
                className="flex items-center gap-3 p-3 bg-surface rounded-xl border border-line shadow-sm">
                <span className="text-xl">{action.emoji}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm">
                    <span className="font-semibold">{item.actor?.full_name}</span>{' '}
                    <span className="text-muted">{action.text(item.metadata)}</span>
                  </p>
                  <p className="text-xs text-faint mt-0.5 flex items-center gap-1">
                    <Clock size={10} /> {timeAgo(item.created_at)}
                  </p>
                </div>
                <ChevronRight size={14} className="text-faint shrink-0" />
              </Link>
            );
          })
        )}

        {hasNextPage && !isLoading && !error && (
          <button
            onClick={() => void fetchNextPage()}
            disabled={isFetchingNextPage}
            className="w-full py-3 text-sm font-medium text-muted bg-surface border border-line rounded-xl disabled:opacity-50"
          >
            {isFetchingNextPage ? 'Cargando...' : 'Ver más actividad'}
          </button>
        )}
      </div>
    </div>
    </PullToRefresh>
  );
}
