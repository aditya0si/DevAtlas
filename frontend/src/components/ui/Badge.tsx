'use client';

import { forwardRef, HTMLAttributes } from 'react';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';

type BadgeVariant = 'default' | 'primary' | 'secondary' | 'success' | 'warning' | 'error' | 'outline';
type BadgeSize = 'sm' | 'md' | 'lg';

interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  variant?: BadgeVariant;
  size?: BadgeSize;
  pulse?: boolean;
  dot?: boolean;
}

const variantStyles: Record<BadgeVariant, string> = {
  default: 'bg-slate-700 text-slate-300 border-slate-600',
  primary: 'bg-indigo-500/20 text-indigo-400 border-indigo-500/30',
  secondary: 'bg-violet-500/20 text-violet-400 border-violet-500/30',
  success: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
  warning: 'bg-amber-500/20 text-amber-400 border-amber-500/30',
  error: 'bg-red-500/20 text-red-400 border-red-500/30',
  outline: 'bg-transparent text-slate-400 border-slate-600',
};

const sizeStyles: Record<BadgeSize, string> = {
  sm: 'text-[10px] px-1.5 py-0.5',
  md: 'text-xs px-2 py-0.5',
  lg: 'text-sm px-3 py-1',
};

const Badge = forwardRef<HTMLSpanElement, BadgeProps>(({
  variant = 'default',
  size = 'md',
  pulse = false,
  dot = false,
  className,
  children,
}, ref) => {
  return (
    <motion.span
      ref={ref}
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.2 }}
      className={cn(
        'inline-flex items-center gap-1.5 font-medium rounded-full border',
        variantStyles[variant],
        sizeStyles[size],
        className
      )}
    >
      {dot && (
        <span className={cn(
          'w-1.5 h-1.5 rounded-full',
          variant === 'success' && 'bg-emerald-400',
          variant === 'warning' && 'bg-amber-400',
          variant === 'error' && 'bg-red-400',
          variant === 'primary' && 'bg-indigo-400',
          variant === 'secondary' && 'bg-violet-400',
          variant === 'default' && 'bg-slate-400',
          variant === 'outline' && 'bg-slate-400',
          pulse && 'animate-pulse'
        )} />
      )}
      {children}
    </motion.span>
  );
});

Badge.displayName = 'Badge';

// Live Badge Component
interface LiveBadgeProps extends HTMLAttributes<HTMLSpanElement> {
  showText?: boolean;
}

const LiveBadge = forwardRef<HTMLSpanElement, LiveBadgeProps>(({
  showText = true,
  className,
}, ref) => {
  return (
    <span
      ref={ref}
      className={cn(
        'inline-flex items-center gap-1.5 px-2 py-1 bg-emerald-500/20 border border-emerald-500/30 rounded-full',
        className
      )}
    >
      <span className="relative flex h-2 w-2">
        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
        <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
      </span>
      {showText && <span className="text-xs font-medium text-emerald-400">Live</span>}
    </span>
  );
});

LiveBadge.displayName = 'LiveBadge';

// Status Badge Component
interface StatusBadgeProps extends HTMLAttributes<HTMLSpanElement> {
  status: 'online' | 'offline' | 'away' | 'busy';
}

const statusStyles = {
  online: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
  offline: 'bg-slate-500/20 text-slate-400 border-slate-500/30',
  away: 'bg-amber-500/20 text-amber-400 border-amber-500/30',
  busy: 'bg-red-500/20 text-red-400 border-red-500/30',
};

const StatusBadge = forwardRef<HTMLSpanElement, StatusBadgeProps>(({
  status,
  className,
}, ref) => {
  return (
    <span
      ref={ref}
      className={cn(
        'inline-flex items-center gap-1.5 px-2 py-1 rounded-full border text-xs font-medium',
        statusStyles[status],
        className
      )}
    >
      <span className={cn(
        'w-1.5 h-1.5 rounded-full',
        status === 'online' && 'bg-emerald-400',
        status === 'offline' && 'bg-slate-400',
        status === 'away' && 'bg-amber-400',
        status === 'busy' && 'bg-red-400'
      )} />
      {status.charAt(0).toUpperCase() + status.slice(1)}
    </span>
  );
});

StatusBadge.displayName = 'StatusBadge';

export { Badge, LiveBadge, StatusBadge };