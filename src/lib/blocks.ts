'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from './supabase';
import { useAuth } from './auth';

/**
 * Bloqueo de usuarios.
 *
 * Google Play exige, para apps sociales con contenido generado por usuarios,
 * un sistema in-app tanto de denuncia COMO de bloqueo. Pintó solo tenía
 * denuncia (/reportar), que además únicamente estaba enlazada desde el
 * detalle de un plan: desde el perfil de una persona no había forma ni de
 * reportarla ni de bloquearla.
 *
 * El bloqueo se aplica en dos niveles:
 *  - servidor: la policy requests_insert impide pedir unirse a los planes de
 *    quien te bloqueó, y notify_on_plan_chat no manda push entre bloqueados;
 *  - cliente: estos hooks filtran los listados.
 */

export const BLOCKED_IDS_KEY = ['blocked_ids'] as const;

/** Ids de los usuarios que bloqueó el usuario actual. */
export function useBlockedIds() {
  const { user } = useAuth();

  const { data } = useQuery({
    queryKey: [...BLOCKED_IDS_KEY, user?.id],
    queryFn: async () => {
      if (!user) return [] as string[];
      const { data: rows, error } = await supabase
        .from('user_blocks')
        .select('blocked_id')
        .eq('blocker_id', user.id);
      if (error) {
        console.error('[blocks] no se pudieron leer los bloqueos:', error.message);
        return [] as string[];
      }
      return (rows ?? []).map(r => r.blocked_id as string);
    },
    enabled: !!user,
    staleTime: 60_000,
  });

  const blockedIds = data ?? [];
  return {
    blockedIds,
    blockedSet: new Set(blockedIds),
    isBlocked: (id: string | null | undefined) => !!id && blockedIds.includes(id),
  };
}

/** Bloquear / desbloquear a otra persona. */
export function useBlockUser() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: BLOCKED_IDS_KEY });
    // Los listados que filtran por bloqueos tienen que recargarse
    queryClient.invalidateQueries({ queryKey: ['social_plans'] });
    queryClient.invalidateQueries({ queryKey: ['activity_feed'] });
    queryClient.invalidateQueries({ queryKey: ['chat_messages'] });
  };

  const block = useMutation({
    mutationFn: async (targetId: string) => {
      if (!user) throw new Error('Iniciá sesión');
      if (targetId === user.id) throw new Error('No podés bloquearte a vos mismo');
      const { error } = await supabase
        .from('user_blocks')
        .insert({ blocker_id: user.id, blocked_id: targetId });
      // 23505 = ya estaba bloqueado; no es un error para el usuario
      if (error && error.code !== '23505') throw error;
    },
    onSuccess: invalidate,
  });

  const unblock = useMutation({
    mutationFn: async (targetId: string) => {
      if (!user) throw new Error('Iniciá sesión');
      const { error } = await supabase
        .from('user_blocks')
        .delete()
        .eq('blocker_id', user.id)
        .eq('blocked_id', targetId);
      if (error) throw error;
    },
    onSuccess: invalidate,
  });

  return { block, unblock };
}

/** Filtra una lista sacando lo que publicó alguien bloqueado. */
export function filterBlocked<T>(items: T[] | undefined, blocked: Set<string>, getUserId: (item: T) => string | null | undefined): T[] {
  if (!items) return [];
  if (blocked.size === 0) return items;
  return items.filter(item => {
    const id = getUserId(item);
    return !id || !blocked.has(id);
  });
}
