'use client';

import { Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { ArrowLeft, MapPin, Clock, Phone, Instagram, MessageCircle, Heart, ChevronRight, Star } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';

const DAYS = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];

function NegocioDetalleInner() {
  const searchParams = useSearchParams();
  const slug = searchParams.get('slug');
  const router = useRouter();
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const { data: business, isLoading } = useQuery({
    queryKey: ['business', slug],
    queryFn: async () => {
      if (!slug) return null;
      const { data } = await supabase
        .from('businesses')
        .select(`*, category:business_categories(name, icon), zone:zones(name), city:cities(name)`)
        .eq('slug', slug)
        .single();
      if (data && user) {
        supabase.from('analytics_events').insert({ event_type: 'business_profile_view', user_id: user.id, business_id: data.id });
      }
      return data;
    },
    enabled: !!slug,
  });

  const { data: campaigns } = useQuery({
    queryKey: ['business_campaigns', business?.id],
    queryFn: async () => {
      if (!business) return [];
      const { data } = await supabase.from('campaigns').select('*').eq('business_id', business.id).eq('status', 'active')
        .gte('ends_at', new Date().toISOString()).order('is_featured', { ascending: false }).order('starts_at');
      return data ?? [];
    },
    enabled: !!business,
  });

  const { data: hours } = useQuery({
    queryKey: ['business_hours', business?.id],
    queryFn: async () => {
      if (!business) return [];
      const { data } = await supabase.from('business_hours').select('*').eq('business_id', business.id).order('weekday');
      return data ?? [];
    },
    enabled: !!business,
  });

  const { data: isFavorited } = useQuery({
    queryKey: ['favorite', 'business', business?.id],
    queryFn: async () => {
      if (!user || !business) return false;
      const { data } = await supabase.from('favorites').select('id').eq('user_id', user.id).eq('business_id', business.id).maybeSingle();
      return !!data;
    },
    enabled: !!user && !!business,
  });

  const toggleFav = useMutation({
    mutationFn: async () => {
      if (!user || !business) return;
      if (isFavorited) {
        await supabase.from('favorites').delete().eq('user_id', user.id).eq('business_id', business.id);
      } else {
        await supabase.from('favorites').insert({ user_id: user.id, business_id: business.id });
      }
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['favorite', 'business'] }),
  });

  if (!slug || isLoading) return <div className="flex justify-center pt-20"><div className="spinner" /></div>;
  if (!business) return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] text-gray-400">
      <p className="text-4xl mb-3">🏪</p><p>Negocio no encontrado</p>
      <button onClick={() => router.push('/explorar')} className="text-brand-500 font-medium mt-3">Explorar</button>
    </div>
  );

  return (
    <div className="max-w-lg mx-auto pb-6">
      <div className="sticky top-0 z-10 flex items-center justify-between px-4 py-3 glass">
        <button onClick={() => router.back()} className="p-1.5 rounded-full bg-white/50"><ArrowLeft size={20} /></button>
        <button onClick={() => toggleFav.mutate()} className="p-1.5 rounded-full bg-white/50">
          <Heart size={20} className={isFavorited ? 'fill-red-500 text-red-500' : 'text-gray-600'} />
        </button>
      </div>

      {business.cover_image_url ? (
        <div className="h-44 bg-gray-100"><img src={business.cover_image_url} alt="" className="w-full h-full object-cover" /></div>
      ) : (
        <div className="h-32 bg-gradient-to-br from-accent-100 to-brand-100 flex items-center justify-center text-5xl">
          {(business.category as any)?.icon || '🏪'}
        </div>
      )}

      <div className="px-4 pt-4 space-y-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-display font-bold">{business.name}</h1>
            {business.is_verified && <span className="text-blue-500 text-sm">✔</span>}
          </div>
          <p className="text-sm text-gray-500">{(business.category as any)?.name} · {(business.zone as any)?.name ?? (business.city as any)?.name}</p>
        </div>

        {business.description && <p className="text-sm text-gray-600 leading-relaxed">{business.description}</p>}

        <div className="flex flex-wrap gap-2">
          {business.address && <span className="flex items-center gap-1 text-xs text-gray-500 bg-gray-50 px-3 py-1.5 rounded-full"><MapPin size={12} /> {business.address}</span>}
          {business.phone && <a href={`tel:${business.phone}`} className="flex items-center gap-1 text-xs text-gray-500 bg-gray-50 px-3 py-1.5 rounded-full"><Phone size={12} /> {business.phone}</a>}
          {business.whatsapp && <a href={`https://wa.me/549${business.whatsapp.replace(/\D/g, '')}`} target="_blank" className="flex items-center gap-1 text-xs text-green-600 bg-green-50 px-3 py-1.5 rounded-full"><MessageCircle size={12} /> WhatsApp</a>}
          {business.instagram && <a href={`https://instagram.com/${business.instagram.replace('@', '')}`} target="_blank" className="flex items-center gap-1 text-xs text-pink-600 bg-pink-50 px-3 py-1.5 rounded-full"><Instagram size={12} /> {business.instagram}</a>}
        </div>

        {hours && hours.length > 0 && (
          <div>
            <h2 className="font-semibold text-sm mb-2 flex items-center gap-1"><Clock size={14} /> Horarios</h2>
            <div className="grid grid-cols-7 gap-1">
              {DAYS.map((day, i) => {
                const h = hours.find((x: any) => x.weekday === i);
                return (
                  <div key={i} className={`text-center text-xs py-1.5 rounded-lg ${h?.is_closed ? 'bg-red-50 text-red-400' : 'bg-gray-50 text-gray-600'}`}>
                    <p className="font-medium">{day}</p>
                    <p className="text-[0.6rem]">{h?.is_closed ? 'Cerr.' : h ? `${h.opens_at?.slice(0,5)}` : '-'}</p>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        <div>
          <h2 className="font-semibold text-sm mb-2">Campañas activas</h2>
          {!campaigns?.length ? (
            <p className="text-sm text-gray-400">No hay campañas activas</p>
          ) : (
            <div className="space-y-2">
              {campaigns.map((c: any) => (
                <Link key={c.id} href={`/campana?id=${c.id}`} className="flex items-center gap-3 p-3 bg-white rounded-xl border border-gray-100 shadow-sm">
                  <div className="flex-1 min-w-0">
                    <h3 className="font-medium text-sm truncate">{c.title}</h3>
                    <p className="text-xs text-gray-500 truncate">{c.short_description}</p>
                  </div>
                  {c.is_featured && <Star size={14} className="text-yellow-500 fill-yellow-500 shrink-0" />}
                  <ChevronRight size={14} className="text-gray-300 shrink-0" />
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function NegocioDetallePage() {
  return <Suspense fallback={<div className="flex justify-center pt-20"><div className="spinner" /></div>}><NegocioDetalleInner /></Suspense>;
}
