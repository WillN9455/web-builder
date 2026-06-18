import * as React from 'react';
import { cn } from '@/lib/utils';

export interface InputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'size'> {
  error?: string;
}

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, error, ...props }, ref) => (
    <div className="space-y-1">
      <input
        ref={ref}
        type={type}
        className={cn(
          'flex h-10 w-full rounded-lg border bg-white px-3 py-2 text-sm transition-colors',
          'placeholder:text-neutral-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2',
          'disabled:pointer-events-none disabled:opacity-50',
          error && 'border-error-500 focus-visible:ring-error-500',
          !error && 'border-neutral-200 focus-visible:border-brand-500',
          className,
        )}
        {...props}
      />
      {error && <p className="text-xs text-error-500">{error}</p>}
    </div>
  ),
);
Input.displayName = 'Input';

export { Input };
