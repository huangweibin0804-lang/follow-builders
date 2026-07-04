#!/usr/bin/env node

import { spawn } from 'child_process';

function runNodeScript(script, args = [], options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [script, ...args], {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: process.env,
      ...options
    });

    const stdout = [];
    const stderr = [];

    child.stdout.on('data', (chunk) => stdout.push(chunk));
    child.stderr.on('data', (chunk) => stderr.push(chunk));
    child.on('error', reject);
    child.on('close', (code) => {
      const out = Buffer.concat(stdout).toString('utf-8');
      const err = Buffer.concat(stderr).toString('utf-8');
      if (code !== 0) {
        reject(new Error(err || out || `process exited with code ${code}`));
        return;
      }
      resolve({ stdout: out, stderr: err });
    });
  });
}

async function main() {
  const mock = process.argv.includes('--mock');
  const dryRun = process.argv.includes('--dry-run');
  const buildArgs = mock ? ['--mock'] : [];
  const digestResult = await runNodeScript('build-bilingual-digest.js', buildArgs, {
    cwd: process.cwd()
  });
  const digest = digestResult.stdout.trim();
  if (!digest) {
    throw new Error('digest generation returned empty content');
  }

  if (dryRun) {
    process.stdout.write(`${digest}\n`);
    return;
  }

  const sendResult = await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ['send-feishu-api.js'], {
      cwd: process.cwd(),
      env: process.env,
      stdio: ['pipe', 'pipe', 'pipe']
    });

    const stdout = [];
    const stderr = [];

    child.stdin.write(digest);
    child.stdin.end();

    child.stdout.on('data', (chunk) => stdout.push(chunk));
    child.stderr.on('data', (chunk) => stderr.push(chunk));
    child.on('error', reject);
    child.on('close', (code) => {
      const out = Buffer.concat(stdout).toString('utf-8');
      const err = Buffer.concat(stderr).toString('utf-8');
      if (code !== 0) {
        reject(new Error(err || out || `process exited with code ${code}`));
        return;
      }
      resolve({ stdout: out, stderr: err });
    });
  });

  process.stdout.write(sendResult.stdout);
}

main().catch((error) => {
  console.error(JSON.stringify({ ok: false, message: error.message }));
  process.exit(1);
});
