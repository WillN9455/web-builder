/**
 * Landing page — the root route for new installations.
 * Replace with your actual home screen per PRD requirements.
 */

import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import Link from 'next/link';

export default async function HomePage() {
  const session = await getServerSession(authOptions);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-6 py-16 text-center">
      <h1 className="text-4xl font-bold tracking-tight text-neutral-900 sm:text-6xl">
        Welcome to {'{{PROJECT_NAME}}'}
      </h1>

      <p className="mt-6 max-w-2xl text-lg text-neutral-600">
        This is a fully functional Next.js starter scaffolded from the Idea-to-Web-Solution
        Framework. It includes authentication, database setup, API routing patterns,
        and design tokens ready for implementation.
      </p>

      <nav className="mt-10 flex flex-col gap-4 sm:flex-row" aria-label="Primary navigation">
        {session ? (
          <>
            <Link
              href="/dashboard"
              className="inline-flex items-center justify-center rounded-lg bg-brand-500 px-6 py-3 text-sm font-semibold text-white shadow-sm hover:bg-brand-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500"
            >
              Go to Dashboard
            </Link>
          </>
        ) : (
          <>
            <Link
              href="/login"
              className="inline-flex items-center justify-center rounded-lg bg-brand-500 px-6 py-3 text-sm font-semibold text-white shadow-sm hover:bg-brand-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500"
            >
              Sign In
            </Link>
            <Link
              href="/register"
              className="inline-flex items-center justify-center rounded-lg border border-neutral-200 bg-white px-6 py-3 text-sm font-semibold text-neutral-800 shadow-sm hover:bg-neutral-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500"
            >
              Create Account
            </Link>
          </>
        )}
      </nav>
    </div>
  );
}
