'use client';

import { ArrowLeft, Gift } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import { useQuery } from '@tanstack/react-query';

export default function MiFidelidadPage() {
  const router = useRouter();
  const { user } = useAuth();

  const { data: stamps, isLoading } = useQuery({
    queryKey: ['my_loyalty_stamps'],
    queryFn: async () => {
      const { data } = await supabase.from('loyalty_stamps')
        .select('*, card:loyalty_cards(*, business:businesses(name, logo_url))')
        .eq('user_id', user!.id)
        .order('created_at', { ascending: false });
      return data ?? [];
    },
    enabled: !!user,
  });

  return (
    <div className="max-w-lg mx-auto pb-8">
      <header className="flex items-center gap-3 px-4 pt-6 pb-4">
        <button onClick={() => router.back()} className="p-1.5 text-gray-400"><ArrowLeft size={20} /></button>
        <div>
          <h1 className="text-lg font-display font-bold">🎯 Mis Tarjetas</h1>
          <p className="text-xs text-gray-500">Tu progreso de fidelidad</p>
        </div>
      </header>

      <div className="px-4 space-y-3">
        {isLoading ? (
          <div className="flex justify-center py-16"><div className="spinner" /></div>
        ) : !stamps?.length ? (
          <div className="text-center py-16 text-gray-400">
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
              <div key={s.id} className={`rounded-2xl p-4 border shadow-sm ${s.redeemed ? 'bg-gray-50 border-gray-200' : 'bg-white border-gray-100'}`}>
                <div className="flex items-center justify-between mb-2">
                  <div>
                    <h3 className="font-bold text-sm">{s.card?.business?.name}</h3>
                    <p className="text-xs text-gray-500">{s.card?.name}</p>
                  </div>
                  {s.redeemed ? (
                    <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full">🎉 Canjeado</span>
                  ) : current >= required ? (
                    <span className="text-xs bg-yellow-100 text-yellow-700 px-2 py-0.5 rounded-full animate-pulse">🎁 ¡Listo para canjear!</span>
                  ) : null}
                </div>

                <div className="flex gap-1 mb-2">
                  {Array.from({ length: required }).map((_, i) => (
                    <div key={i} className={`flex-1 h-8 rounded-lg flex items-center justify-center text-sm ${
                      i < current ? 'bg-brand-500 text-white' : 'bg-gray-100 text-gray-300'
                    }`}>
                      {i < current ? '⭐' : '○'}
                    </div>
                  ))}
                </div>

                <div className="flex items-center justify-between text-xs">
                  <span className="text-gray-500">{current}/{required} sellos</span>
                  <span className="text-brand-600 font-medium">🎁 {s.card?.reward}</span>
                </div>

                <div className="w-full bg-gray-100 rounded-full h-1.5 mt-2">
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
