'use client';

import { useState } from 'react';
import Link from 'next/link';
import { MapPin, Clock, Users, ChevronRight, Flame, Coffee, Dumbbell, Utensils, Music, Bike, Star, Sparkles } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import { useQuery } from '@tanstack/react-query';
import type { Campaign, BusinessCategory } from '@/types/database';

const CATEGORY_ICONS: Record<string, typeof Coffee> = {
  cafeteria: Coffee,
  bar: Music,
  restaurante: Utensils,
  gimnasio: Dumbbell,
  cancha: Star,
  bicicleteria: Bike,
  cultural: Sparkles,
  experiencia: Flame,
};

const CAMPAIGN_TYPE_LABELS: Record<string, string> = {
  promo: '🏷️ Promo',
  group_promo: '👯 Grupal',
  event: '🎉 Evento',
  time_slot: '⏰ Franja',
};

function timeUntil(dateStr: string): string {
  const d = new Date(dateStr);
  const now = new Date();
  const diffMs = d.getTime() - now.getTime();
  if (diffMs < 0) return 'Ahora';
  const hours = Math.floor(diffMs / 3600000);
  const mins = Math.floor((diffMs % 3600000) / 60000);
  if (hours < 1) return `En ${mins} min`;
  if (hours < 24) return `En ${hours}h`;
  return d.toLocaleDateString('es-AR', { weekday: 'short', day: 'numeric' });
}

export default function HomePage() {
  const { user, profile } = useAuth();
  const [selectedCategory, setSelectedCategory] = useState<string>('all');

  const { data: categories } = useQuery({
    queryKey: ['business_categories'],
    queryFn: async () => {
      const { data } = await supabase
        .from('business_categories')
        .select('*')
        .eq('is_active', true)
        .order('name');
      return (data ?? []) as BusinessCategory[];
    },
  });

  const { data: campaigns, isLoading } = useQuery({
    queryKey: ['campaigns_active', selectedCategory],
    queryFn: async () => {
      let query = supabase
        .from('campaigns')
        .select(`*, business:businesses(id, name, slug, logo_url, address, category_id)`)
        .eq('status', 'active')
        .gte('ends_at', new Date().toISOString())
        .order('is_featured', { ascending: false })
        .order('starts_at', { ascending: true });

      if (selectedCategory !== 'all' && categories) {
        const cat = categories.find(c => c.slug === selectedCategory);
        if (cat) {
          // Get business IDs for this category, then filter campaigns
          const { data: bizData } = await supabase
            .from('businesses').select('id').eq('category_id', cat.id);
          const bizIds = bizData?.map(b => b.id) ?? [];
          if (bizIds.length === 0) return [];
          query = query.in('business_id', bizIds);
        }
      }

      const { data, error } = await query.limit(20);
      if (error) return [];
      return (data ?? []) as (Campaign & { business: any })[];
    },
    enabled: selectedCategory === 'all' || (categories != null && categories.length > 0),
  });

  return (
    <div className="max-w-lg mx-auto">
      {/* Header */}
      <header className="px-4 pt-6 pb-3 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-display font-bold text-gradient">Pintó 🔥</h1>
          <p className="text-sm text-gray-500 mt-0.5">¿Qué hacemos hoy en Catamarca? 🤔</p>
        </div>
        {user ? (
          <Link href="/perfil" className="w-9 h-9 rounded-full bg-brand-100 flex items-center justify-center text-brand-600 font-semibold text-sm">
            {profile?.full_name?.[0]?.toUpperCase() ?? '🙂'}
          </Link>
        ) : (
          <Link href="/login" className="text-sm font-medium text-brand-500 border border-brand-200 rounded-full px-4 py-1.5 hover:bg-brand-50 transition">
            🚪 Entrar
          </Link>
        )}
      </header>

      {/* Categories */}
      <div className="flex gap-2 px-4 pb-3 overflow-x-auto no-scrollbar">
        <button
          onClick={() => setSelectedCategory('all')}
          className={`shrink-0 flex items-center gap-1.5 px-3.5 py-2 rounded-full text-sm font-medium transition-all
            ${selectedCategory === 'all'
              ? 'bg-brand-500 text-white shadow-md shadow-brand-500/25'
              : 'bg-white text-gray-600 border border-gray-200 hover:border-gray-300'}`}
        >
          <Flame size={14} /> Todos
        </button>
        {categories?.map(cat => {
          const Icon = CATEGORY_ICONS[cat.slug] ?? Star;
          return (
            <button
              key={cat.id}
              onClick={() => setSelectedCategory(cat.slug)}
              className={`shrink-0 flex items-center gap-1.5 px-3.5 py-2 rounded-full text-sm font-medium transition-all
                ${selectedCategory === cat.slug
                  ? 'bg-brand-500 text-white shadow-md shadow-brand-500/25'
                  : 'bg-white text-gray-600 border border-gray-200 hover:border-gray-300'}`}
            >
              <Icon size={14} /> {cat.name}
            </button>
          );
        })}
      </div>

      {/* Campaign Cards */}
      <div className="px-4 space-y-3 pb-6">
        {isLoading ? (
          <div className="flex flex-col items-center py-16 text-gray-400">
            <div className="spinner" />
            <p className="mt-3 text-sm">✨ Buscando planes...</p>
          </div>
        ) : !campaigns?.length ? (
          <div className="text-center py-16">
            <p className="text-5xl mb-3">😴</p>
            <p className="text-gray-500 font-medium">No hay promos ahora</p>
            <p className="text-sm text-gray-400 mt-1">¡Volvé más tarde o cambiá el filtro! 🔍</p>
          </div>
        ) : (
          campaigns.map(campaign => (
            <Link
              key={campaign.id}
              href={`/campana?id=${campaign.id}`}
              className="block bg-white rounded-2xl border border-gray-100 shadow-sm hover:shadow-md transition-shadow overflow-hidden"
            >
              {campaign.banner_image_url && (
                <div className="h-32 bg-gray-100 overflow-hidden">
                  <img src={campaign.banner_image_url} alt="" className="w-full h-full object-cover" />
                </div>
              )}
              <div className="p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-brand-50 text-brand-600">
                        {CAMPAIGN_TYPE_LABELS[campaign.type] ?? campaign.type}
                      </span>
                      {campaign.is_featured && (
                        <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-yellow-50 text-yellow-600">⭐ Destacado</span>
                      )}
                      {campaign.is_free && (
                        <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-green-50 text-green-600">Gratis</span>
                      )}
                    </div>
                    <h3 className="font-semibold text-gray-900 leading-snug">{campaign.title}</h3>
                    <p className="text-sm text-gray-500 mt-0.5 line-clamp-2">{campaign.short_description}</p>
                  </div>
                  <ChevronRight size={18} className="text-gray-300 mt-1 shrink-0" />
                </div>

                <div className="flex items-center gap-3 mt-3 text-xs text-gray-400">
                  {campaign.business && (
                    <span className="flex items-center gap-1">
                      <span className="w-5 h-5 rounded-full bg-gray-100 flex items-center justify-center text-[0.6rem] font-bold text-gray-500">
                        {campaign.business.name?.[0]}
                      </span>
                      <span className="font-medium text-gray-600">{campaign.business.name}</span>
                    </span>
                  )}
                  <span className="flex items-center gap-0.5">
                    <Clock size={12} />
                    <span className="text-brand-500 font-medium">{timeUntil(campaign.starts_at)}</span>
                  </span>
                  {campaign.max_capacity && (
                    <span className="flex items-center gap-0.5">
                      <Users size={12} />
                      {campaign.max_capacity} lugares
                    </span>
                  )}
                </div>
              </div>
            </Link>
          ))
        )}
      </div>
    </div>
  );
}
