#!/usr/bin/env node

import { readFile } from 'fs/promises';

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--chat-id' && argv[i + 1]) {
      args.chatId = argv[i + 1];
      i += 1;
    } else if (arg === '--message' && argv[i + 1]) {
      args.message = argv[i + 1];
      i += 1;
    } else if (arg === '--file' && argv[i + 1]) {
      args.file = argv[i + 1];
      i += 1;
    } else if (arg === '--dry-run') {
      args.dryRun = true;
    }
  }
  return args;
}

async function readStdin() {
  const chunks = [];
  for await (const chunk of process.stdin) {
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString('utf-8');
}

async function readMessage(args) {
  if (args.message) return args.message;
  if (args.file) return readFile(args.file, 'utf-8');
  return readStdin();
}

async function getTenantAccessToken(appId, appSecret) {
  const response = await fetch('https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      app_id: appId,
      app_secret: appSecret
    })
  });

  const data = await response.json();
  if (!response.ok || data.code !== 0 || !data.tenant_access_token) {
    throw new Error(`Feishu token error: ${data.msg || response.status}`);
  }
  return data.tenant_access_token;
}

async function sendTextMessage({ chatId, text, tenantAccessToken }) {
  const response = await fetch('https://open.feishu.cn/open-apis/im/v1/messages?receive_id_type=chat_id', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${tenantAccessToken}`
    },
    body: JSON.stringify({
      receive_id: chatId,
      msg_type: 'text',
      content: JSON.stringify({ text })
    })
  });

  const data = await response.json();
  if (!response.ok || data.code !== 0) {
    throw new Error(`Feishu send error: ${data.msg || response.status}`);
  }
  return data;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const text = (await readMessage(args)).trim();
  if (!text) throw new Error('message text is empty');

  if (args.dryRun) {
    process.stdout.write(`${text}\n`);
    return;
  }

  const chatId = args.chatId || process.env.FEISHU_CHAT_ID;
  const appId = process.env.FEISHU_APP_ID;
  const appSecret = process.env.FEISHU_APP_SECRET;

  if (!chatId) throw new Error('FEISHU_CHAT_ID is required');
  if (!appId) throw new Error('FEISHU_APP_ID is required');
  if (!appSecret) throw new Error('FEISHU_APP_SECRET is required');

  const tenantAccessToken = await getTenantAccessToken(appId, appSecret);
  const result = await sendTextMessage({ chatId, text, tenantAccessToken });
  process.stdout.write(`${JSON.stringify({ ok: true, data: result.data || null }, null, 2)}\n`);
}

main().catch((error) => {
  console.error(JSON.stringify({ ok: false, message: error.message }));
  process.exit(1);
});
