'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Users, Plus, Calendar, MapPin, ChevronRight, Clock } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth';
import { useQuery } from '@tanstack/react-query';
import { useUserLocation, haversineDistance } from '@/lib/geolocation';
import { DistanceBadge } from '@/components/shared/DistanceBadge';
import type { SocialPlan } from '@/types/database';

export default function PlanesFeedPage() {
  const { user, role } = useAuth();
  const { location } = useUserLocation();
  const [filter, setFilter] = useState<'all' | 'nearby' | 'today'>('all');
  const [catFilter, setCatFilter] = useState('');

  const { data: categories } = useQuery({
    queryKey: ['plan_categories'],
    queryFn: async () => {
      const { data } = await supabase.from('plan_categories').select('*').order('sort_order');
      return data ?? [];
    },
  });

  const { data: plans, isLoading } = useQuery({
    queryKey: ['social_plans', filter],
    queryFn: async () => {
      let query = supabase
        .from('social_plans')
        .select(`*, creator:profiles(id, full_name, avatar_url, reputation_score, zone:zones(name)),
                    campaign:campaigns(id, title, business:businesses(name)),
                    members:social_plan_members(id)`)
        .eq('status', 'open')
        .eq('visibility', 'public')
        .gte('plan_date', new Date().toISOString().split('T')[0])
        .order('plan_date')
        .limit(30);

      if (catFilter) { query = query.eq('category_id', catFilter); }
      if (filter === 'today') {
        query = query.eq('plan_date', new Date().toISOString().split('T')[0]);
      }

      const { data } = await query;
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

  return (
    <div className="max-w-lg mx-auto pb-6">
      <header className="px-4 pt-6 pb-3 flex items-center justify-between">
        <div>
         <h1 className="text-xl font-display font-bold">🤝 Planes</h1>
          <p className="text-sm text-gray-500">¡Sumate a un plan o armá el tuyo! 🌟</p>
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
              filter === f.key ? 'bg-brand-500 text-white shadow-md' : 'bg-white text-gray-600 border border-gray-200'
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* Category filter */}
      <div className="flex gap-1.5 px-4 pb-3 overflow-x-auto no-scrollbar">
        <button onClick={() => setCatFilter('')}
          className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-medium transition ${!catFilter ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-600'}`}>
          Todas
        </button>
        {categories?.map((cat: any) => (
          <button key={cat.id} onClick={() => setCatFilter(catFilter === cat.id ? '' : cat.id)}
            className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-medium transition ${catFilter === cat.id ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-600'}`}>
            {cat.emoji} {cat.name}
          </button>
        ))}
      </div>

      {/* Plans */}
      <div className="px-4 space-y-3">
        {isLoading ? (
          <div className="flex flex-col items-center py-16 text-gray-400">
            <div className="spinner" />
            <p className="mt-3 text-sm">Buscando planes...</p>
          </div>
        ) : !plans?.length ? (
          <div className="text-center py-16 text-gray-400">
            <Users size={40} className="mx-auto mb-3 text-gray-200" />
            <p>No hay planes disponibles</p>
            {user && role !== 'business' && (
              <Link href="/planes/crear" className="text-brand-500 font-medium text-sm mt-2 inline-block">Creá el primero →</Link>
            )}
          </div>
        ) : (
          plans.map((plan: any) => (
            <Link
              key={plan.id}
              href={`/planes/detalle?id=${plan.id}`}
              className="block bg-white rounded-2xl border border-gray-100 shadow-sm hover:shadow-md transition p-4"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <h3 className="font-semibold text-sm">{plan.title}</h3>
                  {plan.description && <p className="text-xs text-gray-500 mt-0.5 line-clamp-2">{plan.description}</p>}
                </div>
                <ChevronRight size={16} className="text-gray-300 mt-0.5 shrink-0" />
              </div>

              {/* Campaign link */}
              {plan.campaign && (
                <p className="text-[0.65rem] text-accent-600 bg-accent-50 px-2 py-0.5 rounded-full inline-block mt-2">
                  🏷 {plan.campaign.title} — {plan.campaign.business?.name}
                </p>
              )}

              <div className="flex flex-wrap items-center gap-3 mt-2 text-xs text-gray-400">
                {/* Creator */}
                <span className="flex items-center gap-1">
                  <span className="w-5 h-5 rounded-full bg-brand-100 flex items-center justify-center text-[0.55rem] font-bold text-brand-600">
                    {plan.creator?.full_name?.[0]?.toUpperCase() ?? '?'}
                  </span>
                  <span className="font-medium text-gray-600">{plan.creator?.full_name}</span>
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
                  {plan.members?.length ?? 0}/{plan.max_members}
                </span>

                {/* Distance */}
                {plan.distance !== undefined && isFinite(plan.distance) && (
                  <DistanceBadge distance={plan.distance} />
                )}
              </div>
            </Link>
          ))
        )}
      </div>
    </div>
  );
}
