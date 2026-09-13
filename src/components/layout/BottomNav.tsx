'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Home, Users, Bell, User, LayoutDashboard, Megaphone, MessageCircle } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { useUnreadCount } from '@/lib/inbox';
import { tap } from '@/lib/haptics';

/**
 * Barra inferior.
 *
 * Antes eran SEIS pestañas para usuarios: Inicio, Feed, Explorar, Planes,
 * Cerca, Perfil. Dos problemas.
 *
 * El de forma: en un teléfono de 360 px son 60 px por pestaña con etiqueta
 * de 10 px. Instagram, WhatsApp y TikTok usan cuatro o cinco, y no por
 * moda: abajo de ~64 px el pulgar empieza a errar.
 *
 * El de fondo, peor: CINCO de las seis eran "contenido". Nadie nuevo podía
 * saber la diferencia entre Inicio, Feed y Explorar, así que la barra no
 * enseñaba el modelo mental de la app, lo escondía.
 *
 * Ahora son cuatro y cada una es una intención distinta: descubrir (Inicio),
 * organizar (Planes), enterarse (Avisos), vos (Perfil). Explorar, Cerca y
 * Comunidad pasaron a ser accesos desde Inicio, que es de donde salen.
 */

const userNav = [
  { href: '/', label: 'Inicio', icon: Home },
  { href: '/planes', label: 'Planes', icon: Users },
  { href: '/avisos', label: 'Avisos', icon: Bell, conGlobo: true },
  { href: '/perfil', label: 'Perfil', icon: User },
];

const businessNav = [
  { href: '/negocio', label: 'Panel', icon: LayoutDashboard },
  { href: '/negocio/campanas', label: 'Promos', icon: Megaphone },
  { href: '/negocio/mensajes', label: 'Mensajes', icon: MessageCircle },
  { href: '/perfil', label: 'Cuenta', icon: User },
];

export function BottomNav() {
  const pathname = usePathname();
  const { role } = useAuth();
  const sinLeer = useUnreadCount();

  if (pathname?.startsWith('/login') || pathname?.startsWith('/registro')) return null;
  if (role === 'admin' && pathname?.startsWith('/admin')) return null;

  const navItems = role === 'business' ? businessNav : userNav;

  return (
    <nav className="bottom-nav fixed bottom-0 inset-x-0 z-50 glass border-t border-line-strong/60 safe-bottom">
      {/* h-16 y no h-14: con el ícono y la etiqueta, 56 px dejaban un área de
          toque por debajo del mínimo de 48 dp que pide Material. */}
      <div className="flex items-stretch justify-around h-16 max-w-lg mx-auto px-1">
        {navItems.map(({ href, label, icon: Icon, ...resto }) => {
          const isActive = href === '/'
            ? pathname === '/'
            : href === '/negocio'
              ? pathname === '/negocio'
              : pathname?.startsWith(href);
          const globo = 'conGlobo' in resto && resto.conGlobo ? sinLeer : 0;

          return (
            <Link
              key={href}
              href={href}
              onClick={() => void tap()}
              aria-label={label}
              aria-current={isActive ? 'page' : undefined}
              className={`relative flex-1 flex flex-col items-center justify-center gap-0.5 text-[0.65rem] font-medium transition-colors
                ${isActive ? 'text-brand-500' : 'text-faint active:text-muted'}`}
            >
              <span className="relative">
                <Icon size={22} strokeWidth={isActive ? 2.5 : 1.8} />

                {/*
                  El globito. El contador de no leídos existía pero vivía
                  adentro de una pantalla, así que sólo lo veías si ya habías
                  entrado. En una app social el globito ES el motivo de
                  volver: sin él todo depende del push, que es justo lo que
                  el usuario puede apagar.
                */}
                {globo > 0 && (
                  <span
                    aria-label={`${globo} sin leer`}
                    className="absolute -top-1.5 -right-2 min-w-[18px] h-[18px] px-1 rounded-full bg-brand-500 text-white text-[0.6rem] font-bold flex items-center justify-center ring-2 ring-canvas"
                  >
                    {globo > 99 ? '99+' : globo}
                  </span>
                )}
              </span>
              <span>{label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
