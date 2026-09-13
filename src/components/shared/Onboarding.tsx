'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { X } from 'lucide-react';
import { tap, exito } from '@/lib/haptics';

/**
 * Primeros pasos.
 *
 * Alguien se registraba y caía en una home con tarjetas de promos, sin nada
 * que explicara qué es un "plan" ni por qué le convendría armar uno. Es el
 * momento de mayor abandono en cualquier app social: si en los primeros
 * diez segundos no se entiende para qué sirve, no hay segunda visita.
 *
 * Tres pantallas, salteable desde la primera, y termina en una acción
 * concreta en vez de en un "Empezar" que no lleva a ningún lado. Se muestra
 * una sola vez y la marca es local: no vale la pena una columna en la base
 * para esto, y si alguien reinstala, volver a verlo tampoco molesta.
 */

const CLAVE = 'pinto-onboarding-visto';

const PASOS = [
  {
    emoji: '🔥',
    titulo: 'Promos de acá',
    texto: 'Bares, cafés y comercios de Catamarca publican descuentos reales. Sin cupones raros ni letra chica.',
  },
  {
    emoji: '🤝',
    titulo: 'Los planes son el truco',
    texto: 'Muchas promos mejoran si van varios: 45 % en vez de 20 % si sos tres. Armás un plan, se suma gente y el descuento sube.',
  },
  {
    emoji: '🎟️',
    titulo: 'Mostrás el QR y listo',
    texto: 'Llegás al lugar, mostrás el código desde la app y te lo validan ahí mismo. No hay que imprimir nada.',
  },
];

export function Onboarding() {
  const router = useRouter();
  const [abierto, setAbierto] = useState(false);
  const [paso, setPaso] = useState(0);

  useEffect(() => {
    try {
      if (!localStorage.getItem(CLAVE)) setAbierto(true);
    } catch {
      // Storage bloqueado: no se muestra. Mejor eso que mostrarlo siempre.
    }
  }, []);

  const cerrar = () => {
    setAbierto(false);
    try { localStorage.setItem(CLAVE, '1'); } catch { /* ya está */ }
  };

  if (!abierto) return null;

  const ultimo = paso === PASOS.length - 1;
  const actual = PASOS[paso];

  return (
    <div className="fixed inset-0 z-[60] bg-canvas flex flex-col">
      <div className="flex justify-end p-3">
        <button
          onClick={() => { void tap(); cerrar(); }}
          aria-label="Saltar presentación"
          className="min-w-[44px] min-h-[44px] flex items-center justify-center text-faint"
        >
          <X size={20} />
        </button>
      </div>

      <div className="flex-1 flex flex-col items-center justify-center px-8 text-center">
        <span className="text-6xl mb-6" aria-hidden>{actual.emoji}</span>
        <h2 className="text-2xl font-display font-bold text-ink mb-3">{actual.titulo}</h2>
        <p className="text-sm text-muted leading-relaxed max-w-xs">{actual.texto}</p>
      </div>

      <div className="px-8 pb-10 space-y-5">
        <div className="flex justify-center gap-1.5" aria-hidden>
          {PASOS.map((_, i) => (
            <span
              key={i}
              className={`h-1.5 rounded-full transition-all ${
                i === paso ? 'w-6 bg-brand-500' : 'w-1.5 bg-line-strong'
              }`}
            />
          ))}
        </div>

        <button
          onClick={() => {
            void tap();
            if (!ultimo) { setPaso(p => p + 1); return; }
            void exito();
            cerrar();
            // Termina en algo concreto: el error clásico es cerrar el
            // onboarding y devolver a la misma pantalla vacía de antes.
            router.push('/planes');
          }}
          className="w-full min-h-[52px] py-3.5 bg-brand-500 text-white font-bold rounded-2xl active:scale-[0.98] transition shadow-lg shadow-brand-500/25"
        >
          {ultimo ? 'Ver qué hay hoy' : 'Siguiente'}
        </button>

        {!ultimo && (
          <button
            onClick={() => { void tap(); cerrar(); }}
            className="w-full min-h-[44px] text-sm font-medium text-faint"
          >
            Saltar
          </button>
        )}
      </div>
    </div>
  );
}
