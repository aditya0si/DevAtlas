'use client';

import { Component, ErrorInfo, ReactNode } from 'react';
import { AlertTriangle } from 'lucide-react';

interface ErrorBoundaryProps {
  children: ReactNode;
  /** Shown in the fallback: what failed to render. */
  label?: string;
  fallback?: ReactNode;
}

interface ErrorBoundaryState {
  error: Error | null;
}

/**
 * Keeps a crashing child (the WebGL map is the realistic candidate) from taking
 * the whole page down: the page keeps its other panels and renders an explicit,
 * styled notice instead of a blank screen.
 */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error(`[DevAtlas] ${this.props.label ?? 'panel'} failed to render`, error, errorInfo);
  }

  render() {
    if (this.state.error) {
      if (this.props.fallback) return this.props.fallback;
      return (
        <div
          data-testid="panel-error-state"
          role="alert"
          className="flex h-full w-full items-center justify-center bg-[#050816] p-6"
        >
          <div className="max-w-sm rounded-2xl border border-amber-500/30 bg-slate-900/85 px-4 py-3 text-center">
            <AlertTriangle size={18} className="mx-auto mb-2 text-amber-400" aria-hidden="true" />
            <p className="text-sm font-semibold text-amber-200">
              {this.props.label ?? 'This panel'} failed to render
            </p>
            <p className="mt-1 text-xs text-slate-400">{this.state.error.message}</p>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
