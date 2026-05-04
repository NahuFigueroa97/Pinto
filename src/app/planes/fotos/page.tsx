'use client';

import { useState, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { ArrowLeft, Upload, X } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import { useQuery, useQueryClient } from '@tanstack/react-query';

function compressImage(file: File, maxWidth = 800, quality = 0.7): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const ratio = Math.min(maxWidth / img.width, 1);
        canvas.width = img.width * ratio;
        canvas.height = img.height * ratio;
        const ctx = canvas.getContext('2d')!;
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL('image/jpeg', quality));
      };
      img.onerror = reject;
      img.src = e.target?.result as string;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function FotosInner() {
  const searchParams = useSearchParams();
  const planId = searchParams.get('id');
  const router = useRouter();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState('');

  const { data: photos } = useQuery({
    queryKey: ['plan_photos', planId],
    queryFn: async () => {
      const { data } = await supabase.from('plan_photos')
        .select('*, user:profiles(full_name)')
        .eq('plan_id', planId)
        .order('created_at', { ascending: false });
      return data ?? [];
    },
    enabled: !!planId,
  });

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user || !planId) return;
    setUploading(true);
    setUploadError('');
    try {
      let photoUrl = '';

      // Try Supabase Storage first
      const ext = file.name.split('.').pop();
      const path = `plan-photos/${planId}/${user.id}_${Date.now()}.${ext}`;
      const { error: upErr } = await supabase.storage.from('plan-photos').upload(path, file, { upsert: true });

      if (!upErr) {
        const { data: { publicUrl } } = supabase.storage.from('plan-photos').getPublicUrl(path);
        photoUrl = publicUrl;
      } else {
        // Fallback: compress and store as data URL
        console.warn('Storage upload failed, using compressed data URL:', upErr.message);
        photoUrl = await compressImage(file);
      }

      const { error: insertErr } = await supabase.from('plan_photos').insert({
        plan_id: planId, user_id: user.id, photo_url: photoUrl,
      });
      if (insertErr) throw insertErr;

      queryClient.invalidateQueries({ queryKey: ['plan_photos', planId] });
    } catch (err: any) {
      console.error(err);
      setUploadError(err?.message || 'Error al subir la foto');
    } finally {
      setUploading(false);
      // Reset input
      e.target.value = '';
    }
  };

  return (
    <div className="max-w-lg mx-auto pb-8">
      <header className="flex items-center gap-3 px-4 pt-6 pb-4">
        <button onClick={() => router.back()} className="p-1.5 text-gray-400"><ArrowLeft size={20} /></button>
        <div className="flex-1">
          <h1 className="text-lg font-display font-bold">📸 Fotos de la juntada</h1>
          <p className="text-xs text-gray-500">{photos?.length ?? 0} fotos</p>
        </div>
        <label className={`flex items-center gap-1.5 px-3 py-2 bg-brand-500 text-white rounded-xl text-sm font-medium cursor-pointer ${uploading ? 'opacity-50' : ''}`}>
          <Upload size={14} /> {uploading ? 'Subiendo...' : 'Subir'}
          <input type="file" accept="image/*" onChange={handleUpload} className="hidden" disabled={uploading} />
        </label>
      </header>

      <div className="px-4">
        {uploadError && (
          <div className="bg-red-50 text-red-600 text-sm px-4 py-2 rounded-xl mb-3">
            ❌ {uploadError}
          </div>
        )}
        {photos?.length === 0 ? (
          <div className="text-center py-16 text-gray-400">
            <p className="text-4xl mb-3">📷</p>
            <p className="font-medium">No hay fotos todavía</p>
            <p className="text-sm mt-1">¡Sé el primero en subir una!</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-2">
            {photos?.map((p: any) => (
              <div key={p.id} className="relative rounded-xl overflow-hidden aspect-square group">
                <img src={p.photo_url} alt="" className="w-full h-full object-cover" />
                <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/60 to-transparent p-2">
                  <p className="text-white text-[0.6rem] font-medium">{p.user?.full_name}</p>
                </div>
                {p.user_id === user?.id && (
                  <button
                    onClick={async () => {
                      if (!confirm('¿Borrar esta foto?')) return;
                      await supabase.from('plan_photos').delete().eq('id', p.id);
                      queryClient.invalidateQueries({ queryKey: ['plan_photos', planId] });
                    }}
                    className="absolute top-1.5 right-1.5 w-7 h-7 bg-black/50 text-white rounded-full flex items-center justify-center text-xs opacity-0 group-hover:opacity-100 active:opacity-100 transition"
                  >
                    <X size={14} />
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default function PlanFotosPage() {
  return <Suspense fallback={<div className="flex justify-center pt-20"><div className="spinner" /></div>}><FotosInner /></Suspense>;
}
