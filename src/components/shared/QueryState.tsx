'use client';

import { RefreshCw } from 'lucide-react';
import type { ReactNode } from 'react';

/**
 * Estado de una consulta: cargando / error / vacío / contenido.
 *
 * Antes cada pantalla hacía `isLoading ? <spinner/> : !data?.length ? <vacío/> : ...`.
 * Sin rama de error, un fallo de red o de RLS se dibujaba igual que "no hay
 * nada": el usuario no se enteraba de que algo había salido mal y no tenía
 * forma de reintentar. Con las consultas ya propagando el error (ver
 * src/lib/sb.ts), esto lo hace visible y accionable.
 */
export function QueryState({
  isLoading,
  error,
  isEmpty,
  onRetry,
  isRetrying,
  loadingText,
  emptyIcon = '🫙',
  emptyTitle = 'No hay nada por acá',
  emptyText,
  children,
}: {
  isLoading: boolean;
  error?: unknown;
  isEmpty?: boolean;
  onRetry?: () => void;
  isRetrying?: boolean;
  loadingText?: string;
  emptyIcon?: ReactNode;
  emptyTitle?: string;
  emptyText?: string;
  children: ReactNode;
}) {
  if (isLoading) {
    return (
      <div className="flex flex-col items-center py-16 text-gray-400">
        <div className="spinner" />
        {loadingText && <p className="mt-3 text-sm">{loadingText}</p>}
      </div>
    );
  }

  if (error) {
    const message = error instanceof Error ? error.message : 'Algo salió mal';
    return (
      <div className="text-center py-16 px-6">
        <p className="text-4xl mb-3">😕</p>
        <p className="text-gray-700 font-medium">No se pudo cargar</p>
        <p className="text-xs text-gray-400 mt-1 break-words">{message}</p>
        {onRetry && (
          <button
            onClick={onRetry}
            disabled={isRetrying}
            className="mt-4 inline-flex items-center gap-2 px-5 py-2.5 bg-brand-500 text-white rounded-xl font-medium text-sm disabled:opacity-50 active:scale-95 transition"
          >
            <RefreshCw size={14} className={isRetrying ? 'animate-spin' : ''} />
            {isRetrying ? 'Reintentando...' : 'Reintentar'}
          </button>
        )}
      </div>
    );
  }

  if (isEmpty) {
    return (
      <div className="text-center py-16 text-gray-400 px-6">
        <p className="text-4xl mb-3">{emptyIcon}</p>
        <p className="font-medium text-gray-500">{emptyTitle}</p>
        {emptyText && <p className="text-sm mt-1">{emptyText}</p>}
      </div>
    );
  }

  return <>{children}</>;
}
