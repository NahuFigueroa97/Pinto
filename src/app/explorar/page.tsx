'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Search, MapPin, Star, ChevronRight, Filter } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useQuery } from '@tanstack/react-query';
import type { Business, BusinessCategory, Zone } from '@/types/database';
import { sb } from '@/lib/sb';
import { PageSpinner } from '@/components/shared/PageSpinner';
import { SkeletonLista } from '@/components/shared/Skeleton';

export default function ExplorarPage() {
  const [search, setSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [selectedZone, setSelectedZone] = useState('all');

  const { data: categories } = useQuery({
    queryKey: ['business_categories'],
    queryFn: async () => {
      const data = await sb(supabase.from('business_categories').select('*').eq('is_active', true).order('sort_order'));
      return (data ?? []) as BusinessCategory[];
    },
  });

  const { data: zones } = useQuery({
    queryKey: ['zones'],
    queryFn: async () => {
      const data = await sb(supabase.from('zones').select('*').eq('is_active', true).order('name'));
      return (data ?? []) as Zone[];
    },
  });

  const { data: businesses, isLoading, error: queryError, refetch, isFetching } = useQuery({
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

      // Mismo caso que en /planes: la cadena se arma en una variable, así
      // que el rollout de sb() no la tocó y el error seguía descartándose.
      const data = await sb(query.limit(30));
      return (data ?? []) as Business[];
    },
  });

  return (
    <div className="max-w-lg mx-auto pb-6">
      <header className="px-4 pt-6 pb-3">
        <h1 className="text-xl font-display font-bold">Explorar negocios</h1>
        <p className="text-sm text-muted">Descubrí locales cerca tuyo</p>
      </header>

      {/* Search */}
      <div className="px-4 pb-3">
        <div className="relative">
          <Search size={16} className="absolute left-3 top-3 text-faint" />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Buscar negocios..."
            className="w-full pl-9 pr-4 py-2.5 rounded-xl border border-line-strong bg-surface text-sm focus:border-brand-400 focus:ring-2 focus:ring-brand-100 outline-none"
          />
        </div>
      </div>

      {/* Filters */}
      <div className="flex gap-2 px-4 pb-3 overflow-x-auto no-scrollbar">
        <select
          value={selectedCategory}
          onChange={e => setSelectedCategory(e.target.value)}
          className="shrink-0 text-sm px-3 py-2 rounded-full border border-line-strong bg-surface text-muted outline-none"
        >
          <option value="all">Todas las categorías</option>
          {categories?.map(c => <option key={c.id} value={c.slug}>{c.icon} {c.name}</option>)}
        </select>
        <select
          value={selectedZone}
          onChange={e => setSelectedZone(e.target.value)}
          className="shrink-0 text-sm px-3 py-2 rounded-full border border-line-strong bg-surface text-muted outline-none"
        >
          <option value="all">Todas las zonas</option>
          {zones?.map(z => <option key={z.id} value={z.id}>{z.name}</option>)}
        </select>
      </div>

      {/* Results */}
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
        ) : !businesses?.length ? (
          <div className="text-center py-16 text-faint">
            <p className="text-4xl mb-3">🏪</p>
            <p>No se encontraron negocios</p>
          </div>
        ) : (
          businesses.map(biz => (
            <Link
              key={biz.id}
              href={`/negocio/detalle?slug=${biz.slug}`}
              className="flex items-center gap-3 p-3 bg-surface rounded-xl border border-line shadow-sm hover:shadow-md transition"
            >
              <div className="w-12 h-12 rounded-xl bg-subtle flex items-center justify-center text-lg shrink-0">
                {(biz.category as any)?.icon || '🏪'}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5">
                  <h3 className="font-semibold text-sm truncate">{biz.name}</h3>
                  {biz.is_verified
                    ? <span className="text-blue-500 shrink-0" title="Verificado">✔</span>
                    /* Los negocios se publican sin revisión previa, así que la
                       etiqueta no es decorativa: es lo único que le dice a la
                       gente que todavía nadie comprobó que el local exista. */
                    : <span className="shrink-0 text-[0.55rem] font-medium px-1.5 py-0.5 rounded-full bg-subtle text-muted" title="Todavía nadie canjeó una promo acá">sin verificar</span>}
                  {biz.is_featured && <Star size={12} className="text-yellow-500 fill-yellow-500 shrink-0" />}
                </div>
                <p className="text-xs text-muted truncate">{(biz.category as any)?.name}</p>
                {biz.address && (
                  <p className="text-xs text-faint flex items-center gap-0.5 mt-0.5"><MapPin size={10} /> {biz.address}</p>
                )}
              </div>
              <ChevronRight size={16} className="text-faint shrink-0" />
            </Link>
          ))
        )}
      </div>
    </div>
  );
}
