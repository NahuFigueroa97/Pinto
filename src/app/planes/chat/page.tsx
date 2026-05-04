'use client';

import { useState, useEffect, useRef, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { ArrowLeft, Send } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import { useQuery, useQueryClient } from '@tanstack/react-query';

function ChatInner() {
  const searchParams = useSearchParams();
  const planId = searchParams.get('id');
  const router = useRouter();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [msg, setMsg] = useState('');
  const [sending, setSending] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  const { data: plan } = useQuery({
    queryKey: ['chat_plan', planId],
    queryFn: async () => {
      const { data } = await supabase.from('social_plans').select('title').eq('id', planId).single();
      return data;
    },
    enabled: !!planId,
  });

  const { data: messages } = useQuery({
    queryKey: ['chat_messages', planId],
    queryFn: async () => {
      const { data } = await supabase.from('plan_chat_messages')
        .select('*, user:profiles(full_name, avatar_url)')
        .eq('plan_id', planId)
        .order('created_at', { ascending: true })
        .limit(100);
      return data ?? [];
    },
    enabled: !!planId,
    refetchInterval: 3000,
  });

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const sendMessage = async () => {
    if (!msg.trim() || !user || !planId) return;
    setSending(true);
    await supabase.from('plan_chat_messages').insert({ plan_id: planId, user_id: user.id, content: msg.trim() });
    setMsg('');
    setSending(false);
    queryClient.invalidateQueries({ queryKey: ['chat_messages', planId] });
  };

  return (
    <div className="flex flex-col h-[100dvh] max-w-lg mx-auto">
      <header className="flex items-center gap-3 px-4 py-3 border-b border-gray-100 bg-white shrink-0">
        <button onClick={() => router.back()} className="p-1 text-gray-400"><ArrowLeft size={20} /></button>
        <div>
          <h1 className="text-sm font-bold">💬 Chat del grupo</h1>
          <p className="text-xs text-gray-400">{plan?.title || 'Cargando...'}</p>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
        {messages?.length === 0 && (
          <div className="text-center py-10 text-gray-400 text-sm">
            <p className="text-3xl mb-2">💬</p>
            <p>¡Arrancá la conversación!</p>
          </div>
        )}
        {messages?.map((m: any) => {
          const isMe = m.user_id === user?.id;
          return (
            <div key={m.id} className={`flex ${isMe ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-[75%] ${isMe ? 'bg-brand-500 text-white' : 'bg-gray-100 text-gray-800'} rounded-2xl px-3.5 py-2`}>
                {!isMe && <p className="text-[0.6rem] font-bold mb-0.5 opacity-70">{m.user?.full_name}</p>}
                <p className="text-sm">{m.content}</p>
                <p className={`text-[0.55rem] mt-0.5 ${isMe ? 'text-white/60' : 'text-gray-400'}`}>
                  {new Date(m.created_at).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })}
                </p>
              </div>
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>

      <div className="shrink-0 border-t border-gray-100 bg-white px-4 py-3 safe-bottom">
        <div className="flex gap-2">
          <input
            value={msg}
            onChange={e => setMsg(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && sendMessage()}
            placeholder="Escribí un mensaje..."
            className="flex-1 px-4 py-2.5 rounded-xl border border-gray-200 text-sm outline-none focus:border-brand-400"
          />
          <button
            onClick={sendMessage}
            disabled={sending || !msg.trim()}
            className="p-2.5 bg-brand-500 text-white rounded-xl disabled:opacity-50"
          >
            <Send size={18} />
          </button>
        </div>
      </div>
    </div>
  );
}

export default function PlanChatPage() {
  return <Suspense fallback={<div className="flex justify-center pt-20"><div className="spinner" /></div>}><ChatInner /></Suspense>;
}
