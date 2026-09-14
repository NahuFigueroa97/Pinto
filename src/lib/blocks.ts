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

export interface PerfilBloqueado {
  id: string;
  full_name: string | null;
  avatar_url: string | null;
  blocked_at: string;
}

/**
 * Los perfiles que bloqueaste, con nombre y foto.
 *
 * useBlockedIds sólo devuelve ids, que sirve para filtrar listados pero no
 * para mostrarle a alguien a quién tiene bloqueado. Sin esta consulta no hay
 * forma de armar la pantalla de "Bloqueados" — y sin esa pantalla no hay
 * forma de desbloquear a nadie, porque al bloquear a alguien desaparece de
 * todos los listados y su perfil deja de ser alcanzable.
 *
 * El hint !blocked_id no es opcional: user_blocks tiene DOS claves foráneas
 * a profiles (blocker_id y blocked_id), así que sin decir cuál se usa,
 * PostgREST falla con PGRST201.
 */
export function useBlockedProfiles() {
  const { user } = useAuth();

  return useQuery({
    queryKey: [...BLOCKED_IDS_KEY, 'perfiles', user?.id],
    queryFn: async () => {
      if (!user) return [] as PerfilBloqueado[];
      const { data, error } = await supabase
        .from('user_blocks')
        .select('created_at, blocked:profiles!blocked_id(id, full_name, avatar_url)')
        .eq('blocker_id', user.id)
        .order('created_at', { ascending: false });
      if (error) throw error;

      type Embebido = {
        created_at: string;
        // Sin tipos generados, supabase-js asume que todo embed es una lista
        // aunque la relación sea a-uno. En runtime acá viene un objeto.
        blocked: PerfilBloqueado | PerfilBloqueado[] | null;
      };

      return ((data ?? []) as unknown as Embebido[]).flatMap((fila) => {
        const p = Array.isArray(fila.blocked) ? fila.blocked[0] : fila.blocked;
        // Si el perfil se borró, la fila de bloqueo sobra: no hay a quién mostrar.
        return p ? [{ ...p, blocked_at: fila.created_at }] : [];
      });
    },
    enabled: !!user,
  });
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
