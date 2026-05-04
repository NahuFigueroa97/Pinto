import type { Metadata, Viewport } from 'next';
import './globals.css';
import { Providers } from '@/components/providers/Providers';
import { BottomNav } from '@/components/layout/BottomNav';

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
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body className="font-sans bg-gray-50 text-gray-900 antialiased">
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
