'use client';

import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { 
  Users, GitFork, Globe, Activity, Award, TrendingUp, ArrowUpRight, ArrowDownRight, Loader2
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { api, EcosystemStats } from '@/lib/api';

interface MetricCardProps {
  title: string;
  value: string;
  change?: number;
  icon: React.ReactNode;
  trend?: 'up' | 'down';
}

const MetricCard = ({ title, value, change, icon, trend = 'up' }: MetricCardProps) => (
  <motion.div
    initial={{ opacity: 0, scale: 0.95 }}
    animate={{ opacity: 1, scale: 1 }}
    className="relative overflow-hidden rounded-2xl bg-slate-800/50 border border-slate-700 p-6"
  >
    <div className="flex items-start justify-between mb-4">
      <div className="p-3 rounded-xl bg-indigo-500/10 text-indigo-400">
        {icon}
      </div>
      {change !== undefined && (
        <div className={cn(
          'flex items-center gap-1 text-sm font-medium',
          trend === 'up' ? 'text-emerald-400' : 'text-red-400'
        )}>
          {trend === 'up' ? <ArrowUpRight className="w-4 h-4" /> : <ArrowDownRight className="w-4 h-4" />}
          {Math.abs(change)}%
        </div>
      )}
    </div>
    <div className="text-3xl font-bold text-white mb-1">{value}</div>
    <div className="text-slate-400 text-sm">{title}</div>
  </motion.div>
);

interface StateItem {
  name: string;
  developers: string;
  repos: string;
  growth: number;
  topSkill: string;
  highlight?: string;
}

interface IndiaOverviewProps {
  year?: number;
}

const defaultStates: StateItem[] = [
  { name: 'Karnataka', developers: '45,000+', repos: '12,000+', growth: 23, topSkill: 'TypeScript', highlight: 'Tech Hub' },
  { name: 'Maharashtra', developers: '38,000+', repos: '9,500+', growth: 18, topSkill: 'Python' },
  { name: 'Telangana', developers: '25,000+', repos: '6,200+', growth: 31, topSkill: 'JavaScript', highlight: 'Fastest Growing' },
  { name: 'Tamil Nadu', developers: '22,000+', repos: '5,800+', growth: 15, topSkill: 'Java' },
  { name: 'Delhi NCR', developers: '35,000+', repos: '8,900+', growth: 12, topSkill: 'Python' },
  { name: 'Gujarat', developers: '12,000+', repos: '3,100+', growth: 21, topSkill: 'Go' },
];

export default function IndiaOverview({ year = 2026 }: IndiaOverviewProps) {
  const [stats, setStats] = useState<EcosystemStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [states, setStates] = useState<StateItem[]>(defaultStates);

  useEffect(() => {
    let mounted = true;
    setLoading(true);

    api.getEcosystemStats(year)
      .then((data) => {
        if (mounted) {
          setStats(data);
        }
      })
      .catch(() => {
        // Fallback to default structure if offline
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });

    return () => {
      mounted = false;
    };
  }, [year]);

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
          value={stats ? `${(stats.total_developers / 1000).toFixed(1)}K` : "200,000+"}
          change={15}
          trend="up"
          icon={<Users className="w-6 h-6" />}
        />
        <MetricCard
          title="Active Repositories"
          value={stats ? stats.total_repositories.toLocaleString() : "85,000+"}
          change={12}
          trend="up"
          icon={<GitFork className="w-6 h-6" />}
        />
        <MetricCard
          title="AI Repository %"
          value={stats ? `${stats.ai_repo_percentage}%` : "34.2%"}
          change={8}
          trend="up"
          icon={<Globe className="w-6 h-6" />}
        />
        <MetricCard
          title="Total Stars"
          value={stats ? stats.total_stars.toLocaleString() : "350,000+"}
          change={18}
          trend="up"
          icon={<Activity className="w-6 h-6" />}
        />
      </div>

      <div className="rounded-2xl bg-slate-800/50 border border-slate-700 overflow-hidden">
        <div className="p-6 border-b border-slate-700">
          <h3 className="text-lg font-semibold text-white">Top States by Developer Count ({year})</h3>
          <p className="text-slate-400 text-sm mt-1">Leading Indian states in software development</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-slate-900/50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-wider">State</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-wider">Developers</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-wider">Repositories</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-wider">Growth</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-wider">Top Skill</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-700">
              {states.map((state, index) => (
                <motion.tr
                  key={state.name}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: index * 0.05 }}
                  className="hover:bg-slate-700/30 transition-colors"
                >
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-indigo-500/20 flex items-center justify-center text-indigo-400 text-sm font-medium">
                        {index + 1}
                      </div>
                      <div>
                        <div className="text-white font-medium">{state.name}</div>
                        {state.highlight && (
                          <span className="text-xs text-indigo-400">{state.highlight}</span>
                        )}
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-slate-300">{state.developers}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-slate-300">{state.repos}</td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className="inline-flex items-center gap-1 text-emerald-400 text-sm">
                      <ArrowUpRight className="w-4 h-4" />
                      {state.growth}%
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className="px-2 py-1 rounded-full bg-slate-700 text-slate-300 text-xs">
                      {state.topSkill}
                    </span>
                  </td>
                </motion.tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="grid md:grid-cols-3 gap-4">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="p-6 rounded-2xl bg-gradient-to-br from-indigo-500/10 to-purple-500/10 border border-indigo-500/20"
        >
          <div className="w-10 h-10 rounded-xl bg-indigo-500/20 flex items-center justify-center text-indigo-400 mb-4">
            <Award className="w-5 h-5" />
          </div>
          <h4 className="text-white font-medium mb-2">Karnataka leads with 45,000+ developers</h4>
          <p className="text-slate-400 text-sm">Home to Bangalore, India&apos;s Silicon Valley, Karnataka dominates AI & web dev clusters.</p>
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
          <h4 className="text-white font-medium mb-2">Telangana fastest growing at 31%</h4>
          <p className="text-slate-400 text-sm">Hyderabad tech scene is expanding rapidly with open source AI startups.</p>
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
          <h4 className="text-white font-medium mb-2">200,000+ developers nationwide</h4>
          <p className="text-slate-400 text-sm">India developer community continues to grow with high velocity in LLM & Web3 tools.</p>
        </motion.div>
      </div>
    </div>
  );
}