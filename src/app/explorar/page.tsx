'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Search, MapPin, Star, ChevronRight, Filter } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useQuery } from '@tanstack/react-query';
import type { Business, BusinessCategory, Zone } from '@/types/database';

export default function ExplorarPage() {
  const [search, setSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [selectedZone, setSelectedZone] = useState('all');

  const { data: categories } = useQuery({
    queryKey: ['business_categories'],
    queryFn: async () => {
      const { data } = await supabase.from('business_categories').select('*').eq('is_active', true).order('sort_order');
      return (data ?? []) as BusinessCategory[];
    },
  });

  const { data: zones } = useQuery({
    queryKey: ['zones'],
    queryFn: async () => {
      const { data } = await supabase.from('zones').select('*').eq('is_active', true).order('name');
      return (data ?? []) as Zone[];
    },
  });

  const { data: businesses, isLoading } = useQuery({
    queryKey: ['businesses', selectedCategory, selectedZone, search],
    queryFn: async () => {
      let query = supabase
        .from('businesses')
        .select(`*, category:business_categories(name, slug, icon), zone:zones(name)`)
        .eq('status', 'active')
        .order('is_featured', { ascending: false })
        .order('name');

      if (selectedCategory !== 'all' && categories) {
        const cat = categories.find(c => c.slug === selectedCategory);
        if (cat) query = query.eq('category_id', cat.id);
      }
      if (selectedZone !== 'all') query = query.eq('zone_id', selectedZone);
      if (search) query = query.ilike('name', `%${search}%`);

      const { data } = await query.limit(30);
      return (data ?? []) as Business[];
    },
  });

  return (
    <div className="max-w-lg mx-auto pb-6">
      <header className="px-4 pt-6 pb-3">
        <h1 className="text-xl font-display font-bold">Explorar negocios</h1>
        <p className="text-sm text-gray-500">Descubrí locales cerca tuyo</p>
      </header>

      {/* Search */}
      <div className="px-4 pb-3">
        <div className="relative">
          <Search size={16} className="absolute left-3 top-3 text-gray-400" />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Buscar negocios..."
            className="w-full pl-9 pr-4 py-2.5 rounded-xl border border-gray-200 bg-white text-sm focus:border-brand-400 focus:ring-2 focus:ring-brand-100 outline-none"
          />
        </div>
      </div>

      {/* Filters */}
      <div className="flex gap-2 px-4 pb-3 overflow-x-auto no-scrollbar">
        <select
          value={selectedCategory}
          onChange={e => setSelectedCategory(e.target.value)}
          className="shrink-0 text-sm px-3 py-2 rounded-full border border-gray-200 bg-white text-gray-600 outline-none"
        >
          <option value="all">Todas las categorías</option>
          {categories?.map(c => <option key={c.id} value={c.slug}>{c.icon} {c.name}</option>)}
        </select>
        <select
          value={selectedZone}
          onChange={e => setSelectedZone(e.target.value)}
          className="shrink-0 text-sm px-3 py-2 rounded-full border border-gray-200 bg-white text-gray-600 outline-none"
        >
          <option value="all">Todas las zonas</option>
          {zones?.map(z => <option key={z.id} value={z.id}>{z.name}</option>)}
        </select>
      </div>

      {/* Results */}
      <div className="px-4 space-y-3">
        {isLoading ? (
          <div className="flex flex-col items-center py-16 text-gray-400">
            <div className="spinner" />
            <p className="mt-3 text-sm">Cargando negocios...</p>
          </div>
        ) : !businesses?.length ? (
          <div className="text-center py-16 text-gray-400">
            <p className="text-4xl mb-3">🏪</p>
            <p>No se encontraron negocios</p>
          </div>
        ) : (
          businesses.map(biz => (
            <Link
              key={biz.id}
              href={`/negocio/detalle?slug=${biz.slug}`}
              className="flex items-center gap-3 p-3 bg-white rounded-xl border border-gray-100 shadow-sm hover:shadow-md transition"
            >
              <div className="w-12 h-12 rounded-xl bg-gray-100 flex items-center justify-center text-lg shrink-0">
                {(biz.category as any)?.icon || '🏪'}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5">
                  <h3 className="font-semibold text-sm truncate">{biz.name}</h3>
                  {biz.is_verified && <span className="text-blue-500 shrink-0" title="Verificado">✔</span>}
                  {biz.is_featured && <Star size={12} className="text-yellow-500 fill-yellow-500 shrink-0" />}
                </div>
                <p className="text-xs text-gray-500 truncate">{(biz.category as any)?.name}</p>
                {biz.address && (
                  <p className="text-xs text-gray-400 flex items-center gap-0.5 mt-0.5"><MapPin size={10} /> {biz.address}</p>
                )}
              </div>
              <ChevronRight size={16} className="text-gray-300 shrink-0" />
            </Link>
          ))
        )}
      </div>
    </div>
  );
}
