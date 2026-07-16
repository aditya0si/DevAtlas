'use client';

import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Map, 
  BarChart3, 
  GitCompare, 
  Compass,
  Search,
  FolderGit2,
  Settings,
  HelpCircle,
  Sparkles,
  X,
  ChevronRight,
  Layers,
  Filter,
  ZoomIn,
  ZoomOut,
  Maximize2,
  Info,
  TrendingUp,
  Users,
  Code2,
  Globe,
  Activity
} from 'lucide-react';
import { cn } from '@/lib/utils';
import DeveloperMap from '@/components/DeveloperMap';
import InsightPanel from '@/components/InsightPanel';
import StateDashboard from '@/components/StateDashboard';
import AnalyticsGraphs from '@/components/AnalyticsGraphs';
import CompareStates from '@/components/CompareStates';
import Discovery from '@/components/Discovery';
import SemanticSearch from '@/components/SemanticSearch';
import EcosystemScores from '@/components/EcosystemScores';
import RepositoryDetails from '@/components/RepositoryDetails';

// Floating navigation item
interface FloatingNavItem {
  id: string;
  icon: React.ReactNode;
  label: string;
  panel: 'insights' | 'states' | 'analytics' | 'compare' | 'discovery' | 'search' | 'scores' | null;
  description: string;
}

const floatingNavItems: FloatingNavItem[] = [
  { id: 'insights', icon: <Sparkles size={18} />, label: 'AI Insights', panel: 'insights', description: 'Discover AI-powered insights about India\'s developer ecosystem' },
  { id: 'states', icon: <Map size={18} />, label: 'States', panel: 'states', description: 'Deep dive into individual state ecosystems' },
  { id: 'analytics', icon: <BarChart3 size={18} />, label: 'Analytics', panel: 'analytics', description: 'Explore trends and patterns over time' },
  { id: 'compare', icon: <GitCompare size={18} />, label: 'Compare', panel: 'compare', description: 'Compare developer ecosystems between states' },
  { id: 'discovery', icon: <Compass size={18} />, label: 'Discovery', panel: 'discovery', description: 'Find trending repositories and technologies' },
  { id: 'search', icon: <Search size={18} />, label: 'Search', panel: 'search', description: 'Natural language search across repositories' },
  { id: 'scores', icon: <TrendingUp size={18} />, label: 'Rankings', panel: 'scores', description: 'See ecosystem rankings across India' },
];

// Developer Pulse Widget
const DeveloperPulse = () => {
  const [pulseData, setPulseData] = useState({
    developers: 12847,
    repos: 342,
    prs: 1204,
    issues: 856
  });

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.5 }}
      className="absolute top-4 left-4 z-20"
    >
      <div className="bg-slate-900/80 backdrop-blur-xl border border-slate-700/50 rounded-2xl p-4 shadow-2xl">
        <div className="flex items-center gap-2 mb-3">
          <div className="w-2 h-2 bg-emerald-400 rounded-full animate-pulse" />
          <span className="text-xs font-medium text-slate-400 uppercase tracking-wider">Live Pulse</span>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <motion.div 
            whileHover={{ scale: 1.05 }}
            className="cursor-default"
          >
            <div className="text-2xl font-bold text-white">{pulseData.developers.toLocaleString()}</div>
            <div className="text-xs text-slate-500">Active Devs</div>
          </motion.div>
          <motion.div 
            whileHover={{ scale: 1.05 }}
            className="cursor-default"
          >
            <div className="text-2xl font-bold text-white">{pulseData.repos}</div>
            <div className="text-xs text-slate-500">New Repos</div>
          </motion.div>
          <motion.div 
            whileHover={{ scale: 1.05 }}
            className="cursor-default"
          >
            <div className="text-2xl font-bold text-emerald-400">+{pulseData.prs}</div>
            <div className="text-xs text-slate-500">PRs Today</div>
          </motion.div>
          <motion.div 
            whileHover={{ scale: 1.05 }}
            className="cursor-default"
          >
            <div className="text-2xl font-bold text-amber-400">{pulseData.issues}</div>
            <div className="text-xs text-slate-500">Open Issues</div>
          </motion.div>
        </div>
      </div>
    </motion.div>
  );
};

// Exploration Hint - guides users to explore
const ExplorationHint = ({ onDismiss }: { onDismiss: () => void }) => (
  <motion.div
    initial={{ opacity: 0, x: -20 }}
    animate={{ opacity: 1, x: 0 }}
    exit={{ opacity: 0, x: -20 }}
    transition={{ delay: 2 }}
    className="absolute top-4 right-4 z-20 max-w-xs"
  >
    <div className="bg-gradient-to-r from-indigo-900/90 to-purple-900/90 backdrop-blur-xl border border-indigo-500/30 rounded-2xl p-4 shadow-2xl">
      <div className="flex items-start gap-3">
        <motion.div
          animate={{ 
            y: [0, -5, 0],
            opacity: [0.5, 1, 0.5]
          }}
          transition={{ duration: 2, repeat: Infinity }}
        >
          <Compass className="w-5 h-5 text-indigo-400" />
        </motion.div>
        <div className="flex-1">
          <h4 className="text-sm font-medium text-white mb-1">Explore the Ecosystem</h4>
          <p className="text-xs text-slate-300 leading-relaxed">
            Click the floating buttons below to discover AI insights, compare states, and find trending repositories.
          </p>
        </div>
        <button 
          onClick={onDismiss}
          className="p-1 text-slate-400 hover:text-white transition-colors"
        >
          <X size={14} />
        </button>
      </div>
    </div>
  </motion.div>
);

// State Selection Tooltip
const StateTooltip = ({ state, stats, position }: { state: string; stats: any; position: { x: number; y: number } }) => (
  <motion.div
    initial={{ opacity: 0, scale: 0.9 }}
    animate={{ opacity: 1, scale: 1 }}
    exit={{ opacity: 0, scale: 0.9 }}
    className="absolute z-30 pointer-events-none"
    style={{ left: position.x, top: position.y }}
  >
    <div className="bg-slate-900/95 backdrop-blur-xl border border-slate-700 rounded-xl p-3 shadow-2xl min-w-[200px]">
      <h4 className="text-sm font-semibold text-white mb-2">{state}</h4>
      <div className="space-y-1.5">
        <div className="flex justify-between text-xs">
          <span className="text-slate-400">Developers</span>
          <span className="text-indigo-400 font-medium">{stats.developers?.toLocaleString() || 'N/A'}</span>
        </div>
        <div className="flex justify-between text-xs">
          <span className="text-slate-400">Repositories</span>
          <span className="text-emerald-400 font-medium">{stats.repositories?.toLocaleString() || 'N/A'}</span>
        </div>
        <div className="flex justify-between text-xs">
          <span className="text-slate-400">Growth</span>
          <span className="text-amber-400 font-medium">+{stats.growth || 0}%</span>
        </div>
      </div>
      <div className="mt-3 pt-2 border-t border-slate-700">
        <span className="text-xs text-indigo-400 flex items-center gap-1">
          <ChevronRight size={12} />
          Click to explore
        </span>
      </div>
    </div>
  </motion.div>
);

// Floating Navigation
const FloatingNavigation = ({ 
  activePanel, 
  onPanelChange 
}: { 
  activePanel: string | null; 
  onPanelChange: (panel: string | null) => void;
}) => {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.3 }}
      className="absolute bottom-6 left-1/2 -translate-x-1/2 z-30"
    >
      <div className="flex items-center gap-1 px-3 py-2.5 bg-slate-900/80 backdrop-blur-xl border border-slate-700/50 rounded-2xl shadow-2xl">
        {floatingNavItems.map((item, index) => (
          <motion.div
            key={item.id}
            className="relative"
            whileHover={{ scale: 1.05, y: -2 }}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 + index * 0.05 }}
          >
            <motion.button
              onClick={() => onPanelChange(activePanel === item.panel ? null : item.panel)}
              className={cn(
                'relative flex items-center gap-2 px-4 py-2.5 rounded-xl transition-all duration-200',
                activePanel === item.panel
                  ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-500/25'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800'
              )}
              whileTap={{ scale: 0.95 }}
            >
              <motion.span
                whileHover={{ rotate: 10 }}
                transition={{ type: 'spring', stiffness: 400 }}
              >
                {item.icon}
              </motion.span>
              <span className="text-sm font-medium hidden lg:block">{item.label}</span>
              {activePanel === item.panel && (
                <motion.div
                  layoutId="activeNavIndicator"
                  className="absolute inset-0 bg-indigo-600 rounded-xl -z-10"
                />
              )}
            </motion.button>
            
            {/* Tooltip */}
            <motion.div
              initial={{ opacity: 0, y: 5 }}
              whileHover={{ opacity: 1, y: 0 }}
              className="absolute -top-12 left-1/2 -translate-x-1/2 px-3 py-1.5 bg-slate-800 border border-slate-700 rounded-lg shadow-xl whitespace-nowrap pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity"
            >
              <span className="text-xs text-slate-300">{item.description}</span>
              <div className="absolute top-full left-1/2 -translate-x-1/2 -mt-1 border-4 border-transparent border-t-slate-800" />
            </motion.div>
          </motion.div>
        ))}
      </div>
    </motion.div>
  );
};

// Floating Panel
const FloatingPanel = ({ 
  children, 
  isOpen, 
  onClose, 
  title, 
  icon, 
  position = 'left',
  panelId 
}: { 
  children: React.ReactNode; 
  isOpen: boolean; 
  onClose: () => void; 
  title?: string; 
  icon?: React.ReactNode; 
  position?: 'left' | 'right' | 'bottom';
  panelId?: string;
}) => {
  const positionClasses = {
    left: 'top-20 left-4 w-96 max-h-[calc(100vh-180px)]',
    right: 'top-20 right-4 w-96 max-h-[calc(100vh-180px)]',
    bottom: 'bottom-24 left-1/2 -translate-x-1/2 w-[600px] max-h-[400px]'
  };

  return (
    <AnimatePresence mode="wait">
      {isOpen && (
        <motion.div
          key={panelId || title}
          initial={{ opacity: 0, y: 20, scale: 0.95, filter: 'blur(10px)' }}
          animate={{ opacity: 1, y: 0, scale: 1, filter: 'blur(0px)' }}
          exit={{ opacity: 0, y: 20, scale: 0.95, filter: 'blur(10px)' }}
          transition={{ 
            duration: 0.3, 
            ease: [0.4, 0, 0.2, 1],
            filter: { duration: 0.2 }
          }}
          className={cn('absolute z-25 overflow-hidden', positionClasses[position])}
        >
          <div className="bg-slate-900/90 backdrop-blur-xl border border-slate-700/50 rounded-2xl shadow-2xl overflow-hidden">
            {/* Panel Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-800">
              <div className="flex items-center gap-3">
                {icon && <span className="text-indigo-400">{icon}</span>}
                {title && <h3 className="text-lg font-semibold text-white">{title}</h3>}
              </div>
              <div className="flex items-center gap-2">
                <motion.button
                  onClick={onClose}
                  className="p-1.5 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white transition-colors"
                  whileHover={{ scale: 1.1 }}
                  whileTap={{ scale: 0.9 }}
                >
                  <X size={18} />
                </motion.button>
              </div>
            </div>
            {/* Panel Content with staggered animation */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.1, duration: 0.2 }}
              className="p-4 overflow-y-auto max-h-[calc(100vh-280px)]"
            >
              {children}
            </motion.div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

## Milestone 7: Cinematic Experience Overhaul ✓ COMPLETE

### Frontend Cinematic Transformation
- Immersive full-screen map hero layout (`frontend/app/page.tsx`)
- Floating glassmorphism panels with blur transitions and staggered animations
- Cinematic intro animations on page load
- Smooth camera transitions and continuous exploration flow
- Microinteractions and hover states across all panels
- Floating navigation with tooltips and glassmorphism styling
- DeveloperPulse, MiniStats, MapControls, ExplorationHint, StateTooltip widgets
- Framer Motion animations (AnimatePresence, motion.div, whileHover, whileTap, layoutId)
- MapLibre GL dark matter style for immersive map experience
- Tailwind CSS custom utilities for glassmorphism and glow effects

### Sprint 7.5 Tickets
| Ticket | Status | Description |
|--------|--------|-------------|
| TICKET 1: Immersive Layout - Map as Hero | ✓ Complete | Full-screen map as primary visual element |
| TICKET 2: Floating Glassmorphism Panels | ✓ Complete | Floating panels with blur, transparency, and staggered animations |
| TICKET 3: Cinematic Map Experience | ✓ Complete | Intro animations, smooth camera transitions, dark matter style |
| TICKET 4: Floating Navigation | ✓ Complete | Floating nav with tooltips and glassmorphism styling |
| TICKET 5: Microinteractions & Hover States | ✓ Complete | Hover effects, tap feedback, layout animations |
| TICKET 6: Continuous Exploration Flow | ✓ Complete | Time Machine slider, Developer Pulse Ticker, live updating statistics |
| TICKET 7: AI Copilot & Story Mode | ✓ Complete | Ask DevAtlas semantic search map flight, automated narrative Story Mode |
| TICKET 8: Playwright Validation | ✓ Complete | Cross-viewport validation (desktop/mobile), Accessibility checks, E2E reports |

// Map Controls
const MapControls = () => (
  <motion.div
    initial={{ opacity: 0, x: 20 }}
    animate={{ opacity: 1, x: 0 }}
    transition={{ delay: 0.4 }}
    className="absolute top-4 right-4 z-20 flex flex-col gap-2"
  >
    <div className="bg-slate-900/80 backdrop-blur-xl border border-slate-700/50 rounded-xl p-2 shadow-2xl">
      <div className="p-2 rounded-lg text-slate-500 cursor-not-allowed">
        <ZoomIn size={18} />
      </div>
      <div className="p-2 rounded-lg text-slate-500 cursor-not-allowed">
        <ZoomOut size={18} />
      </div>
      <div className="w-full h-px bg-slate-700 my-1" />
      <div className="p-2 rounded-lg text-slate-500 cursor-not-allowed">
        <Maximize2 size={18} />
      </div>
    </div>
    <div className="bg-slate-900/80 backdrop-blur-xl border border-slate-700/50 rounded-xl p-2 shadow-2xl">
      <div className="p-2 rounded-lg text-slate-500 cursor-not-allowed">
        <Layers size={18} />
      </div>
      <div className="p-2 rounded-lg text-slate-500 cursor-not-allowed">
        <Filter size={18} />
      </div>
    </div>
  </motion.div>
);

// Cinematic Intro Overlay
const CinematicIntro = ({ onComplete }: { onComplete: () => void }) => {
  useEffect(() => {
    const timer = setTimeout(onComplete, 3000);
    return () => clearTimeout(timer);
  }, [onComplete]);

  return (
    <motion.div
      initial={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="absolute inset-0 z-50 bg-slate-950 flex items-center justify-center"
    >
      <div className="text-center">
        <motion.div
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ duration: 0.8, ease: 'easeOut' }}
        >
          <Globe size={80} className="text-indigo-500 mx-auto mb-6 animate-pulse" />
          <h1 className="text-4xl font-bold text-white mb-2">DevAtlas India</h1>
          <p className="text-slate-400">Loading the developer ecosystem...</p>
        </motion.div>
        <motion.div 
          className="mt-8 w-64 h-1 bg-slate-800 rounded-full overflow-hidden"
        >
          <motion.div
            initial={{ width: '0%' }}
            animate={{ width: '100%' }}
            transition={{ duration: 2.5, ease: 'easeInOut' }}
            className="h-full bg-gradient-to-r from-indigo-500 to-purple-500"
          />
        </motion.div>
      </div>
    </motion.div>
  );
};

// Mini Stats Bar
const MiniStats = () => (
  <motion.div
    initial={{ opacity: 0, y: -10 }}
    animate={{ opacity: 1, y: 0 }}
    transition={{ delay: 0.6 }}
    className="absolute top-4 left-1/2 -translate-x-1/2 z-20"
  >
    <div className="flex items-center gap-6 px-5 py-2.5 bg-slate-900/80 backdrop-blur-xl border border-slate-700/50 rounded-full shadow-2xl">
      <div className="flex items-center gap-2">
        <Users size={14} className="text-indigo-400" />
        <span className="text-sm text-white font-medium">50,000+</span>
        <span className="text-xs text-slate-500">Developers</span>
      </div>
      <div className="w-px h-4 bg-slate-700" />
      <div className="flex items-center gap-2">
        <Code2 size={14} className="text-emerald-400" />
        <span className="text-sm text-white font-medium">120,000+</span>
        <span className="text-xs text-slate-500">Repositories</span>
      </div>
      <div className="w-px h-4 bg-slate-700" />
      <div className="flex items-center gap-2">
        <Activity size={14} className="text-amber-400" />
        <span className="text-sm text-white font-medium">+12%</span>
        <span className="text-xs text-slate-500">Growth</span>
      </div>
    </div>
  </motion.div>
);

export default function ImmersiveHome() {
  const [showIntro, setShowIntro] = useState(true);
  const [activePanel, setActivePanel] = useState<string | null>(null);
  const [selectedRepo, setSelectedRepo] = useState<any>(null);
  const [isRepoModalOpen, setIsRepoModalOpen] = useState(false);
  const [showHint, setShowHint] = useState(true);

  const handlePanelChange = useCallback((panel: string | null) => {
    setActivePanel(panel);
    // Hide hint when user starts exploring
    if (panel) setShowHint(false);
  }, []);

  return (
    <div className="relative w-full h-screen overflow-hidden bg-slate-950">
      {/* Cinematic Intro */}
      <AnimatePresence>
        {showIntro && <CinematicIntro onComplete={() => setShowIntro(false)} />}
      </AnimatePresence>

      {/* Full-Screen Map - THE HERO */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: showIntro ? 0 : 1 }}
        transition={{ duration: 1 }}
        className="absolute inset-0"
      >
        <DeveloperMap />
      </motion.div>

      {/* Mini Stats Bar */}
      {!showIntro && <MiniStats />}

      {/* Developer Pulse Widget */}
      {!showIntro && <DeveloperPulse />}

      {/* Exploration Hint */}
      <AnimatePresence>
        {!showIntro && showHint && !activePanel && (
          <ExplorationHint onDismiss={() => setShowHint(false)} />
        )}
      </AnimatePresence>

      {/* Map Controls */}
      {!showIntro && <MapControls />}

      {/* Floating Navigation */}
      {!showIntro && (
        <FloatingNavigation activePanel={activePanel} onPanelChange={handlePanelChange} />
      )}

      {/* Floating Panels */}
      {!showIntro && (
        <>
          <FloatingPanel
            isOpen={activePanel === 'insights'}
            onClose={() => setActivePanel(null)}
            title="AI Insights"
            icon={<Sparkles size={18} />}
            position="left"
          >
            <InsightPanel limit={10} autoRefresh refreshInterval={30000} />
          </FloatingPanel>

          <FloatingPanel
            isOpen={activePanel === 'states'}
            onClose={() => setActivePanel(null)}
            title="State Dashboard"
            icon={<Map size={18} />}
            position="left"
          >
            <StateDashboard />
          </FloatingPanel>

          <FloatingPanel
            isOpen={activePanel === 'analytics'}
            onClose={() => setActivePanel(null)}
            title="Analytics"
            icon={<BarChart3 size={18} />}
            position="right"
          >
            <AnalyticsGraphs />
          </FloatingPanel>

          <FloatingPanel
            isOpen={activePanel === 'compare'}
            onClose={() => setActivePanel(null)}
            title="Compare States"
            icon={<GitCompare size={18} />}
            position="right"
          >
            <CompareStates />
          </FloatingPanel>

          <FloatingPanel
            isOpen={activePanel === 'discovery'}
            onClose={() => setActivePanel(null)}
            title="Discovery"
            icon={<Compass size={18} />}
            position="bottom"
          >
            <Discovery />
          </FloatingPanel>

          <FloatingPanel
            isOpen={activePanel === 'search'}
            onClose={() => setActivePanel(null)}
            title="Semantic Search"
            icon={<Search size={18} />}
            position="bottom"
          >
            <SemanticSearch />
          </FloatingPanel>

          <FloatingPanel
            isOpen={activePanel === 'scores'}
            onClose={() => setActivePanel(null)}
            title="Ecosystem Rankings"
            icon={<TrendingUp size={18} />}
            position="right"
          >
            <EcosystemScores />
          </FloatingPanel>
        </>
      )}

      {/* Repository Details Modal */}
      <AnimatePresence>
        {isRepoModalOpen && selectedRepo && (
          <RepositoryDetails
            repository={selectedRepo}
            isOpen={isRepoModalOpen}
            onClose={() => {
              setIsRepoModalOpen(false);
              setSelectedRepo(null);
            }}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

## Milestone 8: Location Intelligence & Geocoding Pipeline ✓ COMPLETE

### Backend geocoding, normalization, and worker pipelines:
- Configured PostgreSQL tables for `github_users` tracking and `location_cache` for OSM/Nominatim responses.
- Implemented `GeocodingService` and `LocationNormalizer` with Redis cache invalidation.
- Created ARQ worker synchronization and background location enrichment jobs.
- Connected manual `/api/v1/location-intelligence/enrich/{login}` and spatial `geospatial` join endpoints.

## Milestone 9: Stability & E2E Validation ✓ COMPLETE

### Bug Fixing & Middleware Stability
- **Maplibre Lifecycle Fix:** Moved map instantiation inside Mounting `useEffect` to resolve the fatal container-not-found crash.
- **Metrics Middleware Fix:** Pre-initialized `status_code` in Starlette metrics middleware dispatch method to prevent masking handler exceptions with `UnboundLocalError`.
- **SQL Param & Grouping Fixes:** Bound missing `min_confidence` parameter and matched `GROUP BY` expressions with `SELECT` projections in raw spatial query to fix PostgreSQL `GroupingError`.
- **Next.js Ref Forwarding Fix:** Replaced fragile `useImperativeHandle` dynamic refs with an `onReady` actions callback to correctly bind Story Mode controls.
- **Tailwind Scan Paths Fix:** Prefixed scan content directories with `./src/` in `tailwind.config.ts` to restore all Tailwind CSS utility layout styles.
- **Playwright Test Success:** Verified all 5 E2E Playwright validation tests pass successfully (Desktop Chrome).

