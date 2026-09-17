'use client';

import { forwardRef, HTMLAttributes, useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';

// Skeleton Component
interface SkeletonProps extends HTMLAttributes<HTMLDivElement> {
  variant?: 'text' | 'circular' | 'rectangular';
  width?: string | number;
  height?: string | number;
}

const Skeleton = forwardRef<HTMLDivElement, SkeletonProps>(({
  variant = 'rectangular',
  width,
  height,
  className,
  style,
}, ref) => {
  const baseStyles = 'bg-slate-700/50 animate-pulse';
  
  const variantStyles = {
    text: 'rounded h-4',
    circular: 'rounded-full',
    rectangular: 'rounded-lg',
  };

  return (
    <div
      ref={ref}
      className={cn(baseStyles, variantStyles[variant], className)}
      style={{
        width: width,
        height: height,
        ...style,
      }}
    />
  );
});

Skeleton.displayName = 'Skeleton';

// Skeleton Text
interface SkeletonTextProps extends HTMLAttributes<HTMLDivElement> {
  lines?: number;
  lastLineWidth?: string;
}

const SkeletonText = forwardRef<HTMLDivElement, SkeletonTextProps>(({
  lines = 3,
  lastLineWidth = '60%',
  className,
}, ref) => {
  return (
    <div ref={ref} className={cn('space-y-2', className)}>
      {[...Array(lines - 1)].map((_, i) => (
        <Skeleton key={i} variant="text" className="w-full" />
      ))}
      <Skeleton variant="text" className={lastLineWidth} />
    </div>
  );
});

SkeletonText.displayName = 'SkeletonText';

// Skeleton Card
interface SkeletonCardProps extends HTMLAttributes<HTMLDivElement> {
  showAvatar?: boolean;
  showImage?: boolean;
}

const SkeletonCard = forwardRef<HTMLDivElement, SkeletonCardProps>(({
  showAvatar = true,
  showImage = false,
  className,
}, ref) => {
  return (
    <div
      ref={ref}
      className={cn('p-4 bg-slate-800/50 border border-slate-700 rounded-xl', className)}
    >
      <div className="space-y-4">
        {showAvatar && (
          <div className="flex items-center gap-3">
            <Skeleton variant="circular" width={40} height={40} />
            <div className="flex-1 space-y-2">
              <Skeleton variant="text" width="40%" height={14} />
              <Skeleton variant="text" width="60%" height={12} />
            </div>
          </div>
        )}
        {showImage && <Skeleton width="100%" height={120} />}
        <SkeletonText lines={3} />
        <div className="flex gap-2">
          <Skeleton width={60} height={24} className="rounded-full" />
          <Skeleton width={80} height={24} className="rounded-full" />
        </div>
      </div>
    </div>
  );
});

SkeletonCard.displayName = 'SkeletonCard';

// Loading Spinner
interface SpinnerProps extends HTMLAttributes<HTMLDivElement> {
  size?: 'sm' | 'md' | 'lg';
}

const spinnerSizes = {
  sm: 'w-4 h-4 border-2',
  md: 'w-8 h-8 border-2',
  lg: 'w-12 h-12 border-3',
};

const Spinner = forwardRef<HTMLDivElement, SpinnerProps>(({
  size = 'md',
  className,
}, ref) => {
  return (
    <motion.div
      ref={ref}
      animate={{ rotate: 360 }}
      transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
      className={cn(
        'border-indigo-500 border-t-transparent rounded-full',
        spinnerSizes[size],
        className
      )}
    />
  );
});

Spinner.displayName = 'Spinner';

// Loading Overlay
interface LoadingOverlayProps extends HTMLAttributes<HTMLDivElement> {
  message?: string;
}

const LoadingOverlay = forwardRef<HTMLDivElement, LoadingOverlayProps>(({
  message,
  className,
}, ref) => {
  return (
    <div
      ref={ref}
      className={cn(
        'absolute inset-0 flex flex-col items-center justify-center bg-slate-900/80 backdrop-blur-sm z-50',
        className
      )}
    >
      <Spinner size="lg" />
      {message && (
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.2 }}
          className="mt-4 text-slate-400"
        >
          {message}
        </motion.p>
      )}
    </div>
  );
});

LoadingOverlay.displayName = 'LoadingOverlay';

// Page Loader (full page loading state)
interface PageLoaderProps extends HTMLAttributes<HTMLDivElement> {
  message?: string;
}

const PageLoader = forwardRef<HTMLDivElement, PageLoaderProps>(({
  message = 'Loading...',
  className,
}, ref) => {
  return (
    <div
      ref={ref}
      className={cn(
        'min-h-screen flex flex-col items-center justify-center bg-slate-950',
        className
      )}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.3 }}
        className="flex flex-col items-center"
      >
        <Spinner size="lg" className="mb-4" />
        {message && (
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.2 }}
            className="text-slate-400 text-sm"
          >
            {message}
          </motion.p>
        )}
      </motion.div>
    </div>
  );
});

PageLoader.displayName = 'PageLoader';

// Content Loader (inline loading state)
interface ContentLoaderProps extends HTMLAttributes<HTMLDivElement> {
  message?: string;
}

const ContentLoader = forwardRef<HTMLDivElement, ContentLoaderProps>(({
  message,
  className,
}, ref) => {
  return (
    <div
      ref={ref}
      className={cn('flex flex-col items-center justify-center py-8', className)}
    >
      <Spinner size="md" className="mb-2" />
      {message && (
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.2 }}
          className="text-slate-500 text-xs"
        >
          {message}
        </motion.p>
      )}
    </div>
  );
});

ContentLoader.displayName = 'ContentLoader';

// Dots Loader (three bouncing dots)
interface DotsLoaderProps extends HTMLAttributes<HTMLDivElement> {
  size?: 'sm' | 'md' | 'lg';
  color?: string;
}

const DotsLoader = forwardRef<HTMLDivElement, DotsLoaderProps>(({
  size = 'md',
  color = 'bg-indigo-500',
  className,
}, ref) => {
  const dotSizes = {
    sm: 'w-1.5 h-1.5',
    md: 'w-2 h-2',
    lg: 'w-3 h-3',
  };

  return (
    <div ref={ref} className={cn('flex items-center gap-1.5', className)}>
      <motion.div
        animate={{ y: [0, -8, 0] }}
        transition={{ duration: 0.6, repeat: Infinity, ease: 'easeInOut', delay: 0 }}
        className={cn(dotSizes[size], color, 'rounded-full')}
      />
      <motion.div
        animate={{ y: [0, -8, 0] }}
        transition={{ duration: 0.6, repeat: Infinity, ease: 'easeInOut', delay: 0.1 }}
        className={cn(dotSizes[size], color, 'rounded-full')}
      />
      <motion.div
        animate={{ y: [0, -8, 0] }}
        transition={{ duration: 0.6, repeat: Infinity, ease: 'easeInOut', delay: 0.2 }}
        className={cn(dotSizes[size], color, 'rounded-full')}
      />
    </div>
  );
});

DotsLoader.displayName = 'DotsLoader';

// Pulse Loader
interface PulseLoaderProps extends HTMLAttributes<HTMLDivElement> {
  size?: 'sm' | 'md' | 'lg';
  color?: string;
}

const PulseLoader = forwardRef<HTMLDivElement, PulseLoaderProps>(({
  size = 'md',
  color = 'bg-indigo-500',
  className,
}, ref) => {
  const sizes = {
    sm: 'w-2 h-2',
    md: 'w-4 h-4',
    lg: 'w-6 h-6',
  };

  return (
    <div ref={ref} className={cn('flex items-center justify-center', className)}>
      <motion.div
        className={cn(sizes[size], color, 'rounded-full')}
        animate={{ scale: [1, 1.5, 1], opacity: [1, 0.5, 1] }}
        transition={{ duration: 1.5, repeat: Infinity, ease: 'easeInOut' }}
      />
    </div>
  );
});

PulseLoader.displayName = 'PulseLoader';

// Progress Loader (linear progress bar)
interface ProgressLoaderProps extends HTMLAttributes<HTMLDivElement> {
  progress?: number;
  showPercentage?: boolean;
}

const ProgressLoader = forwardRef<HTMLDivElement, ProgressLoaderProps>(({
  progress,
  showPercentage = false,
  className,
}, ref) => {
  const [animatedProgress, setAnimatedProgress] = useState(0);
  const isDeterminate = progress !== undefined;

  useEffect(() => {
    // Only a real progress value is animated; without one the bar stays
    // indeterminate instead of faking a percentage that never resolves.
    if (!isDeterminate) return;
    setAnimatedProgress(progress as number);
  }, [progress, isDeterminate]);

  return (
    <div ref={ref} className={cn('w-full', className)}>
      <div className="h-1.5 bg-slate-700 rounded-full overflow-hidden">
        <motion.div
          className="h-full bg-indigo-500 rounded-full"
          initial={{ width: 0 }}
          animate={
            isDeterminate
              ? { width: `${animatedProgress}%` }
              : { width: ['15%', '85%', '15%'] }
          }
          transition={
            isDeterminate
              ? { duration: 0.3 }
              : { duration: 1.6, repeat: Infinity, ease: 'easeInOut' }
          }
          style={isDeterminate ? { width: `${animatedProgress}%` } : undefined}
        />
      </div>
      {showPercentage && isDeterminate && (
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="text-xs text-slate-500 mt-1 text-right"
        >
          {Math.round(animatedProgress)}%
        </motion.p>
      )}
    </div>
  );
});

ProgressLoader.displayName = 'ProgressLoader';

export {
  Skeleton,
  SkeletonText,
  SkeletonCard,
  Spinner,
  LoadingOverlay,
  PageLoader,
  ContentLoader,
  DotsLoader,
  PulseLoader,
  ProgressLoader,
};