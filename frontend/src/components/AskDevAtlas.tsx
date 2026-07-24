'use client';

import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Sparkles, X, ChevronRight, Loader2, Bot, ExternalLink, Star } from 'lucide-react';
import { api } from '@/lib/api';

interface Citation {
  repository_id: string;
  full_name: string;
  description?: string;
  similarity_score: number;
  language?: string;
  stars: number;
}

interface AskDevAtlasProps {
  query: string;
  onClose: () => void;
  sessionId?: string;
  onSessionChange?: (sessionId: string) => void;
}

export default function AskDevAtlas({ query, onClose, sessionId, onSessionChange }: AskDevAtlasProps) {
  const [response, setResponse] = useState('');
  const [isStreaming, setIsStreaming] = useState(true);
  const [citations, setCitations] = useState<Citation[]>([]);

  useEffect(() => {
    if (!query) return;
    setResponse('');
    setCitations([]);
    setIsStreaming(true);

    const closeStream = api.streamAskDevAtlas(
      query,
      (chunk) => {
        setResponse((prev) => prev + chunk);
      },
      () => {
        setIsStreaming(false);
      },
      () => {
        setIsStreaming(false);
        setResponse((prev) => prev || 'Unable to connect to DevAtlas AI stream.');
      },
      (newSessionId) => {
        onSessionChange?.(newSessionId);
      },
      (newCitations) => {
        setCitations(newCitations);
      },
      sessionId
    );

    return () => {
      closeStream();
    };
  }, [query]);

  return (
    <motion.div
      initial={{ x: 50, opacity: 0 }}
      animate={{ x: 0, opacity: 1 }}
      exit={{ x: 50, opacity: 0 }}
      className="absolute top-36 right-12 z-30 w-[420px] pointer-events-none"
    >
      <div className="glass-premium rounded-3xl p-6 shadow-2xl relative overflow-hidden group pointer-events-auto edge-light border border-indigo-500/30">
        <div className="absolute top-0 right-0 w-48 h-48 bg-indigo-500/10 rounded-full blur-3xl group-hover:bg-indigo-500/20 transition-colors" />

        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-slate-400 hover:text-white transition-colors"
        >
          <X size={18} />
        </button>

        <div className="flex items-center gap-2 mb-4 relative z-10">
          <Bot className="text-indigo-400" size={20} />
          <h3 className="text-xs font-bold text-transparent bg-clip-text bg-gradient-to-r from-indigo-300 to-purple-300 uppercase tracking-widest">
            DevAtlas AI Copilot
          </h3>
        </div>

        <h4 className="text-lg font-bold text-white mb-3 leading-snug relative z-10">
          &ldquo;{query}&rdquo;
        </h4>

        <div className="prose prose-invert prose-sm relative z-10 text-slate-300 leading-relaxed max-h-[350px] overflow-y-auto pr-2 custom-scrollbar">
          {response ? (
            <div className="whitespace-pre-wrap">{response}</div>
          ) : (
            <div className="flex items-center gap-2 text-indigo-300 py-4">
              <Loader2 className="w-4 h-4 animate-spin" />
              <span>Analyzing developer ecosystem telemetry...</span>
            </div>
          )}
        </div>

        {citations.length > 0 && (
          <div className="mt-3 pt-3 border-t border-white/10 relative z-10">
            <h4 className="text-xs font-bold text-indigo-400 uppercase tracking-wider mb-2">Grounded in</h4>
            <div className="space-y-1 max-h-[120px] overflow-y-auto custom-scrollbar">
              {citations.map((c) => (
                <a
                  key={c.repository_id}
                  href={`https://github.com/${c.full_name}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2 text-xs text-slate-400 hover:text-indigo-300 transition-colors group"
                >
                  <ExternalLink size={10} className="text-slate-600 group-hover:text-indigo-400" />
                  <span className="font-medium text-white">{c.full_name}</span>
                  <Star size={10} className="text-amber-400" />
                  <span className="text-amber-400">{c.stars}</span>
                  <span className="text-slate-600">{(c.similarity_score * 100).toFixed(0)}% match</span>
                </a>
              ))}
            </div>
          </div>
        )}

        <div className="mt-6 flex items-center justify-between border-t border-white/10 pt-4 relative z-10">
          <div className="flex items-center gap-2">
            <span className="px-2.5 py-1 bg-emerald-500/10 border border-emerald-500/20 rounded-full text-[10px] text-emerald-400 font-bold tracking-wide">
              {isStreaming ? 'STREAMING...' : 'LIVE ANALYSIS'}
            </span>
          </div>
        </div>
      </div>
    </motion.div>
  );
}
