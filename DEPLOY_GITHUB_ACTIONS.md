# GitHub Actions Deployment

This deployment path runs the digest in GitHub Actions and sends it directly to Feishu without relying on Codex or your local machine.

## Required secrets

Add these repository secrets in GitHub:

- `OPENAI_API_KEY`
- `FEISHU_APP_ID`
- `FEISHU_APP_SECRET`
- `FEISHU_CHAT_ID`

Optional repository variable:

- `OPENAI_MODEL`
  - Recommended starter value: `gpt-4.1-mini`

## Schedule

The workflow file is:

- `.github/workflows/ai-builder-feishu-digest.yml`

It runs every day at `01:00 UTC`, which is `09:00 Asia/Shanghai`.

## First verification

After pushing this repository to GitHub:

1. Open the repository in GitHub
2. Go to `Settings -> Secrets and variables -> Actions`
3. Add the required secrets
4. Go to `Actions`
5. Open `AI Builder Feishu Digest`
6. Click `Run workflow`
7. Confirm the message arrives in the Feishu group

## Scripts used by the workflow

- `scripts/build-bilingual-digest.js`
- `scripts/send-feishu-api.js`
- `scripts/deliver-daily-feishu-digest.js`

## Local smoke test

You can run a mock smoke test locally:

```bash
cd scripts
node deliver-daily-feishu-digest.js --mock
```

This verifies the orchestration path. It does not call OpenAI.
