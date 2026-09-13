'use client';

import { toAppUrl } from './navigation';

/**
 * Compartir un plan.
 *
 * La app tenía un compartir de seguridad ("avisarle a alguien dónde voy")
 * pero ninguno de invitación. En una app que vive de que la gente arme
 * juntadas, invitar ES el producto — y en Argentina el canal es WhatsApp.
 *
 * El link apunta a la web y los App Links (AndroidManifest.xml) hacen que,
 * si el que lo recibe tiene Pintó instalado, se abra la app en el plan en
 * vez del navegador. Si no la tiene, cae en la web, que es exactamente el
 * embudo de instalación que se quiere.
 */

/** Link público a un plan. Sin SITE_URL configurado, no hay nada que compartir. */
export function linkDePlan(planId: string): string | null {
  const base = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/+$/, '');
  if (!base) return null;
  return `${base}${toAppUrl(`/planes/detalle?id=${planId}`)}`;
}

interface Plan {
  id: string;
  title: string;
  plan_date: string;
  plan_time?: string | null;
  meeting_point?: string | null;
}

/**
 * Abre la hoja de compartir del sistema; si no existe, cae a WhatsApp.
 *
 * navigator.share es preferible porque deja elegir Instagram, Telegram o
 * copiar: forzar WhatsApp sería decidir por el usuario.
 */
export async function compartirPlan(plan: Plan): Promise<'ok' | 'cancelado' | 'sin-link'> {
  const link = linkDePlan(plan.id);
  if (!link) return 'sin-link';

  const cuando = new Date(`${plan.plan_date}T00:00:00`).toLocaleDateString('es-AR', {
    weekday: 'long', day: 'numeric', month: 'long',
  });

  const texto =
    `🔥 ${plan.title}\n` +
    `📅 ${cuando}${plan.plan_time ? ` a las ${plan.plan_time.slice(0, 5)}` : ''}\n` +
    (plan.meeting_point ? `📍 ${plan.meeting_point}\n` : '') +
    `\n¿Te sumás?`;

  if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
    try {
      await navigator.share({ title: plan.title, text: texto, url: link });
      return 'ok';
    } catch (err) {
      // AbortError = el usuario cerró la hoja. No es un fallo y no hay que
      // insistir abriendo WhatsApp a la fuerza.
      if ((err as Error)?.name === 'AbortError') return 'cancelado';
    }
  }

  window.open(`https://wa.me/?text=${encodeURIComponent(`${texto}\n${link}`)}`, '_blank');
  return 'ok';
}
