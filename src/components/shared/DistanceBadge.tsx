'use client';

import { MapPin } from 'lucide-react';
import { formatDistance } from '@/lib/geolocation';

interface DistanceBadgeProps {
  distance: number; // in km
  className?: string;
}

export function DistanceBadge({ distance, className = '' }: DistanceBadgeProps) {
  if (!isFinite(distance)) return null;

  const color = distance < 1
    ? 'text-green-600 bg-green-50'
    : distance < 5
      ? 'text-blue-600 bg-blue-50'
      : 'text-gray-500 bg-gray-50';

  return (
    <span className={`inline-flex items-center gap-0.5 text-[0.65rem] font-medium px-2 py-0.5 rounded-full ${color} ${className}`}>
      <MapPin size={10} />
      {formatDistance(distance)}
    </span>
  );
}
