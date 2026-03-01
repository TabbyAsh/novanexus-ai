'use client';

import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import DashboardLayout from '@/components/dashboard/DashboardLayout';
import GlassCard, { GradientText } from '@/components/ui/GlassCard';
import { api } from '@/lib/api';

// ================================================================
// CONTENT ENGINE — Auto-generates content from platform activity
// Trade recaps, market insights, performance reports, social posts
// ================================================================

type ContentType = 'all' | 'trade-recap' | 'market-insight' | 'performance' | 'social';
type DraftStatus = 'draft' | 'ready' | 'published';

interface ContentDraft {
  id: string;
  type: ContentType;
  title: string;
  body: string;
  status: DraftStatus;
  generatedAt: string;
  tags: string[];
}

const CONTENT_TYPES: { id: ContentType; label: string; icon: string; color: string }[] = [
  { id: 'all', label: 'All', icon: '📋', color: 'text-white' },
  { id: 'trade-recap', label: 'Trade Recaps', icon: '📊', color: 'text-green-400' },
  { id: 'market-insight', label: 'Market Insights', icon: '💡', color: 'text-cyan-400' },
  { id: 'performance', label: 'Performance', icon: '📈', color: 'text-purple-400' },
  { id: 'social', label: 'Social Posts', icon: '📣', color: 'text-pink-400' },
];

const STATUS_COLORS: Record<DraftStatus, string> = {
  draft: 'bg-gray-500/20 text-gray-400',
  ready: 'bg-green-500/20 text-green-400',
  published: 'bg-cyan-500/20 text-cyan-400',
};


export default function ContentEnginePage() {
  const [activeType, setActiveType] = useState<ContentType>('all');
  const [drafts, setDrafts] = useState<ContentDraft[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatingType, setGeneratingType] = useState<ContentType | null>(null);

  // Fetch existing drafts
  useEffect(() => {
    (async () => {
      try {
        const res = await api.getContentDrafts();
        if (res.success && res.data?.drafts?.length) {
          setDrafts(res.data.drafts as ContentDraft[]);
        }
      } catch {
        // keep seed data
      }
    })();
  }, []);

  const handleGenerate = useCallback(async (type: ContentType) => {
    setIsGenerating(true);
    setGeneratingType(type);
    try {
      const res = await api.generateContent(type === 'all' ? 'market-insight' : type);
      if (res.success && res.data?.draft) {
        setDrafts((prev) => [res.data!.draft as ContentDraft, ...prev]);
      }
    } catch {
      // silent
    } finally {
      setIsGenerating(false);
      setGeneratingType(null);
    }
  }, []);

  const filtered = drafts.filter((d) => activeType === 'all' || d.type === activeType);

  const stats = {
    total: drafts.length,
    ready: drafts.filter((d) => d.status === 'ready').length,
    published: drafts.filter((d) => d.status === 'published').length,
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header */}
        <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }}>
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-white">
                Content <GradientText>Engine</GradientText>
              </h1>
              <p className="text-gray-400 text-sm mt-1">
                Auto-generate content from your platform activity — trade recaps, insights, performance reports, social posts
              </p>
            </div>
            <button
              onClick={() => handleGenerate(activeType)}
              disabled={isGenerating}
              className="flex items-center gap-2 px-4 py-2 rounded-xl bg-gradient-to-r from-purple-500 to-pink-500 text-white text-sm font-medium hover:shadow-lg hover:shadow-purple-500/25 transition-all disabled:opacity-50"
            >
              {isGenerating ? (
                <motion.span animate={{ rotate: 360 }} transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}>⚡</motion.span>
              ) : (
                <span>⚡</span>
              )}
              {isGenerating ? 'Generating...' : 'Generate'}
            </button>
          </div>
        </motion.div>

        {/* Stats */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="grid grid-cols-3 gap-3"
        >
          {[
            { label: 'Total Drafts', value: stats.total, color: 'text-purple-400' },
            { label: 'Ready to Publish', value: stats.ready, color: 'text-green-400' },
            { label: 'Published', value: stats.published, color: 'text-cyan-400' },
          ].map((s) => (
            <div key={s.label} className="backdrop-blur-xl bg-white/[0.03] border border-white/10 rounded-xl p-3 text-center">
              <p className={`text-xl font-bold ${s.color}`}>{s.value}</p>
              <p className="text-gray-500 text-xs">{s.label}</p>
            </div>
          ))}
        </motion.div>

        {/* Type Tabs */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15 }}
          className="flex items-center gap-2 overflow-x-auto"
        >
          {CONTENT_TYPES.map((ct) => (
            <button
              key={ct.id}
              onClick={() => setActiveType(ct.id)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-sm font-medium transition-all ${
                activeType === ct.id
                  ? 'bg-white/15 border border-white/20 text-white'
                  : 'bg-white/5 text-gray-400 hover:bg-white/10 hover:text-white'
              }`}
            >
              <span>{ct.icon}</span>
              {ct.label}
            </button>
          ))}
        </motion.div>

        {/* Content Drafts */}
        <div className="space-y-3">
          <AnimatePresence mode="popLayout">
            {filtered.map((draft, i) => (
              <motion.div
                key={draft.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ delay: i * 0.05 }}
              >
                <GlassCard glowColor="purple" delay={0} className="!p-4">
                  <div className="flex items-start gap-4">
                    <div className="w-10 h-10 rounded-xl bg-white/5 flex items-center justify-center flex-shrink-0 text-lg">
                      {CONTENT_TYPES.find((ct) => ct.id === draft.type)?.icon || '📄'}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <h3 className="text-white font-medium text-sm truncate">{draft.title}</h3>
                        <span className={`text-[10px] px-1.5 py-0.5 rounded capitalize ${STATUS_COLORS[draft.status]}`}>
                          {draft.status}
                        </span>
                      </div>
                      <p className="text-gray-400 text-xs line-clamp-2 leading-relaxed">{draft.body}</p>
                      <div className="flex items-center gap-2 mt-2">
                        {draft.tags.map((t) => (
                          <span key={t} className="text-[10px] px-1.5 py-0.5 rounded bg-purple-500/10 text-purple-400">
                            {t}
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>
                </GlassCard>
              </motion.div>
            ))}
          </AnimatePresence>

          {filtered.length === 0 && (
            <div className="text-center text-gray-500 py-12">
              <p className="text-4xl mb-2">✨</p>
              <p className="text-sm">No content drafts yet. Hit Generate to create your first piece.</p>
            </div>
          )}
        </div>
      </div>
    </DashboardLayout>
  );
}
