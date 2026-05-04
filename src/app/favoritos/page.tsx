'use client';

import Link from 'next/link';
import { Heart, Trash2 } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

export default function FavoritosPage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const { data: favorites, isLoading } = useQuery({
    queryKey: ['favorites'],
    queryFn: async () => {
      if (!user) return [];
      const { data } = await supabase
        .from('favorites')
        .select(`*, campaign:campaigns(id, title, short_description, type, starts_at, business:businesses(name)),
                    business:businesses(id, name, slug, address, category:business_categories(icon))`)
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });
      return data ?? [];
    },
    enabled: !!user,
  });

  const removeFav = useMutation({
    mutationFn: async (favId: string) => {
      await supabase.from('favorites').delete().eq('id', favId);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['favorites'] }),
  });

  if (!user) return (
    <div className="max-w-lg mx-auto flex flex-col items-center justify-center min-h-[60vh] text-center px-6">
      <Heart size={48} className="text-gray-200 mb-4" />
      <p className="text-gray-500 mb-3">Iniciá sesión para ver tus favoritos</p>
      <Link href="/login" className="text-brand-500 font-medium">Iniciar sesión</Link>
    </div>
  );

  return (
    <div className="max-w-lg mx-auto pb-6">
      <header className="px-4 pt-6 pb-4">
        <h1 className="text-xl font-display font-bold">Favoritos</h1>
        <p className="text-sm text-gray-500">{favorites?.length || 0} guardados</p>
      </header>

      <div className="px-4 space-y-3">
        {isLoading ? (
          <div className="flex justify-center py-16"><div className="spinner" /></div>
        ) : !favorites?.length ? (
          <div className="text-center py-16 text-gray-400">
            <Heart size={40} className="mx-auto mb-3 text-gray-200" />
            <p>Todavía no guardaste favoritos</p>
            <Link href="/" className="text-brand-500 text-sm font-medium mt-2 inline-block">Explorar campañas</Link>
          </div>
        ) : (
          favorites.map((fav: any) => (
            <div key={fav.id} className="flex items-center gap-3 p-3 bg-white rounded-xl border border-gray-100 shadow-sm">
              <div className="flex-1 min-w-0">
                {fav.campaign ? (
                  <Link href={`/campana?id=${fav.campaign.id}`}>
                    <h3 className="font-semibold text-sm">{fav.campaign.title}</h3>
                    <p className="text-xs text-gray-500 truncate">{fav.campaign.business?.name}</p>
                  </Link>
                ) : fav.business ? (
                  <Link href={`/negocio/detalle?slug=${fav.business.slug}`}>
                    <h3 className="font-semibold text-sm">{fav.business.name}</h3>
                    <p className="text-xs text-gray-500 truncate">{fav.business.address}</p>
                  </Link>
                ) : null}
              </div>
              <button onClick={() => removeFav.mutate(fav.id)} className="p-2 text-gray-300 hover:text-red-500 transition">
                <Trash2 size={16} />
              </button>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
