'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import { ArrowLeft, Mail } from 'lucide-react';

export default function RecoverPasswordPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) { setError('Ingresá tu email'); return; }
    
    setLoading(true);
    setError('');
    
    try {
      // Supabase envía el email de recuperación
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${process.env.NEXT_PUBLIC_SITE_URL || window.location.origin}/actualizar-clave/`,
      });

      if (error) throw error;
      
      setSuccess(true);
    } catch (err: any) {
      setError(err.message || 'Error al enviar el email');
    } finally {
      setLoading(false);
    }
  };

  if (success) {
    return (
      <div className="min-h-screen flex flex-col justify-center px-6">
        <div className="max-w-sm mx-auto w-full text-center">
          <div className="w-16 h-16 bg-brand-50 rounded-full flex items-center justify-center mx-auto mb-6">
            <Mail className="text-brand-500" size={28} />
          </div>
          <h1 className="text-2xl font-bold text-gray-900 mb-2">¡Email enviado!</h1>
          <p className="text-gray-500 mb-8">
            Revisá tu bandeja de entrada. Te enviamos un link para que puedas cambiar tu contraseña.
          </p>
          <button
            onClick={() => router.push('/login')}
            className="w-full py-3 bg-brand-500 text-white font-semibold rounded-xl transition shadow-md shadow-brand-500/20"
          >
            Volver al inicio
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col justify-center px-6">
      <button 
        onClick={() => router.push('/login')} 
        className="absolute top-6 left-4 p-2 text-gray-400"
      >
        <ArrowLeft size={22} />
      </button>

      <div className="max-w-sm mx-auto w-full">
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold text-gray-900">Recuperar clave</h1>
          <p className="text-gray-500 mt-2">Te enviaremos un link para restablecerla</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <div className="bg-red-50 text-red-600 text-sm px-4 py-3 rounded-xl border border-red-100">
              {error}
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              className="w-full px-4 py-3 rounded-xl border border-gray-200 bg-white focus:border-brand-400 focus:ring-2 focus:ring-brand-100 outline-none transition text-sm"
              placeholder="tu@email.com"
              required
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 bg-brand-500 text-white font-semibold rounded-xl hover:bg-brand-600 disabled:opacity-50 transition shadow-md shadow-brand-500/20"
          >
            {loading ? 'Enviando...' : 'Enviar instrucciones'}
          </button>
        </form>

        <p className="text-center text-sm text-gray-500 mt-6">
          ¿Te acordaste?{' '}
          <Link href="/login" className="text-brand-500 font-medium">Iniciá sesión</Link>
        </p>
      </div>
    </div>
  );
}
