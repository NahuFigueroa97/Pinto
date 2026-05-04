'use client';

import { useState, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { ArrowLeft, Flag } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import { useMutation } from '@tanstack/react-query';

const REASONS = [
  { value: 'inappropriate', label: '🚫 Contenido inapropiado' },
  { value: 'harassment', label: '😤 Acoso o amenazas' },
  { value: 'spam', label: '📧 Spam o publicidad' },
  { value: 'fake', label: '🎭 Perfil falso' },
  { value: 'dangerous', label: '⚠️ Actividad peligrosa' },
  { value: 'other', label: '💬 Otro motivo' },
] as const;

function ReportarInner() {
  const searchParams = useSearchParams();
  const targetType = (searchParams.get('type') || 'user') as 'user' | 'plan';
  const targetId = searchParams.get('id') || '';
  const router = useRouter();
  const { user } = useAuth();
  const [reason, setReason] = useState('');
  const [description, setDescription] = useState('');
  const [success, setSuccess] = useState(false);

  const report = useMutation({
    mutationFn: async () => {
      if (!user || !reason) return;
      const { error } = await supabase.from('user_reports').insert({
        reporter_id: user.id, target_type: targetType, target_id: targetId,
        reason, description: description || null,
      });
      if (error) throw error;
    },
    onSuccess: () => setSuccess(true),
  });

  if (success) return (
    <div className="max-w-lg mx-auto flex flex-col items-center justify-center min-h-[60vh] text-center px-6">
      <p className="text-5xl mb-4">✅</p>
      <h2 className="text-lg font-bold mb-2">Reporte enviado</h2>
      <p className="text-gray-500 text-sm mb-6">Vamos a revisarlo lo antes posible. Gracias por cuidar la comunidad 💛</p>
      <button onClick={() => router.back()} className="px-6 py-2.5 bg-brand-500 text-white rounded-xl font-medium">Volver</button>
    </div>
  );

  return (
    <div className="max-w-lg mx-auto pb-8">
      <header className="flex items-center gap-3 px-4 pt-6 pb-4">
        <button onClick={() => router.back()} className="p-1.5 text-gray-400"><ArrowLeft size={20} /></button>
        <div>
          <h1 className="text-lg font-display font-bold">🚩 Reportar</h1>
          <p className="text-xs text-gray-500">Ayudanos a mantener Pintó seguro</p>
        </div>
      </header>

      <div className="px-4 space-y-4">
        <p className="text-sm text-gray-600">¿Por qué querés reportar?</p>
        <div className="space-y-2">
          {REASONS.map(r => (
            <button key={r.value} onClick={() => setReason(r.value)}
              className={`w-full text-left p-3 rounded-xl border text-sm font-medium transition ${
                reason === r.value ? 'border-brand-400 bg-brand-50 text-brand-700' : 'border-gray-200 text-gray-700'
              }`}>
              {r.label}
            </button>
          ))}
        </div>

        <textarea
          value={description}
          onChange={e => setDescription(e.target.value)}
          placeholder="Contanos más detalles (opcional)..."
          className="w-full px-4 py-3 rounded-xl border border-gray-200 text-sm outline-none focus:border-brand-400"
          rows={3}
        />

        {report.isError && (
          <div className="bg-red-50 text-red-600 text-sm px-4 py-3 rounded-xl">
            {(report.error as any)?.message?.includes('unique') ? 'Ya reportaste esto anteriormente' : 'Error al enviar reporte'}
          </div>
        )}

        <button onClick={() => report.mutate()} disabled={!reason || report.isPending}
          className="w-full py-3 bg-red-500 text-white font-semibold rounded-xl disabled:opacity-50 shadow-md">
          {report.isPending ? 'Enviando...' : '🚩 Enviar reporte'}
        </button>
      </div>
    </div>
  );
}

export default function ReportarPage() {
  return <Suspense fallback={<div className="flex justify-center pt-20"><div className="spinner" /></div>}><ReportarInner /></Suspense>;
}
