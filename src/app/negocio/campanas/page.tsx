'use client';

import Link from 'next/link';
import { ArrowLeft, Plus, Pause, Play, Trash2, Edit } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { sb } from '@/lib/sb';
import { PageSpinner } from '@/components/shared/PageSpinner';

export default function MisCampanasPage() {
  const { user } = useAuth();
  const router = useRouter();
  const queryClient = useQueryClient();

  const { data: business } = useQuery({
    queryKey: ['business_me', user?.id],
    queryFn: async () => {
      if (!user) return null;
      const data = await sb(supabase.from('businesses').select('id').eq('owner_user_id', user.id).maybeSingle());
      return data;
    },
    enabled: !!user,
  });

  const { data: campaigns, isLoading, error: queryError, refetch, isFetching } = useQuery({
    queryKey: ['my_campaigns', business?.id],
    queryFn: async () => {
      if (!business) return [];
      const data = await sb(supabase
        .from('campaigns')
        .select('*')
        .eq('business_id', business.id)
        .order('created_at', { ascending: false }));
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
    active: 'bg-green-50 text-green-700 dark:bg-green-500/15 dark:text-green-300',
    draft: 'bg-subtle text-muted',
    paused: 'bg-yellow-50 text-yellow-700 dark:bg-yellow-500/15 dark:text-yellow-300',
    expired: 'bg-red-50 text-red-500 dark:bg-red-500/15 dark:text-red-300',
    archived: 'bg-subtle text-faint',
  };

  return (
    <div className="max-w-lg mx-auto pb-6">
      <header className="flex items-center justify-between px-4 pt-6 pb-4 sticky top-0 bg-surface z-10">
        <div className="flex items-center gap-3">
          <button onClick={() => router.push('/negocio')} className="min-w-[44px] min-h-[44px] flex items-center justify-center text-faint hover:bg-canvas rounded-full transition">
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
          <PageSpinner fullScreen={false} />
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
        ) : !campaigns?.length ? (
          <div className="text-center py-16 text-faint bg-surface rounded-3xl border border-dashed border-line-strong">
            <p className="text-4xl mb-3">📢</p>
            <p className="font-medium">No tenés campañas</p>
            <Link href="/negocio/campanas/nueva" className="text-accent-500 font-medium text-sm mt-3 inline-block bg-accent-50 px-4 py-2 rounded-full">
              Crear la primera →
            </Link>
          </div>
        ) : (
          campaigns.map((c: any) => (
            <div key={c.id} className="bg-surface rounded-2xl border border-line shadow-sm p-4 hover:shadow-md transition">
              <div className="flex items-start justify-between">
                <div onClick={() => router.push(`/negocio/campanas/editar?id=${c.id}`)} className="flex-1 min-w-0 cursor-pointer">
                  <h3 className="font-bold text-sm text-ink truncate">{c.title}</h3>
                  <p className="text-[0.65rem] text-muted mt-1 uppercase tracking-wider font-semibold">
                    {c.type.replace('_', ' ')} · {new Date(c.starts_at).toLocaleDateString('es-AR', { day: 'numeric', month: 'short' })}
                  </p>
                </div>
                <span className={`text-[0.6rem] uppercase tracking-tighter font-black px-2 py-0.5 rounded-full shrink-0 ${statusBadge[c.status] ?? 'bg-subtle text-muted'}`}>
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
                  className="flex items-center justify-center gap-1.5 text-xs font-semibold px-4 py-2 rounded-xl border border-line-strong text-muted bg-canvas hover:bg-surface transition"
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
