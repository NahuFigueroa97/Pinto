'use client';

import { useState, useRef, useEffect } from 'react';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Send, MessageCircle } from 'lucide-react';
import { useRouter } from 'next/navigation';

export default function NegocioMensajesPage() {
  const { user } = useAuth();
  const router = useRouter();
  const queryClient = useQueryClient();
  const [selectedChat, setSelectedChat] = useState<string | null>(null);
  const [message, setMessage] = useState('');
  const chatEndRef = useRef<HTMLDivElement>(null);

  // Get business
  const { data: business } = useQuery({
    queryKey: ['business_me_msg', user?.id],
    queryFn: async () => {
      if (!user) return null;
      const { data } = await supabase.from('businesses').select('id, name').eq('owner_user_id', user.id).maybeSingle();
      return data;
    },
    enabled: !!user,
  });

  // Get conversations (grouped by user)
  const { data: conversations } = useQuery({
    queryKey: ['biz_conversations', business?.id],
    queryFn: async () => {
      if (!business) return [];
      const { data } = await supabase
        .from('business_messages')
        .select('user_id, message, created_at, is_read, sender_role, user:profiles!business_messages_user_id_fkey(full_name, avatar_url)')
        .eq('business_id', business.id)
        .order('created_at', { ascending: false });

      if (!data) return [];

      // Group by user, keep latest message
      const byUser = new Map<string, any>();
      for (const msg of data) {
        if (!byUser.has(msg.user_id)) {
          const unreadCount = data.filter(m => m.user_id === msg.user_id && !m.is_read && m.sender_role === 'user').length;
          byUser.set(msg.user_id, { ...msg, unread: unreadCount });
        }
      }
      return Array.from(byUser.values());
    },
    enabled: !!business,
    refetchInterval: 10000,
  });

  // Get selected chat messages
  const { data: chatMessages } = useQuery({
    queryKey: ['biz_chat', business?.id, selectedChat],
    queryFn: async () => {
      if (!business || !selectedChat) return [];
      // Mark as read
      await supabase.from('business_messages')
        .update({ is_read: true })
        .eq('business_id', business.id).eq('user_id', selectedChat).eq('sender_role', 'user');

      const { data } = await supabase.from('business_messages')
        .select('*')
        .eq('business_id', business.id).eq('user_id', selectedChat)
        .order('created_at', { ascending: true });
      return data ?? [];
    },
    enabled: !!business && !!selectedChat,
    refetchInterval: 5000,
  });

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatMessages]);

  const sendMessage = useMutation({
    mutationFn: async () => {
      if (!business || !selectedChat || !message.trim()) return;
      await supabase.from('business_messages').insert({
        business_id: business.id,
        user_id: selectedChat,
        sender_role: 'business',
        message: message.trim(),
      });
    },
    onSuccess: () => {
      setMessage('');
      queryClient.invalidateQueries({ queryKey: ['biz_chat'] });
      queryClient.invalidateQueries({ queryKey: ['biz_conversations'] });
    },
  });

  if (!business) return <div className="flex justify-center pt-20"><div className="spinner" /></div>;

  // Chat view
  if (selectedChat) {
    const chatUser = conversations?.find((c: any) => c.user_id === selectedChat);
    return (
      <div className="max-w-lg mx-auto flex flex-col h-[calc(100vh-60px)]">
        <header className="flex items-center gap-3 px-4 py-3 border-b border-gray-100 bg-white sticky top-0 z-10">
          <button onClick={() => setSelectedChat(null)} className="p-1 text-gray-400"><ArrowLeft size={20} /></button>
          <div className="w-8 h-8 rounded-full bg-brand-100 flex items-center justify-center text-sm font-bold text-brand-600">
            {(chatUser?.user as any)?.full_name?.[0] ?? '?'}
          </div>
          <h1 className="font-bold text-sm">{(chatUser?.user as any)?.full_name ?? 'Usuario'}</h1>
        </header>

        <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2">
          {chatMessages?.map((msg: any) => (
            <div key={msg.id} className={`flex ${msg.sender_role === 'business' ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-[75%] px-3.5 py-2 rounded-2xl text-sm ${
                msg.sender_role === 'business'
                  ? 'bg-accent-500 text-white rounded-br-md'
                  : 'bg-gray-100 text-gray-800 rounded-bl-md'
              }`}>
                <p>{msg.message}</p>
                <p className={`text-[0.5rem] mt-0.5 ${msg.sender_role === 'business' ? 'text-accent-200' : 'text-gray-400'}`}>
                  {new Date(msg.created_at).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })}
                </p>
              </div>
            </div>
          ))}
          <div ref={chatEndRef} />
        </div>

        <div className="px-4 py-3 border-t border-gray-100 bg-white">
          <div className="flex gap-2">
            <input
              type="text" value={message} onChange={e => setMessage(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && !e.shiftKey && sendMessage.mutate()}
              placeholder="Escribí tu respuesta..."
              className="flex-1 px-4 py-2.5 rounded-xl border border-gray-200 text-sm focus:border-accent-400 outline-none"
            />
            <button onClick={() => sendMessage.mutate()} disabled={!message.trim()}
              className="p-2.5 bg-accent-500 text-white rounded-xl disabled:opacity-40 active:scale-95 transition">
              <Send size={18} />
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Conversations list
  return (
    <div className="max-w-lg mx-auto pb-20">
      <header className="px-4 pt-6 pb-3">
        <h1 className="text-xl font-display font-bold">💬 Mensajes</h1>
        <p className="text-sm text-gray-400">Consultas de clientes sobre tus promos</p>
      </header>

      {!conversations?.length ? (
        <div className="text-center py-16 px-4">
          <p className="text-5xl mb-3">📭</p>
          <p className="text-gray-500 font-medium">Sin mensajes aún</p>
          <p className="text-sm text-gray-400 mt-1">Cuando un usuario te consulte por una promo, vas a verlo acá</p>
        </div>
      ) : (
        <div className="px-4 space-y-2">
          {conversations.map((conv: any) => (
            <button
              key={conv.user_id}
              onClick={() => setSelectedChat(conv.user_id)}
              className="flex items-center gap-3 p-4 bg-white rounded-2xl border border-gray-100 shadow-sm w-full text-left hover:shadow-md transition"
            >
              <div className="w-10 h-10 rounded-full bg-brand-100 flex items-center justify-center text-sm font-bold text-brand-600 shrink-0">
                {(conv.user as any)?.full_name?.[0] ?? '😊'}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between">
                  <p className="font-bold text-sm truncate">{(conv.user as any)?.full_name ?? 'Usuario'}</p>
                  <p className="text-[0.55rem] text-gray-400">{new Date(conv.created_at).toLocaleDateString('es-AR', { day: 'numeric', month: 'short' })}</p>
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
