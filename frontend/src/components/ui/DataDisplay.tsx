'use client';

import { forwardRef, HTMLAttributes, useState, useRef, ReactNode } from 'react';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';

// Avatar Component
interface AvatarProps extends HTMLAttributes<HTMLDivElement> {
  src?: string | null;
  alt?: string;
  fallback?: string;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  status?: 'online' | 'offline' | 'busy' | 'away';
}

const avatarSizes = {
  sm: 'w-8 h-8 text-xs',
  md: 'w-10 h-10 text-sm',
  lg: 'w-12 h-12 text-base',
  xl: 'w-16 h-16 text-lg',
};

const statusColors = {
  online: 'bg-emerald-500',
  offline: 'bg-slate-500',
  busy: 'bg-red-500',
  away: 'bg-amber-500',
};

const Avatar = forwardRef<HTMLDivElement, AvatarProps>(({
  src,
  alt = '',
  fallback,
  size = 'md',
  status,
  className,
}, ref) => {
  const [imageError, setImageError] = useState(false);
  
  const initials = fallback || alt
    .split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);

  return (
    <div ref={ref} className={cn('relative inline-flex', className)}>
      <div
        className={cn(
          'rounded-full bg-slate-700 flex items-center justify-center overflow-hidden',
          'border-2 border-slate-600',
          avatarSizes[size]
        )}
      >
        {src && !imageError ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={src}
            alt={alt}
            onError={() => setImageError(true)}
            className="w-full h-full object-cover"
          />
        ) : (
          <span className="text-slate-300 font-medium">{initials}</span>
        )}
      </div>
      
      {status && (
        <span
          className={cn(
            'absolute bottom-0 right-0 block rounded-full ring-2 ring-slate-900',
            statusColors[status],
            size === 'sm' ? 'w-2 h-2' : 'w-3 h-3'
          )}
        />
      )}
    </div>
  );
});

Avatar.displayName = 'Avatar';

// Avatar Group (multiple avatars stacked)
interface AvatarGroupProps extends HTMLAttributes<HTMLDivElement> {
  avatars: { src?: string | null; alt?: string; fallback?: string }[];
  max?: number;
  size?: 'sm' | 'md' | 'lg';
}

const AvatarGroup = forwardRef<HTMLDivElement, AvatarGroupProps>(({
  avatars,
  max = 4,
  size = 'md',
  className,
}, ref) => {
  const visibleAvatars = avatars.slice(0, max);
  const remainingCount = avatars.length - max;

  return (
    <div ref={ref} className={cn('flex -space-x-2', className)}>
      {visibleAvatars.map((avatar, i) => (
        <Avatar
          key={i}
          src={avatar.src}
          alt={avatar.alt}
          fallback={avatar.fallback}
          size={size}
          className="ring-2 ring-slate-900"
        />
      ))}
      {remainingCount > 0 && (
        <div
          className={cn(
            'rounded-full bg-slate-700 flex items-center justify-center',
            'ring-2 ring-slate-900 text-slate-400 font-medium',
            avatarSizes[size]
          )}
        >
          +{remainingCount}
        </div>
      )}
    </div>
  );
});

AvatarGroup.displayName = 'AvatarGroup';

// Tooltip Component
interface TooltipProps extends Omit<HTMLAttributes<HTMLDivElement>, 'content'> {
  content: ReactNode;
  position?: 'top' | 'bottom' | 'left' | 'right';
  delay?: number;
}

const Tooltip = forwardRef<HTMLDivElement, TooltipProps>(({
  content,
  position = 'top',
  delay = 200,
  className,
  children,
}, ref) => {
  const [isVisible, setIsVisible] = useState(false);
  const timeoutRef = useRef<NodeJS.Timeout>();

  const showTooltip = () => {
    timeoutRef.current = setTimeout(() => setIsVisible(true), delay);
  };

  const hideTooltip = () => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    setIsVisible(false);
  };

  const positionStyles = {
    top: 'bottom-full left-1/2 -translate-x-1/2 mb-2',
    bottom: 'top-full left-1/2 -translate-x-1/2 mt-2',
    left: 'right-full top-1/2 -translate-y-1/2 mr-2',
    right: 'left-full top-1/2 -translate-y-1/2 ml-2',
  };

  return (
    <div
      ref={ref}
      className="relative inline-flex"
      onMouseEnter={showTooltip}
      onMouseLeave={hideTooltip}
    >
      {children}
      
      {isVisible && (
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.1 }}
          className={cn(
            'absolute z-50 px-2 py-1 text-xs font-medium text-slate-200',
            'bg-slate-700 border border-slate-600 rounded-lg shadow-lg whitespace-nowrap',
            positionStyles[position],
            className
          )}
        >
          {content}
        </motion.div>
      )}
    </div>
  );
});

Tooltip.displayName = 'Tooltip';

// Progress Circle
interface ProgressCircleProps extends HTMLAttributes<HTMLDivElement> {
  value: number;
  max?: number;
  size?: number;
  strokeWidth?: number;
  showValue?: boolean;
}

const ProgressCircle = forwardRef<HTMLDivElement, ProgressCircleProps>(({
  value,
  max = 100,
  size = 64,
  strokeWidth = 4,
  showValue = true,
  className,
}, ref) => {
  const percentage = Math.min(Math.max((value / max) * 100, 0), 100);
  const radius = (size - strokeWidth) / 2;
  const circumference = radius * 2 * Math.PI;
  const offset = circumference - (percentage / 100) * circumference;

  return (
    <div ref={ref} className={cn('relative inline-flex items-center justify-center', className)}>
      <svg width={size} height={size} className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="currentColor"
          strokeWidth={strokeWidth}
          className="text-slate-700"
        />
        <motion.circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="currentColor"
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={circumference}
          initial={{ strokeDashoffset: circumference }}
          animate={{ strokeDashoffset: offset }}
          transition={{ duration: 0.5, ease: 'easeOut' }}
          className="text-indigo-500"
        />
      </svg>
      {showValue && (
        <span className="absolute text-sm font-medium text-slate-200">
          {Math.round(percentage)}%
        </span>
      )}
    </div>
  );
});

ProgressCircle.displayName = 'ProgressCircle';

// Empty State Component
interface EmptyStateProps extends HTMLAttributes<HTMLDivElement> {
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
}

const EmptyState = forwardRef<HTMLDivElement, EmptyStateProps>(({
  icon,
  title,
  description,
  action,
  className,
}, ref) => {
  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className={cn(
        'flex flex-col items-center justify-center text-center py-12 px-4',
        className
      )}
    >
      {icon && (
        <div className="mb-4 text-slate-500">
          {icon}
        </div>
      )}
      <h3 className="text-lg font-medium text-slate-200 mb-2">{title}</h3>
      {description && (
        <p className="text-sm text-slate-500 max-w-sm mb-4">{description}</p>
      )}
      {action}
    </motion.div>
  );
});

EmptyState.displayName = 'EmptyState';

// Error State Component
interface ErrorStateProps extends HTMLAttributes<HTMLDivElement> {
  title?: string;
  message?: string;
  onRetry?: () => void;
}

const ErrorState = forwardRef<HTMLDivElement, ErrorStateProps>(({
  title = 'Something went wrong',
  message = 'An error occurred while loading this content.',
  onRetry,
  className,
}, ref) => {
  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className={cn(
        'flex flex-col items-center justify-center text-center py-12 px-4',
        className
      )}
    >
      <div className="mb-4 text-4xl">??</div>
      <h3 className="text-lg font-medium text-slate-200 mb-2">{title}</h3>
      <p className="text-sm text-slate-500 max-w-sm mb-4">{message}</p>
      {onRetry && (
        <button
          onClick={onRetry}
          className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-lg transition-colors"
        >
          Try Again
        </button>
      )}
    </motion.div>
  );
});

ErrorState.displayName = 'ErrorState';

export { 
  Avatar, 
  AvatarGroup, 
  Tooltip, 
  ProgressCircle, 
  EmptyState, 
  ErrorState 
};