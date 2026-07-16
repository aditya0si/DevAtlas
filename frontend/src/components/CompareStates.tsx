'use client';

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { 
  ArrowLeftRight, 
  TrendingUp, 
  GitBranch, 
  Star, 
  Building2,
  ChevronDown,
  Sparkles
} from "lucide-react";
import { cn } from "@/lib/utils";

interface ComparisonData {
  state_a: string;
  state_b: string;
  repository_count_a: number;
  repository_count_b: number;
  developer_activity_a: number;
  developer_activity_b: number;
  growth_rate_a: number;
  growth_rate_b: number;
  top_languages_a: Array<{ language: string; count: number }>;
  top_languages_b: Array<{ language: string; count: number }>;
  ai_repos_a: number;
  ai_repos_b: number;
  cybersecurity_repos_a: number;
  cybersecurity_repos_b: number;
  healthcare_repos_a: number;
  healthcare_repos_b: number;
  robotics_repos_a: number;
  robotics_repos_b: number;
  opensource_repos_a: number;
  opensource_repos_b: number;
  avg_stars_a: number;
  avg_stars_b: number;
  innovation_score_a: number;
  innovation_score_b: number;
  growth_score_a: number;
  growth_score_b: number;
  top_organizations_a: string[];
  top_organizations_b: string[];
}

interface ComparisonSummary {
  entity_a: string;
  entity_b: string;
  summary: string;
  winner: string | null;
  score_difference: number;
  strengths_a: string[];
  strengths_b: string[];
  weaknesses_a: string[];
  weaknesses_b: string[];
  opportunities: string[];
  recommendations: string[];
  confidence_score: number;
}

interface CompareStatesProps {
  initialStateA?: string;
  initialStateB?: string;
}

const INDIAN_STATES = [
  "Bengaluru", "Mumbai", "Delhi", "Hyderabad", "Chennai", "Pune", "Kolkata",
  "Ahmedabad", "Jaipur", "Lucknow", "Chandigarh", "Indore", "Bhopal",
  "Patna", "Ranchi", "Guwahati", "Thiruvananthapuram", "Coimbatore", "Mysore", "Vizag",
];

const DOMAINS = [
  { id: "ai", label: "AI/ML", color: "bg-purple-500" },
  { id: "cybersecurity", label: "Cybersecurity", color: "bg-red-500" },
  { id: "healthcare", label: "Healthcare", color: "bg-green-500" },
  { id: "robotics", label: "Robotics", color: "bg-orange-500" },
  { id: "opensource", label: "Open Source", color: "bg-blue-500" },
];

type TabType = "overview" | "domains" | "languages" | "orgs";

const TABS: { key: TabType; label: string; icon: React.ReactNode }[] = [
  { key: "overview", label: "Overview", icon: <TrendingUp size={16} /> },
  { key: "domains", label: "Domains", icon: <GitBranch size={16} /> },
  { key: "languages", label: "Languages", icon: <Star size={16} /> },
  { key: "orgs", label: "Organizations", icon: <Building2 size={16} /> },
];

function StateSelector({ value, onChange, label }: { value: string; onChange: (v: string) => void; label: string }) {
  const [open, setOpen] = useState(false);
  
  return (
    <div className="relative">
      <label className="text-xs text-slate-400 mb-1 block">{label}</label>
      <button
        onClick={() => setOpen(!open)}
        className={cn(
          "w-full px-4 py-2.5 bg-slate-800 border border-slate-700 rounded-xl",
          "text-slate-200 text-left flex items-center justify-between",
          "hover:border-indigo-500/50 transition-all"
        )}
      >
        <span>{value}</span>
        <ChevronDown size={16} className={cn("text-slate-400 transition-transform", open && "rotate-180")} />
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -5 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -5 }}
            className="absolute top-full left-0 right-0 mt-2 py-2 bg-slate-800 border border-slate-700 rounded-xl shadow-xl z-20 max-h-60 overflow-y-auto"
          >
            {INDIAN_STATES.map((state) => (
              <button
                key={state}
                onClick={() => { onChange(state); setOpen(false); }}
                className={cn(
                  "w-full px-4 py-2 text-left text-sm hover:bg-slate-700/50 transition-colors",
                  value === state ? "text-indigo-400 bg-indigo-500/10" : "text-slate-300"
                )}
              >
                {state}
              </button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function ComparisonBar({ valueA, valueB, maxValue, labelA, labelB, colorA, colorB }: {
  valueA: number; valueB: number; maxValue: number;
  labelA: string; labelB: string; colorA: string; colorB: string;
}) {
  const percentA = (valueA / maxValue) * 100;
  const percentB = (valueB / maxValue) * 100;
  const winner = valueA > valueB ? 'a' : valueB > valueA ? 'b' : null;

  return (
    <div className="space-y-2">
      <div className="flex justify-between text-sm">
        <span className={cn("font-medium", winner === 'a' ? 'text-purple-400' : 'text-slate-400')}>
          {labelA}: {valueA.toLocaleString()}
        </span>
        <span className={cn("font-medium", winner === 'b' ? 'text-blue-400' : 'text-slate-400')}>
          {labelB}: {valueB.toLocaleString()}
        </span>
      </div>
      <div className="relative h-8 bg-slate-700 rounded-full overflow-hidden">
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${percentA}%` }}
          transition={{ duration: 0.5, ease: 'easeOut' }}
          className={cn("absolute left-0 top-0 h-full rounded-l-full", colorA)}
        />
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${percentB}%` }}
          transition={{ duration: 0.5, ease: 'easeOut' }}
          className={cn("absolute right-0 top-0 h-full rounded-r-full", colorB)}
        />
      </div>
    </div>
  );
}

export default function CompareStates({ initialStateA = "Bengaluru", initialStateB = "Mumbai" }: CompareStatesProps) {
  const [stateA, setStateA] = useState(initialStateA);
  const [stateB, setStateB] = useState(initialStateB);
  const [loading, setLoading] = useState(false);
  const [comparison, setComparison] = useState<ComparisonData | null>(null);
  const [summary, setSummary] = useState<ComparisonSummary | null>(null);
  const [activeTab, setActiveTab] = useState<TabType>("overview");

  useEffect(() => {
    fetchComparison();
  }, [stateA, stateB]);

  const fetchComparison = async () => {
    setLoading(true);
    try {
      const response = await fetch(
        `/api/v1/india/compare?state_a=${encodeURIComponent(stateA)}&state_b=${encodeURIComponent(stateB)}`
      );
      if (response.ok) {
        const data = await response.json();
        setComparison(data.comparison);
        setSummary(data.summary);
      }
    } catch (error) {
      console.error("Failed to fetch comparison:", error);
    } finally {
      setLoading(false);
    }
  };

  const renderRadarChart = () => {
    if (!comparison) return null;

    const metrics = [
      { label: "Repos", a: comparison.repository_count_a, b: comparison.repository_count_b },
      { label: "Developers", a: comparison.developer_activity_a, b: comparison.developer_activity_b },
      { label: "Growth", a: comparison.growth_rate_a, b: comparison.growth_rate_b },
      { label: "Innovation", a: comparison.innovation_score_a, b: comparison.innovation_score_b },
      { label: "Stars", a: comparison.avg_stars_a, b: comparison.avg_stars_b },
    ];

    const maxVal = Math.max(...metrics.map((m) => Math.max(m.a, m.b, 1)));

    return (
      <div className="grid grid-cols-5 gap-2">
        {metrics.map((metric) => {
          const heightA = (metric.a / maxVal) * 100;
          const heightB = (metric.b / maxVal) * 100;

          return (
            <div key={metric.label} className="flex flex-col items-center">
              <div className="relative w-full h-32 flex items-end justify-center gap-1">
                <motion.div
                  initial={{ height: 0 }}
                  animate={{ height: `${heightA}%` }}
                  transition={{ duration: 0.5, ease: 'easeOut' }}
                  className="w-6 bg-gradient-to-t from-purple-600 to-purple-400 rounded-t"
                />
                <motion.div
                  initial={{ height: 0 }}
                  animate={{ height: `${heightB}%` }}
                  transition={{ duration: 0.5, ease: 'easeOut' }}
                  className="w-6 bg-gradient-to-t from-blue-600 to-blue-400 rounded-t"
                />
              </div>
              <span className="text-xs mt-2 text-slate-400">{metric.label}</span>
            </div>
          );
        })}
      </div>
    );
  };

  const renderDomainComparison = (domain: string, label: string, colorClass: string) => {
    if (!comparison) return null;

    const valueA = (comparison as any)[`${domain}_repos_a`] || 0;
    const valueB = (comparison as any)[`${domain}_repos_b`] || 0;
    const maxValue = Math.max(valueA, valueB, 1);

    return (
      <div className="bg-slate-800/50 rounded-xl p-4 border border-slate-700/50">
        <div className="flex items-center gap-2 mb-3">
          <div className={cn("w-3 h-3 rounded-full", colorClass)} />
          <span className="text-slate-200 font-medium">{label}</span>
        </div>
        <ComparisonBar
          valueA={valueA}
          valueB={valueB}
          maxValue={maxValue}
          labelA={stateA}
          labelB={stateB}
          colorA="bg-gradient-to-r from-purple-600 to-purple-500"
          colorB="bg-gradient-to-l from-blue-600 to-blue-500"
        />
      </div>
    );
  };

  return (
    <div className="space-y-6">
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex flex-wrap items-end gap-4"
      >
        <div className="flex-1 min-w-[200px]">
          <StateSelector value={stateA} onChange={setStateA} label="State A" />
        </div>
        
        <div className="flex items-center gap-2 pb-1">
          <div className="p-2 bg-slate-800 rounded-lg border border-slate-700">
            <ArrowLeftRight size={18} className="text-indigo-400" />
          </div>
        </div>
        
        <div className="flex-1 min-w-[200px]">
          <StateSelector value={stateB} onChange={setStateB} label="State B" />
        </div>
      </motion.div>

      <AnimatePresence>
        {loading && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="flex items-center justify-center py-12"
          >
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-500" />
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence mode="wait">
        {!loading && comparison && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="space-y-6"
          >
            <div className="flex gap-1 p-1 bg-slate-800/50 rounded-xl border border-slate-700/50 w-fit">
              {TABS.map((tab) => (
                <button
                  key={tab.key}
                  onClick={() => setActiveTab(tab.key)}
                  className={cn(
                    "flex items-center gap-2 px-4 py-2 text-sm rounded-lg transition-all",
                    activeTab === tab.key
                      ? "bg-indigo-600 text-white"
                      : "text-slate-400 hover:text-slate-200 hover:bg-slate-700/50"
                  )}
                >
                  {tab.icon}
                  {tab.label}
                </button>
              ))}
            </div>

            <AnimatePresence mode="wait">
              {activeTab === "overview" && (
                <motion.div
                  key="overview"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  className="space-y-6"
                >
                  {summary && (
                    <div className="bg-gradient-to-r from-purple-900/50 to-blue-900/50 rounded-2xl p-5 border border-purple-500/30">
                      <div className="flex items-center gap-2 mb-3">
                        <Sparkles size={18} className="text-purple-400" />
                        <h3 className="text-lg font-semibold text-white">AI Comparison Summary</h3>
                      </div>
                      <p className="text-slate-300 leading-relaxed mb-4">{summary.summary}</p>
                      {summary.winner && (
                        <div className="flex items-center gap-2">
                          <span className="text-sm text-slate-400">Winner:</span>
                          <span className="px-3 py-1 bg-emerald-500/20 text-emerald-400 rounded-full text-sm font-medium">
                            {summary.winner} (+{summary.score_difference}%)
                          </span>
                        </div>
                      )}
                    </div>
                  )}

                  <div className="bg-slate-800/50 rounded-2xl p-5 border border-slate-700/50">
                    <h3 className="text-lg font-semibold text-slate-200 mb-4">Metrics Comparison</h3>
                    {renderRadarChart()}
                    <div className="flex justify-center gap-6 mt-4">
                      <div className="flex items-center gap-2">
                        <div className="w-3 h-3 rounded-full bg-purple-500" />
                        <span className="text-sm text-slate-400">{stateA}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="w-3 h-3 rounded-full bg-blue-500" />
                        <span className="text-sm text-slate-400">{stateB}</span>
                      </div>
                    </div>
                  </div>

                  <div className="grid md:grid-cols-2 gap-4">
                    <ComparisonBar
                      valueA={comparison.repository_count_a}
                      valueB={comparison.repository_count_b}
                      maxValue={Math.max(comparison.repository_count_a, comparison.repository_count_b, 1)}
                      labelA={stateA}
                      labelB={stateB}
                      colorA="bg-gradient-to-r from-purple-600 to-purple-500"
                      colorB="bg-gradient-to-l from-blue-600 to-blue-500"
                    />
                    <ComparisonBar
                      valueA={comparison.developer_activity_a}
                      valueB={comparison.developer_activity_b}
                      maxValue={Math.max(comparison.developer_activity_a, comparison.developer_activity_b, 1)}
                      labelA={stateA}
                      labelB={stateB}
                      colorA="bg-gradient-to-r from-purple-600 to-purple-500"
                      colorB="bg-gradient-to-l from-blue-600 to-blue-500"
                    />
                  </div>
                </motion.div>
              )}

              {activeTab === "domains" && (
                <motion.div
                  key="domains"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  className="grid md:grid-cols-2 lg:grid-cols-3 gap-4"
                >
                  {DOMAINS.map((domain) => (
                    <motion.div
                      key={domain.id}
                      initial={{ opacity: 0, scale: 0.95 }}
                      animate={{ opacity: 1, scale: 1 }}
                    >
                      {renderDomainComparison(domain.id, domain.label, domain.color)}
                    </motion.div>
                  ))}
                </motion.div>
              )}

              {activeTab === "languages" && comparison && (
                <motion.div
                  key="languages"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  className="grid md:grid-cols-2 gap-6"
                >
                  <div className="bg-slate-800/50 rounded-2xl p-5 border border-slate-700/50">
                    <h3 className="text-lg font-semibold text-purple-400 mb-4">{stateA} Languages</h3>
                    <div className="space-y-2">
                      {comparison.top_languages_a.slice(0, 8).map((lang, i) => (
                        <div key={lang.language} className="flex items-center gap-3">
                          <span className="text-sm text-slate-500 w-5">{i + 1}</span>
                          <span className="text-slate-300 flex-1">{lang.language}</span>
                          <span className="text-slate-400">{lang.count}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                  <div className="bg-slate-800/50 rounded-2xl p-5 border border-slate-700/50">
                    <h3 className="text-lg font-semibold text-blue-400 mb-4">{stateB} Languages</h3>
                    <div className="space-y-2">
                      {comparison.top_languages_b.slice(0, 8).map((lang, i) => (
                        <div key={lang.language} className="flex items-center gap-3">
                          <span className="text-sm text-slate-500 w-5">{i + 1}</span>
                          <span className="text-slate-300 flex-1">{lang.language}</span>
                          <span className="text-slate-400">{lang.count}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </motion.div>
              )}

              {activeTab === "orgs" && comparison && (
                <motion.div
                  key="orgs"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  className="grid md:grid-cols-2 gap-6"
                >
                  <div className="bg-slate-800/50 rounded-2xl p-5 border border-slate-700/50">
                    <h3 className="text-lg font-semibold text-purple-400 mb-4">{stateA} Organizations</h3>
                    <div className="space-y-2">
                      {comparison.top_organizations_a.slice(0, 8).map((org, i) => (
                        <div key={org} className="flex items-center gap-3 p-2 rounded-lg hover:bg-slate-700/50 transition-colors">
                          <span className="text-lg">{i === 0 ? '??' : '???'}</span>
                          <span className="text-slate-300">{org}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                  <div className="bg-slate-800/50 rounded-2xl p-5 border border-slate-700/50">
                    <h3 className="text-lg font-semibold text-blue-400 mb-4">{stateB} Organizations</h3>
                    <div className="space-y-2">
                      {comparison.top_organizations_b.slice(0, 8).map((org, i) => (
                        <div key={org} className="flex items-center gap-3 p-2 rounded-lg hover:bg-slate-700/50 transition-colors">
                          <span className="text-lg">{i === 0 ? '??' : '???'}</span>
                          <span className="text-slate-300">{org}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}