import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Search, ArrowUpRight } from 'lucide-react';

interface ScrapedUpdate {
  id: string;
  title: string;
  content: string;
  timestamp: string;
  url: string;
  source: string;
}

export default function App() {
  const [updates, setUpdates] = useState<ScrapedUpdate[]>([]);
  const [lastRun, setLastRun] = useState<string>('');
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedSource, setSelectedSource] = useState<string>('all');
  const [sortBy, setSortBy] = useState<'latest' | 'oldest'>('latest');
  const [expandedIds, setExpandedIds] = useState<Record<string, boolean>>({});
  const [isLoading, setIsLoading] = useState<boolean>(true);

  useEffect(() => {
    setIsLoading(true);
    fetch('/state.json')
      .then((res) => {
        if (!res.ok) throw new Error('Failed to fetch state');
        return res.json();
      })
      .then((data) => {
        if (data) {
          setUpdates((data.updates as ScrapedUpdate[]) || []);
          setLastRun(data.lastRunTimestamp || '');
        }
      })
      .catch((err) => {
        console.error('Failed to dynamically fetch state.json:', err);
      })
      .finally(() => {
        setIsLoading(false);
      });
  }, []);

  const toggleExpand = (id: string) => {
    setExpandedIds(prev => ({
      ...prev,
      [id]: !prev[id]
    }));
  };

  const formatTimestamp = (isoString: string) => {
    try {
      const date = new Date(isoString);
      return date.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      }) + ' ' + date.toLocaleTimeString('en-US', {
        hour: '2-digit',
        minute: '2-digit',
        hour12: false
      });
    } catch {
      return isoString;
    }
  };

  const getSourceLabel = (source: string) => {
    if (source === 'aggregator') return 'news';
    if (source === 'nitter') return 'twitter/x';
    return source;
  };

  const filteredUpdates = updates.filter(update => {
    const matchesSearch = 
      update.title.toLowerCase().includes(searchTerm.toLowerCase()) || 
      update.content.toLowerCase().includes(searchTerm.toLowerCase());
    
    const matchesSource = 
      selectedSource === 'all' || 
      update.source === selectedSource;

    return matchesSearch && matchesSource;
  });

  const sortedUpdates = [...filteredUpdates].sort((a, b) => {
    const timeA = new Date(a.timestamp).getTime();
    const timeB = new Date(b.timestamp).getTime();
    return sortBy === 'latest' ? timeB - timeA : timeA - timeB;
  });

  return (
    <div className="min-h-screen bg-black text-zinc-400 flex flex-col selection:bg-zinc-800 selection:text-white">
      
      {/* Full-Width Vercel-style Top Navbar */}
      <nav className="w-full border-b border-zinc-900/30">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <img
              src="/logo.png"
              alt="Sidra Pulse"
              className="w-5 h-5 rounded-full filter grayscale opacity-70 hover:grayscale-0 hover:opacity-100 transition-all duration-300"
              onError={(e) => {
                e.currentTarget.style.display = 'none';
              }}
            />
            <span className="text-sm font-semibold tracking-wider text-zinc-200 uppercase">
              SIDRA PULSE
            </span>
          </div>
          {lastRun && (
            <span className="text-xs font-mono text-zinc-600 uppercase tracking-wider">
              {formatTimestamp(lastRun)}
            </span>
          )}
        </div>
      </nav>

      {/* Centered Main content column */}
      <div className="w-full max-w-2xl mx-auto px-6 py-16 md:py-24 flex flex-col">
        
        {/* Tagline / Disclaimer */}
        <div className="mb-16">
          <p className="text-xs text-zinc-600 leading-relaxed max-w-md">
            Unofficial community-maintained index tracking network upgrades, developer updates, and ecosystem status changes.
          </p>
        </div>

        {/* Filter Controls */}
        <div className="flex flex-col gap-8 mb-16">
          {/* Search Input */}
          <div className="relative">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-600" />
            <input
              type="text"
              placeholder="Search index..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full bg-zinc-900/20 rounded-lg pl-10 pr-4 py-3 text-sm text-zinc-200 placeholder-zinc-700 focus:outline-none focus:bg-zinc-900/40 transition-all border-none"
            />
          </div>

          {/* Category Tabs & Sorting */}
          <div className="flex items-center justify-between">
            <div className="flex flex-wrap gap-x-6 gap-y-2">
              {[
                { id: 'all', label: 'all' },
                { id: 'telegram', label: 'telegram' },
                { id: 'nitter', label: 'twitter/x' },
                { id: 'aggregator', label: 'news' }
              ].map(source => (
                <button
                  key={source.id}
                  onClick={() => setSelectedSource(source.id)}
                  className={`text-xs font-mono uppercase tracking-wider transition-colors ${
                    selectedSource === source.id
                      ? 'text-zinc-100 font-semibold'
                      : 'text-zinc-600 hover:text-zinc-400'
                  }`}
                >
                  {source.label}
                </button>
              ))}
            </div>
            
            {/* Sorting Toggle */}
            <button
              onClick={() => setSortBy(prev => prev === 'latest' ? 'oldest' : 'latest')}
              className="text-xs font-mono text-zinc-500 hover:text-zinc-300 transition-colors uppercase tracking-wider"
            >
              sort: {sortBy}
            </button>
          </div>
        </div>

        {/* Updates List */}
        <main className="space-y-16">
          <AnimatePresence mode="popLayout">
            {isLoading ? (
              // Shimmering skeleton loader cards
              Array.from({ length: 3 }).map((_, index) => (
                <div key={index} className="flex flex-col gap-4 animate-pulse">
                  <div className="flex items-center justify-between">
                    <div className="w-16 h-3 bg-zinc-900 rounded" />
                    <div className="w-28 h-3 bg-zinc-900 rounded" />
                  </div>
                  <div className="w-3/4 h-5 bg-zinc-800 rounded" />
                  <div className="space-y-2.5">
                    <div className="w-full h-4 bg-zinc-900 rounded" />
                    <div className="w-5/6 h-4 bg-zinc-900 rounded" />
                  </div>
                  <div className="w-10 h-3 bg-zinc-900 rounded mt-1" />
                </div>
              ))
            ) : sortedUpdates.length > 0 ? (
              sortedUpdates.map((update, index) => {
                const isExpanded = !!expandedIds[update.id];
                const shouldTruncate = update.content.length > 240;
                const displayContent = shouldTruncate && !isExpanded 
                  ? `${update.content.substring(0, 237)}...` 
                  : update.content;

                return (
                  <motion.article
                    key={update.id}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.15, delay: Math.min(index * 0.02, 0.15) }}
                    className="flex flex-col gap-3.5 group"
                  >
                    {/* Meta Header */}
                    <div className="flex items-center justify-between text-[11px] font-mono text-zinc-600 uppercase tracking-wider">
                      <span className="text-zinc-500">
                        [{getSourceLabel(update.source)}]
                      </span>
                      <span>
                        {formatTimestamp(update.timestamp)}
                      </span>
                    </div>

                    {/* Headline */}
                    <h2 className="text-base font-medium text-zinc-200 group-hover:text-white transition-colors leading-snug">
                      {update.title}
                    </h2>

                    {/* Content Body */}
                    <div className="text-sm text-zinc-500 leading-relaxed whitespace-pre-wrap font-sans">
                      {displayContent}
                      {shouldTruncate && (
                        <button
                          onClick={() => toggleExpand(update.id)}
                          className="text-zinc-300 hover:text-white transition-colors ml-1 focus:outline-none underline underline-offset-2"
                        >
                          {isExpanded ? 'less' : 'more'}
                        </button>
                      )}
                    </div>

                    {/* Footer Action Links */}
                    {update.url && (
                      <div className="flex justify-start pt-1">
                        <a
                          href={update.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-0.5 text-xs font-mono text-zinc-600 hover:text-zinc-300 transition-colors uppercase tracking-widest"
                        >
                          <span>view</span>
                          <ArrowUpRight className="w-3 h-3" />
                        </a>
                      </div>
                    )}
                  </motion.article>
                );
              })
            ) : (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="text-center py-20"
              >
                <p className="text-sm text-zinc-700 font-mono uppercase tracking-widest">
                  no active entries in this index
                </p>
              </motion.div>
            )}
          </AnimatePresence>
        </main>

        <footer className="mt-32 text-left text-[10px] font-mono text-zinc-700 uppercase tracking-widest">
          sidra pulse
        </footer>
      </div>
    </div>
  );
}
