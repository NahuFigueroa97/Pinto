'use client';

import { useEffect, useRef, useState } from 'react';
import { Smile } from 'lucide-react';

/**
 * Selector de emojis.
 *
 * Un set curado en vez de una librería: las librerías de emojis pesan entre
 * 200 KB y 1 MB porque traen el catálogo Unicode entero con nombres y
 * búsqueda en varios idiomas. Esto es un APK que se baja por datos móviles
 * en Catamarca; 60 emojis bien elegidos cubren el 95% de lo que se usa en
 * un chat para organizar una juntada.
 */

const GROUPS: { name: string; icon: string; emojis: string[] }[] = [
  {
    name: 'Frecuentes', icon: '⭐',
    emojis: ['😂', '❤️', '👍', '🙌', '🔥', '😍', '😎', '🥳', '💪', '🙏', '👏', '✨'],
  },
  {
    name: 'Caras', icon: '😀',
    emojis: ['😀', '😅', '😊', '😉', '🤣', '😘', '🤔', '😴', '🤯', '😭', '😤', '🤝'],
  },
  {
    name: 'Plan', icon: '🍻',
    emojis: ['🍻', '🍺', '☕', '🍕', '🍔', '🍦', '🎉', '🎂', '🎶', '⚽', '🏃', '🚴'],
  },
  {
    name: 'Señales', icon: '📍',
    emojis: ['📍', '🕐', '📅', '✅', '❌', '⚠️', '💸', '🚗', '🚌', '☔', '☀️', '🌙'],
  },
];

export function EmojiPicker({ onPick }: { onPick: (emoji: string) => void }) {
  const [open, setOpen] = useState(false);
  const [group, setGroup] = useState(0);
  const ref = useRef<HTMLDivElement>(null);

  // Cerrar al tocar fuera. Sin esto, en mobile el panel queda abierto
  // tapando el teclado y hay que adivinar cómo sacarlo.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', onDown);
    return () => document.removeEventListener('pointerdown', onDown);
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        aria-label="Emojis"
        className={`p-2.5 rounded-xl transition ${open ? 'bg-brand-100 text-brand-600' : 'text-faint hover:text-muted'}`}
      >
        <Smile size={20} />
      </button>

      {open && (
        <div className="absolute bottom-full mb-2 left-0 w-[17.5rem] bg-surface rounded-2xl border border-line-strong shadow-xl overflow-hidden z-30">
          <div className="grid grid-cols-6 gap-1 p-2.5 max-h-44 overflow-y-auto">
            {GROUPS[group].emojis.map(e => (
              <button
                key={e}
                type="button"
                // onMouseDown en vez de onClick: el click hace que el input
                // pierda el foco y en Android se cierre el teclado entre
                // emoji y emoji.
                onMouseDown={ev => { ev.preventDefault(); onPick(e); }}
                className="text-2xl h-10 rounded-lg hover:bg-subtle active:scale-90 transition"
              >
                {e}
              </button>
            ))}
          </div>
          <div className="flex border-t border-line bg-canvas/80">
            {GROUPS.map((g, i) => (
              <button
                key={g.name}
                type="button"
                onMouseDown={ev => { ev.preventDefault(); setGroup(i); }}
                title={g.name}
                className={`flex-1 py-2 text-lg transition ${i === group ? 'bg-surface' : 'opacity-50'}`}
              >
                {g.icon}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
