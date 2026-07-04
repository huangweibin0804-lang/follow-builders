import { readFile } from 'fs/promises';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

export const FEED_URLS = {
  x: 'https://raw.githubusercontent.com/zarazhangrui/follow-builders/main/feed-x.json',
  podcasts: 'https://raw.githubusercontent.com/zarazhangrui/follow-builders/main/feed-podcasts.json',
  blogs: 'https://raw.githubusercontent.com/zarazhangrui/follow-builders/main/feed-blogs.json'
};

export const LOCAL_FEEDS = {
  x: join(__dirname, '..', 'feed-x.json'),
  podcasts: join(__dirname, '..', 'feed-podcasts.json'),
  blogs: join(__dirname, '..', 'feed-blogs.json')
};

const AI_KEYWORDS = [
  'ai',
  'agent',
  'agents',
  'llm',
  'model',
  'models',
  'gpt',
  'claude',
  'codex',
  'prompt',
  'prompts',
  'inference',
  'training',
  'eval',
  'evals',
  'artifact',
  'artifacts',
  'coding',
  'code',
  'openai',
  'anthropic',
  'gemini',
  'builder',
  'builders',
  'automation',
  'tool',
  'tools',
  'workflow',
  'memory',
  'context',
  'reasoning',
  'ui',
  'product',
  'fable'
];

export function compact(text) {
  return String(text || '').replace(/\s+/g, ' ').trim();
}

export function truncate(text, limit) {
  const value = compact(text);
  if (value.length <= limit) return value;
  return `${value.slice(0, limit - 1)}...`;
}

export function transcriptSnippet(transcript) {
  const cleaned = String(transcript || '')
    .replace(/Speaker\s+\d+\s+\|\s+\d{2}:\d{2}\s*-\s*\d{2}:\d{2}\s*/g, ' ')
    .replace(/\d{1,2}:\d{2}\s*-\s*\d{1,2}:\d{2}/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return truncate(cleaned, 240);
}

export async function fetchJsonWithTimeout(url, timeoutMs = 12000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    return await response.json();
  } finally {
    clearTimeout(timer);
  }
}

export async function readLocalJson(path) {
  return JSON.parse(await readFile(path, 'utf-8'));
}

export async function loadFeed(kind) {
  try {
    return await fetchJsonWithTimeout(FEED_URLS[kind]);
  } catch (error) {
    const local = await readLocalJson(LOCAL_FEEDS[kind]);
    local._fallback = `remote fetch failed: ${error.message}`;
    return local;
  }
}

export function aiRelevanceScore(text) {
  const normalized = compact(text).toLowerCase();
  if (!normalized) return 0;

  let score = 0;
  for (const keyword of AI_KEYWORDS) {
    if (normalized.includes(keyword)) score += 1;
  }

  if (normalized.includes('http')) score += 0.5;
  if (normalized.includes('released') || normalized.includes('launch')) score += 0.5;
  return score;
}

export function pickTopTweets(feedX, limit = 5) {
  const topPerBuilder = (feedX.x || [])
    .map((builder) => {
      const tweets = (builder.tweets || []).map((tweet) => ({
        ...tweet,
        builderName: builder.name,
        handle: builder.handle,
        score: (tweet.likes || 0) + (tweet.retweets || 0) * 2 + (tweet.replies || 0),
        relevance: aiRelevanceScore(tweet.text)
      }));
      const relevantTweets = tweets.filter((tweet) => tweet.relevance > 0);
      const candidates = relevantTweets.length > 0 ? relevantTweets : tweets;
      candidates.sort((a, b) => {
        if (b.relevance !== a.relevance) return b.relevance - a.relevance;
        return b.score - a.score;
      });
      return candidates[0];
    })
    .filter(Boolean);

  topPerBuilder.sort((a, b) => {
    if (b.relevance !== a.relevance) return b.relevance - a.relevance;
    const timeGap = new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    if (Math.abs(timeGap) > 6 * 60 * 60 * 1000) return timeGap;
    return b.score - a.score;
  });

  return topPerBuilder.slice(0, limit);
}

export async function loadDigestSourceData() {
  const [feedX, feedPodcasts, feedBlogs] = await Promise.all([
    loadFeed('x'),
    loadFeed('podcasts'),
    loadFeed('blogs')
  ]);

  return {
    feedX,
    feedPodcasts,
    feedBlogs,
    selectedTweets: pickTopTweets(feedX, 5),
    selectedPodcasts: (feedPodcasts.podcasts || []).slice(0, 1),
    selectedBlogs: (feedBlogs.blogs || []).slice(0, 3)
  };
}

export function buildRuleDigest({ feedX, feedPodcasts, feedBlogs, selectedTweets, selectedPodcasts, selectedBlogs }) {
  const date = new Date().toLocaleDateString('zh-CN', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  });

  const lines = [`AI Builder Digest | ${date}`, '', 'X Updates'];

  if (selectedTweets.length === 0) {
    lines.push('1. No relevant updates today.');
  } else {
    selectedTweets.forEach((tweet, index) => {
      lines.push(
        `${index + 1}. ${tweet.builderName} (@${tweet.handle})`,
        `   ${truncate(tweet.text, 110)}`,
        `   Engagement ${tweet.likes || 0} likes / ${tweet.retweets || 0} reposts / ${tweet.replies || 0} replies`,
        `   ${tweet.url}`
      );
    });
  }

  lines.push('', 'Podcast Update');
  if (selectedPodcasts.length === 0) {
    lines.push('1. No new podcast update.');
  } else {
    selectedPodcasts.forEach((podcast, index) => {
      lines.push(
        `${index + 1}. ${podcast.name} | ${truncate(podcast.title, 90)}`,
        `   ${transcriptSnippet(podcast.transcript)}`,
        `   ${podcast.url}`
      );
    });
  }

  lines.push('', 'Blog Update');
  if (selectedBlogs.length === 0) {
    lines.push('1. No new blog update in the current window.');
  } else {
    selectedBlogs.forEach((blog, index) => {
      lines.push(
        `${index + 1}. ${truncate(blog.title, 90)}`,
        `   ${truncate(blog.summary || blog.content || '', 110)}`,
        `   ${blog.url}`
      );
    });
  }

  if (feedX._fallback || feedPodcasts._fallback || feedBlogs._fallback) {
    lines.push('', 'Notes');
    if (feedX._fallback) lines.push(`- X feed fallback: ${feedX._fallback}`);
    if (feedPodcasts._fallback) lines.push(`- Podcast feed fallback: ${feedPodcasts._fallback}`);
    if (feedBlogs._fallback) lines.push(`- Blog feed fallback: ${feedBlogs._fallback}`);
  }

  return lines.join('\n');
}
