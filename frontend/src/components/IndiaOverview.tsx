'use client';

import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { 
  Users, GitFork, Globe, Activity, Award, TrendingUp, Loader2
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { api, EcosystemStats } from '@/lib/api';
import { getCurrentYear } from '@/lib/dates';

interface MetricCardProps {
  title: string;
  value: string;
  icon: React.ReactNode;
}

const MetricCard = ({ title, value, icon }: MetricCardProps) => (
  <motion.div
    initial={{ opacity: 0, scale: 0.95 }}
    animate={{ opacity: 1, scale: 1 }}
    className="relative overflow-hidden rounded-2xl bg-slate-800/50 border border-slate-700 p-6"
  >
    <div className="flex items-start justify-between mb-4">
      <div className="p-3 rounded-xl bg-indigo-500/10 text-indigo-400">
        {icon}
      </div>
    </div>
    <div className="text-3xl font-bold text-white mb-1">{value}</div>
    <div className="text-slate-400 text-sm">{title}</div>
  </motion.div>
);

interface IndiaOverviewProps {
  year?: number;
}

export default function IndiaOverview({ year = getCurrentYear() }: IndiaOverviewProps) {
  const [stats, setStats] = useState<EcosystemStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const controller = new AbortController();
    let mounted = true;
    setLoading(true);

    api.getEcosystemStats(year, controller.signal)
      .then((data) => {
        if (mounted && !controller.signal.aborted) {
          setStats(data);
        }
      })
      .catch((err) => {
        // Aborted requests are expected on year change/unmount — ignore them.
        if (err?.name === 'AbortError') return;
        // Keep the loading state; no synthetic fallback data is shown.
      })
      .finally(() => {
        if (mounted && !controller.signal.aborted) setLoading(false);
      });

    return () => {
      mounted = false;
      controller.abort();
    };
  }, [year]);

  const topState = stats?.top_states?.[0];
  const topLanguage = stats?.top_languages?.[0];
  const topDomain = stats?.top_domains?.[0];

  return (
    <div className="space-y-8">
      {loading && (
        <div className="flex justify-center p-4">
          <Loader2 className="w-6 h-6 text-indigo-400 animate-spin" />
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricCard
          title="Total Developers"
          value={stats ? `${(stats.total_developers / 1000).toFixed(1)}K` : '—'}
          icon={<Users className="w-6 h-6" />}
        />
        <MetricCard
          title="Active Repositories"
          value={stats ? stats.total_repositories.toLocaleString('en-US') : '—'}
          icon={<GitFork className="w-6 h-6" />}
        />
        <MetricCard
          title="AI Repository %"
          value={stats ? `${stats.ai_repo_percentage}%` : '—'}
          icon={<Globe className="w-6 h-6" />}
        />
        <MetricCard
          title="Total Stars"
          value={stats ? stats.total_stars.toLocaleString('en-US') : '—'}
          icon={<Activity className="w-6 h-6" />}
        />
      </div>

      <div className="rounded-2xl bg-slate-800/50 border border-slate-700 overflow-hidden">
        <div className="p-6 border-b border-slate-700">
          <h3 className="text-lg font-semibold text-white">Top States by Repository Count ({year})</h3>
          <p className="text-slate-400 text-sm mt-1">Leading Indian states in software development</p>
        </div>
        {stats && stats.top_states && stats.top_states.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-slate-900/50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-wider">State</th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-slate-400 uppercase tracking-wider">Repositories</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-700">
                {stats.top_states.map((state, index) => (
                  <motion.tr
                    key={state.state}
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: index * 0.05 }}
                    className="hover:bg-slate-700/30 transition-colors"
                  >
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-indigo-500/20 flex items-center justify-center text-indigo-400 text-sm font-medium">
                          {state.rank || index + 1}
                        </div>
                        <div className="text-white font-medium">{state.state}</div>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right text-slate-300">
                      {state.repositories.toLocaleString('en-US')}
                    </td>
                  </motion.tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="p-8 text-center text-slate-400 text-sm">
            {stats ? 'No state data available for this year yet.' : 'Loading state data...'}
          </div>
        )}
      </div>

      {stats && (
        <div className="grid md:grid-cols-3 gap-4">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="p-6 rounded-2xl bg-gradient-to-br from-indigo-500/10 to-purple-500/10 border border-indigo-500/20"
          >
            <div className="w-10 h-10 rounded-xl bg-indigo-500/20 flex items-center justify-center text-indigo-400 mb-4">
              <Award className="w-5 h-5" />
            </div>
            <h4 className="text-white font-medium mb-2">
              {topState ? `${topState.state} leads with ${topState.repositories.toLocaleString('en-US')} repositories` : 'No top state data yet'}
            </h4>
            <p className="text-slate-400 text-sm">Top state by repository count for {year}.</p>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="p-6 rounded-2xl bg-gradient-to-br from-indigo-500/10 to-purple-500/10 border border-indigo-500/20"
          >
            <div className="w-10 h-10 rounded-xl bg-indigo-500/20 flex items-center justify-center text-indigo-400 mb-4">
              <TrendingUp className="w-5 h-5" />
            </div>
            <h4 className="text-white font-medium mb-2">
              {topLanguage ? `${topLanguage.language} is the top language (${topLanguage.count.toLocaleString('en-US')} repos)` : 'No language data yet'}
            </h4>
            <p className="text-slate-400 text-sm">
              {topDomain ? `Dominant domain: ${topDomain.domain} with ${topDomain.count.toLocaleString('en-US')} repositories.` : 'Leading technology across the ecosystem.'}
            </p>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="p-6 rounded-2xl bg-gradient-to-br from-indigo-500/10 to-purple-500/10 border border-indigo-500/20"
          >
            <div className="w-10 h-10 rounded-xl bg-indigo-500/20 flex items-center justify-center text-indigo-400 mb-4">
              <Users className="w-5 h-5" />
            </div>
            <h4 className="text-white font-medium mb-2">
              {stats.total_developers.toLocaleString('en-US')} developers tracked nationwide
            </h4>
            <p className="text-slate-400 text-sm">
              {stats.total_events.toLocaleString('en-US')} events and {stats.active_developers.toLocaleString('en-US')} active developers in the ecosystem.
            </p>
          </motion.div>
        </div>
      )}
    </div>
  );
}
