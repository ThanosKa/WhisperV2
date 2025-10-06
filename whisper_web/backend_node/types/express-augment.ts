import { EventEmitter } from 'events';

declare global {
    namespace Express {
        interface Request {
            uid?: string;
            bridge?: EventEmitter;
        }
    }
}

export {};
