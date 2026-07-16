'use client';

import { forwardRef, HTMLAttributes } from 'react';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  variant?: 'default' | 'elevated' | 'outline' | 'glow';
  padding?: 'none' | 'sm' | 'md' | 'lg';
  hover?: boolean;
}

const variantStyles = {
  default: 'bg-slate-800/50 border-slate-700',
  elevated: 'bg-slate-800 border-slate-700 shadow-lg',
  outline: 'bg-transparent border-slate-600',
  glow: 'bg-slate-800/50 border-slate-700 shadow-lg shadow-indigo-500/10',
};

const paddingStyles = {
  none: '',
  sm: 'p-3',
  md: 'p-4',
  lg: 'p-6',
};

const Card = forwardRef<HTMLDivElement, CardProps>(({
  variant = 'default',
  padding = 'md',
  hover = false,
  className,
  children,
}, ref) => {
  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: 'easeOut' }}
      className={cn(
        'rounded-xl border',
        variantStyles[variant],
        paddingStyles[padding],
        hover && 'hover:border-indigo-500/50 hover:shadow-lg hover:shadow-indigo-500/10 transition-all duration-200 cursor-pointer',
        className
      )}
    >
      {children}
    </motion.div>
  );
});

Card.displayName = 'Card';

// Card Header
interface CardHeaderProps extends HTMLAttributes<HTMLDivElement> {}

const CardHeader = forwardRef<HTMLDivElement, CardHeaderProps>(({
  className,
  children,
}, ref) => (
  <div
    ref={ref}
    className={cn('flex flex-col space-y-1.5 pb-4', className)}
  >
    {children}
  </div>
));

CardHeader.displayName = 'CardHeader';

// Card Title
interface CardTitleProps extends HTMLAttributes<HTMLHeadingElement> {
  as?: 'h1' | 'h2' | 'h3' | 'h4';
}

const CardTitle = forwardRef<HTMLHeadingElement, CardTitleProps>(({
  as: Component = 'h3',
  className,
  children,
}, ref) => (
  <Component
    ref={ref}
    className={cn('text-lg font-semibold text-slate-100', className)}
  >
    {children}
  </Component>
));

CardTitle.displayName = 'CardTitle';

// Card Description
interface CardDescriptionProps extends HTMLAttributes<HTMLParagraphElement> {}

const CardDescription = forwardRef<HTMLParagraphElement, CardDescriptionProps>(({
  className,
  children,
}, ref) => (
  <p
    ref={ref}
    className={cn('text-sm text-slate-400', className)}
  >
    {children}
  </p>
));

CardDescription.displayName = 'CardDescription';

// Card Content
interface CardContentProps extends HTMLAttributes<HTMLDivElement> {}

const CardContent = forwardRef<HTMLDivElement, CardContentProps>(({
  className,
  children,
}, ref) => (
  <div
    ref={ref}
    className={cn('p-6 pt-0', className)}
  >
    {children}
  </div>
));

CardContent.displayName = 'CardContent';

// Card Footer
interface CardFooterProps extends HTMLAttributes<HTMLDivElement> {}

const CardFooter = forwardRef<HTMLDivElement, CardFooterProps>(({
  className,
  children,
}, ref) => (
  <div
    ref={ref}
    className={cn('flex items-center pt-4', className)}
  >
    {children}
  </div>
));

CardFooter.displayName = 'CardFooter';

export { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter };