'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, AlertTriangle, Trash2 } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';

export default function EliminarCuentaPage() {
  const { user, signOut } = useAuth();
  const router = useRouter();
  const [step, setStep] = useState<'info' | 'confirm' | 'done'>('info');
  const [loading, setLoading] = useState(false);
  const [confirmText, setConfirmText] = useState('');

  const handleDelete = async () => {
    if (confirmText !== 'ELIMINAR' || !user) return;
    setLoading(true);
    try {
      // Delete user data in order
      await supabase.from('social_plan_members').delete().eq('user_id', user.id);
      await supabase.from('plan_chat_messages').delete().eq('user_id', user.id);
      await supabase.from('plan_photos').delete().eq('user_id', user.id);
      await supabase.from('plan_reviews').delete().eq('reviewer_id', user.id);
      await supabase.from('user_reports').delete().eq('reporter_id', user.id);
      await supabase.from('activity_feed').delete().eq('user_id', user.id);
      await supabase.from('loyalty_stamps').delete().eq('user_id', user.id);
      await supabase.from('loyalty_cards').delete().eq('user_id', user.id);
      await supabase.from('favorites').delete().eq('user_id', user.id);
      await supabase.from('reservations').delete().eq('user_id', user.id);
      await supabase.from('social_plans').update({ status: 'cancelled' }).eq('creator_id', user.id);

      // Mark profile as deleted
      await supabase.from('profiles').update({
        full_name: 'Usuario eliminado',
        bio: null,
        avatar_url: null,
        is_verified: false,
      }).eq('id', user.id);

      setStep('done');

      // Sign out after 3 seconds
      setTimeout(async () => {
        await signOut();
        router.push('/login');
      }, 3000);
    } catch (err) {
      console.error(err);
      alert('Error al eliminar la cuenta. Contactá a soporte.');
    } finally {
      setLoading(false);
    }
  };

  if (!user) {
    return (
      <div className="max-w-lg mx-auto px-4 pt-20 text-center">
        <p className="text-gray-500">Iniciá sesión para eliminar tu cuenta</p>
        <a href="/login" className="text-brand-500 font-medium mt-2 inline-block">Iniciar sesión</a>
      </div>
    );
  }

  return (
    <div className="max-w-lg mx-auto pb-8">
      <header className="flex items-center gap-3 px-4 pt-6 pb-4">
        <button onClick={() => router.back()} className="p-1.5 text-gray-400"><ArrowLeft size={20} /></button>
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
                <li>• Tu perfil y foto de avatar</li>
                <li>• Todos tus mensajes de chat</li>
                <li>• Tus fotos de juntadas</li>
                <li>• Tus reseñas y valoraciones</li>
                <li>• Tus tarjetas de fidelidad y sellos</li>
                <li>• Tus reservas y favoritos</li>
                <li>• Tus planes serán cancelados</li>
              </ul>
            </div>

            <div className="bg-white rounded-2xl p-4 border border-gray-100 shadow-sm">
              <h3 className="font-semibold text-sm mb-2">📧 Contacto alternativo</h3>
              <p className="text-xs text-gray-500 mb-2">
                Si tenés algún problema con tu cuenta, contactanos antes de eliminarla:
              </p>
              <p className="text-sm font-medium text-brand-500">soporte@pinto.app</p>
            </div>

            <button onClick={() => setStep('confirm')}
              className="w-full py-3 bg-red-500 text-white font-semibold rounded-xl active:scale-95 transition">
              Continuar con la eliminación
            </button>

            <button onClick={() => router.back()}
              className="w-full py-3 bg-gray-100 text-gray-600 font-medium rounded-xl">
              Cancelar
            </button>
          </>
        )}

        {step === 'confirm' && (
          <>
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
              className="w-full py-3 bg-gray-100 text-gray-600 font-medium rounded-xl">
              Volver atrás
            </button>
          </>
        )}

        {step === 'done' && (
          <div className="text-center py-16">
            <p className="text-4xl mb-4">👋</p>
            <h2 className="text-xl font-bold text-gray-900 mb-2">Cuenta eliminada</h2>
            <p className="text-gray-500">Tu cuenta y datos han sido eliminados. Redirigiendo...</p>
          </div>
        )}
      </div>
    </div>
  );
}
