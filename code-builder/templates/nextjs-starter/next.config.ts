import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // Images — optimize for production delivery
  images: {
    formats: ['image/avif', 'image/webp'],
    // Replace with your CDN/domain, e.g. 'https://cdn.yourapp.com'
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '**',
      },
    ],
  },

  // Headers — security headers (CSP, HSTS, X-Frame, etc.)
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'X-XSS-Protection', value: '1; mode=block' },
          {
            key: 'Strict-Transport-Security',
            value: 'max-age=31536000; includeSubDomains',
          },
        ],
      },
    ];
  },

  // Redirects — canonical URL, old routes
  async redirects() {
    return [];
  },
};

export default nextConfig;
