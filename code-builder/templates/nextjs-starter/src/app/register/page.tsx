/**
 * Registration page — creates a new user account.
 */

import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { RegisterForm } from '@/components/auth/register-form';
import Link from 'next/link';

export default async function RegisterPage() {
  const session = await getServerSession(authOptions);

  if (session?.user) {
    return Response.redirect('/dashboard');
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-4 py-12">
      <div className="w-full max-w-md space-y-8">
        <div className="text-center">
          <h1 className="text-3xl font-bold tracking-tight text-neutral-900">Create an account</h1>
          <p className="mt-2 text-sm text-neutral-600">
            or{' '}
            <Link
              href="/login"
              className="font-medium text-brand-500 hover:text-brand-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500"
            >
              sign in to your account
            </Link>
          </p>
        </div>

        <RegisterForm />
      </div>
    </div>
  );
}
