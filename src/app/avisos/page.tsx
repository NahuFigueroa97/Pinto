'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Bell, CheckCheck, ChevronRight } from 'lucide-react';
import { useAvisos, useMarkRead, type Aviso } from '@/lib/inbox';
import { QueryState } from '@/components/shared/QueryState';
import { SkeletonLista } from '@/components/shared/Skeleton';
import { tap } from '@/lib/haptics';
import { safeRoute } from '@/lib/pushNotifications';
import { PullToRefresh } from '@/components/shared/PullToRefresh';

/**
 * Bandeja de avisos.
 *
 * El lugar donde vive lo que te pasó. Antes esto no existía: un push
 * deslizado era un push perdido, y la solicitud para sumarse a tu plan sólo
 * se veía entrando al plan correcto por memoria.
 */

function cuandoFue(iso: string): string {
  const min = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (min < 1) return 'Recién';
  if (min < 60) return `Hace ${min} min`;
  const hs = Math.floor(min / 60);
  if (hs < 24) return `Hace ${hs} h`;
  const dias = Math.floor(hs / 24);
  if (dias === 1) return 'Ayer';
  if (dias < 7) return `Hace ${dias} días`;
  return new Date(iso).toLocaleDateString('es-AR', { day: 'numeric', month: 'short' });
}

/** Un emoji según de qué habla el aviso, para poder barrer la lista con la vista. */
function iconoDe(a: Aviso): string {
  const r = a.route ?? '';
  if (r.includes('/chat')) return '💬';
  if (r.includes('/mensajes')) return '✉️';
  if (r.includes('/planes')) return '🤝';
  if (r.includes('/reservas')) return '🎟️';
  if (r.includes('/fidelidad')) return '⭐';
  return '🔔';
}

export default function AvisosPage() {
  const router = useRouter();
  const { data, isLoading, error, refetch, isFetching, fetchNextPage, hasNextPage, isFetchingNextPage } = useAvisos();
  const markRead = useMarkRead();

  const avisos = data?.pages.flat() ?? [];
  const sinLeer = avisos.filter(a => !a.read_at);

  /**
   * Entrar a la bandeja ya cuenta como haberlos visto: es lo que hace
   * cualquier app y evita que el globito quede pegado. Lo que NO se hace es
   * borrarlos — el aviso sigue ahí para volver a buscarlo.
   */
  useEffect(() => {
    if (!isLoading && sinLeer.length > 0) markRead.mutate(undefined);
    // Sólo al montar con contenido: si dependiera de `sinLeer` se dispararía
    // en cada refetch.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoading]);

  const abrir = (a: Aviso) => {
    void tap();
    if (!a.read_at) markRead.mutate([a.id]);
    // La ruta viene de la base. La escriben triggers nuestros, pero pasarla
    // a router.push() sin mirar sería una redirección abierta adentro del
    // WebView: se valida contra la misma lista blanca que usa el push.
    const destino = safeRoute(a.route);
    if (destino) router.push(destino);
  };

  return (
    <PullToRefresh onRefresh={() => refetch()}>
    <div className="max-w-lg mx-auto pb-6">
      <header className="px-4 pt-6 pb-3 flex items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-display font-bold text-ink">🔔 Avisos</h1>
          <p className="text-sm text-muted">Todo lo que pasó mientras no mirabas</p>
        </div>
        {sinLeer.length > 0 && (
          <button
            onClick={() => { void tap(); markRead.mutate(undefined); }}
            className="flex items-center gap-1.5 text-xs font-medium text-brand-500 min-h-[44px] px-2 -mr-2"
          >
            <CheckCheck size={15} /> Marcar todo
          </button>
        )}
      </header>

      <div className="px-4">
        <QueryState
          isLoading={isLoading}
          error={error}
          isEmpty={avisos.length === 0}
          onRetry={() => void refetch()}
          isRetrying={isFetching}
          skeleton={<SkeletonLista cuantos={5} variante="fila" />}
          emptyIcon="🔔"
          emptyTitle="Todavía no hay avisos"
          emptyText="Acá vas a ver cuando alguien quiera sumarse a tus planes, te escriban o se acerque una junta."
        >
          <div className="space-y-1.5">
            {avisos.map(a => (
              <button
                key={a.id}
                onClick={() => abrir(a)}
                className={`w-full flex items-start gap-3 p-3 rounded-xl border text-left transition-colors min-h-[60px] ${
                  a.read_at
                    ? 'bg-surface border-line'
                    // Tinte por opacidad y no bg-brand-50: un fondo claro fijo
                    // con texto de token (text-ink) queda blanco sobre blanco
                    // en modo oscuro. Con /10 el tinte funciona en los dos.
                    : 'bg-brand-500/10 border-brand-500/25'
                }`}
              >
                <span className="text-xl leading-none mt-0.5 shrink-0">{iconoDe(a)}</span>
                <div className="flex-1 min-w-0">
                  <p className={`text-sm leading-snug ${a.read_at ? 'text-ink-soft' : 'font-semibold text-ink'}`}>
                    {a.title}
                  </p>
                  <p className="text-xs text-muted mt-0.5 leading-snug break-words">{a.body}</p>
                  <p className="text-[0.65rem] text-faint mt-1">{cuandoFue(a.created_at)}</p>
                </div>
                {/* El punto es más legible de un vistazo que un cambio de peso tipográfico */}
                {!a.read_at && <span className="w-2 h-2 rounded-full bg-brand-500 shrink-0 mt-1.5" />}
                {a.route && <ChevronRight size={15} className="text-faint shrink-0 mt-1" />}
              </button>
            ))}

            {hasNextPage && (
              <button
                onClick={() => void fetchNextPage()}
                disabled={isFetchingNextPage}
                className="w-full py-3 min-h-[44px] text-sm font-medium text-muted bg-surface border border-line rounded-xl disabled:opacity-50"
              >
                {isFetchingNextPage ? 'Cargando...' : 'Ver más'}
              </button>
            )}
          </div>
        </QueryState>
      </div>
    </div>
    </PullToRefresh>
  );
}
