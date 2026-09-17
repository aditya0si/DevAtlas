'use client';

/**
 * Honesty helpers for panels that need the DevAtlas server API.
 *
 * This build serves Firestore data only: `NEXT_PUBLIC_DATA_MODE` is unset
 * (or `firestore`), and the AI/server endpoints — semantic search, trend
 * explanation, state comparison, state dashboards and the copilot stream —
 * are not implemented here, so the client stubs reject.
 *
 * Panels must therefore render ONE explicit, styled "needs the DevAtlas API"
 * state instead of a spinner, a generic failure message or a mock answer, and
 * must not call a method that is known to reject.
 */

import { useCallback, useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { DATA_MODE } from '@/lib/api';

/**
 * True when this build talks to the DevAtlas server API. Prefers the data-mode
 * constant exported by the API client (the single source of truth) and falls
 * back to the env var, so the helper also works with a partial api mock.
 */
export function isApiMode(): boolean {
  const mode: string | undefined =
    (DATA_MODE as string | undefined) ??
    (process.env.NEXT_PUBLIC_DATA_MODE === 'api' ? 'api' : 'firestore');
  return mode === 'api';
}

/**
 * True when a method is safe to call: API mode AND the method actually exists
 * on the shared client (defensive — a panel must never crash on a missing
 * method, it must report itself as unavailable).
 */
export function canCallApiMethod(method: unknown): boolean {
  return isApiMode() && typeof method === 'function';
}

const UNAVAILABLE_MESSAGE_PATTERNS = [
  /not available in firestore mode/i,
  /not configured in firestore mode/i,
  /requires server/i,
  /server-side/i,
  /requires the devatlas api/i,
  /firestore data only/i,
];

/**
 * Recognise the "this build cannot serve that" failure shape: an explicit
 * `APIUnavailableError`/code, or any of the stub rejection messages in
 * `@/lib/api` ("... requires server-side ...", "... not available in Firestore
 * mode"). Abort errors are never treated as unavailability.
 */
export function isApiUnavailableError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const candidate = error as { name?: string; code?: string; message?: string };
  if (candidate.name === 'AbortError') return false;
  if (candidate.name === 'APIUnavailableError') return true;
  if (candidate.code === 'API_UNAVAILABLE' || candidate.code === 'AI_UNAVAILABLE') return true;
  const message = typeof candidate.message === 'string' ? candidate.message : '';
  return UNAVAILABLE_MESSAGE_PATTERNS.some((pattern) => pattern.test(message));
}

/** The canonical notice sentence. */
export function apiUnavailableText(subject: string): string {
  return `${subject} needs the DevAtlas API — this build serves Firestore data only.`;
}

/**
 * Panel-level unavailability flag, derived once per mount.
 * `available` is the pre-flight check (API mode + method present); a rejected
 * call can escalate to unavailable via `markUnavailable()`.
 */
export function useApiUnavailable(available: boolean = isApiMode()): {
  unavailable: boolean;
  markUnavailable: () => void;
} {
  const [unavailable, setUnavailable] = useState(!available);
  const markUnavailable = useCallback(() => setUnavailable(true), []);
  return { unavailable, markUnavailable };
}

export interface ApiUnavailableNoticeProps {
  /** What cannot run, e.g. "Copilot" — completes the canonical sentence. */
  subject: string;
  /** Optional second line explaining why / what still works. */
  detail?: string;
  className?: string;
  testId?: string;
}

/**
 * Compact inline notice: the honest counterpart of a dead control.
 * Amber = "not broken, simply not included in this build".
 */
export function ApiUnavailableNotice({
  subject,
  detail,
  className,
  testId = 'api-unavailable-notice',
}: ApiUnavailableNoticeProps) {
  return (
    <div
      role="status"
      data-testid={testId}
      data-state="api-unavailable"
      className={cn(
        'flex items-start gap-2.5 rounded-xl border border-amber-500/30 bg-amber-500/10 px-3.5 py-2.5 text-left',
        className
      )}
    >
      <AlertTriangle size={15} className="mt-0.5 shrink-0 text-amber-400" aria-hidden="true" />
      <p className="text-xs leading-relaxed text-amber-100/90">
        <span className="font-semibold text-amber-200">{apiUnavailableText(subject)}</span>
        {detail ? <span className="mt-0.5 block text-amber-100/70">{detail}</span> : null}
      </p>
    </div>
  );
}
