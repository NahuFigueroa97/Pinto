'use client';

import { Sun, Moon, Smartphone } from 'lucide-react';
import { useTema, type Tema } from '@/lib/theme';
import { tap } from '@/lib/haptics';

/**
 * Claro / Oscuro / Automático.
 *
 * Tres opciones y no un interruptor: "automático" respeta lo que la persona
 * ya configuró en el teléfono y sigue cambiando sola al anochecer. Un
 * interruptor de dos posiciones obliga a decidir para siempre y rompe esa
 * expectativa.
 *
 * Es el valor por defecto a propósito: la mayoría nunca entra acá, y lo
 * correcto es que la app se parezca al resto de su teléfono.
 */

const OPCIONES: { valor: Tema; label: string; Icono: typeof Sun }[] = [
  { valor: 'light',  label: 'Claro',      Icono: Sun },
  { valor: 'dark',   label: 'Oscuro',     Icono: Moon },
  { valor: 'system', label: 'Automático', Icono: Smartphone },
];

export function SelectorTema() {
  const { tema, setTema } = useTema();

  return (
    <div className="p-4 bg-surface rounded-xl border border-line shadow-sm">
      <div className="flex items-center gap-3 mb-3">
        <span className="text-xl">🌓</span>
        <div>
          <span className="font-medium text-sm block text-ink">Apariencia</span>
          <span className="text-[0.6rem] text-faint">Cómo se ve Pintó</span>
        </div>
      </div>

      <div role="radiogroup" aria-label="Apariencia" className="grid grid-cols-3 gap-2">
        {OPCIONES.map(({ valor, label, Icono }) => {
          const activo = tema === valor;
          return (
            <button
              key={valor}
              role="radio"
              aria-checked={activo}
              onClick={() => { void tap(); setTema(valor); }}
              className={`flex flex-col items-center justify-center gap-1 min-h-[64px] rounded-xl border text-[0.7rem] font-medium transition-all active:scale-95
                ${activo
                  ? 'bg-brand-500 text-white border-brand-500 shadow-md shadow-brand-500/20'
                  : 'bg-canvas text-muted border-line'}`}
            >
              <Icono size={18} />
              {label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
