'use client';

import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { 
  Map, TrendingUp, Users, Code2, Sparkles, ArrowRight, 
  Star, GitFork, Activity, Zap, Globe, Loader2, AlertTriangle
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { api, EcosystemStats } from '@/lib/api';

interface Stat {
  label: string;
  value: number;
  suffix?: string;
  change?: string;
  trend?: 'up' | 'down';
}

/**
 * Build the four landing-page stat cards purely from the API-backed ecosystem
 * stats for the selected year. No invented numbers — the only change badge is
 * the real repository monthly-growth metric.
 */
function buildStats(stats: EcosystemStats): Stat[] {
  const monthlyGrowth = stats.growth_metrics?.monthly_growth;
  return [
    { label: 'Total Developers', value: stats.total_developers ?? 0 },
    {
      label: 'Active Repositories',
      value: stats.total_repositories ?? 0,
      change:
        typeof monthlyGrowth === 'number' && monthlyGrowth > 0
          ? `+${monthlyGrowth.toFixed(1)}%`
          : undefined,
      trend: 'up',
    },
    {
      label: 'AI Repository %',
      value: Math.round(stats.ai_repo_percentage ?? 0),
      suffix: '%',
    },
    { label: 'Total Stars', value: stats.total_stars ?? 0 },
  ];
}

const features = [
  {
    icon: <Map className="w-6 h-6" />,
    title: 'Geographic Intelligence',
    description: 'Visualize developer density across Indian states with heatmaps and interactive charts.',
  },
  {
    icon: <TrendingUp className="w-6 h-6" />,
    title: 'Trend Analysis',
    description: 'Track growth patterns, emerging technologies, and ecosystem evolution over time.',
  },
  {
    icon: <Users className="w-6 h-6" />,
    title: 'Community Insights',
    description: 'Understand developer demographics, skill distribution, and collaboration patterns.',
  },
  {
    icon: <Code2 className="w-6 h-6" />,
    title: 'Technology Radar',
    description: 'Discover trending frameworks, languages, and tools across different regions.',
  },
];

const AnimatedCounter = ({ value, duration = 2000 }: { value: number; duration?: number }) => {
  const [count, setCount] = useState(0);

  useEffect(() => {
    let startTime: number;
    const animate = (currentTime: number) => {
      if (!startTime) startTime = currentTime;
      const progress = Math.min((currentTime - startTime) / duration, 1);
      setCount(Math.floor(progress * value));
      if (progress < 1) {
        requestAnimationFrame(animate);
      }
    };
    requestAnimationFrame(animate);
  }, [value, duration]);

  return <span>{count.toLocaleString()}</span>;
};

interface PremiumHomepageProps {
  year?: number;
  onExploreMap?: () => void;
}

const HeroSection = ({ onExploreMap }: { onExploreMap?: () => void }) => (
  <section className="relative overflow-hidden">
    <div className="absolute inset-0 bg-gradient-to-br from-indigo-900/20 via-purple-900/10 to-slate-900" />
    <div className="absolute top-20 left-1/4 w-96 h-96 bg-indigo-500/20 rounded-full blur-3xl" />
    <div className="absolute bottom-20 right-1/4 w-96 h-96 bg-purple-500/20 rounded-full blur-3xl" />
    
    <div className="relative container mx-auto px-4 py-24">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6 }}
        className="text-center max-w-4xl mx-auto"
      >
        <div className="inline-flex items-center gap-2 px-4 py-2 mb-6 rounded-full bg-indigo-500/10 border border-indigo-500/20">
          <Sparkles className="w-4 h-4 text-indigo-400" />
          <span className="text-sm text-indigo-300">AI-Powered Developer Intelligence</span>
        </div>
        
        <h1 className="text-5xl md:text-6xl font-bold mb-6">
          <span className="bg-gradient-to-r from-white via-indigo-200 to-purple-200 bg-clip-text text-transparent">
            DevAtlas India
          </span>
        </h1>
        
        <p className="text-xl text-slate-400 mb-8 max-w-2xl mx-auto">
          Explore India&apos;s developer ecosystem through interactive maps, analytics, and AI-powered insights. 
          Discover trends, compare regions, and uncover opportunities.
        </p>
        
        <div className="flex flex-wrap justify-center gap-4">
          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={onExploreMap}
            className="px-6 py-3 bg-indigo-600 hover:bg-indigo-700 text-white font-medium rounded-xl flex items-center gap-2 transition-colors cursor-pointer"
          >
            Explore Map <ArrowRight className="w-4 h-4" />
          </motion.button>
          <motion.a
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            href="https://github.com/aditya0si/DevAtlas"
            target="_blank"
            rel="noopener noreferrer"
            className="px-6 py-3 bg-slate-800 hover:bg-slate-700 text-white font-medium rounded-xl flex items-center gap-2 transition-colors border border-slate-700 cursor-pointer"
          >
            <Star className="w-4 h-4" /> View on GitHub
          </motion.a>
        </div>
      </motion.div>
    </div>
  </section>
);

const StatsSection = ({
  stats,
  loading,
  error,
}: {
  stats: EcosystemStats | null;
  loading: boolean;
  error: string | null;
}) => (
  <section className="py-16 border-y border-slate-800 bg-slate-900/50">
    <div className="container mx-auto px-4">
      {loading && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="text-center">
              <div className="h-10 w-28 mx-auto mb-3 rounded-lg bg-slate-800 animate-pulse" />
              <div className="h-3 w-20 mx-auto mb-2 rounded bg-slate-800 animate-pulse" />
              <div className="h-3 w-12 mx-auto rounded bg-slate-800/60 animate-pulse" />
            </div>
          ))}
        </div>
      )}

      {!loading && error && (
        <div className="flex items-center justify-center gap-3 py-8 text-sm text-slate-400">
          <AlertTriangle className="w-5 h-5 text-amber-400" />
          <span>
            Couldn&apos;t load ecosystem stats. Showing no data — the rest of the
            page remains available.
          </span>
        </div>
      )}

      {!loading && !error && stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
          {buildStats(stats).map((stat, index) => (
            <motion.div
              key={stat.label}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.1 }}
              className="text-center"
            >
              <div className="text-3xl md:text-4xl font-bold text-white mb-1">
                <AnimatedCounter value={stat.value} />
                {stat.suffix ?? ''}
              </div>
              <div className="text-slate-400 text-sm">{stat.label}</div>
              {stat.change && (
                <div className={cn(
                  'text-xs mt-1 flex items-center justify-center gap-1',
                  stat.trend === 'up' ? 'text-emerald-400' : 'text-red-400'
                )}>
                  {stat.trend === 'up' ? <TrendingUp className="w-3 h-3" /> : null}
                  {stat.change}
                </div>
              )}
            </motion.div>
          ))}
        </div>
      )}
    </div>
  </section>
);

const FeaturesSection = () => (
  <section className="py-20">
    <div className="container mx-auto px-4">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        className="text-center mb-12"
      >
        <h2 className="text-3xl font-bold text-white mb-4">Powerful Features</h2>
        <p className="text-slate-400 max-w-2xl mx-auto">
          Everything you need to understand and analyze India&apos;s developer ecosystem
        </p>
      </motion.div>
      
      <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
        {features.map((feature, index) => (
          <motion.div
            key={feature.title}
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: index * 0.1 }}
            className="p-6 rounded-2xl bg-slate-800/50 border border-slate-700 hover:border-indigo-500/50 transition-colors"
          >
            <div className="w-12 h-12 rounded-xl bg-indigo-500/10 flex items-center justify-center text-indigo-400 mb-4">
              {feature.icon}
            </div>
            <h3 className="text-lg font-semibold text-white mb-2">{feature.title}</h3>
            <p className="text-slate-400 text-sm">{feature.description}</p>
          </motion.div>
        ))}
      </div>
    </div>
  </section>
);

const QuickActions = ({ onExploreMap }: { onExploreMap?: () => void }) => (
  <section className="py-20 bg-slate-900/50 border-t border-slate-800">
    <div className="container mx-auto px-4">
      <h2 className="text-3xl font-bold text-white mb-8 text-center">Quick Actions</h2>
      <div className="grid md:grid-cols-3 gap-6">
        <motion.div
          whileHover={{ scale: 1.02 }}
          onClick={onExploreMap}
          className="p-6 rounded-2xl bg-gradient-to-br from-indigo-500/10 to-purple-500/10 border border-indigo-500/20 cursor-pointer"
        >
          <Globe className="w-8 h-8 text-indigo-400 mb-4" />
          <h3 className="text-lg font-semibold text-white mb-2">Explore States</h3>
          <p className="text-slate-400 text-sm mb-4">Compare developer ecosystems across Indian states</p>
          <span className="text-indigo-400 text-sm flex items-center gap-1">
            Get Started <ArrowRight className="w-4 h-4" />
          </span>
        </motion.div>
        
        <motion.div
          whileHover={{ scale: 1.02 }}
          onClick={onExploreMap}
          className="p-6 rounded-2xl bg-gradient-to-br from-emerald-500/10 to-teal-500/10 border border-emerald-500/20 cursor-pointer"
        >
          <Activity className="w-8 h-8 text-emerald-400 mb-4" />
          <h3 className="text-lg font-semibold text-white mb-2">View Analytics</h3>
          <p className="text-slate-400 text-sm mb-4">Explore trends and patterns in the ecosystem</p>
          <span className="text-emerald-400 text-sm flex items-center gap-1">
            Explore <ArrowRight className="w-4 h-4" />
          </span>
        </motion.div>
        
        <motion.div
          whileHover={{ scale: 1.02 }}
          onClick={onExploreMap}
          className="p-6 rounded-2xl bg-gradient-to-br from-amber-500/10 to-orange-500/10 border border-amber-500/20 cursor-pointer"
        >
          <Zap className="w-8 h-8 text-amber-400 mb-4" />
          <h3 className="text-lg font-semibold text-white mb-2">AI Insights</h3>
          <p className="text-slate-400 text-sm mb-4">Get AI-powered analysis and recommendations</p>
          <span className="text-amber-400 text-sm flex items-center gap-1">
            Discover <ArrowRight className="w-4 h-4" />
          </span>
        </motion.div>
      </div>
    </div>
  </section>
);

export default function PremiumHomepage({ year, onExploreMap }: PremiumHomepageProps) {
  const [stats, setStats] = useState<EcosystemStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError(null);

    api
      .getEcosystemStats(year, controller.signal)
      .then((data) => {
        if (!controller.signal.aborted) setStats(data);
      })
      .catch((err) => {
        if (err?.name === 'AbortError') return;
        if (!controller.signal.aborted) {
          setStats(null);
          setError(err?.message || 'Failed to load ecosystem stats');
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });

    return () => {
      controller.abort();
    };
  }, [year]);

  return (
    <div className="min-h-screen bg-slate-950">
      <HeroSection onExploreMap={onExploreMap} />
      <StatsSection stats={stats} loading={loading} error={error} />
      <FeaturesSection />
      <QuickActions onExploreMap={onExploreMap} />
    </div>
  );
}