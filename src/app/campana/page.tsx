'use client';

import { useState, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { ArrowLeft, MapPin, Clock, Users, Heart, Share2, CalendarCheck, Store, UserPlus, ChevronRight } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { Campaign, Reservation } from '@/types/database';
import Link from 'next/link';

const TYPE_LABELS: Record<string, string> = {
  promo: '🏷️ Promo',
  group_promo: '👥 Promo Grupal',
  event: '🎉 Evento',
  time_slot: '⏰ Franja Horaria',
};

function CampaignDetailInner() {
  const searchParams = useSearchParams();
  const id = searchParams.get('id');
  const router = useRouter();
  const { user, role } = useAuth();
  const queryClient = useQueryClient();
  const [partySize, setPartySize] = useState(1);
  const [showMsgBox, setShowMsgBox] = useState(false);
  const [msgText, setMsgText] = useState('');

  const { data: campaign, isLoading } = useQuery({
    queryKey: ['campaign', id],
    queryFn: async () => {
      if (!id) return null;
      const { data } = await supabase
        .from('campaigns')
        .select(`*, business:businesses(id, name, slug, address, phone, instagram, logo_url, description)`)
        .eq('id', id)
        .single();

      if (data && user) {
        supabase.from('analytics_events').insert({
          event_type: 'campaign_view',
          user_id: user.id,
          campaign_id: id,
          business_id: data.business_id,
        });
      }
      return data as (Campaign & { business: any }) | null;
    },
    enabled: !!id,
  });

  const { data: isFavorited } = useQuery({
    queryKey: ['favorite', 'campaign', id],
    queryFn: async () => {
      if (!user || !id) return false;
      const { data } = await supabase.from('favorites').select('id').eq('user_id', user.id).eq('campaign_id', id).maybeSingle();
      return !!data;
    },
    enabled: !!user && !!id,
  });

  const { data: myReservation } = useQuery({
    queryKey: ['my_reservation', id],
    queryFn: async () => {
      if (!user || !id) return null;
      const { data } = await supabase.from('reservations').select('*').eq('campaign_id', id).eq('user_id', user.id).eq('status', 'confirmed').maybeSingle();
      return data as Reservation | null;
    },
    enabled: !!user && !!id,
  });

  const toggleFavorite = useMutation({
    mutationFn: async () => {
      if (!user) { router.push('/login'); return; }
      if (isFavorited) {
        await supabase.from('favorites').delete().eq('user_id', user.id).eq('campaign_id', id);
      } else {
        await supabase.from('favorites').insert({ user_id: user.id, campaign_id: id });
      }
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['favorite', 'campaign', id] }),
  });

  const reserve = useMutation({
    mutationFn: async () => {
      if (!user) { router.push('/login'); return; }
      const { error } = await supabase.from('reservations').insert({ campaign_id: id, user_id: user.id, party_size: partySize });
      if (error) throw error;
      await supabase.from('analytics_events').insert({ event_type: 'reservation_created', user_id: user.id, campaign_id: id, business_id: campaign?.business_id });
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['my_reservation', id] }),
  });

  const cancelReservation = useMutation({
    mutationFn: async () => {
      if (!myReservation) return;
      await supabase.from('reservations').update({ status: 'cancelled' }).eq('id', myReservation.id);
      await supabase.from('analytics_events').insert({ event_type: 'reservation_cancelled', user_id: user!.id, campaign_id: id });
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['my_reservation', id] }),
  });

  if (!id || isLoading) return <div className="flex items-center justify-center min-h-screen"><div className="spinner" /></div>;

  if (!campaign) return (
    <div className="flex flex-col items-center justify-center min-h-screen text-gray-400">
      <p className="text-4xl mb-3">😕</p>
      <p>Campaña no encontrada</p>
      <button onClick={() => router.push('/')} className="mt-3 text-brand-500 font-medium">Volver</button>
    </div>
  );

  const startDate = new Date(campaign.starts_at);
  const endDate = new Date(campaign.ends_at);

  return (
    <div className="max-w-lg mx-auto pb-24">
      <div className="sticky top-0 z-10 flex items-center justify-between px-4 py-3 glass">
        <button onClick={() => router.back()} className="p-1.5 rounded-full bg-white/50"><ArrowLeft size={20} /></button>
        <div className="flex gap-2">
          <button onClick={() => toggleFavorite.mutate()} className="p-1.5 rounded-full bg-white/50">
            <Heart size={20} className={isFavorited ? 'fill-red-500 text-red-500' : 'text-gray-600'} />
          </button>
        </div>
      </div>

      {campaign.banner_image_url && (
        <div className="h-48 bg-gray-100"><img src={campaign.banner_image_url} alt="" className="w-full h-full object-cover" /></div>
      )}

      <div className="px-4 pt-4 space-y-4">
        <div className="flex flex-wrap gap-2">
          <span className="text-xs font-semibold px-3 py-1 rounded-full bg-brand-50 text-brand-600">{TYPE_LABELS[campaign.type]}</span>
          {campaign.is_free && <span className="text-xs font-semibold px-3 py-1 rounded-full bg-green-50 text-green-600">Gratis</span>}
          {campaign.is_featured && <span className="text-xs font-semibold px-3 py-1 rounded-full bg-yellow-50 text-yellow-600">⭐ Destacado</span>}
        </div>

        <h1 className="text-xl font-display font-bold">{campaign.title}</h1>
        <p className="text-gray-600 text-sm leading-relaxed">{campaign.full_description || campaign.short_description}</p>

        <div className="grid grid-cols-2 gap-3">
          <div className="bg-gray-50 rounded-xl p-3">
            <div className="flex items-center gap-1.5 text-xs text-gray-400 mb-0.5"><Clock size={12} /> Cuándo</div>
            <p className="text-sm font-medium">{startDate.toLocaleDateString('es-AR', { weekday: 'short', day: 'numeric', month: 'short' })}</p>
            <p className="text-xs text-gray-500">{startDate.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })} - {endDate.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })}</p>
          </div>
          {campaign.max_capacity && (
            <div className="bg-gray-50 rounded-xl p-3">
              <div className="flex items-center gap-1.5 text-xs text-gray-400 mb-0.5"><Users size={12} /> Capacidad</div>
              <p className="text-sm font-medium">{campaign.max_capacity} lugares</p>
              {campaign.min_group_size && <p className="text-xs text-gray-500">Mín. {campaign.min_group_size} personas</p>}
            </div>
          )}
          {campaign.price_text && (
            <div className="bg-gray-50 rounded-xl p-3">
              <div className="text-xs text-gray-400 mb-0.5">💰 Precio</div>
              <p className="text-sm font-medium">{campaign.price_text}</p>
            </div>
          )}
        </div>

        {campaign.business && (
          <button
            onClick={() => router.push(`/negocio/detalle?slug=${campaign.business.slug}`)}
            className="w-full flex items-center gap-3 p-3 bg-white border border-gray-100 rounded-xl shadow-sm"
          >
            <div className="w-10 h-10 rounded-xl bg-accent-50 flex items-center justify-center text-accent-500"><Store size={18} /></div>
            <div className="flex-1 text-left">
              <p className="font-semibold text-sm">{campaign.business.name}</p>
              {campaign.business.address && <p className="text-xs text-gray-400 flex items-center gap-0.5"><MapPin size={10} /> {campaign.business.address}</p>}
            </div>
          </button>
        )}

        {/* Social Plans for this campaign — users only */}
        {id && role !== 'business' && <CampaignPlans campaignId={id} />}

        {/* Message the business */}
        {role !== 'business' && campaign.business && (
          <div className="px-4 pt-2 pb-4">
            {!showMsgBox ? (
              <button onClick={() => user ? setShowMsgBox(true) : router.push('/login')}
                className="w-full flex items-center justify-center gap-2 py-3 bg-white border-2 border-dashed border-brand-200 text-brand-500 font-bold rounded-xl text-sm hover:border-brand-400 transition">
                💬 Consultale al negocio
              </button>
            ) : (
              <div className="bg-white rounded-2xl border border-gray-100 shadow-lg p-4 space-y-3">
                <p className="text-sm font-bold">💬 Mensaje para {campaign.business.name}</p>
                <textarea value={msgText} onChange={e => setMsgText(e.target.value)}
                  placeholder="Ej: ¿Hasta qué hora es válida la promo? ¿Puedo ir con niños?"
                  className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm focus:border-brand-400 outline-none resize-none" rows={3} />
                <div className="flex gap-2">
                  <button onClick={async () => {
                    if (!msgText.trim() || !user) return;
                    await supabase.from('business_messages').insert({
                      business_id: campaign.business.id,
                      user_id: user.id,
                      campaign_id: campaign.id,
                      sender_role: 'user',
                      message: msgText.trim(),
                    });
                    setMsgText(''); setShowMsgBox(false);
                    alert('✅ Mensaje enviado! El negocio te va a responder pronto.');
                  }} disabled={!msgText.trim()}
                    className="flex-1 py-2.5 bg-brand-500 text-white font-bold rounded-xl text-sm disabled:opacity-40">
                    Enviar ✉️
                  </button>
                  <button onClick={() => setShowMsgBox(false)} className="px-4 py-2.5 text-gray-400 text-sm font-medium">Cancelar</button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      <div className="fixed bottom-16 inset-x-0 p-4 glass border-t border-gray-100">
        <div className="max-w-lg mx-auto">
          {myReservation ? (
            <div className="flex items-center gap-3">
              <div className="flex-1 bg-green-50 text-green-700 px-4 py-3 rounded-xl text-center">
                <CalendarCheck size={16} className="inline mr-1" />
                <span className="text-sm font-medium">Reserva confirmada ({myReservation.party_size} pers.)</span>
              </div>
              <button onClick={() => cancelReservation.mutate()} className="text-sm text-red-500 font-medium px-3 py-3">Cancelar</button>
            </div>
          ) : campaign.requires_reservation && role !== 'business' ? (
            <div className="flex items-center gap-3">
              {campaign.min_group_size && campaign.min_group_size > 1 && (
                <div className="flex items-center bg-gray-100 rounded-xl">
                  <button onClick={() => setPartySize(Math.max(1, partySize - 1))} className="px-3 py-2 text-lg">-</button>
                  <span className="px-2 text-sm font-medium">{partySize}</span>
                  <button onClick={() => setPartySize(partySize + 1)} className="px-3 py-2 text-lg">+</button>
                </div>
              )}
              <button onClick={() => reserve.mutate()} disabled={reserve.isPending}
                className="flex-1 py-3 bg-brand-500 text-white font-semibold rounded-xl hover:bg-brand-600 disabled:opacity-50 transition shadow-md shadow-brand-500/20">
                {reserve.isPending ? 'Reservando...' : '¡Me sumo! 🙋'}
              </button>
            </div>
          ) : role === 'business' ? (
            <div className="text-center text-sm text-gray-500 py-2">Como negocio no podés reservar promociones</div>
          ) : (
            <div className="text-center text-sm text-gray-500 py-2">No requiere reserva — ¡presentate directamente!</div>
          )}
        </div>
      </div>
    </div>
  );
}

function CampaignPlans({ campaignId }: { campaignId: string }) {
  const { user, role } = useAuth();
  const router = useRouter();

  const { data: plans, isLoading } = useQuery({
    queryKey: ['campaign_plans', campaignId],
    queryFn: async () => {
      try {
        const { data, error } = await supabase.from('social_plans')
          .select('*, creator:profiles(full_name), members:social_plan_members(id)')
          .eq('campaign_id', campaignId).eq('status', 'open').eq('visibility', 'public')
          .order('plan_date');
        if (error) return [];
        return data ?? [];
      } catch {
        return [];
      }
    },
    enabled: !!campaignId,
    retry: false,
  });

  return (
    <div className="px-4 pt-2 pb-4 space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-sm">👥 Planes para esta promo</h3>
        {role !== 'business' && (
          <button
            onClick={() => user ? router.push(`/planes/crear?campaign=${campaignId}`) : router.push('/login')}
            className="flex items-center gap-1 text-xs font-medium text-brand-500 bg-brand-50 px-3 py-1.5 rounded-full"
          >
            <UserPlus size={12} /> Armar plan
          </button>
        )}
      </div>

      {isLoading ? (
        <div className="flex justify-center py-6 text-accent-400"><div className="spinner-sm" /></div>
      ) : !plans?.length ? (
        <p className="text-xs text-gray-400 text-center py-4">Nadie armó un plan todavía.</p>
      ) : (
        plans.map((p: any) => (
          <Link key={p.id} href={`/planes/detalle?id=${p.id}`}
            className="flex items-center gap-3 p-3 bg-white rounded-xl border border-gray-100 shadow-sm">
            <div className="flex-1 min-w-0">
              <h4 className="font-medium text-sm truncate">{p.title}</h4>
              <p className="text-xs text-gray-400">
                {p.creator?.full_name} · <Users size={10} className="inline" /> {p.members?.length ?? 0}/{p.max_members}
              </p>
            </div>
            <ChevronRight size={14} className="text-gray-300" />
          </Link>
        ))
      )}
    </div>
  );
}

export default function CampaignDetailPage() {
  return <Suspense fallback={<div className="flex items-center justify-center min-h-screen"><div className="spinner" /></div>}><CampaignDetailInner /></Suspense>;
}
