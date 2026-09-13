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

/** Ejecuta un paso midiendo el tiempo, sin que un fallo corte la corrida. */
async function timed(name: string, fn: () => Promise<string>): Promise<Step> {
  const t0 = performance.now();
  try {
    const detail = await fn();
    return { name, detail, ms: Math.round(performance.now() - t0), ok: true };
  } catch (err) {
    return {
      name,
      detail: err instanceof Error ? err.message : String(err),
      ms: Math.round(performance.now() - t0),
      ok: false,
    };
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
        <button onClick={() => router.back()} className="p-1.5 text-gray-400"><ArrowLeft size={20} /></button>
        <div>
          <h1 className="text-lg font-display font-bold">🩺 Diagnóstico</h1>
          <p className="text-xs text-gray-500">Dónde se traba la app</p>
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
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm divide-y divide-gray-50">
              {steps.map(s => (
                <div key={s.name} className="flex items-start gap-3 px-4 py-2.5">
                  <span className={`text-sm mt-0.5 ${s.ok ? 'text-green-500' : 'text-red-500'}`}>
                    {s.ok ? '●' : '✕'}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium">{s.name}</p>
                    <p className="text-[0.7rem] text-gray-400 break-words">{s.detail}</p>
                  </div>
                  <span className={`text-xs font-mono shrink-0 ${
                    s.ms > 5000 ? 'text-red-500 font-bold'
                    : s.ms > 1500 ? 'text-yellow-600' : 'text-gray-400'
                  }`}>
                    {s.ms}ms
                  </span>
                </div>
              ))}
            </div>

            {/* Por qué cada plan entra o no en el listado */}
            {plans.length > 0 && (
              <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                <p className="px-4 py-2 text-xs font-bold bg-gray-50 border-b border-gray-100">
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
                      <p className="text-[0.65rem] text-gray-400 ml-6">
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
                className="w-full flex items-center justify-center gap-2 py-2.5 bg-gray-100 text-gray-600 rounded-xl text-sm font-medium"
              >
                {copied ? <><Check size={14} /> Copiado</> : <><Copy size={14} /> Copiar resultado</>}
              </button>
            )}
          </>
        )}

        <div className="bg-gray-50 rounded-xl p-3 text-[0.7rem] text-gray-500 leading-relaxed">
          <p className="font-medium text-gray-600 mb-1">Cómo leerlo</p>
          <p>Si <b>&quot;Conexión a internet&quot;</b> ya tarda, es la red del teléfono.</p>
          <p>Si la <b>consulta simple</b> anda y el <b>feed</b> no, es esa consulta.</p>
          <p>Si <b>todo</b> tarda parecido, es la conexión con Supabase.</p>
          <p>Si se traba en <b>&quot;Sesión&quot;</b>, es el lock de auth.</p>
        </div>

        <p className="text-[0.6rem] text-gray-300 text-center font-mono">
          build {process.env.NEXT_PUBLIC_BUILD_ID} · {process.env.NEXT_PUBLIC_BUILD_DATE}
        </p>
      </div>
    </div>
  );
}
