import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import { identifyUser } from './middleware/auth';
import { EventEmitter } from 'events';

function createApp(eventBridge: EventEmitter) {
    const app = express();

    const webUrl = process.env.whisper_WEB_URL || 'http://localhost:3000';
    console.log(`🔧 Backend CORS configured for: ${webUrl}`);

    app.use(
        cors({
            origin: webUrl,
            credentials: true,
        })
    );

    app.use(express.json());

    app.get('/', (_req: Request, res: Response) => {
        res.json({ message: 'whisper API is running' });
    });

    app.use((req: Request, _res: Response, next: NextFunction) => {
        req.bridge = eventBridge;
        next();
    });

    app.use('/api', identifyUser);

    app.use('/api/auth', require('./routes/auth'));
    app.use('/api/user', require('./routes/user'));
    app.use('/api/conversations', require('./routes/conversations'));
    app.use('/api/presets', require('./routes/presets'));

    app.get('/api/sync/status', (_req: Request, res: Response) => {
        res.json({
            status: 'online',
            timestamp: new Date().toISOString(),
            version: '1.0.0',
        });
    });

    app.post('/api/desktop/set-user', (req: Request, res: Response) => {
        res.json({
            success: true,
            message: 'Direct IPC communication is now used. This endpoint is deprecated.',
            user: req.body,
            deprecated: true,
        });
    });

    app.get('/api/desktop/status', (_req: Request, res: Response) => {
        res.json({
            connected: true,
            current_user: null,
            communication_method: 'IPC',
            file_based_deprecated: true,
        });
    });

    return app;
}

module.exports = createApp;
