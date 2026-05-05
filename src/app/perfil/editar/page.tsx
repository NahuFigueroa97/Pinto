'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Camera, Loader2 } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import { useQuery, useQueryClient } from '@tanstack/react-query';

export default function EditarPerfilPage() {
  const { user, profile, refreshProfile } = useAuth();
  const router = useRouter();
  const queryClient = useQueryClient();
  const [loading, setLoading] = useState(false);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const [form, setForm] = useState({
    full_name: '', bio: '', birth_year: '', show_age: false,
    gender: '', zone_id: '', interests_text: '',
  });

  const { data: zones } = useQuery({
    queryKey: ['zones'],
    queryFn: async () => {
      const { data } = await supabase.from('zones').select('*').eq('is_active', true).order('name');
      return data ?? [];
    },
  });

  const { data: allInterests } = useQuery({
    queryKey: ['interests'],
    queryFn: async () => {
      const { data } = await supabase.from('user_interests').select('*').order('sort_order');
      return data ?? [];
    },
  });

  const { data: myInterests } = useQuery({
    queryKey: ['my_interests'],
    queryFn: async () => {
      if (!user) return [];
      const { data } = await supabase.from('user_interest_links').select('interest_id').eq('user_id', user.id);
      return (data ?? []).map((i: any) => i.interest_id);
    },
    enabled: !!user,
  });

  const [selectedInterests, setSelectedInterests] = useState<string[]>([]);

  useEffect(() => {
    if (profile) {
      setForm({
        full_name: profile.full_name || '',
        bio: profile.bio || '',
        birth_year: profile.birth_year?.toString() || '',
        show_age: profile.show_age,
        gender: profile.gender || '',
        zone_id: profile.zone_id || '',
        interests_text: profile.interests_text || '',
      });
      if (profile.avatar_url) setAvatarPreview(profile.avatar_url);
    }
  }, [profile]);

  useEffect(() => {
    if (myInterests) setSelectedInterests(myInterests);
  }, [myInterests]);

  const toggleInterest = (id: string) => {
    setSelectedInterests(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    );
  };

  // Photo upload
  const handlePhotoChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;

    // Preview
    const reader = new FileReader();
    reader.onload = (ev) => setAvatarPreview(ev.target?.result as string);
    reader.readAsDataURL(file);

    setUploadingPhoto(true);
    try {
      const ext = file.name.split('.').pop();
      const filePath = `avatars/${user.id}.${ext}`;

      // Upload to storage
      const { error: uploadErr } = await supabase.storage
        .from('avatars')
        .upload(filePath, file, { upsert: true });

      if (uploadErr) throw uploadErr;

      // Get public URL
      const { data: { publicUrl } } = supabase.storage.from('avatars').getPublicUrl(filePath);

      // Update profile
      await supabase.from('profiles').update({ avatar_url: publicUrl }).eq('id', user.id);
      await refreshProfile();
    } catch (err: any) {
      setError(`Error al subir foto: ${err.message}`);
    } finally {
      setUploadingPhoto(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setLoading(true); setError(''); setSuccess(false);

    try {
      const { error: updateErr } = await supabase.from('profiles').update({
        full_name: form.full_name,
        bio: form.bio || null,
        birth_year: form.birth_year ? parseInt(form.birth_year) : null,
        show_age: form.show_age,
        gender: form.gender || null,
        zone_id: form.zone_id || null,
        interests_text: form.interests_text || null,
        updated_at: new Date().toISOString(),
      }).eq('id', user.id);

      if (updateErr) throw updateErr;

      // Sync interests
      await supabase.from('user_interest_links').delete().eq('user_id', user.id);
      if (selectedInterests.length) {
        await supabase.from('user_interest_links').insert(
          selectedInterests.map(iid => ({ user_id: user.id, interest_id: iid }))
        );
      }

      await refreshProfile();
      queryClient.invalidateQueries({ queryKey: ['my_interests'] });
      queryClient.invalidateQueries({ queryKey: ['my_interests_display'] });
      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
    } catch (err: any) {
      setError(err.message || 'Error al guardar');
    } finally {
      setLoading(false);
    }
  };

  const inputClass = "w-full px-4 py-3 rounded-xl border border-gray-200 bg-white focus:border-brand-400 focus:ring-2 focus:ring-brand-100 outline-none transition text-sm";

  if (!user) return null;

  return (
    <div className="max-w-lg mx-auto pb-8">
      <header className="flex items-center gap-3 px-4 pt-6 pb-4">
        <button onClick={() => router.back()} className="p-1.5 text-gray-400"><ArrowLeft size={20} /></button>
        <h1 className="text-lg font-display font-bold">✏️ Editar perfil</h1>
      </header>

      <form onSubmit={handleSubmit} className="px-4 space-y-4">
        {error && <div className="bg-red-50 text-red-600 text-sm px-4 py-3 rounded-xl border border-red-100">⚠️ {error}</div>}
        {success && <div className="bg-green-50 text-green-600 text-sm px-4 py-3 rounded-xl border border-green-100">✅ Perfil actualizado</div>}

        {/* Avatar Upload */}
        <div className="flex flex-col items-center pb-2">
          <label className="relative cursor-pointer group">
            <div className="w-24 h-24 rounded-2xl bg-brand-100 flex items-center justify-center text-3xl font-bold text-brand-600 overflow-hidden shadow-lg">
              {avatarPreview ? (
                <img src={avatarPreview} alt="avatar" className="w-full h-full object-cover" />
              ) : (
                <span>😎</span>
              )}
            </div>
            <div className="absolute inset-0 rounded-2xl bg-black/30 flex items-center justify-center opacity-0 group-hover:opacity-100 transition">
              {uploadingPhoto ? <Loader2 size={24} className="text-white animate-spin" /> : <Camera size={24} className="text-white" />}
            </div>
            <input type="file" accept="image/*" onChange={handlePhotoChange} className="hidden" />
          </label>
          <p className="text-[0.6rem] text-gray-400 mt-2">{uploadingPhoto ? '📸 Subiendo...' : 'Tocá para cambiar foto'}</p>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">👤 Nombre</label>
          <input type="text" value={form.full_name} onChange={e => setForm({ ...form, full_name: e.target.value })} className={inputClass} />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">📝 Bio</label>
          <textarea value={form.bio} onChange={e => setForm({ ...form, bio: e.target.value })} className={inputClass} rows={3} placeholder="Contá algo de vos..." />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">🎂 Año de nacimiento</label>
            <input type="number" value={form.birth_year} onChange={e => setForm({ ...form, birth_year: e.target.value })} className={inputClass} placeholder="1995" min="1940" max="2010" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">⚡ Género</label>
            <select value={form.gender} onChange={e => setForm({ ...form, gender: e.target.value })} className={inputClass}>
              <option value="">Prefiero no decir</option>
              <option value="male">Masculino</option>
              <option value="female">Femenino</option>
              <option value="non_binary">No binario</option>
              <option value="other">Otro</option>
            </select>
          </div>
        </div>

        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={form.show_age} onChange={e => setForm({ ...form, show_age: e.target.checked })} className="rounded border-gray-300" />
          👁️ Mostrar rango de edad en mi perfil
        </label>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">📍 Zona / barrio</label>
          <select value={form.zone_id} onChange={e => setForm({ ...form, zone_id: e.target.value })} className={inputClass}>
            <option value="">Sin especificar</option>
            {zones?.map((z: any) => <option key={z.id} value={z.id}>{z.name}</option>)}
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">💬 Sobre mis intereses</label>
          <input type="text" value={form.interests_text} onChange={e => setForm({ ...form, interests_text: e.target.value })} className={inputClass} placeholder="Me gusta el fútbol, las birras y el trekking" />
        </div>

        {/* Interests selector */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">🎯 Intereses</label>
          <div className="flex flex-wrap gap-2">
            {allInterests?.map((i: any) => (
              <button key={i.id} type="button" onClick={() => toggleInterest(i.id)}
                className={`text-xs px-3 py-1.5 rounded-full border transition ${
                  selectedInterests.includes(i.id) ? 'bg-brand-500 text-white border-brand-500' : 'bg-white text-gray-600 border-gray-200'
                }`}>
                {i.icon} {i.name}
              </button>
            ))}
          </div>
        </div>

        {/* Verification */}
        <div className="bg-blue-50 rounded-2xl p-4 border border-blue-100">
          <h3 className="font-bold text-sm mb-1">✅ Verificación de identidad</h3>
          <p className="text-xs text-gray-500 mb-3">Verificar tu cuenta genera más confianza en la comunidad</p>
          {(profile as any)?.is_verified ? (
            <div className="bg-green-50 text-green-700 px-3 py-2 rounded-xl text-sm font-medium text-center">✅ Tu cuenta está verificada</div>
          ) : (profile as any)?.verification_requested_at ? (
            <div className="bg-yellow-50 text-yellow-700 px-3 py-2 rounded-xl text-sm font-medium text-center">⏳ Verificación en revisión</div>
          ) : (
            <button type="button" onClick={async () => {
              await supabase.from('profiles').update({ verification_requested_at: new Date().toISOString() }).eq('id', user!.id);
              refreshProfile();
            }}
              className="w-full py-2.5 bg-blue-500 text-white font-medium rounded-xl text-sm active:scale-95 transition">
              🪪 Solicitar verificación
            </button>
          )}
        </div>

        <button type="submit" disabled={loading}
          className="w-full py-3 bg-brand-500 text-white font-semibold rounded-xl disabled:opacity-50 shadow-md shadow-brand-500/20 active:scale-[0.98] transition">
          {loading ? '⏳ Guardando...' : '💾 Guardar cambios'}
        </button>
      </form>

      <div className="mt-8 pt-6 border-t border-gray-100 text-center">
        <a href="/perfil/eliminar" className="text-xs text-red-400 hover:text-red-500">
          Eliminar mi cuenta
        </a>
      </div>
    </div>
  );
}
