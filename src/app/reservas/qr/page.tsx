'use client';

import { Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import { useQuery } from '@tanstack/react-query';
import { generateQRSvg, encodeReservationQR } from '@/lib/qr';

function QRInner() {
  const searchParams = useSearchParams();
  const reservationId = searchParams.get('id');
  const router = useRouter();
  const { user } = useAuth();

  const { data: reservation } = useQuery({
    queryKey: ['reservation_qr', reservationId],
    queryFn: async () => {
      const { data } = await supabase.from('reservations')
        .select('*, campaign:campaigns(title, business:businesses(name))')
        .eq('id', reservationId).single();
      return data;
    },
    enabled: !!reservationId,
  });

  const qrData = user && reservationId ? encodeReservationQR(reservationId, user.id) : '';
  const qrSvg = qrData ? generateQRSvg(qrData, 250) : '';

  return (
    <div className="max-w-lg mx-auto pb-8">
      <header className="flex items-center gap-3 px-4 pt-6 pb-4">
        <button onClick={() => router.back()} className="p-1.5 text-gray-400"><ArrowLeft size={20} /></button>
        <h1 className="text-lg font-display font-bold">📱 Mi QR de Reserva</h1>
      </header>

      <div className="px-4 flex flex-col items-center">
        <div className="bg-white rounded-3xl border border-gray-100 shadow-lg p-8 text-center w-full">
          <p className="text-sm text-gray-500 mb-1">Mostrá este código en el negocio</p>
          <h2 className="text-lg font-bold mb-4">{reservation?.campaign?.title || 'Cargando...'}</h2>
          
          <div className="bg-white p-4 rounded-2xl border border-gray-200 inline-block mx-auto"
            dangerouslySetInnerHTML={{ __html: qrSvg }} />

          <div className="mt-4 space-y-1 text-sm text-gray-500">
            <p>🏪 {reservation?.campaign?.business?.name}</p>
            <p>👤 {user?.email}</p>
            <p className="text-xs text-gray-400">ID: {reservationId?.slice(0, 8)}...</p>
          </div>
        </div>

        <div className="mt-4 bg-yellow-50 border border-yellow-100 rounded-xl p-3 text-center">
          <p className="text-xs text-yellow-700">💡 El negocio escaneará tu QR para confirmar tu reserva y sumar puntos de fidelidad</p>
        </div>
      </div>
    </div>
  );
}

export default function ReservaQRPage() {
  return <Suspense fallback={<div className="flex justify-center pt-20"><div className="spinner" /></div>}><QRInner /></Suspense>;
}
