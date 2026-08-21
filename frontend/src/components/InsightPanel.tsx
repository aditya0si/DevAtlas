'use client';

import { useCallback, useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { 
  Lightbulb, 
  MapPin, 
  TrendingUp, 
  Bot, 
  Shield, 
  Heart,
  Globe,
  Smartphone,
  Cloud,
  Lock,
  Star,
  RefreshCw
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { api, Insight } from '@/lib/api';

interface InsightPanelProps {
  limit?: number;
  autoRefresh?: boolean;
  refreshInterval?: number;
}

const CATEGORY_CONFIG: Record<string, { icon: React.ReactNode; color: string; gradient: string }> = {
  ai: { icon: <Bot size={16} />, color: 'text-emerald-400', gradient: 'from-emerald-500/10 to-emerald-600/10 border-emerald-500/30' },
  cybersecurity: { icon: <Shield size={16} />, color: 'text-blue-400', gradient: 'from-blue-500/10 to-blue-600/10 border-blue-500/30' },
  healthcare: { icon: <Heart size={16} />, color: 'text-red-400', gradient: 'from-red-500/10 to-red-600/10 border-red-500/30' },
  robotics: { icon: <Globe size={16} />, color: 'text-purple-400', gradient: 'from-purple-500/10 to-purple-600/10 border-purple-500/30' },
  web: { icon: <Globe size={16} />, color: 'text-cyan-400', gradient: 'from-cyan-500/10 to-cyan-600/10 border-cyan-500/30' },
  mobile: { icon: <Smartphone size={16} />, color: 'text-orange-400', gradient: 'from-orange-500/10 to-orange-600/10 border-orange-500/30' },
  devops: { icon: <Cloud size={16} />, color: 'text-yellow-400', gradient: 'from-yellow-500/10 to-yellow-600/10 border-yellow-500/30' },
  blockchain: { icon: <Lock size={16} />, color: 'text-pink-400', gradient: 'from-pink-500/10 to-pink-600/10 border-pink-500/30' },
  opensource: { icon: <Star size={16} />, color: 'text-green-400', gradient: 'from-green-500/10 to-green-600/10 border-green-500/30' },
  general: { icon: <Lightbulb size={16} />, color: 'text-slate-400', gradient: 'from-slate-500/10 to-slate-600/10 border-slate-500/30' },
};

function InsightCard({ insight, index }: { insight: Insight; index: number }) {
  const config = CATEGORY_CONFIG[insight.category] || CATEGORY_CONFIG.general;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.05 }}
      whileHover={{ scale: 1.02, y: -2 }}
      className={cn(
        "bg-gradient-to-br rounded-2xl p-4 border backdrop-blur-sm cursor-default",
        "hover:shadow-lg hover:shadow-indigo-500/10 transition-all duration-200",
        config.gradient
      )}
    >
      <div className="flex items-start gap-3">
        <motion.div 
          className={cn("mt-0.5", config.color)}
          whileHover={{ scale: 1.1, rotate: 5 }}
        >
          {config.icon}
        </motion.div>
        <div className="flex-1 min-w-0">
          <p className="text-slate-200 leading-relaxed">{insight.text}</p>
          <div className="flex flex-wrap items-center gap-2 mt-3">
            <motion.span 
              whileHover={{ scale: 1.05 }}
              className={cn(
                "text-xs px-2.5 py-1 rounded-full capitalize font-medium cursor-default",
                insight.category === 'ai' ? 'bg-emerald-500/20 text-emerald-300' :
                insight.category === 'cybersecurity' ? 'bg-blue-500/20 text-blue-300' :
                insight.category === 'healthcare' ? 'bg-red-500/20 text-red-300' :
                insight.category === 'robotics' ? 'bg-purple-500/20 text-purple-300' :
                'bg-slate-500/20 text-slate-300'
              )}
            >
              {insight.category}
            </motion.span>
            {insight.region && (
              <span className="text-xs text-slate-400 flex items-center gap-1">
                <MapPin size={10} />
                {insight.region}
              </span>
            )}
            <span className="text-xs text-slate-500">
              {insight.time_range}
            </span>
            {insight.metric_value !== null && (
              <span className="text-xs text-emerald-400 font-medium flex items-center gap-1">
                <TrendingUp size={10} />
                +{insight.metric_value}%
              </span>
            )}
          </div>
        </div>
      </div>
    </motion.div>
  );
}

export default function InsightPanel({
  limit = 5,
  autoRefresh = true,
  refreshInterval = 60000,
}: InsightPanelProps) {
  const [insights, setInsights] = useState<Insight[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const fetchInsights = useCallback(async (signal: AbortSignal) => {
    try {
      const data = await api.getInsights(limit, signal);
      // The request may have been cancelled (unmount/refresh) while in flight —
      // a stale success result must not touch state.
      if (signal.aborted) return;
      setInsights(data);
      setError(null);
      setLastUpdated(new Date());
    } catch (err) {
      // Aborted requests are expected on unmount/refresh — ignore them.
      if (signal.aborted) return;
      if (err instanceof DOMException && err.name === 'AbortError') return;
      if (err instanceof Error && err.name === 'AbortError') return;
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      // Cancelled requests must not reset loading either — a stale request
      // cannot update state on an unmounted/refreshed component.
      if (!signal.aborted) {
        setLoading(false);
      }
    }
  }, [limit]);

  useEffect(() => {
    const controller = new AbortController();
    fetchInsights(controller.signal);

    let interval: ReturnType<typeof setInterval> | undefined;
    if (autoRefresh) {
      interval = setInterval(() => fetchInsights(controller.signal), refreshInterval);
    }

    return () => {
      controller.abort();
      if (interval) clearInterval(interval);
    };
  }, [limit, autoRefresh, refreshInterval, fetchInsights]);

  if (loading) {
    return (
      <div className="animate-pulse space-y-3">
        {[...Array(3)].map((_, i) => (
          <div key={i} className="h-24 bg-slate-700/50 rounded-2xl" />
        ))}
      </div>
    );
  }

  if (error || insights.length === 0) {
    return (
      <motion.div 
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="text-center py-8"
      >
        <Lightbulb size={32} className="mx-auto mb-3 text-slate-600" />
        <p className="text-slate-400">No insights available</p>
      </motion.div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Lightbulb size={18} className="text-indigo-400" />
          <h3 className="text-lg font-semibold text-slate-200">AI Insights</h3>
        </div>
        {lastUpdated && (
          <div className="flex items-center gap-2 text-xs text-slate-500">
            <RefreshCw size={12} />
            {lastUpdated.toLocaleTimeString()}
          </div>
        )}
      </div>

      {/* Insights List */}
      <div className="space-y-3">
        {insights.map((insight, i) => (
          <InsightCard key={insight.id} insight={insight} index={i} />
        ))}
      </div>
    </div>
  );
}

// Compact version for embedding in other components
export function InsightBadge({ category, text }: { category: string; text: string }) {
  const config = CATEGORY_CONFIG[category] || CATEGORY_CONFIG.general;

  return (
    <div className={cn(
      "inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-sm border",
      config.gradient
    )}>
      <span className={config.color}>{config.icon}</span>
      <span className={cn("text-slate-200")}>{text}</span>
    </div>
  );
}