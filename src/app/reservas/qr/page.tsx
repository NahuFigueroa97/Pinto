'use client';

import { Suspense, useEffect, useState } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import { useQuery } from '@tanstack/react-query';
import { generateQRSvg, encodeReservationQR } from '@/lib/qr';
import { PageSpinner } from '@/components/shared/PageSpinner';

function QRInner() {
  const searchParams = useSearchParams();
  const reservationId = searchParams.get('id');
  const router = useRouter();
  const { user } = useAuth();
  const [qrSvg, setQrSvg] = useState<string>('');

  const { data: reservation, isLoading } = useQuery({
    queryKey: ['reservation_qr', reservationId],
    queryFn: async () => {
      const { data, error } = await supabase.from('reservations')
        // checkin_code lo genera la base (migración 011). Es lo que se
        // codifica en el QR y lo que el negocio puede tipear a mano.
        .select('id, status, party_size, checkin_code, campaign:campaigns(title, business:businesses(name))')
        .eq('id', reservationId).single();
      if (error) throw error;
      return data as any;
    },
    enabled: !!reservationId && !!user,
  });

  const code: string | undefined = reservation?.checkin_code;

  useEffect(() => {
    if (!code) { setQrSvg(''); return; }
    let active = true;
    generateQRSvg(encodeReservationQR(code), 240)
      .then(svg => { if (active) setQrSvg(svg); })
      .catch(() => { if (active) setQrSvg(''); });
    return () => { active = false; };
  }, [code]);

  const alreadyUsed = reservation?.status === 'completed';
  const cancelled = reservation?.status === 'cancelled';

  return (
    <div className="max-w-lg mx-auto pb-8">
      <header className="flex items-center gap-3 px-4 pt-6 pb-4">
        <button onClick={() => router.back()} className="p-1.5 text-gray-400"><ArrowLeft size={20} /></button>
        <h1 className="text-lg font-display font-bold">📱 Mi QR de reserva</h1>
      </header>

      <div className="px-4 flex flex-col items-center">
        <div className="bg-white rounded-3xl border border-gray-100 shadow-lg p-8 text-center w-full">
          {isLoading ? (
            <PageSpinner fullScreen={false} />
          ) : !reservation ? (
            <p className="py-16 text-gray-400 text-sm">No encontramos esta reserva.</p>
          ) : (
            <>
              <p className="text-sm text-gray-500 mb-1">Mostrá este código en el local</p>
              <h2 className="text-lg font-bold mb-4">{reservation.campaign?.title ?? 'Tu reserva'}</h2>

              {cancelled ? (
                <div className="py-10 px-4 bg-red-50 rounded-2xl">
                  <p className="text-3xl mb-2">❌</p>
                  <p className="text-sm font-medium text-red-600">Esta reserva está cancelada</p>
                </div>
              ) : alreadyUsed ? (
                <div className="py-10 px-4 bg-green-50 rounded-2xl">
                  <p className="text-3xl mb-2">✅</p>
                  <p className="text-sm font-medium text-green-700">Ya validaste esta reserva</p>
                </div>
              ) : (
                <>
                  <div
                    className="bg-white p-4 rounded-2xl border border-gray-200 inline-block mx-auto"
                    // El SVG lo genera la librería qrcode a partir del código,
                    // no lleva nada escrito por usuarios.
                    dangerouslySetInnerHTML={{ __html: qrSvg }}
                  />

                  <div className="mt-4">
                    <p className="text-[0.65rem] text-gray-400 uppercase tracking-wide">o decile este código</p>
                    <p className="text-2xl font-black tracking-[0.2em] text-gray-900 mt-1">{code}</p>
                  </div>
                </>
              )}

              <div className="mt-4 space-y-1 text-sm text-gray-500">
                <p>🏪 {reservation.campaign?.business?.name}</p>
                <p>👥 {reservation.party_size} {reservation.party_size === 1 ? 'persona' : 'personas'}</p>
              </div>
            </>
          )}
        </div>

        {!alreadyUsed && !cancelled && (
          <div className="mt-4 bg-yellow-50 border border-yellow-100 rounded-xl p-3 text-center">
            <p className="text-xs text-yellow-700">
              💡 El local escanea el QR (o carga el código) para confirmar tu reserva y sumarte un sello de fidelidad.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

export default function ReservaQRPage() {
  return <Suspense fallback={<PageSpinner />}><QRInner /></Suspense>;
}
