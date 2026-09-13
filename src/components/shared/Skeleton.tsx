'use client';

/**
 * Esqueletos de carga.
 *
 * No aceleran nada, pero hacen que la app se sienta bastante más rápida: en
 * vez de una rueda sin información, muestran la FORMA de lo que está por
 * llegar. El ojo ya sabe dónde va a estar el título y dónde la foto, así que
 * cuando aparecen los datos no hay que releer la pantalla.
 *
 * Una rueda, además, no dice cuánto falta ni cuánto va a aparecer. Tres
 * tarjetas fantasma dicen las dos cosas.
 *
 * La animación vive en globals.css (.skeleton) para que use los tokens del
 * tema y funcione igual en claro y en oscuro.
 */

function Barra({ className = '' }: { className?: string }) {
  return <div className={`skeleton ${className}`} />;
}

/** Tarjeta de plan o de promo: foto, título, dos líneas de metadatos. */
export function SkeletonTarjeta() {
  return (
    <div className="bg-surface rounded-2xl border border-line p-3 shadow-sm">
      <div className="flex gap-3">
        <Barra className="w-16 h-16 rounded-xl shrink-0" />
        <div className="flex-1 space-y-2 py-0.5">
          <Barra className="h-4 w-3/4" />
          <Barra className="h-3 w-1/2" />
          <div className="flex gap-2 pt-1">
            <Barra className="h-3 w-16" />
            <Barra className="h-3 w-12" />
          </div>
        </div>
      </div>
    </div>
  );
}

/** Fila de lista: avatar redondo y dos líneas. */
export function SkeletonFila() {
  return (
    <div className="flex items-center gap-3 p-3 bg-surface rounded-xl border border-line">
      <Barra className="w-9 h-9 rounded-full shrink-0" />
      <div className="flex-1 space-y-2">
        <Barra className="h-3.5 w-2/3" />
        <Barra className="h-3 w-1/3" />
      </div>
    </div>
  );
}

/** Burbujas de chat, alternadas. */
export function SkeletonChat() {
  return (
    <div className="space-y-3 py-2">
      {[0, 1, 2, 3].map(i => (
        <div key={i} className={`flex ${i % 2 ? 'justify-end' : 'justify-start'}`}>
          <Barra className={`h-10 rounded-2xl ${i % 2 ? 'w-1/2' : 'w-2/3'}`} />
        </div>
      ))}
    </div>
  );
}

/**
 * Varios de una. `cuantos` por defecto es 3: alcanza para que se lea como
 * una lista y no tanto como para que la pantalla parezca llena de nada.
 */
export function SkeletonLista({
  cuantos = 3,
  variante = 'tarjeta',
}: {
  cuantos?: number;
  variante?: 'tarjeta' | 'fila';
}) {
  const Item = variante === 'fila' ? SkeletonFila : SkeletonTarjeta;
  return (
    <div className="space-y-2" aria-busy="true" aria-live="polite">
      <span className="sr-only">Cargando…</span>
      {Array.from({ length: cuantos }, (_, i) => <Item key={i} />)}
    </div>
  );
}
