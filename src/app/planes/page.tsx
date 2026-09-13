'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Users, Plus, Calendar, MapPin, ChevronRight, Clock } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth';
import { useQuery } from '@tanstack/react-query';
import { useUserLocation, haversineDistance } from '@/lib/geolocation';
import { useBlockedIds, filterBlocked } from '@/lib/blocks';
import { DistanceBadge } from '@/components/shared/DistanceBadge';
import type { SocialPlan } from '@/types/database';
import { today } from '@/lib/dates';
import { sb } from '@/lib/sb';
import { PageSpinner } from '@/components/shared/PageSpinner';
import { SkeletonLista } from '@/components/shared/Skeleton';
import { PullToRefresh } from '@/components/shared/PullToRefresh';
import { tap } from '@/lib/haptics';

/** Tamaño de tanda del listado de planes. */
const PLANES_PAGE = 30;

export default function PlanesFeedPage() {
  const { user, role } = useAuth();
  const { location } = useUserLocation();
  const { blockedSet } = useBlockedIds();
  const [filter, setFilter] = useState<'all' | 'nearby' | 'today'>('all');
  const [catFilter, setCatFilter] = useState('');

  const { data: categories } = useQuery({
    queryKey: ['plan_categories'],
    queryFn: async () => {
      const data = await sb(supabase.from('plan_categories').select('*').order('sort_order'));
      return data ?? [];
    },
  });

  // Cuántos planes pedir. Crece al tocar "ver más": antes la lista se
  // cortaba en 30 sin decirlo y no había forma de ver el resto.
  const [tope, setTope] = useState(PLANES_PAGE);

  const { data: plans, isLoading, error: queryError, refetch, isFetching } = useQuery({
    // catFilter y location se usan dentro de queryFn pero no estaban en la
    // key: al tocar una categoría, react-query servía el resultado cacheado
    // y los botones de filtro parecían no hacer nada.
    queryKey: ['social_plans', filter, catFilter, location?.lat, location?.lng, tope],
    queryFn: async () => {
      let query = supabase
        .from('social_plans')
        .select(`*, creator:profiles!creator_id(id, full_name, avatar_url, reputation_score, zone:zones(name)),
                    campaign:campaigns(id, title, business:businesses(name))`)
        .eq('status', 'open')
        .eq('visibility', 'public')
        .gte('plan_date', today())
        .order('plan_date')
        .limit(tope);

      if (catFilter) { query = query.eq('category_id', catFilter); }
      if (filter === 'today') {
        query = query.eq('plan_date', today());
      }

      // El rollout de sb() no matcheó este caso porque la cadena se arma
      // en una variable. Seguía devolviendo [] ante cualquier error, así que
      // un fallo se veía como "no hay planes disponibles".
      const data = await sb(query);
      let result = (data ?? []) as any[];

      // Add distance if user has location
      if (location) {
        result = result.map(p => ({
          ...p,
          distance: p.latitude && p.longitude
            ? haversineDistance(location.lat, location.lng, p.latitude, p.longitude)
            : Infinity,
        }));

        if (filter === 'nearby') {
          result = result.filter((p: any) => p.distance <= 10); // Within 10km
          result.sort((a: any, b: any) => a.distance - b.distance);
        }
      }

      return result;
    },
  });

  // Los planes de personas bloqueadas no se muestran
  const visiblePlans = filterBlocked<any>(plans, blockedSet, p => p.creator_id);

  return (
    <PullToRefresh onRefresh={() => refetch()}>
    <div className="max-w-lg mx-auto pb-6">
      <header className="px-4 pt-6 pb-3 flex items-center justify-between">
        <div>
         <h1 className="text-xl font-display font-bold">🤝 Planes</h1>
          <p className="text-sm text-muted">¡Sumate a un plan o armá el tuyo! 🌟</p>
        </div>
        {user && role !== 'business' && (
          <div className="flex gap-2">
            <Link href="/planes/random" className="p-2.5 bg-accent-100 text-accent-600 rounded-xl">
              🎲
            </Link>
            <Link href="/planes/crear" className="p-2.5 bg-brand-500 text-white rounded-xl shadow-md shadow-brand-500/20">
              <Plus size={20} />
            </Link>
          </div>
        )}
      </header>

      {/* Filters */}
      <div className="flex gap-2 px-4 pb-3">
        {[
          { key: 'all', label: '📋 Todos' },
          { key: 'nearby', label: '📍 Cerca' },
          { key: 'today', label: '🔥 Hoy' },
        ].map(f => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key as any)}
            className={`px-3.5 py-2 rounded-full text-sm font-medium transition ${
              filter === f.key ? 'bg-brand-500 text-white shadow-md' : 'bg-surface text-muted border border-line-strong'
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* Category filter */}
      <div className="flex gap-1.5 px-4 pb-3 overflow-x-auto no-scrollbar">
        <button onClick={() => setCatFilter('')}
          className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-medium transition ${!catFilter ? 'bg-gray-900 text-white' : 'bg-subtle text-muted'}`}>
          Todas
        </button>
        {categories?.map((cat: any) => (
          <button key={cat.id} onClick={() => setCatFilter(catFilter === cat.id ? '' : cat.id)}
            className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-medium transition ${catFilter === cat.id ? 'bg-gray-900 text-white' : 'bg-subtle text-muted'}`}>
            {cat.emoji} {cat.name}
          </button>
        ))}
      </div>

      {/* Plans */}
      <div className="px-4 space-y-3">
        {isLoading ? (
          <PageSpinner fullScreen={false} onRetry={() => void refetch()} skeleton={<SkeletonLista cuantos={4} />} />
        ) : queryError ? (
          <div className="text-center py-16 px-6">
            <p className="text-4xl mb-3">😕</p>
            <p className="text-ink-soft font-medium">No se pudo cargar</p>
            <p className="text-xs text-faint mt-1 break-words">
              {queryError instanceof Error ? queryError.message : 'Algo salió mal'}
            </p>
            <button onClick={() => refetch()} disabled={isFetching}
              className="mt-4 px-5 py-2.5 bg-brand-500 text-white rounded-xl font-medium text-sm disabled:opacity-50 active:scale-95 transition">
              {isFetching ? 'Reintentando...' : 'Reintentar'}
            </button>
          </div>
        ) : !visiblePlans.length ? (
          /*
            Un vacío bueno es un botón, no un cartel. "No hay planes
            disponibles" deja al usuario en un callejón: no explica por qué
            está vacío ni qué hacer, y en una app que depende de que la
            gente publique, ese momento es justo cuando hay que pedírselo.
          */
          <div className="text-center py-14 px-6">
            <p className="text-5xl mb-4">🌵</p>
            <p className="font-semibold text-ink">
              {catFilter || filter === 'today' ? 'Nada con esos filtros' : 'Todavía no hay planes'}
            </p>
            <p className="text-sm text-muted mt-1 leading-relaxed">
              {catFilter || filter === 'today'
                ? 'Probá sacando algún filtro, o armá vos el primero.'
                : 'Sé el primero: elegís un lugar, una hora, y la gente se suma.'}
            </p>
            {user && role !== 'business' && (
              <Link
                href="/planes/crear"
                onClick={() => void tap()}
                className="mt-5 inline-flex items-center justify-center gap-2 min-h-[48px] px-6 py-3 bg-brand-500 text-white font-bold rounded-2xl text-sm active:scale-95 transition shadow-lg shadow-brand-500/20"
              >
                <Plus size={16} /> Armar un plan
              </Link>
            )}
            {!user && (
              <Link
                href="/login"
                className="mt-5 inline-flex items-center justify-center min-h-[48px] px-6 py-3 bg-brand-500 text-white font-bold rounded-2xl text-sm"
              >
                Entrar para armar uno
              </Link>
            )}
          </div>
        ) : (
          visiblePlans.map((plan: any) => (
            <Link
              key={plan.id}
              href={`/planes/detalle?id=${plan.id}`}
              className="block bg-surface rounded-2xl border border-line shadow-sm hover:shadow-md transition p-4"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <h3 className="font-semibold text-sm">{plan.title}</h3>
                  {plan.description && <p className="text-xs text-muted mt-0.5 line-clamp-2">{plan.description}</p>}
                </div>
                <ChevronRight size={16} className="text-faint mt-0.5 shrink-0" />
              </div>

              {/* Campaign link */}
              {plan.campaign && (
                <p className="text-[0.65rem] text-accent-600 bg-accent-50 px-2 py-0.5 rounded-full inline-block mt-2">
                  🏷 {plan.campaign.title} — {plan.campaign.business?.name}
                </p>
              )}

              <div className="flex flex-wrap items-center gap-3 mt-2 text-xs text-faint">
                {/* Creator */}
                <span className="flex items-center gap-1">
                  <span className="w-5 h-5 rounded-full bg-brand-100 flex items-center justify-center text-[0.55rem] font-bold text-brand-600">
                    {plan.creator?.full_name?.[0]?.toUpperCase() ?? '?'}
                  </span>
                  <span className="font-medium text-muted">{plan.creator?.full_name}</span>
                </span>

                {/* Date/time */}
                <span className="flex items-center gap-0.5">
                  <Calendar size={11} />
                  {new Date(plan.plan_date + 'T00:00:00').toLocaleDateString('es-AR', { weekday: 'short', day: 'numeric', month: 'short' })}
                  {plan.plan_time && ` ${plan.plan_time.slice(0, 5)}`}
                </span>

                {/* Members */}
                <span className="flex items-center gap-0.5">
                  <Users size={11} />
                  {plan.members_count ?? 0}/{plan.max_members}
                </span>

                {/* Distance */}
                {plan.distance !== undefined && isFinite(plan.distance) && (
                  <DistanceBadge distance={plan.distance} />
                )}
              </div>
            </Link>
          ))
        )}

        {/* Si volvió exactamente el tope, es probable que haya más. */}
        {!isLoading && !queryError && plans && plans.length >= tope && (
          <button
            onClick={() => setTope((t: number) => t + PLANES_PAGE)}
            disabled={isFetching}
            className="w-full py-3 text-sm font-medium text-muted bg-surface border border-line rounded-xl disabled:opacity-50"
          >
            {isFetching ? 'Cargando...' : 'Ver más planes'}
          </button>
        )}
      </div>
    </div>
    </PullToRefresh>
  );
}
