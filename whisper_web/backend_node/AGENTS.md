# AGENTS.md - Backend API Server

## Header

Title: WhisperV2 Backend API Agent Manifest
Version: v2.0.0
Author: Backend Team <backend@whisper.com>
Maintainer: API Team <api@whisper.com>
Created: 2025-01-15
Last Updated: 2025-10-14

## Overview

Node.js/Express API server providing backend services for WhisperV2 web application and desktop app integration. Handles authentication, data synchronization, real-time communication, and business logic operations. Built with TypeScript for type safety and maintainability.

## Configuration

Runtime: Node.js 20.x.x with TypeScript 5.x
Framework: Express.js 4.x with middleware stack
Database: SQLite integration via desktop app IPC
Communication: WebSocket for real-time updates, REST API for data operations
ENV:

- PORT (server port, default 3001)
- NODE_ENV (development/production)
- JWT_SECRET (authentication token signing)
- CORS_ORIGIN (allowed frontend origins)
- DATABASE_PATH (SQLite database location)
- WHISPER_WEB_URL (web app URL for CORS)
  Dependencies:
- Express 4.x.x
- TypeScript 5.x.x
- JSON Web Token 9.x.x
- CORS 2.8.x
- WS 8.x.x (WebSocket support)
  Security:
- JWT authentication with expiration
- CORS policy enforcement
- Request rate limiting
- Input validation and sanitization
- Secure WebSocket connections

## Capabilities

Tools:

- Development: TypeScript compiler with watch mode
- Testing: Jest for unit tests, Supertest for API testing
- Linting: ESLint with TypeScript rules
- Documentation: Auto-generated API docs
- Monitoring: Request logging and error tracking
- Debugging: Source maps and stack trace analysis

Functions:

- On user auth: Validate credentials, issue JWT tokens
- On API request: Authenticate, authorize, process data
- On real-time sync: Handle WebSocket connections and messages
- On desktop IPC: Bridge communication between web and desktop
- On data operations: CRUD operations with validation
- On error handling: Log errors, return appropriate responses

Behavior:

- Stateless API design with JWT authentication
- Real-time bidirectional communication via WebSocket
- Event-driven architecture for desktop integration
- Comprehensive error handling and logging
- Request/response middleware pipeline
- Graceful shutdown and cleanup procedures

Limitations:

- Depends on desktop app for database operations
- WebSocket connections require persistent server
- JWT tokens have expiration limits
- Rate limiting affects concurrent users
- CORS restrictions limit direct browser access

Performance:

- API response time: < 200ms for simple operations
- WebSocket latency: < 50ms for message delivery
- Memory usage: < 150MB under normal load
- Concurrent connections: Support for 1000+ WebSocket clients
- Database query time: < 100ms via IPC bridge

## Implementation

Paths:

- Source Root: backend_node/
- Main Entry: index.ts
- API Routes: routes/ (modular route handlers)
- Middleware: middleware/ (authentication, CORS, etc.)
- Types: types/ (TypeScript type definitions)
- Build Output: dist/ (compiled JavaScript)
- Configuration: tsconfig.json, package.json

Integration:

- Desktop App: IPC bridge via EventEmitter/WebSocket
- Web App: REST API and real-time WebSocket communication
- Authentication: JWT token validation and refresh
- Database: Indirect access via desktop app SQLite
- Monitoring: Request logging and error reporting
- Deployment: PM2 process management for production

Testing:

- Unit Tests: Individual function and middleware testing
- Integration Tests: API endpoint testing with mocked database
- WebSocket Tests: Real-time communication testing
- Authentication Tests: JWT validation and security testing
- Performance Tests: Load testing and stress testing

## Usage

### Development Workflow

```bash
# Install dependencies
npm install

# Development server with hot reload
npm run dev

# Build for production
npm run build

# Start production server
npm start

# Run tests
npm test
```

### API Route Development

```typescript
// Example: User API route
// routes/user.ts
import express, { Request, Response } from 'express';
import { authenticateUser } from '../middleware/auth';

const router = express.Router();

// Get user profile
router.get('/profile', authenticateUser, async (req: Request, res: Response) => {
    try {
        const userId = req.user.id;

        // IPC call to desktop app for user data
        const userData = await req.bridge.emit('get-user-profile', userId);

        res.json({
            id: userData.id,
            email: userData.email,
            createdAt: userData.createdAt,
        });
    } catch (error) {
        console.error('Error fetching user profile:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Update user settings
router.put('/settings', authenticateUser, async (req: Request, res: Response) => {
    try {
        const userId = req.user.id;
        const settings = req.body;

        // Validate settings
        if (!settings.theme || !['light', 'dark'].includes(settings.theme)) {
            return res.status(400).json({ error: 'Invalid theme setting' });
        }

        // IPC call to update settings
        await req.bridge.emit('update-user-settings', userId, settings);

        res.json({ success: true });
    } catch (error) {
        console.error('Error updating user settings:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

export default router;
```

### Middleware Development

```typescript
// Example: Authentication middleware
// middleware/auth.ts
import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';

interface AuthenticatedRequest extends Request {
    user?: {
        id: string;
        email: string;
    };
}

export function authenticateUser(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
        const authHeader = req.headers.authorization;

        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({ error: 'Authorization header required' });
        }

        const token = authHeader.substring(7);
        const decoded = jwt.verify(token, process.env.JWT_SECRET!) as {
            id: string;
            email: string;
        };

        req.user = decoded;
        next();
    } catch (error) {
        if (error instanceof jwt.JsonWebTokenError) {
            return res.status(401).json({ error: 'Invalid token' });
        }
        if (error instanceof jwt.TokenExpiredError) {
            return res.status(401).json({ error: 'Token expired' });
        }

        console.error('Authentication error:', error);
        res.status(500).json({ error: 'Authentication failed' });
    }
}
```

### WebSocket Implementation

```typescript
// Example: WebSocket server setup
// index.ts (partial)
import WebSocket from 'ws';
import { EventEmitter } from 'events';

function createWebSocketServer(server: any, eventBridge: EventEmitter) {
    const wss = new WebSocket.Server({ server });

    wss.on('connection', (ws: WebSocket, req) => {
        console.log('WebSocket client connected');

        // Handle incoming messages
        ws.on('message', (message: Buffer) => {
            try {
                const data = JSON.parse(message.toString());

                // Route message to appropriate handler
                switch (data.type) {
                    case 'sync-status':
                        handleSyncStatus(ws, data.payload);
                        break;
                    case 'user-activity':
                        handleUserActivity(ws, data.payload);
                        break;
                    default:
                        ws.send(
                            JSON.stringify({
                                type: 'error',
                                payload: { message: 'Unknown message type' },
                            })
                        );
                }
            } catch (error) {
                console.error('WebSocket message error:', error);
                ws.send(
                    JSON.stringify({
                        type: 'error',
                        payload: { message: 'Invalid message format' },
                    })
                );
            }
        });

        // Handle client disconnection
        ws.on('close', () => {
            console.log('WebSocket client disconnected');
        });
    });

    return wss;
}

function handleSyncStatus(ws: WebSocket, payload: any) {
    // Broadcast sync status to desktop app
    eventBridge.emit('sync-status-update', payload);

    // Send confirmation to client
    ws.send(
        JSON.stringify({
            type: 'sync-status-response',
            payload: { received: true, timestamp: new Date().toISOString() },
        })
    );
}

function handleUserActivity(ws: WebSocket, payload: any) {
    // Process user activity data
    eventBridge.emit('user-activity-received', payload);

    // Acknowledge receipt
    ws.send(
        JSON.stringify({
            type: 'user-activity-acknowledged',
            payload: { id: payload.id },
        })
    );
}
```

### IPC Bridge Implementation

```typescript
// Example: IPC communication with desktop app
// ipcBridge.ts
import { EventEmitter } from 'events';

export class IPCBridge extends EventEmitter {
    constructor() {
        super();
        this.setupEventHandlers();
    }

    private setupEventHandlers() {
        // Handle incoming IPC messages from desktop app
        process.on('message', message => {
            if (message.type === 'desktop-event') {
                this.handleDesktopEvent(message.payload);
            }
        });
    }

    private handleDesktopEvent(payload: any) {
        switch (payload.event) {
            case 'user-session-start':
                this.emit('user-session-started', payload.data);
                break;
            case 'transcription-complete':
                this.emit('transcription-received', payload.data);
                break;
            case 'ai-response-ready':
                this.emit('ai-response-available', payload.data);
                break;
            default:
                console.warn('Unknown desktop event:', payload.event);
        }
    }

    // Send message to desktop app
    sendToDesktop(type: string, data: any) {
        if (process.send) {
            process.send({
                type: 'backend-event',
                payload: { type, data },
            });
        }
    }

    // Request data from desktop app
    async requestFromDesktop(type: string, params: any = {}): Promise<any> {
        return new Promise((resolve, reject) => {
            const requestId = Math.random().toString(36).substring(7);

            const handler = (response: any) => {
                if (response.requestId === requestId) {
                    this.off('desktop-response', handler);
                    if (response.error) {
                        reject(new Error(response.error));
                    } else {
                        resolve(response.data);
                    }
                }
            };

            this.on('desktop-response', handler);

            // Send request to desktop
            this.sendToDesktop('request', {
                id: requestId,
                type,
                params,
            });

            // Timeout after 30 seconds
            setTimeout(() => {
                this.off('desktop-response', handler);
                reject(new Error('Request timeout'));
            }, 30000);
        });
    }
}
```

### Testing API Routes

```typescript
// Example: API route testing
// __tests__/routes/user.test.ts
import request from 'supertest';
import express from 'express';
import userRoutes from '../../routes/user';
import { authenticateUser } from '../../middleware/auth';

describe('/api/user', () => {
    let app: express.Application;

    beforeEach(() => {
        app = express();
        app.use(express.json());
        app.use('/api/user', userRoutes);
    });

    describe('GET /profile', () => {
        it('should return user profile when authenticated', async () => {
            // Mock authentication middleware
            app.use((req, res, next) => {
                req.user = { id: '123', email: 'test@example.com' };
                next();
            });

            // Mock IPC bridge
            app.use((req, res, next) => {
                req.bridge = {
                    emit: jest.fn().mockResolvedValue({
                        id: '123',
                        email: 'test@example.com',
                        createdAt: '2025-01-01T00:00:00Z',
                    }),
                };
                next();
            });

            const response = await request(app).get('/api/user/profile').expect(200);

            expect(response.body).toHaveProperty('id', '123');
            expect(response.body).toHaveProperty('email', 'test@example.com');
        });

        it('should return 401 when not authenticated', async () => {
            const response = await request(app).get('/api/user/profile').expect(401);

            expect(response.body).toHaveProperty('error', 'Authorization header required');
        });
    });
});
```

## API Architecture

### Route Structure

```
routes/
├── auth.ts (authentication endpoints)
├── user.ts (user management)
├── conversations.ts (conversation data)
└── presets.ts (AI model presets)
```

### Middleware Stack

```
middleware/
├── auth.ts (JWT authentication)
└── cors.ts (CORS configuration)
```

### Type Definitions

```
types/
├── user.ts (user-related types)
├── api.ts (API request/response types)
└── websocket.ts (WebSocket message types)
```

## Authentication Flow

### JWT Token Management

```typescript
// Token generation
export function generateToken(user: User): string {
    return jwt.sign(
        {
            id: user.id,
            email: user.email,
            iat: Math.floor(Date.now() / 1000),
        },
        process.env.JWT_SECRET!,
        { expiresIn: '24h' }
    );
}

// Token refresh
export async function refreshToken(oldToken: string): Promise<string> {
    try {
        const decoded = jwt.verify(oldToken, process.env.JWT_SECRET!) as jwt.JwtPayload;

        // Generate new token with same payload
        return jwt.sign(
            {
                id: decoded.id,
                email: decoded.email,
                iat: Math.floor(Date.now() / 1000),
            },
            process.env.JWT_SECRET!,
            { expiresIn: '24h' }
        );
    } catch (error) {
        throw new Error('Invalid refresh token');
    }
}
```

### WebSocket Authentication

```typescript
// Authenticated WebSocket connection
wss.on('connection', (ws: WebSocket, req) => {
    // Extract token from query parameters or headers
    const url = new URL(req.url!, `http://${req.headers.host}`);
    const token = url.searchParams.get('token');

    if (!token) {
        ws.close(1008, 'Authentication required');
        return;
    }

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET!) as {
            id: string;
            email: string;
        };

        // Attach user to WebSocket
        (ws as any).user = decoded;

        // Proceed with authenticated connection
        setupAuthenticatedConnection(ws);
    } catch (error) {
        ws.close(1008, 'Invalid authentication token');
        return;
    }
});
```

## Performance Optimization

### Request Caching

```typescript
// Simple in-memory cache for frequently accessed data
const cache = new Map<string, { data: any; expires: number }>();

export function getCachedData(key: string): any | null {
    const cached = cache.get(key);
    if (!cached || Date.now() > cached.expires) {
        cache.delete(key);
        return null;
    }
    return cached.data;
}

export function setCachedData(key: string, data: any, ttlSeconds: number = 300) {
    cache.set(key, {
        data,
        expires: Date.now() + ttlSeconds * 1000,
    });
}
```

### Connection Pooling

```typescript
// WebSocket connection management
class ConnectionManager {
    private connections = new Map<string, WebSocket>();

    addConnection(userId: string, ws: WebSocket) {
        this.connections.set(userId, ws);

        ws.on('close', () => {
            this.connections.delete(userId);
        });
    }

    broadcastToUser(userId: string, message: any) {
        const ws = this.connections.get(userId);
        if (ws && ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify(message));
        }
    }

    getActiveConnections(): number {
        return this.connections.size;
    }
}
```

## Troubleshooting

### Common API Issues

- Authentication failing: Check JWT secret and token format
- CORS errors: Verify CORS_ORIGIN environment variable
- Database timeouts: Check IPC bridge connection to desktop app
- WebSocket disconnections: Monitor connection stability and implement reconnection
- Rate limiting: Implement request throttling for high-traffic endpoints

### Performance Issues

- Slow API responses: Add database query optimization and caching
- Memory leaks: Monitor EventEmitter listeners and clean up properly
- WebSocket bottlenecks: Implement connection pooling and message queuing
- High CPU usage: Profile async operations and optimize event handling

### Deployment Issues

- Port conflicts: Check PORT environment variable and system ports
- Build failures: Verify TypeScript compilation and dependency versions
- Environment variables: Ensure all required ENV vars are set in production
- SSL certificates: Configure HTTPS for production WebSocket connections

## Monitoring and Logging

### Request Logging

```typescript
// Middleware for request logging
app.use((req: Request, res: Response, next: NextFunction) => {
    const start = Date.now();

    res.on('finish', () => {
        const duration = Date.now() - start;
        console.log(`${req.method} ${req.path} ${res.statusCode} ${duration}ms`);
    });

    next();
});
```

### Error Tracking

```typescript
// Global error handler
app.use((error: Error, req: Request, res: Response, next: NextFunction) => {
    console.error('Unhandled error:', {
        message: error.message,
        stack: error.stack,
        url: req.url,
        method: req.method,
        userAgent: req.headers['user-agent'],
    });

    res.status(500).json({
        error: 'Internal server error',
        requestId: Math.random().toString(36).substring(7),
    });
});
```

## Maintenance

### Version Control

- Semantic versioning aligned with web app
- Tag API-specific releases for breaking changes
- Maintain API changelog for client compatibility

### Update Procedures

Backend Update Checklist:

- [ ] Test all API endpoints return correct responses
- [ ] Verify WebSocket connections work bidirectionally
- [ ] Check authentication flow with JWT tokens
- [ ] Validate IPC bridge communication with desktop app
- [ ] Test error handling and logging functionality
- [ ] Monitor performance metrics and memory usage
- [ ] Update API documentation and client SDKs
- [ ] Verify CORS and security policies
- [ ] Test deployment and rollback procedures

### Monitoring

- API response time tracking and alerting
- WebSocket connection monitoring
- Error rate and type analysis
- Memory and CPU usage monitoring
- IPC bridge performance metrics
- Authentication success/failure rates

### Security Updates

- JWT secret rotation and key management
- Dependency vulnerability scanning and patching
- CORS policy updates for new origins
- Rate limiting rule adjustments
- SSL/TLS certificate renewal
- Security header implementation

## Update History

| Date       | Version | Author       | Description                                              |
| ---------- | ------- | ------------ | -------------------------------------------------------- |
| 2025-10-14 | v2.0.0  | Backend Team | Major refactor: TypeScript migration, WebSocket overhaul |
| 2025-09-15 | v1.8.0  | Backend Team | Enhanced IPC bridge, improved error handling             |
| 2025-08-01 | v1.7.0  | Backend Team | Real-time sync capabilities, connection pooling          |
| 2025-07-15 | v1.6.0  | Backend Team | Authentication system improvements                       |
| 2025-06-15 | v1.5.0  | Backend Team | API route modularization, middleware stack               |
| 2025-05-01 | v1.4.0  | Backend Team | WebSocket implementation for real-time features          |
| 2025-04-01 | v1.3.0  | Backend Team | IPC bridge for desktop integration                       |
| 2025-03-01 | v1.2.0  | Backend Team | JWT authentication implementation                        |
| 2025-02-01 | v1.1.0  | Backend Team | Express.js framework setup                               |
| 2025-01-15 | v1.0.0  | Backend Team | Initial API server implementation                        |
