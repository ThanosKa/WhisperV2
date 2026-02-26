# WhisperV2 Setup Guide

Complete guide for developers to fork, install, and run WhisperV2.

## System Requirements

| Platform | Minimum Version | Notes |
|----------|-----------------|-------|
| macOS    | 11.0 (Big Sur)  | Full support including system audio capture |
| Windows  | 10 (1903+)      | Requires Visual Studio Build Tools |
| Linux    | Ubuntu 20.04+   | Audio capture may require PulseAudio |

### Required Software

| Software | Version | Installation |
|----------|---------|--------------|
| Node.js  | 20.x    | [nvm](https://github.com/nvm-sh/nvm) recommended |
| Python   | 3.9+    | Required for native module compilation |
| Git      | 2.x+    | For version control |

### Windows Only

Install Visual Studio Build Tools:
```bash
npm install --global windows-build-tools
# OR install Visual Studio 2022 with "Desktop development with C++" workload
```

### macOS Only

Install Xcode Command Line Tools:
```bash
xcode-select --install
```

## Quick Start

### 1. Clone and Install

```bash
git clone https://github.com/YOUR_USERNAME/WhisperV2.git
cd WhisperV2

# Ensure Node 20
node --version  # Should show v20.x.x

# Install all dependencies (root + whisper_web)
npm run setup
```

### 2. Configure Environment

```bash
# Copy example env file
cp .env.example .env

# Edit .env with your settings
# At minimum, set API_BASE_URL and STT_RELAY_URL
```

### 3. Run Development Server

```bash
# Option A: Full desktop app (Electron + Next.js)
npm run start

# Option B: Web UI only (faster for UI development)
cd whisper_web && npm run dev
```

## Environment Variables

See `.env.example` for all available options. Here's what's required vs optional:

### Required for Production

| Variable | Description | Example |
|----------|-------------|---------|
| `API_BASE_URL` | Backend API URL | `http://localhost:3000` |
| `STT_RELAY_URL` | Speech-to-text WebSocket | `wss://your-stt-server.com` |

### Required for macOS Distribution

| Variable | Description | How to Get |
|----------|-------------|------------|
| `APPLE_ID` | Apple Developer email | Your Apple account |
| `APPLE_APP_SPECIFIC_PASSWORD` | App-specific password | [Generate here](https://appleid.apple.com/account/manage) |
| `APPLE_TEAM_ID` | Team ID | [Find here](https://developer.apple.com/account) → Membership |

### Optional (AI Features)

| Variable | Description | How to Get |
|----------|-------------|------------|
| `OPENAI_API_KEY` | OpenAI GPT models | [OpenAI Platform](https://platform.openai.com/api-keys) |
| `GEMINI_API_KEY` | Google Gemini models | [Google AI Studio](https://makersuite.google.com/app/apikey) |
| `OPENROUTER_API_KEY` | Multi-provider routing | [OpenRouter](https://openrouter.ai/keys) |

## Development Workflows

### Desktop App Development

```bash
# Build renderer and start Electron
npm run start

# Watch mode (rebuild on changes)
npm run watch:renderer
# Then in another terminal:
npm run electron
```

### Web UI Development

```bash
cd whisper_web
npm run dev
# Opens at http://localhost:3000
```

### Running Without External Services

For development without the STT relay server:

```bash
# In .env
NEXT_PUBLIC_DEV_MOCK=1
```

This enables mock mode with simulated transcription data.

## Building for Distribution

### Development Build

```bash
npm run build:all  # Builds renderer + web
npm run package    # Creates unpacked app
```

### Production Build

```bash
# macOS (requires Apple credentials in .env)
npm run dist:mac

# Windows
npm run dist:win

# Linux
npm run dist:linux

# All platforms
npm run dist:all
```

### Code Signing (macOS)

1. Ensure you have an Apple Developer account
2. Create an App-Specific Password at [appleid.apple.com](https://appleid.apple.com/account/manage)
3. Set credentials in `.env`:
   ```
   APPLE_ID=your@email.com
   APPLE_APP_SPECIFIC_PASSWORD=xxxx-xxxx-xxxx-xxxx
   APPLE_TEAM_ID=XXXXXXXXXX
   ```
4. Run `npm run dist:mac`

## Database

WhisperV2 uses SQLite for local data storage.

- **Location**: `~/.whisper/` (user home directory)
- **Auto-init**: Database and tables are created automatically on first run
- **Schema**: See `src/features/common/config/schema.js`

For more details, see [DATABASE.md](./DATABASE.md).

## External Services

WhisperV2 connects to:

1. **STT Relay Server** - WebSocket service for speech-to-text
2. **Landing Page** (optional) - Marketing site on Vercel

For self-hosting and configuration details, see [EXTERNAL_SERVICES.md](./EXTERNAL_SERVICES.md).

## Testing

```bash
# Desktop unit tests
npm test

# Desktop E2E tests
npm run test:e2e

# Web tests
cd whisper_web
npm run test
npm run test:e2e
```

## Troubleshooting

### Node version errors

```bash
nvm install 20
nvm use 20
```

### Native module build failures (Windows)

```bash
npm install --global windows-build-tools
# Then delete node_modules and reinstall
rm -rf node_modules
npm install
```

### Native module build failures (macOS)

```bash
xcode-select --install
# Then reinstall
rm -rf node_modules
npm install
```

### SQLite errors

Delete the database to reset:
```bash
rm -rf ~/.whisper/whisper.db*
```

### Electron won't start

Rebuild native modules:
```bash
npm run rebuild
# or
npx electron-rebuild
```

## Project Structure

```
WhisperV2/
├── src/                    # Electron main process
│   ├── features/           # Feature modules
│   │   ├── common/         # Shared utilities, config, SQLite
│   │   ├── ask/            # Ask feature
│   │   └── listen/         # Listen/transcription feature
│   ├── services/           # Core services (IPC, windows)
│   └── main.js             # Electron entry point
├── whisper_web/            # Next.js web UI
│   ├── src/                # React components, pages
│   ├── backend_node/       # Express bridge server
│   └── e2e/                # Playwright E2E tests
├── tests/                  # Desktop tests (Jest + Playwright)
├── docs/                   # Architecture documentation
└── .cursor/agents/         # AI agent documentation
```

## Next Steps

- Read [AGENTS.md](./AGENTS.md) for codebase navigation
- Read [docs/](./docs/) for architecture deep-dives
- Check `.cursor/agents/` for detailed component guides
