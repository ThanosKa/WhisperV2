# AGENTS.md - Backend API Server

## Header

Title: WhisperV2 Webapp Backend API Agent Manifest
Version: 0.2.5
Author: Backend Team <backend@whisper.com>
Maintainer: API Team <api@whisper.com>
Created: 2025-01-15
Last Updated: 2025-01-27

## Overview

Node.js/Express API server providing backend services for WhisperV2 web application and desktop app integration. Handles user identification, data synchronization, and business logic operations via IPC bridge to desktop app. Built with TypeScript for type safety and maintainability.

## Configuration

Runtime: Node.js 20.x.x with TypeScript 5.x
Framework: Express.js 4.19.2 with middleware stack
Database: SQLite integration via desktop app IPC bridge
Communication: REST API for data operations, EventEmitter for IPC
ENV:

- NODE_ENV (development/production)
- whisper_WEB_URL (web app URL for CORS, default: http://localhost:3000)
  Dependencies:
- Express 4.19.2
- TypeScript 5.x (dev dependency)
- CORS 2.8.5
  Security:
- CORS policy enforcement
- User identification via X-User-ID header
- Input validation and sanitization
- IPC bridge security via EventEmitter

## Code Style and Conventions

Language Standards:

- TypeScript: 5.x with strict mode
- JavaScript: ES6+ (ECMAScript 2018+)
- Node.js: 20.x.x

Formatting Rules (Prettier):

- Indentation: 4 spaces (tabWidth: 4)
- Quotes: Single quotes for strings
- Semicolons: Required
- Print Width: 150 characters per line
- Trailing Commas: ES5 style
- Arrow Parens: Avoid parentheses when possible
- End of Line: LF (Unix-style)

Linting Rules:

- Backend Node (backend_node/): ESLint with TypeScript rules
- Run linting: `cd whisper_web && npm run lint`

Naming Conventions:

- Files: camelCase for utilities, PascalCase for types
- Variables/Functions: camelCase
- Constants: UPPER_SNAKE_CASE
- TypeScript Interfaces/Types: PascalCase

TypeScript Usage:

- Strict typing enabled
- Prefer type inference where possible
- Use interfaces for object shapes
- Avoid `any` type
- Run type checking: `cd whisper_web && npm run build:backend`

Code Organization:

- Routes: `routes/` directory (modular route handlers)
- Middleware: `middleware/` directory
- Types: `types/` directory (TypeScript type definitions)
- Build Output: `dist/` (compiled JavaScript)

Commit Messages:

- Format: `<type>(<scope>): <short summary>`
- Types: feat, fix, docs, style, refactor, test, chore
- Scope: Optional component/feature name
- Example: `feat(api): add user profile endpoint`

Development Guidelines:

- Always run TypeScript compilation before building web app
- Use Windows PowerShell commands (not Unix/Mac commands)
- Write complete implementations (no placeholder code)
- Keep responses concise and actionable
- Use TODO lists for complex multi-step tasks

## Capabilities

Tools:

- Development: TypeScript compiler (tsc -p backend_node/tsconfig.json)
- Linting: ESLint with TypeScript rules
- Monitoring: Request logging and error tracking
- Debugging: Source maps and stack trace analysis

Functions:

- On API request: Identify user via X-User-ID header, process data via IPC
- On desktop IPC: Bridge communication between web and desktop via EventEmitter
- On data operations: CRUD operations with validation via IPC bridge
- On error handling: Log errors, return appropriate responses

Behavior:

- Stateless API design with user identification middleware
- Event-driven architecture for desktop integration
- Comprehensive error handling and logging
- Request/response middleware pipeline
- IPC communication via EventEmitter pattern

Limitations:

- Depends on desktop app for database operations
- User identification relies on X-User-ID header from web app
- CORS restrictions limit direct browser access
- IPC bridge requires desktop app to be running

Performance:

- API response time: < 200ms for simple operations
- Memory usage: < 150MB under normal load
- Database query time: < 100ms via IPC bridge
- IPC bridge latency: < 50ms for message delivery

## Implementation

Paths:

- Source Root: whisper_web/backend_node/
- Main Entry: index.ts
- API Routes: routes/ (modular route handlers)
- Middleware: middleware/ (user identification, CORS)
- Types: types/ (TypeScript type definitions)
- Build Output: dist/ (compiled JavaScript)
- Configuration: tsconfig.json

Integration:

- Desktop App: IPC bridge via EventEmitter (eventBridge)
- Web App: REST API communication
- Authentication: User identification via X-User-ID header
- Database: Indirect access via desktop app SQLite
- Monitoring: Request logging and error reporting

### Build Configuration

TypeScript (tsconfig.json):

- Target: ES2020
- Module: commonjs
- Out Dir: dist/
- Root Dir: .
- Strict: true
- Source Maps: enabled
- Types: node

## Usage

### Development Setup

```powershell
# Install dependencies (from whisper_web directory)
cd whisper_web
npm install

# Build backend TypeScript
npm run build:backend

# Build web app (includes backend compilation)
npm run build
```

### API Route Development

```typescript
// Example: User API route
// routes/user.ts
import express, { Request, Response } from 'express';
import { ipcRequest } from '../ipcBridge';

const router = express.Router();

// Get user profile
router.get('/profile', async (req: Request, res: Response) => {
    try {
        // IPC call to desktop app for user data
        const user = await ipcRequest(req, 'get-user-profile');

        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }

        res.json(user);
    } catch (error) {
        console.error('Error fetching user profile:', error);
        res.status(500).json({ error: 'Failed to get profile' });
    }
});

// Update user profile
router.put('/profile', async (req: Request, res: Response) => {
    try {
        await ipcRequest(req, 'update-user-profile', req.body);
        res.json({ message: 'Profile updated successfully' });
    } catch (error) {
        console.error('Error updating profile:', error);
        res.status(500).json({ error: 'Failed to update profile' });
    }
});

module.exports = router;
```

### Middleware Development

```typescript
// Example: User identification middleware
// middleware/auth.ts
import { Request, Response, NextFunction } from 'express';

export function identifyUser(req: Request, _res: Response, next: NextFunction): void {
    const userId = req.get('X-User-ID');

    if (userId) {
        req.uid = userId;
    } else {
        req.uid = 'default_user';
    }

    next();
}
```

### IPC Bridge Implementation

```typescript
// IPC request helper
// ipcBridge.ts
import crypto from 'crypto';
import type { Request } from 'express';

export function ipcRequest<T = any>(req: Request, channel: string, payload?: unknown): Promise<T> {
    return new Promise((resolve, reject) => {
        if (!req.bridge || typeof (req.bridge as any).emit !== 'function') {
            reject(new Error('IPC bridge is not available'));
            return;
        }

        const responseChannel = `${channel}-${crypto.randomUUID()}`;

        const onResponse = (response: { success: boolean; data?: T; error?: string } | undefined) => {
            if (!response) {
                reject(new Error(`No response received from ${channel}`));
                return;
            }

            if (response.success) {
                resolve(response.data as T);
            } else {
                reject(new Error(response.error || `IPC request to ${channel} failed`));
            }
        };

        req.bridge!.once(responseChannel, onResponse);

        try {
            req.bridge!.emit('web-data-request', channel, responseChannel, payload);
        } catch (error: any) {
            req.bridge!.removeAllListeners(responseChannel);
            reject(new Error(`Failed to emit IPC request: ${error.message}`));
        }
    });
}
```

## API Architecture

### Route Structure

```
routes/
├── auth.ts (authentication status endpoint)
├── user.ts (user profile, find-or-create, api-key, batch, delete)
├── conversations.ts (sessions, meetings, questions, stats, search)
└── presets.ts (get presets, update preset)
```

### Middleware Stack

```
middleware/
└── auth.ts (user identification via X-User-ID header)
```

### Type Definitions

```
types/
└── express-augment.ts (Express Request type augmentation)
```

## Authentication Flow

### User Identification

```typescript
// User identification via X-User-ID header
// middleware/auth.ts
export function identifyUser(req: Request, _res: Response, next: NextFunction): void {
    const userId = req.get('X-User-ID');

    if (userId) {
        req.uid = userId;
    } else {
        req.uid = 'default_user';
    }

    next();
}
```

### Request Flow

1. Web app sends request with `X-User-ID` header
2. `identifyUser` middleware extracts user ID and sets `req.uid`
3. Route handler uses `ipcRequest` to communicate with desktop app
4. Desktop app validates user and returns data via IPC bridge
5. API returns response to web app

## Troubleshooting

Common API Issues:

- CORS errors: Verify whisper_WEB_URL environment variable matches web app URL
- Database timeouts: Check IPC bridge connection to desktop app
- User not found: Verify desktop app is running and user is authenticated
- IPC bridge unavailable: Ensure desktop app has initialized eventBridge

Performance Issues:

- Slow API responses: Check IPC bridge performance and desktop app responsiveness
- Memory leaks: Monitor EventEmitter listeners and clean up properly
- High CPU usage: Profile async operations and optimize event handling

Deployment Issues:

- Build failures: Verify TypeScript compilation (`npm run build:backend`)
- Environment variables: Ensure whisper_WEB_URL is set correctly
- Port conflicts: Backend port is auto-allocated by desktop app

## Monitoring and Logging

### Request Logging

```typescript
// Console logging for debugging
console.log('[API] /profile request - req.uid:', req.uid);
console.log('[API] /profile IPC response:', user);
```

### Error Tracking

```typescript
// Error logging in route handlers
catch (error: any) {
    console.error('Failed to get profile via IPC:', error);
    res.status(500).json({
        error: 'Failed to get profile',
        details: error.message,
        ipcError: true,
    });
}
```

## Maintenance

### Version Control

- Semantic versioning aligned with root project (currently 0.2.5)
- Tag API-specific releases for breaking changes
- Maintain API changelog for client compatibility

### Update Procedures

Backend Update Checklist:

- [ ] Test all API endpoints return correct responses
- [ ] Verify IPC bridge communication with desktop app
- [ ] Check user identification flow with X-User-ID header
- [ ] Validate CORS configuration
- [ ] Test error handling and logging functionality
- [ ] Monitor performance metrics and memory usage
- [ ] Update API documentation
- [ ] Verify TypeScript compilation succeeds
- [ ] Test integration with web app

### Monitoring

- API response time tracking
- Error rate and type analysis
- Memory and CPU usage monitoring
- IPC bridge performance metrics
- User identification success rates

### Security Updates

- Dependency vulnerability scanning and patching
- CORS policy updates for new origins
- IPC bridge security review
- Input validation improvements

## Update History

| Date       | Version | Author       | Description                                                                 |
| ---------- | ------- | ------------ | --------------------------------------------------------------------------- |
| 2025-01-27 | 0.2.5   | Backend Team | Updated AGENTS.md: remove WebSocket/JWT, fix IPC pattern, PowerShell syntax |
| 2025-10-14 | v2.0.0  | Backend Team | Major refactor: TypeScript migration, IPC bridge improvements               |
| 2025-09-15 | v1.8.0  | Backend Team | Enhanced IPC bridge, improved error handling                                |
| 2025-08-01 | v1.7.0  | Backend Team | Real-time sync capabilities                                                 |
| 2025-07-15 | v1.6.0  | Backend Team | User identification system improvements                                     |
| 2025-06-15 | v1.5.0  | Backend Team | API route modularization, middleware stack                                  |
| 2025-05-01 | v1.4.0  | Backend Team | IPC bridge for desktop integration                                          |
| 2025-04-01 | v1.3.0  | Backend Team | User identification implementation                                          |
| 2025-03-01 | v1.2.0  | Backend Team | Express.js framework setup                                                  |
| 2025-02-01 | v1.1.0  | Backend Team | Initial API server implementation                                           |
| 2025-01-15 | v1.0.0  | Backend Team | Initial API server implementation                                           |


