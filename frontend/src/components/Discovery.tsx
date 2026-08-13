'use client';

import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  TrendingUp, 
  Code2, 
  MapPin, 
  Building2, 
  Bot, 
  Target,
  Sparkles,
  ExternalLink,
  Star
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { api, DiscoveryData } from '@/lib/api';

type TabType = 'repositories' | 'technologies' | 'states' | 'organizations' | 'ai' | 'domains';

const TABS: { key: TabType; label: string; icon: React.ReactNode }[] = [
  { key: 'repositories', label: 'Repos', icon: <Star size={16} /> },
  { key: 'technologies', label: 'Tech', icon: <Code2 size={16} /> },
  { key: 'states', label: 'States', icon: <MapPin size={16} /> },
  { key: 'organizations', label: 'Orgs', icon: <Building2 size={16} /> },
  { key: 'ai', label: 'AI Projects', icon: <Bot size={16} /> },
  { key: 'domains', label: 'Domains', icon: <Target size={16} /> },
];

function TabButton({ tab, active, onClick }: { tab: typeof TABS[0]; active: boolean; onClick: () => void }) {
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
      {tab.icon}
      {tab.label}
    </motion.button>
  );
}

function RepoCard({ repo, index }: { repo: DiscoveryData['trending_repositories'][0]; index: number }) {
  return (
    <motion.a
      href={`https://github.com/${repo.full_name}`}
      target="_blank"
      rel="noopener noreferrer"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.05 }}
      className="group bg-slate-800/50 rounded-2xl p-5 border border-slate-700/50 backdrop-blur-sm hover:border-indigo-500/50 hover:bg-slate-800/80 transition-all"
    >
      <div className="flex items-start justify-between mb-3">
        <div className="flex-1 min-w-0">
          <h4 className="text-slate-200 font-semibold truncate group-hover:text-indigo-300 transition-colors">
            {repo.name}
          </h4>
          <p className="text-xs text-slate-500 truncate">{repo.full_name}</p>
        </div>
        <div className="flex items-center gap-1 text-yellow-400 ml-2 flex-shrink-0">
          <Star size={14} fill="currentColor" />
          <span className="text-sm font-medium">{repo.stars.toLocaleString()}</span>
        </div>
      </div>
      {repo.description && (
        <p className="text-sm text-slate-400 line-clamp-2 mb-3">{repo.description}</p>
      )}
      <div className="flex items-center justify-between">
        <span className="text-xs px-2.5 py-1 bg-slate-700/50 text-slate-300 rounded-full">
          {repo.language || 'Unknown'}
        </span>
        <ExternalLink size={14} className="text-slate-500 group-hover:text-indigo-400 transition-colors" />
      </div>
    </motion.a>
  );
}

function TechCard({ tech, index }: { tech: { language: string; count: number }; index: number }) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ delay: index * 0.05 }}
      className="bg-slate-800/50 rounded-2xl p-4 border border-slate-700/50 hover:border-indigo-500/50 transition-all group"
    >
      <div className="flex items-center gap-3">
        <span className="text-3xl">
          {index === 0 ? '??' : index === 1 ? '??' : index === 2 ? '??' : '??'}
        </span>
        <div className="flex-1">
          <h4 className="text-slate-200 font-semibold group-hover:text-indigo-300 transition-colors">
            {tech.language}
          </h4>
          <p className="text-2xl font-bold text-indigo-400">{tech.count.toLocaleString()}</p>
          <p className="text-xs text-slate-500">repositories</p>
        </div>
      </div>
    </motion.div>
  );
}

function StateCard({ state, index }: { state: { state: string; repositories: number }; index: number }) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ delay: index * 0.05 }}
      className="bg-slate-800/50 rounded-2xl p-4 border border-slate-700/50 hover:border-emerald-500/50 transition-all group"
    >
      <div className="flex items-center gap-3">
        <span className="text-3xl">
          {index === 0 ? '??' : index === 1 ? '??' : index === 2 ? '??' : '??'}
        </span>
        <div className="flex-1">
          <h4 className="text-slate-200 font-semibold group-hover:text-emerald-300 transition-colors">
            {state.state}
          </h4>
          <p className="text-2xl font-bold text-emerald-400">{state.repositories.toLocaleString()}</p>
          <p className="text-xs text-slate-500">repositories</p>
        </div>
      </div>
    </motion.div>
  );
}

function OrgCard({ org, index }: { org: { login: string; repositories: number }; index: number }) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ delay: index * 0.05 }}
      className="bg-slate-800/50 rounded-2xl p-4 border border-slate-700/50 hover:border-purple-500/50 transition-all group"
    >
      <div className="flex items-center gap-3">
        <span className="text-3xl">{index === 0 ? '??' : '???'}</span>
        <div className="flex-1">
          <h4 className="text-slate-200 font-semibold group-hover:text-purple-300 transition-colors">
            {org.login}
          </h4>
          <p className="text-2xl font-bold text-purple-400">{org.repositories.toLocaleString()}</p>
          <p className="text-xs text-slate-500">repositories</p>
        </div>
      </div>
    </motion.div>
  );
}

function AICard({ project, index }: { project: DiscoveryData['newest_ai_projects'][0]; index: number }) {
  return (
    <motion.a
      href={`https://github.com/${project.full_name}`}
      target="_blank"
      rel="noopener noreferrer"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.05 }}
      className="group bg-gradient-to-br from-emerald-900/30 to-emerald-800/10 rounded-2xl p-4 border border-emerald-500/20 hover:border-emerald-500/50 transition-all"
    >
      <div className="flex items-center gap-2 mb-2">
        <Bot size={18} className="text-emerald-400" />
        <div className="flex-1 min-w-0">
          <h4 className="text-slate-200 font-medium truncate group-hover:text-emerald-300 transition-colors">
            {project.name}
          </h4>
          <p className="text-xs text-slate-500 truncate">{project.full_name}</p>
        </div>
      </div>
      <div className="flex items-center justify-between">
        <span className="text-xs px-2 py-0.5 bg-emerald-500/20 text-emerald-400 rounded-full">
          {project.language || 'AI'}
        </span>
        <span className="text-xs text-slate-500">
          {project.created_at ? new Date(project.created_at).toLocaleDateString() : 'Recently added'}
        </span>
      </div>
    </motion.a>
  );
}

function DomainCard({ domain, index }: { domain: { domain: string; count: number }; index: number }) {
  const colors = ['from-purple-500/20 to-purple-600/10', 'from-blue-500/20 to-blue-600/10', 'from-emerald-500/20 to-emerald-600/10', 'from-orange-500/20 to-orange-600/10', 'from-pink-500/20 to-pink-600/10'];
  
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ delay: index * 0.05 }}
      className={cn("bg-slate-800/50 rounded-2xl p-4 border border-slate-700/50 hover:border-indigo-500/50 transition-all", `bg-gradient-to-br ${colors[index % colors.length]}`)}
    >
      <div className="flex items-center gap-3">
        <span className="text-2xl">??</span>
        <div className="flex-1">
          <h4 className="text-slate-200 font-semibold capitalize">{domain.domain}</h4>
          <p className="text-xl font-bold text-indigo-400">{domain.count.toLocaleString()}</p>
          <p className="text-xs text-slate-500">repositories</p>
        </div>
      </div>
    </motion.div>
  );
}

export default function Discovery() {
  const [discovery, setDiscovery] = useState<DiscoveryData | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<TabType>('repositories');

  useEffect(() => {
    const controller = new AbortController();
    const fetchDiscovery = async () => {
      try {
        const data = await api.getDiscovery(controller.signal);
        if (!controller.signal.aborted) setDiscovery(data);
      } catch (error) {
        if ((error as { name?: string })?.name === 'AbortError') return;
        console.error('Failed to fetch discovery data', error);
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    };

    fetchDiscovery();
    return () => controller.abort();
  }, []);

  if (loading) {
    return (
      <div className="animate-pulse space-y-6">
        <div className="h-10 bg-slate-700 rounded w-1/4" />
        <div className="grid grid-cols-3 gap-4">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="h-32 bg-slate-700 rounded-2xl" />
          ))}
        </div>
      </div>
    );
  }

  if (!discovery) {
    return (
      <div className="text-center py-12 text-slate-400">
        <Sparkles size={48} className="mx-auto mb-4 opacity-50" />
        <p>No discovery data available</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex items-center gap-3"
      >
        <Sparkles size={24} className="text-indigo-400" />
        <h2 className="text-2xl font-bold text-slate-200">Discover</h2>
      </motion.div>

      {/* Tabs */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.1 }}
        className="flex gap-2 overflow-x-auto pb-2"
      >
        {TABS.map((tab) => (
          <TabButton
            key={tab.key}
            tab={tab}
            active={activeTab === tab.key}
            onClick={() => setActiveTab(tab.key)}
          />
        ))}
      </motion.div>

      {/* Content */}
      <AnimatePresence mode="wait">
        <motion.div
          key={activeTab}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -10 }}
        >
          {activeTab === 'repositories' && (
            <div className="grid md:grid-cols-2 gap-4">
              {discovery.trending_repositories.slice(0, 8).map((repo, i) => (
                <RepoCard key={repo.id} repo={repo} index={i} />
              ))}
            </div>
          )}

          {activeTab === 'technologies' && (
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
              {discovery.trending_technologies.map((tech, i) => (
                <TechCard key={tech.language} tech={tech} index={i} />
              ))}
            </div>
          )}

          {activeTab === 'states' && (
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
              {discovery.trending_states.map((state, i) => (
                <StateCard key={state.state} state={state} index={i} />
              ))}
            </div>
          )}

          {activeTab === 'organizations' && (
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
              {discovery.trending_organizations.map((org, i) => (
                <OrgCard key={org.login} org={org} index={i} />
              ))}
            </div>
          )}

          {activeTab === 'ai' && (
            <div className="grid md:grid-cols-2 gap-4">
              {discovery.newest_ai_projects.map((project, i) => (
                <AICard key={project.id} project={project} index={i} />
              ))}
            </div>
          )}

          {activeTab === 'domains' && (
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
              {discovery.fastest_growing_domains.map((domain, i) => (
                <DomainCard key={domain.domain} domain={domain} index={i} />
              ))}
            </div>
          )}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}