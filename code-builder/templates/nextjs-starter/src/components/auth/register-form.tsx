'use client';

import { useState, useTransition } from 'react';
import { signIn } from 'next-auth/react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { registerSchema } from '@/lib/validations';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

interface RegisterFormProps {
  className?: string;
}

export function RegisterForm({ className }: RegisterFormProps) {
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm({
    resolver: zodResolver(registerSchema),
    defaultValues: { name: '', email: '', password: '' },
  });

  async function onSubmit(data: { name: string; email: string; password: string }) {
    setError(null);

    // Register via credentials (password stored in DB by auth handler)
    const result = await signIn('credentials', {
      redirect: false,
      name: data.name,
      email: data.email,
      password: data.password,
    });

    if (result?.error) {
      setError('Registration failed. Email may already be in use.');
      return;
    }

    startTransition(async () => {
      // Auto-sign-in after registration
      await signIn('credentials', {
        email: data.email,
        password: data.password,
        redirect: true,
        callbackUrl: '/dashboard',
      });
    });
  }

  return (
    <div className={cn('space-y-6', className)}>
      {error && (
        <div className="rounded-lg border border-error-500 bg-error-50 p-4 text-sm text-error-700" role="alert">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
        <Input {...register('name')} placeholder="Full name" error={errors.name?.message} />
        <Input {...register('email')} type="email" placeholder="Email address" error={errors.email?.message} />
        <Input {...register('password')} type="password" placeholder="Password (min 8 characters)" error={errors.password?.message} />

        <Button className="w-full" isLoading={isPending}>Create account</Button>
      </form>
    </div>
  );
}
