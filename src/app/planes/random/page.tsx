'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Users, ChevronRight, Shuffle, Sparkles } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth';
import { useQuery } from '@tanstack/react-query';

export default function PintoRandomPage() {
  const { user, role } = useAuth();
  const [currentIdx, setCurrentIdx] = useState(0);
  const [direction, setDirection] = useState<'left' | 'right' | null>(null);

  const { data: plans, isLoading } = useQuery({
    queryKey: ['random_plans'],
    queryFn: async () => {
      const { data } = await supabase.from('social_plans')
        .select(`*, creator:profiles(full_name, avatar_url, reputation_score),
                    members:social_plan_members(id),
                    category:plan_categories(name, emoji)`)
        .eq('status', 'open').eq('visibility', 'public')
        .gte('plan_date', new Date().toISOString().split('T')[0])
        .limit(50);
      // Shuffle
      const arr = data ?? [];
      for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
      }
      return arr;
    },
  });

  const plan = plans?.[currentIdx];

  const next = (dir: 'left' | 'right') => {
    setDirection(dir);
    setTimeout(() => {
      setCurrentIdx(i => (plans && i < plans.length - 1 ? i + 1 : 0));
      setDirection(null);
    }, 300);
  };

  if (isLoading) return (
    <div className="max-w-lg mx-auto flex flex-col items-center justify-center min-h-[70vh]">
      <div className="spinner" />
      <p className="text-sm text-gray-400 mt-3">Mezclando planes... 🎲</p>
    </div>
  );

  if (!plans?.length) return (
    <div className="max-w-lg mx-auto flex flex-col items-center justify-center min-h-[70vh] text-center px-6">
      <p className="text-5xl mb-4">🎲</p>
      <p className="text-gray-500">No hay planes disponibles para random</p>
    </div>
  );

  return (
    <div className="max-w-lg mx-auto pb-6">
      <header className="px-4 pt-6 pb-4 text-center">
        <h1 className="text-2xl font-display font-bold">🎲 Pintó Random</h1>
        <p className="text-sm text-gray-500">Descubrí tu próxima juntada al azar</p>
      </header>

      <div className="px-4">
        <div className={`bg-white rounded-3xl border border-gray-100 shadow-lg overflow-hidden transition-all duration-300 ${
          direction === 'left' ? '-translate-x-full opacity-0 rotate-[-10deg]' :
          direction === 'right' ? 'translate-x-full opacity-0 rotate-[10deg]' : ''
        }`}>
          <div className="bg-gradient-to-br from-brand-50 to-accent-50 p-6 text-center">
            <p className="text-4xl mb-2">{(plan as any)?.category?.emoji || '🎉'}</p>
            <h2 className="text-xl font-bold">{plan?.title}</h2>
            {(plan as any)?.category && <span className="text-xs bg-white/80 px-2 py-0.5 rounded-full mt-1 inline-block">{(plan as any).category.name}</span>}
          </div>

          <div className="p-5 space-y-3">
            {plan?.description && <p className="text-sm text-gray-600">{plan.description}</p>}

            <div className="grid grid-cols-2 gap-3 text-sm">
              <div className="bg-gray-50 rounded-xl p-3">
                <p className="text-xs text-gray-400">📅 Cuándo</p>
                <p className="font-medium">{new Date(plan!.plan_date + 'T00:00:00').toLocaleDateString('es-AR', { weekday: 'short', day: 'numeric', month: 'short' })}</p>
                {plan?.plan_time && <p className="text-xs text-gray-500">{plan.plan_time.slice(0, 5)} hs</p>}
              </div>
              <div className="bg-gray-50 rounded-xl p-3">
                <p className="text-xs text-gray-400">👥 Grupo</p>
                <p className="font-medium">{(plan as any).members?.length ?? 0} / {plan?.max_members}</p>
              </div>
            </div>

            {plan?.meeting_point && (
              <div className="bg-gray-50 rounded-xl p-3 text-sm">
                <p className="text-xs text-gray-400">📍 Dónde</p>
                <p className="font-medium">{plan.meeting_point}</p>
              </div>
            )}

            <div className="flex items-center gap-2 text-sm text-gray-500">
              <span className="w-7 h-7 rounded-full bg-brand-100 flex items-center justify-center text-xs font-bold text-brand-600">
                {(plan as any).creator?.full_name?.[0]?.toUpperCase() ?? '?'}
              </span>
              <span>{(plan as any).creator?.full_name}</span>
              <span className="text-yellow-500">⭐ {(plan as any).creator?.reputation_score}</span>
            </div>
          </div>
        </div>

        <div className="flex items-center justify-center gap-6 mt-6">
          <button onClick={() => next('left')}
            className="w-16 h-16 rounded-full bg-red-50 border-2 border-red-200 flex items-center justify-center text-2xl active:scale-90 transition">
            👎
          </button>
          <Link href={`/planes/detalle?id=${plan?.id}`}
            className="w-14 h-14 rounded-full bg-brand-50 border-2 border-brand-200 flex items-center justify-center text-xl active:scale-90 transition">
            👀
          </Link>
          <button onClick={() => next('right')}
            className="w-16 h-16 rounded-full bg-green-50 border-2 border-green-200 flex items-center justify-center text-2xl active:scale-90 transition">
            🔥
          </button>
        </div>

        <p className="text-center text-xs text-gray-400 mt-3">{currentIdx + 1} / {plans?.length} planes</p>
      </div>
    </div>
  );
}
