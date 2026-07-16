'use client';

import { motion } from 'framer-motion';
import { 
  MapPin, Users, Code2, TrendingUp, Award, Globe, 
  ArrowUpRight, ArrowDownRight, Star, GitFork, Activity
} from 'lucide-react';
import { cn } from '@/lib/utils';

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

interface StateData {
  name: string;
  developers: string;
  repos: string;
  growth: number;
  topSkill: string;
  highlight?: string;
}

const topStates: StateData[] = [
  { name: 'Karnataka', developers: '45,000+', repos: '12,000+', growth: 23, topSkill: 'JavaScript', highlight: 'Tech Hub' },
  { name: 'Maharashtra', developers: '38,000+', repos: '9,500+', growth: 18, topSkill: 'Python' },
  { name: 'Telangana', developers: '25,000+', repos: '6,200+', growth: 31, topSkill: 'JavaScript', highlight: 'Fastest Growing' },
  { name: 'Tamil Nadu', developers: '22,000+', repos: '5,800+', growth: 15, topSkill: 'Java' },
  { name: 'Delhi NCR', developers: '35,000+', repos: '8,900+', growth: 12, topSkill: 'Python' },
  { name: 'Gujarat', developers: '12,000+', repos: '3,100+', growth: 21, topSkill: 'JavaScript' },
];

const insights = [
  {
    icon: <Award className="w-5 h-5" />,
    title: 'Karnataka leads with 45,000+ developers',
    description: 'Home to Bangalore, India\'s Silicon Valley, Karnataka continues to dominate the developer ecosystem.',
  },
  {
    icon: <TrendingUp className="w-5 h-5" />,
    title: 'Telangana fastest growing at 31%',
    description: 'Hyderabad\'s tech scene is expanding rapidly with new startups and tech parks.',
  },
  {
    icon: <Users className="w-5 h-5" />,
    title: '200,000+ developers nationwide',
    description: 'India\'s developer community continues to grow at an impressive rate.',
  },
];

const IndiaOverview = () => {
  return (
    <div className="space-y-8">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricCard
          title="Total Developers"
          value="200,000+"
          change={15}
          trend="up"
          icon={<Users className="w-6 h-6" />}
        />
        <MetricCard
          title="Active Repositories"
          value="85,000+"
          change={12}
          trend="up"
          icon={<GitFork className="w-6 h-6" />}
        />
        <MetricCard
          title="Countries"
          value="45+"
          change={5}
          trend="up"
          icon={<Globe className="w-6 h-6" />}
        />
        <MetricCard
          title="Active Contributors"
          value="35,000+"
          change={8}
          trend="up"
          icon={<Activity className="w-6 h-6" />}
        />
      </div>

      <div className="rounded-2xl bg-slate-800/50 border border-slate-700 overflow-hidden">
        <div className="p-6 border-b border-slate-700">
          <h3 className="text-lg font-semibold text-white">Top States by Developer Count</h3>
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
              {topStates.map((state, index) => (
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
        {insights.map((insight, index) => (
          <motion.div
            key={insight.title}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.1 }}
            className="p-6 rounded-2xl bg-gradient-to-br from-indigo-500/10 to-purple-500/10 border border-indigo-500/20"
          >
            <div className="w-10 h-10 rounded-xl bg-indigo-500/20 flex items-center justify-center text-indigo-400 mb-4">
              {insight.icon}
            </div>
            <h4 className="text-white font-medium mb-2">{insight.title}</h4>
            <p className="text-slate-400 text-sm">{insight.description}</p>
          </motion.div>
        ))}
      </div>
    </div>
  );
};

export default IndiaOverview;