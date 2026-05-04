'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, MapPin, Crosshair, X, Loader2 } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useUserLocation } from '@/lib/geolocation';
import type L from 'leaflet';

// Catamarca center
const DEFAULT_LAT = -28.4696;
const DEFAULT_LNG = -65.7852;

export default function NuevoNegocioPage() {
  const router = useRouter();
  const { user, refreshProfile } = useAuth();
  const { location: userLocation } = useUserLocation();
  const queryClient = useQueryClient();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [form, setForm] = useState({
    name: '', description: '', phone: '', whatsapp: '', instagram: '',
    category_id: '',
  });

  // Map state
  const [pin, setPin] = useState<{ lat: number; lng: number } | null>(null);
  const [address, setAddress] = useState('');
  const [showMap, setShowMap] = useState(false);
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const markerRef = useRef<L.Marker | null>(null);
  const leafletRef = useRef<typeof L | null>(null);

  const { data: categories } = useQuery({
    queryKey: ['business_categories'],
    queryFn: async () => {
      const { data } = await supabase.from('business_categories').select('*').eq('is_active', true).order('sort_order');
      return data ?? [];
    },
  });

  // Reverse geocode
  const reverseGeocode = useCallback(async (lat: number, lng: number) => {
    try {
      const res = await fetch(
        `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json&addressdetails=1&accept-language=es`,
        { headers: { 'User-Agent': 'PintoApp/1.0' } }
      );
      const data = await res.json();
      if (data.address) {
        const a = data.address;
        const parts = [];
        if (a.road) parts.push(a.road + (a.house_number ? ' ' + a.house_number : ''));
        if (a.suburb || a.neighbourhood) parts.push(a.suburb || a.neighbourhood);
        if (a.city || a.town || a.village) parts.push(a.city || a.town || a.village);
        setAddress(parts.length > 0 ? parts.join(', ') : data.display_name.split(',').slice(0, 3).join(', '));
      }
    } catch {
      setAddress(`${lat.toFixed(5)}, ${lng.toFixed(5)}`);
    }
  }, []);

  // Initialize Leaflet map
  useEffect(() => {
    if (!showMap || !mapContainerRef.current || mapInstanceRef.current) return;

    const initMap = async () => {
      const leaflet = await import('leaflet');
      leafletRef.current = leaflet.default;

      // Import CSS via link tag
      if (!document.getElementById('leaflet-css')) {
        const link = document.createElement('link');
        link.id = 'leaflet-css';
        link.rel = 'stylesheet';
        link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
        document.head.appendChild(link);
      }

      const centerLat = userLocation?.lat ?? DEFAULT_LAT;
      const centerLng = userLocation?.lng ?? DEFAULT_LNG;

      const map = leaflet.default.map(mapContainerRef.current!, {
        center: [centerLat, centerLng],
        zoom: 15,
        zoomControl: true,
        attributionControl: false,
      });

      leaflet.default.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
      }).addTo(map);

      // Custom pin icon
      const pinIcon = leaflet.default.divIcon({
        className: 'custom-pin',
        html: `<div style="
          width: 32px; height: 32px;
          background: #6C5CE7;
          border-radius: 50% 50% 50% 0;
          transform: rotate(-45deg);
          border: 3px solid white;
          box-shadow: 0 2px 8px rgba(0,0,0,0.3);
          display: flex; align-items: center; justify-content: center;
        "><div style="transform: rotate(45deg); color: white; font-size: 14px;">📍</div></div>`,
        iconSize: [32, 32],
        iconAnchor: [16, 32],
      });

      // Click to place pin
      map.on('click', (e: any) => {
        const { lat, lng } = e.latlng;
        setPin({ lat, lng });
        reverseGeocode(lat, lng);

        if (markerRef.current) {
          markerRef.current.setLatLng([lat, lng]);
        } else {
          markerRef.current = leaflet.default.marker([lat, lng], { icon: pinIcon }).addTo(map);
        }
      });

      mapInstanceRef.current = map;

      // Fix leaflet size issue
      setTimeout(() => {
        if (mapInstanceRef.current) {
          mapInstanceRef.current.invalidateSize();
        }
      }, 300);
    };

    initMap();

    return () => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
        markerRef.current = null;
      }
    };
  }, [showMap, userLocation, reverseGeocode]);

  // Center on user location
  const useMyLocation = useCallback(() => {
    if (!userLocation) return;
    const { lat, lng } = userLocation;
    setPin({ lat, lng });
    reverseGeocode(lat, lng);

    if (mapInstanceRef.current && leafletRef.current) {
      mapInstanceRef.current.setView([lat, lng], 16);
      const pinIcon = leafletRef.current.divIcon({
        className: 'custom-pin',
        html: `<div style="
          width: 32px; height: 32px;
          background: #6C5CE7;
          border-radius: 50% 50% 50% 0;
          transform: rotate(-45deg);
          border: 3px solid white;
          box-shadow: 0 2px 8px rgba(0,0,0,0.3);
          display: flex; align-items: center; justify-content: center;
        "><div style="transform: rotate(45deg); color: white; font-size: 14px;">📍</div></div>`,
        iconSize: [32, 32],
        iconAnchor: [16, 32],
      });
      if (markerRef.current) {
        markerRef.current.setLatLng([lat, lng]);
      } else {
        markerRef.current = leafletRef.current.marker([lat, lng], { icon: pinIcon }).addTo(mapInstanceRef.current);
      }
    }
  }, [userLocation, reverseGeocode]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!form.name.trim()) { setError('El nombre es obligatorio'); return; }
    if (!form.category_id) { setError('Seleccioná una categoría'); return; }
    if (!user) { router.push('/login'); return; }

    setLoading(true);
    setError('');

    const slug = form.name.trim().toLowerCase()
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')
      + '-' + Date.now().toString(36);

    const payload = {
      owner_user_id: user.id,
      name: form.name.trim(),
      slug,
      description: form.description.trim() || null,
      address: address || null,
      phone: form.phone.trim() || null,
      whatsapp: form.whatsapp.trim() || null,
      instagram: form.instagram.trim() || null,
      category_id: form.category_id,
      city_id: 'c1000000-0000-0000-0000-000000000001',
      zone_id: null,
      latitude: pin?.lat ?? null,
      longitude: pin?.lng ?? null,
      status: 'active',
    };

    try {
      const { error: insertError, data } = await supabase
        .from('businesses')
        .insert(payload)
        .select();

      if (insertError) {
        throw new Error(insertError.message || 'Error en la base de datos');
      }

      // 2. Update user role to business
      const { error: profileError } = await supabase
        .from('profiles')
        .update({ role: 'business' })
        .eq('id', user.id);

      if (profileError) console.warn('[Pinto] Failed to update profile role:', profileError);

      // 3. Refresh profile and invalidate queries
      await refreshProfile();
      await queryClient.invalidateQueries({ queryKey: ['my_business'] });

      alert('✅ ¡Negocio creado con éxito!');
      router.push('/negocio');
    } catch (err: any) {
      console.error('[Pinto] Create business error:', err);
      setError(err.message || 'Error al crear el negocio');
      setLoading(false);
    }
  };

  const inputClass = "w-full px-4 py-3 rounded-xl border border-gray-200 bg-white focus:border-accent-400 focus:ring-2 focus:ring-accent-100 outline-none transition text-sm";

  return (
    <div className="max-w-lg mx-auto pb-8">
      <header className="flex items-center gap-3 px-4 pt-6 pb-4">
        <button onClick={() => router.back()} className="p-1.5 text-gray-400"><ArrowLeft size={20} /></button>
        <h1 className="text-lg font-display font-bold">Crear mi negocio</h1>
      </header>

      <form onSubmit={handleSubmit} className="px-4 space-y-4">
        {error && (
          <div className="bg-red-50 text-red-600 text-sm px-4 py-3 rounded-xl border border-red-100 flex items-center justify-between">
            <span>{error}</span>
            <button type="button" onClick={() => setError('')}><X size={14} /></button>
          </div>
        )}

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Nombre del negocio *</label>
          <input type="text" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} className={inputClass} placeholder="Ej: Café Central" />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Categoría *</label>
          <select value={form.category_id} onChange={e => setForm({ ...form, category_id: e.target.value })} className={inputClass}>
            <option value="">Seleccioná una categoría</option>
            {categories?.map((c: any) => <option key={c.id} value={c.id}>{c.icon} {c.name}</option>)}
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Descripción</label>
          <textarea value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} className={inputClass} rows={3} placeholder="Contanos sobre tu negocio" />
        </div>

        {/* MAP */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            <MapPin size={14} className="inline mr-1" /> Ubicación
          </label>

          {!showMap ? (
            <button type="button" onClick={() => setShowMap(true)}
              className="w-full py-4 border-2 border-dashed border-gray-200 rounded-xl text-center text-sm text-gray-500 hover:border-brand-300 hover:text-brand-500 transition">
              <MapPin size={20} className="mx-auto mb-1" />
              Tocá para abrir el mapa y marcar tu ubicación
            </button>
          ) : (
            <div className="space-y-2">
              <div ref={mapContainerRef} className="w-full h-64 rounded-xl overflow-hidden border border-gray-200 z-0" />

              <div className="flex items-center gap-2">
                <button type="button" onClick={useMyLocation}
                  className="flex items-center gap-1.5 text-xs font-medium text-brand-500 bg-brand-50 px-3 py-2 rounded-lg hover:bg-brand-100 transition">
                  <Crosshair size={14} /> Usar mi ubicación
                </button>

                {!pin && <p className="text-xs text-gray-400 italic">👆 Tocá el mapa para marcar</p>}
              </div>

              {address && (
                <div className="bg-green-50 border border-green-100 rounded-xl px-3 py-2">
                  <p className="text-xs text-green-700 font-medium flex items-center gap-1">
                    <MapPin size={12} /> {address}
                  </p>
                </div>
              )}
            </div>
          )}
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Teléfono</label>
            <input type="tel" value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} className={inputClass} placeholder="3834-000000" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">WhatsApp</label>
            <input type="tel" value={form.whatsapp} onChange={e => setForm({ ...form, whatsapp: e.target.value })} className={inputClass} placeholder="3834-000000" />
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Instagram</label>
          <input type="text" value={form.instagram} onChange={e => setForm({ ...form, instagram: e.target.value })} className={inputClass} placeholder="@tunegocio" />
        </div>

        <button type="submit" disabled={loading}
          className="w-full py-3.5 bg-accent-500 text-white font-semibold rounded-xl disabled:opacity-50 shadow-md shadow-accent-500/20 transition hover:bg-accent-600">
          {loading ? (
            <span className="flex items-center justify-center gap-2">
              <Loader2 size={16} className="animate-spin" /> Creando...
            </span>
          ) : 'Crear negocio 🚀'}
        </button>
      </form>
    </div>
  );
}
