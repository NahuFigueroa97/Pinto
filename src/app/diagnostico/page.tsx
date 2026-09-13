'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Play, Copy, Check } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth';
import { today } from '@/lib/dates';

/**
 * Diagnóstico de conectividad.
 *
 * Cuando una pantalla se queda cargando, el usuario ve un spinner y nada
 * más. Saber si el problema es la red, la sesión, una consulta puntual o
 * toda la base cambia por completo el arreglo — y pedirle a alguien que
 * corra SQL en el dashboard mientras tiene el teléfono en la mano no
 * escala.
 *
 * Esta pantalla mide cada paso por separado y deja el resultado listo para
 * copiar y pegar.
 */

interface PlanRow {
  id: string;
  title: string;
  plan_date: string;
  status: string;
  visibility: string;
  category_id: string | null;
}

interface Step {
  name: string;
  detail: string;
  ms: number;
  ok: boolean;
}

/**
 * Plazo por paso.
 *
 * Sin esto, la herramienta para diagnosticar cuelgues se colgaba ella
 * misma: el primer paso que no volvía cortaba la corrida y los pasos
 * siguientes —los que dicen dónde está el problema— no se ejecutaban nunca.
 * Un paso trabado ahora se reporta como trabado y la corrida sigue.
 */
const STEP_TIMEOUT_MS = 12_000;

async function timed(name: string, fn: () => Promise<string>): Promise<Step> {
  const t0 = performance.now();
  let timer: ReturnType<typeof setTimeout>;
  const plazo = new Promise<never>((_, reject) => {
    timer = setTimeout(
      () => reject(new Error(`SE COLGÓ: no respondió en ${STEP_TIMEOUT_MS / 1000} s`)),
      STEP_TIMEOUT_MS,
    );
  });

  try {
    const detail = await Promise.race([fn(), plazo]);
    return { name, detail, ms: Math.round(performance.now() - t0), ok: true };
  } catch (err) {
    return {
      name,
      detail: err instanceof Error ? err.message : String(err),
      ms: Math.round(performance.now() - t0),
      ok: false,
    };
  } finally {
    clearTimeout(timer!);
  }
}

export default function DiagnosticoPage() {
  const router = useRouter();
  const { user } = useAuth();
  const [steps, setSteps] = useState<Step[]>([]);
  const [running, setRunning] = useState(false);
  const [copied, setCopied] = useState(false);
  const [plans, setPlans] = useState<PlanRow[]>([]);

  const run = async () => {
    setRunning(true);
    setSteps([]);
    setPlans([]);
    const out: Step[] = [];
    const push = (s: Step) => { out.push(s); setSteps([...out]); };

    // 1. ¿Hay internet? Sin esto, todo lo demás va a fallar igual y no
    //    distinguiríamos "sin red" de "Supabase caído".
    push(await timed('Conexión a internet', async () => {
      // no-cors: generate_204 no manda cabeceras CORS y el WebView rechaza
      // la respuesta. Con no-cors la respuesta es opaca (no se puede leer el
      // status) pero si la promesa resuelve, hay salida a internet.
      await fetch('https://www.gstatic.com/generate_204', { cache: 'no-store', mode: 'no-cors' });
      return 'hay salida a internet';
    }));

    // 2. ¿Responde el host de Supabase? Va sin auth y sin tocar la base.
    push(await timed('Alcance de Supabase', async () => {
      const r = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/auth/v1/health`, {
        headers: { apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY! },
        cache: 'no-store',
      });
      return `HTTP ${r.status}`;
    }));

    // 3a. La sesión leída del storage, SIN pasar por supabase-js. Si acá
    //     hay token y vencido, el paso siguiente va a hacer un refresh por
    //     red adentro del lock: ese es el camino lento y el que se trababa.
    push(await timed('Sesión en storage (sin lock)', async () => {
      const ref = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? '').match(/\/\/([^.]+)\./)?.[1];
      const raw = ref ? localStorage.getItem(`sb-${ref}-auth-token`) : null;
      if (!raw) return 'no hay sesión guardada';
      const exp = (JSON.parse(raw) as { expires_at?: number })?.expires_at;
      if (!exp) return 'guardada, sin fecha de vencimiento';
      const cuando = new Date(exp * 1000);
      const vencida = cuando.getTime() < Date.now();
      return `${vencida ? 'VENCIDA' : 'vigente'} · ${cuando.toLocaleString('es-AR')}`;
    }));

    // 3. La sesión. Pasa por el lock de auth de supabase-js, que fue el
    //    sospechoso de que se colgara todo.
    push(await timed('Sesión (lock de auth)', async () => {
      const { data, error } = await supabase.auth.getSession();
      if (error) throw error;
      return data.session ? 'sesión activa' : 'sin sesión';
    }));

    // 4. Consulta trivial: mide la ida y vuelta a PostgREST sin RLS compleja.
    push(await timed('Consulta simple (cities)', async () => {
      const { data, error } = await supabase.from('cities').select('id').limit(1);
      if (error) throw error;
      return `${data?.length ?? 0} fila(s)`;
    }));

    // 5. La consulta que falla.
    push(await timed('Feed de actividad', async () => {
      const { data, error } = await supabase
        .from('activity_feed')
        .select('*, actor:profiles(full_name, avatar_url)')
        .order('created_at', { ascending: false })
        .limit(50);
      if (error) throw error;
      return `${data?.length ?? 0} fila(s)`;
    }));

    // 6. El feed sin el embed, para saber si el problema es la unión.
    push(await timed('Feed sin embed', async () => {
      const { data, error } = await supabase
        .from('activity_feed').select('id, actor_id, created_at')
        .order('created_at', { ascending: false }).limit(50);
      if (error) throw error;
      return `${data?.length ?? 0} fila(s)`;
    }));

    // 7. Bloqueos: la query que agregué al feed y que antes no existía.
    push(await timed('Bloqueos (user_blocks)', async () => {
      if (!user) return 'sin sesión, no aplica';
      const { data, error } = await supabase
        .from('user_blocks').select('blocked_id').eq('blocker_id', user.id);
      if (error) throw error;
      return `${data?.length ?? 0} fila(s)`;
    }));

    // 8. Planes SIN filtros: si acá aparece y en /planes no, el problema
    //    son los filtros. Si no aparece ni acá, es RLS.
    push(await timed('Planes visibles (sin filtros)', async () => {
      const { data, error } = await supabase
        .from('social_plans')
        .select('id, title, plan_date, status, visibility, category_id')
        .order('created_at', { ascending: false }).limit(10);
      if (error) throw error;
      setPlans((data ?? []) as PlanRow[]);
      return `${data?.length ?? 0} fila(s)`;
    }));

    // 9. Exactamente la consulta de /planes, con los mismos filtros.
    push(await timed('Planes con los filtros de /planes', async () => {
      const { data, error } = await supabase
        .from('social_plans')
        .select('id')
        .eq('status', 'open')
        .eq('visibility', 'public')
        .gte('plan_date', today())
        .order('plan_date').limit(30);
      if (error) throw error;
      return `${data?.length ?? 0} fila(s) · hoy = ${today()}`;
    }));

    // 10-12. El perfil de otra persona: la pantalla que se quedaba girando.
    //     Se parte en dos —con embed de zona y sin él— porque un embed roto
    //     es exactamente lo que rompió /planes y no se veía por ningún lado.
    let otherId: string | null = null;
    push(await timed('Buscar otro usuario', async () => {
      let q = supabase.from('profiles').select('id, full_name').limit(1);
      if (user) q = q.neq('id', user.id);
      const { data, error } = await q;
      if (error) throw error;
      otherId = data?.[0]?.id ?? null;
      return otherId ? `${data![0].full_name ?? 'sin nombre'} (${otherId.slice(0, 8)})` : 'no hay otro perfil';
    }));

    push(await timed('Perfil ajeno SIN embed', async () => {
      if (!otherId) return 'no aplica';
      const { data, error } = await supabase.from('profiles')
        .select('id, full_name, reputation_score').eq('id', otherId).single();
      if (error) throw error;
      return data ? 'ok' : 'sin filas (RLS)';
    }));

    push(await timed('Perfil ajeno CON zone:zones', async () => {
      if (!otherId) return 'no aplica';
      const { data, error } = await supabase.from('profiles')
        .select('id, full_name, avatar_url, bio, birth_year, show_age, interests_text, reputation_score, plans_created_count, plans_joined_count, is_verified, zone:zones(name)')
        .eq('id', otherId).single();
      if (error) throw error;
      return data ? 'ok' : 'sin filas (RLS)';
    }));

    // 13-14. El visto del chat. Si estos dos no existen, falta correr
    //     016_chat_vistos.sql y el visto no puede andar.
    let planId: string | null = null;
    push(await timed('Un plan donde soy miembro', async () => {
      if (!user) return 'sin sesión, no aplica';
      const { data, error } = await supabase.from('social_plan_members')
        .select('plan_id').eq('user_id', user.id).limit(1);
      if (error) throw error;
      planId = data?.[0]?.plan_id ?? null;
      return planId ? planId.slice(0, 8) : 'no sos miembro de ningún plan';
    }));

    push(await timed('Visto: marcar leído (mark_chat_read)', async () => {
      if (!planId) return 'no aplica';
      const { error } = await supabase.rpc('mark_chat_read', { p_plan_id: planId });
      if (error) throw error;
      return 'ok';
    }));

    push(await timed('Visto: quién leyó (chat_read_state)', async () => {
      if (!planId) return 'no aplica';
      const { data, error } = await supabase.rpc('chat_read_state', { p_plan_id: planId });
      if (error) throw error;
      const rows = (data ?? []) as { full_name: string | null; last_read_at: string | null }[];
      if (rows.length === 0) return '0 miembros además de vos';
      const conMarca = rows.filter(r => r.last_read_at).length;
      return `${rows.length} miembro(s), ${conMarca} con marca de lectura`;
    }));

    setRunning(false);
  };

  const report = [
    `build ${process.env.NEXT_PUBLIC_BUILD_ID} · ${process.env.NEXT_PUBLIC_BUILD_DATE}`,
    `sesión: ${user ? 'sí' : 'no'}`,
    ...steps.map(s => `${s.ok ? 'OK  ' : 'FALLA'} ${s.ms.toString().padStart(6)}ms  ${s.name}: ${s.detail}`),
    ...(plans.length ? ['', `planes (hoy=${today()}):`] : []),
    ...plans.map(p => `  ${p.plan_date} ${p.status} ${p.visibility} — ${p.title}`),
  ].join('\n');

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(report);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch { /* sin permiso de portapapeles */ }
  };

  return (
    <div className="max-w-lg mx-auto pb-10">
      <header className="flex items-center gap-3 px-4 pt-6 pb-4">
        <button onClick={() => router.back()} className="-m-1.5 min-w-[44px] min-h-[44px] flex items-center justify-center text-faint"><ArrowLeft size={20} /></button>
        <div>
          <h1 className="text-lg font-display font-bold">🩺 Diagnóstico</h1>
          <p className="text-xs text-muted">Dónde se traba la app</p>
        </div>
      </header>

      <div className="px-4 space-y-3">
        <button
          onClick={() => void run()}
          disabled={running}
          className="w-full flex items-center justify-center gap-2 py-3 bg-brand-500 text-white font-semibold rounded-xl disabled:opacity-50 active:scale-[0.98] transition"
        >
          <Play size={16} /> {running ? 'Midiendo...' : 'Ejecutar diagnóstico'}
        </button>

        {steps.length > 0 && (
          <>
            <div className="bg-surface rounded-2xl border border-line shadow-sm divide-y divide-line">
              {steps.map(s => (
                <div key={s.name} className="flex items-start gap-3 px-4 py-2.5">
                  <span className={`text-sm mt-0.5 ${s.ok ? 'text-green-500' : 'text-red-500'}`}>
                    {s.ok ? '●' : '✕'}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium">{s.name}</p>
                    <p className="text-[0.7rem] text-faint break-words">{s.detail}</p>
                  </div>
                  <span className={`text-xs font-mono shrink-0 ${
                    s.ms > 5000 ? 'text-red-500 font-bold'
                    : s.ms > 1500 ? 'text-yellow-600' : 'text-faint'
                  }`}>
                    {s.ms}ms
                  </span>
                </div>
              ))}
            </div>

            {/* Por qué cada plan entra o no en el listado */}
            {plans.length > 0 && (
              <div className="bg-surface rounded-2xl border border-line shadow-sm overflow-hidden">
                <p className="px-4 py-2 text-xs font-bold bg-canvas border-b border-line">
                  Planes que ve tu sesión · hoy = {today()}
                </p>
                {plans.map(p => {
                  const okStatus = p.status === 'open';
                  const okVis = p.visibility === 'public';
                  const okDate = p.plan_date >= today();
                  const shown = okStatus && okVis && okDate;
                  return (
                    <div key={p.id} className="px-4 py-2 border-b border-gray-50 last:border-0">
                      <div className="flex items-center gap-2">
                        <span className={shown ? 'text-green-500' : 'text-red-500'}>{shown ? '●' : '✕'}</span>
                        <p className="text-sm font-medium truncate flex-1">{p.title}</p>
                      </div>
                      <p className="text-[0.65rem] text-faint ml-6">
                        <span className={okDate ? '' : 'text-red-500 font-bold'}>{p.plan_date}</span>
                        {' · '}
                        <span className={okStatus ? '' : 'text-red-500 font-bold'}>{p.status}</span>
                        {' · '}
                        <span className={okVis ? '' : 'text-red-500 font-bold'}>{p.visibility}</span>
                        {!p.category_id && ' · sin categoría'}
                      </p>
                    </div>
                  );
                })}
              </div>
            )}

            {!running && (
              <button
                onClick={() => void copy()}
                className="w-full flex items-center justify-center gap-2 py-2.5 bg-subtle text-muted rounded-xl text-sm font-medium"
              >
                {copied ? <><Check size={14} /> Copiado</> : <><Copy size={14} /> Copiar resultado</>}
              </button>
            )}
          </>
        )}

        <div className="bg-canvas rounded-xl p-3 text-[0.7rem] text-muted leading-relaxed">
          <p className="font-medium text-muted mb-1">Cómo leerlo</p>
          <p>Si <b>&quot;Conexión a internet&quot;</b> ya tarda, es la red del teléfono.</p>
          <p>Si la <b>consulta simple</b> anda y el <b>feed</b> no, es esa consulta.</p>
          <p>Si <b>todo</b> tarda parecido, es la conexión con Supabase.</p>
          <p>Si se traba en <b>&quot;Sesión&quot;</b>, es el lock de auth.</p>
        </div>

        <p className="text-[0.6rem] text-faint text-center font-mono">
          build {process.env.NEXT_PUBLIC_BUILD_ID} · {process.env.NEXT_PUBLIC_BUILD_DATE}
        </p>
      </div>
    </div>
  );
}
