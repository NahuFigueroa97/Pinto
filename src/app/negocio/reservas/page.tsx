'use client';

import { ArrowLeft, Check, X, Users, Clock } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';

export default function NegocioReservasPage() {
  const { user } = useAuth();
  const router = useRouter();
  const queryClient = useQueryClient();

  const { data: business } = useQuery({
    queryKey: ['my_business'],
    queryFn: async () => {
      if (!user) return null;
      const { data } = await supabase.from('businesses').select('id').eq('owner_user_id', user.id).maybeSingle();
      return data;
    },
    enabled: !!user,
  });

  const { data: reservations, isLoading } = useQuery({
    queryKey: ['business_reservations', business?.id],
    queryFn: async () => {
      if (!business) return [];
      const { data: campaignIds } = await supabase.from('campaigns').select('id').eq('business_id', business.id);
      if (!campaignIds?.length) return [];
      const { data } = await supabase
        .from('reservations')
        .select(`*, campaign:campaigns(title), profile:profiles(full_name)`)
        .in('campaign_id', campaignIds.map((c: any) => c.id))
        .order('reserved_at', { ascending: false })
        .limit(50);
      return data ?? [];
    },
    enabled: !!business,
  });

  const updateStatus = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      await supabase.from('reservations').update({ status }).eq('id', id);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['business_reservations'] }),
  });

  const statusColors: Record<string, string> = {
    confirmed: 'bg-green-50 text-green-700',
    cancelled: 'bg-red-50 text-red-500',
    completed: 'bg-blue-50 text-blue-600',
    no_show: 'bg-gray-100 text-gray-500',
  };

  return (
    <div className="max-w-lg mx-auto pb-6">
      <header className="flex items-center gap-3 px-4 pt-6 pb-4">
        <button onClick={() => router.push('/negocio')} className="p-1.5 text-gray-400"><ArrowLeft size={20} /></button>
        <h1 className="text-lg font-display font-bold">Reservas recibidas</h1>
      </header>

      <div className="px-4 space-y-3">
        {isLoading ? (
          <div className="flex justify-center py-16"><div className="spinner" /></div>
        ) : !reservations?.length ? (
          <div className="text-center py-16 text-gray-400">
            <p className="text-4xl mb-3">📋</p>
            <p>No hay reservas todavía</p>
          </div>
        ) : (
          reservations.map((r: any) => (
            <div key={r.id} className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
              <div className="flex items-start justify-between">
                <div>
                  <p className="font-semibold text-sm">{r.profile?.full_name ?? 'Usuario'}</p>
                  <p className="text-xs text-gray-500">{r.campaign?.title}</p>
                  <div className="flex items-center gap-3 mt-1 text-xs text-gray-400">
                    <span className="flex items-center gap-0.5"><Users size={11} /> {r.party_size} pers.</span>
                    <span className="flex items-center gap-0.5"><Clock size={11} /> {new Date(r.reserved_at).toLocaleDateString('es-AR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</span>
                  </div>
                </div>
                <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${statusColors[r.status]}`}>{r.status}</span>
              </div>
              {r.status === 'confirmed' && (
                <div className="flex gap-2 mt-3">
                  <button onClick={() => updateStatus.mutate({ id: r.id, status: 'completed' })} className="flex items-center gap-1 text-xs font-medium px-3 py-1.5 rounded-full bg-green-50 text-green-700">
                    <Check size={12} /> Completar
                  </button>
                  <button onClick={() => updateStatus.mutate({ id: r.id, status: 'no_show' })} className="flex items-center gap-1 text-xs font-medium px-3 py-1.5 rounded-full bg-gray-100 text-gray-600">
                    <X size={12} /> No asistió
                  </button>
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
