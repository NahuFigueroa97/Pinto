'use client';

import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import { useQuery } from '@tanstack/react-query';
import { LogOut, Shield, Store, Edit, MapPin, Star, Users, ChevronRight, Megaphone, MessageCircle, Settings } from 'lucide-react';
import Link from 'next/link';
import type { UserInterest } from '@/types/database';

function getAge(birthYear: number | null): string | null {
  if (!birthYear) return null;
  const age = new Date().getFullYear() - birthYear;
  if (age <= 25) return '18-25';
  if (age <= 35) return '26-35';
  if (age <= 45) return '36-45';
  return '45+';
}

function getRepLabel(score: number): { label: string; color: string; emoji: string } {
  if (score >= 80) return { label: 'Muy confiable', color: 'text-green-600 bg-green-50', emoji: '🌟' };
  if (score >= 60) return { label: 'Confiable', color: 'text-blue-600 bg-blue-50', emoji: '⭐' };
  if (score >= 40) return { label: 'En camino', color: 'text-yellow-600 bg-yellow-50', emoji: '🚀' };
  return { label: 'Nuevo', color: 'text-gray-500 bg-gray-100', emoji: '🆕' };
}

// ─── USER PROFILE ───
function UserProfile() {
  const { user, profile, role, signOut } = useAuth();
  const router = useRouter();

  const { data: interests } = useQuery({
    queryKey: ['my_interests_display'],
    queryFn: async () => {
      if (!user) return [];
      const { data } = await supabase.from('user_interest_links').select('interest:user_interests(*)').eq('user_id', user.id);
      return (data ?? []).map((r: any) => r.interest) as UserInterest[];
    },
    enabled: !!user,
  });

  const ageRange = profile?.show_age ? getAge(profile.birth_year) : null;
  const rep = getRepLabel(profile?.reputation_score ?? 50);

  return (
    <div className="max-w-lg mx-auto pb-6">
      <header className="px-4 pt-6 pb-4">
        <div className="flex items-start gap-4">
          <div className="w-20 h-20 rounded-2xl bg-brand-100 flex items-center justify-center text-2xl font-bold text-brand-600 shadow-lg shadow-brand-500/10 shrink-0">
            {profile?.avatar_url ? (
              <img src={profile.avatar_url} alt="" className="w-full h-full rounded-2xl object-cover" />
            ) : (
              <span className="text-3xl">😎</span>
            )}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <h1 className="text-lg font-display font-bold truncate">{profile?.full_name || 'Usuario'}</h1>
              <Link href="/perfil/editar" className="p-1 text-gray-400"><Edit size={14} /></Link>
            </div>
            <p className="text-xs text-gray-500">{user!.email}</p>
            <div className="flex items-center gap-2 mt-1 flex-wrap">
              <span className="text-xs font-medium px-2.5 py-0.5 rounded-full bg-brand-50 text-brand-600">🧑 Usuario</span>
              {(profile as any)?.is_verified && <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-blue-50 text-blue-600">✅ Verificado</span>}
              {ageRange && <span className="text-xs text-gray-400">{ageRange}</span>}
              {(profile?.zone as any)?.name && (
                <span className="flex items-center gap-0.5 text-xs text-gray-400"><MapPin size={10} /> {(profile?.zone as any)?.name}</span>
              )}
            </div>
          </div>
        </div>
        {profile?.bio && <p className="text-sm text-gray-600 mt-3 leading-relaxed">{profile.bio}</p>}
      </header>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3 px-4 pb-4">
        <div className="bg-white rounded-2xl border border-gray-100 p-3 text-center shadow-sm">
          <p className="text-xl">{rep.emoji}</p>
          <p className="text-lg font-black">{profile?.reputation_score ?? 50}</p>
          <p className={`text-[0.55rem] font-bold px-1.5 py-0.5 rounded-full mx-auto w-fit ${rep.color}`}>{rep.label}</p>
        </div>
        <div className="bg-white rounded-2xl border border-gray-100 p-3 text-center shadow-sm">
          <p className="text-xl">🎯</p>
          <p className="text-lg font-black">{profile?.plans_created_count ?? 0}</p>
          <p className="text-[0.55rem] text-gray-400 font-bold">Creados</p>
        </div>
        <div className="bg-white rounded-2xl border border-gray-100 p-3 text-center shadow-sm">
          <p className="text-xl">🤝</p>
          <p className="text-lg font-black">{profile?.plans_joined_count ?? 0}</p>
          <p className="text-[0.55rem] text-gray-400 font-bold">Unidos</p>
        </div>
      </div>

      {/* Interests */}
      {interests && interests.length > 0 && (
        <div className="px-4 pb-4">
          <div className="flex flex-wrap gap-1.5">
            {interests.map((i: any) => (
              <span key={i.id} className="text-xs px-2.5 py-1 rounded-full bg-brand-50 text-brand-600 font-medium">
                {i.icon} {i.name}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Menu */}
      <div className="px-4 space-y-2">
        <Link href="/perfil/editar" className="flex items-center gap-3 p-4 bg-white rounded-xl border border-gray-100 shadow-sm">
          <span className="text-xl">✏️</span>
          <span className="font-medium text-sm">Editar perfil</span>
          <ChevronRight size={16} className="ml-auto text-gray-300" />
        </Link>
        <Link href="/reservas" className="flex items-center gap-3 p-4 bg-white rounded-xl border border-gray-100 shadow-sm">
          <span className="text-xl">🎫</span>
          <span className="font-medium text-sm">Mis reservas</span>
          <ChevronRight size={16} className="ml-auto text-gray-300" />
        </Link>
        <Link href="/favoritos" className="flex items-center gap-3 p-4 bg-white rounded-xl border border-gray-100 shadow-sm">
          <span className="text-xl">❤️</span>
          <span className="font-medium text-sm">Favoritos</span>
          <ChevronRight size={16} className="ml-auto text-gray-300" />
        </Link>
        <Link href="/fidelidad" className="flex items-center gap-3 p-4 bg-white rounded-xl border border-gray-100 shadow-sm">
          <span className="text-xl">🎯</span>
          <span className="font-medium text-sm">Mis tarjetas de fidelidad</span>
          <ChevronRight size={16} className="ml-auto text-gray-300" />
        </Link>
        <Link href="/feed" className="flex items-center gap-3 p-4 bg-white rounded-xl border border-gray-100 shadow-sm">
          <span className="text-xl">📣</span>
          <span className="font-medium text-sm">Actividad</span>
          <ChevronRight size={16} className="ml-auto text-gray-300" />
        </Link>
        {role === 'admin' && (
          <Link href="/admin" className="flex items-center gap-3 p-4 bg-white rounded-xl border border-gray-100 shadow-sm">
            <Shield size={20} className="text-red-500" />
            <span className="font-medium text-sm">Panel de admin</span>
            <ChevronRight size={16} className="ml-auto text-gray-300" />
          </Link>
        )}
        <button onClick={async () => { await signOut(); router.push('/'); }}
          className="flex items-center gap-3 p-4 bg-white rounded-xl border border-gray-100 shadow-sm w-full text-left">
          <span className="text-xl">👋</span>
          <span className="font-medium text-sm text-gray-600">Cerrar sesión</span>
        </button>
      </div>
    </div>
  );
}

// ─── BUSINESS PROFILE ───
function BusinessProfile() {
  const { user, profile, signOut } = useAuth();
  const router = useRouter();

  return (
    <div className="max-w-lg mx-auto pb-6">
      <header className="px-4 pt-6 pb-4">
        <div className="flex items-start gap-4">
          <div className="w-16 h-16 rounded-2xl bg-accent-100 flex items-center justify-center text-2xl shadow-md shrink-0">
            🏪
          </div>
          <div className="flex-1 min-w-0">
            <h1 className="text-lg font-display font-bold truncate">{profile?.full_name || 'Mi Negocio'}</h1>
            <p className="text-xs text-gray-500">{user!.email}</p>
            <span className="inline-flex items-center gap-1 text-xs font-bold px-2.5 py-0.5 rounded-full bg-accent-50 text-accent-600 mt-1">
              💼 Cuenta Comercial
            </span>
          </div>
        </div>
      </header>

      <div className="px-4 space-y-2">
        <Link href="/negocio" className="flex items-center gap-3 p-4 bg-white rounded-xl border border-gray-100 shadow-sm">
          <span className="text-xl">📊</span>
          <div>
            <span className="font-medium text-sm block">Panel de control</span>
            <span className="text-[0.6rem] text-gray-400">Métricas, reservas y finanzas</span>
          </div>
          <ChevronRight size={16} className="ml-auto text-gray-300" />
        </Link>
        <Link href="/negocio/campanas" className="flex items-center gap-3 p-4 bg-white rounded-xl border border-gray-100 shadow-sm">
          <span className="text-xl">📢</span>
          <div>
            <span className="font-medium text-sm block">Mis promos</span>
            <span className="text-[0.6rem] text-gray-400">Crear y gestionar campañas</span>
          </div>
          <ChevronRight size={16} className="ml-auto text-gray-300" />
        </Link>
        <Link href="/negocio/mensajes" className="flex items-center gap-3 p-4 bg-white rounded-xl border border-gray-100 shadow-sm">
          <span className="text-xl">💬</span>
          <div>
            <span className="font-medium text-sm block">Mensajes</span>
            <span className="text-[0.6rem] text-gray-400">Consultas de clientes</span>
          </div>
          <ChevronRight size={16} className="ml-auto text-gray-300" />
        </Link>
        <Link href="/negocio/fidelidad" className="flex items-center gap-3 p-4 bg-white rounded-xl border border-gray-100 shadow-sm">
          <span className="text-xl">🎯</span>
          <div>
            <span className="font-medium text-sm block">Fidelidad</span>
            <span className="text-[0.6rem] text-gray-400">Programa de fidelidad</span>
          </div>
          <ChevronRight size={16} className="ml-auto text-gray-300" />
        </Link>
        <Link href="/perfil/editar" className="flex items-center gap-3 p-4 bg-white rounded-xl border border-gray-100 shadow-sm">
          <span className="text-xl">⚙️</span>
          <span className="font-medium text-sm">Configuración de cuenta</span>
          <ChevronRight size={16} className="ml-auto text-gray-300" />
        </Link>

        <div className="pt-2" />
        <button onClick={async () => { await signOut(); router.push('/'); }}
          className="flex items-center gap-3 p-4 bg-white rounded-xl border border-red-100 shadow-sm w-full text-left">
          <span className="text-xl">👋</span>
          <span className="font-medium text-sm text-red-500">Cerrar sesión</span>
        </button>
      </div>
    </div>
  );
}

// ─── MAIN ───
export default function PerfilPage() {
  const { user, role, loading } = useAuth();

  if (loading) return <div className="flex justify-center pt-20"><div className="spinner" /></div>;

  if (!user) return (
    <div className="max-w-lg mx-auto flex flex-col items-center justify-center min-h-[60vh] text-center px-6">
      <p className="text-6xl mb-4">🙈</p>
      <h2 className="text-lg font-display font-bold mb-1">¡Hola! 👋</h2>
      <p className="text-gray-500 text-sm mb-6">Iniciá sesión para ver tu perfil y sumarte a planes</p>
      <div className="flex gap-3">
        <Link href="/login" className="px-6 py-2.5 bg-brand-500 text-white rounded-xl font-medium shadow-md">🚀 Entrar</Link>
        <Link href="/registro" className="px-6 py-2.5 border border-gray-200 rounded-xl font-medium text-gray-600">Registrarse</Link>
      </div>
    </div>
  );

  return role === 'business' ? <BusinessProfile /> : <UserProfile />;
}
