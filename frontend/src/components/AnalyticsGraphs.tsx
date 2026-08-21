'use client';

import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  TrendingUp, 
  Languages, 
  Target, 
  Map, 
  Activity,
  Sparkles,
  X,
  ChevronDown,
  Info
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { api, AnalyticsGraphData, TrendExplanationData } from '@/lib/api';

interface TimeSeriesDataPoint {
  date: string;
  value: number;
}

interface AnalyticsGraphsProps {
  year?: number;
}

type TimeRange = 'week' | 'month' | 'quarter' | 'year';
type GraphType = 'repos' | 'languages' | 'domains' | 'states' | 'trend';

const TIME_RANGE_OPTIONS: { value: TimeRange; label: string }[] = [
  { value: 'week', label: 'Last Week' },
  { value: 'month', label: 'Last Month' },
  { value: 'quarter', label: 'Last 3 Months' },
  { value: 'year', label: 'Last Year' },
];

const GRAPH_TABS: { id: GraphType; label: string; icon: React.ReactNode }[] = [
  { id: 'repos', label: 'Repos Over Time', icon: <Activity size={16} /> },
  { id: 'languages', label: 'Languages', icon: <Languages size={16} /> },
  { id: 'domains', label: 'Domains', icon: <Target size={16} /> },
  { id: 'states', label: 'States', icon: <Map size={16} /> },
  { id: 'trend', label: 'Growth Trend', icon: <TrendingUp size={16} /> },
];

function GraphSkeleton() {
  return (
    <div className="animate-pulse space-y-4">
      <div className="h-8 bg-slate-700 rounded w-1/4" />
      <div className="h-64 bg-slate-700 rounded-lg" />
    </div>
  );
}

function BarChart({ data, maxValue, colorClass, hoverColorClass }: { 
  data: TimeSeriesDataPoint[]; 
  maxValue: number; 
  colorClass: string;
  hoverColorClass: string;
}) {
  return (
    <div className="h-64 flex items-end gap-1">
      {data.map((point, i) => (
        <motion.div
          key={point.date}
          initial={{ height: 0 }}
          animate={{ height: `${Math.max(5, (point.value / maxValue) * 100)}%` }}
          transition={{ delay: i * 0.02, duration: 0.5, ease: 'easeOut' }}
          className={cn(
            'flex-1 rounded-t transition-all duration-300 cursor-pointer',
            colorClass,
            `hover:${hoverColorClass}`
          )}
          title={`${point.date}: ${point.value}`}
        />
      ))}
    </div>
  );
}

function LanguageBar({ lang, index, maxCount }: { 
  lang: { language: string; count: number }; 
  index: number;
  maxCount: number;
}) {
  const percentage = (lang.count / maxCount) * 100;
  
  return (
    <motion.div 
      initial={{ opacity: 0, x: -20 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: index * 0.05 }}
      className="flex items-center gap-3 group"
    >
      <span className="text-sm text-slate-500 w-6">{index + 1}</span>
      <div className="flex-1">
        <div className="flex justify-between text-sm mb-1">
          <span className="text-slate-300 group-hover:text-white transition-colors">{lang.language}</span>
          <span className="text-slate-400">{lang.count.toLocaleString()}</span>
        </div>
        <div className="h-3 bg-slate-700 rounded-full overflow-hidden">
          <motion.div
            initial={{ width: 0 }}
            animate={{ width: `${percentage}%` }}
            transition={{ delay: index * 0.05 + 0.2, duration: 0.5, ease: 'easeOut' }}
            className="h-full bg-gradient-to-r from-blue-500 to-cyan-500 rounded-full"
          />
        </div>
      </div>
    </motion.div>
  );
}

export default function AnalyticsGraphs({ year }: AnalyticsGraphsProps) {
  const [graphs, setGraphs] = useState<AnalyticsGraphData | null>(null);
  const [loading, setLoading] = useState(true);
  const [timeRange, setTimeRange] = useState<TimeRange>('month');
  const [activeGraph, setActiveGraph] = useState<GraphType>('repos');
  const [showExplanation, setShowExplanation] = useState(false);
  const [explanation, setExplanation] = useState<TrendExplanationData | null>(null);
  const [explaining, setExplaining] = useState(false);

  useEffect(() => {
    // Abort in-flight requests when the range/year changes so stale responses
    // never overwrite newer data (or update a closed component).
    const controller = new AbortController();
    let cancelled = false;
    setLoading(true);

    api
      .getAnalyticsGraphs(timeRange, year, controller.signal)
      .then((data) => {
        if (!cancelled) setGraphs(data);
      })
      .catch((error) => {
        if (!cancelled && error?.name !== 'AbortError') {
          console.error('Failed to fetch analytics graphs', error);
          setGraphs(null);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [timeRange, year]);

  const handleExplain = async () => {
    if (!graphs) return;

    setExplaining(true);
    setShowExplanation(true);

    try {
      // Derive the previous-period value from the real time series (split the
      // data in half) instead of inventing a synthetic "previous value".
      const values = graphs.repositories_over_time.map((p) => p.value);
      const midpoint = Math.max(1, Math.floor(values.length / 2));
      const currentValue = values.slice(midpoint).reduce((sum, v) => sum + v, 0);
      const previousValue = values.slice(0, midpoint).reduce((sum, v) => sum + v, 0);

      const data = await api.explainTrends({
        entity_type: 'national',
        entity_name: 'India',
        metric_name: 'repository_count',
        current_value: currentValue,
        previous_value: previousValue,
        time_range: timeRange,
      });
      setExplanation(data);
    } catch (error) {
      console.error('Failed to get explanation:', error);
    } finally {
      setExplaining(false);
    }
  };

  if (loading || !graphs) {
    return <GraphSkeleton />;
  }

  const maxValue = (data: { value: number }[]) => Math.max(...data.map(d => d.value), 1);
  const maxCount = graphs.language_popularity[0]?.count || 1;

  return (
    <div className="space-y-6">
      {/* Controls */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        {/* Graph Tabs */}
        <div className="flex flex-wrap gap-1 p-1 bg-slate-800/50 rounded-xl border border-slate-700/50">
          {GRAPH_TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveGraph(tab.id)}
              className={cn(
                'flex items-center gap-2 px-4 py-2 text-sm rounded-lg transition-all',
                activeGraph === tab.id
                  ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-500/25'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-700/50'
              )}
            >
              {tab.icon}
              <span className="hidden sm:inline">{tab.label}</span>
            </button>
          ))}
        </div>

        <div className="flex gap-2">
          {/* Explain Button */}
          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={handleExplain}
            disabled={explaining || !graphs}
            className={cn(
              'px-4 py-2 text-sm rounded-lg flex items-center gap-2 transition-all',
              'bg-gradient-to-r from-purple-600 to-blue-600 text-white',
              'hover:from-purple-500 hover:to-blue-500',
              'disabled:opacity-50 disabled:cursor-not-allowed',
              'shadow-lg shadow-purple-500/25'
            )}
          >
            {explaining ? (
              <>
                <motion.div
                  animate={{ rotate: 360 }}
                  transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
                  className="w-4 h-4 border-2 border-white border-t-transparent rounded-full"
                />
                Analyzing...
              </>
            ) : (
              <>
                <Sparkles size={16} />
                Explain
              </>
            )}
          </motion.button>

          {/* Time Range Select */}
          <div className="relative">
            <select
              value={timeRange}
              onChange={(e) => setTimeRange(e.target.value as TimeRange)}
              className={cn(
                'pl-4 pr-10 py-2 bg-slate-800 border border-slate-700 rounded-lg',
                'text-slate-200 appearance-none cursor-pointer',
                'focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20',
                'transition-all'
              )}
            >
              {TIME_RANGE_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
            <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
          </div>
        </div>
      </div>

      {/* Graph Container */}
      <motion.div
        key={activeGraph}
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-slate-800/50 rounded-2xl p-6 border border-slate-700/50 backdrop-blur-sm"
      >
        <AnimatePresence mode="wait">
          {activeGraph === 'repos' && (
            <motion.div
              key="repos"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
            >
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-slate-200">Repositories Over Time</h3>
                <span className="text-xs text-slate-500 flex items-center gap-1">
                  <Info size={12} /> Hover for details
                </span>
              </div>
              <BarChart 
                data={graphs.repositories_over_time} 
                maxValue={maxValue(graphs.repositories_over_time)}
                colorClass="bg-gradient-to-t from-emerald-600 to-emerald-400"
                hoverColorClass="from-emerald-500 to-emerald-300"
              />
              <div className="flex justify-between mt-3 text-xs text-slate-500">
                <span>Start</span>
                <span>{graphs.repositories_over_time.length} data points</span>
                <span>Now</span>
              </div>
            </motion.div>
          )}

          {activeGraph === 'languages' && (
            <motion.div
              key="languages"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
            >
              <h3 className="text-lg font-semibold text-slate-200 mb-4">Language Popularity</h3>
              <div className="space-y-3">
                {graphs.language_popularity.slice(0, 12).map((lang, i) => (
                  <LanguageBar key={lang.language} lang={lang} index={i} maxCount={maxCount} />
                ))}
              </div>
            </motion.div>
          )}

          {activeGraph === 'domains' && (
            <motion.div
              key="domains"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
            >
              <h3 className="text-lg font-semibold text-slate-200 mb-4">Top Domains</h3>
              <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                {graphs.top_domains.map((domain, i) => (
                  <motion.div
                    key={domain.domain}
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ delay: i * 0.05 }}
                    className="bg-slate-900/50 rounded-xl p-4 border border-slate-700/50 text-center hover:border-indigo-500/50 hover:bg-slate-900 transition-all cursor-pointer group"
                  >
                    <p className="w-8 h-8 mx-auto mb-2 rounded-lg bg-indigo-500/20 text-indigo-300 text-sm font-semibold flex items-center justify-center">
                      {i + 1}
                    </p>
                    <p className="text-slate-200 font-medium capitalize group-hover:text-indigo-300 transition-colors">{domain.domain}</p>
                    <p className="text-2xl font-bold text-indigo-400 mt-1">{domain.count}</p>
                  </motion.div>
                ))}
              </div>
            </motion.div>
          )}

          {activeGraph === 'states' && (
            <motion.div
              key="states"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
            >
              <h3 className="text-lg font-semibold text-slate-200 mb-4">State Comparison</h3>
              <div className="h-64 flex items-end gap-2">
                {graphs.state_comparison.slice(0, 10).map((state, i) => (
                  <motion.div
                    key={state.state}
                    initial={{ height: 0 }}
                    animate={{ height: `${Math.max(10, (state.repositories / (graphs.state_comparison[0]?.repositories || 1)) * 100)}%` }}
                    transition={{ delay: i * 0.05, duration: 0.5 }}
                    className="flex-1 flex flex-col items-center"
                  >
                    <div className="w-full bg-gradient-to-t from-purple-600 to-purple-400 rounded-t hover:from-purple-500 hover:to-purple-300 transition-all cursor-pointer" />
                    <p className="text-xs text-slate-400 mt-2 truncate w-full text-center">{state.state}</p>
                  </motion.div>
                ))}
              </div>
            </motion.div>
          )}

          {activeGraph === 'trend' && (
            <motion.div
              key="trend"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
            >
              <h3 className="text-lg font-semibold text-slate-200 mb-4">Growth Trend</h3>
              <BarChart 
                data={graphs.growth_trend} 
                maxValue={maxValue(graphs.growth_trend)}
                colorClass="bg-gradient-to-t from-orange-600 to-orange-400"
                hoverColorClass="from-orange-500 to-orange-300"
              />
              <div className="flex justify-between mt-3 text-xs text-slate-500">
                <span>30 days ago</span>
                <span>Today</span>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>

      {/* AI Explanation Modal */}
      <AnimatePresence>
        {showExplanation && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4"
            onClick={() => setShowExplanation(false)}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
              className="bg-slate-900 rounded-2xl max-w-2xl w-full max-h-[80vh] overflow-y-auto border border-slate-700 shadow-2xl"
            >
              {/* Header */}
              <div className="sticky top-0 bg-slate-900 border-b border-slate-700 p-4 flex items-center justify-between z-10">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-gradient-to-br from-purple-500 to-blue-500 rounded-xl flex items-center justify-center">
                    <Sparkles size={20} className="text-white" />
                  </div>
                  <div>
                    <h3 className="text-lg font-semibold text-white">AI Analysis</h3>
                    <p className="text-sm text-slate-400">{explanation?.entity_name} - {explanation?.time_range}</p>
                  </div>
                </div>
                <button
                  onClick={() => setShowExplanation(false)}
                  className="p-2 hover:bg-slate-800 rounded-lg transition-colors"
                >
                  <X size={20} className="text-slate-400" />
                </button>
              </div>

              {/* Content */}
              <div className="p-6 space-y-6">
                {explaining ? (
                  <div className="flex items-center justify-center h-32">
                    <motion.div
                      animate={{ rotate: 360 }}
                      transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
                      className="w-8 h-8 border-2 border-purple-500 border-t-transparent rounded-full"
                    />
                  </div>
                ) : explanation ? (
                  <>
                    {/* Summary */}
                    <motion.div
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="bg-gradient-to-r from-purple-900/50 to-blue-900/50 rounded-xl p-4 border border-purple-500/30"
                    >
                      <p className="text-white leading-relaxed">{explanation.summary}</p>
                    </motion.div>

                    {/* Confidence Score */}
                    <div className="flex items-center gap-3">
                      <span className="text-sm text-slate-400">Confidence:</span>
                      <div className="flex-1 h-2 bg-slate-700 rounded-full overflow-hidden">
                        <motion.div
                          initial={{ width: 0 }}
                          animate={{ width: `${explanation.confidence_score * 100}%` }}
                          transition={{ duration: 0.5, ease: 'easeOut' }}
                          className="h-full bg-gradient-to-r from-purple-500 to-blue-500"
                        />
                      </div>
                      <span className="text-sm font-medium text-white">{Math.round(explanation.confidence_score * 100)}%</span>
                    </div>

                    {/* Key Drivers */}
                    {explanation.key_drivers.length > 0 && (
                      <div>
                        <h4 className="text-sm font-semibold text-slate-300 mb-3">Key Drivers</h4>
                        <div className="space-y-3">
                          {explanation.key_drivers.map((driver, i) => (
                            <motion.div
                              key={i}
                              initial={{ opacity: 0, y: 10 }}
                              animate={{ opacity: 1, y: 0 }}
                              transition={{ delay: i * 0.1 }}
                              className="bg-slate-800/50 rounded-xl p-4 border border-slate-700"
                            >
                              <div className="flex items-center justify-between mb-2">
                                <span className="font-medium text-white">{driver.factor}</span>
                                <span className={cn(
                                  'text-xs px-2 py-1 rounded',
                                  driver.impact === 'high' ? 'bg-red-500/20 text-red-400' :
                                  driver.impact === 'medium' ? 'bg-yellow-500/20 text-yellow-400' :
                                  'bg-green-500/20 text-green-400'
                                )}>
                                  {driver.impact}
                                </span>
                              </div>
                              <p className="text-sm text-slate-400">{driver.description}</p>
                              {driver.evidence.length > 0 && (
                                <ul className="mt-2 space-y-1">
                                  {driver.evidence.map((e, j) => (
                                    <li key={j} className="text-xs text-slate-500 flex items-center gap-2">
                                      <span className="w-1 h-1 bg-slate-500 rounded-full" />
                                      {e}
                                    </li>
                                  ))}
                                </ul>
                              )}
                            </motion.div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Unusual Observations */}
                    {explanation.unusual_observations.length > 0 && (
                      <div>
                        <h4 className="text-sm font-semibold text-slate-300 mb-3">Unusual Observations</h4>
                        <div className="space-y-2">
                          {explanation.unusual_observations.map((obs, i) => (
                            <div key={i} className="bg-amber-900/20 rounded-lg p-3 border border-amber-500/30">
                              <p className="text-amber-200 text-sm font-medium">{obs.observation}</p>
                              <p className="text-xs text-amber-300/70 mt-1">{obs.significance}</p>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Notable Changes */}
                    {explanation.notable_changes.length > 0 && (
                      <div>
                        <h4 className="text-sm font-semibold text-slate-300 mb-3">Notable Changes</h4>
                        <div className="flex flex-wrap gap-2">
                          {explanation.notable_changes.map((change, i) => (
                            <span key={i} className="px-3 py-1 bg-slate-800 text-slate-300 rounded-full text-sm">
                              {change}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                  </>
                ) : (
                  <p className="text-slate-400 text-center">No explanation available</p>
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}