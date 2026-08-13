'use client';

import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  X,
  Star,
  GitFork,
  Eye,
  Clock,
  Code2,
  ExternalLink,
  MapPin,
  Calendar,
  Tag,
  Loader2,
  AlertTriangle,
  Activity,
} from 'lucide-react';
import { api, RepositoryDetailsData } from '@/lib/api';
import { getFeatureDomain } from '@/lib/domain';

interface RepositoryDetailPanelProps {
  repoId: string | null;
  onClose: () => void;
}

const formatNumber = (num: number): string => {
  if (num >= 1000) return (num / 1000).toFixed(1) + 'k';
  return num.toString();
};

const formatDate = (date: string | null | undefined): string => {
  if (!date) return '—';
  const d = new Date(date);
  if (isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
};

export default function RepositoryDetailPanel({ repoId, onClose }: RepositoryDetailPanelProps) {
  const [repository, setRepository] = useState<RepositoryDetailsData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!repoId) {
      setRepository(null);
      setError(null);
      return;
    }

    const controller = new AbortController();
    setLoading(true);
    setError(null);
    setRepository(null);

    api
      .getRepositoryDetails(repoId, controller.signal)
      .then((data) => {
        if (!controller.signal.aborted) setRepository(data);
      })
      .catch((err) => {
        if (err?.name !== 'AbortError') {
          setError(err?.message || 'Failed to load repository details');
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });

    return () => {
      controller.abort();
    };
  }, [repoId]);

  const domain = repository ? getFeatureDomain(repository.classification) : null;

  return (
    <AnimatePresence>
      {repoId && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50"
          />

          {/* Modal */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            className="fixed inset-2 sm:inset-4 md:inset-8 lg:inset-16 bg-slate-900 rounded-2xl border border-slate-700 shadow-2xl z-50 flex flex-col overflow-hidden"
          >
            {/* Header */}
            <div className="flex items-start justify-between p-6 border-b border-slate-700">
              {loading ? (
                <div className="flex items-center gap-3">
                  <Loader2 className="w-6 h-6 text-indigo-400 animate-spin" />
                  <span className="text-slate-300 text-sm">Loading repository details...</span>
                </div>
              ) : error ? (
                <div className="flex items-center gap-3">
                  <AlertTriangle className="w-6 h-6 text-amber-400" />
                  <div>
                    <h2 className="text-lg font-bold text-white">Unable to load repository</h2>
                    <p className="text-slate-400 text-sm">{error}</p>
                  </div>
                </div>
              ) : (
                repository && (
                  <div className="flex items-start gap-4">
                    {repository.owner?.avatar_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={repository.owner.avatar_url}
                        alt={repository.owner?.login || repository.full_name}
                        className="w-12 h-12 rounded-xl"
                      />
                    ) : (
                      <div className="w-12 h-12 rounded-xl bg-indigo-500/20 flex items-center justify-center">
                        <Code2 className="w-6 h-6 text-indigo-400" />
                      </div>
                    )}
                    <div>
                      <h2 className="text-xl font-bold text-white">{repository.name}</h2>
                      <p className="text-slate-400 text-sm">{repository.full_name}</p>
                      <div className="flex items-center gap-3 mt-2">
                        {repository.language && (
                          <span className="flex items-center gap-2 text-sm text-slate-300">
                            <span className="w-3 h-3 rounded-full bg-indigo-400" />
                            {repository.language}
                          </span>
                        )}
                        {domain && (
                          <span className="px-2 py-0.5 rounded-full bg-indigo-500/10 text-indigo-300 text-xs border border-indigo-500/20 capitalize">
                            {domain}
                          </span>
                        )}
                        {(repository.owner?.state || repository.owner?.location) && (
                          <span className="flex items-center gap-1 text-xs text-slate-400">
                            <MapPin className="w-3 h-3" />
                            {repository.owner.state || repository.owner.location}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                )
              )}
              <button
                onClick={onClose}
                className="p-2 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white transition-colors"
                aria-label="Close repository details"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Body */}
            <div className="flex-1 overflow-y-auto p-6">
              {loading && (
                <div className="space-y-4 animate-pulse">
                  <div className="h-4 bg-slate-700 rounded w-3/4" />
                  <div className="h-4 bg-slate-700 rounded w-1/2" />
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3 pt-4">
                    {[1, 2, 3, 4].map((i) => (
                      <div key={i} className="h-20 bg-slate-800 rounded-xl" />
                    ))}
                  </div>
                  <div className="h-40 bg-slate-800 rounded-xl" />
                </div>
              )}

              {error && (
                <div className="flex flex-col items-center justify-center py-16 text-center">
                  <AlertTriangle className="w-10 h-10 text-amber-400 mb-3" />
                  <p className="text-slate-300 font-medium mb-1">Something went wrong</p>
                  <p className="text-slate-500 text-sm max-w-sm">{error}</p>
                  <button
                    onClick={onClose}
                    className="mt-6 px-5 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-sm transition-colors"
                  >
                    Close
                  </button>
                </div>
              )}

              {!loading && !error && repository && (
                <div className="space-y-6">
                  {/* Stats bar */}
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    <div className="flex items-center gap-3 p-3 rounded-xl bg-slate-800/50">
                      <Star className="w-4 h-4 text-indigo-400" />
                      <div>
                        <div className="text-lg font-semibold text-white">{formatNumber(repository.stargazers_count)}</div>
                        <div className="text-xs text-slate-400">Stars</div>
                      </div>
                    </div>
                    <div className="flex items-center gap-3 p-3 rounded-xl bg-slate-800/50">
                      <GitFork className="w-4 h-4 text-indigo-400" />
                      <div>
                        <div className="text-lg font-semibold text-white">{formatNumber(repository.forks_count)}</div>
                        <div className="text-xs text-slate-400">Forks</div>
                      </div>
                    </div>
                    <div className="flex items-center gap-3 p-3 rounded-xl bg-slate-800/50">
                      <Eye className="w-4 h-4 text-indigo-400" />
                      <div>
                        <div className="text-lg font-semibold text-white">{formatNumber(repository.open_issues_count)}</div>
                        <div className="text-xs text-slate-400">Open Issues</div>
                      </div>
                    </div>
                    <div className="flex items-center gap-3 p-3 rounded-xl bg-slate-800/50">
                      <Activity className="w-4 h-4 text-indigo-400" />
                      <div>
                        <div className="text-lg font-semibold text-white">{repository.default_branch || '—'}</div>
                        <div className="text-xs text-slate-400">Default Branch</div>
                      </div>
                    </div>
                  </div>

                  {/* Description */}
                  <div>
                    <h3 className="text-sm font-medium text-slate-400 mb-2">About</h3>
                    <p className="text-slate-200 leading-relaxed">
                      {repository.description || 'No description available.'}
                    </p>
                  </div>

                  {/* Topics */}
                  {repository.topics && repository.topics.length > 0 && (
                    <div>
                      <h3 className="text-sm font-medium text-slate-400 mb-2">Topics</h3>
                      <div className="flex flex-wrap gap-2">
                        {repository.topics.map((topic) => (
                          <span
                            key={topic}
                            className="px-3 py-1 rounded-full bg-indigo-500/10 text-indigo-300 text-sm border border-indigo-500/20"
                          >
                            {topic}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Classification / Metadata */}
                  <div className="grid grid-cols-2 gap-4">
                    {repository.classification?.industry && (
                      <div className="p-4 rounded-xl bg-slate-800/50 border border-slate-700">
                        <div className="flex items-center gap-2 text-slate-400 mb-2">
                          <Tag className="w-4 h-4" />
                          <span className="text-sm">Industry</span>
                        </div>
                        <p className="text-white font-medium capitalize">{repository.classification.industry}</p>
                      </div>
                    )}
                    <div className="p-4 rounded-xl bg-slate-800/50 border border-slate-700">
                      <div className="flex items-center gap-2 text-slate-400 mb-2">
                        <Calendar className="w-4 h-4" />
                        <span className="text-sm">Created</span>
                      </div>
                      <p className="text-white font-medium">{formatDate(repository.created_at)}</p>
                    </div>
                    <div className="p-4 rounded-xl bg-slate-800/50 border border-slate-700">
                      <div className="flex items-center gap-2 text-slate-400 mb-2">
                        <Clock className="w-4 h-4" />
                        <span className="text-sm">Last Updated</span>
                      </div>
                      <p className="text-white font-medium">{formatDate(repository.updated_at)}</p>
                    </div>
                    <div className="p-4 rounded-xl bg-slate-800/50 border border-slate-700">
                      <div className="flex items-center gap-2 text-slate-400 mb-2">
                        <Code2 className="w-4 h-4" />
                        <span className="text-sm">Languages</span>
                      </div>
                      <p className="text-white font-medium">
                        {repository.languages
                          ? Object.keys(repository.languages).slice(0, 3).join(', ')
                          : repository.language || '—'}
                      </p>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Footer */}
            {!loading && !error && repository && (
              <div className="flex items-center justify-between p-4 border-t border-slate-700 bg-slate-800/30">
                <div className="text-xs text-slate-500">
                  {repository.owner?.login ? `Owner: ${repository.owner.login}` : 'GitHub repository'}
                </div>
                <a
                  href={repository.html_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2 px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-sm transition-colors"
                >
                  View on GitHub
                  <ExternalLink className="w-4 h-4" />
                </a>
              </div>
            )}
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
