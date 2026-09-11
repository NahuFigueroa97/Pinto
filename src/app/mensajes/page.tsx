'use client';

import { useState, useRef, useEffect, Suspense } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { ArrowLeft, Send, MessageCircle } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { moderateContent } from '@/lib/moderation';

/**
 * Bandeja de mensajes del usuario.
 *
 * Faltaba por completo: desde /campana un usuario podía escribirle a un
 * negocio, pero no tenía ninguna pantalla donde leer la respuesta. Las
 * notificaciones de respuesta apuntaban a /perfil, que tampoco mostraba
 * nada. O sea: la conversación era de ida nada más.
 */
function MensajesUsuarioInner() {
  const { user } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();

  // La conversación abierta vivía solo en estado local, así que la
  // notificación de "te respondió el negocio" te dejaba en la LISTA y
  // tenías que buscar la conversación a mano. Ahora se puede enlazar
  // directo con /mensajes?id=<businessId>.
  const [selectedBusiness, setSelectedBusiness] = useState<string | null>(
    () => searchParams.get('id'),
  );
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const chatEndRef = useRef<HTMLDivElement>(null);

  const { data: conversations, isLoading } = useQuery({
    queryKey: ['my_conversations', user?.id],
    queryFn: async () => {
      if (!user) return [];
      const { data, error: err } = await supabase
        .from('business_messages')
        .select('business_id, message, created_at, is_read, sender_role, business:businesses(name, logo_url)')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });
      if (err) throw err;

      const byBusiness = new Map<string, any>();
      for (const msg of data ?? []) {
        if (!byBusiness.has(msg.business_id)) {
          const unread = (data ?? []).filter(
            m => m.business_id === msg.business_id && !m.is_read && m.sender_role === 'business',
          ).length;
          byBusiness.set(msg.business_id, { ...msg, unread });
        }
      }
      return Array.from(byBusiness.values());
    },
    enabled: !!user,
    refetchInterval: 20_000,
  });

  const { data: thread } = useQuery({
    queryKey: ['my_thread', user?.id, selectedBusiness],
    queryFn: async () => {
      if (!user || !selectedBusiness) return [];
      await supabase.from('business_messages')
        .update({ is_read: true })
        .eq('user_id', user.id).eq('business_id', selectedBusiness).eq('sender_role', 'business');

      const { data } = await supabase.from('business_messages')
        .select('*')
        .eq('user_id', user.id).eq('business_id', selectedBusiness)
        .order('created_at', { ascending: true });
      return data ?? [];
    },
    enabled: !!user && !!selectedBusiness,
    refetchInterval: 10_000,
  });

  useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [thread]);

  const send = useMutation({
    mutationFn: async () => {
      if (!user || !selectedBusiness || !message.trim()) return;
      const check = moderateContent(message);
      if (!check.ok) throw new Error(check.reason);
      const { error: err } = await supabase.from('business_messages').insert({
        business_id: selectedBusiness,
        user_id: user.id,
        sender_role: 'user',
        message: message.trim(),
      });
      if (err) throw err;
    },
    onSuccess: () => {
      setMessage(''); setError('');
      queryClient.invalidateQueries({ queryKey: ['my_thread'] });
      queryClient.invalidateQueries({ queryKey: ['my_conversations'] });
    },
    onError: (err: any) => setError(err?.message ?? 'No se pudo enviar'),
  });

  if (!user) {
    return (
      <div className="max-w-lg mx-auto flex flex-col items-center justify-center min-h-[60vh] text-center px-6">
        <MessageCircle size={48} className="text-gray-200 mb-4" />
        <p className="text-gray-500 mb-3">Iniciá sesión para ver tus mensajes</p>
        <Link href="/login" className="text-brand-500 font-medium">Iniciar sesión</Link>
      </div>
    );
  }

  if (selectedBusiness) {
    const current = conversations?.find((c: any) => c.business_id === selectedBusiness);
    return (
      <div className="max-w-lg mx-auto flex flex-col h-[calc(100vh-60px)]">
        <header className="flex items-center gap-3 px-4 py-3 border-b border-gray-100 bg-white sticky top-0 z-10">
          <button
            onClick={() => { setSelectedBusiness(null); router.replace('/mensajes'); }}
            className="p-1 text-gray-400"
          ><ArrowLeft size={20} /></button>
          <div className="w-8 h-8 rounded-full bg-accent-100 flex items-center justify-center text-sm">🏪</div>
          <h1 className="font-bold text-sm truncate">{(current?.business as any)?.name ?? 'Negocio'}</h1>
        </header>

        <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2">
          {thread?.map((msg: any) => (
            <div key={msg.id} className={`flex ${msg.sender_role === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-[75%] px-3.5 py-2 rounded-2xl text-sm ${
                msg.sender_role === 'user'
                  ? 'bg-brand-500 text-white rounded-br-md'
                  : 'bg-gray-100 text-gray-800 rounded-bl-md'
              }`}>
                <p>{msg.message}</p>
                <p className={`text-[0.5rem] mt-0.5 ${msg.sender_role === 'user' ? 'text-white/70' : 'text-gray-400'}`}>
                  {new Date(msg.created_at).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })}
                </p>
              </div>
            </div>
          ))}
          <div ref={chatEndRef} />
        </div>

        <div className="px-4 py-3 border-t border-gray-100 bg-white safe-bottom">
          {error && <p className="text-xs text-red-500 mb-2">{error}</p>}
          <div className="flex gap-2">
            <input
              type="text" value={message} onChange={e => { setMessage(e.target.value); setError(''); }}
              onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) send.mutate(); }}
              placeholder="Escribí tu consulta..."
              className="flex-1 px-4 py-2.5 rounded-xl border border-gray-200 text-sm focus:border-brand-400 outline-none"
            />
            <button onClick={() => send.mutate()} disabled={!message.trim() || send.isPending}
              className="p-2.5 bg-brand-500 text-white rounded-xl disabled:opacity-40 active:scale-95 transition">
              <Send size={18} />
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-lg mx-auto pb-20">
      <header className="flex items-center gap-3 px-4 pt-6 pb-3">
        <button onClick={() => router.back()} className="p-1.5 text-gray-400"><ArrowLeft size={20} /></button>
        <div>
          <h1 className="text-xl font-display font-bold">💬 Mis mensajes</h1>
          <p className="text-sm text-gray-400">Tus consultas a los negocios</p>
        </div>
      </header>

      {isLoading ? (
        <div className="flex justify-center py-16"><div className="spinner" /></div>
      ) : !conversations?.length ? (
        <div className="text-center py-16 px-4">
          <p className="text-5xl mb-3">📭</p>
          <p className="text-gray-500 font-medium">Todavía no escribiste a ningún negocio</p>
          <p className="text-sm text-gray-400 mt-1">Desde la ficha de una promo podés consultarle al local</p>
        </div>
      ) : (
        <div className="px-4 space-y-2">
          {conversations.map((conv: any) => (
            <button
              key={conv.business_id}
              onClick={() => setSelectedBusiness(conv.business_id)}
              className="flex items-center gap-3 p-4 bg-white rounded-2xl border border-gray-100 shadow-sm w-full text-left hover:shadow-md transition"
            >
              <div className="w-10 h-10 rounded-full bg-accent-100 flex items-center justify-center shrink-0">🏪</div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between">
                  <p className="font-bold text-sm truncate">{(conv.business as any)?.name ?? 'Negocio'}</p>
                  <p className="text-[0.55rem] text-gray-400 shrink-0 ml-2">
                    {new Date(conv.created_at).toLocaleDateString('es-AR', { day: 'numeric', month: 'short' })}
                  </p>
                </div>
                <p className="text-xs text-gray-400 truncate mt-0.5">{conv.message}</p>
              </div>
              {conv.unread > 0 && (
                <span className="bg-red-500 text-white text-[0.55rem] font-black rounded-full w-5 h-5 flex items-center justify-center shrink-0">
                  {conv.unread}
                </span>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export default function MensajesUsuarioPage() {
  return (
    <Suspense fallback={<div className="flex justify-center pt-20"><div className="spinner" /></div>}>
      <MensajesUsuarioInner />
    </Suspense>
  );
}
