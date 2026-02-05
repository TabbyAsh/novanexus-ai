'use client';

import { useEffect, useState, useCallback } from 'react';
import {
  Twitter,
  Linkedin,
  Instagram,
  Facebook,
  Users,
  TrendingUp,
  Eye,
  Heart,
  MessageCircle,
  Share2,
  Calendar,
  Sparkles,
  Clock,
  PlusCircle,
  Send,
  RefreshCw,
  CheckCircle,
  Edit3,
  Zap,
} from 'lucide-react';

// Types
interface SocialAccount {
  id: string;
  platform: string;
  account_name: string;
  follower_count: number;
  engagement_rate: number;
}

interface ContentPost {
  id: string;
  platform: string;
  content_type: string;
  content: string;
  status: string;
  scheduled_for: string | null;
  published_at: string | null;
  performance: {
    impressions: number;
    likes: number;
    comments: number;
    shares: number;
    engagement_rate: number;
  } | null;
}

interface ContentSuggestion {
  platform: string;
  content_type: string;
  suggested_content: string;
  suggested_hashtags: string[];
  optimal_time: string;
  predicted_engagement: number;
  reasoning: string;
}

interface Analytics {
  total_posts: number;
  total_impressions: number;
  total_engagement: number;
  avg_engagement_rate: number;
  platform_breakdown: Record<string, { posts: number; engagement: number }>;
  growth_trend: number;
}

// In production this must be set (e.g., https://socialbot.novanexus-ai.com)
const SOCIALBOT_URL = process.env.NEXT_PUBLIC_SOCIALBOT_URL || 'http://localhost:3012';

const PLATFORM_ICONS: Record<string, typeof Twitter> = {
  twitter: Twitter,
  linkedin: Linkedin,
  instagram: Instagram,
  facebook: Facebook,
};

const PLATFORM_COLORS: Record<string, string> = {
  twitter: 'bg-blue-500',
  linkedin: 'bg-blue-700',
  instagram: 'bg-gradient-to-r from-purple-500 to-pink-500',
  facebook: 'bg-blue-600',
};

export default function SocialHubDashboard() {
  const [accounts, setAccounts] = useState<SocialAccount[]>([]);
  const [posts, setPosts] = useState<ContentPost[]>([]);
  const [suggestions, setSuggestions] = useState<ContentSuggestion[]>([]);
  const [analytics, setAnalytics] = useState<Analytics | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'overview' | 'posts' | 'calendar' | 'create'>('overview');

  // Create post form
  const [newPostContent, setNewPostContent] = useState('');
  const [newPostPlatform, setNewPostPlatform] = useState('twitter');
  const [isCreating, setIsCreating] = useState(false);

  const loadData = useCallback(async () => {
    setIsLoading(true);
    try {
      const [accountsRes, postsRes, suggestionsRes, analyticsRes] = await Promise.all([
        fetch(`${SOCIALBOT_URL}/api/content/accounts`),
        fetch(`${SOCIALBOT_URL}/api/content/posts?limit=20`),
        fetch(`${SOCIALBOT_URL}/api/content/suggestions`),
        fetch(`${SOCIALBOT_URL}/api/content/analytics?days=30`),
      ]);

      const [accountsData, postsData, suggestionsData, analyticsData] = await Promise.all([
        accountsRes.json(),
        postsRes.json(),
        suggestionsRes.json(),
        analyticsRes.json(),
      ]);

      if (accountsData.success) setAccounts(accountsData.data.accounts);
      if (postsData.success) setPosts(postsData.data.posts);
      if (suggestionsData.success) setSuggestions(suggestionsData.data.suggestions);
      if (analyticsData.success) setAnalytics(analyticsData.data.analytics);
    } catch (error) {
      console.error('Failed to load social data:', error);
    }
    setIsLoading(false);
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const createPost = async () => {
    if (!newPostContent) return;

    setIsCreating(true);
    try {
      const res = await fetch(`${SOCIALBOT_URL}/api/content/posts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          platform: newPostPlatform,
          content: newPostContent,
          content_type: 'text',
        }),
      });

      const data = await res.json();
      if (data.success) {
        setNewPostContent('');
        loadData();
      }
    } catch (error) {
      console.error('Failed to create post:', error);
    }
    setIsCreating(false);
  };

  const applySuggestion = (suggestion: ContentSuggestion) => {
    setNewPostContent(suggestion.suggested_content);
    setNewPostPlatform(suggestion.platform);
    setActiveTab('create');
  };

  const formatNumber = (num: number) => {
    if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`;
    if (num >= 1000) return `${(num / 1000).toFixed(1)}K`;
    return num.toString();
  };

  const totalFollowers = accounts.reduce((sum, acc) => sum + acc.follower_count, 0);
  const avgEngagement = accounts.length > 0
    ? accounts.reduce((sum, acc) => sum + acc.engagement_rate, 0) / accounts.length
    : 0;

  return (
    <div className="p-8 bg-gray-950 min-h-screen">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold text-white">Social Media Command Center</h1>
          <p className="text-gray-400 mt-1">
            Manage content, track engagement, and grow your audience
          </p>
        </div>
        <button
          onClick={loadData}
          disabled={isLoading}
          className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition flex items-center gap-2"
        >
          <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      {/* Account Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
        {accounts.map((account) => {
          const Icon = PLATFORM_ICONS[account.platform] || Twitter;
          return (
            <div key={account.id} className="bg-gray-900 border border-gray-800 rounded-xl p-5">
              <div className="flex items-center gap-3 mb-3">
                <div className={`p-2 ${PLATFORM_COLORS[account.platform]} rounded-lg`}>
                  <Icon className="w-5 h-5 text-white" />
                </div>
                <div>
                  <p className="text-white font-medium">{account.account_name}</p>
                  <p className="text-gray-500 text-xs capitalize">{account.platform}</p>
                </div>
              </div>
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-2xl font-bold text-white">{formatNumber(account.follower_count)}</p>
                  <p className="text-gray-400 text-xs">Followers</p>
                </div>
                <div className="text-right">
                  <p className="text-lg font-semibold text-green-400">{account.engagement_rate.toFixed(1)}%</p>
                  <p className="text-gray-400 text-xs">Engagement</p>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Stats Summary */}
      <div className="grid grid-cols-1 md:grid-cols-5 gap-4 mb-8">
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2 bg-purple-500/20 rounded-lg">
              <Users className="w-5 h-5 text-purple-400" />
            </div>
            <span className="text-gray-400 text-sm">Total Followers</span>
          </div>
          <p className="text-2xl font-bold text-white">{formatNumber(totalFollowers)}</p>
        </div>

        <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2 bg-green-500/20 rounded-lg">
              <TrendingUp className="w-5 h-5 text-green-400" />
            </div>
            <span className="text-gray-400 text-sm">Avg Engagement</span>
          </div>
          <p className="text-2xl font-bold text-green-400">{avgEngagement.toFixed(1)}%</p>
        </div>

        <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2 bg-blue-500/20 rounded-lg">
              <Eye className="w-5 h-5 text-blue-400" />
            </div>
            <span className="text-gray-400 text-sm">30-Day Impressions</span>
          </div>
          <p className="text-2xl font-bold text-white">{formatNumber(analytics?.total_impressions || 0)}</p>
        </div>

        <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2 bg-pink-500/20 rounded-lg">
              <Heart className="w-5 h-5 text-pink-400" />
            </div>
            <span className="text-gray-400 text-sm">Total Engagement</span>
          </div>
          <p className="text-2xl font-bold text-white">{formatNumber(analytics?.total_engagement || 0)}</p>
        </div>

        <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2 bg-yellow-500/20 rounded-lg">
              <Calendar className="w-5 h-5 text-yellow-400" />
            </div>
            <span className="text-gray-400 text-sm">Posts (30 days)</span>
          </div>
          <p className="text-2xl font-bold text-white">{analytics?.total_posts || 0}</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 mb-6">
        {[
          { id: 'overview', label: 'Overview', icon: Eye },
          { id: 'posts', label: 'Posts', icon: Edit3 },
          { id: 'create', label: 'Create', icon: PlusCircle },
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id as typeof activeTab)}
            className={`px-4 py-2 rounded-lg font-medium transition flex items-center gap-2 ${
              activeTab === tab.id
                ? 'bg-blue-600 text-white'
                : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
            }`}
          >
            <tab.icon className="w-4 h-4" />
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {activeTab === 'overview' && (
          <>
            {/* AI Suggestions */}
            <div className="lg:col-span-2 bg-gray-900 border border-gray-800 rounded-xl p-6">
              <h2 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-yellow-400" />
                AI Content Suggestions
              </h2>

              <div className="space-y-4">
                {suggestions.map((suggestion, idx) => {
                  const Icon = PLATFORM_ICONS[suggestion.platform] || Twitter;
                  return (
                    <div key={idx} className="p-4 bg-gray-800 rounded-lg">
                      <div className="flex items-start justify-between mb-3">
                        <div className="flex items-center gap-2">
                          <div className={`p-1.5 ${PLATFORM_COLORS[suggestion.platform]} rounded`}>
                            <Icon className="w-4 h-4 text-white" />
                          </div>
                          <span className="text-white font-medium capitalize">{suggestion.platform}</span>
                          <span className="text-gray-500 text-sm">• {suggestion.content_type}</span>
                        </div>
                        <div className="flex items-center gap-2 text-sm">
                          <Clock className="w-4 h-4 text-gray-400" />
                          <span className="text-gray-400">
                            {new Date(suggestion.optimal_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </span>
                        </div>
                      </div>

                      <p className="text-gray-300 text-sm mb-3">{suggestion.suggested_content}</p>

                      <div className="flex flex-wrap gap-2 mb-3">
                        {suggestion.suggested_hashtags.map((tag, i) => (
                          <span key={i} className="px-2 py-0.5 bg-blue-500/20 text-blue-400 text-xs rounded">
                            {tag}
                          </span>
                        ))}
                      </div>

                      <div className="flex items-center justify-between">
                        <span className="text-gray-500 text-xs">{suggestion.reasoning}</span>
                        <button
                          onClick={() => applySuggestion(suggestion)}
                          className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-sm rounded-lg transition flex items-center gap-1"
                        >
                          <Zap className="w-3 h-3" />
                          Use This
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Recent Activity */}
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
              <h2 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
                <Clock className="w-5 h-5 text-blue-400" />
                Recent Activity
              </h2>

              <div className="space-y-3">
                {posts.slice(0, 5).map((post) => {
                  const Icon = PLATFORM_ICONS[post.platform] || Twitter;
                  return (
                    <div key={post.id} className="p-3 bg-gray-800 rounded-lg">
                      <div className="flex items-center gap-2 mb-2">
                        <Icon className="w-4 h-4 text-gray-400" />
                        <span className={`px-2 py-0.5 rounded text-xs ${
                          post.status === 'published' ? 'bg-green-500/20 text-green-400' :
                          post.status === 'scheduled' ? 'bg-blue-500/20 text-blue-400' :
                          'bg-gray-500/20 text-gray-400'
                        }`}>
                          {post.status}
                        </span>
                      </div>
                      <p className="text-gray-300 text-sm line-clamp-2">{post.content}</p>
                      {post.performance && (
                        <div className="flex gap-4 mt-2 text-xs text-gray-500">
                          <span className="flex items-center gap-1">
                            <Heart className="w-3 h-3" /> {post.performance.likes}
                          </span>
                          <span className="flex items-center gap-1">
                            <MessageCircle className="w-3 h-3" /> {post.performance.comments}
                          </span>
                          <span className="flex items-center gap-1">
                            <Share2 className="w-3 h-3" /> {post.performance.shares}
                          </span>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </>
        )}

        {activeTab === 'posts' && (
          <div className="lg:col-span-3 bg-gray-900 border border-gray-800 rounded-xl p-6">
            <h2 className="text-lg font-semibold text-white mb-4">All Posts</h2>

            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="text-left text-gray-400 text-sm border-b border-gray-800">
                    <th className="pb-3">Platform</th>
                    <th className="pb-3">Content</th>
                    <th className="pb-3">Status</th>
                    <th className="pb-3">Date</th>
                    <th className="pb-3">Performance</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-800">
                  {posts.map((post) => {
                    const Icon = PLATFORM_ICONS[post.platform] || Twitter;
                    return (
                      <tr key={post.id} className="text-white">
                        <td className="py-3">
                          <div className="flex items-center gap-2">
                            <Icon className="w-4 h-4 text-gray-400" />
                            <span className="capitalize">{post.platform}</span>
                          </div>
                        </td>
                        <td className="py-3 max-w-md">
                          <p className="text-gray-300 text-sm truncate">{post.content}</p>
                        </td>
                        <td className="py-3">
                          <span className={`px-2 py-1 rounded text-xs ${
                            post.status === 'published' ? 'bg-green-500/20 text-green-400' :
                            post.status === 'scheduled' ? 'bg-blue-500/20 text-blue-400' :
                            post.status === 'draft' ? 'bg-yellow-500/20 text-yellow-400' :
                            'bg-gray-500/20 text-gray-400'
                          }`}>
                            {post.status}
                          </span>
                        </td>
                        <td className="py-3 text-gray-400 text-sm">
                          {post.published_at
                            ? new Date(post.published_at).toLocaleDateString()
                            : post.scheduled_for
                            ? `Scheduled: ${new Date(post.scheduled_for).toLocaleDateString()}`
                            : '-'
                          }
                        </td>
                        <td className="py-3">
                          {post.performance ? (
                            <div className="flex gap-3 text-sm text-gray-400">
                              <span>{formatNumber(post.performance.impressions)} views</span>
                              <span>{post.performance.engagement_rate.toFixed(1)}% eng</span>
                            </div>
                          ) : (
                            <span className="text-gray-500 text-sm">-</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {activeTab === 'create' && (
          <div className="lg:col-span-2 bg-gray-900 border border-gray-800 rounded-xl p-6">
            <h2 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
              <PlusCircle className="w-5 h-5 text-green-400" />
              Create New Post
            </h2>

            <div className="space-y-4">
              <div>
                <label className="block text-sm text-gray-400 mb-2">Platform</label>
                <div className="flex gap-2">
                  {['twitter', 'linkedin', 'instagram', 'facebook'].map((platform) => {
                    const Icon = PLATFORM_ICONS[platform];
                    return (
                      <button
                        key={platform}
                        onClick={() => setNewPostPlatform(platform)}
                        className={`p-3 rounded-lg transition ${
                          newPostPlatform === platform
                            ? `${PLATFORM_COLORS[platform]} text-white`
                            : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
                        }`}
                      >
                        <Icon className="w-5 h-5" />
                      </button>
                    );
                  })}
                </div>
              </div>

              <div>
                <label className="block text-sm text-gray-400 mb-2">Content</label>
                <textarea
                  value={newPostContent}
                  onChange={(e) => setNewPostContent(e.target.value)}
                  placeholder="What's on your mind?"
                  rows={5}
                  className="w-full px-4 py-3 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:border-blue-500 focus:outline-none resize-none"
                />
                <div className="flex justify-between mt-2 text-sm">
                  <span className="text-gray-500">{newPostContent.length} characters</span>
                  <span className={`${
                    newPostPlatform === 'twitter' && newPostContent.length > 280
                      ? 'text-red-400'
                      : 'text-gray-500'
                  }`}>
                    {newPostPlatform === 'twitter' ? `${280 - newPostContent.length} remaining` : ''}
                  </span>
                </div>
              </div>

              <div className="flex gap-3">
                <button
                  onClick={createPost}
                  disabled={!newPostContent || isCreating}
                  className="px-6 py-3 bg-green-600 hover:bg-green-700 disabled:bg-green-600/50 text-white rounded-lg font-medium transition flex items-center gap-2"
                >
                  {isCreating ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin" />
                      Creating...
                    </>
                  ) : (
                    <>
                      <CheckCircle className="w-4 h-4" />
                      Save as Draft
                    </>
                  )}
                </button>
                <button
                  disabled={!newPostContent}
                  className="px-6 py-3 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-600/50 text-white rounded-lg font-medium transition flex items-center gap-2"
                >
                  <Send className="w-4 h-4" />
                  Schedule
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
