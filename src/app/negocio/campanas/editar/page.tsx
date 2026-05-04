'use client';

import { useState, useEffect, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { ArrowLeft, Trash2, Save, Loader2, AlertCircle } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { Campaign, CampaignType } from '@/types/database';

const TYPES: { value: CampaignType; label: string; desc: string }[] = [
  { value: 'promo', label: '🏷️ Promo simple', desc: 'Descuento o beneficio directo' },
  { value: 'group_promo', label: '👥 Promo grupal', desc: 'Beneficio por venir en grupo' },
  { value: 'event', label: '🎉 Evento', desc: 'Actividad o evento especial' },
  { value: 'time_slot', label: '⏰ Franja horaria', desc: 'Beneficio en horarios específicos' },
];

function EditarCampanaInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const id = searchParams.get('id');
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [form, setForm] = useState({
    title: '', short_description: '', full_description: '', type: 'promo' as CampaignType,
    starts_at: '', ends_at: '', max_capacity: '', min_group_size: '',
    price_text: '', is_free: false, requires_reservation: false,
  });

  const { data: campaign, isLoading: isLoadingCampaign } = useQuery({
    queryKey: ['campaign_edit', id],
    queryFn: async () => {
      if (!id) return null;
      const { data, error } = await supabase.from('campaigns').select('*').eq('id', id).single();
      if (error) throw error;
      return data as Campaign;
    },
    enabled: !!id,
  });

  useEffect(() => {
    if (campaign) {
      setForm({
        title: campaign.title,
        short_description: campaign.short_description,
        full_description: campaign.full_description || '',
        type: campaign.type,
        starts_at: new Date(campaign.starts_at).toISOString().slice(0, 16),
        ends_at: new Date(campaign.ends_at).toISOString().slice(0, 16),
        max_capacity: campaign.max_capacity?.toString() || '',
        min_group_size: campaign.min_group_size?.toString() || '',
        price_text: campaign.price_text || '',
        is_free: campaign.is_free,
        requires_reservation: campaign.requires_reservation,
      });
    }
  }, [campaign]);

  const updateMutation = useMutation({
    mutationFn: async () => {
      if (!id) return;
      setLoading(true); setError('');
      const { error } = await supabase.from('campaigns').update({
        title: form.title, short_description: form.short_description,
        full_description: form.full_description || null, type: form.type,
        starts_at: new Date(form.starts_at).toISOString(),
        ends_at: new Date(form.ends_at).toISOString(),
        max_capacity: form.max_capacity ? parseInt(form.max_capacity) : null,
        min_group_size: form.min_group_size ? parseInt(form.min_group_size) : null,
        price_text: form.price_text || null,
        is_free: form.is_free, requires_reservation: form.requires_reservation,
      }).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      setSuccess(true);
      queryClient.invalidateQueries({ queryKey: ['my_campaigns'] });
      queryClient.invalidateQueries({ queryKey: ['campaign_edit', id] });
      setTimeout(() => setSuccess(false), 3000);
    },
    onError: (err: any) => setError(err.message),
    onSettled: () => setLoading(false),
  });

  const deleteMutation = useMutation({
    mutationFn: async () => {
      if (!id) return;
      const { error } = await supabase.from('campaigns').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['my_campaigns'] });
      queryClient.invalidateQueries({ queryKey: ['business_stats'] });
      router.push('/negocio/campanas');
    },
    onError: (err: any) => {
      setError(`No se pudo eliminar: ${err.message}`);
    },
  });

  if (!id || isLoadingCampaign) return <div className="flex justify-center pt-20"><Loader2 className="animate-spin text-accent-500" size={28} /></div>;

  const inputClass = "w-full px-4 py-3 rounded-xl border border-gray-200 bg-white focus:border-accent-400 focus:ring-2 focus:ring-accent-100 outline-none transition text-sm";

  return (
    <div className="max-w-lg mx-auto pb-8">
      <header className="flex items-center justify-between px-4 pt-6 pb-4 sticky top-0 bg-white z-10 border-b border-gray-50">
        <div className="flex items-center gap-3">
          <button onClick={() => router.back()} className="p-1.5 text-gray-400 hover:bg-gray-100 rounded-full transition"><ArrowLeft size={20} /></button>
          <h1 className="text-lg font-display font-bold">Gestionar campaña</h1>
        </div>
        <button onClick={() => { if (confirm('¿Eliminar esta campaña?')) deleteMutation.mutate(); }} className="p-2 text-red-400 hover:bg-red-50 rounded-xl transition">
          <Trash2 size={20} />
        </button>
      </header>

      <form onSubmit={(e) => { e.preventDefault(); updateMutation.mutate(); }} className="px-4 pt-4 space-y-4">
        {error && <div className="bg-red-50 text-red-600 text-sm px-4 py-3 rounded-xl border border-red-100 flex items-center gap-2"><AlertCircle size={16} />{error}</div>}
        {success && <div className="bg-green-50 text-green-700 text-sm px-4 py-3 rounded-xl border border-green-100">✅ Cambios guardados</div>}

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">Tipo de campaña *</label>
          <div className="grid grid-cols-2 gap-2">
            {TYPES.map(t => (
              <button key={t.value} type="button" onClick={() => setForm({ ...form, type: t.value })}
                className={`p-3 rounded-xl border-2 text-left transition ${form.type === t.value ? 'border-accent-500 bg-accent-50' : 'border-gray-200 bg-white'}`}>
                <p className="text-sm font-medium">{t.label}</p>
                <p className="text-[0.65rem] text-gray-400">{t.desc}</p>
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Título *</label>
          <input type="text" value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} className={inputClass} />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Descripción corta *</label>
          <input type="text" value={form.short_description} onChange={e => setForm({ ...form, short_description: e.target.value })} className={inputClass} />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Descripción completa</label>
          <textarea value={form.full_description} onChange={e => setForm({ ...form, full_description: e.target.value })} className={inputClass} rows={3} />
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
            <input type="number" value={form.max_capacity} onChange={e => setForm({ ...form, max_capacity: e.target.value })} className={inputClass} />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Grupo mínimo</label>
            <input type="number" value={form.min_group_size} onChange={e => setForm({ ...form, min_group_size: e.target.value })} className={inputClass} />
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Precio / condiciones</label>
          <input type="text" value={form.price_text} onChange={e => setForm({ ...form, price_text: e.target.value })} className={inputClass} />
        </div>

        <div className="flex items-center gap-6 p-1">
          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <input type="checkbox" checked={form.is_free} onChange={e => setForm({ ...form, is_free: e.target.checked })} className="rounded border-gray-300 text-accent-500 w-4 h-4" />
            Gratis
          </label>
          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <input type="checkbox" checked={form.requires_reservation} onChange={e => setForm({ ...form, requires_reservation: e.target.checked })} className="rounded border-gray-300 text-accent-500 w-4 h-4" />
            Requiere reserva
          </label>
        </div>

        <button type="submit" disabled={loading} className="w-full py-4 bg-accent-500 text-white font-bold rounded-xl disabled:opacity-50 shadow-lg shadow-accent-500/25 active:scale-[0.98] transition-all">
          {loading ? <span className="flex items-center justify-center gap-2"><Loader2 className="animate-spin" size={18} /> Guardando...</span>
            : <span className="flex items-center justify-center gap-2"><Save size={18} /> Guardar cambios</span>}
        </button>
      </form>
    </div>
  );
}

export default function EditarCampanaPage() {
  return <Suspense fallback={<div className="flex justify-center pt-20"><Loader2 className="animate-spin text-accent-500" size={28} /></div>}>
    <EditarCampanaInner />
  </Suspense>;
}
