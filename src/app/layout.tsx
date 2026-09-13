import type { Metadata, Viewport } from 'next';
import { Inter, Outfit } from 'next/font/google';
import './globals.css';
import { Providers } from '@/components/providers/Providers';
import { BottomNav } from '@/components/layout/BottomNav';
import { SCRIPT_ANTI_PARPADEO } from '@/lib/theme';

// Self-hosted: next/font descarga las fuentes en build time y las empaqueta
// en el APK. Sin esto no hay tipografía de marca offline.
const inter = Inter({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-inter',
  display: 'swap',
});

const outfit = Outfit({
  subsets: ['latin'],
  weight: ['500', '600', '700', '800'],
  variable: '--font-outfit',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'Pintó – Descubrí qué hacer hoy en Catamarca',
  description: 'Encontrá promos, planes y experiencias reales cerca tuyo. Pintó es la app de activación local de San Fernando del Valle de Catamarca.',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: 'cover',
  // La barra de estado de Android acompaña el tema en vez de quedar de un
  // color que no pega con ninguno de los dos.
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#F9FAFB' },
    { media: '(prefers-color-scheme: dark)', color: '#0B0F14' },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es" className={`${inter.variable} ${outfit.variable}`}>
      <body className="font-sans bg-canvas text-ink antialiased">
        {/*
          Antes de que React hidrate: si no, la app pinta en claro y recién
          después se pone oscura. Un fogonazo blanco en cada arranque, que
          de noche encandila.
        */}
        <script dangerouslySetInnerHTML={{ __html: SCRIPT_ANTI_PARPADEO }} />
        <Providers>
          <main className="min-h-screen pb-16">
            {children}
          </main>
          <BottomNav />
        </Providers>
      </body>
    </html>
  );
}
