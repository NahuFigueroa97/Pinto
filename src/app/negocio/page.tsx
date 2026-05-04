'use client';

import { useAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { CheckCircle, XCircle } from 'lucide-react';
import Link from 'next/link';
import type { Business } from '@/types/database';

export default function NegocioDashboard() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const { data: business, isLoading } = useQuery<Business | null>({
    queryKey: ['business', 'me', user?.id],
    queryFn: async () => {
      if (!user) return null;
      const { data } = await supabase.from('businesses').select('*').eq('owner_user_id', user.id);
      if (data && data.length > 0) {
        const b = data[0] as Business;
        const { data: catData } = await supabase.from('business_categories').select('name, icon').eq('id', b.category_id).single();
        if (catData) b.category = catData as any;
        return b;
      }
      return null;
    },
    enabled: !!user,
  });

  const { data: stats } = useQuery({
    queryKey: ['business_stats', business?.id],
    queryFn: async () => {
      if (!business) return null;
      const { data: campData } = await supabase.from('campaigns').select('id').eq('business_id', business.id);
      const campIds = campData?.map((c: any) => c.id) ?? [];
      const [reservations, views, unreadMsgs] = await Promise.all([
        campIds.length > 0 ? supabase.from('reservations').select('id', { count: 'exact' }).in('campaign_id', campIds).eq('status', 'confirmed') : { count: 0 },
        supabase.from('analytics_events').select('id', { count: 'exact' }).eq('business_id', business.id).eq('event_type', 'campaign_view'),
        supabase.from('business_messages').select('id', { count: 'exact' }).eq('business_id', business.id).eq('is_read', false).eq('sender_role', 'user'),
      ]);
      return {
        campaigns: campIds.length,
        reservations: (reservations as any).count ?? 0,
        views: views.count ?? 0,
        unreadMsgs: unreadMsgs.count ?? 0,
      };
    },
    enabled: !!business,
  });

  // Pending reservations
  const { data: pendingReservations } = useQuery({
    queryKey: ['pending_reservations', business?.id],
    queryFn: async () => {
      if (!business) return [];
      const { data: campData } = await supabase.from('campaigns').select('id, title, price_text').eq('business_id', business.id);
      if (!campData?.length) return [];
      const { data } = await supabase.from('reservations')
        .select('*, user:profiles(full_name)')
        .in('campaign_id', campData.map(c => c.id))
        .eq('status', 'confirmed')
        .order('created_at', { ascending: false }).limit(10);
      return (data ?? []).map((r: any) => ({ ...r, campaign: campData.find(c => c.id === r.campaign_id) }));
    },
    enabled: !!business,
  });

  // Approve
  const approveReservation = useMutation({
    mutationFn: async ({ reservationId, campaignTitle, priceText, partySize }: { reservationId: string; campaignTitle: string; priceText: string | null; partySize: number }) => {
      if (!business) return;
      await supabase.from('reservations').update({ status: 'completed' }).eq('id', reservationId);
      const amount = priceText ? parseFloat(priceText.replace(/[^0-9.,]/g, '').replace(',', '.')) : 0;
      if (amount > 0) {
        await supabase.from('business_transactions').insert({
          business_id: business.id, type: 'income',
          amount: amount * partySize,
          description: `💰 ${campaignTitle} (x${partySize})`,
          category: 'promo',
        });
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pending_reservations'] });
      queryClient.invalidateQueries({ queryKey: ['biz_transactions'] });
      queryClient.invalidateQueries({ queryKey: ['business_stats'] });
    },
  });

  const rejectReservation = useMutation({
    mutationFn: async (id: string) => { await supabase.from('reservations').update({ status: 'cancelled' }).eq('id', id); },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['pending_reservations'] }); queryClient.invalidateQueries({ queryKey: ['business_stats'] }); },
  });

  const { refreshProfile } = useAuth();

  if (isLoading) return <div className="flex justify-center pt-20"><div className="spinner" /></div>;

  if (!business) {
    return (
      <div className="max-w-lg mx-auto flex flex-col items-center justify-center min-h-[70vh] text-center px-6">
        <p className="text-6xl mb-4">🏪</p>
        <h2 className="text-xl font-display font-bold mb-2">¡Sumá tu negocio a Pintó!</h2>
        <p className="text-gray-500 text-sm mb-8">Creá tu perfil, publicá promos y conectá con gente que quiere pasarla bien 🎉</p>
        <Link href="/negocio/nuevo" className="w-full py-3.5 bg-accent-500 text-white rounded-xl font-semibold shadow-md text-center text-lg">
          🚀 Crear mi negocio
        </Link>
        <button onClick={async () => { await refreshProfile(); queryClient.invalidateQueries({ queryKey: ['business', 'me'] }); }}
          className="mt-3 text-gray-400 text-xs">¿Ya lo creaste? Reintentar</button>
      </div>
    );
  }

  return (
    <div className="max-w-lg mx-auto pb-20">
      {/* Header */}
      <header className="px-4 pt-6 pb-2">
        <p className="text-sm text-gray-400">{(business.category as any)?.icon} {(business.category as any)?.name}</p>
        <h1 className="text-xl font-display font-bold">{business.name} ✨</h1>
      </header>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-2 px-4 pb-4">
        <div className="bg-white rounded-2xl border border-gray-100 p-2.5 text-center shadow-sm">
          <p className="text-lg mb-0.5">👀</p>
          <p className="text-base font-black">{stats?.views ?? 0}</p>
          <p className="text-[0.5rem] text-gray-400 font-bold uppercase">Vistas</p>
        </div>
        <div className="bg-white rounded-2xl border border-gray-100 p-2.5 text-center shadow-sm">
          <p className="text-lg mb-0.5">🙋</p>
          <p className="text-base font-black">{stats?.reservations ?? 0}</p>
          <p className="text-[0.5rem] text-gray-400 font-bold uppercase">Reservas</p>
        </div>
        <div className="bg-white rounded-2xl border border-gray-100 p-2.5 text-center shadow-sm">
          <p className="text-lg mb-0.5">📢</p>
          <p className="text-base font-black">{stats?.campaigns ?? 0}</p>
          <p className="text-[0.5rem] text-gray-400 font-bold uppercase">Promos</p>
        </div>
        <Link href="/negocio/mensajes" className="bg-white rounded-2xl border border-gray-100 p-2.5 text-center shadow-sm relative">
          <p className="text-lg mb-0.5">💬</p>
          <p className="text-base font-black">{stats?.unreadMsgs ?? 0}</p>
          <p className="text-[0.5rem] text-gray-400 font-bold uppercase">Mensajes</p>
          {(stats?.unreadMsgs ?? 0) > 0 && <span className="absolute top-1 right-1 w-2.5 h-2.5 bg-red-500 rounded-full" />}
        </Link>
      </div>

      {/* Pending Reservations */}
      <div className="px-4 pb-4">
        <h2 className="font-display font-bold text-sm mb-2">🔔 Reservas por aprobar</h2>
        {!pendingReservations?.length ? (
          <div className="text-center py-8 bg-gray-50/50 rounded-2xl border border-dashed border-gray-200">
            <p className="text-3xl mb-1">✅</p>
            <p className="text-sm text-gray-400">Todo al día, no hay reservas pendientes</p>
          </div>
        ) : (
          <div className="space-y-2">
            {pendingReservations.map((r: any) => (
              <div key={r.id} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-3">
                <div className="flex items-start justify-between mb-2">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold truncate">🧑 {r.user?.full_name ?? 'Usuario'}</p>
                    <p className="text-[0.65rem] text-gray-400">🎫 {r.campaign?.title ?? 'Campaña'} · 👥 {r.party_size} pers.</p>
                    {r.campaign?.price_text && <p className="text-[0.6rem] text-green-600 font-bold mt-0.5">💵 {r.campaign.price_text}</p>}
                  </div>
                </div>
                <div className="flex gap-2">
                  <button onClick={() => approveReservation.mutate({
                    reservationId: r.id, campaignTitle: r.campaign?.title ?? 'Promo',
                    priceText: r.campaign?.price_text, partySize: r.party_size,
                  })} className="flex-1 flex items-center justify-center gap-1.5 py-2 bg-green-500 text-white rounded-xl text-xs font-bold active:scale-95 transition">
                    <CheckCircle size={14} /> Pagó ✅
                  </button>
                  <button onClick={() => rejectReservation.mutate(r.id)}
                    className="flex items-center justify-center gap-1.5 px-4 py-2 bg-red-50 text-red-500 rounded-xl text-xs font-bold active:scale-95 transition">
                    <XCircle size={14} /> ✖️
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Quick Tips */}
      <div className="px-4">
        <div className="bg-gradient-to-br from-accent-50 to-brand-50 rounded-2xl p-4 border border-accent-100">
          <p className="text-sm font-bold mb-1">💡 Tip del día</p>
          <p className="text-xs text-gray-600">Cuando un cliente reserva y paga, aprobalo acá arriba y el ingreso se registra automáticamente en 💰 Finanzas.</p>
        </div>
      </div>
    </div>
  );
}
