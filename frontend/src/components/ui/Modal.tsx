'use client';

import { forwardRef, HTMLAttributes, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';
import { X } from 'lucide-react';
import { createPortal } from 'react-dom';

// Drawer Component (Slide-in Panel)
interface DrawerProps extends HTMLAttributes<HTMLDivElement> {
  isOpen: boolean;
  onClose: () => void;
  position?: 'left' | 'right';
  size?: 'sm' | 'md' | 'lg' | 'xl' | 'full';
}

const drawerSizes = {
  sm: 'w-64',
  md: 'w-80',
  lg: 'w-96',
  xl: 'w-[500px]',
  full: 'w-full',
};

const Drawer = forwardRef<HTMLDivElement, DrawerProps>(({
  isOpen,
  onClose,
  position = 'right',
  size = 'md',
  className,
  children,
}, ref) => {
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.key === 'Escape') onClose();
  }, [onClose]);

  useEffect(() => {
    if (isOpen) {
      document.addEventListener('keydown', handleKeyDown);
      document.body.style.overflow = 'hidden';
    }
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = '';
    };
  }, [isOpen, handleKeyDown]);

  const drawerContent = (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={onClose}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40"
          />
          
          <motion.div
            ref={ref}
            initial={{ opacity: 0, x: position === 'right' ? '100%' : '-100%' }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: position === 'right' ? '100%' : '-100%' }}
            transition={{ type: 'spring', damping: 30, stiffness: 300 }}
            className={cn(
              'fixed top-0 h-full bg-slate-900 border-l border-slate-700 z-50',
              'flex flex-col shadow-2xl',
              drawerSizes[size],
              position === 'left' ? 'left-0' : 'right-0',
              className
            )}
          >
            <div className="flex items-center justify-between p-4 border-b border-slate-700">
              <h2 className="text-lg font-semibold text-slate-100">Panel</h2>
              <button
                onClick={onClose}
                className="p-2 text-slate-400 hover:text-slate-200 hover:bg-slate-800 rounded-lg transition-colors"
              >
                <X size={20} />
              </button>
            </div>
            
            <div className="flex-1 overflow-y-auto p-4">
              {children}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );

  if (typeof window === 'undefined') return null;
  return createPortal(drawerContent, document.body);
});

Drawer.displayName = 'Drawer';

// Modal Component
interface ModalProps extends HTMLAttributes<HTMLDivElement> {
  isOpen: boolean;
  onClose: () => void;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  showClose?: boolean;
}

const modalSizes = {
  sm: 'max-w-md',
  md: 'max-w-lg',
  lg: 'max-w-2xl',
  xl: 'max-w-4xl',
};

const Modal = forwardRef<HTMLDivElement, ModalProps>(({
  isOpen,
  onClose,
  size = 'md',
  showClose = true,
  className,
  children,
}, ref) => {
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.key === 'Escape') onClose();
  }, [onClose]);

  useEffect(() => {
    if (isOpen) {
      document.addEventListener('keydown', handleKeyDown);
      document.body.style.overflow = 'hidden';
    }
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = '';
    };
  }, [isOpen, handleKeyDown]);

  const modalContent = (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={onClose}
            className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50"
          />
          
          <motion.div
            ref={ref}
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            transition={{ type: 'spring', damping: 25, stiffness: 300 }}
            className={cn(
              'fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2',
              'w-full bg-slate-800 border border-slate-700 rounded-2xl shadow-2xl z-50',
              modalSizes[size],
              className
            )}
            onClick={(e) => e.stopPropagation()}
          >
            {showClose && (
              <button
                onClick={onClose}
                className="absolute top-4 right-4 p-2 text-slate-400 hover:text-slate-200 hover:bg-slate-700 rounded-lg transition-colors"
              >
                <X size={20} />
              </button>
            )}
            {children}
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );

  if (typeof window === 'undefined') return null;
  return createPortal(modalContent, document.body);
});

Modal.displayName = 'Modal';

// Modal Header
interface ModalHeaderProps extends HTMLAttributes<HTMLDivElement> {}

const ModalHeader = forwardRef<HTMLDivElement, ModalHeaderProps>(({
  className,
  children,
}, ref) => {
  return (
    <div ref={ref} className={cn('p-6 pb-0', className)}>
      <h3 className="text-lg font-semibold text-slate-100">{children}</h3>
    </div>
  );
});

ModalHeader.displayName = 'ModalHeader';

// Modal Body
interface ModalBodyProps extends HTMLAttributes<HTMLDivElement> {}

const ModalBody = forwardRef<HTMLDivElement, ModalBodyProps>(({
  className,
  children,
}, ref) => {
  return (
    <div ref={ref} className={cn('p-6', className)}>
      {children}
    </div>
  );
});

ModalBody.displayName = 'ModalBody';

// Modal Footer
interface ModalFooterProps extends HTMLAttributes<HTMLDivElement> {}

const ModalFooter = forwardRef<HTMLDivElement, ModalFooterProps>(({
  className,
  children,
}, ref) => {
  return (
    <div ref={ref} className={cn('p-6 pt-0 flex justify-end gap-3', className)}>
      {children}
    </div>
  );
});

ModalFooter.displayName = 'ModalFooter';

export {
  Drawer,
  Modal,
  ModalHeader,
  ModalBody,
  ModalFooter,
};