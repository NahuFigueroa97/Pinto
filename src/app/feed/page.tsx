'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { Clock, Users, ChevronRight } from 'lucide-react';

const ACTION_LABELS: Record<string, { emoji: string; text: (m: any) => string }> = {
  created_plan: { emoji: '🎉', text: (m) => `creó el plan "${m?.title || ''}"` },
  joined_plan: { emoji: '🤝', text: (m) => `se unió a "${m?.title || ''}"` },
  completed_plan: { emoji: '✅', text: (m) => `completó "${m?.title || ''}"` },
  reviewed: { emoji: '⭐', text: () => `dejó una valoración` },
  uploaded_photo: { emoji: '📸', text: () => `subió una foto de la juntada` },
};

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'Ahora';
  if (mins < 60) return `Hace ${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `Hace ${hrs}h`;
  const days = Math.floor(hrs / 24);
  return `Hace ${days}d`;
}

export default function FeedPage() {
  const { data: feed, isLoading } = useQuery({
    queryKey: ['activity_feed'],
    queryFn: async () => {
      const { data } = await supabase.from('activity_feed')
        .select('*, actor:profiles(full_name, avatar_url)')
        .order('created_at', { ascending: false })
        .limit(50);
      return data ?? [];
    },
    refetchInterval: 15000,
  });

  return (
    <div className="max-w-lg mx-auto pb-6">
      <header className="px-4 pt-6 pb-3">
        <h1 className="text-xl font-display font-bold">📣 Actividad</h1>
        <p className="text-sm text-gray-500">Lo que está pasando en Pintó</p>
      </header>

      <div className="px-4 space-y-2">
        {isLoading ? (
          <div className="flex justify-center py-16"><div className="spinner" /></div>
        ) : !feed?.length ? (
          <div className="text-center py-16 text-gray-400">
            <p className="text-4xl mb-3">📣</p>
            <p>Todavía no hay actividad</p>
          </div>
        ) : (
          feed.map((item: any) => {
            const action = ACTION_LABELS[item.action] || { emoji: '📋', text: () => item.action };
            return (
              <Link key={item.id}
                href={item.target_type === 'plan' ? `/planes/detalle?id=${item.target_id}` : '#'}
                className="flex items-center gap-3 p-3 bg-white rounded-xl border border-gray-100 shadow-sm">
                <span className="text-xl">{action.emoji}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm">
                    <span className="font-semibold">{item.actor?.full_name}</span>{' '}
                    <span className="text-gray-600">{action.text(item.metadata)}</span>
                  </p>
                  <p className="text-xs text-gray-400 mt-0.5 flex items-center gap-1">
                    <Clock size={10} /> {timeAgo(item.created_at)}
                  </p>
                </div>
                <ChevronRight size={14} className="text-gray-300 shrink-0" />
              </Link>
            );
          })
        )}
      </div>
    </div>
  );
}
