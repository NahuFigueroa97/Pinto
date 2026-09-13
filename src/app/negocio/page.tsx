'use client';

import { useAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { CheckCircle, XCircle } from 'lucide-react';
import Link from 'next/link';
import type { Business } from '@/types/database';
import { parseMoney, formatMoney } from '@/lib/money';
import { Link2 } from 'lucide-react';
import { useState } from 'react';
import { sb } from '@/lib/sb';
import { PageSpinner } from '@/components/shared/PageSpinner';

export default function NegocioDashboard() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const { data: business, isLoading } = useQuery<Business | null>({
    queryKey: ['business', 'me', user?.id],
    queryFn: async () => {
      if (!user) return null;
      const data = await sb(supabase.from('businesses').select('*').eq('owner_user_id', user.id));
      if (data && data.length > 0) {
        const b = data[0] as Business;
        const catData = await sb(supabase.from('business_categories').select('name, icon').eq('id', b.category_id).single());
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
      const campData = await sb(supabase.from('campaigns').select('id').eq('business_id', business.id));
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

  // Consumo del plan. Los límites los enforza la base (trigger
  // enforce_campaign_quota); acá solo se muestran para que el negocio
  // entienda qué le da su plan y por qué le conviene mejorarlo.
  const { data: limits } = useQuery({
    queryKey: ['business_limits', business?.id],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('business_limits', { p_business_id: business!.id });
      if (error) throw error;
      return data as {
        plan: { slug: string; name: string; price_monthly: number };
        campaigns: { used: number; max: number | null };
        featured: { used: number; max: number | null };
        can_create: boolean;
      };
    },
    enabled: !!business?.id,
  });

  // Pending reservations
  const { data: pendingReservations } = useQuery({
    queryKey: ['pending_reservations', business?.id],
    queryFn: async () => {
      if (!business) return [];
      const campData = await sb(supabase.from('campaigns').select('id, title, price_text').eq('business_id', business.id));
      if (!campData?.length) return [];
      const { data, error } = await supabase.from('reservations')
        .select('*, user:profiles(full_name)')
        .in('campaign_id', campData.map(c => c.id))
        .eq('status', 'confirmed')
        // La columna es reserved_at, no created_at. Con created_at PostgREST
        // devolvía 42703, data quedaba en null y la lista de "Reservas por
        // aprobar" salía SIEMPRE vacía, aunque hubiera reservas.
        .order('reserved_at', { ascending: false }).limit(10);
      if (error) throw error;
      return (data ?? []).map((r: any) => ({ ...r, campaign: campData.find(c => c.id === r.campaign_id) }));
    },
    enabled: !!business,
  });

  // Approve
  const approveReservation = useMutation({
    mutationFn: async ({ reservationId, campaignTitle, amountPerPerson, partySize }: { reservationId: string; campaignTitle: string; amountPerPerson: number; partySize: number }) => {
      if (!business) return;
      await supabase.from('reservations').update({ status: 'completed' }).eq('id', reservationId);
      // El importe ahora lo confirma el negocio. Antes se adivinaba con
      // parseFloat(price_text): "$1.500" se convertía en 1.5 y el ingreso
      // registrado quedaba mil veces por debajo del real.
      if (amountPerPerson > 0) {
        await supabase.from('business_transactions').insert({
          business_id: business.id, type: 'income',
          amount: amountPerPerson * partySize,
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

  if (isLoading) return <PageSpinner />;

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

      {/*
        Los negocios entran como 'pending' y los aprueba un admin. Antes el
        alta mandaba status:'active' desde el cliente y se salteaba la
        moderación; ahora hay que avisarle al dueño que está en revisión, si
        no no entiende por qué su negocio no aparece en Explorar.
      */}
      {business.status !== 'active' && (
        <div className="mx-4 mb-3 rounded-2xl border border-yellow-200 bg-yellow-50 p-3">
          <p className="text-sm font-bold text-yellow-800">
            {business.status === 'pending' ? '⏳ Tu negocio está en revisión' :
             business.status === 'suspended' ? '⛔ Tu negocio está suspendido' :
             '❌ Tu negocio fue rechazado'}
          </p>
          <p className="text-xs text-yellow-700 mt-0.5">
            {business.status === 'pending'
              ? 'Podés ir cargando tus promos. Cuando lo aprobemos va a aparecer en Explorar y en Cerca mío.'
              : 'Escribinos a soporte@pinto.app para revisar tu caso.'}
          </p>
        </div>
      )}

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

      {/* Plan y consumo */}
      {limits && (
        <div className="px-4 pb-4">
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
            <div className="flex items-center justify-between mb-3">
              <div>
                <p className="text-[0.6rem] text-gray-400 font-bold uppercase tracking-wide">Tu plan</p>
                <p className="font-display font-bold text-sm">{limits.plan.name}</p>
              </div>
              {limits.plan.slug === 'free' && (
                <Link href="/negocio/plan"
                  className="text-xs font-bold px-3 py-1.5 rounded-full bg-gradient-to-r from-brand-500 to-accent-500 text-white shadow-sm">
                  Mejorar
                </Link>
              )}
            </div>

            <QuotaBar
              label="Promos activas"
              used={limits.campaigns.used}
              max={limits.campaigns.max}
            />
            <div className="h-2" />
            <QuotaBar
              label="Destacadas"
              used={limits.featured.used}
              max={limits.featured.max}
            />

            {!limits.can_create && (
              <p className="text-[0.7rem] text-yellow-700 bg-yellow-50 rounded-lg px-2.5 py-1.5 mt-3">
                Llegaste al tope. Pausá una promo o mejorá el plan para publicar más.
              </p>
            )}
          </div>
        </div>
      )}

      {/* Lector de QR para validar reservas en el mostrador */}
      <div className="px-4 pb-4">
        <Link href="/negocio/checkin"
          className="flex items-center gap-3 p-3.5 bg-gradient-to-br from-accent-500 to-brand-500 text-white rounded-2xl shadow-md active:scale-[0.98] transition">
          <span className="text-2xl">📷</span>
          <div className="flex-1">
            <p className="font-bold text-sm">Validar reserva</p>
            <p className="text-[0.65rem] text-white/80">Escaneá el QR del cliente o cargá su código</p>
          </div>
          <span className="text-lg">›</span>
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
              <PendingReservationCard
                key={r.id}
                reservation={r}
                onApprove={(amountPerPerson) => approveReservation.mutate({
                  reservationId: r.id,
                  campaignTitle: r.campaign?.title ?? 'Promo',
                  amountPerPerson,
                  partySize: r.party_size,
                })}
                onReject={() => rejectReservation.mutate(r.id)}
              />
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

/**
 * Tarjeta de reserva pendiente con el importe editable.
 * price_text es texto libre ("2x1", "$1.500", "Gratis"), así que derivar
 * plata de ahí automáticamente era adivinar. Se propone el valor parseado
 * y el negocio lo confirma o lo corrige antes de registrar el ingreso.
 */
function PendingReservationCard({
  reservation: r,
  onApprove,
  onReject,
}: {
  reservation: any;
  onApprove: (amountPerPerson: number) => void;
  onReject: () => void;
}) {
  const suggested = parseMoney(r.campaign?.price_text) ?? 0;
  const [amount, setAmount] = useState(suggested > 0 ? String(suggested) : '');

  const parsed = parseMoney(amount) ?? 0;
  const total = parsed * (r.party_size ?? 1);

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-3">
      <div className="flex items-start justify-between mb-2">
        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold truncate">🧑 {r.user?.full_name ?? 'Usuario'}</p>
          <p className="text-[0.65rem] text-gray-400">
            🎫 {r.campaign?.title ?? 'Campaña'} · 👥 {r.party_size} pers.
          </p>
          {r.campaign?.price_text && (
            <p className="text-[0.6rem] text-gray-400 mt-0.5">Precio publicado: {r.campaign.price_text}</p>
          )}
        </div>
      </div>

      <div className="flex items-center gap-2 mb-2">
        <label className="text-[0.65rem] text-gray-500 shrink-0">$ por persona</label>
        <input
          type="text"
          inputMode="decimal"
          value={amount}
          onChange={e => setAmount(e.target.value)}
          placeholder="0"
          className="flex-1 min-w-0 px-2.5 py-1.5 rounded-lg border border-gray-200 text-xs outline-none focus:border-accent-400"
        />
        {total > 0 && (
          <span className="text-[0.65rem] font-bold text-green-600 shrink-0">{formatMoney(total)}</span>
        )}
      </div>

      <div className="flex gap-2">
        <button
          onClick={() => onApprove(parsed)}
          className="flex-1 flex items-center justify-center gap-1.5 py-2 bg-green-500 text-white rounded-xl text-xs font-bold active:scale-95 transition"
        >
          <CheckCircle size={14} /> Confirmar asistencia
        </button>
        <button
          onClick={onReject}
          className="flex items-center justify-center gap-1.5 px-4 py-2 bg-red-50 text-red-500 rounded-xl text-xs font-bold active:scale-95 transition"
        >
          <XCircle size={14} /> ✖️
        </button>
      </div>
    </div>
  );
}

/** Barra de consumo de un cupo del plan. `max` null = ilimitado. */
function QuotaBar({ label, used, max }: { label: string; used: number; max: number | null }) {
  const pct = max ? Math.min(100, (used / max) * 100) : 0;
  const full = max !== null && used >= max;
  return (
    <div>
      <div className="flex items-center justify-between text-[0.65rem] mb-1">
        <span className="text-gray-500">{label}</span>
        <span className={`font-bold ${full ? 'text-yellow-600' : 'text-gray-600'}`}>
          {used}{max === null ? ' · ilimitadas' : ` / ${max}`}
        </span>
      </div>
      {max !== null && (
        <div className="w-full bg-gray-100 rounded-full h-1.5">
          <div
            className={`h-1.5 rounded-full transition-all ${full ? 'bg-yellow-400' : 'bg-accent-500'}`}
            style={{ width: `${pct}%` }}
          />
        </div>
      )}
    </div>
  );
}
