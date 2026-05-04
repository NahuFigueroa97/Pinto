'use client';

import Link from 'next/link';
import { ArrowLeft, Plus, Pause, Play, Trash2, Edit } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';

export default function MisCampanasPage() {
  const { user } = useAuth();
  const router = useRouter();
  const queryClient = useQueryClient();

  const { data: business } = useQuery({
    queryKey: ['business_me', user?.id],
    queryFn: async () => {
      if (!user) return null;
      const { data } = await supabase.from('businesses').select('id').eq('owner_user_id', user.id).maybeSingle();
      return data;
    },
    enabled: !!user,
  });

  const { data: campaigns, isLoading } = useQuery({
    queryKey: ['my_campaigns', business?.id],
    queryFn: async () => {
      if (!business) return [];
      const { data } = await supabase
        .from('campaigns')
        .select('*')
        .eq('business_id', business.id)
        .order('created_at', { ascending: false });
      return data ?? [];
    },
    enabled: !!business,
  });

  const toggleStatus = useMutation({
    mutationFn: async ({ id, current }: { id: string; current: string }) => {
      const newStatus = current === 'active' ? 'paused' : 'active';
      await supabase.from('campaigns').update({ status: newStatus }).eq('id', id);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['my_campaigns', business?.id] });
      queryClient.invalidateQueries({ queryKey: ['business_stats', business?.id] });
    },
  });

  const statusBadge: Record<string, string> = {
    active: 'bg-green-50 text-green-700',
    draft: 'bg-gray-100 text-gray-600',
    paused: 'bg-yellow-50 text-yellow-700',
    expired: 'bg-red-50 text-red-500',
    archived: 'bg-gray-100 text-gray-400',
  };

  return (
    <div className="max-w-lg mx-auto pb-6">
      <header className="flex items-center justify-between px-4 pt-6 pb-4 sticky top-0 bg-white z-10">
        <div className="flex items-center gap-3">
          <button onClick={() => router.push('/negocio')} className="p-1.5 text-gray-400 hover:bg-gray-50 rounded-full transition">
            <ArrowLeft size={20} />
          </button>
          <h1 className="text-lg font-display font-bold">Mis campañas</h1>
        </div>
        <Link href="/negocio/campanas/nueva" className="p-2 bg-accent-500 text-white rounded-xl shadow-md shadow-accent-500/20 active:scale-95 transition">
          <Plus size={18} />
        </Link>
      </header>

      <div className="px-4 space-y-3">
        {isLoading ? (
          <div className="flex justify-center py-16 text-accent-500"><div className="spinner" /></div>
        ) : !campaigns?.length ? (
          <div className="text-center py-16 text-gray-400 bg-white rounded-3xl border border-dashed border-gray-200">
            <p className="text-4xl mb-3">📢</p>
            <p className="font-medium">No tenés campañas</p>
            <Link href="/negocio/campanas/nueva" className="text-accent-500 font-medium text-sm mt-3 inline-block bg-accent-50 px-4 py-2 rounded-full">
              Crear la primera →
            </Link>
          </div>
        ) : (
          campaigns.map((c: any) => (
            <div key={c.id} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 hover:shadow-md transition">
              <div className="flex items-start justify-between">
                <div onClick={() => router.push(`/negocio/campanas/editar?id=${c.id}`)} className="flex-1 min-w-0 cursor-pointer">
                  <h3 className="font-bold text-sm text-gray-900 truncate">{c.title}</h3>
                  <p className="text-[0.65rem] text-gray-500 mt-1 uppercase tracking-wider font-semibold">
                    {c.type.replace('_', ' ')} · {new Date(c.starts_at).toLocaleDateString('es-AR', { day: 'numeric', month: 'short' })}
                  </p>
                </div>
                <span className={`text-[0.6rem] uppercase tracking-tighter font-black px-2 py-0.5 rounded-full shrink-0 ${statusBadge[c.status] ?? 'bg-gray-100 text-gray-500'}`}>
                  {c.status}
                </span>
              </div>
              <div className="flex items-center gap-2 mt-4 pt-3 border-t border-gray-50">
                {(c.status === 'active' || c.status === 'paused') && (
                  <button
                    onClick={() => toggleStatus.mutate({ id: c.id, current: c.status })}
                    className={`flex-1 flex items-center justify-center gap-1.5 text-xs font-semibold px-3 py-2 rounded-xl border transition
                      ${c.status === 'active' 
                        ? 'border-yellow-200 text-yellow-600 bg-yellow-50 hover:bg-yellow-100' 
                        : 'border-green-200 text-green-600 bg-green-50 hover:bg-green-100'}`}
                  >
                    {c.status === 'active' ? <><Pause size={14} /> Pausar</> : <><Play size={14} /> Activar</>}
                  </button>
                )}
                <Link
                  href={`/negocio/campanas/editar?id=${c.id}`}
                  className="flex items-center justify-center gap-1.5 text-xs font-semibold px-4 py-2 rounded-xl border border-gray-200 text-gray-600 bg-gray-50 hover:bg-white transition"
                >
                  <Edit size={14} /> Gestionar
                </Link>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
