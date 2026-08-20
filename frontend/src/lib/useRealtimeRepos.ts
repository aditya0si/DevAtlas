'use client';

/**
 * Real-time GitHub repository subscription via Firestore onSnapshot.
 *
 * Replaces the one-shot REST fetch in DeveloperMap. As Cloud Functions
 * sync new repos into Firestore every 5 min, this listener pushes
 * updates to the map immediately — no polling, no refetch.
 */

import { useEffect, useState } from 'react';
import { collection, query, limit, onSnapshot } from 'firebase/firestore';
import { db } from '@/lib/firebase';

export interface RepoFeature {
  type: 'Feature';
  geometry: { type: 'Point'; coordinates: [number, number] };
  properties: {
    id: string;
    name: string;
    full_name: string;
    language: string | null;
    stars: number;
    activity_score: number;
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

export function useRealtimeRepos(options?: {
  domain?: string;
  limitCount?: number;
}): RealtimeMapData {
  const { domain, limitCount = 5000 } = options || {};
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
    const q = query(collection(firestore, 'repositories'), limit(limitCount));

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
            const domainMap: Record<string, string> = {
              AI: 'ai',
              Cybersecurity: 'cybersecurity',
              Healthcare: 'healthcare',
              Robotics: 'robotics',
              DevOps: 'devops',
              Web3: 'blockchain',
            };
            const expected = domainMap[domain] || domain.toLowerCase();
            if (repoDomain !== expected) return;
          }

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
              stars: repo.stars || 0,
              activity_score: Math.min(100, Math.log((repo.stars || 1) + 1) * 10),
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
  }, [domain, limitCount]);

  return { features, loading, error };
}
