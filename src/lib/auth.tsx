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
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .single();
    if (error) {
      // El error se descartaba en silencio. Sin perfil, `role` cae a 'user'
      // y un dueño de negocio se queda sin su panel sin saber por qué.
      console.error('[auth] no se pudo cargar el perfil:', error.message);
      return null;
    }
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

    /**
     * El callback es SÍNCRONO a propósito.
     *
     * supabase-js espera (`await`) a todos los suscriptores de
     * onAuthStateChange, y lo hace desde adentro del lock de auth. Si acá se
     * hacía `await fetchProfile(...)`, el lock quedaba tomado durante toda
     * una ida y vuelta a la base — o sea que cada consulta de cualquier
     * pantalla, que necesita el token y por lo tanto el lock, esperaba a que
     * terminara. Y peor: esa carga del perfil vuelve a pedir el lock desde
     * adentro del lock.
     *
     * Devolviendo sincrónicamente, supabase-js no espera nada y suelta el
     * lock enseguida. El perfil se carga afuera y apaga el `loading` cuando
     * termina, así que lo que ve la UI no cambia.
     */
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      const u = session?.user ?? null;
      setUser(u);

      if (!u) {
        setProfile(null);
        setLoading(false);
        return;
      }

      void (async () => {
        try {
          await fetchProfile(u.id);
          if (PUSH_EVENTS.has(event)) void initPushNotifications(u.id);
        } catch (err) {
          // Si esto quedaba sin atrapar, `setLoading(false)` no corría nunca
          // y la app entera se quedaba en "cargando" hasta reiniciarla.
          console.error('[auth] fallo al cargar el perfil:', err);
        } finally {
          setLoading(false);
        }
      })();
    });

    // supabase-js ya emite INITIAL_SESSION en el listener de arriba, así que
    // este getSession() solo sirve de red de seguridad para apagar el loading
    // si el evento no llega (p. ej. storage bloqueado).
    supabase.auth.getSession()
      .then(({ data: { session } }) => { if (!session) setLoading(false); })
      .catch((err) => {
        // Sin el catch, un getSession rechazado era una promesa sin manejar
        // y la red de seguridad no servía justo cuando más hacía falta.
        console.error('[auth] getSession falló:', err);
        setLoading(false);
      });

    // Último recurso. Si en 15 s ni el listener ni getSession apagaron el
    // loading —el lock de auth trabado es el caso típico— la app arranca
    // como si no hubiera sesión. Es peor no arrancar: desde la pantalla de
    // login se puede reintentar, desde una rueda que gira no se puede nada.
    const bail = setTimeout(() => setLoading(false), 15_000);

    return () => {
      clearTimeout(bail);
      subscription.unsubscribe();
    };
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
