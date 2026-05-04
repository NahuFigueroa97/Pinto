'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Users, Calendar, ChevronRight, Plus } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import { useQuery } from '@tanstack/react-query';

export default function MisPlanesPage() {
  const { user } = useAuth();
  const [tab, setTab] = useState<'created' | 'joined'>('created');

  const { data: createdPlans, isLoading: loadingCreated } = useQuery({
    queryKey: ['my_created_plans'],
    queryFn: async () => {
      if (!user) return [];
      const { data } = await supabase.from('social_plans').select(`*, members:social_plan_members(id),
        campaign:campaigns(title, business:businesses(name))`)
        .eq('creator_id', user.id).order('plan_date', { ascending: false });
      return data ?? [];
    },
    enabled: !!user && tab === 'created',
  });

  const { data: joinedPlans, isLoading: loadingJoined } = useQuery({
    queryKey: ['my_joined_plans'],
    queryFn: async () => {
      if (!user) return [];
      const { data: memberRows } = await supabase.from('social_plan_members').select('plan_id').eq('user_id', user.id).neq('role', 'creator');
      if (!memberRows?.length) return [];
      const planIds = memberRows.map((m: any) => m.plan_id);
      const { data } = await supabase.from('social_plans').select(`*, creator:profiles(full_name),
        members:social_plan_members(id), campaign:campaigns(title)`)
        .in('id', planIds).order('plan_date', { ascending: false });
      return data ?? [];
    },
    enabled: !!user && tab === 'joined',
  });

  const plans = tab === 'created' ? createdPlans : joinedPlans;
  const isLoading = tab === 'created' ? loadingCreated : loadingJoined;

  if (!user) return (
    <div className="max-w-lg mx-auto flex flex-col items-center justify-center min-h-[60vh] text-center px-6">
      <Users size={48} className="text-gray-200 mb-4" />
      <p className="text-gray-500 mb-3">Iniciá sesión para ver tus planes</p>
      <Link href="/login" className="text-brand-500 font-medium">Iniciar sesión</Link>
    </div>
  );

  const statusBadge: Record<string, string> = {
    open: 'bg-green-50 text-green-700',
    full: 'bg-yellow-50 text-yellow-700',
    closed: 'bg-gray-100 text-gray-600',
    cancelled: 'bg-red-50 text-red-500',
  };

  return (
    <div className="max-w-lg mx-auto pb-6">
      <header className="px-4 pt-6 pb-3 flex items-center justify-between">
        <h1 className="text-xl font-display font-bold">Mis planes</h1>
        <Link href="/planes/crear" className="p-2 bg-brand-500 text-white rounded-xl"><Plus size={18} /></Link>
      </header>

      <div className="flex gap-1 px-4 pb-3">
        <button onClick={() => setTab('created')}
          className={`px-4 py-2 rounded-full text-sm font-medium transition ${tab === 'created' ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-600'}`}>
          Creados
        </button>
        <button onClick={() => setTab('joined')}
          className={`px-4 py-2 rounded-full text-sm font-medium transition ${tab === 'joined' ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-600'}`}>
          Unidos
        </button>
      </div>

      <div className="px-4 space-y-3">
        {isLoading ? (
          <div className="flex justify-center py-16"><div className="spinner" /></div>
        ) : !plans?.length ? (
          <div className="text-center py-16 text-gray-400">
            <Users size={40} className="mx-auto mb-3 text-gray-200" />
            <p>No tenés planes {tab === 'created' ? 'creados' : 'unidos'}</p>
          </div>
        ) : (
          plans.map((p: any) => (
            <Link key={p.id} href={`/planes/detalle?id=${p.id}`}
              className="flex items-center gap-3 p-4 bg-white rounded-xl border border-gray-100 shadow-sm">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <h3 className="font-semibold text-sm truncate">{p.title}</h3>
                  <span className={`text-[0.6rem] font-medium px-2 py-0.5 rounded-full shrink-0 ${statusBadge[p.status]}`}>{p.status}</span>
                </div>
                <div className="flex items-center gap-3 mt-1 text-xs text-gray-400">
                  <span className="flex items-center gap-0.5"><Calendar size={11} />
                    {new Date(p.plan_date + 'T00:00:00').toLocaleDateString('es-AR', { day: 'numeric', month: 'short' })}
                  </span>
                  <span className="flex items-center gap-0.5"><Users size={11} /> {p.members?.length ?? 0}/{p.max_members}</span>
                  {p.campaign && <span className="text-accent-500 truncate">📢 {p.campaign.title}</span>}
                </div>
              </div>
              <ChevronRight size={16} className="text-gray-300 shrink-0" />
            </Link>
          ))
        )}
      </div>
    </div>
  );
}
