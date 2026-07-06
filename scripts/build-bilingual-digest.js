#!/usr/bin/env node

import { loadDigestSourceData, transcriptSnippet, truncate } from './digest-data.js';

function parseArgs(argv) {
  return {
    mock: argv.includes('--mock')
  };
}

function formatDate() {
  return new Date().toLocaleDateString('zh-CN', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  });
}

function buildSelectionPayload(data) {
  return {
    date: formatDate(),
    xUpdates: data.selectedTweets.map((tweet) => ({
      builderName: tweet.builderName,
      handle: tweet.handle,
      text: truncate(tweet.text, 500),
      url: tweet.url,
      likes: tweet.likes || 0,
      retweets: tweet.retweets || 0,
      replies: tweet.replies || 0,
      createdAt: tweet.createdAt
    })),
    podcastUpdates: data.selectedPodcasts.map((podcast) => ({
      name: podcast.name,
      title: podcast.title,
      summarySeed: transcriptSnippet(podcast.transcript),
      url: podcast.url,
      publishedAt: podcast.publishedAt
    })),
    blogUpdates: data.selectedBlogs.map((blog) => ({
      title: blog.title,
      summary: truncate(blog.summary || blog.content || '', 500),
      url: blog.url
    })),
    notes: [
      data.feedX._fallback,
      data.feedPodcasts._fallback,
      data.feedBlogs._fallback
    ].filter(Boolean)
  };
}

function buildMockDigest(payload) {
  const lines = [
    `AI Builder Digest | ${payload.date}`,
    '',
    '今日重点',
    '[mock] 今天的重点仍然集中在企业 AI 落地、开发工具链和基础设施。',
    ''
  ];

  lines.push('X 动态');
  if (payload.xUpdates.length === 0) {
    lines.push('中文：今天暂无高相关 X 更新。');
  } else {
    payload.xUpdates.slice(0, 3).forEach((item, index) => {
      lines.push(
        `${index + 1}. ${item.builderName} (@${item.handle})`,
        `${truncate(item.text, 180)}`,
        `中文：[mock] 这条更新和 AI builder 动向相关，建议结合原文阅读。`,
        item.url,
        ''
      );
    });
  }

  lines.push('播客更新');
  if (payload.podcastUpdates.length === 0) {
    lines.push('中文：今天暂无播客更新。', '');
  } else {
    const podcast = payload.podcastUpdates[0];
    lines.push(
      `${podcast.name} | ${podcast.title}`,
      `${podcast.summarySeed}`,
      `中文：[mock] 这期播客值得关注，建议后续用正式模型生成更自然的中文导读。`,
      podcast.url,
      ''
    );
  }

  lines.push('博客更新');
  if (payload.blogUpdates.length === 0) {
    lines.push('中文：最近窗口暂无新博客更新。');
  } else {
    payload.blogUpdates.forEach((item, index) => {
      lines.push(
        `${index + 1}. ${item.title}`,
        `${item.summary}`,
        `中文：[mock] 这篇博客有进一步阅读价值。`,
        item.url
      );
    });
  }

  if (payload.notes.length > 0) {
    lines.push('', '备注');
    payload.notes.forEach((note) => lines.push(`- ${note}`));
  }

  return lines.join('\n');
}

function buildPrompt(payload) {
  return [
    'You are writing a Feishu-ready AI Builder digest for a Chinese-speaking business user.',
    'Use only the source material provided below. Do not add facts.',
    'Output in bilingual interleaved format:',
    '- Title: AI Builder Digest | YYYY/MM/DD',
    '- Section: 今日重点, 2 to 4 Chinese lines summarizing the day',
    '- Section: X 动态, 3 to 5 items; each item should contain one short English summary line, then one Chinese translation/explanation line, then the original link',
    '- Section: 播客更新, one short English line, one Chinese line, then link',
    '- Section: 博客更新, if empty say 最近窗口暂无新博客更新',
    'Keep Chinese natural and concise. Keep common technical terms in English when that is how Chinese professionals normally read them: AI, agent, LLM, API, GPU, prompt, RAG, fine-tuning, Claude Code, Codex.',
    'Do not use markdown bullets other than numbered items where helpful. Do not use em dashes.',
    '',
    `Source data:\n${JSON.stringify(payload, null, 2)}`
  ].join('\n');
}

function extractChatCompletionsText(data) {
  const content = data?.choices?.[0]?.message?.content;
  if (typeof content === 'string') return content.trim();
  if (Array.isArray(content)) {
    return content
      .map((item) => item?.text || '')
      .join('')
      .trim();
  }
  return '';
}

async function generateWithOpenAI(prompt) {
  const apiKey = process.env.LLM_API_KEY || process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error('LLM_API_KEY or OPENAI_API_KEY is required');
  }

  const baseUrl = (process.env.LLM_BASE_URL || 'https://api.openai.com/v1').replace(/\/$/, '');
  const defaultModel = /deepseek\.com/i.test(baseUrl) ? 'deepseek-v4-pro' : 'gpt-4.1-mini';
  const model = process.env.LLM_MODEL || process.env.OPENAI_MODEL || defaultModel;
  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model,
      temperature: 0.2,
      messages: [
        {
          role: 'system',
          content: 'You produce concise, factual bilingual AI digests.'
        },
        {
          role: 'user',
          content: prompt
        }
      ]
    })
  });

  const data = await response.json();
  if (!response.ok) {
    throw new Error(`LLM API error: ${data?.error?.message || response.status}`);
  }

  const text = extractChatCompletionsText(data);
  if (!text) {
    throw new Error('LLM returned empty content');
  }
  return text;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const payload = buildSelectionPayload(await loadDigestSourceData());
  const digest = args.mock ? buildMockDigest(payload) : await generateWithOpenAI(buildPrompt(payload));
  process.stdout.write(`${digest}\n`);
}

main().catch((error) => {
  console.error(JSON.stringify({ ok: false, message: error.message }));
  process.exit(1);
});
