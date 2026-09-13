'use client';

import { Plus, X, Users, Clock, Info } from 'lucide-react';
import { DISCOUNT_TYPES, WEEKDAYS, tierLabel, type CampaignTier, type DiscountType } from '@/lib/offers';

export interface OfferDraft {
  tiers: CampaignTier[];
  valid_weekdays: number[] | null;
  valid_from_time: string;
  valid_until_time: string;
  max_redemptions_total: string;
  terms: string;
}

export const emptyOffer: OfferDraft = {
  tiers: [{ min_people: 1, discount_type: 'percent', discount_value: 10, label: null }],
  valid_weekdays: null,
  valid_from_time: '',
  valid_until_time: '',
  max_redemptions_total: '',
  terms: '',
};

/**
 * Editor de la oferta: escalones por tamaño de grupo + condiciones.
 *
 * Reemplaza al campo `price_text` de texto libre, que nadie podía
 * interpretar. Con esto la promo del ejemplo —"café 45% off si vienen 3 o
 * más hasta las 19"— queda expresada en datos: un escalón de 3 personas al
 * 45% y una franja horaria que termina a las 19:00.
 */
export function OfferEditor({
  value,
  onChange,
  maxTiers = 1,
  planName,
}: {
  value: OfferDraft;
  onChange: (next: OfferDraft) => void;
  maxTiers?: number;
  planName?: string;
}) {
  const set = (patch: Partial<OfferDraft>) => onChange({ ...value, ...patch });

  const setTier = (i: number, patch: Partial<CampaignTier>) => {
    const tiers = value.tiers.map((t, idx) => (idx === i ? { ...t, ...patch } : t));
    set({ tiers });
  };

  const addTier = () => {
    const last = value.tiers.at(-1);
    set({
      tiers: [...value.tiers, {
        min_people: (last?.min_people ?? 1) + 2,
        discount_type: last?.discount_type ?? 'percent',
        discount_value: Math.min(70, (last?.discount_value ?? 10) + 15),
        label: null,
      }],
    });
  };

  const removeTier = (i: number) =>
    set({ tiers: value.tiers.filter((_, idx) => idx !== i) });

  const toggleDay = (d: number) => {
    const cur = value.valid_weekdays ?? [0, 1, 2, 3, 4, 5, 6];
    const next = cur.includes(d) ? cur.filter(x => x !== d) : [...cur, d].sort();
    set({ valid_weekdays: next.length === 7 ? null : next });
  };

  const canAdd = value.tiers.length < maxTiers;
  const days = value.valid_weekdays ?? [0, 1, 2, 3, 4, 5, 6];

  return (
    <div className="space-y-5">
      {/* ── Escalones ── */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <label className="text-sm font-medium text-gray-700">🎁 Beneficio según el grupo</label>
          {canAdd ? (
            <button type="button" onClick={addTier}
              className="flex items-center gap-1 text-xs font-medium text-brand-500 bg-brand-50 px-2.5 py-1 rounded-full">
              <Plus size={12} /> Escalón
            </button>
          ) : maxTiers === 1 ? (
            <span className="text-[0.65rem] text-gray-400">
              {planName ? `Plan ${planName}: 1 escalón` : '1 escalón'}
            </span>
          ) : null}
        </div>

        <p className="text-xs text-gray-400 mb-3 flex items-start gap-1.5">
          <Info size={12} className="mt-0.5 shrink-0" />
          Cuanto más grande el grupo, mejor el beneficio. Es lo que empuja a la gente
          a invitar a otros en vez de venir sola.
        </p>

        <div className="space-y-2">
          {value.tiers.map((tier, i) => {
            const typeInfo = DISCOUNT_TYPES.find(t => t.value === tier.discount_type);
            return (
              <div key={i} className="bg-gray-50 rounded-xl p-3 space-y-2.5">
                <div className="flex items-center gap-2">
                  <Users size={14} className="text-gray-400 shrink-0" />
                  <input
                    type="number" min={1} max={50}
                    value={tier.min_people}
                    onChange={e => setTier(i, { min_people: Math.max(1, parseInt(e.target.value) || 1) })}
                    className="w-16 px-2 py-1.5 rounded-lg border border-gray-200 text-sm text-center"
                  />
                  <span className="text-sm text-gray-500 flex-1">
                    {tier.min_people === 1 ? 'persona o más' : 'personas o más'}
                  </span>
                  {value.tiers.length > 1 && (
                    <button type="button" onClick={() => removeTier(i)} className="p-1 text-gray-300 hover:text-red-400">
                      <X size={14} />
                    </button>
                  )}
                </div>

                <div className="flex gap-2">
                  <select
                    value={tier.discount_type}
                    onChange={e => setTier(i, {
                      discount_type: e.target.value as DiscountType,
                      discount_value: DISCOUNT_TYPES.find(t => t.value === e.target.value)?.needsValue
                        ? (tier.discount_value ?? 10) : null,
                    })}
                    className="flex-1 px-2.5 py-1.5 rounded-lg border border-gray-200 text-sm bg-white"
                  >
                    {DISCOUNT_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                  </select>

                  {typeInfo?.needsValue && (
                    <input
                      type="number" min={0}
                      value={tier.discount_value ?? ''}
                      onChange={e => setTier(i, { discount_value: parseFloat(e.target.value) || 0 })}
                      className="w-24 px-2.5 py-1.5 rounded-lg border border-gray-200 text-sm"
                      placeholder={tier.discount_type === 'percent' ? '45' : '1500'}
                    />
                  )}
                </div>

                <p className="text-[0.7rem] text-gray-400">
                  El cliente ve: <b className="text-brand-600">
                    {tierLabel(tier.discount_type, tier.discount_value)}
                  </b>
                  {tier.min_people > 1 && ` viniendo ${tier.min_people} o más`}
                </p>
              </div>
            );
          })}
        </div>
      </div>

      {/* ── Días ── */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">📅 Días que aplica</label>
        <div className="flex gap-1.5">
          {WEEKDAYS.map(d => {
            const on = days.includes(d.value);
            return (
              <button key={d.value} type="button" onClick={() => toggleDay(d.value)}
                title={d.label}
                className={`w-9 h-9 rounded-full text-xs font-bold transition ${
                  on ? 'bg-brand-500 text-white' : 'bg-gray-100 text-gray-400'
                }`}>
                {d.short}
              </button>
            );
          })}
        </div>
        {value.valid_weekdays === null && (
          <p className="text-[0.7rem] text-gray-400 mt-1.5">Todos los días</p>
        )}
      </div>

      {/* ── Franja horaria ── */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          <Clock size={13} className="inline mr-1" /> Franja horaria
        </label>
        <div className="flex items-center gap-2">
          <input type="time" value={value.valid_from_time}
            onChange={e => set({ valid_from_time: e.target.value })}
            className="flex-1 px-3 py-2 rounded-xl border border-gray-200 text-sm" />
          <span className="text-gray-400 text-sm">a</span>
          <input type="time" value={value.valid_until_time}
            onChange={e => set({ valid_until_time: e.target.value })}
            className="flex-1 px-3 py-2 rounded-xl border border-gray-200 text-sm" />
        </div>
        <p className="text-[0.7rem] text-gray-400 mt-1.5">
          Dejalo vacío para que aplique a cualquier hora. Ideal para llenar las
          horas flojas: &quot;hasta las 19&quot; mueve gente a la tarde.
        </p>
      </div>

      {/* ── Cupo ── */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">🎟️ Cupo total (opcional)</label>
        <input type="number" min={1} value={value.max_redemptions_total}
          onChange={e => set({ max_redemptions_total: e.target.value })}
          placeholder="Sin límite"
          className="w-full px-4 py-2.5 rounded-xl border border-gray-200 text-sm" />
        <p className="text-[0.7rem] text-gray-400 mt-1.5">
          Cuántas veces se puede canjear en total. Un cupo chico genera urgencia.
        </p>
      </div>

      {/* ── Letra chica ── */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">📋 Condiciones</label>
        <textarea value={value.terms} rows={2}
          onChange={e => set({ terms: e.target.value })}
          placeholder="Ej: No acumulable con otras promos. No incluye bebidas alcohólicas."
          className="w-full px-4 py-2.5 rounded-xl border border-gray-200 text-sm" />
      </div>
    </div>
  );
}
