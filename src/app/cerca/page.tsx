'use client';

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { MapPin, Navigation, Clock, Users, Store, Calendar, ChevronRight, RefreshCw, Map, List } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useQuery } from '@tanstack/react-query';
import { useUserLocation, sortByDistance } from '@/lib/geolocation';
import { DistanceBadge } from '@/components/shared/DistanceBadge';

export default function CercaPage() {
  const { location, loading: geoLoading, error: geoError, requestLocation } = useUserLocation();
  const [tab, setTab] = useState<'campaigns' | 'businesses' | 'plans'>('campaigns');
  const [maxKm, setMaxKm] = useState(10);
  const [viewMode, setViewMode] = useState<'list' | 'map'>('list');
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<any>(null);

  const { data: nearbyCampaigns } = useQuery({
    queryKey: ['nearby_campaigns', location?.lat, location?.lng, maxKm],
    queryFn: async () => {
      if (!location) return [];
      const { data } = await supabase.from('campaigns')
        .select('*, business:businesses(id, name, slug, address, latitude, longitude, category:business_categories(icon))')
        .eq('status', 'active').gte('ends_at', new Date().toISOString()).limit(50);
      const withBizCoords = (data ?? []).filter((c: any) => c.business?.latitude && c.business?.longitude);
      const sorted = sortByDistance(
        withBizCoords.map((c: any) => ({ ...c, latitude: c.business.latitude, longitude: c.business.longitude })),
        location.lat, location.lng
      );
      return sorted.filter(c => c.distance <= maxKm);
    },
    enabled: !!location && tab === 'campaigns',
  });

  const { data: nearbyBusinesses } = useQuery({
    queryKey: ['nearby_businesses', location?.lat, location?.lng, maxKm],
    queryFn: async () => {
      if (!location) return [];
      const { data } = await supabase.from('businesses').select('*, category:business_categories(name, icon)')
        .eq('status', 'active').not('latitude', 'is', null).limit(50);
      return sortByDistance(data ?? [], location.lat, location.lng).filter(b => b.distance <= maxKm);
    },
    enabled: !!location && tab === 'businesses',
  });

  const { data: nearbyPlans } = useQuery({
    queryKey: ['nearby_plans', location?.lat, location?.lng, maxKm],
    queryFn: async () => {
      if (!location) return [];
      const { data } = await supabase.from('social_plans')
        .select('*, creator:profiles(full_name), members:social_plan_members(id)')
        .eq('status', 'open').eq('visibility', 'public')
        .gte('plan_date', new Date().toISOString().split('T')[0])
        .not('latitude', 'is', null).limit(50);
      return sortByDistance(data ?? [], location.lat, location.lng).filter(p => p.distance <= maxKm);
    },
    enabled: !!location && tab === 'plans',
  });

  // Map initialization
  useEffect(() => {
    if (viewMode === 'map' && location && mapRef.current && !mapInstanceRef.current) {
      import('leaflet').then((L) => {
        const map = L.map(mapRef.current!).setView([location.lat, location.lng], 14);
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
          attribution: '&copy; OpenStreetMap'
        }).addTo(map);

        // User location marker
        L.circleMarker([location.lat, location.lng], {
          radius: 8,
          fillColor: '#3B82F6',
          fillOpacity: 1,
          color: 'white',
          weight: 3
        }).addTo(map).bindPopup('Tu ubicación');

        mapInstanceRef.current = map;
      });
    }

    return () => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }
    };
  }, [viewMode, location]);

  // Map markers update
  useEffect(() => {
    if (mapInstanceRef.current && viewMode === 'map') {
      import('leaflet').then((L) => {
        const map = mapInstanceRef.current;
        // Clear existing markers
        map.eachLayer((layer: any) => {
          if (layer instanceof L.Marker) map.removeLayer(layer);
        });

        const items = tab === 'campaigns' ? nearbyCampaigns : tab === 'businesses' ? nearbyBusinesses : nearbyPlans;
        items?.forEach((item: any) => {
          if (item.latitude && item.longitude) {
            const marker = L.marker([item.latitude, item.longitude]).addTo(map);
            const popupContent = `
              <div style="font-family: inherit; font-size: 13px;">
                <p style="font-weight: 700; margin-bottom: 2px;">${item.title || item.name}</p>
                <p style="color: #6B7280; margin-bottom: 4px;">${item.business?.name || item.address || ''}</p>
                <a href="${tab === 'campaigns' ? `/campana?id=${item.id}` : tab === 'businesses' ? `/negocio/detalle?slug=${item.slug}` : `/planes/detalle?id=${item.id}`}" 
                   style="color: #3B82F6; font-weight: 600; text-decoration: none;">Ver más →</a>
              </div>
            `;
            marker.bindPopup(popupContent);
          }
        });
      });
    }
  }, [tab, nearbyCampaigns, nearbyBusinesses, nearbyPlans, viewMode]);

  if (geoLoading) return (
    <div className="max-w-lg mx-auto flex flex-col items-center justify-center min-h-[60vh] text-center px-6">
      <Navigation size={40} className="text-brand-300 mb-4 animate-pulse" />
      <p className="text-gray-500">Obteniendo tu ubicación...</p>
    </div>
  );

  if (!location) return (
    <div className="max-w-lg mx-auto flex flex-col items-center justify-center min-h-[60vh] text-center px-6">
      <MapPin size={48} className="text-gray-200 mb-4" />
      <p className="text-gray-500 mb-2">{geoError || 'Necesitamos tu ubicación para mostrar resultados cercanos'}</p>
      <button onClick={requestLocation} className="text-brand-500 font-medium flex items-center gap-1">
        <RefreshCw size={14} /> Intentar de nuevo
      </button>
    </div>
  );

  return (
    <div className="max-w-lg mx-auto pb-6 h-screen flex flex-col">
      <header className="px-4 pt-6 pb-3 flex items-center justify-between shrink-0">
        <div>
          <h1 className="text-xl font-display font-bold flex items-center gap-2">
            <Navigation size={20} className="text-brand-500" /> Cerca mío
          </h1>
          <p className="text-sm text-gray-500">Descubrí qué hay cerca tuyo</p>
        </div>
        <button onClick={() => setViewMode(v => v === 'list' ? 'map' : 'list')}
          className="p-2 bg-gray-100 rounded-xl text-gray-600">
          {viewMode === 'list' ? <Map size={18} /> : <List size={18} />}
        </button>
      </header>

      {/* Distance filter */}
      <div className="px-4 pb-3 flex items-center gap-2 shrink-0">
        <span className="text-xs text-gray-500">Radio:</span>
        {[2, 5, 10, 25].map(km => (
          <button key={km} onClick={() => setMaxKm(km)}
            className={`text-xs px-3 py-1.5 rounded-full font-medium transition ${maxKm === km ? 'bg-brand-500 text-white' : 'bg-gray-100 text-gray-600'}`}>
            {km} km
          </button>
        ))}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 px-4 pb-3 shrink-0">
        {[
          { key: 'campaigns', label: '📢 Promos', count: nearbyCampaigns?.length },
          { key: 'businesses', label: '🏪 Negocios', count: nearbyBusinesses?.length },
          { key: 'plans', label: '👥 Planes', count: nearbyPlans?.length },
        ].map(t => (
          <button key={t.key} onClick={() => setTab(t.key as any)}
            className={`px-3 py-2 rounded-full text-sm font-medium transition ${tab === t.key ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-600'}`}>
            {t.label} {t.count !== undefined ? `(${t.count})` : ''}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto px-4 space-y-3 relative">
        {viewMode === 'map' ? (
          <div ref={mapRef} className="absolute inset-0 z-0 bg-gray-100" />
        ) : (
          <div className="space-y-3 py-1">
            {tab === 'campaigns' && (
              !nearbyCampaigns?.length ? (
                <p className="text-center py-10 text-gray-400 text-sm">No hay promos cerca a {maxKm} km</p>
              ) : nearbyCampaigns.map((c: any) => (
                <Link key={c.id} href={`/campana?id=${c.id}`} className="flex items-center gap-3 p-3 bg-white rounded-xl border border-gray-100 shadow-sm">
                  <div className="flex-1 min-w-0">
                    <h3 className="font-semibold text-sm truncate">{c.title}</h3>
                    <p className="text-xs text-gray-500">{c.business?.name}</p>
                  </div>
                  <DistanceBadge distance={c.distance} />
                  <ChevronRight size={14} className="text-gray-300" />
                </Link>
              ))
            )}

            {tab === 'businesses' && (
              !nearbyBusinesses?.length ? (
                <p className="text-center py-10 text-gray-400 text-sm">No hay negocios cerca a {maxKm} km</p>
              ) : nearbyBusinesses.map((b: any) => (
                <Link key={b.id} href={`/negocio/detalle?slug=${b.slug}`} className="flex items-center gap-3 p-3 bg-white rounded-xl border border-gray-100 shadow-sm">
                  <div className="w-10 h-10 rounded-xl bg-gray-100 flex items-center justify-center text-lg">{b.category?.icon || '🏪'}</div>
                  <div className="flex-1 min-w-0">
                    <h3 className="font-semibold text-sm truncate">{b.name}</h3>
                    <p className="text-xs text-gray-500 truncate">{b.address}</p>
                  </div>
                  <DistanceBadge distance={b.distance} />
                  <ChevronRight size={14} className="text-gray-300" />
                </Link>
              ))
            )}

            {tab === 'plans' && (
              !nearbyPlans?.length ? (
                <p className="text-center py-10 text-gray-400 text-sm">No hay planes cerca a {maxKm} km</p>
              ) : nearbyPlans.map((p: any) => (
                <Link key={p.id} href={`/planes/detalle?id=${p.id}`} className="flex items-center gap-3 p-3 bg-white rounded-xl border border-gray-100 shadow-sm">
                  <div className="flex-1 min-w-0">
                    <h3 className="font-semibold text-sm truncate">{p.title}</h3>
                    <div className="flex items-center gap-2 text-xs text-gray-400 mt-0.5">
                      <span>{p.creator?.full_name}</span>
                      <span><Users size={10} className="inline" /> {p.members?.length}/{p.max_members}</span>
                    </div>
                  </div>
                  <DistanceBadge distance={p.distance} />
                  <ChevronRight size={14} className="text-gray-300" />
                </Link>
              ))
            )}
          </div>
        )}
      </div>
    </div>
  );
}
