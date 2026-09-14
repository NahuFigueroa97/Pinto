'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Ban } from 'lucide-react';
import { useBlockedProfiles, useBlockUser, type PerfilBloqueado } from '@/lib/blocks';
import { QueryState } from '@/components/shared/QueryState';
import { SkeletonLista } from '@/components/shared/Skeleton';
import { tap, exito } from '@/lib/haptics';

/**
 * Personas bloqueadas.
 *
 * El botón de desbloquear existía sólo en el perfil de la persona. Pero al
 * bloquear a alguien desaparece de los listados, del feed y del chat: su
 * perfil deja de ser alcanzable. O sea que el botón estaba ahí y no había
 * ningún camino para llegar a él. Bloquear era, en la práctica, definitivo.
 *
 * Es lo mismo que hace WhatsApp con Ajustes > Privacidad > Bloqueados: la
 * lista tiene que vivir en un lugar fijo, independiente de la persona, justo
 * porque bloquear la esconde.
 */
export default function BloqueadosPage() {
  const router = useRouter();
  const { data: bloqueados, isLoading, error, refetch, isFetching } = useBlockedProfiles();
  const { unblock } = useBlockUser();
  const [confirmando, setConfirmando] = useState<string | null>(null);

  const desbloquear = (p: PerfilBloqueado) => {
    void tap();
    unblock.mutate(p.id, { onSuccess: () => { void exito(); setConfirmando(null); } });
  };

  return (
    <div className="max-w-lg mx-auto pb-6">
      <header className="flex items-center gap-3 px-4 pt-6 pb-4">
        <button
          onClick={() => router.back()}
          aria-label="Volver"
          className="-m-1.5 min-w-[44px] min-h-[44px] flex items-center justify-center text-faint"
        >
          <ArrowLeft size={20} />
        </button>
        <div>
          <h1 className="text-lg font-display font-bold text-ink">🚫 Bloqueados</h1>
          <p className="text-xs text-muted">Personas que no ves ni te pueden contactar</p>
        </div>
      </header>

      <div className="px-4">
        <QueryState
          isLoading={isLoading}
          error={error}
          isEmpty={!bloqueados?.length}
          onRetry={() => void refetch()}
          isRetrying={isFetching}
          skeleton={<SkeletonLista cuantos={3} variante="fila" />}
          emptyIcon="🙂"
          emptyTitle="No bloqueaste a nadie"
          emptyText="Si alguna vez lo necesitás, podés bloquear a una persona desde su perfil."
        >
          <div className="space-y-2">
            {bloqueados?.map(p => (
              <div key={p.id} className="bg-surface rounded-xl border border-line shadow-sm overflow-hidden">
                <div className="flex items-center gap-3 p-3">
                  <span className="w-10 h-10 rounded-full bg-subtle flex items-center justify-center text-sm font-bold text-muted shrink-0 overflow-hidden">
                    {p.avatar_url
                      ? <img src={p.avatar_url} alt="" className="w-full h-full object-cover" />
                      : (p.full_name?.[0]?.toUpperCase() ?? '?')}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-ink truncate">{p.full_name ?? 'Alguien'}</p>
                    <p className="text-[0.65rem] text-faint">
                      Bloqueada el {new Date(p.blocked_at).toLocaleDateString('es-AR', { day: 'numeric', month: 'long' })}
                    </p>
                  </div>

                  {confirmando !== p.id && (
                    <button
                      onClick={() => { void tap(); setConfirmando(p.id); }}
                      className="shrink-0 min-h-[44px] px-3 text-xs font-semibold text-brand-500"
                    >
                      Desbloquear
                    </button>
                  )}
                </div>

                {/* Confirmación en línea: desbloquear no es grave, pero tocarlo
                    sin querer en una lista de nombres parecidos sí molesta. */}
                {confirmando === p.id && (
                  <div className="px-3 pb-3 -mt-1">
                    <p className="text-xs text-muted mb-2">
                      Va a poder pedir sumarse a tus planes y vas a volver a ver su actividad.
                    </p>
                    <div className="flex gap-2">
                      <button
                        onClick={() => desbloquear(p)}
                        disabled={unblock.isPending}
                        className="flex-1 min-h-[44px] bg-brand-500 text-white rounded-xl text-xs font-bold disabled:opacity-50"
                      >
                        {unblock.isPending ? 'Desbloqueando...' : 'Sí, desbloquear'}
                      </button>
                      <button
                        onClick={() => { void tap(); setConfirmando(null); }}
                        className="flex-1 min-h-[44px] bg-canvas border border-line-strong rounded-xl text-xs font-medium text-muted"
                      >
                        Cancelar
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </QueryState>

        {unblock.isError && (
          <p className="text-xs text-red-500 mt-3 text-center">
            No se pudo desbloquear: {(unblock.error as Error)?.message}
          </p>
        )}

        <p className="flex items-start gap-2 text-[0.65rem] text-faint leading-relaxed mt-5 px-1">
          <Ban size={13} className="shrink-0 mt-0.5" />
          <span>
            Bloquear no avisa a la otra persona. Si comparten un plan, sigue
            estando en el grupo: lo que cambia es que vos no ves lo que escribe.
          </span>
        </p>
      </div>
    </div>
  );
}
