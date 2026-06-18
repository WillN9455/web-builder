/**
 * NextAuth (Auth.js v4) configuration.
 *
 * Add or remove providers here — each is optional and gated by env vars.
 * The default config supports email magic link + Google OAuth.
 */

import type { NextAuthOptions } from 'next-auth';
import CredentialsProvider from 'next-auth/providers/credentials';
import GoogleProvider from 'next-auth/providers/google';
import EmailProvider from 'next-auth/providers/email';
import { verifyPassword } from './security';
import { db } from './db';
import { usersTable } from '../schema';
import { eq } from 'drizzle-orm';

// Email provider — requires SMTP env vars (SMTP_HOST, SMTP_USER, SMTP_PASS)
const emailProvider = process.env.SMTP_HOST
  ? {
      ...EmailProvider,
      server: {
        host: process.env.SMTP_HOST,
        port: parseInt(process.env.SMTP_PORT || '587'),
        username: process.env.SMTP_USER || '',
        password: process.env.SMTP_PASS || '',
      },
      from: process.env.SMTP_FROM || 'noreply@{{PROJECT_DOMAIN}}',
    }
  : null;

export const authOptions: NextAuthOptions = {
  // Session strategy — use JWT (stateless) by default; switch to 'database' for DB-backed sessions
  session: {
    strategy: 'jwt',
    maxAge: 30 * 24 * 60 * 60, // 30 days
  },

  // Pages — override default auth pages
  pages: {
    signIn: '/login',
    signOut: '/login',
    error: '/login',
  },

  // Callbacks — attach role to token and session
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.role = (user as unknown as Record<string, string>).role || 'user';
        token.id = (user as unknown as Record<string, string>).id;
      }
      return token;
    },

    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.sub || '';
        session.user.role = token.role as string;
      }
      return session;
    },
  },

  // Events — sync session creation with DB if using DB strategy
  events: {
    async createUser({ user }) {
      // User already created by provider callback — no extra step needed
    },
  },

  // Adapters — uncomment to use database strategy for sessions/tokens
  // adapter: PrismaAdapter(db),

  providers: [
    // Google OAuth
    ...(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET
      ? [
          GoogleProvider({
            clientId: process.env.GOOGLE_CLIENT_ID,
            clientSecret: process.env.GOOGLE_CLIENT_SECRET,
            authorization: {
              params: { prompt: 'consent' },
            },
          }),
        ]
      : []),

    // Email magic link
    ...(emailProvider ? [emailProvider] : []),

    // Credentials (email/password) — uncomment for custom auth form
    // CredentialsProvider({
    //   credentials: {
    //     email: { label: 'Email', type: 'email' },
    //     password: { label: 'Password', type: 'password' },
    //   },
    //   async authorize(credentials) {
    //     if (!credentials?.email || !credentials?.password) return null;
    //
    //     const user = await db.query.users.findFirst({
    //       where: eq(usersTable.email, credentials.email),
    //     });
    //     if (!user) return null;
    //
    //     const valid = await verifyPassword(credentials.password, user.passwordHash);
    //     if (!valid) return null;
    //
    //     return {
    //       id: user.id,
    //       email: user.email,
    //       name: user.name,
    //       role: user.role,
    //     };
    //   },
    // }),
  ],

  // Secret — fallback if NEXTAUTH_SECRET is not set (should never happen in prod)
  secret: process.env.NEXTAUTH_SECRET,
};
