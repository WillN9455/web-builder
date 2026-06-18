/**
 * NextAuth route handler — exposes /api/auth/* endpoints.
 * Handles sign-in, sign-out, callback flows for all providers.
 */

import NextAuth from 'next-auth';
import { authOptions } from '@/lib/auth';

const handler = NextAuth(authOptions);

// Export both GET and POST to cover all NextAuth routes (sign-in, callback, etc.)
export { handler as GET, handler as POST };
