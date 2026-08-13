'use client';

import { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Search, Clock, TrendingUp, X, ArrowRight, Star, Code2 } from 'lucide-react';
import { api, SemanticSearchResult } from '@/lib/api';

const recentSearches = ['Bangalore tech ecosystem', 'Python developers in India', 'React vs Vue adoption'];
const trendingSearches = ['AI/ML skills', 'Remote work trends', 'Startup ecosystem'];

const SemanticSearch = () => {
  const [query, setQuery] = useState('');
  const [isFocused, setIsFocused] = useState(false);
  const [results, setResults] = useState<SemanticSearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const controllerRef = useRef<AbortController | null>(null);

  // Abort any in-flight search when the component unmounts.
  useEffect(() => {
    return () => controllerRef.current?.abort();
  }, []);

  const handleSearch = async (searchQuery: string) => {
    if (!searchQuery.trim()) {
      setResults([]);
      return;
    }
    // Abort any in-flight search before starting a new one.
    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;

    setIsSearching(true);
    try {
      const data = await api.semanticSearch(searchQuery, 10, controller.signal);
      if (controller.signal.aborted) return;
      setResults(data.results || []);
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') return;
      console.error('Search error', error);
      setResults([]);
    } finally {
      if (!controller.signal.aborted) setIsSearching(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleSearch(query);
    }
  };

  return (
    <div className="w-full max-w-3xl mx-auto">
      <div className="relative">
        <div className="relative">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onFocus={() => setIsFocused(true)}
            onBlur={() => setTimeout(() => setIsFocused(false), 200)}
            onKeyDown={handleKeyDown}
            placeholder="Search for states, skills, topics..."
            className="w-full pl-12 pr-12 py-4 bg-slate-800/50 border border-slate-700 rounded-2xl text-white placeholder-slate-400 focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 transition-all"
          />
          {query && (
            <button
              onClick={() => { setQuery(''); setResults([]); }}
              className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          )}
        </div>

        <AnimatePresence>
          {isFocused && !query && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="absolute top-full left-0 right-0 mt-2 p-4 rounded-2xl bg-slate-800 border border-slate-700 shadow-xl z-50"
            >
              {recentSearches.length > 0 && (
                <div className="mb-4">
                  <div className="flex items-center gap-2 text-xs text-slate-400 mb-2">
                    <Clock className="w-3 h-3" />
                    Recent Searches
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {recentSearches.map((search) => (
                      <button
                        key={search}
                        onClick={() => { setQuery(search); handleSearch(search); }}
                        className="px-3 py-1.5 rounded-lg bg-slate-700/50 text-slate-300 text-sm hover:bg-slate-700 transition-colors"
                      >
                        {search}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              <div>
                <div className="flex items-center gap-2 text-xs text-slate-400 mb-2">
                  <TrendingUp className="w-3 h-3" />
                  Trending Searches
                </div>
                <div className="flex flex-wrap gap-2">
                  {trendingSearches.map((search) => (
                    <button
                      key={search}
                      onClick={() => { setQuery(search); handleSearch(search); }}
                      className="px-3 py-1.5 rounded-lg bg-slate-700/50 text-slate-300 text-sm hover:bg-slate-700 transition-colors"
                    >
                      {search}
                    </button>
                  ))}
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <AnimatePresence>
          {results.length > 0 && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="absolute top-full left-0 right-0 mt-2 p-2 rounded-2xl bg-slate-800 border border-slate-700 shadow-xl z-50 max-h-96 overflow-y-auto"
            >
              {results.map((result, index) => (
                <motion.button
                  key={result.repository_id}
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: index * 0.05 }}
                  onClick={() => {
                    if (result.html_url) window.open(result.html_url, '_blank');
                  }}
                  className="w-full p-4 text-left rounded-xl hover:bg-slate-700/50 transition-colors flex items-start gap-4"
                >
                  <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 bg-indigo-500/20 text-indigo-400">
                    <Code2 className="w-5 h-5" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-medium text-white truncate">{result.name}</span>
                      {result.language && (
                        <span className="px-2 py-0.5 rounded-full bg-slate-700 text-slate-400 text-xs">
                          {result.language}
                        </span>
                      )}
                    </div>
                    <p className="text-slate-400 text-sm truncate">
                      {result.description || result.full_name}
                    </p>
                    {result.topics && result.topics.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-1">
                        {result.topics.slice(0, 3).map((topic) => (
                          <span key={topic} className="px-1.5 py-0.5 rounded bg-slate-700/50 text-slate-500 text-[10px]">
                            {topic}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                  <div className="flex flex-col items-end gap-1 flex-shrink-0">
                    <span className="text-sm text-indigo-400 font-medium">
                      {Math.round(result.similarity * 100)}%
                    </span>
                    <span className="flex items-center gap-1 text-xs text-yellow-400">
                      <Star size={12} fill="currentColor" />
                      {result.stars.toLocaleString()}
                    </span>
                    <ArrowRight className="w-4 h-4 text-slate-500" />
                  </div>
                </motion.button>
              ))}
            </motion.div>
          )}
        </AnimatePresence>

        {isSearching && (
          <div className="absolute top-full left-0 right-0 mt-2 p-4 rounded-2xl bg-slate-800 border border-slate-700 shadow-xl z-50">
            <div className="flex items-center gap-3 text-slate-400">
              <div className="w-5 h-5 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
              Searching...
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default SemanticSearch;