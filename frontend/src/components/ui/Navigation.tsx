'use client';

import { forwardRef, HTMLAttributes, useState, useRef, useEffect, ReactNode } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';
import { ChevronDown, Check, Search } from 'lucide-react';

// Tabs Component
interface TabsProps extends HTMLAttributes<HTMLDivElement> {
  defaultValue?: string;
  value?: string;
  onValueChange?: (value: string) => void;
}

const Tabs = forwardRef<HTMLDivElement, TabsProps>(({
  defaultValue,
  value: controlledValue,
  onValueChange,
  className,
  children,
}, ref) => {
  const [internalValue, setInternalValue] = useState(defaultValue || '');
  const value = controlledValue ?? internalValue;

  const handleValueChange = (newValue: string) => {
    setInternalValue(newValue);
    onValueChange?.(newValue);
  };

  return (
    <div ref={ref} className={cn('w-full', className)} data-value={value}>
      {children}
    </div>
  );
});

Tabs.displayName = 'Tabs';

// Tabs List
interface TabsListProps extends HTMLAttributes<HTMLDivElement> {}

const TabsList = forwardRef<HTMLDivElement, TabsListProps>(({
  className,
  children,
}, ref) => (
  <div
    ref={ref}
    className={cn(
      'inline-flex items-center gap-1 p-1 bg-slate-800/50 rounded-xl border border-slate-700',
      className
    )}
  >
    {children}
  </div>
));

TabsList.displayName = 'TabsList';

// Tabs Trigger
interface TabsTriggerProps extends HTMLAttributes<HTMLButtonElement> {
  value: string;
  disabled?: boolean;
}

const TabsTrigger = forwardRef<HTMLButtonElement, TabsTriggerProps>(({
  value,
  disabled = false,
  className,
  children,
}, ref) => {
  return (
    <button
      ref={ref}
      disabled={disabled}
      className={cn(
        'px-4 py-2 text-sm font-medium rounded-lg transition-all duration-200',
        'text-slate-400 hover:text-slate-200',
        'focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500',
        'disabled:opacity-50 disabled:cursor-not-allowed',
        className
      )}
    >
      {children}
    </button>
  );
});

TabsTrigger.displayName = 'TabsTrigger';

// Tabs Content
interface TabsContentProps extends HTMLAttributes<HTMLDivElement> {
  value: string;
}

const TabsContent = forwardRef<HTMLDivElement, TabsContentProps>(({
  value,
  className,
  children,
}, ref) => (
  <motion.div
    ref={ref}
    initial={{ opacity: 0, y: 10 }}
    animate={{ opacity: 1, y: 0 }}
    transition={{ duration: 0.2 }}
    className={cn('mt-4', className)}
  >
    {children}
  </motion.div>
));

TabsContent.displayName = 'TabsContent';

// Dropdown Component
interface DropdownOption {
  value: string;
  label: string;
  icon?: ReactNode;
  description?: string;
  disabled?: boolean;
}

interface DropdownProps {
  options: DropdownOption[];
  value?: string;
  onChange?: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  searchable?: boolean;
}

const Dropdown = forwardRef<HTMLButtonElement, DropdownProps>(({
  options,
  value,
  onChange,
  placeholder = 'Select...',
  disabled = false,
  className,
  searchable = false,
}, ref) => {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);

  const selectedOption = options.find((opt) => opt.value === value);

  const filteredOptions = searchable
    ? options.filter((opt) =>
        opt.label.toLowerCase().includes(search.toLowerCase())
      )
    : options;

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <div ref={containerRef} className={cn('relative', className)}>
      <button
        ref={ref}
        type="button"
        disabled={disabled}
        onClick={() => !disabled && setIsOpen(!isOpen)}
        className={cn(
          'w-full h-10 px-4 flex items-center justify-between gap-2',
          'bg-slate-800 border border-slate-600 rounded-xl',
          'text-left text-slate-200',
          'hover:border-slate-500 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500',
          'transition-all duration-200',
          'disabled:opacity-50 disabled:cursor-not-allowed',
          className
        )}
      >
        <span className={cn(!selectedOption && 'text-slate-500')}>
          {selectedOption?.label || placeholder}
        </span>
        <ChevronDown
          size={16}
          className={cn(
            'text-slate-400 transition-transform duration-200',
            isOpen && 'rotate-180'
          )}
        />
      </button>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.15 }}
            className={cn(
              'absolute z-50 w-full mt-2 py-2',
              'bg-slate-800 border border-slate-700 rounded-xl shadow-xl',
              'max-h-60 overflow-auto'
            )}
          >
            {searchable && (
              <div className="px-2 pb-2">
                <div className="relative">
                  <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                  <input
                    type="text"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Search..."
                    className={cn(
                      'w-full h-8 pl-8 pr-3 text-sm',
                      'bg-slate-700 border border-slate-600 rounded-lg',
                      'text-slate-200 placeholder:text-slate-500',
                      'focus:outline-none focus:border-indigo-500'
                    )}
                  />
                </div>
              </div>
            )}
            {filteredOptions.length === 0 ? (
              <div className="px-3 py-2 text-sm text-slate-500">No options found</div>
            ) : (
              filteredOptions.map((option) => (
                <button
                  key={option.value}
                  disabled={option.disabled}
                  onClick={() => {
                    onChange?.(option.value);
                    setIsOpen(false);
                    setSearch('');
                  }}
                  className={cn(
                    'w-full px-3 py-2 flex items-center gap-3 text-left',
                    'hover:bg-slate-700/50 transition-colors',
                    'disabled:opacity-50 disabled:cursor-not-allowed',
                    option.value === value && 'bg-indigo-500/20 text-indigo-400'
                  )}
                >
                  {option.icon && (
                    <span className="text-slate-400">{option.icon}</span>
                  )}
                  <div className="flex-1">
                    <div className="text-sm font-medium text-slate-200">{option.label}</div>
                    {option.description && (
                      <div className="text-xs text-slate-500">{option.description}</div>
                    )}
                  </div>
                  {option.value === value && (
                    <Check size={14} className="text-indigo-400" />
                  )}
                </button>
              ))
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
});

Dropdown.displayName = 'Dropdown';

export {
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
  Dropdown,
};