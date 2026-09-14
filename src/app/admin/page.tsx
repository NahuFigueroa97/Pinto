'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Shield, Store, Megaphone, Users, Eye, CalendarCheck, Star, Check, X, ChevronRight } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { sb } from '@/lib/sb';

// Había 5 tabs pero la expresión ternaria solo cubría 3, así que
// "verifications" y "stats" se dibujaban las dos como "Reportes".
const TAB_LABELS: Record<string, string> = {
  businesses: 'Negocios',
  campaigns: 'Campañas',
  reports: 'Reportes',
  verifications: 'Verificaciones',
  stats: 'Métricas',
};

export default function AdminDashboard() {
  const { role } = useAuth();
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<'businesses' | 'campaigns' | 'reports' | 'verifications' | 'stats'>('businesses');

  const { data: businessStats } = useQuery({
    queryKey: ['admin_biz_stats'],
    queryFn: async () => {
      const [total, pending, active] = await Promise.all([
        supabase.from('businesses').select('id', { count: 'exact' }),
        supabase.from('businesses').select('id', { count: 'exact' }).eq('status', 'pending'),
        supabase.from('businesses').select('id', { count: 'exact' }).eq('status', 'active'),
      ]);
      return { total: total.count ?? 0, pending: pending.count ?? 0, active: active.count ?? 0 };
    },
  });

  const { data: campaignStats } = useQuery({
    queryKey: ['admin_camp_stats'],
    queryFn: async () => {
      const [total, active, featured] = await Promise.all([
        supabase.from('campaigns').select('id', { count: 'exact' }),
        supabase.from('campaigns').select('id', { count: 'exact' }).eq('status', 'active'),
        supabase.from('campaigns').select('id', { count: 'exact' }).eq('is_featured', true),
      ]);
      return { total: total.count ?? 0, active: active.count ?? 0, featured: featured.count ?? 0 };
    },
  });

  const { data: reports } = useQuery({
    queryKey: ['admin_reports'],
    queryFn: async () => {
      const data = await sb(supabase.from('user_reports')
        .select('*, reporter:profiles!reporter_id(full_name)')
        .order('created_at', { ascending: false }).limit(50));
      return data ?? [];
    },
  });

  const { data: verifications } = useQuery({
    queryKey: ['admin_verifications'],
    queryFn: async () => {
      const data = await sb(supabase.from('profiles')
        .select('id, full_name, avatar_url, verification_requested_at')
        .not('verification_requested_at', 'is', null)
        .eq('is_verified', false)
        .order('verification_requested_at', { ascending: true }));
      return data ?? [];
    },
  });

  const { data: businesses } = useQuery({
    queryKey: ['admin_businesses'],
    queryFn: async () => {
      const data = await sb(supabase
        .from('businesses')
        .select('*, category:business_categories(name, icon), owner:profiles(full_name, role)')
        // Los ocultados por denuncias primero: con el alta automática, es lo
        // único de esta pestaña que pide una decisión.
        .order('status', { ascending: true })
        .order('created_at', { ascending: false })
        .limit(50));
      return data ?? [];
    },
    enabled: tab === 'businesses',
  });

  const { data: campaigns } = useQuery({
    queryKey: ['admin_campaigns'],
    queryFn: async () => {
      const data = await sb(supabase
        .from('campaigns')
        .select('*, business:businesses(name)')
        .order('created_at', { ascending: false })
        .limit(50));
      return data ?? [];
    },
    enabled: tab === 'campaigns',
  });

  const updateBizStatus = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      await (supabase.from('businesses') as any).update({ status }).eq('id', id);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin_businesses'] });
      queryClient.invalidateQueries({ queryKey: ['admin_biz_stats'] });
    },
  });

  const toggleFeatured = useMutation({
    mutationFn: async ({ id, current }: { id: string; current: boolean }) => {
      await (supabase.from('campaigns') as any).update({ is_featured: !current }).eq('id', id);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin_campaigns'] });
      queryClient.invalidateQueries({ queryKey: ['admin_camp_stats'] });
    },
  });

  if (role !== 'admin') {
    return (
      <div className="max-w-lg mx-auto flex flex-col items-center justify-center min-h-[60vh] text-center px-6">
        <Shield size={48} className="text-gray-200 mb-4" />
        <p className="text-muted">No tenés permisos de administrador</p>
        <Link href="/" className="text-brand-500 font-medium mt-3">Volver</Link>
      </div>
    );
  }

  const statusColors: Record<string, string> = {
    pending: 'bg-yellow-50 text-yellow-700 dark:bg-yellow-500/15 dark:text-yellow-300',
    active: 'bg-green-50 text-green-700 dark:bg-green-500/15 dark:text-green-300',
    suspended: 'bg-red-50 text-red-500 dark:bg-red-500/15 dark:text-red-300',
    rejected: 'bg-subtle text-muted',
  };

  return (
    <div className="max-w-2xl mx-auto pb-6">
      <header className="px-4 pt-6 pb-4">
        <div className="flex items-center gap-2 mb-1">
          <Shield size={20} className="text-red-500" />
          <h1 className="text-xl font-display font-bold">Admin Panel</h1>
        </div>
        <p className="text-sm text-muted">Gestión de la plataforma Pintó</p>
      </header>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3 px-4 pb-4">
        <div className="bg-surface rounded-xl border border-line p-3 text-center shadow-sm">
          <Store size={18} className="mx-auto text-accent-400 mb-1" />
          <p className="text-lg font-bold">{businessStats?.total ?? 0}</p>
          <p className="text-[0.65rem] text-faint">Negocios</p>
        </div>
        <div className="bg-surface rounded-xl border border-line p-3 text-center shadow-sm">
          <Megaphone size={18} className="mx-auto text-brand-400 mb-1" />
          <p className="text-lg font-bold">{campaignStats?.active ?? 0}</p>
          <p className="text-[0.65rem] text-faint">Campañas activas</p>
        </div>
        <div className="bg-surface rounded-xl border border-line p-3 text-center shadow-sm">
          <Star size={18} className="mx-auto text-yellow-400 mb-1" />
          <p className="text-lg font-bold">{campaignStats?.featured ?? 0}</p>
          <p className="text-[0.65rem] text-faint">Destacadas</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 px-4 pb-4 overflow-x-auto no-scrollbar">
        {(['businesses', 'campaigns', 'reports', 'verifications', 'stats'] as const).map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`shrink-0 px-4 py-2 rounded-full text-sm font-medium transition ${
              tab === t ? 'bg-gray-900 text-white' : 'bg-subtle text-muted'
            }`}
          >
            {TAB_LABELS[t]}
          </button>
        ))}
      </div>

      <div className="px-4 space-y-3">
        {tab === 'businesses' && businesses?.map((b: any) => (
          <div key={b.id} className="bg-surface rounded-xl border border-line shadow-sm p-4">
            <div className="flex items-start justify-between">
              <div>
                <h3 className="font-semibold text-sm flex items-center gap-1">
                  {b.category?.icon} {b.name}
                  {b.is_verified && <span className="text-blue-500">✔</span>}
                </h3>
                <p className="text-xs text-muted">Dueño: {b.owner?.full_name ?? 'N/A'}</p>
                <p className="text-xs text-faint">{b.address}</p>
              </div>
              <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${statusColors[b.status]}`}>{b.status}</span>
            </div>
            <div className="flex gap-2 mt-3">
              {/*
                Desde 020 el rol acá dejó de ser el de portero y pasó a ser el
                de excepción: los negocios se publican solos y se ocultan
                solos si varias personas los denuncian. Lo que queda es
                revisar esos casos y devolverlos si la denuncia era infundada.
              */}
              {b.status === 'suspended' && (
                <>
                  <button onClick={() => updateBizStatus.mutate({ id: b.id, status: 'active' })} className="flex items-center gap-1 text-xs font-medium px-3 py-1.5 rounded-full bg-green-50 text-green-700 dark:bg-green-500/15 dark:text-green-300">
                    <Check size={12} /> Restablecer
                  </button>
                  <button onClick={() => updateBizStatus.mutate({ id: b.id, status: 'rejected' })} className="flex items-center gap-1 text-xs font-medium px-3 py-1.5 rounded-full bg-red-50 text-red-500 dark:bg-red-500/15 dark:text-red-300">
                    <X size={12} /> Rechazar definitivo
                  </button>
                </>
              )}
              {(b.status === 'active' || b.status === 'pending') && (
                <button onClick={() => updateBizStatus.mutate({ id: b.id, status: 'suspended' })} className="flex items-center gap-1 text-xs font-medium px-3 py-1.5 rounded-full bg-red-50 text-red-500 dark:bg-red-500/15 dark:text-red-300">
                  Ocultar
                </button>
              )}
              {b.status === 'rejected' && (
                <button onClick={() => updateBizStatus.mutate({ id: b.id, status: 'active' })} className="flex items-center gap-1 text-xs font-medium px-3 py-1.5 rounded-full bg-green-50 text-green-700 dark:bg-green-500/15 dark:text-green-300">
                  <Check size={12} /> Restablecer
                </button>
              )}
            </div>
          </div>
        ))}

        {tab === 'campaigns' && campaigns?.map((c: any) => (
          <div key={c.id} className="bg-surface rounded-xl border border-line shadow-sm p-4">
            <div className="flex items-start justify-between">
              <div>
                <h3 className="font-semibold text-sm">{c.title}</h3>
                <p className="text-xs text-muted">{c.business?.name} · {c.type}</p>
              </div>
              <div className="flex items-center gap-2">
                <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${statusColors[c.status] ?? 'bg-subtle text-muted'}`}>{c.status}</span>
              </div>
            </div>
            <div className="flex gap-2 mt-3">
              <button
                onClick={() => toggleFeatured.mutate({ id: c.id, current: c.is_featured })}
                className={`flex items-center gap-1 text-xs font-medium px-3 py-1.5 rounded-full ${
                  c.is_featured ? 'bg-yellow-50 text-yellow-700 dark:bg-yellow-500/15 dark:text-yellow-300' : 'bg-subtle text-muted'
                }`}
              >
                <Star size={12} className={c.is_featured ? 'fill-yellow-500' : ''} />
                {c.is_featured ? 'Destacado' : 'Destacar'}
              </button>
            </div>
          </div>
        ))}

        {tab === 'stats' && (
          <div className="space-y-4">
            <div className="bg-surface rounded-xl border border-line shadow-sm p-4">
              <h3 className="font-semibold text-sm mb-3">Resumen de negocios</h3>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between"><span className="text-muted">Total</span><span className="font-medium">{businessStats?.total}</span></div>
                <div className="flex justify-between"><span className="text-muted">Activos</span><span className="font-medium text-green-600">{businessStats?.active}</span></div>
                <div className="flex justify-between"><span className="text-muted">Pendientes</span><span className="font-medium text-yellow-600">{businessStats?.pending}</span></div>
              </div>
            </div>
            <div className="bg-surface rounded-xl border border-line shadow-sm p-4">
              <h3 className="font-semibold text-sm mb-3">Resumen de campañas</h3>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between"><span className="text-muted">Total</span><span className="font-medium">{campaignStats?.total}</span></div>
                <div className="flex justify-between"><span className="text-muted">Activas</span><span className="font-medium text-green-600">{campaignStats?.active}</span></div>
                <div className="flex justify-between"><span className="text-muted">Destacadas</span><span className="font-medium text-yellow-600">{campaignStats?.featured}</span></div>
              </div>
            </div>
          </div>
        )}

        {tab === 'reports' && (
          <div className="space-y-3">
            {!reports?.length ? (
              <p className="text-center py-10 text-faint text-sm">No hay reportes pendientes 🎉</p>
            ) : reports.map((r: any) => (
              <div key={r.id} className="bg-surface rounded-xl border border-line shadow-sm p-4">
                <div className="flex items-center justify-between mb-2">
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${r.status === 'pending' ? 'bg-yellow-50 text-yellow-700 dark:bg-yellow-500/15 dark:text-yellow-300' : 'bg-subtle text-muted'}`}>{r.status}</span>
                  <span className="text-xs text-faint">{new Date(r.created_at).toLocaleDateString('es-AR')}</span>
                </div>
                <p className="text-sm"><span className="font-medium">{r.reporter?.full_name}</span> reportó un <span className="font-medium">{r.target_type}</span></p>
                <p className="text-xs text-red-500 mt-1">🚩 {r.reason}</p>
                {r.description && <p className="text-xs text-muted mt-1">{r.description}</p>}
                {r.status === 'pending' && (
                  <div className="flex gap-2 mt-3">
                    <button onClick={async () => {
                      await supabase.from('user_reports').update({ status: 'resolved' }).eq('id', r.id);
                      queryClient.invalidateQueries({ queryKey: ['admin_reports'] });
                    }} className="flex-1 py-1.5 bg-green-500 text-white text-xs rounded-lg font-medium">✅ Resolver</button>
                    <button onClick={async () => {
                      await supabase.from('user_reports').update({ status: 'dismissed' }).eq('id', r.id);
                      queryClient.invalidateQueries({ queryKey: ['admin_reports'] });
                    }} className="flex-1 py-1.5 bg-gray-200 text-muted text-xs rounded-lg font-medium">❌ Descartar</button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {tab === 'verifications' && (
          <div className="space-y-3">
            {!verifications?.length ? (
              <p className="text-center py-10 text-faint text-sm">No hay solicitudes de verificación</p>
            ) : verifications.map((v: any) => (
              <div key={v.id} className="bg-surface rounded-xl border border-line shadow-sm p-4 flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-brand-100 flex items-center justify-center font-bold text-brand-600">
                  {v.full_name?.[0]?.toUpperCase() ?? '?'}
                </div>
                <div className="flex-1">
                  <p className="font-medium text-sm">{v.full_name}</p>
                  <p className="text-xs text-faint">Solicitado: {new Date(v.verification_requested_at).toLocaleDateString('es-AR')}</p>
                </div>
                <button onClick={async () => {
                  await supabase.from('profiles').update({ is_verified: true }).eq('id', v.id);
                  queryClient.invalidateQueries({ queryKey: ['admin_verifications'] });
                }} className="px-3 py-1.5 bg-blue-500 text-white text-xs rounded-lg font-medium">✅ Verificar</button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
