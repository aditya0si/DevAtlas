'use client';

import { forwardRef, ButtonHTMLAttributes } from 'react';
import { motion, HTMLMotionProps } from 'framer-motion';
import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

type ButtonVariant = 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger' | 'success';
type ButtonSize = 'sm' | 'md' | 'lg' | 'icon';

interface ButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'onAnimationStart' | 'onDrag' | 'onDragEnd' | 'onDragStart'> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  isLoading?: boolean;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
  fullWidth?: boolean;
}

const variantStyles: Record<ButtonVariant, string> = {
  primary: `
    bg-indigo-600 hover:bg-indigo-700 text-white
    shadow-lg shadow-indigo-500/25
    hover:shadow-indigo-500/40
    focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 focus:ring-offset-slate-900
    disabled:bg-indigo-800 disabled:text-indigo-300 disabled:shadow-none
  `,
  secondary: `
    bg-slate-700 hover:bg-slate-600 text-slate-200
    border border-slate-600
    focus:ring-2 focus:ring-slate-500 focus:ring-offset-2 focus:ring-offset-slate-900
    disabled:bg-slate-800 disabled:text-slate-500
  `,
  outline: `
    bg-transparent hover:bg-slate-800 text-slate-200
    border border-slate-600 hover:border-slate-500
    focus:ring-2 focus:ring-slate-500 focus:ring-offset-2 focus:ring-offset-slate-900
    disabled:text-slate-600
  `,
  ghost: `
    bg-transparent hover:bg-slate-800 text-slate-300
    focus:ring-2 focus:ring-slate-500 focus:ring-offset-2 focus:ring-offset-slate-900
    disabled:text-slate-600
  `,
  danger: `
    bg-red-600 hover:bg-red-700 text-white
    shadow-lg shadow-red-500/25
    focus:ring-2 focus:ring-red-500 focus:ring-offset-2 focus:ring-offset-slate-900
    disabled:bg-red-800 disabled:text-red-300
  `,
  success: `
    bg-emerald-600 hover:bg-emerald-700 text-white
    shadow-lg shadow-emerald-500/25
    focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2 focus:ring-offset-slate-900
    disabled:bg-emerald-800 disabled:text-emerald-300
  `,
};

const sizeStyles: Record<ButtonSize, string> = {
  sm: 'h-8 px-3 text-sm gap-1.5 rounded-lg',
  md: 'h-10 px-4 text-sm gap-2 rounded-xl',
  lg: 'h-12 px-6 text-base gap-2 rounded-xl',
  icon: 'h-10 w-10 p-0 rounded-xl',
};

const Button = forwardRef<HTMLButtonElement, ButtonProps>(({
  variant = 'primary',
  size = 'md',
  isLoading = false,
  leftIcon,
  rightIcon,
  fullWidth = false,
  className,
  disabled,
  children,
  ...props
}, ref) => {
  return (
    <motion.button
      ref={ref}
      whileHover={{ scale: disabled || isLoading ? 1 : 1.02 }}
      whileTap={{ scale: disabled || isLoading ? 1 : 0.98 }}
      transition={{ type: 'spring', stiffness: 400, damping: 17 }}
      className={cn(
        'inline-flex items-center justify-center font-medium',
        'transition-all duration-200',
        'focus:outline-none focus-visible:ring-2',
        'disabled:cursor-not-allowed',
        'active:scale-[0.98]',
        variantStyles[variant],
        sizeStyles[size],
        fullWidth && 'w-full',
        className
      )}
      disabled={disabled || isLoading}
      {...(props as HTMLMotionProps<'button'>)}
    >
      {isLoading ? (
        <>
          <Loader2 className="animate-spin" size={size === 'sm' ? 14 : size === 'lg' ? 20 : 16} />
          <span>{children}</span>
        </>
      ) : (
        <>
          {leftIcon && <span className="flex-shrink-0">{leftIcon}</span>}
          <span>{children}</span>
          {rightIcon && <span className="flex-shrink-0">{rightIcon}</span>}
        </>
      )}
    </motion.button>
  );
});

Button.displayName = 'Button';

export default Button;