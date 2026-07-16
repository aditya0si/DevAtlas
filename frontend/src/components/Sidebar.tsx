'use client';

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';
import {
  LayoutDashboard,
  Map,
  BarChart3,
  GitCompare,
  Compass,
  Search,
  FolderGit2,
  Settings,
  HelpCircle,
  ChevronLeft,
  ChevronRight,
  Sparkles,
  Menu,
  X,
} from 'lucide-react';

interface NavItem {
  id: string;
  label: string;
  icon: React.ReactNode;
  badge?: string | number;
}

interface SidebarProps {
  currentPage?: string;
  onNavigate?: (page: string) => void;
  collapsed?: boolean;
  onToggleCollapse?: () => void;
  className?: string;
}

const mainNavItems: NavItem[] = [
  { id: 'home', label: 'Overview', icon: <LayoutDashboard size={20} /> },
  { id: 'map', label: 'Developer Map', icon: <Map size={20} /> },
  { id: 'analytics', label: 'Analytics', icon: <BarChart3 size={20} /> },
  { id: 'compare', label: 'Compare States', icon: <GitCompare size={20} /> },
  { id: 'discovery', label: 'Discovery', icon: <Compass size={20} /> },
  { id: 'search', label: 'Semantic Search', icon: <Search size={20} /> },
  { id: 'states', label: 'State Dashboard', icon: <FolderGit2 size={20} /> },
];

const bottomNavItems: NavItem[] = [
  { id: 'settings', label: 'Settings', icon: <Settings size={20} /> },
  { id: 'support', label: 'Support', icon: <HelpCircle size={20} /> },
];

function NavLink({ 
  item, 
  isActive, 
  isCollapsed, 
  onClick 
}: { 
  item: NavItem; 
  isActive: boolean; 
  isCollapsed: boolean; 
  onClick: () => void;
}) {
  return (
    <motion.button
      onClick={onClick}
      className={cn(
        'w-full flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all text-left',
        isActive
          ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-500/25'
          : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50',
        isCollapsed && 'justify-center px-2'
      )}
      whileHover={{ scale: 1.02 }}
      whileTap={{ scale: 0.98 }}
    >
      <span className={cn(isActive ? 'text-white' : 'text-slate-400')}>
        {item.icon}
      </span>
      <AnimatePresence mode="wait">
        {!isCollapsed && (
          <motion.span
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="text-sm font-medium whitespace-nowrap"
          >
            {item.label}
          </motion.span>
        )}
      </AnimatePresence>
      {item.badge && !isCollapsed && (
        <span className="ml-auto px-2 py-0.5 text-xs bg-indigo-500/20 text-indigo-300 rounded-full">
          {item.badge}
        </span>
      )}
    </motion.button>
  );
}

export default function Sidebar({ 
  currentPage = 'home', 
  onNavigate,
  collapsed = false,
  onToggleCollapse,
  className 
}: SidebarProps) {
  const [isCollapsed, setIsCollapsed] = useState(collapsed);
  const [isMobileOpen, setIsMobileOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 1024);
      if (window.innerWidth < 1024) {
        setIsCollapsed(true);
      }
    };
    
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  useEffect(() => {
    setIsCollapsed(collapsed);
  }, [collapsed]);

  const handleNavigate = (id: string) => {
    onNavigate?.(id);
    if (isMobile) {
      setIsMobileOpen(false);
    }
  };

  const sidebarContent = (
    <div className={cn(
      'flex flex-col h-full bg-slate-900 border-r border-slate-800',
      'transition-all duration-300 ease-in-out',
      isCollapsed ? 'w-16' : 'w-64',
      className
    )}>
      {/* Logo */}
      <div className="flex items-center justify-between h-16 px-4 border-b border-slate-800">
        <AnimatePresence mode="wait">
          {!isCollapsed && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="flex items-center gap-2"
            >
              <Sparkles className="text-indigo-400" size={24} />
              <span className="text-lg font-bold bg-gradient-to-r from-indigo-400 to-purple-400 bg-clip-text text-transparent">
                DevAtlas
              </span>
            </motion.div>
          )}
        </AnimatePresence>
        {isCollapsed && <Sparkles className="text-indigo-400 mx-auto" size={24} />}
        
        {!isMobile && onToggleCollapse && (
          <button
            onClick={onToggleCollapse}
            className="p-1.5 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-slate-200 transition-colors"
          >
            {isCollapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
          </button>
        )}
      </div>

      {/* Main Navigation */}
      <div className="flex-1 overflow-y-auto py-4 px-3 space-y-1">
        <div className="mb-6">
          {!isCollapsed && (
            <p className="px-3 mb-2 text-xs font-semibold text-slate-500 uppercase tracking-wider">
              Main Menu
            </p>
          )}
          {mainNavItems.map((item) => (
            <NavLink
              key={item.id}
              item={item}
              isActive={currentPage === item.id}
              isCollapsed={isCollapsed}
              onClick={() => handleNavigate(item.id)}
            />
          ))}
        </div>
      </div>

      {/* Bottom Navigation */}
      <div className="border-t border-slate-800 py-4 px-3 space-y-1">
        {!isCollapsed && (
          <p className="px-3 mb-2 text-xs font-semibold text-slate-500 uppercase tracking-wider">
            Support
          </p>
        )}
        {bottomNavItems.map((item) => (
          <NavLink
            key={item.id}
            item={item}
            isActive={currentPage === item.id}
            isCollapsed={isCollapsed}
            onClick={() => handleNavigate(item.id)}
          />
        ))}
      </div>
    </div>
  );

  // Mobile overlay
  return (
    <>
      {/* Mobile Menu Button */}
      {isMobile && (
        <button
          onClick={() => setIsMobileOpen(true)}
          className="fixed top-4 left-4 z-50 p-2 bg-slate-800 border border-slate-700 rounded-lg lg:hidden"
        >
          <Menu size={20} className="text-slate-200" />
        </button>
      )}

      {/* Mobile Sidebar Overlay */}
      <AnimatePresence>
        {isMobileOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40 lg:hidden"
              onClick={() => setIsMobileOpen(false)}
            />
            <motion.div
              initial={{ x: -280 }}
              animate={{ x: 0 }}
              exit={{ x: -280 }}
              transition={{ type: 'spring', damping: 25, stiffness: 200 }}
              className="fixed left-0 top-0 h-full z-50 lg:hidden"
            >
              {sidebarContent}
              <button
                onClick={() => setIsMobileOpen(false)}
                className="absolute top-4 right-4 p-1.5 rounded-lg bg-slate-800 text-slate-400 hover:text-slate-200"
              >
                <X size={16} />
              </button>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Desktop Sidebar */}
      <div className="hidden lg:block">
        {sidebarContent}
      </div>
    </>
  );
}