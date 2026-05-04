'use client';

import Link from 'next/link';
import { MapPin, Shield, Calendar, Star } from 'lucide-react';
import type { Profile } from '@/types/database';

interface ProfileCardProps {
  profile: Profile;
  compact?: boolean;
  showActions?: boolean;
  onAccept?: () => void;
  onReject?: () => void;
  message?: string | null;
}

function getAge(birthYear: number | null): string | null {
  if (!birthYear) return null;
  const age = new Date().getFullYear() - birthYear;
  if (age < 18) return '18-';
  if (age <= 25) return '18-25';
  if (age <= 35) return '26-35';
  if (age <= 45) return '36-45';
  return '45+';
}

function getReputationColor(score: number): string {
  if (score >= 80) return 'text-green-600 bg-green-50';
  if (score >= 60) return 'text-blue-600 bg-blue-50';
  if (score >= 40) return 'text-yellow-600 bg-yellow-50';
  return 'text-red-600 bg-red-50';
}

export function ProfileCard({ profile, compact, showActions, onAccept, onReject, message }: ProfileCardProps) {
  const ageRange = profile.show_age ? getAge(profile.birth_year) : null;

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
      <Link href={`/perfil/ver?id=${profile.id}`} className="block p-4">
        <div className="flex items-start gap-3">
          {/* Avatar */}
          <div className="w-14 h-14 rounded-xl bg-brand-100 flex items-center justify-center text-xl font-bold text-brand-600 shrink-0">
            {profile.avatar_url ? (
              <img src={profile.avatar_url} alt="" className="w-full h-full rounded-xl object-cover" />
            ) : (
              profile.full_name?.[0]?.toUpperCase() ?? '?'
            )}
          </div>

          {/* Info */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <h3 className="font-semibold text-sm truncate">{profile.full_name}</h3>
              {ageRange && <span className="text-xs text-gray-400">{ageRange}</span>}
            </div>

            {profile.bio && !compact && (
              <p className="text-xs text-gray-500 mt-0.5 line-clamp-2">{profile.bio}</p>
            )}

            <div className="flex flex-wrap items-center gap-2 mt-1.5">
              {/* Reputation */}
              <span className={`flex items-center gap-0.5 text-[0.65rem] font-medium px-2 py-0.5 rounded-full ${getReputationColor(profile.reputation_score)}`}>
                <Shield size={10} /> {profile.reputation_score}
              </span>

              {/* Zone */}
              {(profile.zone as any)?.name && (
                <span className="flex items-center gap-0.5 text-[0.65rem] text-gray-400">
                  <MapPin size={10} /> {(profile.zone as any).name}
                </span>
              )}

              {/* Stats */}
              <span className="flex items-center gap-0.5 text-[0.65rem] text-gray-400">
                <Calendar size={10} /> {profile.plans_created_count} creados · {profile.plans_joined_count} unidos
              </span>
            </div>

            {/* Interests */}
            {profile.interests_text && !compact && (
              <p className="text-[0.65rem] text-gray-400 mt-1 truncate">🏷 {profile.interests_text}</p>
            )}
          </div>
        </div>
      </Link>

      {/* Message from applicant */}
      {message && (
        <div className="px-4 pb-2">
          <p className="text-xs text-gray-500 bg-gray-50 rounded-lg px-3 py-2 italic">&ldquo;{message}&rdquo;</p>
        </div>
      )}

      {/* Actions */}
      {showActions && (
        <div className="flex border-t border-gray-100">
          <button
            onClick={onReject}
            className="flex-1 py-3 text-sm font-medium text-red-500 hover:bg-red-50 transition"
          >
            Rechazar
          </button>
          <div className="w-px bg-gray-100" />
          <button
            onClick={onAccept}
            className="flex-1 py-3 text-sm font-medium text-green-600 hover:bg-green-50 transition"
          >
            Aceptar
          </button>
        </div>
      )}
    </div>
  );
}
