'use client';

import Link from 'next/link';
import { CalendarCheck, X, Clock, Users } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

export default function ReservasPage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const { data: reservations, isLoading } = useQuery({
    queryKey: ['my_reservations'],
    queryFn: async () => {
      if (!user) return [];
      const { data } = await supabase
        .from('reservations')
        .select(`*, campaign:campaigns(id, title, short_description, starts_at, ends_at, business:businesses(name, address))`)
        .eq('user_id', user.id)
        .order('reserved_at', { ascending: false })
        .limit(50);
      return data ?? [];
    },
    enabled: !!user,
  });

  const cancelReservation = useMutation({
    mutationFn: async (id: string) => {
      await supabase.from('reservations').update({ status: 'cancelled' }).eq('id', id);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['my_reservations'] }),
  });

  const statusColors: Record<string, string> = {
    confirmed: 'bg-green-50 text-green-700',
    cancelled: 'bg-red-50 text-red-500',
    completed: 'bg-blue-50 text-blue-600',
    no_show: 'bg-gray-100 text-gray-500',
  };
  const statusLabels: Record<string, string> = {
    confirmed: 'Confirmada',
    cancelled: 'Cancelada',
    completed: 'Completada',
    no_show: 'No asistió',
  };

  if (!user) return (
    <div className="max-w-lg mx-auto flex flex-col items-center justify-center min-h-[60vh] text-center px-6">
      <CalendarCheck size={48} className="text-gray-200 mb-4" />
      <p className="text-gray-500 mb-3">Iniciá sesión para ver tus reservas</p>
      <Link href="/login" className="text-brand-500 font-medium">Iniciar sesión</Link>
    </div>
  );

  return (
    <div className="max-w-lg mx-auto pb-6">
      <header className="px-4 pt-6 pb-4">
        <h1 className="text-xl font-display font-bold">Mis reservas</h1>
      </header>

      <div className="px-4 space-y-3">
        {isLoading ? (
          <div className="flex justify-center py-16"><div className="spinner" /></div>
        ) : !reservations?.length ? (
          <div className="text-center py-16 text-gray-400">
            <CalendarCheck size={40} className="mx-auto mb-3 text-gray-200" />
            <p>No tenés reservas</p>
            <Link href="/" className="text-brand-500 text-sm font-medium mt-2 inline-block">Ver campañas</Link>
          </div>
        ) : (
          reservations.map((res: any) => {
            const campaign = res.campaign;
            const startDate = campaign ? new Date(campaign.starts_at) : null;
            return (
              <div key={res.id} className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
                <div className="flex items-start justify-between">
                  <div className="flex-1 min-w-0">
                    <Link href={`/campana?id=${res.campaign_id}`} className="font-semibold text-sm hover:text-brand-500">
                      {campaign?.title ?? 'Campaña'}
                    </Link>
                    <p className="text-xs text-gray-500 mt-0.5">{campaign?.business?.name}</p>
                  </div>
                  <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${statusColors[res.status]}`}>
                    {statusLabels[res.status]}
                  </span>
                </div>
                <div className="flex items-center gap-4 mt-2 text-xs text-gray-400">
                  {startDate && (
                    <span className="flex items-center gap-0.5">
                      <Clock size={11} />
                      {startDate.toLocaleDateString('es-AR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                    </span>
                  )}
                  <span className="flex items-center gap-0.5">
                    <Users size={11} />
                    {res.party_size} pers.
                  </span>
                </div>
                {res.status === 'confirmed' && (
                  <button
                    onClick={() => cancelReservation.mutate(res.id)}
                    className="mt-3 text-xs text-red-500 font-medium flex items-center gap-1"
                  >
                    <X size={12} /> Cancelar reserva
                  </button>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
