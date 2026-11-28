import express, { type Request, type Response, type NextFunction } from 'express';
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

    return app;
}

module.exports = createApp;
