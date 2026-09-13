'use client';

import { useState } from 'react';
import { ArrowLeft, Plus, Gift, Edit } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { sb } from '@/lib/sb';
import { PageSpinner } from '@/components/shared/PageSpinner';

export default function FidelidadNegocioPage() {
  const router = useRouter();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ name: 'Tarjeta de Fidelidad', stamps_required: '5', reward: '' });

  const { data: business } = useQuery({
    queryKey: ['my_business_loyalty', user?.id],
    queryFn: async () => {
      // .single() tira error cuando el usuario todavía no creó su negocio;
      // .maybeSingle() devuelve null, que es lo que espera el resto.
      const data = await sb(supabase.from('businesses').select('id,name').eq('owner_user_id', user!.id).maybeSingle());
      return data;
    },
    enabled: !!user,
  });

  const { data: cards, isLoading } = useQuery({
    queryKey: ['loyalty_cards', business?.id],
    queryFn: async () => {
      const { data, error } = await supabase.from('loyalty_cards')
        // PostgREST devuelve el agregado como [{ count: N }], así que el
        // `card.stamps?.length` de la vista daba siempre 1 (o 0): la tarjeta
        // mostraba "1 clientes participando" tuviera 0 o 300.
        .select('*, stamps:loyalty_stamps(count)')
        .eq('business_id', business!.id)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data ?? []).map((card: any) => ({
        ...card,
        participants: card.stamps?.[0]?.count ?? 0,
      }));
    },
    enabled: !!business,
  });

  const createCard = useMutation({
    mutationFn: async () => {
      if (!business) return;
      await supabase.from('loyalty_cards').insert({
        business_id: business.id, name: form.name,
        stamps_required: parseInt(form.stamps_required) || 5, reward: form.reward,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['loyalty_cards'] });
      setShowForm(false);
      setForm({ name: 'Tarjeta de Fidelidad', stamps_required: '5', reward: '' });
    },
  });

  const inputClass = "w-full px-4 py-3 rounded-xl border border-line-strong bg-surface focus:border-brand-400 outline-none text-sm";

  return (
    <div className="max-w-lg mx-auto pb-8">
      <header className="flex items-center gap-3 px-4 pt-6 pb-4">
        <button onClick={() => router.back()} className="-m-1.5 min-w-[44px] min-h-[44px] flex items-center justify-center text-faint"><ArrowLeft size={20} /></button>
        <div className="flex-1">
          <h1 className="text-lg font-display font-bold">🎯 Programa de Fidelidad</h1>
          <p className="text-xs text-muted">Premiá a tus clientes frecuentes</p>
        </div>
        <button onClick={() => setShowForm(true)} className="p-2 bg-brand-500 text-white rounded-xl"><Plus size={18} /></button>
      </header>

      {showForm && (
        <div className="px-4 mb-4">
          <div className="bg-surface rounded-2xl border border-line shadow-sm p-4 space-y-3">
            <h3 className="font-bold text-sm">✨ Nueva tarjeta</h3>
            <input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="Nombre" className={inputClass} />
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-muted mb-1 block">Sellos necesarios</label>
                <input type="number" value={form.stamps_required} onChange={e => setForm({ ...form, stamps_required: e.target.value })} className={inputClass} min="2" max="20" />
              </div>
              <div>
                <label className="text-xs text-muted mb-1 block">Premio</label>
                <input value={form.reward} onChange={e => setForm({ ...form, reward: e.target.value })} placeholder="Ej: Café gratis" className={inputClass} />
              </div>
            </div>
            <div className="flex gap-2">
              <button onClick={() => setShowForm(false)} className="flex-1 py-2.5 border border-line-strong rounded-xl text-sm">Cancelar</button>
              <button onClick={() => createCard.mutate()} disabled={!form.reward || createCard.isPending}
                className="flex-1 py-2.5 bg-brand-500 text-white rounded-xl text-sm font-medium disabled:opacity-50">
                {createCard.isPending ? 'Creando...' : 'Crear'}
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="px-4 space-y-3">
        {isLoading ? (
          <PageSpinner fullScreen={false} />
        ) : !cards?.length ? (
          <div className="text-center py-16 text-faint">
            <Gift size={40} className="mx-auto mb-3 text-gray-200" />
            <p>No tenés tarjetas de fidelidad</p>
            <p className="text-sm mt-1">Crea una para premiar a tus clientes 🎁</p>
          </div>
        ) : (
          cards.map((card: any) => (
            <div key={card.id} className="bg-gradient-to-br from-brand-50 to-accent-50 rounded-2xl p-4 border border-brand-100">
              <div className="flex items-center justify-between mb-2">
                <h3 className="font-bold text-sm">{card.name}</h3>
                <span className={`text-xs px-2 py-0.5 rounded-full ${card.is_active ? 'bg-green-100 text-green-700 dark:bg-green-500/15 dark:text-green-300' : 'bg-subtle text-muted'}`}>
                  {card.is_active ? '✅ Activa' : '⏸️ Pausada'}
                </span>
              </div>
              <p className="text-sm text-muted">🎁 Premio: <span className="font-medium">{card.reward}</span></p>
              <p className="text-xs text-muted mt-1">📊 {card.stamps_required} sellos necesarios • {card.participants} {card.participants === 1 ? 'cliente' : 'clientes'} participando</p>
            </div>
          ))
        )}

        {/*
          Clientes con la tarjeta completa. Antes no había forma de canjear
          un premio desde ningún lado: loyalty_stamps no se tocaba nunca.
        */}
        {business && <ReadyToRedeem businessId={business.id} />}
      </div>
    </div>
  );
}

function ReadyToRedeem({ businessId }: { businessId: string }) {
  const queryClient = useQueryClient();
  const [feedback, setFeedback] = useState('');

  const { data: ready } = useQuery({
    queryKey: ['loyalty_ready', businessId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('loyalty_stamps')
        .select('id, stamps_count, redeemed, user:profiles(full_name), card:loyalty_cards!inner(id, reward, stamps_required, business_id)')
        .eq('redeemed', false)
        .eq('card.business_id', businessId);
      if (error) throw error;
      return (data ?? []).filter((s: any) => s.stamps_count >= (s.card?.stamps_required ?? 99));
    },
    refetchInterval: 30_000,
  });

  const redeem = useMutation({
    mutationFn: async (stampId: string) => {
      const { data, error } = await supabase.rpc('redeem_loyalty_card', { p_stamp_id: stampId });
      if (error) throw error;
      const res = data as { ok: boolean; error?: string; reward?: string };
      if (!res.ok) throw new Error(res.error ?? 'No se pudo canjear');
      return res;
    },
    onSuccess: (res) => {
      setFeedback(`🎉 Premio entregado: ${res.reward}`);
      queryClient.invalidateQueries({ queryKey: ['loyalty_ready', businessId] });
      queryClient.invalidateQueries({ queryKey: ['loyalty_cards'] });
      setTimeout(() => setFeedback(''), 4000);
    },
    onError: (err: any) => setFeedback(`⚠️ ${err.message}`),
  });

  if (!ready?.length) return null;

  return (
    <div className="pt-2">
      <h2 className="font-display font-bold text-sm mb-2">🎁 Listos para canjear</h2>
      {feedback && <p className="text-xs mb-2 text-muted">{feedback}</p>}
      <div className="space-y-2">
        {ready.map((s: any) => (
          <div key={s.id} className="flex items-center gap-3 bg-surface rounded-2xl border border-yellow-200 p-3 shadow-sm">
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold truncate">{s.user?.full_name ?? 'Cliente'}</p>
              <p className="text-[0.65rem] text-faint">
                {s.stamps_count}/{s.card?.stamps_required} sellos · {s.card?.reward}
              </p>
            </div>
            <button
              onClick={() => redeem.mutate(s.id)}
              disabled={redeem.isPending}
              className="px-3.5 py-2 bg-yellow-400 text-yellow-900 rounded-xl text-xs font-bold disabled:opacity-50 active:scale-95 transition"
            >
              Entregar
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
