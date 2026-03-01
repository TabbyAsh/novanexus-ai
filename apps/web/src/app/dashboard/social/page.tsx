'use client';

import { useEffect, useState, useCallback } from 'react';
import { api } from '@/lib/api';
import DashboardLayout from '@/components/dashboard/DashboardLayout';
import {
  Video, FileText, TrendingUp, Heart, MessageCircle, Share2,
  Eye, AlertTriangle, RefreshCw, Calendar, CheckCircle, Clock,
  Smile, Meh, Frown, Sparkles, Download, ChevronDown, Hash,
  Zap, Target, PenTool,
} from 'lucide-react';

// ================================================================
// Types
// ================================================================

interface Post {
  id: string;
  channel: string;
  title: string;
  status: string;
  scheduledAt?: string;
  publishedAt?: string;
  createdAt: string;
}

interface GeneratedPost {
  id: string;
  platform: string;
  contentType: string;
  caption: string;
  hashtags: string[];
  imagePrompt?: string;
  optimalTime: string;
  dayOfWeek: string;
  predictedEngagement: number;
}

interface ContentPlan {
  id: string;
  name: string;
  frequency: string;
  platforms: string[];
  niche: string;
  posts: GeneratedPost[];
  createdAt: string;
}

interface PlanSummary {
  id: string;
  name: string;
  frequency: string;
  platforms: string[];
  niche: string;
  postCount: number;
  createdAt: string;
}

interface SentimentAnalysis {
  overall: string;
  score: number;
  breakdown: { positive: number; neutral: number; negative: number };
  trending: string[];
}

interface EngagementMetrics {
  totalViews: number;
  totalLikes: number;
  totalComments: number;
  totalShares: number;
  averageEngagementRate: number;
  topPosts: Array<{ id: string; title: string; engagementRate: number }>;
}

type Tab = 'planner' | 'posts' | 'sentiment' | 'engagement';

const PLATFORMS = [
  { id: 'twitter', label: 'Twitter/X', icon: '🐦' },
  { id: 'instagram', label: 'Instagram', icon: '📸' },
  { id: 'tiktok', label: 'TikTok', icon: '🎵' },
  { id: 'youtube', label: 'YouTube', icon: '📺' },
  { id: 'linkedin', label: 'LinkedIn', icon: '💼' },
  { id: 'facebook', label: 'Facebook', icon: '📘' },
];

const FREQUENCIES = ['daily', '3x-week', 'weekly', 'biweekly'];

function getChannelIcon(ch: string) {
  return PLATFORMS.find(p => p.id === ch.toLowerCase())?.icon || '📱';
}

function getStatusColor(s: string) {
  switch (s) {
    case 'PUBLISHED': return 'text-green-400 bg-green-500/20';
    case 'SCHEDULED': return 'text-blue-400 bg-blue-500/20';
    case 'READY': return 'text-yellow-400 bg-yellow-500/20';
    default: return 'text-gray-400 bg-gray-500/20';
  }
}

// ================================================================
// Component
// ================================================================

export default function SocialPage() {
  const [activeTab, setActiveTab] = useState<Tab>('planner');

  // Content Plan Generator
  const [planName, setPlanName] = useState('');
  const [planNiche, setPlanNiche] = useState('');
  const [planFrequency, setPlanFrequency] = useState('daily');
  const [planPlatforms, setPlanPlatforms] = useState<string[]>(['twitter', 'instagram']);
  const [planDays, setPlanDays] = useState(7);
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedPlan, setGeneratedPlan] = useState<ContentPlan | null>(null);
  const [isExporting, setIsExporting] = useState(false);
  const [exportMsg, setExportMsg] = useState('');

  // Saved plans
  const [savedPlans, setSavedPlans] = useState<PlanSummary[]>([]);
  const [selectedPlan, setSelectedPlan] = useState<ContentPlan | null>(null);

  // Posts (existing)
  const [posts, setPosts] = useState<Post[]>([]);
  const [postsError, setPostsError] = useState<string | null>(null);

  // Sentiment
  const [sentiment, setSentiment] = useState<SentimentAnalysis | null>(null);

  // Engagement
  const [engagement, setEngagement] = useState<EngagementMetrics | null>(null);

  const [isLoading, setIsLoading] = useState(true);

  // Load existing data on mount
  useEffect(() => {
    (async () => {
      setIsLoading(true);
      await Promise.all([
        api.getPosts().then(r => { if (r.success && r.data?.posts) setPosts(r.data.posts); else setPostsError(r.error?.message || 'Posts unavailable'); }),
        api.getSentimentAnalysis().then(r => { if (r.success && r.data?.analysis) setSentiment(r.data.analysis); }),
        api.getEngagementMetrics().then(r => { if (r.success && r.data?.metrics) setEngagement(r.data.metrics); }),
        api.getSocialPlans().then(r => { if (r.success && r.data?.plans) setSavedPlans(r.data.plans); }),
      ]);
      setIsLoading(false);
    })();
  }, []);

  // Toggle platform
  const togglePlatform = (id: string) => {
    setPlanPlatforms(prev => prev.includes(id) ? prev.filter(p => p !== id) : [...prev, id]);
  };

  // Generate plan
  const handleGenerate = async () => {
    if (!planNiche.trim() || planPlatforms.length === 0) return;
    setIsGenerating(true);
    setGeneratedPlan(null);
    try {
      const res = await api.generateSocialPlan({
        name: planName || `${planNiche} Plan`,
        niche: planNiche,
        frequency: planFrequency,
        platforms: planPlatforms,
        days: planDays,
      });
      if (res.success && res.data?.plan) {
        setGeneratedPlan(res.data.plan as ContentPlan);
        // Refresh saved plans
        const plansRes = await api.getSocialPlans();
        if (plansRes.success && plansRes.data?.plans) setSavedPlans(plansRes.data.plans);
      }
    } catch { /* ok */ }
    finally { setIsGenerating(false); }
  };

  // Export plan as CSV
  const handleExport = async (planId: string) => {
    setIsExporting(true);
    setExportMsg('');
    try {
      const res = await api.exportSocialPlan(planId);
      if (res.success && res.data?.csv) {
        const blob = new Blob([res.data.csv], { type: 'text/csv' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url; a.download = `content-plan-${planId}.csv`; a.click();
        URL.revokeObjectURL(url);
        setExportMsg('CSV downloaded!');
      } else {
        setExportMsg('Export failed');
      }
    } catch { setExportMsg('Export failed'); }
    finally { setIsExporting(false); }
  };

  // Load a saved plan
  const handleLoadPlan = async (planId: string) => {
    try {
      const res = await api.getSocialPlan(planId);
      if (res.success && res.data?.plan) setSelectedPlan(res.data.plan as ContentPlan);
    } catch { /* ok */ }
  };

  const displayPlan = generatedPlan || selectedPlan;

  const formatNum = (n: number) => { const v = n ?? 0; return v >= 1000000 ? `${(v / 1000000).toFixed(1)}M` : v >= 1000 ? `${(v / 1000).toFixed(1)}K` : v.toString(); };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-white">Social <span className="bg-gradient-to-r from-violet-400 to-purple-400 bg-clip-text text-transparent">Command</span></h1>
            <p className="text-gray-400 mt-1">Generate content plans → Schedule posts → Track engagement → Export CSV</p>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-2">
          {([
            { id: 'planner' as Tab, label: 'Content Planner', icon: Sparkles },
            { id: 'posts' as Tab, label: `Posts (${posts.length})`, icon: FileText },
            { id: 'sentiment' as Tab, label: 'Sentiment', icon: Heart },
            { id: 'engagement' as Tab, label: 'Engagement', icon: TrendingUp },
          ]).map(tab => (
            <button key={tab.id} onClick={() => setActiveTab(tab.id)}
              className={`px-4 py-2 rounded-lg font-medium transition flex items-center gap-2 ${activeTab === tab.id ? 'bg-violet-600 text-white' : 'bg-gray-800 text-gray-400 hover:bg-gray-700'}`}>
              <tab.icon className="w-4 h-4" /> {tab.label}
            </button>
          ))}
        </div>

        {/* ========== CONTENT PLANNER TAB ========== */}
        {activeTab === 'planner' && (
          <div className="space-y-6">
            {/* Generator Form */}
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
              <h2 className="text-lg font-semibold text-white mb-2 flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-violet-400" /> AI Content Plan Generator
              </h2>
              <p className="text-gray-400 text-sm mb-5">Define your niche and platforms — Nova generates a full content calendar with captions, hashtags, and optimal posting times.</p>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                <div>
                  <label className="text-sm text-gray-400 block mb-1">Plan Name (optional)</label>
                  <input type="text" value={planName} onChange={e => setPlanName(e.target.value)}
                    placeholder="e.g. Q1 Growth Push"
                    className="w-full px-4 py-2.5 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-violet-500" />
                </div>
                <div>
                  <label className="text-sm text-gray-400 block mb-1">Niche / Topic *</label>
                  <input type="text" value={planNiche} onChange={e => setPlanNiche(e.target.value)}
                    placeholder="e.g. Reselling sneakers, AI tech, Fitness coaching..."
                    className="w-full px-4 py-2.5 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-violet-500" />
                </div>
              </div>

              {/* Platforms */}
              <div className="mb-4">
                <label className="text-sm text-gray-400 block mb-2">Target Platforms *</label>
                <div className="flex flex-wrap gap-2">
                  {PLATFORMS.map(p => (
                    <button key={p.id} onClick={() => togglePlatform(p.id)}
                      className={`px-3 py-2 rounded-lg text-sm transition flex items-center gap-2 ${planPlatforms.includes(p.id) ? 'bg-violet-600 text-white' : 'bg-gray-800 text-gray-400 hover:bg-gray-700'}`}>
                      <span>{p.icon}</span> {p.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4 mb-5">
                <div>
                  <label className="text-sm text-gray-400 block mb-1">Frequency</label>
                  <select value={planFrequency} onChange={e => setPlanFrequency(e.target.value)}
                    className="w-full px-4 py-2.5 bg-gray-800 border border-gray-700 rounded-lg text-white focus:outline-none focus:border-violet-500">
                    {FREQUENCIES.map(f => <option key={f} value={f}>{f}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-sm text-gray-400 block mb-1">Days to Plan</label>
                  <input type="number" value={planDays} onChange={e => setPlanDays(Number(e.target.value))} min={1} max={90}
                    className="w-full px-4 py-2.5 bg-gray-800 border border-gray-700 rounded-lg text-white focus:outline-none focus:border-violet-500" />
                </div>
              </div>

              <button onClick={handleGenerate} disabled={isGenerating || !planNiche.trim() || planPlatforms.length === 0}
                className="w-full py-3 bg-gradient-to-r from-violet-500 to-purple-600 text-white font-semibold rounded-xl hover:shadow-lg hover:shadow-violet-500/20 disabled:opacity-50 transition flex items-center justify-center gap-2">
                {isGenerating ? <RefreshCw className="w-5 h-5 animate-spin" /> : <Sparkles className="w-5 h-5" />}
                {isGenerating ? 'Generating Content Plan...' : 'Generate Content Plan'}
              </button>
            </div>

            {/* Generated / Selected Plan Display */}
            {displayPlan && (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-xl font-bold text-white">{displayPlan.name}</h3>
                  <div className="flex items-center gap-3">
                    <span className="text-sm text-gray-400">{displayPlan.posts.length} posts</span>
                    <button onClick={() => handleExport(displayPlan.id)} disabled={isExporting}
                      className="px-4 py-2 bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white rounded-lg transition flex items-center gap-2 text-sm">
                      <Download className="w-4 h-4" /> {isExporting ? 'Exporting...' : 'Export CSV'}
                    </button>
                  </div>
                </div>
                {exportMsg && <p className="text-sm text-green-400">{exportMsg}</p>}

                <div className="space-y-3">
                  {displayPlan.posts.map((post, idx) => (
                    <div key={post.id || idx} className="bg-gray-900 border border-gray-800 rounded-xl p-4">
                      <div className="flex items-start justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <span className="text-lg">{getChannelIcon(post.platform)}</span>
                          <span className="text-white font-medium capitalize">{post.platform}</span>
                          <span className="px-2 py-0.5 bg-gray-800 rounded text-xs text-gray-400 capitalize">{post.contentType}</span>
                        </div>
                        <div className="flex items-center gap-2 text-sm">
                          <Calendar className="w-3 h-3 text-gray-500" />
                          <span className="text-gray-400">{post.dayOfWeek} {post.optimalTime}</span>
                          <span className="px-2 py-0.5 bg-violet-500/20 text-violet-300 rounded text-xs">
                            {post.predictedEngagement ?? 0}% est. engagement
                          </span>
                        </div>
                      </div>
                      <p className="text-gray-200 text-sm leading-relaxed mb-2">{post.caption}</p>
                      {(post.hashtags?.length ?? 0) > 0 && (
                        <div className="flex flex-wrap gap-1">
                          {(post.hashtags ?? []).map((tag, i) => (
                            <span key={i} className="px-2 py-0.5 bg-blue-500/20 text-blue-300 rounded text-xs">#{tag}</span>
                          ))}
                        </div>
                      )}
                      {post.imagePrompt && (
                        <p className="text-xs text-gray-500 mt-2 italic">Image idea: {post.imagePrompt}</p>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Saved Plans */}
            {savedPlans.length > 0 && (
              <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
                <h3 className="text-white font-semibold mb-4 flex items-center gap-2">
                  <FileText className="w-5 h-5 text-purple-400" /> Saved Plans
                </h3>
                <div className="space-y-2">
                  {savedPlans.map(plan => (
                    <div key={plan.id} className="flex items-center justify-between p-3 bg-gray-800 rounded-lg hover:bg-gray-700/80 transition">
                      <div>
                        <p className="text-white font-medium">{plan.name}</p>
                        <div className="flex items-center gap-3 mt-1 text-xs text-gray-500">
                          <span>{plan.niche}</span>
                          <span>{plan.postCount} posts</span>
                          <span>{plan.frequency}</span>
                          <span>{new Date(plan.createdAt).toLocaleDateString()}</span>
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <button onClick={() => handleLoadPlan(plan.id)}
                          className="px-3 py-1.5 bg-violet-600/50 hover:bg-violet-600 text-white text-xs rounded-lg transition">View</button>
                        <button onClick={() => handleExport(plan.id)}
                          className="px-3 py-1.5 bg-green-600/50 hover:bg-green-600 text-white text-xs rounded-lg transition flex items-center gap-1">
                          <Download className="w-3 h-3" /> CSV
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ========== POSTS TAB ========== */}
        {activeTab === 'posts' && (
          <div>
            {isLoading ? (
              <div className="bg-gray-900 border border-gray-800 rounded-xl p-8 text-center text-gray-500">Loading posts...</div>
            ) : postsError ? (
              <div className="bg-gray-900 border border-gray-800 rounded-xl p-8 text-center text-gray-500">
                <AlertTriangle className="w-12 h-12 mx-auto mb-4 opacity-50" />
                <p>{postsError}</p>
              </div>
            ) : posts.length === 0 ? (
              <div className="bg-gray-900 border border-gray-800 rounded-xl p-8 text-center text-gray-500">
                <FileText className="w-12 h-12 mx-auto mb-4 opacity-50" />
                <p>No posts yet</p>
                <p className="text-sm mt-1">Generate a content plan to get started</p>
                <button onClick={() => setActiveTab('planner')} className="mt-4 px-4 py-2 bg-violet-600 text-white rounded-lg hover:bg-violet-700 transition">
                  Go to Content Planner
                </button>
              </div>
            ) : (
              <div className="space-y-3">
                {posts.map(post => (
                  <div key={post.id} className="bg-gray-900 border border-gray-800 rounded-xl p-4">
                    <div className="flex items-center gap-4">
                      <div className="text-2xl">{getChannelIcon(post.channel)}</div>
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-white">{post.title}</span>
                          <span className={`px-2 py-0.5 rounded text-xs ${getStatusColor(post.status)}`}>{post.status}</span>
                        </div>
                        <div className="flex items-center gap-4 mt-1 text-sm text-gray-500">
                          <span>{post.channel}</span>
                          {post.scheduledAt && <span className="flex items-center gap-1"><Clock className="w-3 h-3" /> {new Date(post.scheduledAt).toLocaleString()}</span>}
                          {post.publishedAt && <span className="flex items-center gap-1"><CheckCircle className="w-3 h-3" /> {new Date(post.publishedAt).toLocaleString()}</span>}
                        </div>
                      </div>
                      <div className="text-sm text-gray-500">{new Date(post.createdAt).toLocaleDateString()}</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ========== SENTIMENT TAB ========== */}
        {activeTab === 'sentiment' && (
          <div>
            {!sentiment ? (
              <div className="bg-gray-900 border border-gray-800 rounded-xl p-8 text-center text-gray-500">
                <Heart className="w-12 h-12 mx-auto mb-4 opacity-50" />
                <p>Sentiment analysis will appear once content is published</p>
              </div>
            ) : (
              <div className="space-y-6">
                <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
                  <div className="flex items-center gap-4 mb-6">
                    {sentiment.overall === 'positive' ? <Smile className="w-8 h-8 text-green-400" /> : sentiment.overall === 'negative' ? <Frown className="w-8 h-8 text-red-400" /> : <Meh className="w-8 h-8 text-yellow-400" />}
                    <div>
                      <h3 className="text-lg font-semibold text-white capitalize">{sentiment.overall} Sentiment</h3>
                      <p className="text-sm text-gray-400">Score: {sentiment.score}/100</p>
                    </div>
                  </div>
                  <div className="grid grid-cols-3 gap-4">
                    <div className="p-4 bg-green-500/10 border border-green-500/30 rounded-lg text-center">
                      <p className="text-2xl font-bold text-green-400">{sentiment.breakdown.positive}%</p>
                      <p className="text-sm text-gray-400">Positive</p>
                    </div>
                    <div className="p-4 bg-yellow-500/10 border border-yellow-500/30 rounded-lg text-center">
                      <p className="text-2xl font-bold text-yellow-400">{sentiment.breakdown.neutral}%</p>
                      <p className="text-sm text-gray-400">Neutral</p>
                    </div>
                    <div className="p-4 bg-red-500/10 border border-red-500/30 rounded-lg text-center">
                      <p className="text-2xl font-bold text-red-400">{sentiment.breakdown.negative}%</p>
                      <p className="text-sm text-gray-400">Negative</p>
                    </div>
                  </div>
                </div>
                {sentiment.trending.length > 0 && (
                  <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
                    <h3 className="text-white font-semibold mb-3">Trending Topics</h3>
                    <div className="flex flex-wrap gap-2">
                      {sentiment.trending.map((t, i) => (
                        <span key={i} className="px-3 py-1 bg-blue-500/20 text-blue-400 rounded-full text-sm">#{t}</span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* ========== ENGAGEMENT TAB ========== */}
        {activeTab === 'engagement' && (
          <div>
            {!engagement ? (
              <div className="bg-gray-900 border border-gray-800 rounded-xl p-8 text-center text-gray-500">
                <TrendingUp className="w-12 h-12 mx-auto mb-4 opacity-50" />
                <p>Engagement metrics will appear once content is published</p>
              </div>
            ) : (
              <div className="space-y-6">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  {[
                    { label: 'Views', value: formatNum(engagement.totalViews), icon: Eye, color: 'text-blue-400' },
                    { label: 'Likes', value: formatNum(engagement.totalLikes), icon: Heart, color: 'text-red-400' },
                    { label: 'Comments', value: formatNum(engagement.totalComments), icon: MessageCircle, color: 'text-green-400' },
                    { label: 'Shares', value: formatNum(engagement.totalShares), icon: Share2, color: 'text-purple-400' },
                  ].map(m => (
                    <div key={m.label} className="bg-gray-900 border border-gray-800 rounded-xl p-4">
                      <div className="flex items-center gap-2 mb-2">
                        <m.icon className={`w-5 h-5 ${m.color}`} />
                        <span className="text-sm text-gray-400">{m.label}</span>
                      </div>
                      <p className="text-2xl font-bold text-white">{m.value}</p>
                    </div>
                  ))}
                </div>
                {engagement.topPosts.length > 0 && (
                  <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
                    <h3 className="text-white font-semibold mb-4">Top Performing Posts</h3>
                    <div className="space-y-3">
                      {engagement.topPosts.map((post, i) => (
                        <div key={post.id} className="flex items-center gap-4 p-3 bg-gray-800 rounded-lg">
                          <span className="text-lg font-bold text-gray-500">#{i + 1}</span>
                          <span className="flex-1 text-white">{post.title}</span>
                          <span className="text-green-400 font-medium">{(post.engagementRate ?? 0).toFixed(1)}%</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
