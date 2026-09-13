'use client';

import { Users, Clock, Ticket, Check } from 'lucide-react';
import { tierLabel, describeConditions, type CampaignTier } from '@/lib/offers';

/**
 * La escalera de descuentos de una promo, con el grupo actual marcado.
 *
 * Es el corazón de la propuesta de Pintó: el beneficio crece con el tamaño
 * del grupo, así que a la persona le conviene invitar gente. Un cupón
 * individual no necesita una app social; esto sí.
 */
export function OfferLadder({
  tiers,
  partySize,
  conditions,
  compact = false,
}: {
  tiers: CampaignTier[];
  partySize: number;
  conditions?: {
    valid_weekdays?: number[] | null;
    valid_from_time?: string | null;
    valid_until_time?: string | null;
    terms?: string | null;
  };
  compact?: boolean;
}) {
  if (!tiers.length) return null;

  const sorted = [...tiers].sort((a, b) => a.min_people - b.min_people);
  const reached = sorted.filter(t => t.min_people <= partySize);
  const current = reached.at(-1) ?? null;
  const next = sorted.find(t => t.min_people > partySize) ?? null;
  const cond = conditions ? describeConditions(conditions) : [];

  return (
    <div className="bg-surface rounded-2xl border border-line shadow-sm overflow-hidden">
      <div className="px-4 py-3 bg-gradient-to-r from-brand-500 to-accent-500 text-white">
        <div className="flex items-center gap-2">
          <Ticket size={16} />
          <p className="text-sm font-bold">
            {current ? current.label || tierLabel(current.discount_type, current.discount_value) : 'Beneficio por grupo'}
          </p>
        </div>
        {next && (
          <p className="text-xs text-white/90 mt-0.5">
            {next.min_people - partySize === 1
              ? 'Falta 1 persona más'
              : `Faltan ${next.min_people - partySize} personas`}
            {' '}para {next.label || tierLabel(next.discount_type, next.discount_value)}
          </p>
        )}
      </div>

      <div className="divide-y divide-line">
        {sorted.map(tier => {
          const isReached = tier.min_people <= partySize;
          const isCurrent = current?.min_people === tier.min_people;
          return (
            <div
              key={tier.min_people}
              className={`flex items-center gap-3 px-4 py-2.5 ${isCurrent ? 'bg-brand-50/60' : ''}`}
            >
              <div
                className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 ${
                  isReached ? 'bg-brand-500 text-white' : 'bg-subtle text-faint'
                }`}
              >
                {isReached ? <Check size={14} /> : <Users size={13} />}
              </div>
              <p className={`text-sm flex-1 ${isReached ? 'text-ink font-medium' : 'text-faint'}`}>
                {tier.min_people === 1 ? 'Viniendo solo' : `${tier.min_people} o más personas`}
              </p>
              <span
                className={`text-sm font-bold ${isReached ? 'text-brand-600' : 'text-faint'}`}
              >
                {tier.label || tierLabel(tier.discount_type, tier.discount_value)}
              </span>
            </div>
          );
        })}
      </div>

      {!compact && (cond.length > 0 || conditions?.terms) && (
        <div className="px-4 py-2.5 bg-canvas/70 border-t border-line">
          {cond.length > 0 && (
            <p className="text-[0.7rem] text-muted flex items-start gap-1.5">
              <Clock size={11} className="mt-0.5 shrink-0" />
              <span>Válido {cond.join(', ')}</span>
            </p>
          )}
          {conditions?.terms && (
            <p className="text-[0.65rem] text-faint mt-1">{conditions.terms}</p>
          )}
        </div>
      )}
    </div>
  );
}

/** Chip compacto para listados: solo el mejor beneficio disponible. */
export function OfferBadge({ tiers }: { tiers: CampaignTier[] }) {
  if (!tiers.length) return null;
  const best = [...tiers].sort((a, b) => b.min_people - a.min_people)[0];
  const label = best.label || tierLabel(best.discount_type, best.discount_value);
  return (
    <span className="text-[0.65rem] font-bold px-2 py-0.5 rounded-full bg-brand-500 text-white">
      {label}
      {best.min_people > 1 && <span className="font-normal"> · {best.min_people}+</span>}
    </span>
  );
}
