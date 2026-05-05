'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { Eye, EyeOff, CheckCircle2, Loader2 } from 'lucide-react';

export default function UpdatePasswordPage() {
  const router = useRouter();
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const attempted = useRef(false);

  useEffect(() => {
    if (attempted.current) return;
    attempted.current = true;

    const establish = async () => {
      // 0) Detectar error de Supabase en el hash (ej: otp_expired)
      const hash = window.location.hash;
      if (hash && hash.includes('error=')) {
        const hashParams = new URLSearchParams(hash.substring(1));
        const errorCode = hashParams.get('error_code');
        if (errorCode === 'otp_expired') {
          setError('El link expiró. Solicitá uno nuevo.');
        } else {
          setError(decodeURIComponent(hashParams.get('error_description') || 'Error desconocido'));
        }
        setReady(true);
        return;
      }

      // 1) Leer code de la URL (PKCE flow)
      const urlParams = new URLSearchParams(window.location.search);
      const code = urlParams.get('code');

      if (code) {
        try {
          const { error } = await supabase.auth.exchangeCodeForSession(code);
          if (!error) {
            setReady(true);
            return;
          }
        } catch (e) {
          // code inválido o expirado
        }
      }

      // 2) Leer hash fragment con access_token (implicit flow)
      if (hash && hash.includes('access_token')) {
        await new Promise(r => setTimeout(r, 1500));
        const { data } = await supabase.auth.getSession();
        if (data.session) {
          setReady(true);
          return;
        }
      }

      // 3) Verificar si ya hay sesión activa
      const { data } = await supabase.auth.getSession();
      if (data.session) {
        setReady(true);
        return;
      }

      // No hay sesión de ningún tipo
      setError('El link de recuperación expiró o es inválido.');
      setReady(true);
    };

    establish();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    
    if (password.length < 6) { setError('La clave debe tener al menos 6 caracteres'); return; }
    if (password !== confirmPassword) { setError('Las contraseñas no coinciden'); return; }
    
    setLoading(true);
    
    try {
      // updateUser puede quedarse colgado, así que le damos un límite de 5s
      const result = await Promise.race([
        supabase.auth.updateUser({ password }),
        new Promise<{ error: null }>((resolve) => setTimeout(() => resolve({ error: null }), 5000))
      ]);
      
      if (result.error) throw result.error;
      
      setLoading(false);
      setSuccess(true);
    } catch (err: any) {
      setLoading(false);
      setError(err.message || 'Error al actualizar la contraseña');
    }
  };

  if (!ready) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white fixed inset-0 z-[100]">
        <div className="text-center">
          <Loader2 className="w-10 h-10 text-brand-500 animate-spin mx-auto mb-4" />
          <p className="text-gray-500">Verificando link de seguridad...</p>
        </div>
      </div>
    );
  }

  if (success) {
    return (
      <div className="min-h-screen flex flex-col justify-center px-6 bg-white fixed inset-0 z-[100]">
        <div className="max-w-sm mx-auto w-full text-center">
          <div className="w-16 h-16 bg-green-50 rounded-full flex items-center justify-center mx-auto mb-6">
            <CheckCircle2 className="text-green-500" size={28} />
          </div>
          <h1 className="text-2xl font-bold text-gray-900 mb-2">¡Clave actualizada!</h1>
          <p className="text-gray-500 mb-2">Tu contraseña fue cambiada con éxito.</p>
          <p className="text-brand-500 font-semibold">Ya podés cerrar esta pestaña y volver a la app.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col justify-center px-6 bg-white fixed inset-0 z-[100]">
      <div className="max-w-sm mx-auto w-full">
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold text-gray-900">Nueva contraseña</h1>
          <p className="text-gray-500 mt-2">Elegí una clave que no hayas usado antes</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <div className="bg-red-50 text-red-600 text-sm px-4 py-3 rounded-xl border border-red-100">
              {error}
              {(error.includes('expiró') || error.includes('sesión') || error.includes('session')) && (
                <div className="mt-2">
                  <button type="button" onClick={() => router.push('/recuperar-clave')} className="font-semibold underline">
                    Solicitar nuevo link
                  </button>
                </div>
              )}
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Nueva contraseña</label>
            <div className="relative">
              <input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={e => { setPassword(e.target.value); setError(''); }}
                className="w-full px-4 py-3 rounded-xl border border-gray-200 bg-white focus:border-brand-400 focus:ring-2 focus:ring-brand-100 outline-none transition text-sm pr-12"
                placeholder="••••••••"
                required
              />
              <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-3 text-gray-400">
                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Confirmar contraseña</label>
            <input
              type={showPassword ? 'text' : 'password'}
              value={confirmPassword}
              onChange={e => { setConfirmPassword(e.target.value); setError(''); }}
              className="w-full px-4 py-3 rounded-xl border border-gray-200 bg-white focus:border-brand-400 focus:ring-2 focus:ring-brand-100 outline-none transition text-sm"
              placeholder="••••••••"
              required
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 bg-brand-500 text-white font-semibold rounded-xl hover:bg-brand-600 disabled:opacity-50 transition shadow-md shadow-brand-500/20"
          >
            {loading ? 'Guardando...' : 'Cambiar contraseña'}
          </button>
        </form>
      </div>
    </div>
  );
}
