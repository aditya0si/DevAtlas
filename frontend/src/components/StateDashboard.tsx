'use client';

import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { 
  MapPin, Users, GitFork, TrendingUp, Award, ArrowUpRight,
  Activity, Loader2, AlertTriangle
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { api, EcosystemStats, StateDashboardData } from '@/lib/api';
import { getCurrentYear } from '@/lib/dates';

interface StateSummary {
  state: string;
  repositories: number;
  rank: number;
}

const StateCard = ({ state, isSelected, onClick }: { state: StateSummary; isSelected: boolean; onClick: () => void }) => (
  <motion.button
    onClick={onClick}
    initial={{ opacity: 0, y: 20 }}
    animate={{ opacity: 1, y: 0 }}
    whileHover={{ scale: 1.02 }}
    whileTap={{ scale: 0.98 }}
    className={cn(
      'w-full p-6 rounded-2xl border text-left transition-all',
      isSelected 
        ? 'bg-indigo-500/10 border-indigo-500/50' 
        : 'bg-slate-800/50 border-slate-700 hover:border-slate-600'
    )}
  >
    <div className="flex items-start justify-between mb-4">
      <div className="flex items-center gap-3">
        <div className={cn(
          'w-12 h-12 rounded-xl flex items-center justify-center',
          isSelected ? 'bg-indigo-500/30 text-indigo-300' : 'bg-slate-700 text-slate-400'
        )}>
          <MapPin className="w-6 h-6" />
        </div>
        <div>
          <h3 className="text-lg font-semibold text-white">{state.state}</h3>
          <span className="text-xs text-indigo-400 font-medium">Rank #{state.rank}</span>
        </div>
      </div>
    </div>
    
    <div className="flex items-center justify-between text-sm">
      <span className="text-slate-400">Repositories</span>
      <span className="text-white font-medium">{state.repositories.toLocaleString('en-US')}</span>
    </div>
  </motion.button>
);

const StateDashboard = ({ year = getCurrentYear() }: { year?: number }) => {
  const [states, setStates] = useState<StateSummary[]>([]);
  const [selectedState, setSelectedState] = useState<string | null>(null);
  const [dashboard, setDashboard] = useState<StateDashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load the real top-states list for the selected year.
  useEffect(() => {
    const controller = new AbortController();
    let cancelled = false;
    setLoading(true);
    setSelectedState(null);
    setDashboard(null);

    api
      .getEcosystemStats(year, controller.signal)
      .then((data: EcosystemStats) => {
        if (!cancelled) {
          setStates(data.top_states?.map((s) => ({ state: s.state, repositories: s.repositories, rank: s.rank })) || []);
        }
      })
      .catch((err) => {
        if (err?.name === 'AbortError') return;
        if (!cancelled) setError(err?.message || 'Failed to load state data');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [year]);

  // Fetch the detailed dashboard for the selected state.
  useEffect(() => {
    if (!selectedState) {
      setDashboard(null);
      return;
    }

    const controller = new AbortController();
    let cancelled = false;
    setDetailLoading(true);

    api
      .getStateDashboard(selectedState, year, controller.signal)
      .then((data) => {
        if (!cancelled) setDashboard(data);
      })
      .catch((err) => {
        if (err?.name === 'AbortError') return;
        if (!cancelled) setError(err?.message || 'Failed to load state dashboard');
      })
      .finally(() => {
        if (!cancelled) setDetailLoading(false);
      });

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [selectedState, year]);

  return (
    <div className="grid lg:grid-cols-2 gap-6">
      <div className="space-y-4">
        <h2 className="text-xl font-semibold text-white mb-4">Select a State ({year})</h2>
        {loading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="w-6 h-6 text-indigo-400 animate-spin" />
          </div>
        ) : error ? (
          <div className="p-6 rounded-2xl bg-red-500/10 border border-red-500/30 flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-red-400 shrink-0" />
            <div>
              <p className="text-red-300 font-medium">Unable to load state data</p>
              <p className="text-slate-400 text-sm">{error}</p>
            </div>
          </div>
        ) : states.length === 0 ? (
          <p className="text-slate-400 text-sm">No state data available for {year} yet.</p>
        ) : (
          <div className="grid gap-4">
            {states.map((state) => (
              <StateCard
                key={state.state}
                state={state}
                isSelected={selectedState === state.state}
                onClick={() => {
                  setSelectedState(state.state);
                  setError(null);
                }}
              />
            ))}
          </div>
        )}
      </div>
      
      <div className="space-y-6">
        {detailLoading ? (
          <div className="rounded-2xl bg-slate-800/50 border border-slate-700 p-6 flex justify-center py-16">
            <Loader2 className="w-6 h-6 text-indigo-400 animate-spin" />
          </div>
        ) : dashboard ? (
          <motion.div
            key={dashboard.state}
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            className="rounded-2xl bg-slate-800/50 border border-slate-700 p-6"
          >
            <div className="flex items-start justify-between mb-6">
              <div>
                <h3 className="text-2xl font-bold text-white mb-1">{dashboard.state}</h3>
                <span className="inline-block px-3 py-1 rounded-full bg-indigo-500/20 text-indigo-300 text-sm">
                  {year}
                </span>
              </div>
            </div>

            {dashboard.ai_summary && (
              <p className="text-slate-400 mb-6 text-sm leading-relaxed">{dashboard.ai_summary}</p>
            )}
            
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
              <div className="p-4 rounded-xl bg-slate-900/50">
                <Users className="w-5 h-5 text-indigo-400 mb-2" />
                <div className="text-2xl font-bold text-white">{dashboard.repository_count.toLocaleString('en-US')}</div>
                <div className="text-xs text-slate-400">Repositories</div>
              </div>
              <div className="p-4 rounded-xl bg-slate-900/50">
                <GitFork className="w-5 h-5 text-emerald-400 mb-2" />
                <div className="text-2xl font-bold text-white">{dashboard.active_developers.toLocaleString('en-US')}</div>
                <div className="text-xs text-slate-400">Active Developers</div>
              </div>
              <div className="p-4 rounded-xl bg-slate-900/50">
                <TrendingUp className="w-5 h-5 text-amber-400 mb-2" />
                <div className="text-2xl font-bold text-white flex items-center gap-1">
                  <ArrowUpRight className="w-4 h-4" />
                  {dashboard.weekly_growth_percent}%
                </div>
                <div className="text-xs text-slate-400">Weekly Growth</div>
              </div>
              <div className="p-4 rounded-xl bg-slate-900/50">
                <Activity className="w-5 h-5 text-cyan-400 mb-2" />
                <div className="text-2xl font-bold text-white">{dashboard.monthly_growth_percent}%</div>
                <div className="text-xs text-slate-400">Monthly Growth</div>
              </div>
            </div>
            
            {dashboard.top_languages && dashboard.top_languages.length > 0 && (
              <div className="mb-6">
                <h4 className="text-sm font-medium text-slate-400 mb-3">Top Languages</h4>
                <div className="flex flex-wrap gap-2">
                  {dashboard.top_languages.slice(0, 6).map((lang) => (
                    <span 
                      key={lang.language}
                      className="px-4 py-2 rounded-xl bg-indigo-500/10 border border-indigo-500/20 text-indigo-300"
                    >
                      {lang.language}
                      {typeof lang.count === 'number' ? ` · ${lang.count}` : ''}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {dashboard.top_organizations && dashboard.top_organizations.length > 0 && (
              <div className="mb-6">
                <h4 className="text-sm font-medium text-slate-400 mb-3">Top Organizations</h4>
                <div className="space-y-2">
                  {dashboard.top_organizations.slice(0, 5).map((org, i) => (
                    <div key={org.login} className="flex items-center gap-3 p-2 rounded-lg hover:bg-slate-700/50 transition-colors">
                      <span className="flex items-center justify-center w-6 h-6 rounded-full bg-slate-700 text-slate-300 text-xs font-semibold">
                        {i + 1}
                      </span>
                      <span className="text-slate-300">{org.login}</span>
                      <span className="ml-auto text-slate-400 text-sm">{org.repositories} repos</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {dashboard.trending_projects && dashboard.trending_projects.length > 0 && (
              <div>
                <h4 className="text-sm font-medium text-slate-400 mb-3">Trending Projects</h4>
                <div className="space-y-2">
                  {dashboard.trending_projects.slice(0, 5).map((repo) => (
                    <div key={repo.full_name} className="flex items-center gap-3 p-2 rounded-lg hover:bg-slate-700/50 transition-colors">
                      <div className="text-slate-300 flex-1 min-w-0 truncate">{repo.full_name}</div>
                      {repo.language && (
                        <span className="text-slate-400 text-xs">{repo.language}</span>
                      )}
                      <span className="flex items-center gap-1 text-amber-400 text-sm shrink-0">
                        <Award className="w-3 h-3" />
                        {repo.stars.toLocaleString('en-US')}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </motion.div>
        ) : (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="h-full flex items-center justify-center rounded-2xl bg-slate-800/30 border border-slate-700 border-dashed"
          >
            <div className="text-center">
              <MapPin className="w-12 h-12 text-slate-500 mx-auto mb-4" />
              <p className="text-slate-400">Select a state to view details</p>
            </div>
          </motion.div>
        )}
      </div>
    </div>
  );
};

export default StateDashboard;
