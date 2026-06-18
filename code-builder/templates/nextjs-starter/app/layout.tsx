import type { Metadata } from 'next';
import './globals.css';

// Cross-references for this file:
// - {{PROJECT_NAME}} → PRD §1 Main Feature (feature name)
// - {{PRIMARY_FONT}} → design-system/tokens/typography.md font-family selection
// - {{DESCRIPTION}} → PRD §2 Problem Alignment (one-sentence problem statement)
// - Skip navigation link accessibility → accessibility-guidelines.md §Keyboard Accessibility ("skip navigation link as first tab stop")
// - font-sans → typography.md --ds-font-family-sans token
// - text-neutral-800 → color.md neutral-800 (#1F2937) for primary text
// - Security headers (X-Frame-Options, CSP, etc.) → security-guidelines.md §Headers & Configuration (add in middleware or via next.config.ts)
// - Template selection reason → config-rules.md Frontend Framework table (React + Next.js chosen per user input)

// TODO: Replace {{PROJECT_NAME}} with actual project name
// TODO: Replace {{PRIMARY_FONT}} with chosen font family
// TODO: Replace {{DESCRIPTION}} with SEO description from PRD

export const metadata: Metadata = {
  title: '{{PROJECT_NAME}}',
  description: '{{DESCRIPTION}}',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="font-sans text-neutral-800 antialiased">
        {/* Skip navigation link — WCAG requirement */}
        <a href="#main-content" className="sr-only focus:not-sr-only focus:absolute focus:top-4 focus:left-4 focus:bg-brand-primary-500 focus:text-white focus:px-4 focus:py-2 focus:z-[100]">
          Skip to main content
        </a>
        <main id="main-content">{children}</main>
      </body>
    </html>
  );
}
