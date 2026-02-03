# External Services

WhisperV2 connects to external services for speech-to-text and other features. This document explains what they are and how to configure or self-host them.

## Overview

| Service | Purpose | Required? | Default |
|---------|---------|-----------|---------|
| STT Relay | Speech-to-text transcription | Yes (for Listen feature) | Railway deployment |
| Landing Page | Marketing website | No | Vercel |

## STT Relay Server

The Speech-to-Text relay is a WebSocket service that handles audio streaming and transcription.

### What It Does

1. Receives audio streams from the Electron app
2. Forwards to STT provider (Soniox, Deepgram, etc.)
3. Returns real-time transcription results

### Configuration

Set in `.env`:
```bash
# Local development
STT_RELAY_URL=ws://localhost:8080

# Production (your deployed instance)
STT_RELAY_URL=wss://your-stt-server.railway.app
```

### Running Locally Without STT

For development without a real STT server, enable mock mode:

```bash
# In .env
NEXT_PUBLIC_DEV_MOCK=1
```

This provides simulated transcription data for UI development.

### Self-Hosting Options

The STT relay is a separate microservice. To self-host:

1. **Railway** (recommended) - Easy WebSocket support
2. **Fly.io** - Good for WebSocket apps
3. **AWS/GCP** - More setup, more control
4. **Local** - For development

#### Required STT Provider Account

You'll need an account with an STT provider:

| Provider | Website | Notes |
|----------|---------|-------|
| Soniox | [soniox.com](https://soniox.com) | Current default |

### Architecture

```
┌─────────────┐      WebSocket      ┌─────────────┐      API      ┌─────────────┐
│  Electron   │ ──────────────────► │  STT Relay  │ ────────────► │ STT Provider│
│    App      │ ◄────────────────── │   Server    │ ◄──────────── │  (Soniox)   │
└─────────────┘    Transcripts      └─────────────┘               └─────────────┘
```

## Landing Page (Optional)

The landing page is a separate static site for marketing purposes.

### Configuration

Not required for the main app to function. If you want to link to a landing page:

```bash
# In config or .env
LANDING_PAGE_URL=https://your-landing-page.vercel.app
```

### Self-Hosting

The landing page can be deployed to:
- Vercel (recommended for Next.js)
- Netlify
- Any static hosting

## Running Fully Offline

WhisperV2 can run in offline mode with limited features:

1. Set mock mode: `NEXT_PUBLIC_DEV_MOCK=1`
2. STT features will be simulated
3. AI features require API keys but work offline once configured
4. All data is stored locally in SQLite

## Development Without External Services

For pure local development and real data on the dashboard:

```bash
# .env configuration for local-only
API_BASE_URL=http://localhost:3000
STT_RELAY_URL=ws://localhost:8080
NEXT_PUBLIC_DEV_MOCK=0
```

Then run:
```bash
npm run start  # Electron app with mocked STT
```

## Migrating to Your Own Infrastructure

When forking for your own deployment:

1. **Deploy STT Relay** to your preferred platform
2. **Update `.env`** with your service URLs
3. **Configure STT provider** credentials in the relay
4. **Optionally deploy** landing page

No code changes required - just environment configuration.
