'use client';

import { useState, useEffect, useRef, useCallback, useMemo, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { ArrowLeft, Send, Check, CheckCheck, Clock, X } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { sb } from '@/lib/sb';
import { useBlockedIds, filterBlocked } from '@/lib/blocks';
import { moderateContent } from '@/lib/moderation';
import { EmojiPicker } from '@/components/shared/EmojiPicker';
import { PageSpinner } from '@/components/shared/PageSpinner';

/** Cuánto se puede alejar del fondo y seguir considerándose "abajo". */
const NEAR_BOTTOM_PX = 120;

interface ChatMessage {
  id: string;
  plan_id: string;
  user_id: string;
  content: string;
  created_at: string;
  user?: { full_name: string | null; avatar_url: string | null };
  /** Solo en los optimistas: todavía no confirmó el servidor. */
  pending?: boolean;
}

interface ReadState {
  user_id: string;
  full_name: string | null;
  avatar_url: string | null;
  last_read_at: string | null;
}

function sameDay(a: string, b: string) {
  return new Date(a).toDateString() === new Date(b).toDateString();
}

function dayLabel(iso: string) {
  const d = new Date(iso);
  const hoy = new Date();
  const ayer = new Date(); ayer.setDate(hoy.getDate() - 1);
  if (d.toDateString() === hoy.toDateString()) return 'Hoy';
  if (d.toDateString() === ayer.toDateString()) return 'Ayer';
  return d.toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long' });
}

function ChatInner() {
  const searchParams = useSearchParams();
  const planId = searchParams.get('id');
  const router = useRouter();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const { blockedSet } = useBlockedIds();

  const [msg, setMsg] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [pending, setPending] = useState<ChatMessage[]>([]);
  const [atBottom, setAtBottom] = useState(true);
  // Equivalente al "Info del mensaje" de WhatsApp: quién lo leyó y cuándo.
  const [infoOf, setInfoOf] = useState<ChatMessage | null>(null);
  const [readError, setReadError] = useState('');

  const bottomRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const lastCountRef = useRef(0);

  const { data: plan } = useQuery({
    queryKey: ['chat_plan', planId],
    queryFn: async () => sb(supabase.from('social_plans').select('title').eq('id', planId).single()),
    enabled: !!planId,
  });

  const { data: messages } = useQuery({
    queryKey: ['chat_messages', planId],
    queryFn: async () => {
      const rows = await sb(
        supabase.from('plan_chat_messages')
          .select('*, user:profiles(full_name, avatar_url)')
          .eq('plan_id', planId)
          .order('created_at', { ascending: true })
          .limit(200),
      );
      return (rows ?? []) as ChatMessage[];
    },
    enabled: !!planId,
    refetchInterval: 3000,
  });

  /** Quién leyó hasta cuándo, para el visto. */
  const { data: reads } = useQuery({
    queryKey: ['chat_reads', planId],
    queryFn: async () => {
      const { data, error: err } = await supabase.rpc('chat_read_state', { p_plan_id: planId });
      if (err) {
        // Lo más probable: falta correr supabase/migrations/016_chat_vistos.sql.
        // El chat tiene que seguir andando sin el visto, pero el motivo no
        // puede quedar invisible.
        console.error('[chat] no se pudo leer el visto:', err.message);
        return [] as ReadState[];
      }
      return (data ?? []) as ReadState[];
    },
    enabled: !!planId,
    refetchInterval: 8000,
  });

  /**
   * Marcar como leído.
   *
   * Antes esto era `void supabase.rpc(...)`: si el RPC fallaba —falta la
   * migración 016, no sos miembro, lo que sea— el visto simplemente no
   * andaba y no quedaba ni un rastro para saberlo.
   */
  const markRead = useCallback(async () => {
    if (!planId) return;
    // Si la app está en segundo plano no se leyó nada. Marcarlo igual sería
    // mentirle a quien mandó el mensaje.
    if (typeof document !== 'undefined' && document.visibilityState !== 'visible') return;

    const { error: err } = await supabase.rpc('mark_chat_read', { p_plan_id: planId });
    if (err) {
      console.error('[chat] no se pudo marcar como leído:', err.message);
      setReadError(err.message);
      return;
    }
    setReadError('');
    // Sin esto el resto del grupo tarda hasta 8 s (el refetchInterval) en
    // ver el visto.
    void queryClient.invalidateQueries({ queryKey: ['chat_reads', planId] });
  }, [planId, queryClient]);

  /**
   * El id del último mensaje cambia cada vez que llega algo nuevo, propio o
   * ajeno: es la señal de "hay algo más para dar por leído".
   *
   * Antes la única llamada era al montar, más una dentro del efecto de
   * auto-scroll condicionada a `atBottom`. O sea: si abrías el chat y te
   * quedabas adentro, tu marca de lectura quedaba clavada en el momento en
   * que entraste. Los mensajes que llegaban después nunca contaban como
   * leídos — ni siquiera al responderlos — y el que los mandó seguía viendo
   * "Todavía no lo vio nadie" para siempre.
   */
  const lastMessageId = messages?.length ? messages[messages.length - 1].id : null;

  useEffect(() => {
    void markRead();
  }, [markRead, lastMessageId]);

  // Al volver del segundo plano: los mensajes que llegaron mientras tanto
  // recién ahora se están viendo de verdad.
  useEffect(() => {
    const onVisible = () => { if (document.visibilityState === 'visible') void markRead(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [markRead]);

  // useMemo no es cosmético acá: `all` es dependencia del efecto de
  // auto-scroll, así que recrearlo en cada render lo dispararía siempre.
  const all = useMemo(() => {
    const visible = filterBlocked<ChatMessage>(messages, blockedSet, m => m.user_id);

    // Se descarta por id, que ahora sí sirve: al confirmarse el envío, el
    // optimista se saca de `pending` y en su lugar entra la fila real.
    // Antes se comparaba el id optimista ("pending-1789...") contra los ids
    // del servidor, que por construcción nunca coinciden: el mensaje falso
    // no se quitaba nunca y al llegar el real se veían los dos.
    const seen = new Set(visible.map(m => m.id));
    return [...visible, ...pending.filter(p => !seen.has(p.id))];
  }, [messages, blockedSet, pending]);

  /**
   * Auto-scroll, pero solo si el usuario ya estaba abajo.
   *
   * Antes esto era `scrollIntoView()` en cada refetch (cada 3 s), así que si
   * alguien subía a leer algo viejo, el chat lo tiraba de vuelta al fondo
   * una y otra vez y era imposible leer.
   */
  useEffect(() => {
    if (all.length === lastCountRef.current) return;
    const grew = all.length > lastCountRef.current;
    lastCountRef.current = all.length;
    if (!grew) return;

    const last = all[all.length - 1];
    const isMine = last?.user_id === user?.id;

    // El marcado como leído ya no vive acá: dependía de `atBottom`, que en
    // pleno scroll suave vale false, así que se perdían lecturas.
    if (atBottom || isMine) bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [all, atBottom, user?.id]);

  const onScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    const distance = el.scrollHeight - el.scrollTop - el.clientHeight;
    setAtBottom(distance < NEAR_BOTTOM_PX);
  };

  /** El textarea crece con el texto, hasta 5 líneas. */
  const autoGrow = () => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 120)}px`;
  };
  useEffect(autoGrow, [msg]);

  const sendMessage = async () => {
    const text = msg.trim();
    if (!text || !user || !planId || sending) return;

    const check = moderateContent(text);
    if (!check.ok) { setError(check.reason); return; }

    // Optimista: el mensaje aparece al instante. Con refetchInterval de 3 s,
    // esperar la confirmación hacía que se sintiera trabado.
    const optimistic: ChatMessage = {
      id: `pending-${Date.now()}`,
      plan_id: planId,
      user_id: user.id,
      content: text,
      created_at: new Date().toISOString(),
      pending: true,
    };
    setPending(p => [...p, optimistic]);
    setMsg('');
    setError('');
    setSending(true);

    // Se pide la fila insertada para poder reemplazar el optimista por ella
    // en la misma operación: sin esto el mensaje desaparecería hasta el
    // siguiente refetch.
    const { data: inserted, error: insertErr } = await supabase
      .from('plan_chat_messages')
      .insert({ plan_id: planId, user_id: user.id, content: text })
      .select('*, user:profiles!user_id(full_name, avatar_url)')
      .single();

    setSending(false);

    if (insertErr || !inserted) {
      setPending(p => p.filter(x => x.id !== optimistic.id));
      setMsg(text);            // no se pierde lo escrito
      setError('No se pudo enviar. Probá de nuevo.');
      return;
    }

    queryClient.setQueryData<ChatMessage[]>(['chat_messages', planId], old => {
      const list = old ?? [];
      if (list.some(m => m.id === (inserted as ChatMessage).id)) return list;
      return [...list, inserted as ChatMessage];
    });
    setPending(p => p.filter(x => x.id !== optimistic.id));
  };

  const insertEmoji = (emoji: string) => {
    setMsg(m => m + emoji);
    inputRef.current?.focus();
  };

  /** Cuántos miembros leyeron un mensaje dado. */
  const seenBy = (iso: string) =>
    (reads ?? []).filter(r => r.last_read_at && new Date(r.last_read_at) >= new Date(iso));

  const others = reads?.length ?? 0;

  return (
    <div className="flex flex-col h-[100dvh] max-w-lg mx-auto bg-gray-50">
      <header className="flex items-center gap-3 px-4 py-3 border-b border-gray-100 bg-white shrink-0">
        <button onClick={() => router.back()} className="p-1 text-gray-400"><ArrowLeft size={20} /></button>
        <div className="min-w-0">
          <h1 className="text-sm font-bold truncate">💬 {plan?.title || 'Chat del grupo'}</h1>
          <p className="text-[0.65rem] text-gray-400">
            {others + 1} {others + 1 === 1 ? 'participante' : 'participantes'}
          </p>
        </div>
      </header>

      <div ref={scrollRef} onScroll={onScroll} className="flex-1 overflow-y-auto px-4 py-3 space-y-1">
        {all.length === 0 && (
          <div className="text-center py-10 text-gray-400 text-sm">
            <p className="text-3xl mb-2">💬</p>
            <p>¡Arrancá la conversación!</p>
          </div>
        )}

        {all.map((m, i) => {
          const isMine = m.user_id === user?.id;
          const prev = all[i - 1];
          // Se agrupan los mensajes seguidos de la misma persona: evita
          // repetir el nombre y hace la conversación mucho más legible.
          const grouped = prev && prev.user_id === m.user_id && sameDay(prev.created_at, m.created_at)
            && new Date(m.created_at).getTime() - new Date(prev.created_at).getTime() < 5 * 60_000;
          const newDay = !prev || !sameDay(prev.created_at, m.created_at);
          const seen = isMine && !m.pending ? seenBy(m.created_at) : [];
          const isLastMine = isMine && !m.pending
            && !all.slice(i + 1).some(x => x.user_id === user?.id);

          return (
            <div key={m.id}>
              {newDay && (
                <div className="flex justify-center my-3">
                  <span className="text-[0.6rem] text-gray-400 bg-white px-3 py-1 rounded-full border border-gray-100">
                    {dayLabel(m.created_at)}
                  </span>
                </div>
              )}

              <div className={`flex ${isMine ? 'justify-end' : 'justify-start'} ${grouped ? 'mt-0.5' : 'mt-2'}`}>
                <div
                  onClick={() => { if (isMine && !m.pending && others > 0) setInfoOf(m); }}
                  className={`max-w-[78%] px-3.5 py-2 ${isMine && !m.pending && others > 0 ? 'cursor-pointer' : ''} ${
                    isMine
                      ? `bg-brand-500 text-white rounded-2xl ${grouped ? 'rounded-tr-md' : ''} rounded-br-md`
                      : `bg-white text-gray-800 border border-gray-100 rounded-2xl ${grouped ? 'rounded-tl-md' : ''} rounded-bl-md`
                  } ${m.pending ? 'opacity-60' : ''}`}
                >
                  {!isMine && !grouped && (
                    <p className="text-[0.65rem] font-bold mb-0.5 text-brand-500">{m.user?.full_name}</p>
                  )}
                  {/* whitespace-pre-wrap conserva los saltos de línea y
                      break-words evita que un enlace largo rompa el layout */}
                  <p className="text-[0.95rem] whitespace-pre-wrap break-words leading-snug">{m.content}</p>
                  <div className={`flex items-center gap-1 justify-end mt-0.5 ${isMine ? 'text-white/60' : 'text-gray-400'}`}>
                    <span className="text-[0.55rem]">
                      {new Date(m.created_at).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })}
                    </span>
                    {/* Mismos estados que WhatsApp: reloj mientras se envía,
                        una tilde al llegar al servidor, dos grises cuando lo
                        leyó alguien y dos celestes cuando lo leyeron todos.
                        Antes se ponía celeste con una sola persona, que es
                        justo lo contrario de lo que significa ahí. */}
                    {isMine && (
                      m.pending
                        ? <Clock size={10} className="opacity-60" />
                        : seen.length === 0
                          ? <Check size={11} />
                          : seen.length >= others
                            ? <CheckCheck size={12} className="text-sky-300" />
                            : <CheckCheck size={12} className="opacity-70" />
                    )}
                  </div>
                </div>
              </div>

              {/* El visto detallado solo en el último mensaje propio: en un
                  grupo, repetirlo en cada burbuja es ruido. */}
              {isLastMine && others > 0 && (
                <p className="text-[0.6rem] text-gray-400 text-right mt-0.5 pr-1">
                  {seen.length === 0
                    ? 'Todavía no lo vio nadie'
                    : seen.length >= others
                      ? `Visto por todos (${others})`
                      : `Visto por ${seen.length} de ${others}`}
                  <span className="text-gray-300"> · tocá para ver quién</span>
                </p>
              )}
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>

      {/* Volver al fondo cuando hay mensajes nuevos más abajo */}
      {!atBottom && (
        <button
          onClick={() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }); void markRead(); }}
          className="absolute bottom-24 right-5 w-10 h-10 rounded-full bg-white border border-gray-200 shadow-lg flex items-center justify-center text-gray-500"
          aria-label="Ir al último mensaje"
        >
          ↓
        </button>
      )}

      {/* Detalle de lectura, como el "Info del mensaje" de WhatsApp */}
      {infoOf && (
        <div
          className="fixed inset-0 z-40 bg-black/40 flex items-end"
          onClick={() => setInfoOf(null)}
        >
          <div
            className="bg-white w-full max-w-lg mx-auto rounded-t-3xl p-5 pb-8"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3 mb-4">
              <div className="min-w-0">
                <p className="text-xs text-gray-400">Info del mensaje</p>
                <p className="text-sm font-medium truncate">{infoOf.content}</p>
              </div>
              <button onClick={() => setInfoOf(null)} className="p-1 text-gray-400 shrink-0">
                <X size={18} />
              </button>
            </div>

            {(() => {
              const readers = seenBy(infoOf.created_at);
              const readerIds = new Set(readers.map(r => r.user_id));
              const pendientes = (reads ?? []).filter(r => !readerIds.has(r.user_id));
              return (
                <div className="space-y-4">
                  <div>
                    <p className="text-[0.7rem] font-bold text-sky-500 flex items-center gap-1.5 mb-2">
                      <CheckCheck size={13} /> Leído por {readers.length}
                    </p>
                    {readers.length === 0 ? (
                      <p className="text-xs text-gray-400 pl-5">Todavía nadie</p>
                    ) : readers.map(r => (
                      <div key={r.user_id} className="flex items-center justify-between py-1 pl-5">
                        <span className="text-sm">{r.full_name}</span>
                        <span className="text-[0.65rem] text-gray-400">
                          {r.last_read_at && new Date(r.last_read_at).toLocaleTimeString('es-AR',
                            { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </div>
                    ))}
                  </div>

                  {pendientes.length > 0 && (
                    <div>
                      <p className="text-[0.7rem] font-bold text-gray-400 flex items-center gap-1.5 mb-2">
                        <Check size={13} /> Sin leer {pendientes.length}
                      </p>
                      {pendientes.map(r => (
                        <p key={r.user_id} className="text-sm text-gray-500 py-1 pl-5">{r.full_name}</p>
                      ))}
                    </div>
                  )}
                </div>
              );
            })()}
          </div>
        </div>
      )}

      <div className="shrink-0 border-t border-gray-100 bg-white px-3 py-2 safe-bottom">
        {error && <p className="text-xs text-red-500 mb-2 px-1">{error}</p>}
        {/* El visto es silencioso por naturaleza: si el RPC falla, la única
            señal sería que nadie ve nunca los tildes celestes. */}
        {readError && (
          <p className="text-[0.65rem] text-amber-600 mb-2 px-1">
            El visto no está funcionando ({readError})
          </p>
        )}
        <div className="flex items-end gap-1">
          <EmojiPicker onPick={insertEmoji} />
          <textarea
            ref={inputRef}
            value={msg}
            rows={1}
            onChange={e => { setMsg(e.target.value); setError(''); }}
            onKeyDown={e => {
              // Enter envía, Shift+Enter hace salto de línea. Antes no había
              // forma de escribir un mensaje de más de una línea.
              if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void sendMessage(); }
            }}
            placeholder="Escribí un mensaje..."
            className="flex-1 px-3.5 py-2.5 rounded-2xl border border-gray-200 text-[0.95rem] outline-none focus:border-brand-400 resize-none leading-snug"
          />
          <button
            onClick={() => void sendMessage()}
            disabled={!msg.trim()}
            aria-label="Enviar"
            className="p-2.5 bg-brand-500 text-white rounded-full disabled:opacity-40 active:scale-90 transition shrink-0"
          >
            <Send size={18} />
          </button>
        </div>
      </div>
    </div>
  );
}

export default function PlanChatPage() {
  return (
    <Suspense fallback={<PageSpinner />}>
      <ChatInner />
    </Suspense>
  );
}
