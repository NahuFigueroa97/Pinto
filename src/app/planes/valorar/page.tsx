'use client';

import { useState, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { ArrowLeft, Star } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

function ValorarInner() {
  const searchParams = useSearchParams();
  const planId = searchParams.get('id');
  const router = useRouter();
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const { data: members } = useQuery({
    queryKey: ['plan_members_review', planId],
    queryFn: async () => {
      const { data } = await supabase.from('social_plan_members')
        .select('*, user:profiles(id, full_name, avatar_url, reputation_score)')
        .eq('plan_id', planId);
      return (data ?? []).filter((m: any) => m.user_id !== user?.id);
    },
    enabled: !!planId && !!user,
  });

  const { data: existingReviews } = useQuery({
    queryKey: ['my_reviews', planId],
    queryFn: async () => {
      const { data } = await supabase.from('plan_reviews')
        .select('reviewed_user_id').eq('plan_id', planId).eq('reviewer_id', user!.id);
      return new Set((data ?? []).map((r: any) => r.reviewed_user_id));
    },
    enabled: !!planId && !!user,
  });

  const [ratings, setRatings] = useState<Record<string, { rating: number; comment: string }>>({});

  const submit = useMutation({
    mutationFn: async () => {
      const reviews = Object.entries(ratings)
        .filter(([_, v]) => v.rating > 0)
        .map(([userId, v]) => ({
          plan_id: planId, reviewer_id: user!.id, reviewed_user_id: userId,
          rating: v.rating, comment: v.comment || null,
        }));
      if (reviews.length === 0) return;
      const { error } = await supabase.from('plan_reviews').insert(reviews);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['my_reviews'] });
      router.back();
    },
  });

  return (
    <div className="max-w-lg mx-auto pb-8">
      <header className="flex items-center gap-3 px-4 pt-6 pb-4">
        <button onClick={() => router.back()} className="p-1.5 text-gray-400"><ArrowLeft size={20} /></button>
        <div>
          <h1 className="text-lg font-display font-bold">⭐ Valorar participantes</h1>
          <p className="text-xs text-gray-500">Tu opinión ayuda a la comunidad</p>
        </div>
      </header>

      <div className="px-4 space-y-4">
        {members?.map((m: any) => {
          const alreadyReviewed = existingReviews?.has(m.user_id);
          const r = ratings[m.user_id] || { rating: 0, comment: '' };
          return (
            <div key={m.id} className={`bg-white p-4 rounded-2xl border border-gray-100 shadow-sm ${alreadyReviewed ? 'opacity-50' : ''}`}>
              <div className="flex items-center gap-3 mb-3">
                <div className="w-10 h-10 rounded-full bg-brand-100 flex items-center justify-center text-sm font-bold text-brand-600">
                  {m.user?.full_name?.[0]?.toUpperCase() ?? '?'}
                </div>
                <div>
                  <p className="font-semibold text-sm">{m.user?.full_name}</p>
                  <p className="text-xs text-gray-400">{alreadyReviewed ? '✅ Ya valorado' : 'Sin valorar'}</p>
                </div>
              </div>
              {!alreadyReviewed && (
                <>
                  <div className="flex gap-1 mb-2">
                    {[1, 2, 3, 4, 5].map(s => (
                      <button key={s} onClick={() => setRatings({ ...ratings, [m.user_id]: { ...r, rating: s } })}
                        className="p-1">
                        <Star size={24} className={s <= r.rating ? 'text-yellow-400 fill-yellow-400' : 'text-gray-200'} />
                      </button>
                    ))}
                  </div>
                  <input
                    value={r.comment}
                    onChange={e => setRatings({ ...ratings, [m.user_id]: { ...r, comment: e.target.value } })}
                    placeholder="Comentario opcional..."
                    className="w-full px-3 py-2 rounded-xl border border-gray-200 text-sm outline-none focus:border-brand-400"
                  />
                </>
              )}
            </div>
          );
        })}

        <button onClick={() => submit.mutate()} disabled={submit.isPending}
          className="w-full py-3 bg-brand-500 text-white font-semibold rounded-xl disabled:opacity-50 shadow-md">
          {submit.isPending ? 'Enviando...' : '✨ Enviar valoraciones'}
        </button>
      </div>
    </div>
  );
}

export default function ValorarPage() {
  return <Suspense fallback={<div className="flex justify-center pt-20"><div className="spinner" /></div>}><ValorarInner /></Suspense>;
}
