/**
 * Next.js Middleware
 *
 * Runs on every request before the handler. Used for:
 * - Auth guard (redirect unauthenticated users to login)
 * - RBAC (role-based access control) on specific routes
 * - Rate limiting headers
 */

import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getToken } from 'next-auth/jwt';

// Routes that require authentication
const AUTH_REQUIRED = ['/dashboard', '/settings', '/profile'];

// Admin-only routes
const ADMIN_ONLY = ['/admin'];

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Skip middleware for static assets, API auth routes, and public paths
  if (
    pathname.startsWith('/_next') ||
    pathname.startsWith('/api/auth') ||
    pathname.startsWith('/favicon')
  ) {
    return NextResponse.next();
  }

  // Get token directly from cookies (lighter than full session)
  const token = await getToken({ req: request, secret: process.env.NEXTAUTH_SECRET });

  // Auth guard
  if (AUTH_REQUIRED.some((route) => pathname.startsWith(route))) {
    if (!token) {
      const loginUrl = new URL('/login', request.url);
      loginUrl.searchParams.set('callbackUrl', pathname);
      return NextResponse.redirect(loginUrl);
    }
  }

  // Admin-only guard
  if (ADMIN_ONLY.some((route) => pathname.startsWith(route))) {
    if (!token || token.role !== 'admin') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
  }

  // Add auth headers for downstream use (debugging, analytics)
  const response = NextResponse.next();
  if (token) {
    response.headers.set('x-user-id', token.sub || '');
    response.headers.set('x-user-role', token.role || 'user');
  }
  return response;
}

// Which routes should this middleware run on?
export const config = {
  matcher: ['/((?!.*\\..*|_next).*)'], // Run on all routes except static files
};
