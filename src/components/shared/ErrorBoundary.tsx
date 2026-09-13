'use client';

import { Component, type ReactNode } from 'react';

/**
 * Red de contención para errores de render.
 *
 * La app no tenía NINGÚN error boundary. En React 18, un error que sube sin
 * que nadie lo atrape desmonta el árbol entero: la pantalla queda en blanco
 * o congelada en el fallback de <Suspense>, sin mensaje y sin forma de
 * salir salvo matar la app. En el navegador al menos queda el stack en la
 * consola; dentro del WebView de Capacitor, en el teléfono de alguien, no
 * queda absolutamente nada.
 *
 * Un `undefined` inesperado en cualquier `.map()` alcanzaba para eso.
 */

interface Props {
  children: ReactNode;
  /** Se muestra en vez del contenido cuando algo explota. */
  fallback?: (error: Error, reset: () => void) => ReactNode;
}

interface State {
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: { componentStack?: string | null }) {
    // Queda en logcat: `adb logcat | grep chromium` lo muestra desde el
    // teléfono, que es la única forma de verlo en la app instalada.
    console.error('[pinto] error de render:', error, info?.componentStack);
  }

  reset = () => this.setState({ error: null });

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;

    if (this.props.fallback) return this.props.fallback(error, this.reset);

    return (
      <div className="flex flex-col items-center justify-center min-h-[70vh] px-6 text-center">
        <p className="text-4xl mb-3">😵</p>
        <p className="font-medium text-gray-700">Algo se rompió en esta pantalla</p>
        <p className="text-xs text-gray-400 mt-1 break-words max-w-xs">{error.message}</p>

        <div className="flex flex-col gap-2 mt-5 w-full max-w-xs">
          <button
            onClick={this.reset}
            className="px-5 py-2.5 bg-brand-500 text-white rounded-xl font-medium text-sm active:scale-95 transition"
          >
            Reintentar
          </button>
          <button
            onClick={() => { window.location.href = '/'; }}
            className="px-5 py-2 bg-gray-50 text-gray-600 rounded-xl text-xs font-medium border border-gray-200"
          >
            Volver al inicio
          </button>
        </div>
      </div>
    );
  }
}
