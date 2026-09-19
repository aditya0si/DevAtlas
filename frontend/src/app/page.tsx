'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Map, BarChart3, GitCompare, Compass, Search, FolderGit2, Settings, HelpCircle, 
  Sparkles, X, ChevronRight, Layers, Filter, ZoomIn, ZoomOut, Maximize2, Info, 
  TrendingUp, Users, Code2, Globe, Activity, Bell, User, Hexagon, Moon, Crosshair, 
  ChevronLeft, ChevronRight as ChevronRightIcon, Play, FastForward, PlayCircle, LogIn, LogOut,
  Pause, SkipForward, Square
} from 'lucide-react';
import { cn } from '@/lib/utils';
import dynamic from 'next/dynamic';
import type { DeveloperMapRef } from '@/components/DeveloperMap';
import PremiumHomepage from '@/components/PremiumHomepage';
import IndiaOverview from '@/components/IndiaOverview';
import AskDevAtlas from '@/components/AskDevAtlas';
import RepositoryDetailPanel from '@/components/RepositoryDetailPanel';
import AnalyticsGraphs from '@/components/AnalyticsGraphs';
import CompareStates from '@/components/CompareStates';
import { useAuth } from '@/context/AuthContext';
import { api, EcosystemStats } from '@/lib/api';
import { getCurrentYear, getMaxSelectableYear, MIN_SELECTABLE_YEAR } from '@/lib/dates';
import { ErrorBoundary } from '@/components/ui/ErrorBoundary';

const DeveloperMap = dynamic(() => import('@/components/DeveloperMap'), { ssr: false });

const sidebarItems = [
  { id: 'overview', icon: <Globe size={22} />, label: 'Overview' },
  { id: 'map', icon: <Map size={22} />, label: 'Developer Map' },
  { id: 'analytics', icon: <BarChart3 size={22} />, label: 'Analytics' },
  { id: 'story', icon: <PlayCircle size={22} />, label: 'Story Mode' },
];

const filters = ["All Projects", "AI", "Cybersecurity", "Healthcare", "Robotics", "DevOps", "Web3"];

/**
 * Derive the live ticker messages from API-backed ecosystem stats. No synthetic
 * text is ever shown — when the backend returns no data the list is empty and
 * the ticker renders a truthful waiting state.
 */
function deriveTickerItems(stats: EcosystemStats | null): string[] {
  if (!stats) return [];

  const items: string[] = [];
  const growth = stats.growth_metrics ?? {};
  const topState = stats.top_states?.[0];
  const topLanguage = stats.top_languages?.[0];
  const topDomain = stats.top_domains?.[0];
  const monthlyGrowth = growth.monthly_growth;

  if (topState) {
    items.push(`${topState.state} leads with ${topState.repositories.toLocaleString('en-US')} repositories`);
  }
  if (topLanguage) {
    items.push(`${topLanguage.language} is the top language (${topLanguage.count.toLocaleString('en-US')} repos)`);
  }
  if (typeof stats.ai_repo_percentage === 'number' && stats.ai_repo_percentage > 0) {
    items.push(`${stats.ai_repo_percentage.toFixed(1)}% of repositories are AI-focused`);
  }
  if (typeof monthlyGrowth === 'number' && monthlyGrowth > 0) {
    items.push(`+${monthlyGrowth.toFixed(1)}% monthly repository growth`);
  }
  if (topDomain) {
    items.push(`${topDomain.domain} is the dominant domain (${topDomain.count.toLocaleString('en-US')} repos)`);
  }
  return items;
}

/**
 * Developer Pulse percentages derived from API-backed stats. Null until real
 * stats arrive, so the panel can stay hidden (no invented numbers). These are
 * SHARES of the tracked corpus, not growth rates — the labels say so.
 */
function deriveDeveloperPulse(stats: EcosystemStats | null): { ai: number; cybersecurity: number } | null {
  if (!stats || stats.total_repositories <= 0) return null;
  const total = stats.total_repositories;
  return {
    ai: typeof stats.ai_repo_percentage === 'number' ? stats.ai_repo_percentage : 0,
    cybersecurity:
      typeof stats.cybersecurity_repos_count === 'number'
        ? (stats.cybersecurity_repos_count / total) * 100
        : 0,
  };
}

// Bottom Stat Component — API-backed value shown in the bottom dock
const BottomStat = ({ value, label }: { value: number | null; label: string }) => (
  <div className="flex flex-col items-center group cursor-default">
    <span className="text-xl sm:text-3xl font-bold text-white tracking-tight group-hover:scale-105 transition-transform drop-shadow-[0_0_8px_rgba(255,255,255,0.3)]">
      {value === null || value === undefined
        ? '—'
        : value >= 1000
        ? `${(value / 1000).toFixed(1)}K`
        : value.toLocaleString('en-US')}
    </span>
    <span className="text-[10px] text-slate-400 uppercase tracking-wider mt-1">{label}</span>
  </div>
);

export default function ImmersiveHome() {
  const [activeItem, setActiveItem] = useState('map');
  const [activeFilter, setActiveFilter] = useState('All Projects');
  const { user, logout, setShowAuthModal } = useAuth();
  
  // Cinematic Intro State
  const [introStep, setIntroStep] = useState(0);
  const [showIntro, setShowIntro] = useState(true);
  const [mapLoaded, setMapLoaded] = useState(false);
  const [dataSourceAnswered, setDataSourceAnswered] = useState(false);
  const introPlayedRef = useRef(false);
  const mapRef = useRef<DeveloperMapRef | null>(null);

  // Ask DevAtlas State
  const [searchQuery, setSearchQuery] = useState('');
  const [activeAiQuery, setActiveAiQuery] = useState<string | null>(null);
  const [chatSessionId, setChatSessionId] = useState<string | null>(null);

  // Time Machine State — defaults to the current calendar year so the app never
  // goes stale when a new year rolls over.
  const [currentYear, setCurrentYear] = useState(getCurrentYear());

  // Story Mode State
  const [isStoryMode, setIsStoryMode] = useState(false);
  const [storyTitle, setStoryTitle] = useState("");
  const [storyPaused, setStoryPaused] = useState(false);

  // Seed Status State
  const [seedStatus, setSeedStatus] = useState<{ ready: boolean; total_repos: number }>({ ready: true, total_repos: 0 });

  // Repository drill-down state
  const [selectedRepoId, setSelectedRepoId] = useState<string | null>(null);

  // API-backed ecosystem stats for the selected Time Machine year
  const [ecosystemStats, setEcosystemStats] = useState<EcosystemStats | null>(null);

  const introMessages = [
    "Loading repository graph...",
    "Analyzing AI ecosystem...",
    "Building geospatial clusters...",
    "Rendering intelligence..."
  ];

  useEffect(() => {
    // The intro must never hold the page hostage: play it once the map reports
    // in OR as soon as the data source answers (an empty/unconfigured build
    // still has to show its hero, map shell and "no data yet" state).
    if (!mapLoaded && !dataSourceAnswered) return;
    if (introPlayedRef.current) return;
    introPlayedRef.current = true;

    let cancelled = false;
    const timeouts: ReturnType<typeof setTimeout>[] = [];

    const sequence = async () => {
      for (let i = 0; i < introMessages.length; i++) {
        if (cancelled) return;
        setIntroStep(i);
        await new Promise<void>((resolve) => {
          timeouts.push(setTimeout(resolve, 800));
        });
      }
      if (cancelled) return;
      setShowIntro(false);
      timeouts.push(
        setTimeout(() => {
          if (!cancelled) {
            mapRef.current?.flyTo([78.9629, 20.5937], 4.5, 55, -15);
          }
        }, 1000)
      );
    };
    sequence();

    return () => {
      cancelled = true;
      timeouts.forEach((timeout) => clearTimeout(timeout));
    };
  }, [mapLoaded, dataSourceAnswered, introMessages.length]);

  // Poll seed status until data is ready
  useEffect(() => {
    const controller = new AbortController();
    let cancelled = false;
    const check = async () => {
      try {
        const status = await api.getSeedStatus(controller.signal);
        if (!cancelled) {
          setSeedStatus(status);
        }
      } catch {
        // backend might not be up yet, or the request was aborted on unmount;
        // default to showing UI either way
      } finally {
        // Any answer (or failure) means the data source has responded — the
        // intro no longer needs to wait for the map.
        if (!cancelled) setDataSourceAnswered(true);
      }
    };
    check();
    const interval = setInterval(check, 10000);
    return () => {
      cancelled = true;
      clearInterval(interval);
      controller.abort();
    };
  }, []);

  // Fetch API-backed ecosystem stats whenever the Time Machine year changes
  useEffect(() => {
    const controller = new AbortController();
    setEcosystemStats(null);
    api
      .getEcosystemStats(currentYear, controller.signal)
      .then((data) => {
        if (!controller.signal.aborted) setEcosystemStats(data);
      })
      .catch(() => {
        // keep previous/placeholder stats if the backend is unavailable
      })
      .finally(() => {
        if (!controller.signal.aborted) setDataSourceAnswered(true);
      });
    return () => {
      controller.abort();
    };
  }, [currentYear]);

  // Live ticker + Developer Pulse content derived purely from API-backed stats
  const tickerItems = deriveTickerItems(ecosystemStats);
  const developerPulse = deriveDeveloperPulse(ecosystemStats);

  // Explicit "no data yet" condition: the seed sync reports nothing, or the
  // ecosystem stats came back empty. The page stays fully usable either way.
  const noData =
    !seedStatus.ready ||
    (ecosystemStats !== null && (ecosystemStats.total_repositories ?? 0) === 0);

  const handleAskDevAtlas = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && searchQuery.trim() !== '') {
      setActiveAiQuery(searchQuery.trim());
      mapRef.current?.flyTo([77.5946, 12.9716], 8, 60, -20);
    }
  };

  const handleStoryMode = () => {
    setIsStoryMode(true);
    setActiveItem('story');
    
    const steps = [
      { center: [72.8777, 19.0760] as [number, number], zoom: 9, title: "Mumbai: The Fintech Frontier" },
      { center: [77.5946, 12.9716] as [number, number], zoom: 10, title: "Bengaluru: The AI Hub" },
      { center: [78.4867, 17.3850] as [number, number], zoom: 9, title: "Hyderabad: Rapid Ecosystem Growth" },
    ];
    
    mapRef.current?.playStory(steps, (title) => {
      if (title === "End") {
        setIsStoryMode(false);
        setStoryPaused(false);
        mapRef.current?.resetView();
        setActiveItem('map');
      } else {
        setStoryTitle(title);
      }
    });
  };

  const handleToggleStoryPause = () => {
    if (storyPaused) {
      mapRef.current?.resumeStory();
      setStoryPaused(false);
    } else {
      mapRef.current?.pauseStory();
      setStoryPaused(true);
    }
  };

  const handleSkipStory = () => {
    mapRef.current?.skipStory();
  };

  const handleCloseStory = () => {
    // Cancel any in-flight story animation and close the overlay explicitly.
    mapRef.current?.stopStory();
    setIsStoryMode(false);
    setStoryPaused(false);
    mapRef.current?.resetView();
    setActiveItem('map');
  };

  if (activeItem === 'overview') {
    return (
      <div className="relative min-h-screen bg-slate-950 text-white">
        <div className="p-4 border-b border-slate-800 flex justify-between items-center bg-slate-900/80 backdrop-blur-md sticky top-0 z-50">
          <div className="flex items-center gap-3 cursor-pointer" onClick={() => setActiveItem('map')}>
            <Hexagon size={24} className="text-indigo-500" />
            <span className="font-bold text-lg">DevAtlas India</span>
          </div>
          <div className="flex items-center gap-4">
            <button
              onClick={() => setActiveItem('map')}
              className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 rounded-xl text-sm font-medium transition-colors"
            >
              Interactive Map
            </button>
            {user ? (
              <button
                onClick={logout}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 rounded-xl text-sm text-slate-300 transition-colors flex items-center gap-2"
              >
                <LogOut size={16} /> Sign Out ({user.email.split('@')[0]})
              </button>
            ) : (
              <button
                onClick={() => setShowAuthModal(true)}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 rounded-xl text-sm text-slate-300 transition-colors flex items-center gap-2"
              >
                <LogIn size={16} /> Sign In
              </button>
            )}
          </div>
        </div>
        <PremiumHomepage year={currentYear} onExploreMap={() => setActiveItem('map')} />
        <div className="container mx-auto px-4 py-12">
          <IndiaOverview year={currentYear} />
        </div>
      </div>
    );
  }

  if (activeItem === 'analytics') {
    return (
      <div className="relative min-h-screen bg-slate-950 text-white">
        <div className="p-4 border-b border-slate-800 flex justify-between items-center bg-slate-900/80 backdrop-blur-md sticky top-0 z-50">
          <div className="flex items-center gap-3 cursor-pointer" onClick={() => setActiveItem('map')}>
            <Hexagon size={24} className="text-indigo-500" />
            <span className="font-bold text-lg">DevAtlas India</span>
          </div>
          <div className="flex items-center gap-4">
            <button
              onClick={() => setActiveItem('map')}
              className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 rounded-xl text-sm font-medium transition-colors"
            >
              Interactive Map
            </button>
            {user ? (
              <button
                onClick={logout}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 rounded-xl text-sm text-slate-300 transition-colors flex items-center gap-2"
              >
                <LogOut size={16} /> Sign Out ({user.email.split('@')[0]})
              </button>
            ) : (
              <button
                onClick={() => setShowAuthModal(true)}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 rounded-xl text-sm text-slate-300 transition-colors flex items-center gap-2"
              >
                <LogIn size={16} /> Sign In
              </button>
            )}
          </div>
        </div>

        <div className="container mx-auto px-4 sm:px-6 py-8">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 mb-6">
            <div>
              <h1 className="text-2xl font-bold text-white">Ecosystem Analytics</h1>
              <p className="text-slate-400 text-sm mt-1">
                Trends and comparisons for {currentYear}
              </p>
            </div>
            <span className="px-3 py-1 rounded-lg bg-indigo-500/20 border border-indigo-500/30 text-indigo-300 text-sm font-medium">
              {currentYear}
            </span>
          </div>

          <AnalyticsGraphs year={currentYear} />

          <div className="mt-10">
            <h2 className="text-xl font-bold text-slate-200 mb-4">State Comparison</h2>
            <CompareStates year={currentYear} />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="relative w-full h-screen overflow-hidden bg-[#020617] text-slate-200 selection:bg-indigo-500/30 font-sans">
      
      {/* Ambient Particles Overlay */}
      <div className="particles-bg" />

      {/* Cinematic Intro Overlay */}
      <AnimatePresence>
        {showIntro && (
          <motion.div
            initial={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 1.5, ease: "easeInOut" }}
            className="absolute inset-0 z-50 bg-[#020617] flex items-center justify-center"
          >
            <div className="text-center">
              <motion.div
                initial={{ scale: 0.8, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ duration: 0.8, ease: 'easeOut' }}
              >
                <Hexagon size={80} className="text-indigo-500 mx-auto mb-8 animate-pulse drop-shadow-[0_0_20px_rgba(99,102,241,0.5)]" />
                <h1 className="text-5xl font-bold text-white mb-6 tracking-tight">DevAtlas</h1>
                <AnimatePresence mode="wait">
                  <motion.p 
                    key={introStep}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                    className="text-indigo-300/80 font-light tracking-wide text-lg"
                  >
                    {introMessages[introStep] || "Initializing..."}
                  </motion.p>
                </AnimatePresence>
              </motion.div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* No-data notice — non-blocking. The hero, map shell and dock stay usable;
          there is no fake progress bar and no endless "preparing" overlay. */}
      <AnimatePresence>
        {noData && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 10 }}
            data-testid="no-data-notice"
            role="status"
            className="absolute bottom-32 left-1/2 -translate-x-1/2 z-20 w-full max-w-md px-4 pointer-events-none"
          >
            <div className="glass-panel rounded-2xl px-4 py-3 border border-amber-500/30 text-center pointer-events-auto">
              <p className="text-xs font-semibold text-amber-200">No data yet</p>
              <p className="mt-1 text-[11px] text-slate-400">
                {seedStatus.total_repos > 0
                  ? `${seedStatus.total_repos.toLocaleString('en-US')} repositories synced so far — waiting for the first full sync.`
                  : "This build's data source has no repositories yet. The map and statistics fill in automatically once the Firestore sync publishes data."}
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* The Hero Map */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: showIntro ? 0.2 : 1 }}
        transition={{ duration: 2 }}
        className="absolute inset-0 z-0"
      >
        <ErrorBoundary label="Developer map">
          <DeveloperMap 
            onReady={(actions) => { mapRef.current = actions; }}
            activeFilter={activeFilter} 
            year={currentYear}
            onRepositoryClick={(repoId) => setSelectedRepoId(repoId)}
            onMapLoad={() => setMapLoaded(true)} 
          />
        </ErrorBoundary>
      </motion.div>

      {/* Top Navigation: Ask DevAtlas + Auth */}
      <motion.div 
        initial={{ y: -100, opacity: 0 }}
        animate={{ y: 0, opacity: showIntro ? 0 : 1 }}
        transition={{ delay: 1, type: 'spring', stiffness: 80 }}
        className="absolute top-4 sm:top-6 left-1/2 -translate-x-1/2 z-20 flex flex-col items-center w-full max-w-3xl px-4 sm:px-0 pointer-events-none"
      >
        <div className="flex items-center w-full gap-2 sm:gap-4 pointer-events-auto">
          {/* Ask DevAtlas Search Bar */}
          <div className="relative flex-1 group">
            <div className="absolute inset-0 glass-premium rounded-full transition-all duration-500 group-hover:shadow-[0_0_30px_rgba(99,102,241,0.15)] group-focus-within:border-indigo-500/50" />
            <div className="relative flex items-center px-4 sm:px-6 py-3 sm:py-4 edge-light rounded-full">
              <Sparkles size={20} className="text-indigo-400 mr-3 animate-pulse shrink-0" />
              <input 
                type="text" 
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={handleAskDevAtlas}
                placeholder="Ask DevAtlas..." 
                aria-label="Ask DevAtlas"
                className="bg-transparent border-none outline-none text-white placeholder:text-slate-500 w-full text-sm sm:text-base font-medium"
              />
            </div>
          </div>

          {/* Auth Button */}
          {user ? (
            <button
              onClick={logout}
              className="px-3 sm:px-4 py-3 glass-premium rounded-full text-xs font-semibold text-slate-300 hover:text-white border border-white/10 hover:border-indigo-500/50 transition-all flex items-center gap-2 whitespace-nowrap"
            >
              <User size={16} className="text-indigo-400" />
              <span className="hidden sm:inline">{user.email.split('@')[0]}</span>
            </button>
          ) : (
            <button
              onClick={() => setShowAuthModal(true)}
              className="px-4 sm:px-5 py-3 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 rounded-full text-xs font-bold text-white shadow-lg transition-all flex items-center gap-2 whitespace-nowrap"
            >
              <LogIn size={16} />
              <span className="hidden sm:inline">Sign In</span>
            </button>
          )}
        </div>

        {/* Filter Pills */}
        <div className="flex items-center justify-center gap-2 mt-3 sm:mt-5 pointer-events-auto hide-scrollbar overflow-x-auto max-w-full px-4">
          {filters.map((filter) => (
            <button
              key={filter}
              onClick={() => setActiveFilter(filter)}
              className={cn(
                "px-4 sm:px-5 py-2 rounded-full text-xs font-semibold backdrop-blur-xl border transition-all duration-300 whitespace-nowrap",
                activeFilter === filter
                  ? "bg-indigo-500/20 border-indigo-500/50 text-indigo-200 shadow-[0_0_20px_rgba(99,102,241,0.3)]"
                  : "bg-slate-900/40 border-white/5 text-slate-400 hover:text-slate-200 hover:bg-slate-800/60"
              )}
            >
              {filter}
            </button>
          ))}
        </div>
      </motion.div>

      {/* Left Floating Sidebar */}
      <motion.div
        initial={{ x: -100, opacity: 0 }}
        animate={{ x: 0, opacity: showIntro ? 0 : 1 }}
        transition={{ delay: 1.2, type: 'spring', stiffness: 100 }}
        className="absolute top-24 sm:top-6 left-3 sm:left-6 bottom-16 w-14 sm:w-[90px] z-20 flex flex-col pointer-events-none"
      >
        <div className="flex-1 glass-premium rounded-[2rem] flex flex-col items-center py-6 sm:py-8 gap-6 sm:gap-8 overflow-hidden relative pointer-events-auto edge-light">
          
          <div className="w-10 h-10 sm:w-12 sm:h-12 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-2xl flex items-center justify-center shadow-[0_0_20px_rgba(99,102,241,0.4)] mb-2">
            <Hexagon size={20} className="text-white sm:hidden" />
            <Hexagon size={24} className="text-white hidden sm:block" />
          </div>

          <div className="flex flex-col gap-4 sm:gap-6 w-full px-2 sm:px-4">
            {sidebarItems.map((item) => {
              const isActive = activeItem === item.id;
              return (
                <div key={item.id} className="relative group w-full flex justify-center">
                  <button
                    onClick={() => {
                      if (item.id === 'story') handleStoryMode();
                      else setActiveItem(item.id);
                    }}
                    aria-label={item.label}
                    className={cn(
                      "relative p-2.5 sm:p-3 rounded-2xl transition-all duration-300 ease-out z-10 w-full flex justify-center items-center",
                      isActive ? "text-white" : "text-slate-500 hover:text-slate-300 hover:bg-white/5"
                    )}
                  >
                    {isActive && (
                      <motion.div 
                        layoutId="activeSidebar"
                        className="absolute inset-0 bg-indigo-500/20 border border-indigo-400/30 rounded-2xl shadow-[0_0_15px_rgba(99,102,241,0.2)]"
                        initial={false}
                        transition={{ type: "spring", stiffness: 300, damping: 30 }}
                      />
                    )}
                    <div className="relative z-20 transition-transform duration-200 group-hover:scale-110">
                      {item.icon}
                    </div>
                  </button>
                  <div className="absolute left-full ml-4 px-3 py-1.5 glass-panel rounded-lg text-xs font-semibold text-white opacity-0 -translate-x-4 group-hover:opacity-100 group-hover:translate-x-0 transition-all duration-200 pointer-events-none whitespace-nowrap z-50">
                    {item.label}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </motion.div>

      {/* Developer Pulse (Only show when not in story mode, no AI analyst active, and real stats have loaded) */}
      <AnimatePresence>
        {!isStoryMode && !activeAiQuery && developerPulse && (
          <motion.div
            initial={{ x: -20, opacity: 0 }}
            animate={{ x: 0, opacity: showIntro ? 0 : 1 }}
            exit={{ x: -20, opacity: 0 }}
            transition={{ delay: 1.4 }}
            className="absolute top-44 sm:top-48 left-20 sm:left-36 z-20 w-64 sm:w-80 pointer-events-none"
          >
            <div className="glass-panel rounded-2xl p-4 sm:p-5 shadow-[0_8px_32px_rgba(0,0,0,0.5)] pointer-events-auto edge-light">
              <div className="flex items-center gap-2 mb-4">
                <div className="w-2 h-2 bg-[#22D3EE] rounded-full animate-pulse shadow-[0_0_12px_#22D3EE]" />
                <h3 className="text-sm font-semibold text-white tracking-wide">Developer Pulse</h3>
              </div>
              
              <div className="space-y-4">
                <div className="flex justify-between items-center group cursor-pointer hover:bg-white/5 p-2 -mx-2 rounded-xl transition-colors">
                  <div>
                    <div className="text-xs text-slate-400 mb-1">AI repos (share of tracked)</div>
                    <div className="text-2xl font-bold text-white group-hover:text-[#8B5CF6] transition-colors">{developerPulse.ai.toFixed(1)}%</div>
                  </div>
                  <Activity className="text-[#8B5CF6] opacity-40 group-hover:opacity-100 transition-all group-hover:scale-110" size={24} />
                </div>
                
                <div className="flex justify-between items-center group cursor-pointer hover:bg-white/5 p-2 -mx-2 rounded-xl transition-colors">
                  <div>
                    <div className="text-xs text-slate-400 mb-1">Cybersecurity repos (share of tracked)</div>
                    <div className="text-2xl font-bold text-white group-hover:text-[#4F8BFF] transition-colors">{developerPulse.cybersecurity.toFixed(1)}%</div>
                  </div>
                  <Code2 className="text-[#4F8BFF] opacity-40 group-hover:opacity-100 transition-all group-hover:scale-110" size={24} />
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Real Streaming Ask DevAtlas AI Panel */}
      <AnimatePresence>
        {activeAiQuery && (
          <AskDevAtlas
            query={activeAiQuery}
            onClose={() => setActiveAiQuery(null)}
            sessionId={chatSessionId ?? undefined}
            onSessionChange={(id) => setChatSessionId(id)}
          />
        )}
      </AnimatePresence>

      {/* Story Mode Overlay */}
      <AnimatePresence>
        {isStoryMode && (
          <motion.div
            initial={{ opacity: 0, y: 50 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 50 }}
            className="absolute bottom-40 sm:bottom-32 left-1/2 -translate-x-1/2 z-40 w-full px-4 sm:w-auto sm:px-0"
          >
            <div className="glass-premium rounded-3xl sm:rounded-full px-5 sm:px-8 py-4 flex flex-col sm:flex-row items-center gap-4 border-indigo-500/30 shadow-[0_0_40px_rgba(99,102,241,0.2)]">
              <div className="flex items-center gap-3 min-w-0">
                {storyPaused ? (
                  <Pause className="text-amber-400" size={24} />
                ) : (
                  <Play className="text-indigo-400 animate-pulse" size={24} />
                )}
                <div className="min-w-0">
                  <div className="text-xs text-indigo-300 font-semibold uppercase tracking-wider mb-0.5">
                    {storyPaused ? 'Story Mode Paused' : 'Story Mode Playing'}
                  </div>
                  <div className="text-lg sm:text-xl font-bold text-white truncate">{storyTitle}</div>
                  <div className="text-[10px] text-slate-500 truncate">
                    Illustrative tour — editorial titles, not measured rankings
                  </div>
                </div>
              </div>

              {/* Story controls */}
              <div className="flex items-center gap-2 shrink-0">
                <button
                  onClick={handleToggleStoryPause}
                  aria-label={storyPaused ? 'Resume story' : 'Pause story'}
                  className="p-2.5 rounded-full bg-slate-800/80 hover:bg-slate-700 text-slate-200 transition-colors"
                >
                  {storyPaused ? <Play size={18} /> : <Pause size={18} />}
                </button>
                <button
                  onClick={handleSkipStory}
                  aria-label="Skip to next story step"
                  className="p-2.5 rounded-full bg-slate-800/80 hover:bg-slate-700 text-slate-200 transition-colors"
                >
                  <SkipForward size={18} />
                </button>
                <button
                  onClick={handleCloseStory}
                  aria-label="Close story mode"
                  className="p-2.5 rounded-full bg-slate-800/80 hover:bg-red-600/80 text-slate-200 hover:text-white transition-colors"
                >
                  <Square size={16} />
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Repository Detail Drill-down Panel */}
      <RepositoryDetailPanel
        repoId={selectedRepoId}
        onClose={() => setSelectedRepoId(null)}
      />

      {/* Bottom Dock (Living Statistics + Time Machine) */}
      <motion.div
        initial={{ y: 50, opacity: 0 }}
        animate={{ y: 0, opacity: showIntro ? 0 : 1 }}
        transition={{ delay: 1.5, type: 'spring', stiffness: 100 }}
        className="absolute bottom-16 left-1/2 -translate-x-1/2 z-20 pointer-events-none w-full max-w-4xl px-2 sm:px-4"
      >
        <div className="glass-premium rounded-3xl px-4 sm:px-8 py-4 sm:py-5 shadow-2xl flex flex-col gap-4 sm:gap-6 pointer-events-auto edge-light">
          
          {/* API-backed Living Statistics */}
          <div className="flex items-center justify-between px-1 sm:px-4 gap-1 sm:gap-2">
            <BottomStat value={ecosystemStats?.total_repositories ?? null} label="Repositories" />
            <div className="w-px h-10 sm:h-12 bg-white/10" />
            <BottomStat value={ecosystemStats?.total_developers ?? null} label="Developers" />
            <div className="w-px h-10 sm:h-12 bg-white/10" />
            <BottomStat value={ecosystemStats?.total_stars ?? null} label="Stars" />
            <div className="w-px h-10 sm:h-12 bg-white/10" />
            <BottomStat value={ecosystemStats?.total_events ?? null} label="Events" />
          </div>

          {/* Time Machine Slider */}
          <div className="flex items-center gap-4 px-2">
            <span className="text-xs font-bold text-slate-500">{MIN_SELECTABLE_YEAR}</span>
            <input 
              type="range" 
              min={MIN_SELECTABLE_YEAR} 
              max={getMaxSelectableYear()} 
              step="1"
              value={currentYear}
              onChange={(e) => setCurrentYear(Number(e.target.value))}
              className="flex-1 h-1 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-indigo-500"
            />
            <span className="text-xs font-bold text-white px-2 py-1 bg-indigo-500/20 rounded border border-indigo-500/30">
              {currentYear}
            </span>
          </div>
        </div>
      </motion.div>

      {/* Live Developer Pulse Ticker (Absolute Bottom) — content derived from API-backed stats */}
      <div
        className="absolute bottom-0 left-0 right-0 h-10 bg-[#050816]/90 border-t border-white/5 z-30 flex items-center overflow-hidden"
        data-testid="live-ticker"
      >
        {tickerItems.length > 0 ? (
          <motion.div 
            animate={{ x: [0, -1000] }}
            transition={{ repeat: Infinity, duration: 20, ease: "linear" }}
            className="flex items-center gap-12 whitespace-nowrap px-4"
          >
            {tickerItems.map((item, i) => (
              <span key={i} className="text-xs font-medium text-slate-400">
                {item}
              </span>
            ))}
            {/* Duplicate for seamless looping */}
            {tickerItems.map((item, i) => (
              <span key={`dup-${i}`} className="text-xs font-medium text-slate-400">
                {item}
              </span>
            ))}
          </motion.div>
        ) : (
          <span className="text-xs font-medium text-slate-500 px-4">
            Live ecosystem data will appear once repositories are loaded...
          </span>
        )}
      </div>

    </div>
  );
}