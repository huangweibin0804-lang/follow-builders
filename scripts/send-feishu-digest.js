#!/usr/bin/env node

import { readFile } from 'fs/promises';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { buildRuleDigest, loadDigestSourceData } from './digest-data.js';

const execFileAsync = promisify(execFile);

function parseArgs(argv) {
  const args = { dryRun: false };
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

async function sendToFeishu(chatId, text) {
  const args = [
    'im',
    '+messages-send',
    '--as',
    'bot',
    '--chat-id',
    chatId,
    '--text',
    text,
    '--format',
    'pretty'
  ];
  const { stdout, stderr } = await execFileAsync('lark-cli', args, {
    maxBuffer: 1024 * 1024
  });
  return { stdout, stderr };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.chatId) {
    throw new Error('missing --chat-id');
  }
  let digest = '';

  if (args.message) {
    digest = args.message;
  } else if (args.file) {
    digest = await readFile(args.file, 'utf-8');
  } else {
    const stdinText = await readStdin();
    if (stdinText.trim()) {
      digest = stdinText;
    } else {
      digest = buildRuleDigest(await loadDigestSourceData());
    }
  }

  if (args.dryRun) {
    process.stdout.write(`${digest}\n`);
    return;
  }

  const result = await sendToFeishu(args.chatId, digest);
  process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
}

main().catch((error) => {
  console.error(JSON.stringify({ ok: false, message: error.message }));
  process.exit(1);
});
