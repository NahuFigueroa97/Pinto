'use client';

import { Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { ArrowLeft, MapPin, Shield, Calendar, Star, Users, Camera } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useQuery } from '@tanstack/react-query';
import type { Profile, UserInterest } from '@/types/database';

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

  const { data: profile, isLoading } = useQuery({
    queryKey: ['profile_public', id],
    queryFn: async () => {
      if (!id) return null;
      const { data } = await supabase.from('profiles').select('*, zone:zones(name)').eq('id', id).single();
      return data as Profile | null;
    },
    enabled: !!id,
  });

  const { data: interests } = useQuery({
    queryKey: ['user_interests', id],
    queryFn: async () => {
      if (!id) return [];
      const { data } = await supabase.from('user_interest_links').select('interest:user_interests(*)').eq('user_id', id);
      return (data ?? []).map((r: any) => r.interest) as UserInterest[];
    },
    enabled: !!id,
  });

  const { data: photos } = useQuery({
    queryKey: ['user_photos', id],
    queryFn: async () => {
      if (!id) return [];
      const { data } = await supabase.from('user_photos').select('*').eq('user_id', id).order('sort_order');
      return data ?? [];
    },
    enabled: !!id,
  });

  const { data: recentPlans } = useQuery({
    queryKey: ['user_recent_plans', id],
    queryFn: async () => {
      if (!id) return [];
      const { data } = await supabase.from('social_plan_members').select('plan:social_plans(id, title, plan_date, status)')
        .eq('user_id', id).order('joined_at', { ascending: false }).limit(5);
      return (data ?? []).map((r: any) => r.plan).filter(Boolean);
    },
    enabled: !!id,
  });

  if (!id || isLoading) return <div className="flex justify-center pt-20"><div className="spinner" /></div>;
  if (!profile) return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] text-gray-400">
      <p className="text-4xl mb-3">👤</p><p>Perfil no encontrado</p>
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
  return <Suspense fallback={<div className="flex justify-center pt-20"><div className="spinner" /></div>}><VerPerfilInner /></Suspense>;
}
