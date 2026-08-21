'use client';

import { forwardRef, InputHTMLAttributes, TextareaHTMLAttributes, SelectHTMLAttributes } from 'react';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';
import { Search, X } from 'lucide-react';

// Input Component
interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  error?: boolean;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
  onRightIconClick?: () => void;
}

const Input = forwardRef<HTMLInputElement, InputProps>(({
  error = false,
  leftIcon,
  rightIcon,
  onRightIconClick,
  className,
  ...props
}, ref) => {
  return (
    <div className="relative">
      {leftIcon && (
        <div className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">
          {leftIcon}
        </div>
      )}
      <input
        ref={ref}
        className={cn(
          'w-full h-10 px-4 bg-slate-800 border rounded-xl text-slate-200',
          'placeholder:text-slate-500',
          'focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent',
          'transition-all duration-200',
          'disabled:bg-slate-900 disabled:text-slate-500 disabled:cursor-not-allowed',
          error ? 'border-red-500 focus:ring-red-500' : 'border-slate-600 hover:border-slate-500',
          leftIcon && 'pl-10',
          rightIcon && 'pr-10',
          className
        )}
        {...props}
      />
      {rightIcon && (
        <button
          type="button"
          onClick={onRightIconClick}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-300"
        >
          {rightIcon}
        </button>
      )}
    </div>
  );
});

Input.displayName = 'Input';

// Search Input Component
interface SearchInputProps extends Omit<InputProps, 'leftIcon' | 'rightIcon'> {
  onClear?: () => void;
  isSearching?: boolean;
}

const SearchInput = forwardRef<HTMLInputElement, SearchInputProps>(({
  onClear,
  isSearching,
  className,
  ...props
}, ref) => {
  return (
    <div className="relative">
      {isSearching ? (
        <div className="absolute left-3 top-1/2 -translate-y-1/2">
          <motion.div
            animate={{ rotate: 360 }}
            transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
            className="w-5 h-5 border-2 border-indigo-500 border-t-transparent rounded-full"
          />
        </div>
      ) : (
        <div className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">
          <Search size={20} />
        </div>
      )}
      <input
        ref={ref}
        className={cn(
          'w-full h-12 pl-11 pr-10 bg-slate-800 border border-slate-600 rounded-xl',
          'text-slate-200 placeholder:text-slate-500',
          'focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent',
          'transition-all duration-200',
          'hover:border-slate-500',
          className
        )}
        {...props}
      />
      {props.value && onClear && (
        <button
          type="button"
          onClick={onClear}
          className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-300 hover:bg-slate-700 rounded-full transition-colors"
        >
          <X size={16} />
        </button>
      )}
    </div>
  );
});

SearchInput.displayName = 'SearchInput';

// Textarea Component
interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  error?: boolean;
}

const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(({
  error = false,
  className,
  ...props
}, ref) => {
  return (
    <textarea
      ref={ref}
      className={cn(
        'w-full px-4 py-3 bg-slate-800 border rounded-xl text-slate-200',
        'placeholder:text-slate-500',
        'focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent',
        'transition-all duration-200',
        'resize-none',
        error ? 'border-red-500 focus:ring-red-500' : 'border-slate-600 hover:border-slate-500',
        className
      )}
      {...props}
    />
  );
});

Textarea.displayName = 'Textarea';

// Select Component
interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  error?: boolean;
  options: { value: string; label: string }[];
}

const Select = forwardRef<HTMLSelectElement, SelectProps>(({
  error = false,
  options,
  className,
  ...props
}, ref) => {
  return (
    <select
      ref={ref}
      className={cn(
        'w-full h-10 px-4 bg-slate-800 border rounded-xl text-slate-200',
        'focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent',
        'transition-all duration-200',
        'cursor-pointer',
        error ? 'border-red-500 focus:ring-red-500' : 'border-slate-600 hover:border-slate-500',
        className
      )}
      {...props}
    >
      {options.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  );
});

Select.displayName = 'Select';

export { Input, SearchInput, Textarea, Select };