'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Camera, CameraOff, Gift, Keyboard } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import { useQueryClient } from '@tanstack/react-query';
import { decodeReservationQR } from '@/lib/qr';

/**
 * Validación de reservas en el mostrador.
 *
 * Esta pantalla no existía: la app le mostraba al cliente un "QR" (que además
 * era un dibujo falso, ver src/lib/qr.ts) y le decía "el negocio lo va a
 * escanear", pero no había ningún lector en ningún lado. Y como nada en la
 * app escribía en loyalty_stamps, "Mis tarjetas" del usuario estaba siempre
 * vacía por más que visitara el local.
 *
 * El lector usa BarcodeDetector, que viene en el WebView de Chrome de Android.
 * Cuando no está disponible (o el usuario no da permiso de cámara) queda la
 * carga manual del código de 8 caracteres, así la función sirve igual.
 */

interface CheckinResult {
  ok: boolean;
  error?: string;
  user_name?: string;
  party_size?: number;
  reservation_id?: string;
  stamps?: { stamp_id: string; current: number; required: number; reward: string; ready: boolean } | null;
  /** Lo devuelve campaign_offer() dentro de redeem_reservation (migración 014). */
  offer?: {
    ok: boolean;
    reasons: string[];
    tier: { label: string; min_people: number } | null;
    next_tier: { label: string; people_missing: number } | null;
  } | null;
}

// BarcodeDetector todavía no está en los tipos del DOM
declare global {
  interface Window {
    BarcodeDetector?: {
      new (options?: { formats?: string[] }): {
        detect(source: CanvasImageSource): Promise<{ rawValue: string }[]>;
      };
      getSupportedFormats?: () => Promise<string[]>;
    };
  }
}

export default function CheckinPage() {
  const router = useRouter();
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const scanLoopRef = useRef<number | null>(null);
  const busyRef = useRef(false);

  const [scanning, setScanning] = useState(false);
  const [cameraError, setCameraError] = useState('');
  const [manualCode, setManualCode] = useState('');
  const [result, setResult] = useState<CheckinResult | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [lastStampId, setLastStampId] = useState<string | null>(null);
  // Lo que define el descuento es el grupo que se PRESENTÓ, no el que
  // reservó. El mostrador tiene que poder corregirlo.
  const [partySize, setPartySize] = useState('');

  const stopCamera = useCallback(() => {
    if (scanLoopRef.current !== null) {
      cancelAnimationFrame(scanLoopRef.current);
      scanLoopRef.current = null;
    }
    streamRef.current?.getTracks().forEach(t => t.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    setScanning(false);
  }, []);

  const submitCode = useCallback(async (rawCode: string) => {
    const code = decodeReservationQR(rawCode);
    if (!code) {
      setResult({ ok: false, error: 'El código no tiene el formato de Pintó' });
      return;
    }
    if (busyRef.current) return;
    busyRef.current = true;
    setSubmitting(true);
    try {
      const { data, error } = await supabase.rpc('redeem_reservation', {
        p_code: code,
        p_party_size: partySize ? parseInt(partySize) : null,
      });
      if (error) throw error;
      const res = data as CheckinResult;
      setResult(res);
      setLastStampId(res.stamps?.stamp_id ?? null);
      if (res.ok) {
        stopCamera();
        queryClient.invalidateQueries({ queryKey: ['pending_reservations'] });
        queryClient.invalidateQueries({ queryKey: ['business_stats'] });
        queryClient.invalidateQueries({ queryKey: ['business_reservations'] });
      }
    } catch (err: any) {
      setResult({ ok: false, error: err?.message ?? 'No se pudo validar la reserva' });
    } finally {
      setSubmitting(false);
      // Pequeña espera para no releer el mismo QR en el siguiente frame
      setTimeout(() => { busyRef.current = false; }, 1500);
    }
  }, [queryClient, stopCamera]);

  const startCamera = useCallback(async () => {
    setCameraError('');
    setResult(null);

    if (typeof window === 'undefined' || !window.BarcodeDetector) {
      setCameraError('Este dispositivo no puede leer QR desde la app. Usá el código manual.');
      return;
    }
    if (!navigator.mediaDevices?.getUserMedia) {
      setCameraError('No hay acceso a la cámara. Usá el código manual.');
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment' },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      setScanning(true);

      const detector = new window.BarcodeDetector({ formats: ['qr_code'] });

      const tick = async () => {
        if (!videoRef.current || !streamRef.current) return;
        try {
          const codes = await detector.detect(videoRef.current);
          if (codes.length > 0 && !busyRef.current) {
            await submitCode(codes[0].rawValue);
          }
        } catch { /* frame no legible, se sigue */ }
        if (streamRef.current) scanLoopRef.current = requestAnimationFrame(() => { void tick(); });
      };
      scanLoopRef.current = requestAnimationFrame(() => { void tick(); });
    } catch (err: any) {
      setCameraError(
        err?.name === 'NotAllowedError'
          ? 'No diste permiso de cámara. Podés cargar el código a mano.'
          : 'No se pudo abrir la cámara. Cargá el código a mano.',
      );
      stopCamera();
    }
  }, [submitCode, stopCamera]);

  useEffect(() => stopCamera, [stopCamera]);

  const redeemReward = async () => {
    if (!lastStampId) return;
    const { data, error } = await supabase.rpc('redeem_loyalty_card', { p_stamp_id: lastStampId });
    if (error) { setResult({ ok: false, error: error.message }); return; }
    const res = data as { ok: boolean; error?: string; reward?: string };
    setResult(res.ok
      ? { ok: true, user_name: result?.user_name, stamps: null }
      : { ok: false, error: res.error });
    setLastStampId(null);
  };

  if (!user) {
    return (
      <div className="max-w-lg mx-auto pt-20 text-center px-6">
        <p className="text-gray-500">Iniciá sesión con tu cuenta de negocio</p>
      </div>
    );
  }

  return (
    <div className="max-w-lg mx-auto pb-24">
      <header className="flex items-center gap-3 px-4 pt-6 pb-4">
        <button onClick={() => { stopCamera(); router.back(); }} className="p-1.5 text-gray-400">
          <ArrowLeft size={20} />
        </button>
        <div>
          <h1 className="text-lg font-display font-bold">Validar reserva</h1>
          <p className="text-xs text-gray-500">Escaneá el QR del cliente o cargá su código</p>
        </div>
      </header>

      <div className="px-4 space-y-4">
        {/* Resultado */}
        {result && (
          <div className={`rounded-2xl p-4 border ${result.ok ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'}`}>
            {result.ok ? (
              <>
                <p className="text-sm font-bold text-green-800">✅ Reserva validada</p>
                <p className="text-sm text-green-700 mt-0.5">
                  {result.user_name}
                  {result.party_size ? ` · ${result.party_size} ${result.party_size === 1 ? 'persona' : 'personas'}` : ''}
                </p>

                {/* El beneficio que corresponde a este grupo, a esta hora */}
                {result.offer?.ok && result.offer.tier && (
                  <div className="mt-3 bg-white rounded-xl p-3 border border-green-100 text-center">
                    <p className="text-[0.65rem] text-gray-400 uppercase tracking-wide">Aplicar</p>
                    <p className="text-2xl font-black text-brand-600 mt-0.5">{result.offer.tier.label}</p>
                  </div>
                )}
                {result.offer && !result.offer.ok && (
                  <div className="mt-3 bg-yellow-50 rounded-xl p-3 border border-yellow-200">
                    <p className="text-xs font-medium text-yellow-800">Sin descuento</p>
                    <ul className="text-[0.7rem] text-yellow-700 mt-1 space-y-0.5">
                      {result.offer.reasons?.map((r, i) => <li key={i}>• {r}</li>)}
                      {result.offer.next_tier && (
                        <li>• Faltan {result.offer.next_tier.people_missing} para {result.offer.next_tier.label}</li>
                      )}
                    </ul>
                  </div>
                )}
                {result.stamps && (
                  <div className="mt-3 bg-white rounded-xl p-3 border border-green-100">
                    <p className="text-xs font-medium text-gray-700">
                      🎯 Sellos: {result.stamps.current}/{result.stamps.required}
                    </p>
                    <div className="w-full bg-gray-100 rounded-full h-1.5 mt-2">
                      <div
                        className="bg-brand-500 h-1.5 rounded-full transition-all"
                        style={{ width: `${Math.min(100, (result.stamps.current / result.stamps.required) * 100)}%` }}
                      />
                    </div>
                    {result.stamps.ready && (
                      <button onClick={redeemReward} disabled={!lastStampId}
                        className="mt-3 w-full flex items-center justify-center gap-2 py-2 bg-yellow-400 text-yellow-900 rounded-xl text-xs font-bold disabled:opacity-50">
                        <Gift size={14} /> Canjear: {result.stamps.reward}
                      </button>
                    )}
                  </div>
                )}
              </>
            ) : (
              <p className="text-sm font-medium text-red-700">⚠️ {result.error}</p>
            )}
          </div>
        )}

        {/* Cámara */}
        <div className="bg-black rounded-2xl overflow-hidden aspect-square relative">
          <video
            ref={videoRef}
            playsInline
            muted
            className={`w-full h-full object-cover ${scanning ? '' : 'opacity-0'}`}
          />
          {!scanning && (
            <div className="absolute inset-0 flex flex-col items-center justify-center text-white/70 gap-3 px-6 text-center">
              <CameraOff size={36} />
              <p className="text-xs">{cameraError || 'La cámara está apagada'}</p>
            </div>
          )}
          {scanning && (
            <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
              <div className="w-48 h-48 border-2 border-white/80 rounded-2xl" />
            </div>
          )}
        </div>

        <button
          onClick={() => (scanning ? stopCamera() : startCamera())}
          className="w-full flex items-center justify-center gap-2 py-3 bg-accent-500 text-white font-semibold rounded-xl active:scale-[0.98] transition"
        >
          <Camera size={18} /> {scanning ? 'Detener cámara' : 'Escanear QR'}
        </button>

        {/* Carga manual */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
          <div className="flex items-center gap-2 mb-2">
            <Keyboard size={16} className="text-gray-400" />
            <p className="text-sm font-semibold">Código manual</p>
          </div>
          <p className="text-xs text-gray-400 mb-3">
            Si la cámara no anda, pedile al cliente los 8 caracteres que figuran debajo de su QR.
          </p>
          <div className="flex items-center gap-2 mb-2">
            <label className="text-xs text-gray-500 shrink-0">¿Cuántos vinieron?</label>
            <input
              type="number" min={1} max={50} inputMode="numeric"
              value={partySize}
              onChange={e => setPartySize(e.target.value)}
              placeholder="auto"
              className="w-20 px-2.5 py-1.5 rounded-lg border border-gray-200 text-sm text-center outline-none focus:border-accent-400"
            />
            <span className="text-[0.65rem] text-gray-400">vacío = lo reservado</span>
          </div>
          <div className="flex gap-2">
            <input
              value={manualCode}
              onChange={e => setManualCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8))}
              placeholder="AB2C3D4E"
              autoCapitalize="characters"
              autoCorrect="off"
              spellCheck={false}
              className="flex-1 px-4 py-2.5 rounded-xl border border-gray-200 text-sm font-mono tracking-widest text-center outline-none focus:border-accent-400"
            />
            <button
              onClick={() => { void submitCode(manualCode); setManualCode(''); }}
              disabled={manualCode.length !== 8 || submitting}
              className="px-5 py-2.5 bg-gray-900 text-white rounded-xl text-sm font-semibold disabled:opacity-40"
            >
              {submitting ? '...' : 'Validar'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
