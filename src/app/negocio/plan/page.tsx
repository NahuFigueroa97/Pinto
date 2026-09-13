'use client';

import { useRouter } from 'next/navigation';
import { ArrowLeft, Check, Zap } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import { useQuery } from '@tanstack/react-query';
import { sb } from '@/lib/sb';
import { formatMoney } from '@/lib/money';
import { PageSpinner } from '@/components/shared/PageSpinner';

/**
 * Planes de suscripción del negocio.
 *
 * `pricing_plans` y `business_subscriptions` existían desde la primera
 * migración y nadie las leía: la parte monetaria de la app era una tabla
 * vacía. La migración 014 empezó a enforzar los límites; esta pantalla es
 * donde el negocio ve qué le da cada plan.
 *
 * El cobro en sí todavía no está: no hay pasarela de pagos integrada. El
 * botón deja la solicitud registrada para que la resuelvas a mano mientras
 * tanto. Ver docs/MONETIZACION.md.
 */

interface PricingPlan {
  id: string;
  name: string;
  slug: string;
  price_monthly: number;
  max_campaigns: number | null;
  max_featured: number | null;
  features: Record<string, unknown> | null;
}

const BENEFITS: Record<string, string[]> = {
  free: [
    '2 promos activas a la vez',
    '1 escalón de descuento por promo',
    'Reservas y check-in con QR',
    'Mensajes con clientes',
  ],
  starter: [
    '10 promos activas',
    'Hasta 3 escalones por promo',
    '2 promos destacadas',
    'Programa de fidelidad',
    'Métricas de conversión',
  ],
  pro: [
    '50 promos activas',
    'Hasta 10 escalones por promo',
    '10 promos destacadas',
    'Programa de fidelidad',
    'Métricas de conversión',
    'Soporte prioritario',
  ],
};

export default function PlanNegocioPage() {
  const router = useRouter();
  const { user } = useAuth();

  const { data: business } = useQuery({
    queryKey: ['business_plan_page', user?.id],
    queryFn: async () =>
      sb(supabase.from('businesses').select('id, name').eq('owner_user_id', user!.id).maybeSingle()),
    enabled: !!user,
  });

  const { data: limits } = useQuery({
    queryKey: ['business_limits', business?.id],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('business_limits', { p_business_id: (business as any)!.id });
      if (error) throw error;
      return data as { plan: { slug: string; name: string } };
    },
    enabled: !!business,
  });

  const { data: plans, isLoading, error, refetch, isFetching } = useQuery({
    queryKey: ['pricing_plans'],
    queryFn: async () =>
      sb(supabase.from('pricing_plans').select('*').eq('is_active', true).order('price_monthly')),
  });

  const currentSlug = limits?.plan?.slug ?? 'free';

  return (
    <div className="max-w-lg mx-auto pb-10">
      <header className="flex items-center gap-3 px-4 pt-6 pb-4">
        <button onClick={() => router.back()} className="-m-1.5 min-w-[44px] min-h-[44px] flex items-center justify-center text-faint"><ArrowLeft size={20} /></button>
        <div>
          <h1 className="text-lg font-display font-bold">Planes</h1>
          <p className="text-xs text-muted">Más promos, más escalones, más alcance</p>
        </div>
      </header>

      <div className="px-4 space-y-3">
        {isLoading ? (
          <PageSpinner fullScreen={false} />
        ) : error ? (
          <div className="text-center py-16">
            <p className="text-4xl mb-3">😕</p>
            <p className="text-ink-soft font-medium">No se pudieron cargar los planes</p>
            <p className="text-xs text-faint mt-1">{(error as Error).message}</p>
            <button onClick={() => refetch()} disabled={isFetching}
              className="mt-4 px-5 py-2.5 bg-brand-500 text-white rounded-xl font-medium text-sm disabled:opacity-50">
              {isFetching ? 'Reintentando...' : 'Reintentar'}
            </button>
          </div>
        ) : (
          (plans as PricingPlan[] | null)?.map(plan => {
            const isCurrent = plan.slug === currentSlug;
            const highlight = plan.slug === 'starter';
            return (
              <div key={plan.id}
                className={`rounded-2xl border p-4 ${
                  isCurrent ? 'border-accent-400 bg-accent-50/40'
                  : highlight ? 'border-brand-300 bg-surface shadow-md'
                  : 'border-line bg-surface shadow-sm'
                }`}>
                <div className="flex items-start justify-between mb-2">
                  <div>
                    <div className="flex items-center gap-2">
                      <h2 className="font-display font-bold">{plan.name}</h2>
                      {highlight && !isCurrent && (
                        <span className="text-[0.55rem] font-bold px-2 py-0.5 rounded-full bg-brand-500 text-white">
                          RECOMENDADO
                        </span>
                      )}
                    </div>
                    <p className="text-xl font-black mt-0.5">
                      {plan.price_monthly === 0 ? 'Gratis' : formatMoney(Number(plan.price_monthly))}
                      {plan.price_monthly > 0 && <span className="text-xs font-normal text-faint"> /mes</span>}
                    </p>
                  </div>
                  {isCurrent && (
                    <span className="text-[0.6rem] font-bold px-2.5 py-1 rounded-full bg-accent-500 text-white">
                      TU PLAN
                    </span>
                  )}
                </div>

                <ul className="space-y-1.5 mt-3">
                  {(BENEFITS[plan.slug] ?? []).map(b => (
                    <li key={b} className="flex items-start gap-2 text-sm text-muted">
                      <Check size={14} className="text-green-500 mt-0.5 shrink-0" />
                      {b}
                    </li>
                  ))}
                </ul>

                {!isCurrent && plan.price_monthly > 0 && (
                  <a
                    href={`mailto:soporte@pinto.app?subject=${encodeURIComponent(
                      `Quiero el plan ${plan.name}`)}&body=${encodeURIComponent(
                      `Negocio: ${(business as any)?.name ?? ''}\nPlan: ${plan.name}\n`)}`}
                    className="mt-4 w-full flex items-center justify-center gap-2 py-2.5 bg-gradient-to-r from-brand-500 to-accent-500 text-white rounded-xl font-bold text-sm active:scale-[0.98] transition"
                  >
                    <Zap size={14} /> Quiero este plan
                  </a>
                )}
              </div>
            );
          })
        )}

        <p className="text-[0.7rem] text-faint text-center pt-2 px-4">
          Todavía no hay pago automático. Al tocar &quot;Quiero este plan&quot; nos
          escribís y lo activamos a mano en el día.
        </p>
      </div>
    </div>
  );
}
