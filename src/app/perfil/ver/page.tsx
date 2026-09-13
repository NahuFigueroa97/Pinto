'use client';

import { Suspense, useState } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, MapPin, Shield, Calendar, Star, Users, Ban, Flag } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/lib/auth';
import { useBlockedIds, useBlockUser } from '@/lib/blocks';
import type { Profile, UserInterest } from '@/types/database';
import { sb } from '@/lib/sb';
import { PageSpinner } from '@/components/shared/PageSpinner';
import { QueryState } from '@/components/shared/QueryState';

function getAge(birthYear: number | null): string | null {
  if (!birthYear) return null;
  const age = new Date().getFullYear() - birthYear;
  if (age < 18) return '18-';
  if (age <= 25) return '18-25';
  if (age <= 35) return '26-35';
  if (age <= 45) return '36-45';
  return '45+';
}

function getRepLabel(score: number): { label: string; color: string } {
  if (score >= 80) return { label: 'Muy confiable', color: 'text-green-600 bg-green-50' };
  if (score >= 60) return { label: 'Confiable', color: 'text-blue-600 bg-blue-50' };
  if (score >= 40) return { label: 'En camino', color: 'text-yellow-600 bg-yellow-50' };
  return { label: 'Nuevo', color: 'text-gray-500 bg-gray-100' };
}

function VerPerfilInner() {
  const searchParams = useSearchParams();
  const id = searchParams.get('id');
  const router = useRouter();
  const { user } = useAuth();
  const { isBlocked } = useBlockedIds();
  const { block, unblock } = useBlockUser();
  const [confirmBlock, setConfirmBlock] = useState(false);

  const { data: profile, isLoading, error, refetch, isFetching } = useQuery({
    queryKey: ['profile_public', id],
    queryFn: async () => {
      if (!id) return null;
      // Antes era select('*'): devolvía al cliente toda la fila del perfil.
      // Se piden solo los campos que esta pantalla realmente muestra.
      const data = await sb(supabase.from('profiles')
        .select('id, full_name, avatar_url, bio, birth_year, show_age, interests_text, reputation_score, plans_created_count, plans_joined_count, is_verified, zone:zones(name)')
        .eq('id', id).single());
      return data as Profile | null;
    },
    enabled: !!id,
  });

  const { data: interests } = useQuery({
    queryKey: ['user_interests', id],
    queryFn: async () => {
      if (!id) return [];
      const data = await sb(supabase.from('user_interest_links').select('interest:user_interests(*)').eq('user_id', id));
      return (data ?? []).map((r: any) => r.interest) as UserInterest[];
    },
    enabled: !!id,
  });

  const { data: photos } = useQuery({
    queryKey: ['user_photos', id],
    queryFn: async () => {
      if (!id) return [];
      const data = await sb(supabase.from('user_photos').select('*').eq('user_id', id).order('sort_order'));
      return data ?? [];
    },
    enabled: !!id,
  });

  const { data: recentPlans } = useQuery({
    queryKey: ['user_recent_plans', id],
    queryFn: async () => {
      if (!id) return [];
      const data = await sb(supabase.from('social_plan_members').select('plan:social_plans(id, title, plan_date, status)')
        .eq('user_id', id).order('joined_at', { ascending: false }).limit(5));
      return (data ?? []).map((r: any) => r.plan).filter(Boolean);
    },
    enabled: !!id,
  });

  // Ver la nota en planes/detalle: sin el id, la query queda deshabilitada
  // y `!id || isLoading` dejaba el spinner girando indefinidamente.
  if (isLoading) return <PageSpinner onRetry={() => void refetch()} />;

  // Un fallo de red o de RLS caía en la misma rama que "no existe" y se
  // mostraba como "Perfil no encontrado": el usuario quedaba convencido de
  // que la persona no estaba, sin reintentar y sin saber qué pasó.
  if (error) return (
    <QueryState isLoading={false} error={error} onRetry={() => void refetch()} isRetrying={isFetching}>
      {null}
    </QueryState>
  );

  if (!id || !profile) return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] text-gray-400 px-6 text-center">
      <p className="text-4xl mb-3">👤</p>
      <p>{!id ? 'No pudimos abrir el perfil' : 'Perfil no encontrado'}</p>
      <button onClick={() => router.back()} className="text-brand-500 font-medium mt-3">Volver</button>
    </div>
  );

  const ageRange = profile.show_age ? getAge(profile.birth_year) : null;
  const rep = getRepLabel(profile.reputation_score);

  return (
    <div className="max-w-lg mx-auto pb-6">
      <div className="sticky top-0 z-10 flex items-center gap-3 px-4 py-3 glass">
        <button onClick={() => router.back()} className="p-1.5 rounded-full bg-white/50"><ArrowLeft size={20} /></button>
        <h2 className="font-display font-bold">Perfil</h2>
      </div>

      {/* Hero */}
      <div className="px-4 pt-4 text-center">
        <div className="w-24 h-24 rounded-2xl bg-brand-100 flex items-center justify-center text-3xl font-bold text-brand-600 mx-auto mb-3 shadow-lg shadow-brand-500/10">
          {profile.avatar_url ? (
            <img src={profile.avatar_url} alt="" className="w-full h-full rounded-2xl object-cover" />
          ) : (
            profile.full_name?.[0]?.toUpperCase() ?? '?'
          )}
        </div>
        <h1 className="text-xl font-display font-bold">{profile.full_name}</h1>
        <div className="flex items-center justify-center gap-2 mt-1 flex-wrap">
          {ageRange && <span className="text-xs text-gray-500">{ageRange} años</span>}
          {(profile.zone as any)?.name && (
            <span className="flex items-center gap-0.5 text-xs text-gray-500"><MapPin size={11} /> {(profile.zone as any).name}</span>
          )}
        </div>
      </div>

      <div className="px-4 pt-4 space-y-4">
        {/* Trust indicators */}
        <div className="grid grid-cols-3 gap-3">
          <div className="bg-white rounded-xl border border-gray-100 p-3 text-center shadow-sm">
            <Shield size={16} className="mx-auto text-blue-400 mb-1" />
            <p className="text-lg font-bold">{profile.reputation_score}</p>
            <p className={`text-[0.6rem] font-medium px-2 py-0.5 rounded-full mx-auto w-fit ${rep.color}`}>{rep.label}</p>
          </div>
          <div className="bg-white rounded-xl border border-gray-100 p-3 text-center shadow-sm">
            <Star size={16} className="mx-auto text-yellow-400 mb-1" />
            <p className="text-lg font-bold">{profile.plans_created_count}</p>
            <p className="text-[0.6rem] text-gray-400">Creados</p>
          </div>
          <div className="bg-white rounded-xl border border-gray-100 p-3 text-center shadow-sm">
            <Users size={16} className="mx-auto text-green-400 mb-1" />
            <p className="text-lg font-bold">{profile.plans_joined_count}</p>
            <p className="text-[0.6rem] text-gray-400">Unidos</p>
          </div>
        </div>

        {/* Bio */}
        {profile.bio && (
          <div>
            <h3 className="font-semibold text-sm mb-1">Sobre mí</h3>
            <p className="text-sm text-gray-600 leading-relaxed">{profile.bio}</p>
          </div>
        )}

        {/* Interests */}
        {(interests && interests.length > 0) || profile.interests_text ? (
          <div>
            <h3 className="font-semibold text-sm mb-2">Intereses</h3>
            {interests && interests.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mb-2">
                {interests.map((i: any) => (
                  <span key={i.id} className="text-xs px-2.5 py-1 rounded-full bg-brand-50 text-brand-600 font-medium">
                    {i.icon} {i.name}
                  </span>
                ))}
              </div>
            )}
            {profile.interests_text && <p className="text-xs text-gray-500 italic">{profile.interests_text}</p>}
          </div>
        ) : null}

        {/* Photos */}
        {photos && photos.length > 0 && (
          <div>
            <h3 className="font-semibold text-sm mb-2">Fotos</h3>
            <div className="grid grid-cols-3 gap-2">
              {photos.map((p: any) => (
                <div key={p.id} className="aspect-square rounded-xl overflow-hidden bg-gray-100">
                  <img src={p.photo_url} alt={p.caption ?? ''} className="w-full h-full object-cover" />
                </div>
              ))}
            </div>
          </div>
        )}

        {/*
          Acciones de seguridad. No existían: desde el perfil de otra persona
          no se podía ni denunciar ni bloquear, y Google Play exige las dos
          cosas para apps sociales con contenido de usuarios.
        */}
        {user && user.id !== id && (
          <div className="pt-2 border-t border-gray-100 space-y-2">
            {isBlocked(id) ? (
              <div className="bg-gray-50 rounded-xl p-3 text-center">
                <p className="text-xs text-gray-500 mb-2">🚫 Tenés a esta persona bloqueada</p>
                <button
                  onClick={() => id && unblock.mutate(id)}
                  disabled={unblock.isPending}
                  className="text-xs font-semibold text-brand-500 disabled:opacity-50"
                >
                  Desbloquear
                </button>
              </div>
            ) : confirmBlock ? (
              <div className="bg-red-50 rounded-xl p-3 border border-red-100">
                <p className="text-xs text-red-700 mb-3">
                  Al bloquear, esta persona no va a poder pedir unirse a tus planes y dejás de ver su actividad.
                </p>
                <div className="flex gap-2">
                  <button
                    onClick={() => { if (id) block.mutate(id); setConfirmBlock(false); }}
                    disabled={block.isPending}
                    className="flex-1 py-2 bg-red-500 text-white rounded-xl text-xs font-bold disabled:opacity-50"
                  >
                    Sí, bloquear
                  </button>
                  <button onClick={() => setConfirmBlock(false)} className="flex-1 py-2 bg-white border border-gray-200 rounded-xl text-xs font-medium">
                    Cancelar
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex gap-2">
                <button
                  onClick={() => setConfirmBlock(true)}
                  className="flex-1 flex items-center justify-center gap-1.5 py-2.5 bg-gray-50 text-gray-600 rounded-xl text-xs font-medium border border-gray-200"
                >
                  <Ban size={14} /> Bloquear
                </button>
                <Link
                  href={`/reportar?type=user&id=${id}`}
                  className="flex-1 flex items-center justify-center gap-1.5 py-2.5 bg-gray-50 text-gray-600 rounded-xl text-xs font-medium border border-gray-200"
                >
                  <Flag size={14} /> Denunciar
                </Link>
              </div>
            )}
          </div>
        )}

        {/* Recent Plans */}
        {recentPlans && recentPlans.length > 0 && (
          <div>
            <h3 className="font-semibold text-sm mb-2">Planes recientes</h3>
            <div className="space-y-1.5">
              {recentPlans.map((p: any) => (
                <div key={p.id} className="flex items-center gap-2 text-xs text-gray-500 bg-gray-50 rounded-lg px-3 py-2">
                  <Calendar size={12} />
                  <span className="font-medium text-gray-700">{p.title}</span>
                  <span>{new Date(p.plan_date + 'T00:00:00').toLocaleDateString('es-AR', { day: 'numeric', month: 'short' })}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default function VerPerfilPage() {
  return <Suspense fallback={<PageSpinner />}><VerPerfilInner /></Suspense>;
}
