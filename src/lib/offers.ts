'use client';

import { useQuery } from '@tanstack/react-query';
import { supabase } from './supabase';

/**
 * Ofertas comerciales condicionadas.
 *
 * Antes las condiciones de una promo vivían en `price_text`, texto libre:
 * "45% off viniendo 3 o más hasta las 19". Nada de eso era interpretable,
 * así que la app no podía decir cuánta gente faltaba, ni validar la franja
 * horaria, ni calcular el descuento en el mostrador.
 *
 * Ahora las condiciones son columnas y la escalera de descuentos es una
 * tabla (`campaign_tiers`). La evaluación vive en la base
 * (`campaign_offer()`), no acá: es la única forma de que el check-in y lo
 * que ve el usuario no puedan discrepar.
 */

export type DiscountType = 'percent' | 'fixed' | 'free_item' | 'two_for_one';

export interface CampaignTier {
  id?: string;
  campaign_id?: string;
  min_people: number;
  discount_type: DiscountType;
  discount_value: number | null;
  label: string | null;
}

export interface CampaignOffer {
  ok: boolean;
  error?: string;
  reasons: string[];
  party_size: number;
  local_time: string;
  timezone: string;
  tier: {
    min_people: number;
    discount_type: DiscountType;
    discount_value: number | null;
    label: string;
  } | null;
  next_tier: {
    min_people: number;
    people_missing: number;
    label: string;
  } | null;
  slots_left: number | null;
}

export const DISCOUNT_TYPES: { value: DiscountType; label: string; needsValue: boolean; hint: string }[] = [
  { value: 'percent',     label: '% de descuento', needsValue: true,  hint: 'Ej: 45 → "45% OFF"' },
  { value: 'fixed',       label: 'Monto fijo',     needsValue: true,  hint: 'Ej: 1500 → "$1.500 OFF"' },
  { value: 'two_for_one', label: '2x1',            needsValue: false, hint: 'Llevan dos, pagan uno' },
  { value: 'free_item',   label: 'Producto gratis',needsValue: false, hint: 'Ej: postre o café de cortesía' },
];

export const WEEKDAYS = [
  { value: 0, short: 'D', label: 'Domingo' },
  { value: 1, short: 'L', label: 'Lunes' },
  { value: 2, short: 'M', label: 'Martes' },
  { value: 3, short: 'M', label: 'Miércoles' },
  { value: 4, short: 'J', label: 'Jueves' },
  { value: 5, short: 'V', label: 'Viernes' },
  { value: 6, short: 'S', label: 'Sábado' },
];

/** Misma lógica que tier_label() en SQL, para previsualizar sin ir al server. */
export function tierLabel(type: DiscountType, value: number | null): string {
  switch (type) {
    case 'percent':     return `${value ?? 0}% OFF`;
    case 'fixed':       return `$${(value ?? 0).toLocaleString('es-AR')} OFF`;
    case 'two_for_one': return '2x1';
    case 'free_item':   return 'Producto gratis';
    default:            return 'Beneficio';
  }
}

/** Resume las condiciones en una línea para mostrar en la ficha. */
export function describeConditions(c: {
  valid_weekdays?: number[] | null;
  valid_from_time?: string | null;
  valid_until_time?: string | null;
}): string[] {
  const out: string[] = [];

  if (c.valid_weekdays?.length && c.valid_weekdays.length < 7) {
    const dias = [...c.valid_weekdays].sort()
      .map(d => WEEKDAYS[d]?.label ?? '')
      .filter(Boolean);
    out.push(dias.length <= 2 ? dias.join(' y ') : `${dias.slice(0, -1).join(', ')} y ${dias.at(-1)}`);
  }

  const hhmm = (t?: string | null) => (t ? t.slice(0, 5) : null);
  const from = hhmm(c.valid_from_time);
  const until = hhmm(c.valid_until_time);
  if (from && until) out.push(`de ${from} a ${until}`);
  else if (until)    out.push(`hasta las ${until}`);
  else if (from)     out.push(`desde las ${from}`);

  return out;
}

/**
 * Evalúa la oferta en el servidor para un tamaño de grupo dado.
 * Se recalcula al cambiar el grupo: es lo que permite mostrar
 * "faltan 2 personas para el 45%".
 */
export function useCampaignOffer(campaignId: string | null | undefined, partySize: number) {
  return useQuery({
    queryKey: ['campaign_offer', campaignId, partySize],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('campaign_offer', {
        p_campaign_id: campaignId,
        p_party_size: partySize,
      });
      if (error) throw error;
      return data as CampaignOffer;
    },
    enabled: !!campaignId,
    staleTime: 60_000,
  });
}

/** Escalones de una promo, de menor a mayor. */
export function useCampaignTiers(campaignId: string | null | undefined) {
  return useQuery({
    queryKey: ['campaign_tiers', campaignId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('campaign_tiers')
        .select('*')
        .eq('campaign_id', campaignId)
        .order('min_people');
      if (error) throw error;
      return (data ?? []) as CampaignTier[];
    },
    enabled: !!campaignId,
  });
}
