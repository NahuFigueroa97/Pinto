'use client';

import { createContext, useContext, useEffect, useState, useCallback, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import type { Profile, UserRole } from '@/types/database';
import { initPushNotifications, unregisterPush } from '@/lib/pushNotifications';
import type { User } from '@supabase/supabase-js';

interface AuthState {
  user: User | null;
  profile: Profile | null;
  role: UserRole;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string, fullName: string, role?: UserRole) => Promise<void>;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchProfile = useCallback(async (userId: string) => {
    const { data } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .single();
    if (data) setProfile(data as Profile);
    return data as Profile | null;
  }, []);

  const signIn = useCallback(async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
  }, []);

  const signUp = useCallback(async (email: string, password: string, fullName: string, role: UserRole = 'user') => {
    const { error, data } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { full_name: fullName, role } },
    });
    if (error) throw error;
    // Profile is created by DB trigger
    if (data.user) {
      // Wait a moment for trigger to execute
      setTimeout(() => fetchProfile(data.user!.id), 500);
    }
  }, [fetchProfile]);

  const signOut = useCallback(async () => {
    // Primero se borra el token de push: después de signOut() el RPC ya no
    // tendría sesión y el token quedaría asociado al usuario anterior,
    // que seguiría recibiendo los avisos en ese teléfono.
    await unregisterPush();
    await supabase.auth.signOut();
    setUser(null);
    setProfile(null);
  }, []);

  const refreshProfile = useCallback(async () => {
    if (user) await fetchProfile(user.id);
  }, [user, fetchProfile]);

  useEffect(() => {
    // onAuthStateChange dispara también en TOKEN_REFRESHED y USER_UPDATED, que
    // ocurren cada hora y en cada vuelta a primer plano. Inicializar el push en
    // todos esos eventos re-suscribía los listeners de Capacitor una y otra vez.
    const PUSH_EVENTS = new Set(['INITIAL_SESSION', 'SIGNED_IN']);

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      const u = session?.user ?? null;
      setUser(u);
      if (u) {
        await fetchProfile(u.id);
        if (PUSH_EVENTS.has(event)) void initPushNotifications(u.id);
      } else {
        setProfile(null);
      }
      setLoading(false);
    });

    // supabase-js ya emite INITIAL_SESSION en el listener de arriba, así que
    // este getSession() solo sirve de red de seguridad para apagar el loading
    // si el evento no llega (p. ej. storage bloqueado).
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, [fetchProfile]);

  return (
    <AuthContext.Provider value={{
      user,
      profile,
      role: profile?.role ?? 'user',
      loading,
      signIn,
      signUp,
      signOut,
      refreshProfile,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
