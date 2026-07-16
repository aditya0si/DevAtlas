'use client';

import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Trophy,
  TrendingUp,
  Bot,
  Shield,
  Activity,
  Target,
  Award
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface EcosystemScore {
  state: string;
  developer_activity_score: number;
  innovation_score: number;
  open_source_score: number;
  ai_score: number;
  cybersecurity_score: number;
  growth_score: number;
  overall_score: number;
  rank: number;
}

type MetricType = 'overall' | 'ai' | 'cybersecurity' | 'growth';

const METRICS: { key: MetricType; label: string; icon: React.ReactNode; color: string }[] = [
  { key: 'overall', label: 'Overall', icon: <Trophy size={16} />, color: 'text-indigo-400' },
  { key: 'ai', label: 'AI Score', icon: <Bot size={16} />, color: 'text-emerald-400' },
  { key: 'cybersecurity', label: 'Security', icon: <Shield size={16} />, color: 'text-blue-400' },
  { key: 'growth', label: 'Growth', icon: <TrendingUp size={16} />, color: 'text-orange-400' },
];

function getScoreColor(value: number): string {
  if (value >= 80) return 'text-emerald-400';
  if (value >= 60) return 'text-blue-400';
  if (value >= 40) return 'text-yellow-400';
  return 'text-slate-400';
}

function getScoreBgColor(value: number): string {
  if (value >= 80) return 'bg-emerald-500';
  if (value >= 60) return 'bg-blue-500';
  if (value >= 40) return 'bg-yellow-500';
  return 'bg-slate-500';
}

function getRankIcon(rank: number): string {
  switch (rank) {
    case 1: return '??';
    case 2: return '??';
    case 3: return '??';
    default: return `#${rank}`;
  }
}

function ScoreBar({ value, selected, colorClass }: { value: number; selected: boolean; colorClass: string }) {
  return (
    <div className="w-20 h-2 bg-slate-700 rounded-full overflow-hidden">
      <motion.div
        initial={{ width: 0 }}
        animate={{ width: `${value}%` }}
        transition={{ duration: 0.5, ease: 'easeOut' }}
        className={cn("h-full rounded-full", colorClass)}
      />
    </div>
  );
}

function MetricButton({ metric, active, onClick }: { 
  metric: typeof METRICS[0]; 
  active: boolean; 
  onClick: () => void;
}) {
  return (
    <motion.button
      onClick={onClick}
      className={cn(
        "flex items-center gap-2 px-4 py-2 text-sm rounded-xl transition-all",
        active
          ? "bg-indigo-600 text-white shadow-lg shadow-indigo-500/25"
          : "bg-slate-800/50 text-slate-400 hover:text-slate-200 hover:bg-slate-700/50 border border-slate-700/50"
      )}
      whileHover={{ scale: 1.02 }}
      whileTap={{ scale: 0.98 }}
    >
      <span className={active ? 'text-white' : metric.color}>{metric.icon}</span>
      {metric.label}
    </motion.button>
  );
}

export default function EcosystemScores() {
  const [scores, setScores] = useState<EcosystemScore[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedMetric, setSelectedMetric] = useState<MetricType>('overall');

  useEffect(() => {
    const fetchScores = async () => {
      try {
        const response = await fetch('/api/v1/india/scores');
        if (!response.ok) throw new Error('Failed to fetch scores');
        const data = await response.json();
        setScores(data);
      } catch (error) {
        console.error('Failed to fetch ecosystem scores', error);
      } finally {
        setLoading(false);
      }
    };

    fetchScores();
  }, []);

  const getScoreValue = (score: EcosystemScore): number => {
    switch (selectedMetric) {
      case 'ai': return score.ai_score;
      case 'cybersecurity': return score.cybersecurity_score;
      case 'growth': return score.growth_score;
      default: return score.overall_score;
    }
  };

  const getSelectedColor = (): string => {
    switch (selectedMetric) {
      case 'ai': return 'bg-emerald-500';
      case 'cybersecurity': return 'bg-blue-500';
      case 'growth': return 'bg-orange-500';
      default: return 'bg-indigo-500';
    }
  };

  if (loading) {
    return (
      <div className="animate-pulse space-y-4">
        <div className="h-10 bg-slate-700 rounded w-1/4" />
        <div className="space-y-2">
          {[...Array(10)].map((_, i) => (
            <div key={i} className="h-16 bg-slate-700 rounded-xl" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Award size={24} className="text-indigo-400" />
        <h2 className="text-2xl font-bold text-slate-200">Ecosystem Rankings</h2>
      </div>

      {/* Metric Selector */}
      <div className="flex gap-2 flex-wrap">
        {METRICS.map((metric) => (
          <MetricButton
            key={metric.key}
            metric={metric}
            active={selectedMetric === metric.key}
            onClick={() => setSelectedMetric(metric.key)}
          />
        ))}
      </div>

      {/* Leaderboard */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="bg-slate-800/50 rounded-2xl border border-slate-700/50 overflow-hidden"
      >
        {/* Header */}
        <div className="grid grid-cols-12 gap-4 px-6 py-3 bg-slate-900/50 text-sm text-slate-400 border-b border-slate-700">
          <div className="col-span-1">Rank</div>
          <div className="col-span-4">State</div>
          <div className="col-span-2 text-right">Activity</div>
          <div className="col-span-2 text-right">Innovation</div>
          <div className="col-span-3 text-right">Selected</div>
        </div>

        {/* Rows */}
        <AnimatePresence mode="wait">
          {scores.map((score, index) => (
            <motion.div
              key={score.state}
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: index * 0.03 }}
              className={cn(
                "grid grid-cols-12 gap-4 px-6 py-4 items-center border-b border-slate-700/50 transition-colors",
                index % 2 === 0 ? 'bg-slate-800/30' : 'bg-slate-800/10',
                "hover:bg-indigo-900/20"
              )}
            >
              <div className="col-span-1 text-2xl">{getRankIcon(score.rank)}</div>
              <div className="col-span-4">
                <p className="text-slate-200 font-medium">{score.state}</p>
              </div>
              <div className="col-span-2 text-right">
                <span className={getScoreColor(score.developer_activity_score)}>
                  {score.developer_activity_score.toFixed(1)}
                </span>
              </div>
              <div className="col-span-2 text-right">
                <span className={getScoreColor(score.innovation_score)}>
                  {score.innovation_score.toFixed(1)}
                </span>
              </div>
              <div className="col-span-3 text-right">
                <div className="flex items-center justify-end gap-2">
                  <ScoreBar 
                    value={getScoreValue(score)} 
                    selected={selectedMetric !== 'overall'}
                    colorClass={getSelectedColor()}
                  />
                  <span className={cn("font-bold w-12 text-right", getScoreColor(getScoreValue(score)))}>
                    {getScoreValue(score).toFixed(1)}
                  </span>
                </div>
              </div>
            </motion.div>
          ))}
        </AnimatePresence>
      </motion.div>

      {/* Score Legend */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
        className="bg-slate-800/30 rounded-2xl p-5 border border-slate-700"
      >
        <div className="flex items-center gap-2 mb-4">
          <Target size={16} className="text-slate-400" />
          <h4 className="text-sm font-semibold text-slate-300">Score Components</h4>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 text-sm">
          <div>
            <p className="text-slate-400 font-medium">Developer Activity</p>
            <p className="text-xs text-slate-500 mt-1">Based on repo count and developer engagement</p>
          </div>
          <div>
            <p className="text-slate-400 font-medium">Innovation</p>
            <p className="text-xs text-slate-500 mt-1">New projects and emerging technologies</p>
          </div>
          <div>
            <p className="text-slate-400 font-medium">Open Source</p>
            <p className="text-xs text-slate-500 mt-1">Public contributions and community engagement</p>
          </div>
          <div>
            <p className="text-slate-400 font-medium">AI Score</p>
            <p className="text-xs text-slate-500 mt-1">AI/ML repository concentration</p>
          </div>
          <div>
            <p className="text-slate-400 font-medium">Cybersecurity</p>
            <p className="text-xs text-slate-500 mt-1">Security-focused projects</p>
          </div>
          <div>
            <p className="text-slate-400 font-medium">Growth</p>
            <p className="text-xs text-slate-500 mt-1">Recent activity and momentum</p>
          </div>
        </div>
      </motion.div>
    </div>
  );
}