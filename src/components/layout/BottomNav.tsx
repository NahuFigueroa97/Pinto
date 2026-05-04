'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Home, Search, Users, Navigation, User, LayoutDashboard, Megaphone, MessageCircle, Wallet } from 'lucide-react';
import { useAuth } from '@/lib/auth';

const userNav = [
  { href: '/', label: 'Inicio', icon: Home, emoji: '🏠' },
  { href: '/feed', label: 'Feed', icon: Megaphone, emoji: '📣' },
  { href: '/explorar', label: 'Explorar', icon: Search, emoji: '🔍' },
  { href: '/planes', label: 'Planes', icon: Users, emoji: '🤝' },
  { href: '/cerca', label: 'Cerca', icon: Navigation, emoji: '📍' },
  { href: '/perfil', label: 'Perfil', icon: User, emoji: '😎' },
];

const businessNav = [
  { href: '/negocio', label: 'Panel', icon: LayoutDashboard, emoji: '📊' },
  { href: '/negocio/campanas', label: 'Promos', icon: Megaphone, emoji: '📢' },
  { href: '/negocio/mensajes', label: 'Mensajes', icon: MessageCircle, emoji: '💬' },
  { href: '/negocio/finanzas', label: 'Finanzas', icon: Wallet, emoji: '💰' },
  { href: '/perfil', label: 'Cuenta', icon: User, emoji: '⚙️' },
];

export function BottomNav() {
  const pathname = usePathname();
  const { role } = useAuth();

  if (pathname?.startsWith('/login') || pathname?.startsWith('/registro')) return null;
  if (role === 'admin' && pathname?.startsWith('/admin')) return null;

  const navItems = role === 'business' ? businessNav : userNav;

  return (
    <nav className="bottom-nav fixed bottom-0 inset-x-0 z-50 glass border-t border-gray-200/60 safe-bottom">
      <div className="flex items-center justify-around h-14 max-w-lg mx-auto px-2">
        {navItems.map(({ href, label, icon: Icon, emoji }) => {
          const isActive = href === '/' ? pathname === '/' : pathname?.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              className={`flex flex-col items-center gap-0.5 text-[0.65rem] font-medium transition-colors
                ${isActive ? 'text-brand-500' : 'text-gray-400 hover:text-gray-600'}`}
            >
              <Icon size={20} strokeWidth={isActive ? 2.5 : 1.8} />
              <span>{label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
