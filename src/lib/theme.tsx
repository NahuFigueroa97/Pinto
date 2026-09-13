'use client';

import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';

/**
 * Tema claro / oscuro / el del sistema.
 *
 * Tres estados y no dos: "sistema" es el que respeta lo que la persona ya
 * eligió en el teléfono, y tiene que seguir cambiando solo cuando anochece.
 * Un interruptor de dos posiciones obliga a elegir para siempre.
 */

export type Tema = 'light' | 'dark' | 'system';

const CLAVE = 'pinto-tema';

/**
 * Se ejecuta ANTES de que React hidrate, como primer hijo de <body>.
 *
 * Sin esto la app pinta en claro y recién después de hidratar se pone
 * oscura: un fogonazo blanco en cada arranque, que de noche encandila. Es el
 * mismo truco que usa next-themes.
 *
 * Va como string porque tiene que viajar tal cual en el HTML exportado.
 */
export const SCRIPT_ANTI_PARPADEO = `(function(){try{
var t=localStorage.getItem('${CLAVE}')||'system';
var oscuro=t==='dark'||(t==='system'&&window.matchMedia('(prefers-color-scheme: dark)').matches);
document.documentElement.classList.toggle('dark',oscuro);
}catch(e){}})();`;

interface Estado {
  tema: Tema;
  /** Lo que se está viendo de verdad, ya resuelto el "system". */
  oscuro: boolean;
  setTema: (t: Tema) => void;
}

const TemaContext = createContext<Estado | null>(null);

function esOscuro(t: Tema): boolean {
  if (t === 'dark') return true;
  if (t === 'light') return false;
  return typeof window !== 'undefined'
    && window.matchMedia('(prefers-color-scheme: dark)').matches;
}

export function TemaProvider({ children }: { children: ReactNode }) {
  // Arranca en 'system' y se corrige en el efecto: durante el prerender del
  // export estático no hay localStorage, y leerlo en el useState haría que
  // el HTML generado y el primer render del cliente no coincidan.
  const [tema, setTemaEstado] = useState<Tema>('system');
  const [oscuro, setOscuro] = useState(false);

  useEffect(() => {
    let inicial: Tema = 'system';
    try {
      const guardado = localStorage.getItem(CLAVE);
      if (guardado === 'light' || guardado === 'dark' || guardado === 'system') inicial = guardado;
    } catch { /* modo incógnito o storage bloqueado */ }
    setTemaEstado(inicial);
    setOscuro(esOscuro(inicial));
  }, []);

  // Con 'system', seguir al sistema en vivo: si el teléfono cambia a oscuro
  // al anochecer, la app acompaña sin reiniciarse.
  useEffect(() => {
    if (tema !== 'system' || typeof window === 'undefined') return;
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const alCambiar = () => {
      setOscuro(mq.matches);
      document.documentElement.classList.toggle('dark', mq.matches);
    };
    mq.addEventListener('change', alCambiar);
    return () => mq.removeEventListener('change', alCambiar);
  }, [tema]);

  const setTema = (t: Tema) => {
    setTemaEstado(t);
    const ahoraOscuro = esOscuro(t);
    setOscuro(ahoraOscuro);
    document.documentElement.classList.toggle('dark', ahoraOscuro);
    try { localStorage.setItem(CLAVE, t); } catch { /* no se pudo guardar */ }
  };

  return (
    <TemaContext.Provider value={{ tema, oscuro, setTema }}>
      {children}
    </TemaContext.Provider>
  );
}

export function useTema(): Estado {
  const ctx = useContext(TemaContext);
  // Sin provider no se rompe nada: devuelve un tema fijo. Que una pantalla
  // suelta no pueda cambiar el tema no justifica tirar la app abajo.
  return ctx ?? { tema: 'system', oscuro: false, setTema: () => {} };
}
