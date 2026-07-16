'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  X, Star, GitFork, Eye, Clock, Users, Code2, ExternalLink,
  TrendingUp, Activity, MapPin, Calendar, ArrowUpRight, ChevronRight
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface RepositoryData {
  id: string;
  name: string;
  fullName: string;
  description: string;
  owner: string;
  ownerAvatar: string;
  language: string;
  languageColor: string;
  stars: number;
  forks: number;
  watchers: number;
  openIssues: number;
  createdAt: string;
  updatedAt: string;
  pushedAt: string;
  topics: string[];
  license: string;
  homepage: string;
  location: string;
  contributors: number;
  commits: number;
  branches: number;
  releases: number;
}

interface RepositoryDetailsProps {
  repository: RepositoryData | null;
  isOpen: boolean;
  onClose: () => void;
}

const mockRepository: RepositoryData = {
  id: '1',
  name: 'india-developer-atlas',
  fullName: 'DevAtlas/india-developer-atlas',
  description: 'Comprehensive map of Indian software developers and tech ecosystems. Features interactive visualizations, state-wise analytics, and AI-powered insights.',
  owner: 'DevAtlas',
  ownerAvatar: 'https://avatars.githubusercontent.com/u/12345678',
  language: 'TypeScript',
  languageColor: '#3178c6',
  stars: 2847,
  forks: 423,
  watchers: 156,
  openIssues: 23,
  createdAt: '2024-01-15',
  updatedAt: '2024-07-10',
  pushedAt: '2024-07-15',
  topics: ['typescript', 'nextjs', 'postgis', 'visualization', 'india', 'developers'],
  license: 'MIT',
  homepage: 'https://devatlas.in',
  location: 'India',
  contributors: 12,
  commits: 1847,
  branches: 8,
  releases: 24,
};

const StatItem = ({ label, value, icon, trend }: { label: string; value: string | number; icon?: React.ReactNode; trend?: 'up' | 'down' }) => (
  <div className="flex items-center gap-3 p-3 rounded-xl bg-slate-800/50">
    {icon && <div className="text-indigo-400">{icon}</div>}
    <div>
      <div className="text-lg font-semibold text-white">{value}</div>
      <div className="text-xs text-slate-400">{label}</div>
    </div>
    {trend && (
      <ArrowUpRight className={cn(
        'w-4 h-4 ml-auto',
        trend === 'up' ? 'text-emerald-400' : 'text-red-400'
      )} />
    )}
  </div>
);

const TabButton = ({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) => (
  <button
    onClick={onClick}
    className={cn(
      'px-4 py-2 text-sm font-medium rounded-lg transition-colors',
      active 
        ? 'bg-indigo-600 text-white' 
        : 'text-slate-400 hover:text-white hover:bg-slate-800'
    )}
  >
    {children}
  </button>
);

const CommitItem = ({ hash, message, author, date }: { hash: string; message: string; author: string; date: string }) => (
  <div className="flex items-start gap-3 p-3 rounded-lg hover:bg-slate-800/50 transition-colors">
    <div className="w-8 h-8 rounded-full bg-indigo-500/20 flex items-center justify-center text-indigo-400 text-xs font-mono">
      {hash.slice(0, 4)}
    </div>
    <div className="flex-1 min-w-0">
      <p className="text-sm text-white truncate">{message}</p>
      <p className="text-xs text-slate-400 mt-1">
        {author} committed on {new Date(date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
      </p>
    </div>
  </div>
);

const ContributorItem = ({ name, avatar, contributions }: { name: string; avatar: string; contributions: number }) => (
  <div className="flex items-center gap-3 p-2 rounded-lg hover:bg-slate-800/50 transition-colors">
    <img src={avatar} alt={name} className="w-8 h-8 rounded-full" />
    <div className="flex-1 min-w-0">
      <p className="text-sm text-white truncate">{name}</p>
      <p className="text-xs text-slate-400">{contributions} commits</p>
    </div>
    <div className="px-2 py-1 rounded bg-slate-700 text-xs text-slate-300">
      {contributions}
    </div>
  </div>
);

const BranchItem = ({ name, lastCommit, status }: { name: string; lastCommit: string; status: 'active' | 'stale' }) => (
  <div className="flex items-center gap-3 p-3 rounded-lg hover:bg-slate-800/50 transition-colors">
    <Code2 className="w-4 h-4 text-slate-400" />
    <div className="flex-1 min-w-0">
      <p className="text-sm text-white font-mono">{name}</p>
      <p className="text-xs text-slate-400">Last commit: {lastCommit}</p>
    </div>
    <span className={cn(
      'px-2 py-1 rounded text-xs',
      status === 'active' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-slate-700 text-slate-400'
    )}>
      {status}
    </span>
  </div>
);

export default function RepositoryDetails({ repository = mockRepository, isOpen, onClose }: RepositoryDetailsProps) {
  const [activeTab, setActiveTab] = useState<'overview' | 'commits' | 'contributors' | 'branches'>('overview');

  const formatNumber = (num: number) => {
    if (num >= 1000) return (num / 1000).toFixed(1) + 'k';
    return num.toString();
  };

  const mockCommits = [
    { hash: 'a1b2c3', message: 'feat: Add state-wise analytics dashboard', author: 'Priya Sharma', date: '2024-07-15' },
    { hash: 'd4e5f6', message: 'fix: Resolve map clustering performance issue', author: 'Rahul Kumar', date: '2024-07-14' },
    { hash: 'g7h8i9', message: 'refactor: Optimize API response caching', author: 'Anita Patel', date: '2024-07-13' },
    { hash: 'j1k2l3', message: 'docs: Update README with new features', author: 'Vikram Singh', date: '2024-07-12' },
    { hash: 'm4n5o6', message: 'test: Add integration tests for search', author: 'Sneha Gupta', date: '2024-07-11' },
  ];

  const mockContributors = [
    { name: 'Priya Sharma', avatar: 'https://avatars.githubusercontent.com/u/1', contributions: 423 },
    { name: 'Rahul Kumar', avatar: 'https://avatars.githubusercontent.com/u/2', contributions: 312 },
    { name: 'Anita Patel', avatar: 'https://avatars.githubusercontent.com/u/3', contributions: 287 },
    { name: 'Vikram Singh', avatar: 'https://avatars.githubusercontent.com/u/4', contributions: 198 },
    { name: 'Sneha Gupta', avatar: 'https://avatars.githubusercontent.com/u/5', contributions: 156 },
  ];

  const mockBranches = [
    { name: 'main', lastCommit: '2 hours ago', status: 'active' as const },
    { name: 'develop', lastCommit: '5 hours ago', status: 'active' as const },
    { name: 'feature/analytics', lastCommit: '1 day ago', status: 'active' as const },
    { name: 'fix/map-performance', lastCommit: '3 days ago', status: 'stale' as const },
  ];

  return (
    <AnimatePresence>
      {isOpen && repository && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50"
          />
          
          {/* Modal */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            className="fixed inset-4 md:inset-8 lg:inset-16 bg-slate-900 rounded-2xl border border-slate-700 shadow-2xl z-50 flex flex-col overflow-hidden"
          >
            {/* Header */}
            <div className="flex items-start justify-between p-6 border-b border-slate-700">
              <div className="flex items-start gap-4">
                <img 
                  src={repository.ownerAvatar} 
                  alt={repository.owner} 
                  className="w-12 h-12 rounded-xl"
                />
                <div>
                  <h2 className="text-xl font-bold text-white">{repository.name}</h2>
                  <p className="text-slate-400 text-sm">{repository.fullName}</p>
                  <div className="flex items-center gap-2 mt-2">
                    <span 
                      className="w-3 h-3 rounded-full"
                      style={{ backgroundColor: repository.languageColor }}
                    />
                    <span className="text-sm text-slate-300">{repository.language}</span>
                  </div>
                </div>
              </div>
              <button
                onClick={onClose}
                className="p-2 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Stats Bar */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 p-4 border-b border-slate-700 bg-slate-800/30">
              <StatItem 
                label="Stars" 
                value={formatNumber(repository.stars)} 
                icon={<Star className="w-4 h-4" />}
                trend="up"
              />
              <StatItem 
                label="Forks" 
                value={formatNumber(repository.forks)} 
                icon={<GitFork className="w-4 h-4" />}
              />
              <StatItem 
                label="Contributors" 
                value={repository.contributors} 
                icon={<Users className="w-4 h-4" />}
              />
              <StatItem 
                label="Commits" 
                value={formatNumber(repository.commits)} 
                icon={<Activity className="w-4 h-4" />}
              />
            </div>

            {/* Tabs */}
            <div className="flex gap-2 px-6 py-3 border-b border-slate-700">
              <TabButton active={activeTab === 'overview'} onClick={() => setActiveTab('overview')}>
                Overview
              </TabButton>
              <TabButton active={activeTab === 'commits'} onClick={() => setActiveTab('commits')}>
                Commits
              </TabButton>
              <TabButton active={activeTab === 'contributors'} onClick={() => setActiveTab('contributors')}>
                Contributors
              </TabButton>
              <TabButton active={activeTab === 'branches'} onClick={() => setActiveTab('branches')}>
                Branches
              </TabButton>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto p-6">
              {activeTab === 'overview' && (
                <div className="space-y-6">
                  {/* Description */}
                  <div>
                    <h3 className="text-sm font-medium text-slate-400 mb-2">About</h3>
                    <p className="text-slate-200">{repository.description}</p>
                  </div>

                  {/* Topics */}
                  <div>
                    <h3 className="text-sm font-medium text-slate-400 mb-2">Topics</h3>
                    <div className="flex flex-wrap gap-2">
                      {repository.topics.map((topic) => (
                        <span
                          key={topic}
                          className="px-3 py-1 rounded-full bg-indigo-500/10 text-indigo-300 text-sm border border-indigo-500/20"
                        >
                          {topic}
                        </span>
                      ))}
                    </div>
                  </div>

                  {/* Additional Info */}
                  <div className="grid grid-cols-2 gap-4">
                    <div className="p-4 rounded-xl bg-slate-800/50 border border-slate-700">
                      <div className="flex items-center gap-2 text-slate-400 mb-2">
                        <Calendar className="w-4 h-4" />
                        <span className="text-sm">Created</span>
                      </div>
                      <p className="text-white font-medium">
                        {new Date(repository.createdAt).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
                      </p>
                    </div>
                    <div className="p-4 rounded-xl bg-slate-800/50 border border-slate-700">
                      <div className="flex items-center gap-2 text-slate-400 mb-2">
                        <Clock className="w-4 h-4" />
                        <span className="text-sm">Last Updated</span>
                      </div>
                      <p className="text-white font-medium">
                        {new Date(repository.updatedAt).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
                      </p>
                    </div>
                    <div className="p-4 rounded-xl bg-slate-800/50 border border-slate-700">
                      <div className="flex items-center gap-2 text-slate-400 mb-2">
                        <MapPin className="w-4 h-4" />
                        <span className="text-sm">Location</span>
                      </div>
                      <p className="text-white font-medium">{repository.location}</p>
                    </div>
                    <div className="p-4 rounded-xl bg-slate-800/50 border border-slate-700">
                      <div className="flex items-center gap-2 text-slate-400 mb-2">
                        <TrendingUp className="w-4 h-4" />
                        <span className="text-sm">License</span>
                      </div>
                      <p className="text-white font-medium">{repository.license}</p>
                    </div>
                  </div>
                </div>
              )}

              {activeTab === 'commits' && (
                <div className="space-y-1">
                  {mockCommits.map((commit, index) => (
                    <CommitItem key={index} {...commit} />
                  ))}
                </div>
              )}

              {activeTab === 'contributors' && (
                <div className="space-y-1">
                  {mockContributors.map((contributor, index) => (
                    <ContributorItem key={index} {...contributor} />
                  ))}
                </div>
              )}

              {activeTab === 'branches' && (
                <div className="space-y-1">
                  {mockBranches.map((branch, index) => (
                    <BranchItem key={index} {...branch} />
                  ))}
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="flex items-center justify-between p-4 border-t border-slate-700 bg-slate-800/30">
              <div className="flex items-center gap-4">
                <button className="flex items-center gap-2 px-4 py-2 rounded-lg bg-slate-700 hover:bg-slate-600 text-white text-sm transition-colors">
                  <Star className="w-4 h-4" />
                  Star
                </button>
                <button className="flex items-center gap-2 px-4 py-2 rounded-lg bg-slate-700 hover:bg-slate-600 text-white text-sm transition-colors">
                  <GitFork className="w-4 h-4" />
                  Fork
                </button>
              </div>
              <button className="flex items-center gap-2 px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-sm transition-colors">
                View on GitHub
                <ExternalLink className="w-4 h-4" />
              </button>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}