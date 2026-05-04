'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/lib/auth';
import { Eye, EyeOff, ArrowLeft, User, Store } from 'lucide-react';
import type { UserRole } from '@/types/database';

export default function RegisterPage() {
  const router = useRouter();
  const { signUp } = useAuth();
  const [role, setRole] = useState<UserRole>('user');
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!fullName || !email || !password) { setError('Completá todos los campos'); return; }
    if (password.length < 6) { setError('La contraseña debe tener al menos 6 caracteres'); return; }
    setLoading(true);
    setError('');
    try {
      await signUp(email, password, fullName, role);
      router.push(role === 'business' ? '/negocio/nuevo' : '/');
    } catch (err: any) {
      setError(err.message || 'Error al registrarse');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col justify-center px-6 py-8">
      <button onClick={() => router.back()} className="absolute top-6 left-4 p-2 text-gray-400"><ArrowLeft size={22} /></button>

      <div className="max-w-sm mx-auto w-full">
        <div className="text-center mb-6">
          <h1 className="text-3xl font-display font-bold text-gradient">Pintó</h1>
          <p className="text-gray-500 mt-1">Creá tu cuenta</p>
        </div>

        {/* Role Selector */}
        <div className="grid grid-cols-2 gap-3 mb-6">
          <button
            type="button"
            onClick={() => setRole('user')}
            className={`flex flex-col items-center gap-1.5 p-4 rounded-2xl border-2 transition-all ${
              role === 'user' ? 'border-brand-500 bg-brand-50 shadow-md shadow-brand-500/10' : 'border-gray-200 bg-white'
            }`}
          >
            <User size={24} className={role === 'user' ? 'text-brand-500' : 'text-gray-400'} />
            <span className={`text-sm font-medium ${role === 'user' ? 'text-brand-600' : 'text-gray-500'}`}>Soy usuario</span>
            <span className="text-[0.65rem] text-gray-400">Descubrí planes</span>
          </button>
          <button
            type="button"
            onClick={() => setRole('business')}
            className={`flex flex-col items-center gap-1.5 p-4 rounded-2xl border-2 transition-all ${
              role === 'business' ? 'border-accent-500 bg-accent-50 shadow-md shadow-accent-500/10' : 'border-gray-200 bg-white'
            }`}
          >
            <Store size={24} className={role === 'business' ? 'text-accent-500' : 'text-gray-400'} />
            <span className={`text-sm font-medium ${role === 'business' ? 'text-accent-600' : 'text-gray-500'}`}>Soy negocio</span>
            <span className="text-[0.65rem] text-gray-400">Activá clientes</span>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <div className="bg-red-50 text-red-600 text-sm px-4 py-3 rounded-xl border border-red-100">{error}</div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Nombre completo</label>
            <input
              type="text"
              value={fullName}
              onChange={e => setFullName(e.target.value)}
              className="w-full px-4 py-3 rounded-xl border border-gray-200 bg-white focus:border-brand-400 focus:ring-2 focus:ring-brand-100 outline-none transition text-sm"
              placeholder="Tu nombre"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              className="w-full px-4 py-3 rounded-xl border border-gray-200 bg-white focus:border-brand-400 focus:ring-2 focus:ring-brand-100 outline-none transition text-sm"
              placeholder="tu@email.com"
              autoComplete="email"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Contraseña</label>
            <div className="relative">
              <input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={e => setPassword(e.target.value)}
                className="w-full px-4 py-3 rounded-xl border border-gray-200 bg-white focus:border-brand-400 focus:ring-2 focus:ring-brand-100 outline-none transition text-sm pr-12"
                placeholder="Mínimo 6 caracteres"
              />
              <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-3 text-gray-400">
                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className={`w-full py-3 text-white font-semibold rounded-xl disabled:opacity-50 transition shadow-md ${
              role === 'business'
                ? 'bg-accent-500 hover:bg-accent-600 shadow-accent-500/20'
                : 'bg-brand-500 hover:bg-brand-600 shadow-brand-500/20'
            }`}
          >
            {loading ? 'Creando cuenta...' : role === 'business' ? 'Registrar mi negocio' : 'Crear cuenta'}
          </button>
        </form>

        <p className="text-center text-sm text-gray-500 mt-6">
          ¿Ya tenés cuenta?{' '}
          <Link href="/login" className="text-brand-500 font-medium">Iniciá sesión</Link>
        </p>
      </div>
    </div>
  );
}
