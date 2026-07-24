'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Map, BarChart3, GitCompare, Compass, Search, FolderGit2, Settings, HelpCircle, 
  Sparkles, X, ChevronRight, Layers, Filter, ZoomIn, ZoomOut, Maximize2, Info, 
  TrendingUp, Users, Code2, Globe, Activity, Bell, User, Hexagon, Moon, Crosshair, 
  ChevronLeft, ChevronRight as ChevronRightIcon, Play, FastForward, PlayCircle, LogIn, LogOut, Loader2
} from 'lucide-react';
import { cn } from '@/lib/utils';
import dynamic from 'next/dynamic';
import type { DeveloperMapRef } from '@/components/DeveloperMap';
import PremiumHomepage from '@/components/PremiumHomepage';
import IndiaOverview from '@/components/IndiaOverview';
import AskDevAtlas from '@/components/AskDevAtlas';
import { useAuth } from '@/context/AuthContext';
import { api } from '@/lib/api';

const DeveloperMap = dynamic(() => import('@/components/DeveloperMap'), { ssr: false });

const sidebarItems = [
  { id: 'overview', icon: <Globe size={22} />, label: 'Overview' },
  { id: 'map', icon: <Map size={22} />, label: 'Developer Map' },
  { id: 'analytics', icon: <BarChart3 size={22} />, label: 'Analytics' },
  { id: 'story', icon: <PlayCircle size={22} />, label: 'Story Mode' },
];

const filters = ["All Projects", "AI", "Cybersecurity", "Healthcare", "Robotics", "DevOps", "Web3"];

const tickerItems = [
  "🔥 Hyderabad AI Repos +12% this week",
  "⚡ Rust adoption surges in Bengaluru by 18%",
  "🤖 Generative AI dominating new Delhi startups (23%)",
  "🌍 Pune emerging as top Web3 hub in Q3",
  "💡 Healthcare tech commits double in Chennai"
];

// Living Stat Component for numbers that subtly tick up
const LivingStat = ({ value, label, tickRate = 5000 }: { value: number, label: string, tickRate?: number }) => {
  const [current, setCurrent] = useState(value);
  
  useEffect(() => {
    const interval = setInterval(() => {
      if (Math.random() > 0.5) {
        setCurrent(prev => +(prev + 0.1).toFixed(1));
      }
    }, tickRate);
    return () => clearInterval(interval);
  }, [tickRate]);

  return (
    <div className="flex flex-col items-center group cursor-default">
      <motion.span 
        key={current}
        initial={{ opacity: 0.8, y: -2 }}
        animate={{ opacity: 1, y: 0 }}
        className="text-3xl font-bold text-white tracking-tight group-hover:scale-105 transition-transform drop-shadow-[0_0_8px_rgba(255,255,255,0.3)]"
      >
        {current.toLocaleString()}K
      </motion.span>
      <span className="text-[10px] text-slate-400 uppercase tracking-wider mt-1">{label}</span>
    </div>
  );
};

export default function ImmersiveHome() {
  const [activeItem, setActiveItem] = useState('map');
  const [activeFilter, setActiveFilter] = useState('All Projects');
  const { user, logout, setShowAuthModal } = useAuth();
  
  // Cinematic Intro State
  const [introStep, setIntroStep] = useState(0);
  const [showIntro, setShowIntro] = useState(true);
  const [mapLoaded, setMapLoaded] = useState(false);
  const mapRef = useRef<DeveloperMapRef | null>(null);

  // Ask DevAtlas State
  const [searchQuery, setSearchQuery] = useState('');
  const [activeAiQuery, setActiveAiQuery] = useState<string | null>(null);
  const [chatSessionId, setChatSessionId] = useState<string | null>(null);

  // Time Machine State
  const [currentYear, setCurrentYear] = useState(2026);

  // Story Mode State
  const [isStoryMode, setIsStoryMode] = useState(false);
  const [storyTitle, setStoryTitle] = useState("");

  // Seed Status State
  const [seedStatus, setSeedStatus] = useState<{ ready: boolean; total_repos: number }>({ ready: true, total_repos: 0 });

  const introMessages = [
    "Loading repository graph...",
    "Analyzing AI ecosystem...",
    "Building geospatial clusters...",
    "Rendering intelligence..."
  ];

  useEffect(() => {
    if (!mapLoaded) return;
    
    const sequence = async () => {
      for (let i = 0; i < introMessages.length; i++) {
        setIntroStep(i);
        await new Promise(r => setTimeout(r, 800));
      }
      setShowIntro(false);
      setTimeout(() => {
        mapRef.current?.flyTo([78.9629, 20.5937], 4.5, 55, -15);
      }, 1000);
    };
    sequence();
  }, [mapLoaded]);

  // Poll seed status until data is ready
  useEffect(() => {
    let cancelled = false;
    const check = async () => {
      try {
        const status = await api.getSeedStatus();
        if (!cancelled) {
          setSeedStatus(status);
        }
      } catch {
        // backend might not be up yet, default to showing UI
      }
    };
    check();
    const interval = setInterval(check, 10000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

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
        mapRef.current?.resetView();
        setActiveItem('map');
      } else {
        setStoryTitle(title);
      }
    });
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
        <PremiumHomepage onExploreMap={() => setActiveItem('map')} />
        <div className="container mx-auto px-4 py-12">
          <IndiaOverview year={currentYear} />
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

      {/* Seed Data Interstitial (shown when DB is empty) */}
      <AnimatePresence>
        {!seedStatus.ready && !showIntro && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 z-50 flex items-center justify-center bg-slate-950/90 backdrop-blur-sm"
          >
            <div className="glass-premium rounded-3xl p-8 max-w-md text-center border border-indigo-500/30 shadow-2xl">
              <Loader2 className="w-10 h-10 text-indigo-400 animate-spin mx-auto mb-4" />
              <h2 className="text-xl font-bold text-white mb-2">Preparing Your Experience</h2>
              <p className="text-slate-400 text-sm mb-4">
                We\u2019re seeding India\u2019s top developer datasets for your first visit. This may take a moment...
              </p>
              <div className="w-full bg-slate-800 rounded-full h-1.5 overflow-hidden">
                <motion.div
                  className="h-full bg-gradient-to-r from-indigo-500 to-purple-500 rounded-full"
                  initial={{ width: "0%" }}
                  animate={{ width: "60%" }}
                  transition={{ duration: 15, ease: "easeOut" }}
                />
              </div>
              <p className="text-xs text-slate-500 mt-3">
                {seedStatus.total_repos > 0 ? `${seedStatus.total_repos} repos loaded so far...` : 'Connecting to GitHub...'}
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
        <DeveloperMap 
          onReady={(actions) => { mapRef.current = actions; }}
          activeFilter={activeFilter} 
          onMapLoad={() => setMapLoaded(true)} 
        />
      </motion.div>

      {/* Top Navigation: Ask DevAtlas + Auth */}
      <motion.div 
        initial={{ y: -100, opacity: 0 }}
        animate={{ y: 0, opacity: showIntro ? 0 : 1 }}
        transition={{ delay: 1, type: 'spring', stiffness: 80 }}
        className="absolute top-6 left-1/2 -translate-x-1/2 z-20 flex flex-col items-center w-full max-w-3xl pointer-events-none"
      >
        <div className="flex items-center w-full gap-4 pointer-events-auto">
          {/* Ask DevAtlas Search Bar */}
          <div className="relative flex-1 group">
            <div className="absolute inset-0 glass-premium rounded-full transition-all duration-500 group-hover:shadow-[0_0_30px_rgba(99,102,241,0.15)] group-focus-within:border-indigo-500/50" />
            <div className="relative flex items-center px-6 py-4 edge-light rounded-full">
              <Sparkles size={20} className="text-indigo-400 mr-3 animate-pulse" />
              <input 
                type="text" 
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={handleAskDevAtlas}
                placeholder="Ask DevAtlas... (e.g. 'Why is Karnataka growing?')" 
                className="bg-transparent border-none outline-none text-white placeholder:text-slate-500 w-full text-base font-medium"
              />
            </div>
          </div>

          {/* Auth Button */}
          {user ? (
            <button
              onClick={logout}
              className="px-4 py-3 glass-premium rounded-full text-xs font-semibold text-slate-300 hover:text-white border border-white/10 hover:border-indigo-500/50 transition-all flex items-center gap-2 whitespace-nowrap"
            >
              <User size={16} className="text-indigo-400" />
              <span>{user.email.split('@')[0]}</span>
            </button>
          ) : (
            <button
              onClick={() => setShowAuthModal(true)}
              className="px-5 py-3 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 rounded-full text-xs font-bold text-white shadow-lg transition-all flex items-center gap-2 whitespace-nowrap"
            >
              <LogIn size={16} />
              <span>Sign In</span>
            </button>
          )}
        </div>

        {/* Filter Pills */}
        <div className="flex items-center justify-center gap-2 mt-5 pointer-events-auto hide-scrollbar overflow-x-auto max-w-full px-4">
          {filters.map((filter) => (
            <button
              key={filter}
              onClick={() => setActiveFilter(filter)}
              className={cn(
                "px-5 py-2 rounded-full text-xs font-semibold backdrop-blur-xl border transition-all duration-300 whitespace-nowrap",
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
        className="absolute top-6 left-6 bottom-16 w-[90px] z-20 flex flex-col pointer-events-none"
      >
        <div className="flex-1 glass-premium rounded-[2rem] flex flex-col items-center py-8 gap-8 overflow-hidden relative pointer-events-auto edge-light">
          
          <div className="w-12 h-12 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-2xl flex items-center justify-center shadow-[0_0_20px_rgba(99,102,241,0.4)] mb-2">
            <Hexagon size={24} className="text-white" />
          </div>

          <div className="flex flex-col gap-6 w-full px-4">
            {sidebarItems.map((item) => {
              const isActive = activeItem === item.id;
              return (
                <div key={item.id} className="relative group w-full flex justify-center">
                  <button
                    onClick={() => {
                      if (item.id === 'story') handleStoryMode();
                      else setActiveItem(item.id);
                    }}
                    className={cn(
                      "relative p-3 rounded-2xl transition-all duration-300 ease-out z-10 w-full flex justify-center items-center",
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

      {/* Developer Pulse (Only show when not in story mode and no AI analyst active) */}
      <AnimatePresence>
        {!isStoryMode && !activeAiQuery && (
          <motion.div
            initial={{ x: -20, opacity: 0 }}
            animate={{ x: 0, opacity: showIntro ? 0 : 1 }}
            exit={{ x: -20, opacity: 0 }}
            transition={{ delay: 1.4 }}
            className="absolute top-48 left-36 z-20 w-80 pointer-events-none"
          >
            <div className="glass-panel rounded-2xl p-5 shadow-[0_8px_32px_rgba(0,0,0,0.5)] pointer-events-auto edge-light">
              <div className="flex items-center gap-2 mb-4">
                <div className="w-2 h-2 bg-[#22D3EE] rounded-full animate-pulse shadow-[0_0_12px_#22D3EE]" />
                <h3 className="text-sm font-semibold text-white tracking-wide">Developer Pulse</h3>
              </div>
              
              <div className="space-y-4">
                <div className="flex justify-between items-center group cursor-pointer hover:bg-white/5 p-2 -mx-2 rounded-xl transition-colors">
                  <div>
                    <div className="text-xs text-slate-400 mb-1">AI Growth</div>
                    <div className="text-2xl font-bold text-white group-hover:text-[#8B5CF6] transition-colors">+24.2%</div>
                  </div>
                  <Activity className="text-[#8B5CF6] opacity-40 group-hover:opacity-100 transition-all group-hover:scale-110" size={24} />
                </div>
                
                <div className="flex justify-between items-center group cursor-pointer hover:bg-white/5 p-2 -mx-2 rounded-xl transition-colors">
                  <div>
                    <div className="text-xs text-slate-400 mb-1">Cybersecurity</div>
                    <div className="text-2xl font-bold text-white group-hover:text-[#4F8BFF] transition-colors">+18.1%</div>
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
            className="absolute bottom-32 left-1/2 -translate-x-1/2 z-40"
          >
            <div className="glass-premium rounded-full px-8 py-4 flex items-center gap-4 border-indigo-500/30 shadow-[0_0_40px_rgba(99,102,241,0.2)]">
              <Play className="text-indigo-400 animate-pulse" size={24} />
              <div>
                <div className="text-xs text-indigo-300 font-semibold uppercase tracking-wider mb-0.5">Story Mode Playing</div>
                <div className="text-xl font-bold text-white">{storyTitle}</div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Bottom Dock (Living Statistics + Time Machine) */}
      <motion.div
        initial={{ y: 50, opacity: 0 }}
        animate={{ y: 0, opacity: showIntro ? 0 : 1 }}
        transition={{ delay: 1.5, type: 'spring', stiffness: 100 }}
        className="absolute bottom-16 left-1/2 -translate-x-1/2 z-20 pointer-events-none w-full max-w-4xl px-4"
      >
        <div className="glass-premium rounded-3xl px-8 py-5 shadow-2xl flex flex-col gap-6 pointer-events-auto edge-light">
          
          {/* Living Statistics */}
          <div className="flex items-center justify-between px-4">
            <LivingStat value={128.4} label="Repositories" tickRate={3000} />
            <div className="w-px h-12 bg-white/10" />
            <LivingStat value={45.2} label="Developers" tickRate={7000} />
            <div className="w-px h-12 bg-white/10" />
            <LivingStat value={3200.5} label="Stars" tickRate={2000} />
            <div className="w-px h-12 bg-white/10" />
            <LivingStat value={1400.1} label="Commits" tickRate={1500} />
          </div>

          {/* Time Machine Slider */}
          <div className="flex items-center gap-4 px-2">
            <span className="text-xs font-bold text-slate-500">2022</span>
            <input 
              type="range" 
              min="2022" 
              max="2026" 
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

      {/* Live Developer Pulse Ticker (Absolute Bottom) */}
      <div className="absolute bottom-0 left-0 right-0 h-10 bg-[#050816]/90 border-t border-white/5 z-30 flex items-center overflow-hidden">
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
      </div>

    </div>
  );
}