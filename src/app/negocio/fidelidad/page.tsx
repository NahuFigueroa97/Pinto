'use client';

import { useState } from 'react';
import { ArrowLeft, Plus, Gift, Edit } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

export default function FidelidadNegocioPage() {
  const router = useRouter();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ name: 'Tarjeta de Fidelidad', stamps_required: '5', reward: '' });

  const { data: business } = useQuery({
    queryKey: ['my_business_loyalty'],
    queryFn: async () => {
      const { data } = await supabase.from('businesses').select('id,name').eq('owner_user_id', user!.id).single();
      return data;
    },
    enabled: !!user,
  });

  const { data: cards, isLoading } = useQuery({
    queryKey: ['loyalty_cards', business?.id],
    queryFn: async () => {
      const { data } = await supabase.from('loyalty_cards')
        .select('*, stamps:loyalty_stamps(count)')
        .eq('business_id', business!.id)
        .order('created_at', { ascending: false });
      return data ?? [];
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

  const inputClass = "w-full px-4 py-3 rounded-xl border border-gray-200 bg-white focus:border-brand-400 outline-none text-sm";

  return (
    <div className="max-w-lg mx-auto pb-8">
      <header className="flex items-center gap-3 px-4 pt-6 pb-4">
        <button onClick={() => router.back()} className="p-1.5 text-gray-400"><ArrowLeft size={20} /></button>
        <div className="flex-1">
          <h1 className="text-lg font-display font-bold">🎯 Programa de Fidelidad</h1>
          <p className="text-xs text-gray-500">Premiá a tus clientes frecuentes</p>
        </div>
        <button onClick={() => setShowForm(true)} className="p-2 bg-brand-500 text-white rounded-xl"><Plus size={18} /></button>
      </header>

      {showForm && (
        <div className="px-4 mb-4">
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 space-y-3">
            <h3 className="font-bold text-sm">✨ Nueva tarjeta</h3>
            <input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="Nombre" className={inputClass} />
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-gray-500 mb-1 block">Sellos necesarios</label>
                <input type="number" value={form.stamps_required} onChange={e => setForm({ ...form, stamps_required: e.target.value })} className={inputClass} min="2" max="20" />
              </div>
              <div>
                <label className="text-xs text-gray-500 mb-1 block">Premio</label>
                <input value={form.reward} onChange={e => setForm({ ...form, reward: e.target.value })} placeholder="Ej: Café gratis" className={inputClass} />
              </div>
            </div>
            <div className="flex gap-2">
              <button onClick={() => setShowForm(false)} className="flex-1 py-2.5 border border-gray-200 rounded-xl text-sm">Cancelar</button>
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
          <div className="flex justify-center py-16"><div className="spinner" /></div>
        ) : !cards?.length ? (
          <div className="text-center py-16 text-gray-400">
            <Gift size={40} className="mx-auto mb-3 text-gray-200" />
            <p>No tenés tarjetas de fidelidad</p>
            <p className="text-sm mt-1">Crea una para premiar a tus clientes 🎁</p>
          </div>
        ) : (
          cards.map((card: any) => (
            <div key={card.id} className="bg-gradient-to-br from-brand-50 to-accent-50 rounded-2xl p-4 border border-brand-100">
              <div className="flex items-center justify-between mb-2">
                <h3 className="font-bold text-sm">{card.name}</h3>
                <span className={`text-xs px-2 py-0.5 rounded-full ${card.is_active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                  {card.is_active ? '✅ Activa' : '⏸️ Pausada'}
                </span>
              </div>
              <p className="text-sm text-gray-600">🎁 Premio: <span className="font-medium">{card.reward}</span></p>
              <p className="text-xs text-gray-500 mt-1">📊 {card.stamps_required} sellos necesarios • {card.stamps?.length ?? 0} clientes participando</p>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
