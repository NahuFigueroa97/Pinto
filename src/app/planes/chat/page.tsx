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

/** Cuántos mensajes por tanda. Suficiente para llenar la pantalla y poco para la red. */
const CHAT_PAGE = 50;

/**
 * Une dos tandas por id sin duplicar y deja todo ordenado por fecha.
 *
 * El id es la única clave confiable: el mensaje optimista y el real tienen
 * contenido idéntico y fechas casi iguales.
 */
function mergeById(a: ChatMessage[], b: ChatMessage[]): ChatMessage[] {
  const porId = new Map<string, ChatMessage>();
  for (const m of a) porId.set(m.id, m);
  for (const m of b) porId.set(m.id, m);
  return Array.from(porId.values()).sort((x, y) => x.created_at.localeCompare(y.created_at));
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

  /**
   * Mensajes, en dos modos: primera carga y incremental.
   *
   * Antes esto bajaba `.order('created_at', ascending: true).limit(200)`
   * cada 3 segundos. Dos problemas graves:
   *
   *  1. Ascendente con límite trae los 200 mensajes MÁS VIEJOS. En un chat
   *     que pase de 200 te quedabas mirando el historial antiguo y los
   *     mensajes nuevos no aparecían nunca.
   *  2. Bajar 200 filas con el perfil embebido cada 3 s, por cada persona
   *     con el chat abierto, es una barbaridad. Con mil chats activos son
   *     unas 300 consultas por segundo devolviendo 200 filas cada una. Es
   *     exactamente la lentitud que se nota al escribir.
   *
   * Ahora la primera carga trae los últimos CHAT_PAGE y el sondeo pide sólo
   * lo posterior al último mensaje que ya tenemos: casi siempre cero filas,
   * y cuando hay algo, una o dos. El `created_at` del corte sale de una fila
   * que ya vino del servidor, así que no depende del reloj del teléfono.
   */
  const { data: messages } = useQuery({
    queryKey: ['chat_messages', planId],
    queryFn: async () => {
      const cached = queryClient.getQueryData<ChatMessage[]>(['chat_messages', planId]) ?? [];
      const desde = cached.length ? cached[cached.length - 1].created_at : null;

      const base = () => supabase
        .from('plan_chat_messages')
        .select('*, user:profiles!user_id(full_name, avatar_url)')
        .eq('plan_id', planId);

      if (desde) {
        const nuevos = await sb(
          base().gt('created_at', desde).order('created_at', { ascending: true }).limit(CHAT_PAGE),
        );
        if (!nuevos?.length) return cached;
        return mergeById(cached, nuevos as ChatMessage[]);
      }

      // Descendente + reverse: los ÚLTIMOS CHAT_PAGE, que es lo que se quiere ver.
      const ultimos = await sb(
        base().order('created_at', { ascending: false }).limit(CHAT_PAGE),
      );
      return ((ultimos ?? []) as ChatMessage[]).slice().reverse();
    },
    enabled: !!planId,
    refetchInterval: 4000,
  });

  /** Trae la tanda anterior a lo que ya está cargado. */
  const [cargandoViejos, setCargandoViejos] = useState(false);
  const [hayMasViejos, setHayMasViejos] = useState(true);

  const cargarAnteriores = async () => {
    const cached = queryClient.getQueryData<ChatMessage[]>(['chat_messages', planId]) ?? [];
    if (!planId || !cached.length || cargandoViejos) return;
    setCargandoViejos(true);
    try {
      const viejos = await sb(
        supabase.from('plan_chat_messages')
          .select('*, user:profiles!user_id(full_name, avatar_url)')
          .eq('plan_id', planId)
          .lt('created_at', cached[0].created_at)
          .order('created_at', { ascending: false })
          .limit(CHAT_PAGE),
      );
      const tanda = ((viejos ?? []) as ChatMessage[]).slice().reverse();
      if (tanda.length < CHAT_PAGE) setHayMasViejos(false);
      if (tanda.length) {
        queryClient.setQueryData<ChatMessage[]>(['chat_messages', planId], mergeById(tanda, cached));
      }
    } finally {
      setCargandoViejos(false);
    }
  };

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
        {/* Paginación hacia atrás: la primera carga trae sólo la última tanda. */}
        {hayMasViejos && all.length >= CHAT_PAGE && (
          <div className="flex justify-center pb-2">
            <button
              onClick={() => void cargarAnteriores()}
              disabled={cargandoViejos}
              className="text-[0.7rem] text-gray-500 bg-white border border-gray-200 rounded-full px-4 py-1.5 disabled:opacity-50"
            >
              {cargandoViejos ? 'Cargando...' : 'Ver mensajes anteriores'}
            </button>
          </div>
        )}

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
      {/*
        Info del mensaje.

        Lo que se puede saber de verdad es hasta cuándo leyó cada persona el
        chat, no a qué hora abrió este mensaje puntual: la marca de lectura
        es una por persona y por plan, no una por mensaje. Decir "lo leyó a
        las 14:32" sería inventar. Así que se muestra la última lectura y se
        dice que es eso.
      */}
      {infoOf && (
        <div
          className="fixed inset-0 z-40 bg-black/40 flex items-end"
          onClick={() => setInfoOf(null)}
        >
          <div
            className="bg-white w-full max-w-lg mx-auto rounded-t-3xl p-5 pb-8 max-h-[80vh] overflow-y-auto"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3 mb-1">
              <p className="text-xs font-bold text-gray-400">Info del mensaje</p>
              <button onClick={() => setInfoOf(null)} className="p-1 -mt-1 text-gray-400 shrink-0">
                <X size={18} />
              </button>
            </div>

            {/* El mensaje completo: antes iba en una línea con `truncate` y
                de un mensaje largo no se veía casi nada. */}
            <div className="bg-brand-50 border border-brand-100 rounded-xl px-3 py-2 mb-4">
              <p className="text-sm whitespace-pre-wrap break-words leading-snug">{infoOf.content}</p>
              <p className="text-[0.6rem] text-gray-400 mt-1">
                Enviado {dayLabel(infoOf.created_at).toLowerCase()} a las{' '}
                {new Date(infoOf.created_at).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })}
              </p>
            </div>

            {(() => {
              const leyeron = seenBy(infoOf.created_at);
              const idsLeyeron = new Set(leyeron.map(r => r.user_id));
              const pendientes = (reads ?? []).filter(r => !idsLeyeron.has(r.user_id));

              const fila = (r: ReadState, leido: boolean) => (
                <div key={r.user_id} className="flex items-center gap-2.5 py-1.5">
                  <span className="w-7 h-7 rounded-full bg-gray-100 flex items-center justify-center text-[0.6rem] font-bold text-gray-500 shrink-0 overflow-hidden">
                    {r.avatar_url
                      ? <img src={r.avatar_url} alt="" className="w-full h-full object-cover" />
                      : (r.full_name?.[0]?.toUpperCase() ?? '?')}
                  </span>
                  <span className="text-sm flex-1 min-w-0 truncate">{r.full_name ?? 'Alguien del grupo'}</span>
                  {leido && r.last_read_at && (
                    <span className="text-[0.6rem] text-gray-400 shrink-0">
                      leyó {new Date(r.last_read_at).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  )}
                </div>
              );

              return (
                <div className="space-y-5">
                  <div>
                    <p className="text-[0.7rem] font-bold text-sky-500 flex items-center gap-1.5 mb-1">
                      <CheckCheck size={13} /> Leído por {leyeron.length} de {reads?.length ?? 0}
                    </p>
                    {leyeron.length === 0
                      ? <p className="text-xs text-gray-400 py-1.5">Todavía nadie.</p>
                      : leyeron.map(r => fila(r, true))}
                  </div>

                  {pendientes.length > 0 && (
                    <div>
                      <p className="text-[0.7rem] font-bold text-gray-400 flex items-center gap-1.5 mb-1">
                        <Check size={13} /> Sin leer {pendientes.length}
                      </p>
                      {pendientes.map(r => fila(r, false))}
                    </div>
                  )}

                  <p className="text-[0.6rem] text-gray-400 leading-relaxed border-t border-gray-100 pt-3">
                    La hora es la de la última vez que esa persona abrió el chat,
                    no la de este mensaje en particular.
                  </p>
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
