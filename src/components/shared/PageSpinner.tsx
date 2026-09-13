'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { RefreshCw, ArrowLeft, Home, Stethoscope } from 'lucide-react';

/**
 * Spinner de pantalla completa que NO puede quedarse girando para siempre.
 *
 * El problema no era un bug puntual sino la forma: cada pantalla hacía
 * `if (isLoading) return <spinner/>`. Si la consulta no resolvía —por el
 * lock de auth, por una petición colgada, por un fallback de <Suspense> que
 * no hidrata— el usuario se quedaba mirando la rueda sin error, sin
 * reintentar y sin forma de salir. Pasó en inicio, en actividad, en planes,
 * en el chat y en el perfil de otra persona.
 *
 * Acá el spinner tiene fecha de vencimiento: a los 10 s aparece una salida.
 * No adivina la causa —puede ser cualquiera— pero garantiza que ninguna
 * pantalla sea un callejón sin salida, que es lo que no se puede llevar a
 * producción.
 */

const SLOW_MS = 10_000;

export function PageSpinner({
  text,
  onRetry,
  fullScreen = true,
  skeleton,
}: {
  text?: string;
  /** Reintento específico de la pantalla. Sin esto se refrescan todas las consultas activas. */
  onRetry?: () => void;
  fullScreen?: boolean;
  /**
   * Esqueleto en vez de rueda.
   *
   * Se pasa por acá y no se usa suelto a propósito: un esqueleto solo
   * vuelve a ser un callejón sin salida si la consulta nunca resuelve. Así
   * hereda la salida de emergencia de los 10 s.
   */
  skeleton?: ReactNode;
}) {
  const [slow, setSlow] = useState(false);
  const router = useRouter();
  const queryClient = useQueryClient();

  useEffect(() => {
    const t = setTimeout(() => setSlow(true), SLOW_MS);
    return () => clearTimeout(t);
  }, []);

  const retry = () => {
    setSlow(false);
    if (onRetry) onRetry();
    // Sin un reintento propio, se refrescan las consultas activas de la
    // pantalla. Cubre el caso más común: la consulta quedó colgada.
    else void queryClient.refetchQueries({ type: 'active' });
  };

  if (skeleton && !slow) return <>{skeleton}</>;

  return (
    <div className={`flex flex-col items-center justify-center px-6 text-center ${fullScreen ? 'min-h-[60vh]' : 'py-16'}`}>
      {!skeleton && <div className="spinner" />}
      {text && !skeleton && <p className="mt-3 text-sm text-faint">{text}</p>}

      {slow && (
        <div className="mt-6 max-w-xs">
          <p className="text-sm font-medium text-ink-soft">Está tardando más de lo normal</p>
          <p className="text-xs text-faint mt-1">
            Puede ser tu conexión. Podés reintentar o volver.
          </p>

          <div className="flex flex-col gap-2 mt-4">
            <button
              onClick={retry}
              className="inline-flex items-center justify-center gap-2 px-5 py-2.5 bg-brand-500 text-white rounded-xl font-medium text-sm active:scale-95 transition"
            >
              <RefreshCw size={14} /> Reintentar
            </button>
            <div className="flex gap-2">
              <button
                onClick={() => router.back()}
                className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 bg-canvas text-muted rounded-xl text-xs font-medium border border-line-strong"
              >
                <ArrowLeft size={13} /> Volver
              </button>
              <button
                onClick={() => router.push('/')}
                className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 bg-canvas text-muted rounded-xl text-xs font-medium border border-line-strong"
              >
                <Home size={13} /> Inicio
              </button>
            </div>
            <button
              onClick={() => router.push('/diagnostico')}
              className="inline-flex items-center justify-center gap-1.5 text-[0.7rem] text-faint mt-1"
            >
              <Stethoscope size={12} /> Ver qué está fallando
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
