'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { RefreshCw } from 'lucide-react';
import { golpe } from '@/lib/haptics';

/**
 * Tirar para refrescar.
 *
 * Es el gesto universal en móvil y la app no lo tenía en ningún lado. Había
 * botones de "Actualizar", pero nadie los busca: la mano ya sabe tirar hacia
 * abajo, y cuando no pasa nada la app se siente muerta.
 *
 * Se implementa a mano porque las páginas scrollean en el <body> (no hay un
 * contenedor con overflow) y porque `overscroll-behavior: none` —que está
 * puesto para que el WebView no haga el rebote de Android— desactiva
 * cualquier solución nativa.
 */

const UMBRAL = 70;      // cuánto hay que tirar para que dispare
const TOPE = 110;       // hasta dónde sigue al dedo, para que no se estire infinito

export function PullToRefresh({
  onRefresh,
  children,
}: {
  onRefresh: () => Promise<unknown> | void;
  children: ReactNode;
}) {
  const [tirando, setTirando] = useState(0);
  const [refrescando, setRefrescando] = useState(false);
  const inicioY = useRef<number | null>(null);
  const yaVibro = useRef(false);

  useEffect(() => {
    const alEmpezar = (e: TouchEvent) => {
      // Sólo cuenta si ya estamos arriba de todo: si no, el gesto es scroll.
      if (window.scrollY > 0 || refrescando) { inicioY.current = null; return; }
      inicioY.current = e.touches[0].clientY;
      yaVibro.current = false;
    };

    const alMover = (e: TouchEvent) => {
      if (inicioY.current === null) return;
      const delta = e.touches[0].clientY - inicioY.current;
      if (delta <= 0) { setTirando(0); return; }

      // Resistencia: cuanto más se tira, menos acompaña. Da la sensación de
      // elástico en vez de la de arrastrar una caja.
      const seguido = Math.min(TOPE, delta * 0.5);
      setTirando(seguido);

      if (seguido >= UMBRAL && !yaVibro.current) {
        yaVibro.current = true;
        void golpe();   // avisa con el dedo que soltando ya refresca
      }
    };

    const alSoltar = async () => {
      const llego = tirando >= UMBRAL;
      inicioY.current = null;
      setTirando(0);
      if (!llego || refrescando) return;

      setRefrescando(true);
      try {
        await onRefresh();
      } finally {
        setRefrescando(false);
      }
    };

    document.addEventListener('touchstart', alEmpezar, { passive: true });
    document.addEventListener('touchmove', alMover, { passive: true });
    document.addEventListener('touchend', alSoltar, { passive: true });
    document.addEventListener('touchcancel', alSoltar, { passive: true });
    return () => {
      document.removeEventListener('touchstart', alEmpezar);
      document.removeEventListener('touchmove', alMover);
      document.removeEventListener('touchend', alSoltar);
      document.removeEventListener('touchcancel', alSoltar);
    };
  }, [tirando, refrescando, onRefresh]);

  const visible = refrescando || tirando > 0;
  const listo = tirando >= UMBRAL;

  return (
    <div className="relative">
      {/* El indicador no empuja el contenido: se superpone y el contenido
          acompaña apenas, para que el gesto se sienta conectado. */}
      <div
        className="absolute inset-x-0 top-0 flex justify-center pointer-events-none z-10"
        style={{
          transform: `translateY(${refrescando ? 12 : tirando - 32}px)`,
          opacity: visible ? 1 : 0,
          transition: tirando === 0 ? 'transform .25s ease, opacity .25s ease' : 'opacity .15s',
        }}
      >
        <span className="w-9 h-9 rounded-full bg-surface border border-line shadow-md flex items-center justify-center">
          <RefreshCw
            size={16}
            className={`${refrescando ? 'animate-spin text-brand-500' : listo ? 'text-brand-500' : 'text-faint'}`}
            style={{ transform: refrescando ? undefined : `rotate(${tirando * 3}deg)` }}
          />
        </span>
      </div>

      <div
        style={{
          transform: `translateY(${refrescando ? 24 : tirando * 0.35}px)`,
          transition: tirando === 0 ? 'transform .25s ease' : undefined,
        }}
      >
        {children}
      </div>
    </div>
  );
}
