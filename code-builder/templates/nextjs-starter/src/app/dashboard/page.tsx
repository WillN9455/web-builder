/**
 * Dashboard — authenticated home screen.
 */

import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { redirect } from 'next/navigation';

export default async function DashboardPage() {
  const session = await getServerSession(authOptions);

  // Guard — should also be caught by middleware, but double-check server-side
  if (!session?.user) {
    redirect('/login');
  }

  return (
    <div className="px-6 py-12">
      <header className="mb-8">
        <h1 className="text-3xl font-bold tracking-tight text-neutral-900">Dashboard</h1>
        <p className="mt-1 text-sm text-neutral-600">
          Welcome back, {session.user.name || session.user.email}
        </p>
      </header>

      {/* Placeholder for dashboard content */}
      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        <div className="rounded-xl border border-neutral-200 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-neutral-900">Content</h2>
          <p className="mt-2 text-sm text-neutral-600">Your content goes here.</p>
        </div>
        <div className="rounded-xl border border-neutral-200 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-neutral-900">Settings</h2>
          <p className="mt-2 text-sm text-neutral-600">Manage your preferences.</p>
        </div>
        <div className="rounded-xl border border-neutral-200 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-neutral-900">Analytics</h2>
          <p className="mt-2 text-sm text-neutral-600">View your activity.</p>
        </div>
      </div>
    </div>
  );
}
