'use client';

import { useState, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { ArrowLeft, Calendar, MapPin, Users, Clock, MessageCircle, Check, X, UserPlus } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ProfileCard } from '@/components/shared/ProfileCard';
import Link from 'next/link';

function PlanDetailInner() {
  const searchParams = useSearchParams();
  const id = searchParams.get('id');
  const router = useRouter();
  const { user, role } = useAuth();
  const queryClient = useQueryClient();
  const [joinMsg, setJoinMsg] = useState('');
  const [showJoinForm, setShowJoinForm] = useState(false);

  const { data: plan, isLoading } = useQuery({
    queryKey: ['plan', id],
    queryFn: async () => {
      if (!id) return null;
      const { data } = await supabase
        .from('social_plans')
        .select(`*, creator:profiles(id, full_name, avatar_url, reputation_score, bio, birth_year, show_age,
                    plans_created_count, plans_joined_count, interests_text, zone:zones(name)),
                  campaign:campaigns(id, title, short_description, business:businesses(name, address)),
                  category:plan_categories(name, emoji)`)
        .eq('id', id).single();
      return data;
    },
    enabled: !!id,
  });

  const { data: members } = useQuery({
    queryKey: ['plan_members', id],
    queryFn: async () => {
      if (!id) return [];
      const { data } = await supabase
        .from('social_plan_members')
        .select(`*, user:profiles(id, full_name, avatar_url, reputation_score, zone:zones(name))`)
        .eq('plan_id', id).order('joined_at');
      return data ?? [];
    },
    enabled: !!id,
  });

  const { data: requests } = useQuery({
    queryKey: ['plan_requests', id],
    queryFn: async () => {
      if (!id) return [];
      const { data } = await supabase
        .from('social_plan_requests')
        .select(`*, user:profiles(id, full_name, avatar_url, reputation_score, bio, birth_year, show_age,
                    plans_created_count, plans_joined_count, interests_text, zone:zones(name))`)
        .eq('plan_id', id).eq('status', 'pending').order('created_at');
      return data ?? [];
    },
    enabled: !!id && plan?.creator_id === user?.id,
  });

  const { data: myRequest } = useQuery({
    queryKey: ['my_plan_request', id],
    queryFn: async () => {
      if (!id || !user) return null;
      const { data } = await supabase.from('social_plan_requests').select('*')
        .eq('plan_id', id).eq('user_id', user.id).maybeSingle();
      return data;
    },
    enabled: !!id && !!user,
  });

  const isMember = members?.some((m: any) => m.user_id === user?.id);
  const isCreator = plan?.creator_id === user?.id;
  const isPast = plan?.plan_date ? new Date(plan.plan_date + 'T23:59:59') < new Date() : false;

  const requestJoin = useMutation({
    mutationFn: async () => {
      if (!user || !id) return;
      await supabase.from('social_plan_requests').insert({
        plan_id: id, user_id: user.id, message: joinMsg || null,
      });
    },
    onSuccess: () => {
      setShowJoinForm(false);
      queryClient.invalidateQueries({ queryKey: ['my_plan_request', id] });
    },
  });

  const handleRequest = useMutation({
    mutationFn: async ({ requestId, accept }: { requestId: string; accept: boolean }) => {
      const req = requests?.find((r: any) => r.id === requestId) as any;
      if (!req) return;

      await supabase.from('social_plan_requests').update({
        status: accept ? 'accepted' : 'rejected',
        responded_at: new Date().toISOString(),
      }).eq('id', requestId);

      if (accept) {
        await supabase.from('social_plan_members').insert({
          plan_id: id, user_id: req.user_id, role: 'member',
        });

        // Check if plan is full
        const { count } = await supabase.from('social_plan_members')
          .select('id', { count: 'exact' }).eq('plan_id', id);
        if (count && plan?.max_members && count >= plan.max_members) {
          await supabase.from('social_plans').update({ status: 'full' }).eq('id', id);
        }
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['plan_requests', id] });
      queryClient.invalidateQueries({ queryKey: ['plan_members', id] });
      queryClient.invalidateQueries({ queryKey: ['plan', id] });
    },
  });

  if (!id || isLoading) return <div className="flex justify-center pt-20"><div className="spinner" /></div>;
  if (!plan) return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] text-gray-400">
      <p className="text-4xl mb-3">🤷</p><p>Plan no encontrado</p>
      <button onClick={() => router.push('/planes')} className="text-brand-500 font-medium mt-3">Ver planes</button>
    </div>
  );

  const statusBadge: Record<string, string> = {
    open: 'bg-green-50 text-green-700',
    full: 'bg-yellow-50 text-yellow-700',
    closed: 'bg-gray-100 text-gray-600',
    cancelled: 'bg-red-50 text-red-500',
  };

  return (
    <div className="max-w-lg mx-auto pb-24">
      <div className="sticky top-0 z-10 flex items-center gap-3 px-4 py-3 glass">
        <button onClick={() => router.back()} className="p-1.5 rounded-full bg-white/50"><ArrowLeft size={20} /></button>
        <h2 className="font-display font-bold truncate">{plan.title}</h2>
      </div>

      <div className="px-4 pt-2 space-y-4">
        {/* Status + Campaign */}
        <div className="flex flex-wrap gap-2">
          <span className={`text-xs font-semibold px-3 py-1 rounded-full ${statusBadge[plan.status]}`}>{plan.status}</span>
          {plan.visibility === 'private' && <span className="text-xs font-semibold px-3 py-1 rounded-full bg-gray-100 text-gray-600">🔒 Privado</span>}
          {plan.category && <span className="text-xs font-semibold px-3 py-1 rounded-full bg-brand-50 text-brand-600">{(plan as any).category.emoji} {(plan as any).category.name}</span>}
        </div>

        {/* Campaign link */}
        {plan.campaign && (
          <Link href={`/campana?id=${plan.campaign.id}`} className="block bg-accent-50 rounded-xl p-3 border border-accent-100">
            <p className="text-xs text-accent-600 font-medium">📢 Basado en promo:</p>
            <p className="font-semibold text-sm mt-0.5">{plan.campaign.title}</p>
            <p className="text-xs text-gray-500">{plan.campaign.business?.name}</p>
          </Link>
        )}

        {plan.description && <p className="text-sm text-gray-600 leading-relaxed">{plan.description}</p>}

        {/* Info */}
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-gray-50 rounded-xl p-3">
            <div className="flex items-center gap-1 text-xs text-gray-400 mb-0.5"><Calendar size={12} /> Cuándo</div>
            <p className="text-sm font-medium">
              {new Date(plan.plan_date + 'T00:00:00').toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long' })}
            </p>
            {plan.plan_time && <p className="text-xs text-gray-500">{plan.plan_time.slice(0, 5)} hs</p>}
          </div>
          <div className="bg-gray-50 rounded-xl p-3">
            <div className="flex items-center gap-1 text-xs text-gray-400 mb-0.5"><Users size={12} /> Grupo</div>
            <p className="text-sm font-medium">{members?.length ?? 0} / {plan.max_members}</p>
          </div>
          {plan.meeting_point && (
            <div className="bg-gray-50 rounded-xl p-3 col-span-2">
              <div className="flex items-center gap-1 text-xs text-gray-400 mb-0.5"><MapPin size={12} /> Punto de encuentro</div>
              <p className="text-sm font-medium">{plan.meeting_point}</p>
            </div>
          )}
        </div>

        {/* Creator */}
        <div>
          <h3 className="font-semibold text-sm mb-2">Organizador</h3>
          {plan.creator && <ProfileCard profile={plan.creator as any} compact />}
        </div>

        {/* Members */}
        <div>
          <h3 className="font-semibold text-sm mb-2">Miembros ({members?.length ?? 0})</h3>
          <div className="flex flex-wrap gap-2">
            {members?.map((m: any) => (
              <Link key={m.id} href={`/perfil/ver?id=${m.user_id}`}
                className="flex items-center gap-1.5 bg-white border border-gray-100 rounded-full px-3 py-1.5 text-sm">
                <span className="w-6 h-6 rounded-full bg-brand-100 flex items-center justify-center text-[0.55rem] font-bold text-brand-600">
                  {m.user?.full_name?.[0]?.toUpperCase() ?? '?'}
                </span>
                <span className="text-xs font-medium">{m.user?.full_name}</span>
                {m.role === 'creator' && <span className="text-[0.55rem] text-accent-500">👑</span>}
              </Link>
            ))}
          </div>
        </div>

        {/* Pending requests (creator only) */}
        {isCreator && requests && requests.length > 0 && (
          <div>
            <h3 className="font-semibold text-sm mb-2 text-brand-600">📬 Solicitudes ({requests.length})</h3>
            <div className="space-y-3">
              {requests.map((req: any) => (
                <ProfileCard
                  key={req.id}
                  profile={req.user}
                  message={req.message}
                  showActions
                  onAccept={() => handleRequest.mutate({ requestId: req.id, accept: true })}
                  onReject={() => handleRequest.mutate({ requestId: req.id, accept: false })}
                />
              ))}
            </div>
          </div>
        )}

        {isMember && (
          <div className="bg-gradient-to-br from-green-50 to-emerald-50 rounded-2xl p-4 border border-green-100">
            <h3 className="font-bold text-sm mb-1">🛡️ Juntada segura</h3>
            <p className="text-xs text-gray-500 mb-3">¿Vas a una juntada con gente que no conocés? Mandále tu ubicación a alguien de confianza (tu pareja, un amigo, familiar) para que sepa dónde estás.</p>
            <button
              onClick={async () => {
                let locationUrl = '';
                if (plan.meeting_point) {
                  locationUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(plan.meeting_point)}`;
                }
                try {
                  const pos = await new Promise<GeolocationPosition>((resolve, reject) =>
                    navigator.geolocation.getCurrentPosition(resolve, reject, { timeout: 5000 })
                  );
                  locationUrl = `https://www.google.com/maps?q=${pos.coords.latitude},${pos.coords.longitude}`;
                } catch { /* use meeting point fallback */ }

                const planDate = new Date(plan.plan_date + 'T00:00:00').toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long' });
                const msg = encodeURIComponent(
                  `🛡️ ¡Hola! Voy a una juntada que organicé por Pintó y te quiero compartir dónde voy a estar por las dudas:\n\n` +
                  `📋 Plan: ${plan.title}\n` +
                  `📅 Cuándo: ${planDate}${plan.plan_time ? ` a las ${plan.plan_time.slice(0, 5)}` : ''}\n` +
                  `📍 Dónde: ${plan.meeting_point || 'Sin punto fijo'}\n` +
                  `👥 Con ${(members?.length ?? 1)} personas\n\n` +
                  `🗺️ Mi ubicación actual: ${locationUrl || 'No disponible'}\n\n` +
                  `Si no te aviso que llegué bien, llamame 💛`
                );
                window.open(`https://wa.me/?text=${msg}`, '_blank');
              }}
              className="w-full flex items-center justify-center gap-2 py-2.5 bg-green-500 text-white font-bold rounded-xl text-sm active:scale-95 transition shadow-md"
            >
              📲 Avisarle a alguien dónde voy
            </button>
          </div>
        )}

        {/* v3: Action buttons for members */}
        {isMember && (
          <div className="grid grid-cols-3 gap-2">
            <Link href={`/planes/chat?id=${id}`}
              className="flex flex-col items-center gap-1 p-3 bg-brand-50 rounded-xl text-center active:scale-95 transition">
              <span className="text-xl">💬</span>
              <span className="text-[0.6rem] font-medium text-brand-700">Chat</span>
            </Link>
            <Link href={`/planes/fotos?id=${id}`}
              className="flex flex-col items-center gap-1 p-3 bg-purple-50 rounded-xl text-center active:scale-95 transition">
              <span className="text-xl">📸</span>
              <span className="text-[0.6rem] font-medium text-purple-700">Fotos</span>
            </Link>
            {isPast ? (
              <Link href={`/planes/valorar?id=${id}`}
                className="flex flex-col items-center gap-1 p-3 bg-yellow-50 rounded-xl text-center active:scale-95 transition">
                <span className="text-xl">⭐</span>
                <span className="text-[0.6rem] font-medium text-yellow-700">Valorar</span>
              </Link>
            ) : (
              <div className="flex flex-col items-center gap-1 p-3 bg-gray-50 rounded-xl text-center opacity-50">
                <span className="text-xl">⭐</span>
                <span className="text-[0.6rem] font-medium text-gray-500">Valorar</span>
              </div>
            )}
          </div>
        )}

        {/* v3: Repeat plan (creator only) */}
        {isCreator && (
          <Link href={`/planes/crear?repeat=${id}&title=${encodeURIComponent(plan.title)}&desc=${encodeURIComponent(plan.description || '')}&meeting=${encodeURIComponent(plan.meeting_point || '')}&max=${plan.max_members}`}
            className="flex items-center justify-center gap-2 py-2.5 bg-brand-50 text-brand-600 font-medium rounded-xl text-sm border border-brand-100 active:scale-95 transition">
            🔄 Repetir este plan
          </Link>
        )}

        {/* v3: Cancel plan (creator only) */}
        {isCreator && plan.status !== 'cancelled' && plan.status !== 'closed' && (
          <button onClick={async () => {
            if (!confirm('¿Seguro que querés cancelar este plan? Se notificará a todos los miembros.')) return;
            await supabase.from('social_plans').update({ status: 'cancelled' }).eq('id', id);
            queryClient.invalidateQueries({ queryKey: ['plan', id] });
          }}
            className="w-full py-2.5 bg-red-50 text-red-500 font-medium rounded-xl text-sm border border-red-100 active:scale-95 transition">
            ❌ Cancelar este plan
          </button>
        )}

        {/* v3: Leave plan (members, not creator) */}
        {isMember && !isCreator && (
          <button onClick={async () => {
            if (!confirm('¿Seguro que querés salir de este plan?')) return;
            await supabase.from('social_plan_members').delete().eq('plan_id', id).eq('user_id', user!.id);
            queryClient.invalidateQueries({ queryKey: ['plan_members', id] });
            queryClient.invalidateQueries({ queryKey: ['plan', id] });
          }}
            className="w-full py-2.5 bg-gray-50 text-gray-500 font-medium rounded-xl text-sm border border-gray-200 active:scale-95 transition">
            🚪 Salir del plan
          </button>
        )}

        {/* v3: Report button */}
        {user && !isCreator && (
          <Link href={`/reportar?type=plan&id=${id}`}
            className="text-center text-xs text-gray-400 py-2 block">
            🚩 Reportar este plan
          </Link>
        )}
      </div>

      {/* Bottom Action */}
      {!isCreator && plan.status === 'open' && (
        <div className="fixed bottom-16 inset-x-0 p-4 glass border-t border-gray-100">
          <div className="max-w-lg mx-auto">
            {role === 'business' ? (
              <div className="bg-gray-50 text-gray-500 px-4 py-3 rounded-xl text-center text-sm">
                Solo usuarios pueden participar en planes sociales
              </div>
            ) : isMember ? (
              <div className="bg-green-50 text-green-700 px-4 py-3 rounded-xl text-center text-sm font-medium">
                ✅ Ya sos parte de este plan
              </div>
            ) : myRequest ? (
              <div className={`px-4 py-3 rounded-xl text-center text-sm font-medium ${
                myRequest.status === 'pending' ? 'bg-yellow-50 text-yellow-700' :
                myRequest.status === 'rejected' ? 'bg-red-50 text-red-500' : 'bg-green-50 text-green-700'
              }`}>
                {myRequest.status === 'pending' && '⏳ Tu solicitud está pendiente'}
                {myRequest.status === 'rejected' && '❌ Tu solicitud fue rechazada'}
                {myRequest.status === 'accepted' && '✅ ¡Fuiste aceptado!'}
              </div>
            ) : showJoinForm ? (
              <div className="space-y-2">
                <input
                  type="text"
                  value={joinMsg}
                  onChange={e => setJoinMsg(e.target.value)}
                  placeholder="Mensaje para el organizador (opcional)"
                  className="w-full px-4 py-2.5 rounded-xl border border-gray-200 text-sm outline-none focus:border-brand-400"
                />
                <button
                  onClick={() => requestJoin.mutate()}
                  disabled={requestJoin.isPending}
                  className="w-full py-3 bg-brand-500 text-white font-semibold rounded-xl disabled:opacity-50 shadow-md shadow-brand-500/20"
                >
                  {requestJoin.isPending ? 'Enviando...' : '📩 Enviar solicitud'}
                </button>
              </div>
            ) : (
              <button
                onClick={() => user ? setShowJoinForm(true) : router.push('/login')}
                className="w-full py-3 bg-brand-500 text-white font-semibold rounded-xl shadow-md shadow-brand-500/20"
              >
                <UserPlus size={16} className="inline mr-1" /> Pedir unirme
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default function PlanDetallePage() {
  return <Suspense fallback={<div className="flex justify-center pt-20"><div className="spinner" /></div>}><PlanDetailInner /></Suspense>;
}
