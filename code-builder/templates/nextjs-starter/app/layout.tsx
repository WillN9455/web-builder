import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import { Toaster } from 'sonner';
import { SessionProvider } from 'next-auth/react';
import { cn } from '@/lib/utils';
import './globals.css';

// Typography — change to your project font (Inter is the default)
const fontSans = Inter({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-sans',
});

export const metadata: Metadata = {
  title: {
    default: '{{PROJECT_NAME}}',
    template: `%s | {{PROJECT_NAME}}`,
  },
  description: '{{DESCRIPTION}}',
  robots: {
    index: true,
    follow: true,
  },
};

export default function RootLayout({
  children,
  params: { locale },
}: {
  children: React.ReactNode;
  params: { locale: string };
}) {
  return (
    <html lang={locale} suppressHydrationWarning>
      <body
        className={cn(
          'min-h-screen bg-neutral-50 font-sans text-neutral-800 antialiased',
          fontSans.variable,
        )}
      >
        {/* Skip navigation — WCAG 2.1 AA */}
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:absolute focus:top-4 focus:left-4 focus:bg-brand-500 focus:text-white focus:px-4 focus:py-2 focus:z-[100] focus:rounded-lg"
        >
          Skip to main content
        </a>

        <SessionProvider refetchInterval={5 * 60}>
          <main id="main-content">{children}</main>
        </SessionProvider>

        {/* Toast notifications */}
        <Toaster position="top-center" richColors />
      </body>
    </html>
  );
}
