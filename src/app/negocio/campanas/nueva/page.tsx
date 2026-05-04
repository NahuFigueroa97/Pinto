'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { CampaignType } from '@/types/database';

const TYPES: { value: CampaignType; label: string; desc: string }[] = [
  { value: 'promo', label: '🏷️ Promo simple', desc: 'Descuento o beneficio directo' },
  { value: 'group_promo', label: '👥 Promo grupal', desc: 'Beneficio por venir en grupo' },
  { value: 'event', label: '🎉 Evento', desc: 'Actividad o evento especial' },
  { value: 'time_slot', label: '⏰ Franja horaria', desc: 'Beneficio en horarios específicos' },
];

export default function NuevaCampanaPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [form, setForm] = useState({
    title: '', short_description: '', full_description: '', type: 'promo' as CampaignType,
    starts_at: '', ends_at: '', max_capacity: '', min_group_size: '',
    price_text: '', is_free: false, requires_reservation: false,
  });

  const { data: business } = useQuery({
    queryKey: ['business', 'me'],
    queryFn: async () => {
      if (!user) return null;
      const { data } = await supabase.from('businesses').select('id').eq('owner_user_id', user.id).maybeSingle();
      return data;
    },
    enabled: !!user,
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.title || !form.starts_at || !form.ends_at) { setError('Título, fecha inicio y fin son obligatorios'); return; }
    if (!business) { setError('Primero necesitás crear tu negocio'); return; }
    setLoading(true);
    setError('');
    try {
      const { error: insertError } = await supabase.from('campaigns').insert({
        business_id: business.id,
        title: form.title,
        short_description: form.short_description,
        full_description: form.full_description || null,
        type: form.type,
        starts_at: new Date(form.starts_at).toISOString(),
        ends_at: new Date(form.ends_at).toISOString(),
        max_capacity: form.max_capacity ? parseInt(form.max_capacity) : null,
        min_group_size: form.min_group_size ? parseInt(form.min_group_size) : null,
        price_text: form.price_text || null,
        is_free: form.is_free,
        requires_reservation: form.requires_reservation,
        status: 'active',
      });
      if (insertError) throw insertError;

      // Invalidate campaign list and stats
      await queryClient.invalidateQueries({ queryKey: ['my_campaigns'] });
      await queryClient.invalidateQueries({ queryKey: ['business_stats'] });

      router.push('/negocio');
    } catch (err: any) {
      setError(err.message || 'Error al crear campaña');
    } finally {
      setLoading(false);
    }
  };

  const inputClass = "w-full px-4 py-3 rounded-xl border border-gray-200 bg-white focus:border-accent-400 focus:ring-2 focus:ring-accent-100 outline-none transition text-sm";

  return (
    <div className="max-w-lg mx-auto pb-8">
      <header className="flex items-center gap-3 px-4 pt-6 pb-4">
        <button onClick={() => router.back()} className="p-1.5 text-gray-400"><ArrowLeft size={20} /></button>
        <h1 className="text-lg font-display font-bold">Nueva campaña</h1>
      </header>

      <form onSubmit={handleSubmit} className="px-4 space-y-4">
        {error && <div className="bg-red-50 text-red-600 text-sm px-4 py-3 rounded-xl border border-red-100">{error}</div>}

        {/* Type */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">Tipo de campaña *</label>
          <div className="grid grid-cols-2 gap-2">
            {TYPES.map(t => (
              <button
                key={t.value}
                type="button"
                onClick={() => setForm({ ...form, type: t.value })}
                className={`p-3 rounded-xl border-2 text-left transition ${
                  form.type === t.value ? 'border-accent-500 bg-accent-50' : 'border-gray-200 bg-white'
                }`}
              >
                <p className="text-sm font-medium">{t.label}</p>
                <p className="text-[0.65rem] text-gray-400">{t.desc}</p>
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Título *</label>
          <input type="text" value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} className={inputClass} placeholder="Ej: Happy Hour 2x1" />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Descripción corta *</label>
          <input type="text" value={form.short_description} onChange={e => setForm({ ...form, short_description: e.target.value })} className={inputClass} placeholder="Una línea que enganche" />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Descripción completa</label>
          <textarea value={form.full_description} onChange={e => setForm({ ...form, full_description: e.target.value })} className={inputClass} rows={3} placeholder="Todos los detalles de la campaña" />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Inicio *</label>
            <input type="datetime-local" value={form.starts_at} onChange={e => setForm({ ...form, starts_at: e.target.value })} className={inputClass} />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Fin *</label>
            <input type="datetime-local" value={form.ends_at} onChange={e => setForm({ ...form, ends_at: e.target.value })} className={inputClass} />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Capacidad máxima</label>
            <input type="number" value={form.max_capacity} onChange={e => setForm({ ...form, max_capacity: e.target.value })} className={inputClass} placeholder="Sin límite" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Grupo mínimo</label>
            <input type="number" value={form.min_group_size} onChange={e => setForm({ ...form, min_group_size: e.target.value })} className={inputClass} placeholder="1" />
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Precio / condiciones</label>
          <input type="text" value={form.price_text} onChange={e => setForm({ ...form, price_text: e.target.value })} className={inputClass} placeholder="Ej: $5.000 x 3 pintas" />
        </div>

        <div className="flex items-center gap-6">
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={form.is_free} onChange={e => setForm({ ...form, is_free: e.target.checked })} className="rounded border-gray-300 text-accent-500 focus:ring-accent-400" />
            Gratis
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={form.requires_reservation} onChange={e => setForm({ ...form, requires_reservation: e.target.checked })} className="rounded border-gray-300 text-accent-500 focus:ring-accent-400" />
            Requiere reserva
          </label>
        </div>

        <button type="submit" disabled={loading} className="w-full py-3 bg-accent-500 text-white font-semibold rounded-xl disabled:opacity-50 shadow-md shadow-accent-500/20">
          {loading ? 'Creando...' : 'Publicar campaña'}
        </button>
      </form>
    </div>
  );
}
