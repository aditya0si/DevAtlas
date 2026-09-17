'use client';

/**
 * Real-time GitHub repository subscription via Firestore onSnapshot.
 *
 * Replaces the one-shot REST fetch in DeveloperMap. As the sync worker adds
 * repositories to Firestore, this listener pushes updates to the map
 * immediately — no polling, no refetch.
 *
 * Read budget: the listener subscribes to at most `MAX_REALTIME_DOC_LIMIT`
 * documents (1200 by default). The map never needs the whole corpus in a
 * browser tab; callers can tune the window down with `limitCount`.
 */

import { useEffect, useState } from 'react';
import { collection, query, limit, onSnapshot } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { deriveRepoActivity } from '@/lib/firestoreApi';
import type { RepoActivitySource } from '@/lib/firestoreApi';

/** Default listener window in documents (was 5000; the corpus does not belong in a tab). */
export const DEFAULT_REALTIME_DOC_LIMIT = 1200;

/** Hard ceiling for the listener window — larger requests are clamped. */
export const MAX_REALTIME_DOC_LIMIT = 1200;

export interface RepoFeature {
  type: 'Feature';
  geometry: { type: 'Point'; coordinates: [number, number] };
  properties: {
    id: string;
    name: string;
    full_name: string;
    language: string | null;
    stars: number;
    /**
     * 0-100. Measured PushEvent activity when `activity_source` is
     * `github_events`; otherwise a stars-based stand-in (see `stars_estimate`).
     */
    activity_score: number;
    /** Where `activity_score` came from: measured events or a stars estimate. */
    activity_source: RepoActivitySource;
    /** Present only when there is no measured score ("stars estimate"). */
    stars_estimate?: number;
    classification: Record<string, any> | null;
    domain: string | null;
    description: string | null;
  };
}

export interface RealtimeMapData {
  features: RepoFeature[];
  loading: boolean;
  error: string | null;
}

const DOMAIN_MAP: Record<string, string> = {
  AI: 'ai',
  Cybersecurity: 'cybersecurity',
  Healthcare: 'healthcare',
  Robotics: 'robotics',
  DevOps: 'devops',
  Web3: 'blockchain',
};

function resolveDocLimit(limitCount: number): number {
  const requested =
    Number.isFinite(limitCount) && limitCount > 0 ? Math.floor(limitCount) : DEFAULT_REALTIME_DOC_LIMIT;
  return Math.min(requested, MAX_REALTIME_DOC_LIMIT);
}

export function useRealtimeRepos(options?: {
  domain?: string;
  limitCount?: number;
}): RealtimeMapData {
  const { domain, limitCount = 1200 } = options || {};
  const docLimit = resolveDocLimit(limitCount);
  const [features, setFeatures] = useState<RepoFeature[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!db) {
      setError('Firestore not initialized');
      setLoading(false);
      return;
    }

    const firestore = db;
    const q = query(collection(firestore, 'repositories'), limit(docLimit));

    setLoading(true);

    const unsub = onSnapshot(
      q,
      (snapshot) => {
        const newFeatures: RepoFeature[] = [];
        snapshot.forEach((doc) => {
          const repo = doc.data();
          if (!repo.coordinates) return;

          // Filter by domain client-side (avoids needing composite indexes for every filter)
          if (domain && domain !== 'All Projects') {
            const repoDomain = repo.classification?.domain || repo.domain;
            const expected = DOMAIN_MAP[domain] || domain.toLowerCase();
            if (repoDomain !== expected) return;
          }

          const activity = deriveRepoActivity(repo);

          newFeatures.push({
            type: 'Feature',
            geometry: {
              type: 'Point',
              coordinates: [repo.coordinates.longitude, repo.coordinates.latitude],
            },
            properties: {
              id: doc.id,
              name: repo.name,
              full_name: repo.full_name,
              language: repo.language,
              stars: activity.stars,
              activity_score: activity.activity_score,
              activity_source: activity.activity_source,
              ...(activity.stars_estimate !== undefined
                ? { stars_estimate: activity.stars_estimate }
                : {}),
              classification: repo.classification || null,
              domain: repo.domain || null,
              description: repo.description || null,
            },
          });
        });
        setFeatures(newFeatures);
        setLoading(false);
        setError(null);
      },
      (err) => {
        console.error('Firestore subscription error:', err);
        setError(err.message);
        setLoading(false);
      }
    );

    return () => unsub();
  }, [domain, docLimit]);

  return { features, loading, error };
}
