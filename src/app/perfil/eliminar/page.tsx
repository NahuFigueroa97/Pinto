'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, AlertTriangle, Trash2 } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';

export default function EliminarCuentaPage() {
  const { user, signOut } = useAuth();
  const router = useRouter();
  const [step, setStep] = useState<'info' | 'confirm' | 'done'>('info');
  const [loading, setLoading] = useState(false);
  const [confirmText, setConfirmText] = useState('');
  const [error, setError] = useState('');

  const handleDelete = async () => {
    if (confirmText !== 'ELIMINAR' || !user) return;
    setLoading(true);
    setError('');
    try {
      // Antes esto era una lista de DELETE sueltos desde el cliente y NO
      // borraba casi nada:
      //   - activity_feed.user_id y loyalty_cards.user_id no existen (las
      //     columnas son actor_id y business_id) → error 42703 ignorado;
      //   - plan_chat_messages, plan_reviews, user_reports, loyalty_stamps y
      //     reservations no tenían policy de DELETE, así que RLS los filtraba
      //     a 0 filas SIN devolver error;
      //   - el usuario de auth nunca se borraba, así que podía volver a
      //     iniciar sesión.
      // La pantalla decía "permanente e irreversible" y mostraba "Cuenta
      // eliminada" igual. Google Play pide borrado real de cuenta y datos.
      //
      // Ahora lo hace delete_my_account() (migración 011), una función
      // SECURITY DEFINER que borra todo en una sola transacción, incluida la
      // fila de auth.users y los archivos del usuario en Storage.
      const { error: rpcError } = await supabase.rpc('delete_my_account');
      if (rpcError) throw rpcError;

      setStep('done');

      // La sesión ya quedó huérfana: se limpia local y se sale.
      setTimeout(async () => {
        await signOut();
        router.push('/');
      }, 3000);
    } catch (err: any) {
      console.error('[eliminar cuenta]', err);
      setError(err?.message ?? 'No se pudo eliminar la cuenta. Escribinos a soporte@pinto.app.');
      setStep('confirm');
    } finally {
      setLoading(false);
    }
  };

  if (!user) {
    return (
      <div className="max-w-lg mx-auto px-4 pt-20 text-center">
        <p className="text-muted">Iniciá sesión para eliminar tu cuenta</p>
        <Link href="/login" className="text-brand-500 font-medium mt-2 inline-block">Iniciar sesión</Link>
      </div>
    );
  }

  return (
    <div className="max-w-lg mx-auto pb-8">
      <header className="flex items-center gap-3 px-4 pt-6 pb-4">
        <button onClick={() => router.back()} className="-m-1.5 min-w-[44px] min-h-[44px] flex items-center justify-center text-faint"><ArrowLeft size={20} /></button>
        <h1 className="text-lg font-display font-bold text-red-600">Eliminar cuenta</h1>
      </header>

      <div className="px-4 space-y-4">
        {step === 'info' && (
          <>
            <div className="bg-red-50 rounded-2xl p-5 border border-red-100">
              <div className="flex items-center gap-3 mb-3">
                <AlertTriangle size={24} className="text-red-500" />
                <h2 className="font-bold text-red-700">¿Estás seguro?</h2>
              </div>
              <p className="text-sm text-red-600 mb-4">
                Esta acción es <strong>permanente e irreversible</strong>. Se eliminarán:
              </p>
              <ul className="text-sm text-red-600 space-y-1.5">
                <li>• Tu cuenta y tu perfil (incluida la foto)</li>
                <li>• Todos tus mensajes de chat y consultas a negocios</li>
                <li>• Tus fotos de juntadas y de perfil</li>
                <li>• Tus reseñas y valoraciones</li>
                <li>• Tus tarjetas de fidelidad y sellos</li>
                <li>• Tus reservas, check-ins y favoritos</li>
                <li>• Los planes que creaste</li>
                <li>• Tu negocio y sus campañas, si tenías uno</li>
              </ul>
              <p className="text-xs text-red-500 mt-3">
                No vas a poder volver a entrar con este email salvo que te registres de nuevo desde cero.
              </p>
            </div>

            <div className="bg-surface rounded-2xl p-4 border border-line shadow-sm">
              <h3 className="font-semibold text-sm mb-2">📧 Contacto alternativo</h3>
              <p className="text-xs text-muted mb-2">
                Si tenés algún problema con tu cuenta, contactanos antes de eliminarla:
              </p>
              <p className="text-sm font-medium text-brand-500">soporte@pinto.app</p>
            </div>

            <button onClick={() => setStep('confirm')}
              className="w-full py-3 bg-red-500 text-white font-semibold rounded-xl active:scale-95 transition">
              Continuar con la eliminación
            </button>

            <button onClick={() => router.back()}
              className="w-full py-3 bg-subtle text-muted font-medium rounded-xl">
              Cancelar
            </button>
          </>
        )}

        {step === 'confirm' && (
          <>
            {error && (
              <div className="bg-red-50 text-red-600 dark:bg-red-500/15 dark:text-red-300 text-sm px-4 py-3 rounded-xl border border-red-100">
                ⚠️ {error}
              </div>
            )}
            <div className="bg-yellow-50 rounded-2xl p-5 border border-yellow-200">
              <h2 className="font-bold text-yellow-800 mb-2">⚠️ Confirmación final</h2>
              <p className="text-sm text-yellow-700 mb-4">
                Escribí <strong>ELIMINAR</strong> para confirmar que querés borrar tu cuenta permanentemente.
              </p>
              <input
                type="text"
                value={confirmText}
                onChange={e => setConfirmText(e.target.value.toUpperCase())}
                placeholder="Escribí ELIMINAR"
                className="w-full px-4 py-3 border-2 border-red-200 rounded-xl text-center font-bold text-red-600 focus:border-red-400 focus:outline-none"
              />
            </div>

            <button
              onClick={handleDelete}
              disabled={confirmText !== 'ELIMINAR' || loading}
              className="w-full py-3 bg-red-600 text-white font-bold rounded-xl disabled:opacity-40 active:scale-95 transition flex items-center justify-center gap-2"
            >
              <Trash2 size={18} />
              {loading ? 'Eliminando...' : 'Eliminar mi cuenta definitivamente'}
            </button>

            <button onClick={() => { setStep('info'); setConfirmText(''); }}
              className="w-full py-3 bg-subtle text-muted font-medium rounded-xl">
              Volver atrás
            </button>
          </>
        )}

        {step === 'done' && (
          <div className="text-center py-16">
            <p className="text-4xl mb-4">👋</p>
            <h2 className="text-xl font-bold text-ink mb-2">Cuenta eliminada</h2>
            <p className="text-muted">Tu cuenta y tus datos fueron eliminados. Redirigiendo...</p>
          </div>
        )}
      </div>
    </div>
  );
}
