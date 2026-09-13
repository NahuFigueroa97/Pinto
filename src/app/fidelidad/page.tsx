'use client';

import { ArrowLeft, Gift } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import { useQuery } from '@tanstack/react-query';
import { sb } from '@/lib/sb';
import { PageSpinner } from '@/components/shared/PageSpinner';

export default function MiFidelidadPage() {
  const router = useRouter();
  const { user } = useAuth();

  const { data: stamps, isLoading, error: queryError, refetch, isFetching } = useQuery({
    queryKey: ['my_loyalty_stamps'],
    queryFn: async () => {
      const data = await sb(supabase.from('loyalty_stamps')
        .select('*, card:loyalty_cards(*, business:businesses(name, logo_url))')
        .eq('user_id', user!.id)
        .order('created_at', { ascending: false }));
      return data ?? [];
    },
    enabled: !!user,
  });

  return (
    <div className="max-w-lg mx-auto pb-8">
      <header className="flex items-center gap-3 px-4 pt-6 pb-4">
        <button onClick={() => router.back()} className="-m-1.5 min-w-[44px] min-h-[44px] flex items-center justify-center text-faint"><ArrowLeft size={20} /></button>
        <div>
          <h1 className="text-lg font-display font-bold">🎯 Mis Tarjetas</h1>
          <p className="text-xs text-muted">Tu progreso de fidelidad</p>
        </div>
      </header>

      <div className="px-4 space-y-3">
        {isLoading ? (
          <PageSpinner fullScreen={false} />
        ) : queryError ? (
          <div className="text-center py-16 px-6">
            <p className="text-4xl mb-3">😕</p>
            <p className="text-ink-soft font-medium">No se pudo cargar</p>
            <p className="text-xs text-faint mt-1 break-words">
              {queryError instanceof Error ? queryError.message : 'Algo salió mal'}
            </p>
            <button onClick={() => refetch()} disabled={isFetching}
              className="mt-4 px-5 py-2.5 bg-brand-500 text-white rounded-xl font-medium text-sm disabled:opacity-50 active:scale-95 transition">
              {isFetching ? 'Reintentando...' : 'Reintentar'}
            </button>
          </div>
        ) : !stamps?.length ? (
          <div className="text-center py-16 text-faint">
            <Gift size={40} className="mx-auto mb-3 text-gray-200" />
            <p>No tenés tarjetas de fidelidad</p>
            <p className="text-sm mt-1">Visitá negocios con programa de fidelidad para empezar 🎁</p>
          </div>
        ) : (
          stamps.map((s: any) => {
            const required = s.card?.stamps_required ?? 5;
            const current = s.stamps_count;
            const progress = Math.min(100, (current / required) * 100);
            return (
              <div key={s.id} className={`rounded-2xl p-4 border shadow-sm ${s.redeemed ? 'bg-canvas border-line-strong' : 'bg-surface border-line'}`}>
                <div className="flex items-center justify-between mb-2">
                  <div>
                    <h3 className="font-bold text-sm">{s.card?.business?.name}</h3>
                    <p className="text-xs text-muted">{s.card?.name}</p>
                  </div>
                  {s.redeemed ? (
                    <span className="text-xs bg-green-100 text-green-700 dark:bg-green-500/15 dark:text-green-300 px-2 py-0.5 rounded-full">🎉 Canjeado</span>
                  ) : current >= required ? (
                    <span className="text-xs bg-yellow-100 text-yellow-700 dark:bg-yellow-500/15 dark:text-yellow-300 px-2 py-0.5 rounded-full animate-pulse">🎁 ¡Listo para canjear!</span>
                  ) : null}
                </div>

                <div className="flex gap-1 mb-2">
                  {Array.from({ length: required }).map((_, i) => (
                    <div key={i} className={`flex-1 h-8 rounded-lg flex items-center justify-center text-sm ${
                      i < current ? 'bg-brand-500 text-white' : 'bg-subtle text-faint'
                    }`}>
                      {i < current ? '⭐' : '○'}
                    </div>
                  ))}
                </div>

                <div className="flex items-center justify-between text-xs">
                  <span className="text-muted">{current}/{required} sellos</span>
                  <span className="text-brand-600 font-medium">🎁 {s.card?.reward}</span>
                </div>

                <div className="w-full bg-subtle rounded-full h-1.5 mt-2">
                  <div className="bg-brand-500 h-1.5 rounded-full transition-all" style={{ width: `${progress}%` }} />
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
