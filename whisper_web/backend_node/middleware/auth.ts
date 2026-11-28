import { type Request, type Response, type NextFunction } from 'express';

export function identifyUser(req: Request, _res: Response, next: NextFunction): void {
    const userId = req.get('X-User-ID');

    if (userId) {
        req.uid = userId;
    } else {
        req.uid = 'default_user';
    }

    next();
}

const authMiddleware = { identifyUser };
export default authMiddleware;
