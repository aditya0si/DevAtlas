'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import { 
  MapPin, Users, Code2, TrendingUp, Award, ArrowUpRight,
  GitFork, Star, Activity, ChevronRight, ExternalLink
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface StateData {
  id: string;
  name: string;
  developers: string;
  repos: string;
  prs: string;
  growth: number;
  topSkills: string[];
  highlight?: string;
  description: string;
}

const states: StateData[] = [
  {
    id: 'ka',
    name: 'Karnataka',
    developers: '45,000+',
    repos: '12,000+',
    prs: '85,000+',
    growth: 23,
    topSkills: ['JavaScript', 'Python', 'React'],
    highlight: 'Tech Hub',
    description: 'Home to Bangalore, India\'s Silicon Valley. Dominant in tech with major IT parks and startup culture.',
  },
  {
    id: 'mh',
    name: 'Maharashtra',
    developers: '38,000+',
    repos: '9,500+',
    prs: '72,000+',
    growth: 18,
    topSkills: ['Python', 'Java', 'Angular'],
    description: 'Mumbai and Pune form the financial and tech backbone with strong enterprise presence.',
  },
  {
    id: 'ts',
    name: 'Telangana',
    developers: '25,000+',
    repos: '6,200+',
    prs: '48,000+',
    growth: 31,
    topSkills: ['JavaScript', 'React', 'Node.js'],
    highlight: 'Fastest Growing',
    description: 'Hyderabad\'s tech scene is expanding rapidly with new startups and tech parks.',
  },
  {
    id: 'tn',
    name: 'Tamil Nadu',
    developers: '22,000+',
    repos: '5,800+',
    prs: '45,000+',
    growth: 15,
    topSkills: ['Java', 'Python', 'Spring'],
    description: 'Chennai and Coimbatore offer a strong base for IT services and manufacturing.',
  },
  {
    id: 'dl',
    name: 'Delhi NCR',
    developers: '35,000+',
    repos: '8,900+',
    prs: '68,000+',
    growth: 12,
    topSkills: ['Python', 'JavaScript', 'AWS'],
    description: 'The NCR region combines Gurgaon\'s MNCs with Delhi\'s startup scene.',
  },
  {
    id: 'gj',
    name: 'Gujarat',
    developers: '12,000+',
    repos: '3,100+',
    prs: '25,000+',
    growth: 21,
    topSkills: ['JavaScript', 'PHP', 'React'],
    description: 'Ahmedabad and Surat are emerging as tech destinations with growing startup culture.',
  },
];

const StateCard = ({ state, isSelected, onClick }: { state: StateData; isSelected: boolean; onClick: () => void }) => (
  <motion.button
    onClick={onClick}
    initial={{ opacity: 0, y: 20 }}
    animate={{ opacity: 1, y: 0 }}
    whileHover={{ scale: 1.02 }}
    whileTap={{ scale: 0.98 }}
    className={cn(
      'w-full p-6 rounded-2xl border text-left transition-all',
      isSelected 
        ? 'bg-indigo-500/10 border-indigo-500/50' 
        : 'bg-slate-800/50 border-slate-700 hover:border-slate-600'
    )}
  >
    <div className="flex items-start justify-between mb-4">
      <div className="flex items-center gap-3">
        <div className={cn(
          'w-12 h-12 rounded-xl flex items-center justify-center',
          isSelected ? 'bg-indigo-500/30 text-indigo-300' : 'bg-slate-700 text-slate-400'
        )}>
          <MapPin className="w-6 h-6" />
        </div>
        <div>
          <h3 className="text-lg font-semibold text-white">{state.name}</h3>
          {state.highlight && (
            <span className="text-xs text-indigo-400 font-medium">{state.highlight}</span>
          )}
        </div>
      </div>
      <ChevronRight className={cn(
        'w-5 h-5 transition-transform',
        isSelected ? 'text-indigo-400 rotate-90' : 'text-slate-500'
      )} />
    </div>
    
    <div className="space-y-3">
      <div className="flex items-center justify-between text-sm">
        <span className="text-slate-400">Developers</span>
        <span className="text-white font-medium">{state.developers}</span>
      </div>
      <div className="flex items-center justify-between text-sm">
        <span className="text-slate-400">Repositories</span>
        <span className="text-white font-medium">{state.repos}</span>
      </div>
      <div className="flex items-center justify-between text-sm">
        <span className="text-slate-400">Growth</span>
        <span className="text-emerald-400 font-medium flex items-center gap-1">
          <ArrowUpRight className="w-4 h-4" />
          {state.growth}%
        </span>
      </div>
    </div>
    
    <div className="mt-4 flex flex-wrap gap-2">
      {state.topSkills.map((skill) => (
        <span 
          key={skill}
          className="px-2 py-1 rounded-lg bg-slate-700/50 text-slate-300 text-xs"
        >
          {skill}
        </span>
      ))}
    </div>
  </motion.button>
);

const StateDashboard = () => {
  const [selectedState, setSelectedState] = useState<StateData | null>(null);

  return (
    <div className="grid lg:grid-cols-2 gap-6">
      <div className="space-y-4">
        <h2 className="text-xl font-semibold text-white mb-4">Select a State</h2>
        <div className="grid gap-4">
          {states.map((state) => (
            <StateCard
              key={state.id}
              state={state}
              isSelected={selectedState?.id === state.id}
              onClick={() => setSelectedState(state)}
            />
          ))}
        </div>
      </div>
      
      <div className="space-y-6">
        {selectedState ? (
          <motion.div
            key={selectedState.id}
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            className="rounded-2xl bg-slate-800/50 border border-slate-700 p-6"
          >
            <div className="flex items-start justify-between mb-6">
              <div>
                <h3 className="text-2xl font-bold text-white mb-1">{selectedState.name}</h3>
                {selectedState.highlight && (
                  <span className="inline-block px-3 py-1 rounded-full bg-indigo-500/20 text-indigo-300 text-sm">
                    {selectedState.highlight}
                  </span>
                )}
              </div>
              <button className="p-2 rounded-lg bg-slate-700 text-slate-400 hover:text-white transition-colors">
                <ExternalLink className="w-5 h-5" />
              </button>
            </div>
            
            <p className="text-slate-400 mb-6">{selectedState.description}</p>
            
            <div className="grid grid-cols-3 gap-4 mb-6">
              <div className="p-4 rounded-xl bg-slate-900/50">
                <Users className="w-5 h-5 text-indigo-400 mb-2" />
                <div className="text-2xl font-bold text-white">{selectedState.developers}</div>
                <div className="text-xs text-slate-400">Developers</div>
              </div>
              <div className="p-4 rounded-xl bg-slate-900/50">
                <GitFork className="w-5 h-5 text-emerald-400 mb-2" />
                <div className="text-2xl font-bold text-white">{selectedState.repos}</div>
                <div className="text-xs text-slate-400">Repositories</div>
              </div>
              <div className="p-4 rounded-xl bg-slate-900/50">
                <Activity className="w-5 h-5 text-amber-400 mb-2" />
                <div className="text-2xl font-bold text-white">{selectedState.growth}%</div>
                <div className="text-xs text-slate-400">YoY Growth</div>
              </div>
            </div>
            
            <div className="mb-6">
              <h4 className="text-sm font-medium text-slate-400 mb-3">Top Skills</h4>
              <div className="flex flex-wrap gap-2">
                {selectedState.topSkills.map((skill) => (
                  <span 
                    key={skill}
                    className="px-4 py-2 rounded-xl bg-indigo-500/10 border border-indigo-500/20 text-indigo-300"
                  >
                    {skill}
                  </span>
                ))}
              </div>
            </div>
            
            <div className="flex gap-3">
              <button className="flex-1 py-3 px-4 bg-indigo-600 hover:bg-indigo-700 text-white font-medium rounded-xl transition-colors flex items-center justify-center gap-2">
                View Detailed Analytics <ChevronRight className="w-4 h-4" />
              </button>
              <button className="py-3 px-4 bg-slate-700 hover:bg-slate-600 text-white rounded-xl transition-colors">
                Compare
              </button>
            </div>
          </motion.div>
        ) : (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="h-full flex items-center justify-center rounded-2xl bg-slate-800/30 border border-slate-700 border-dashed"
          >
            <div className="text-center">
              <MapPin className="w-12 h-12 text-slate-500 mx-auto mb-4" />
              <p className="text-slate-400">Select a state to view details</p>
            </div>
          </motion.div>
        )}
      </div>
    </div>
  );
};

export default StateDashboard;