'use client';

import { useState, useEffect, useCallback } from 'react';
import { Geolocation } from '@capacitor/geolocation';

interface UserLocation {
  lat: number;
  lng: number;
}

interface UseLocationReturn {
  location: UserLocation | null;
  loading: boolean;
  error: string | null;
  requestLocation: () => Promise<void>;
}

export function useUserLocation(): UseLocationReturn {
  const [location, setLocation] = useState<UserLocation | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const requestLocation = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const perm = await Geolocation.checkPermissions();

      if (perm.location !== 'granted') {
        const req = await Geolocation.requestPermissions();

        if (req.location !== 'granted') {
          setError('Permiso de ubicación denegado');
          return;
        }
      }

      const position = await Geolocation.getCurrentPosition({
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 300000,
      });

      setLocation({
        lat: position.coords.latitude,
        lng: position.coords.longitude,
      });
    } catch (err: any) {
      setError(err?.message || 'Error al obtener ubicación');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    requestLocation();
  }, [requestLocation]);

  return { location, loading, error, requestLocation };
}

/**
 * Haversine distance between two points in km
 */
export function haversineDistance(
  lat1: number, lng1: number,
  lat2: number, lng2: number
): number {
  const R = 6371;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
    Math.sin(dLng / 2) * Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function toRad(deg: number): number {
  return deg * (Math.PI / 180);
}

/**
 * Format distance for display
 */
export function formatDistance(km: number): string {
  if (km < 0.1) return 'Aquí mismo';
  if (km < 1) return `${Math.round(km * 1000)} m`;
  if (km < 10) return `${km.toFixed(1)} km`;
  return `${Math.round(km)} km`;
}

/**
 * Sort items by distance from user. Items must have latitude/longitude.
 */
export function sortByDistance<T extends { latitude?: number | null; longitude?: number | null }>(
  items: T[],
  userLat: number,
  userLng: number
): (T & { distance: number })[] {
  return items
    .map((item) => ({
      ...item,
      distance:
        item.latitude != null && item.longitude != null
          ? haversineDistance(userLat, userLng, item.latitude, item.longitude)
          : Infinity,
    }))
    .sort((a, b) => a.distance - b.distance);
}
