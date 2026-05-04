'use client';

import { useState, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useUserLocation } from '@/lib/geolocation';
import { moderateContent } from '@/lib/moderation';

function CrearPlanInner() {
  const searchParams = useSearchParams();
  const campaignId = searchParams.get('campaign');
  const repeatId = searchParams.get('repeat');
  const router = useRouter();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const { location } = useUserLocation();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [form, setForm] = useState({
    title: searchParams.get('title') || '',
    description: searchParams.get('desc') || '',
    plan_date: '', plan_time: '',
    meeting_point: searchParams.get('meeting') || '',
    max_members: searchParams.get('max') || '6',
    visibility: 'public',
  });

  const { data: categories } = useQuery({
    queryKey: ['plan_categories'],
    queryFn: async () => {
      const { data } = await supabase.from('plan_categories').select('*').order('sort_order');
      return data ?? [];
    },
  });

  // Pre-fill if creating from campaign
  const { data: campaign } = useQuery({
    queryKey: ['campaign_for_plan', campaignId],
    queryFn: async () => {
      if (!campaignId) return null;
      const { data } = await supabase.from('campaigns').select('*, business:businesses(name, address)').eq('id', campaignId).single();
      return data;
    },
    enabled: !!campaignId,
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) { router.push('/login'); return; }
    if (!form.title || !form.plan_date) { setError('Título y fecha son obligatorios'); return; }

    // Rate limit: max 5 active plans
    const { count } = await supabase.from('social_plans')
      .select('id', { count: 'exact' })
      .eq('creator_id', user.id)
      .in('status', ['open', 'full']);
    if (count && count >= 5) {
      setError('Tenés 5 planes activos. Cerrá o cancelá alguno antes de crear otro.');
      return;
    }

    setLoading(true);
    setError('');

    // Content moderation
    const titleCheck = moderateContent(form.title);
    if (!titleCheck.ok) { setError(titleCheck.reason); setLoading(false); return; }
    if (form.description) {
      const descCheck = moderateContent(form.description);
      if (!descCheck.ok) { setError(descCheck.reason); setLoading(false); return; }
    }
    try {
      const { data: plan, error: insertErr } = await supabase.from('social_plans').insert({
        creator_id: user.id,
        campaign_id: campaignId || null,
        category_id: categoryId || null,
        title: form.title,
        description: form.description || null,
        plan_date: form.plan_date,
        plan_time: form.plan_time || null,
        meeting_point: form.meeting_point || campaign?.business?.address || null,
        max_members: parseInt(form.max_members) || 6,
        visibility: form.visibility,
        latitude: location?.lat ?? null,
        longitude: location?.lng ?? null,
        status: 'open',
      }).select('id').single();

      if (insertErr) throw insertErr;

      // Add creator as member
      const { error: memberErr } = await supabase.from('social_plan_members').insert({
        plan_id: plan.id,
        user_id: user.id,
        role: 'creator',
      });
      if (memberErr) throw memberErr;

      // Invalidate queries to ensure fresh data in lists
      queryClient.invalidateQueries({ queryKey: ['social_plans'] });
      queryClient.invalidateQueries({ queryKey: ['my_created_plans'] });

      router.push(`/planes/detalle?id=${plan.id}`);
    } catch (err: any) {
      setError(err.message || 'Error al crear plan');
    } finally {
      setLoading(false);
    }
  };

  const inputClass = "w-full px-4 py-3 rounded-xl border border-gray-200 bg-white focus:border-brand-400 focus:ring-2 focus:ring-brand-100 outline-none transition text-sm";

  return (
    <div className="max-w-lg mx-auto pb-8">
      <header className="flex items-center gap-3 px-4 pt-6 pb-4">
        <button onClick={() => router.back()} className="p-1.5 text-gray-400"><ArrowLeft size={20} /></button>
        <div>
          <h1 className="text-lg font-display font-bold">Crear plan</h1>
          {campaign && <p className="text-xs text-accent-600">📢 Basado en: {campaign.title}</p>}
        </div>
      </header>

      <form onSubmit={handleSubmit} className="px-4 space-y-4">
        {error && <div className="bg-red-50 text-red-600 text-sm px-4 py-3 rounded-xl border border-red-100">{error}</div>}

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Título del plan *</label>
          <input
            type="text"
            value={form.title}
            onChange={e => setForm({ ...form, title: e.target.value })}
            className={inputClass}
            placeholder={campaign ? `Plan para: ${campaign.title}` : 'Ej: Birras después del fútbol'}
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Descripción</label>
          <textarea
            value={form.description}
            onChange={e => setForm({ ...form, description: e.target.value })}
            className={inputClass}
            rows={3}
            placeholder="Contá de qué va el plan..."
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Día *</label>
            <input type="date" value={form.plan_date} onChange={e => setForm({ ...form, plan_date: e.target.value })} className={inputClass} />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Hora</label>
            <input type="time" value={form.plan_time} onChange={e => setForm({ ...form, plan_time: e.target.value })} className={inputClass} />
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Punto de encuentro</label>
          <input
            type="text"
            value={form.meeting_point}
            onChange={e => setForm({ ...form, meeting_point: e.target.value })}
            className={inputClass}
            placeholder={campaign?.business?.address ?? 'Ej: Plaza 25 de Mayo'}
          />
        </div>

        {/* Category */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Categoría</label>
          <div className="flex flex-wrap gap-2">
            {categories?.map((cat: any) => (
              <button key={cat.id} type="button" onClick={() => setCategoryId(categoryId === cat.id ? '' : cat.id)}
                className={`px-3 py-1.5 rounded-full text-sm font-medium transition ${categoryId === cat.id ? 'bg-brand-500 text-white' : 'bg-gray-100 text-gray-600'}`}>
                {cat.emoji} {cat.name}
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Máx. personas</label>
            <input type="number" value={form.max_members} onChange={e => setForm({ ...form, max_members: e.target.value })} className={inputClass} min="2" max="50" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Visibilidad</label>
            <select value={form.visibility} onChange={e => setForm({ ...form, visibility: e.target.value })} className={inputClass}>
              <option value="public">🌐 Público</option>
              <option value="private">🔒 Privado</option>
            </select>
          </div>
        </div>

        <button type="submit" disabled={loading}
          className="w-full py-3 bg-brand-500 text-white font-semibold rounded-xl disabled:opacity-50 shadow-md shadow-brand-500/20">
          {loading ? 'Creando...' : '🎉 Crear plan'}
        </button>
      </form>
    </div>
  );
}

export default function CrearPlanPage() {
  return <Suspense fallback={<div className="flex justify-center pt-20"><div className="spinner" /></div>}><CrearPlanInner /></Suspense>;
}
