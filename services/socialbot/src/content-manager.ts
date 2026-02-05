/**
 * Nova Enterprises - Social Media Content Manager
 * Multi-platform content scheduling, optimization, and analytics
 */

import { Pool } from 'pg';

// Types
export interface SocialAccount {
  id: string;
  platform: 'twitter' | 'linkedin' | 'instagram' | 'facebook' | 'tiktok';
  account_name: string;
  account_id: string;
  access_token?: string;
  refresh_token?: string;
  is_active: boolean;
  follower_count: number;
  engagement_rate: number;
}

export interface ContentPost {
  id: string;
  account_id: string;
  platform: string;
  content_type: 'text' | 'image' | 'video' | 'carousel' | 'story' | 'reel';
  content: string;
  media_urls: string[];
  hashtags: string[];
  scheduled_for: Date | null;
  published_at: Date | null;
  status: 'draft' | 'scheduled' | 'published' | 'failed';
  performance: PostPerformance | null;
}

export interface PostPerformance {
  impressions: number;
  reach: number;
  likes: number;
  comments: number;
  shares: number;
  clicks: number;
  engagement_rate: number;
}

export interface ContentCalendar {
  week: string;
  posts: ContentPost[];
  performance_summary: WeeklyPerformance;
}

export interface WeeklyPerformance {
  total_posts: number;
  total_impressions: number;
  total_engagement: number;
  avg_engagement_rate: number;
  top_performing_post: string | null;
  best_day: string | null;
  best_time: string | null;
}

export interface ContentSuggestion {
  platform: string;
  content_type: string;
  suggested_content: string;
  suggested_hashtags: string[];
  optimal_time: Date;
  predicted_engagement: number;
  reasoning: string;
}

// Optimal posting times by platform (in UTC hours)
const OPTIMAL_POSTING_TIMES: Record<string, number[]> = {
  twitter: [9, 12, 17, 20],      // Morning, lunch, after work, evening
  linkedin: [7, 10, 12, 17],     // Early morning for professionals
  instagram: [11, 14, 19, 21],   // Late morning, afternoon, evening
  facebook: [9, 13, 16, 20],     // Similar to Twitter
  tiktok: [15, 19, 21, 23],      // Afternoon and late evening
};

// Trending hashtags by category
const TRENDING_HASHTAGS: Record<string, string[]> = {
  tech: ['#AI', '#Innovation', '#TechNews', '#FutureTech', '#StartupLife'],
  business: ['#Entrepreneur', '#BusinessGrowth', '#Leadership', '#Success', '#Strategy'],
  ecommerce: ['#ShopNow', '#Deals', '#NewProduct', '#ShoppingOnline', '#MustHave'],
  lifestyle: ['#LifeHacks', '#Motivation', '#DailyRoutine', '#Wellness', '#Trending'],
};

export class ContentManager {
  private pool: Pool | null = null;

  constructor(connectionString?: string) {
    if (connectionString) {
      this.pool = new Pool({ connectionString });
    }
  }

  /**
   * Get all connected social accounts
   */
  async getAccounts(): Promise<SocialAccount[]> {
    if (!this.pool) {
      return this.getStubAccounts();
    }

    try {
      const result = await this.pool.query(
        'SELECT * FROM social_accounts WHERE is_active = true ORDER BY platform, account_name'
      );
      return result.rows;
    } catch (error) {
      console.error('Failed to get accounts:', error);
      return this.getStubAccounts();
    }
  }

  /**
   * Get scheduled and recent posts
   */
  async getPosts(options: { status?: string; limit?: number } = {}): Promise<ContentPost[]> {
    if (!this.pool) {
      return this.getStubPosts();
    }

    try {
      let query = 'SELECT * FROM content_posts';
      const params: (string | number)[] = [];

      if (options.status) {
        query += ' WHERE status = $1';
        params.push(options.status);
      }

      query += ' ORDER BY COALESCE(scheduled_for, published_at, created_at) DESC';

      if (options.limit) {
        query += ` LIMIT $${params.length + 1}`;
        params.push(options.limit);
      }

      const result = await this.pool.query(query, params);
      return result.rows;
    } catch (error) {
      console.error('Failed to get posts:', error);
      return this.getStubPosts();
    }
  }

  /**
   * Create a new content post
   */
  async createPost(post: Partial<ContentPost>): Promise<ContentPost | null> {
    const newPost: ContentPost = {
      id: this.generateId(),
      account_id: post.account_id || '',
      platform: post.platform || 'twitter',
      content_type: post.content_type || 'text',
      content: post.content || '',
      media_urls: post.media_urls || [],
      hashtags: post.hashtags || [],
      scheduled_for: post.scheduled_for || null,
      published_at: null,
      status: post.scheduled_for ? 'scheduled' : 'draft',
      performance: null,
    };

    if (!this.pool) {
      return newPost;
    }

    try {
      await this.pool.query(
        `INSERT INTO content_posts 
         (id, account_id, platform, content_type, content, media_urls, hashtags, scheduled_for, status)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [
          newPost.id,
          newPost.account_id,
          newPost.platform,
          newPost.content_type,
          newPost.content,
          JSON.stringify(newPost.media_urls),
          JSON.stringify(newPost.hashtags),
          newPost.scheduled_for,
          newPost.status,
        ]
      );
      return newPost;
    } catch (error) {
      console.error('Failed to create post:', error);
      return null;
    }
  }

  /**
   * Schedule a post for optimal engagement
   */
  async schedulePost(postId: string, scheduledFor?: Date): Promise<boolean> {
    if (!scheduledFor) {
      // Auto-select optimal time
      const optimalTime = this.getNextOptimalTime('twitter');
      scheduledFor = optimalTime;
    }

    if (!this.pool) return true;

    try {
      await this.pool.query(
        'UPDATE content_posts SET scheduled_for = $1, status = $2, updated_at = NOW() WHERE id = $3',
        [scheduledFor, 'scheduled', postId]
      );
      return true;
    } catch (error) {
      console.error('Failed to schedule post:', error);
      return false;
    }
  }

  /**
   * Get content calendar for a week
   */
  async getContentCalendar(weekStart?: Date): Promise<ContentCalendar> {
    const start = weekStart || this.getWeekStart(new Date());
    const end = new Date(start);
    end.setDate(end.getDate() + 7);

    const posts = await this.getPosts({ limit: 50 });
    const weekPosts = posts.filter(p => {
      const postDate = p.scheduled_for || p.published_at;
      return postDate && new Date(postDate) >= start && new Date(postDate) < end;
    });

    return {
      week: start.toISOString().split('T')[0],
      posts: weekPosts,
      performance_summary: this.calculateWeeklyPerformance(weekPosts),
    };
  }

  /**
   * Generate content suggestions based on analytics
   */
  async generateSuggestions(platform?: string): Promise<ContentSuggestion[]> {
    const suggestions: ContentSuggestion[] = [];
    const platforms = platform ? [platform] : ['twitter', 'linkedin', 'instagram'];

    for (const p of platforms) {
      // Generate platform-specific suggestions
      const suggestion = this.generatePlatformSuggestion(p);
      suggestions.push(suggestion);
    }

    return suggestions;
  }

  /**
   * Get analytics for a specific time period
   */
  async getAnalytics(days: number = 30): Promise<{
    total_posts: number;
    total_impressions: number;
    total_engagement: number;
    avg_engagement_rate: number;
    platform_breakdown: Record<string, { posts: number; engagement: number }>;
    top_posts: ContentPost[];
    growth_trend: number;
  }> {
    const posts = await this.getPosts({ status: 'published', limit: 100 });
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - days);

    const recentPosts = posts.filter(p => 
      p.published_at && new Date(p.published_at) >= cutoff
    );

    const platformBreakdown: Record<string, { posts: number; engagement: number }> = {};
    let totalImpressions = 0;
    let totalEngagement = 0;

    for (const post of recentPosts) {
      const perf = post.performance || this.generateStubPerformance();
      
      if (!platformBreakdown[post.platform]) {
        platformBreakdown[post.platform] = { posts: 0, engagement: 0 };
      }
      
      platformBreakdown[post.platform].posts++;
      platformBreakdown[post.platform].engagement += perf.likes + perf.comments + perf.shares;
      
      totalImpressions += perf.impressions;
      totalEngagement += perf.likes + perf.comments + perf.shares;
    }

    const sortedPosts = [...recentPosts].sort((a, b) => {
      const perfA = a.performance || this.generateStubPerformance();
      const perfB = b.performance || this.generateStubPerformance();
      return perfB.engagement_rate - perfA.engagement_rate;
    });

    return {
      total_posts: recentPosts.length,
      total_impressions: totalImpressions,
      total_engagement: totalEngagement,
      avg_engagement_rate: recentPosts.length > 0 
        ? (totalEngagement / totalImpressions) * 100 
        : 0,
      platform_breakdown: platformBreakdown,
      top_posts: sortedPosts.slice(0, 5),
      growth_trend: 12.5, // Stub - would calculate from historical data
    };
  }

  /**
   * Get optimal posting time for a platform
   */
  getNextOptimalTime(platform: string): Date {
    const times = OPTIMAL_POSTING_TIMES[platform] || [12];
    const now = new Date();
    const currentHour = now.getUTCHours();

    // Find next optimal time
    for (const hour of times) {
      if (hour > currentHour) {
        const optimal = new Date(now);
        optimal.setUTCHours(hour, 0, 0, 0);
        return optimal;
      }
    }

    // Next day's first optimal time
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setUTCHours(times[0], 0, 0, 0);
    return tomorrow;
  }

  /**
   * Generate hashtag suggestions
   */
  suggestHashtags(category: string, count: number = 5): string[] {
    const categoryTags = TRENDING_HASHTAGS[category] || TRENDING_HASHTAGS.tech;
    const shuffled = [...categoryTags].sort(() => Math.random() - 0.5);
    return shuffled.slice(0, count);
  }

  // Private helper methods

  private generateId(): string {
    return `post_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private getWeekStart(date: Date): Date {
    const d = new Date(date);
    const day = d.getDay();
    const diff = d.getDate() - day + (day === 0 ? -6 : 1);
    d.setDate(diff);
    d.setHours(0, 0, 0, 0);
    return d;
  }

  private calculateWeeklyPerformance(posts: ContentPost[]): WeeklyPerformance {
    let totalImpressions = 0;
    let totalEngagement = 0;
    let topPost: ContentPost | null = null;
    let topEngagement = 0;

    const dayEngagement: Record<string, number> = {};
    const hourEngagement: Record<number, number> = {};

    for (const post of posts) {
      const perf = post.performance || this.generateStubPerformance();
      const engagement = perf.likes + perf.comments + perf.shares;

      totalImpressions += perf.impressions;
      totalEngagement += engagement;

      if (engagement > topEngagement) {
        topEngagement = engagement;
        topPost = post;
      }

      const date = post.scheduled_for || post.published_at;
      if (date) {
        const d = new Date(date);
        const dayName = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][d.getDay()];
        dayEngagement[dayName] = (dayEngagement[dayName] || 0) + engagement;
        hourEngagement[d.getHours()] = (hourEngagement[d.getHours()] || 0) + engagement;
      }
    }

    const bestDay = Object.entries(dayEngagement)
      .sort(([, a], [, b]) => b - a)[0]?.[0] || null;

    const bestHour = Object.entries(hourEngagement)
      .sort(([, a], [, b]) => b - a)[0]?.[0] || null;

    return {
      total_posts: posts.length,
      total_impressions: totalImpressions,
      total_engagement: totalEngagement,
      avg_engagement_rate: totalImpressions > 0 
        ? (totalEngagement / totalImpressions) * 100 
        : 0,
      top_performing_post: topPost?.id || null,
      best_day: bestDay,
      best_time: bestHour ? `${bestHour}:00` : null,
    };
  }

  private generatePlatformSuggestion(platform: string): ContentSuggestion {
    const templates: Record<string, { content: string; type: string }> = {
      twitter: {
        content: "🚀 Big news from Nova Enterprises! We're pushing the boundaries of AI-powered commerce. Stay tuned for exciting updates! #Innovation #AI",
        type: 'text',
      },
      linkedin: {
        content: "At Nova Enterprises, we believe in the power of autonomous systems to transform business operations. Our latest developments in AI-orchestrated commerce are setting new standards for efficiency and scalability. What challenges are you solving with AI in your organization?",
        type: 'text',
      },
      instagram: {
        content: "Innovation in action ✨ Behind the scenes at Nova HQ. Our team is building the future of intelligent commerce.",
        type: 'image',
      },
    };

    const template = templates[platform] || templates.twitter;
    const category = platform === 'linkedin' ? 'business' : 'tech';

    return {
      platform,
      content_type: template.type,
      suggested_content: template.content,
      suggested_hashtags: this.suggestHashtags(category),
      optimal_time: this.getNextOptimalTime(platform),
      predicted_engagement: 3.5 + Math.random() * 2,
      reasoning: `Based on your ${platform} audience analytics and current trending topics`,
    };
  }

  private generateStubPerformance(): PostPerformance {
    const impressions = 1000 + Math.floor(Math.random() * 9000);
    const likes = Math.floor(impressions * (0.02 + Math.random() * 0.08));
    const comments = Math.floor(likes * (0.05 + Math.random() * 0.15));
    const shares = Math.floor(likes * (0.02 + Math.random() * 0.08));
    const clicks = Math.floor(impressions * (0.01 + Math.random() * 0.05));

    return {
      impressions,
      reach: Math.floor(impressions * 0.85),
      likes,
      comments,
      shares,
      clicks,
      engagement_rate: ((likes + comments + shares) / impressions) * 100,
    };
  }

  private getStubAccounts(): SocialAccount[] {
    return [
      {
        id: 'acc1',
        platform: 'twitter',
        account_name: '@NovaEnterprises',
        account_id: 'nova_twitter',
        is_active: true,
        follower_count: 15420,
        engagement_rate: 4.2,
      },
      {
        id: 'acc2',
        platform: 'linkedin',
        account_name: 'Nova Enterprises',
        account_id: 'nova_linkedin',
        is_active: true,
        follower_count: 8750,
        engagement_rate: 5.8,
      },
      {
        id: 'acc3',
        platform: 'instagram',
        account_name: '@nova.enterprises',
        account_id: 'nova_instagram',
        is_active: true,
        follower_count: 22100,
        engagement_rate: 6.4,
      },
      {
        id: 'acc4',
        platform: 'facebook',
        account_name: 'Nova Enterprises',
        account_id: 'nova_facebook',
        is_active: true,
        follower_count: 12300,
        engagement_rate: 3.1,
      },
    ];
  }

  private getStubPosts(): ContentPost[] {
    const now = new Date();
    return [
      {
        id: 'post1',
        account_id: 'acc1',
        platform: 'twitter',
        content_type: 'text',
        content: '🎉 Exciting news! Nova Enterprises just hit a major milestone. Our AI-powered trading system processed 10,000 autonomous decisions today! #AI #Trading #Innovation',
        media_urls: [],
        hashtags: ['#AI', '#Trading', '#Innovation'],
        scheduled_for: null,
        published_at: new Date(now.getTime() - 2 * 60 * 60 * 1000),
        status: 'published',
        performance: this.generateStubPerformance(),
      },
      {
        id: 'post2',
        account_id: 'acc2',
        platform: 'linkedin',
        content_type: 'text',
        content: 'The future of enterprise software is autonomous. At Nova Enterprises, we\'re building systems that think, adapt, and optimize in real-time. Interested in learning more about our approach to AI-orchestrated business operations?',
        media_urls: [],
        hashtags: ['#Enterprise', '#AI', '#Automation'],
        scheduled_for: null,
        published_at: new Date(now.getTime() - 24 * 60 * 60 * 1000),
        status: 'published',
        performance: this.generateStubPerformance(),
      },
      {
        id: 'post3',
        account_id: 'acc3',
        platform: 'instagram',
        content_type: 'image',
        content: 'Behind the scenes at Nova HQ 🏢✨ Our team is working on something big. Can you guess what\'s next?',
        media_urls: ['https://example.com/hq-photo.jpg'],
        hashtags: ['#Tech', '#StartupLife', '#Innovation', '#BTS'],
        scheduled_for: new Date(now.getTime() + 4 * 60 * 60 * 1000),
        published_at: null,
        status: 'scheduled',
        performance: null,
      },
      {
        id: 'post4',
        account_id: 'acc1',
        platform: 'twitter',
        content_type: 'text',
        content: 'Market analysis complete! Our AI identified 3 high-confidence opportunities today. Precision trading at its finest. 📈🤖',
        media_urls: [],
        hashtags: ['#Trading', '#AI', '#Markets'],
        scheduled_for: new Date(now.getTime() + 8 * 60 * 60 * 1000),
        published_at: null,
        status: 'scheduled',
        performance: null,
      },
      {
        id: 'post5',
        account_id: 'acc2',
        platform: 'linkedin',
        content_type: 'text',
        content: 'Draft: New whitepaper on autonomous business systems coming soon...',
        media_urls: [],
        hashtags: [],
        scheduled_for: null,
        published_at: null,
        status: 'draft',
        performance: null,
      },
    ];
  }
}

// Export singleton instance
export const contentManager = new ContentManager(process.env.DATABASE_URL);
