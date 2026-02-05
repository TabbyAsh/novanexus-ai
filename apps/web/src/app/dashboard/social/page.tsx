'use client';

import { useEffect, useState, useCallback } from 'react';
import { api } from '@/lib/api';
import {
  Video,
  FileText,
  TrendingUp,
  Heart,
  MessageCircle,
  Share2,
  Eye,
  AlertTriangle,
  RefreshCw,
  Calendar,
  CheckCircle,
  Clock,
  Smile,
  Meh,
  Frown,
} from 'lucide-react';

interface Post {
  id: string;
  channel: string;
  title: string;
  status: string;
  scheduledAt?: string;
  publishedAt?: string;
  createdAt: string;
}

interface SentimentAnalysis {
  overall: string;
  score: number;
  breakdown: {
    positive: number;
    neutral: number;
    negative: number;
  };
  trending: string[];
}

interface EngagementMetrics {
  totalViews: number;
  totalLikes: number;
  totalComments: number;
  totalShares: number;
  averageEngagementRate: number;
  topPosts: Array<{
    id: string;
    title: string;
    engagementRate: number;
  }>;
}

interface SocialAlert {
  id: string;
  type: string;
  message: string;
  severity: string;
  createdAt: string;
}

function getStatusColor(status: string) {
  switch (status) {
    case 'PUBLISHED': return 'text-green-400 bg-green-500/20';
    case 'SCHEDULED': return 'text-blue-400 bg-blue-500/20';
    case 'READY': return 'text-yellow-400 bg-yellow-500/20';
    case 'DRAFTING': return 'text-gray-400 bg-gray-500/20';
    case 'IDEA': return 'text-purple-400 bg-purple-500/20';
    case 'ARCHIVED': return 'text-gray-500 bg-gray-600/20';
    default: return 'text-gray-400 bg-gray-500/20';
  }
}

function getChannelIcon(channel: string) {
  switch (channel.toLowerCase()) {
    case 'youtube': return '📺';
    case 'twitter': return '🐦';
    case 'instagram': return '📸';
    case 'tiktok': return '🎵';
    case 'linkedin': return '💼';
    case 'blog': return '📝';
    default: return '📱';
  }
}

function getSentimentIcon(sentiment: string) {
  switch (sentiment.toLowerCase()) {
    case 'positive': return <Smile className="w-6 h-6 text-green-400" />;
    case 'neutral': return <Meh className="w-6 h-6 text-yellow-400" />;
    case 'negative': return <Frown className="w-6 h-6 text-red-400" />;
    default: return <Meh className="w-6 h-6 text-gray-400" />;
  }
}

export default function SocialPage() {
  const [activeTab, setActiveTab] = useState<'posts' | 'sentiment' | 'engagement' | 'alerts'>('posts');
  const [posts, setPosts] = useState<Post[]>([]);
  const [sentiment, setSentiment] = useState<SentimentAnalysis | null>(null);
  const [engagement, setEngagement] = useState<EngagementMetrics | null>(null);
  const [alerts, setAlerts] = useState<SocialAlert[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const loadPosts = useCallback(async () => {
    const result = await api.getPosts();
    if (result.success && result.data?.posts) {
      setPosts(result.data.posts);
    }
  }, []);

  const loadSentiment = useCallback(async () => {
    const result = await api.getSentimentAnalysis();
    if (result.success && result.data?.analysis) {
      setSentiment(result.data.analysis);
    }
  }, []);

  const loadEngagement = useCallback(async () => {
    const result = await api.getEngagementMetrics();
    if (result.success && result.data?.metrics) {
      setEngagement(result.data.metrics);
    }
  }, []);

  const loadAlerts = useCallback(async () => {
    const result = await api.getSocialAlerts();
    if (result.success && result.data?.alerts) {
      setAlerts(result.data.alerts);
    }
  }, []);

  const loadAll = useCallback(async () => {
    setIsLoading(true);
    await Promise.all([loadPosts(), loadSentiment(), loadEngagement(), loadAlerts()]);
    setIsLoading(false);
  }, [loadPosts, loadSentiment, loadEngagement, loadAlerts]);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  const formatNumber = (num: number) => {
    if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`;
    if (num >= 1000) return `${(num / 1000).toFixed(1)}K`;
    return num.toString();
  };

  const publishedPosts = posts.filter(p => p.status === 'PUBLISHED').length;
  const scheduledPosts = posts.filter(p => p.status === 'SCHEDULED').length;

  return (
    <div className="p-8">
      {/* Header */}
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Social</h1>
          <p className="text-gray-400 mt-1">Content management, sentiment analysis, and engagement tracking</p>
        </div>
        <button
          onClick={loadAll}
          className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition flex items-center gap-2"
        >
          <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-500/20 rounded-lg">
              <FileText className="w-5 h-5 text-blue-400" />
            </div>
            <div>
              <p className="text-2xl font-bold text-white">{posts.length}</p>
              <p className="text-sm text-gray-400">Total Posts</p>
            </div>
          </div>
        </div>

        <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-green-500/20 rounded-lg">
              <CheckCircle className="w-5 h-5 text-green-400" />
            </div>
            <div>
              <p className="text-2xl font-bold text-green-400">{publishedPosts}</p>
              <p className="text-sm text-gray-400">Published</p>
            </div>
          </div>
        </div>

        <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-yellow-500/20 rounded-lg">
              <Calendar className="w-5 h-5 text-yellow-400" />
            </div>
            <div>
              <p className="text-2xl font-bold text-yellow-400">{scheduledPosts}</p>
              <p className="text-sm text-gray-400">Scheduled</p>
            </div>
          </div>
        </div>

        <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-purple-500/20 rounded-lg">
              <TrendingUp className="w-5 h-5 text-purple-400" />
            </div>
            <div>
              <p className="text-2xl font-bold text-purple-400">
                {engagement?.averageEngagementRate?.toFixed(1) || '0'}%
              </p>
              <p className="text-sm text-gray-400">Avg Engagement</p>
            </div>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 mb-6">
        <button
          onClick={() => setActiveTab('posts')}
          className={`px-4 py-2 rounded-lg transition flex items-center gap-2 ${
            activeTab === 'posts' ? 'bg-blue-600 text-white' : 'bg-gray-800 text-gray-400 hover:text-white'
          }`}
        >
          <FileText className="w-4 h-4" />
          Posts ({posts.length})
        </button>
        <button
          onClick={() => setActiveTab('sentiment')}
          className={`px-4 py-2 rounded-lg transition flex items-center gap-2 ${
            activeTab === 'sentiment' ? 'bg-blue-600 text-white' : 'bg-gray-800 text-gray-400 hover:text-white'
          }`}
        >
          <Heart className="w-4 h-4" />
          Sentiment
        </button>
        <button
          onClick={() => setActiveTab('engagement')}
          className={`px-4 py-2 rounded-lg transition flex items-center gap-2 ${
            activeTab === 'engagement' ? 'bg-blue-600 text-white' : 'bg-gray-800 text-gray-400 hover:text-white'
          }`}
        >
          <TrendingUp className="w-4 h-4" />
          Engagement
        </button>
        <button
          onClick={() => setActiveTab('alerts')}
          className={`px-4 py-2 rounded-lg transition flex items-center gap-2 ${
            activeTab === 'alerts' ? 'bg-blue-600 text-white' : 'bg-gray-800 text-gray-400 hover:text-white'
          }`}
        >
          <AlertTriangle className="w-4 h-4" />
          Alerts ({alerts.length})
        </button>
      </div>

      {/* Tab Content */}
      {activeTab === 'posts' && (
        <div>
          {isLoading ? (
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-8 text-center text-gray-500">
              Loading posts...
            </div>
          ) : posts.length === 0 ? (
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-8 text-center text-gray-500">
              <FileText className="w-12 h-12 mx-auto mb-4 opacity-50" />
              <p>No posts yet</p>
              <p className="text-sm mt-1">Create content to get started</p>
            </div>
          ) : (
            <div className="space-y-4">
              {posts.map((post) => (
                <div key={post.id} className="bg-gray-900 border border-gray-800 rounded-xl p-4">
                  <div className="flex items-center gap-4">
                    <div className="text-3xl">{getChannelIcon(post.channel)}</div>
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-white">{post.title}</span>
                        <span className={`px-2 py-0.5 rounded text-xs ${getStatusColor(post.status)}`}>
                          {post.status}
                        </span>
                      </div>
                      <div className="flex items-center gap-4 mt-1 text-sm text-gray-500">
                        <span>{post.channel}</span>
                        {post.scheduledAt && (
                          <span className="flex items-center gap-1">
                            <Clock className="w-3 h-3" />
                            Scheduled: {new Date(post.scheduledAt).toLocaleString()}
                          </span>
                        )}
                        {post.publishedAt && (
                          <span className="flex items-center gap-1">
                            <CheckCircle className="w-3 h-3" />
                            Published: {new Date(post.publishedAt).toLocaleString()}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="text-sm text-gray-500">
                      {new Date(post.createdAt).toLocaleDateString()}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {activeTab === 'sentiment' && (
        <div>
          {!sentiment ? (
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-8 text-center text-gray-500">
              <Heart className="w-12 h-12 mx-auto mb-4 opacity-50" />
              <p>No sentiment data available</p>
              <p className="text-sm mt-1">Sentiment analysis will appear once content is analyzed</p>
            </div>
          ) : (
            <div className="space-y-6">
              {/* Overall Sentiment */}
              <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
                <div className="flex items-center gap-4 mb-6">
                  {getSentimentIcon(sentiment.overall)}
                  <div>
                    <h3 className="text-lg font-semibold text-white capitalize">
                      {sentiment.overall} Sentiment
                    </h3>
                    <p className="text-sm text-gray-400">Overall audience sentiment score: {sentiment.score}/100</p>
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-4">
                  <div className="p-4 bg-green-500/10 border border-green-500/30 rounded-lg">
                    <div className="flex items-center gap-2 mb-2">
                      <Smile className="w-5 h-5 text-green-400" />
                      <span className="text-sm text-gray-400">Positive</span>
                    </div>
                    <p className="text-2xl font-bold text-green-400">{sentiment.breakdown.positive}%</p>
                  </div>
                  <div className="p-4 bg-yellow-500/10 border border-yellow-500/30 rounded-lg">
                    <div className="flex items-center gap-2 mb-2">
                      <Meh className="w-5 h-5 text-yellow-400" />
                      <span className="text-sm text-gray-400">Neutral</span>
                    </div>
                    <p className="text-2xl font-bold text-yellow-400">{sentiment.breakdown.neutral}%</p>
                  </div>
                  <div className="p-4 bg-red-500/10 border border-red-500/30 rounded-lg">
                    <div className="flex items-center gap-2 mb-2">
                      <Frown className="w-5 h-5 text-red-400" />
                      <span className="text-sm text-gray-400">Negative</span>
                    </div>
                    <p className="text-2xl font-bold text-red-400">{sentiment.breakdown.negative}%</p>
                  </div>
                </div>
              </div>

              {/* Trending Topics */}
              {sentiment.trending.length > 0 && (
                <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
                  <h3 className="text-lg font-semibold text-white mb-4">Trending Topics</h3>
                  <div className="flex flex-wrap gap-2">
                    {sentiment.trending.map((topic, i) => (
                      <span key={i} className="px-3 py-1 bg-blue-500/20 text-blue-400 rounded-full text-sm">
                        #{topic}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {activeTab === 'engagement' && (
        <div>
          {!engagement ? (
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-8 text-center text-gray-500">
              <TrendingUp className="w-12 h-12 mx-auto mb-4 opacity-50" />
              <p>No engagement data available</p>
              <p className="text-sm mt-1">Engagement metrics will appear once content is published</p>
            </div>
          ) : (
            <div className="space-y-6">
              {/* Engagement Metrics */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <Eye className="w-5 h-5 text-blue-400" />
                    <span className="text-sm text-gray-400">Views</span>
                  </div>
                  <p className="text-2xl font-bold text-white">{formatNumber(engagement.totalViews)}</p>
                </div>
                <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <Heart className="w-5 h-5 text-red-400" />
                    <span className="text-sm text-gray-400">Likes</span>
                  </div>
                  <p className="text-2xl font-bold text-white">{formatNumber(engagement.totalLikes)}</p>
                </div>
                <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <MessageCircle className="w-5 h-5 text-green-400" />
                    <span className="text-sm text-gray-400">Comments</span>
                  </div>
                  <p className="text-2xl font-bold text-white">{formatNumber(engagement.totalComments)}</p>
                </div>
                <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <Share2 className="w-5 h-5 text-purple-400" />
                    <span className="text-sm text-gray-400">Shares</span>
                  </div>
                  <p className="text-2xl font-bold text-white">{formatNumber(engagement.totalShares)}</p>
                </div>
              </div>

              {/* Top Posts */}
              {engagement.topPosts.length > 0 && (
                <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
                  <h3 className="text-lg font-semibold text-white mb-4">Top Performing Posts</h3>
                  <div className="space-y-3">
                    {engagement.topPosts.map((post, i) => (
                      <div key={post.id} className="flex items-center gap-4 p-3 bg-gray-800 rounded-lg">
                        <span className="text-lg font-bold text-gray-500">#{i + 1}</span>
                        <span className="flex-1 text-white">{post.title}</span>
                        <span className="text-green-400 font-medium">{post.engagementRate.toFixed(1)}%</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {activeTab === 'alerts' && (
        <div>
          {alerts.length === 0 ? (
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-8 text-center text-gray-500">
              <CheckCircle className="w-12 h-12 mx-auto mb-4 opacity-50" />
              <p>No social alerts</p>
              <p className="text-sm mt-1">Alerts will appear when attention is needed</p>
            </div>
          ) : (
            <div className="space-y-4">
              {alerts.map((alert) => (
                <div
                  key={alert.id}
                  className={`bg-gray-900 border rounded-xl p-4 ${
                    alert.severity === 'HIGH' ? 'border-red-500/30' :
                    alert.severity === 'MEDIUM' ? 'border-yellow-500/30' :
                    'border-gray-700'
                  }`}
                >
                  <div className="flex items-start gap-4">
                    <div className={`p-2 rounded-lg ${
                      alert.severity === 'HIGH' ? 'bg-red-500/20' :
                      alert.severity === 'MEDIUM' ? 'bg-yellow-500/20' :
                      'bg-blue-500/20'
                    }`}>
                      <AlertTriangle className={`w-5 h-5 ${
                        alert.severity === 'HIGH' ? 'text-red-400' :
                        alert.severity === 'MEDIUM' ? 'text-yellow-400' :
                        'text-blue-400'
                      }`} />
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-medium text-white">{alert.type}</span>
                        <span className={`px-2 py-0.5 rounded text-xs ${
                          alert.severity === 'HIGH' ? 'bg-red-500/20 text-red-400' :
                          alert.severity === 'MEDIUM' ? 'bg-yellow-500/20 text-yellow-400' :
                          'bg-blue-500/20 text-blue-400'
                        }`}>
                          {alert.severity}
                        </span>
                      </div>
                      <p className="text-sm text-gray-300">{alert.message}</p>
                      <p className="text-xs text-gray-500 mt-2">
                        {new Date(alert.createdAt).toLocaleString()}
                      </p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
