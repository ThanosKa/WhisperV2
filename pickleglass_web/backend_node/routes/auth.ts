import express, { Request, Response } from 'express';
import { ipcRequest } from '../ipcBridge';

const router = express.Router();

router.get('/status', async (req: Request, res: Response) => {
    try {
        const user = await ipcRequest<{ uid: string; display_name: string }>(req, 'get-user-profile');
        if (!user) {
            return res.status(500).json({ error: 'Default user not initialized' });
        }
        res.json({
            authenticated: true,
            user: {
                id: user.uid,
                name: user.display_name,
            },
        });
    } catch (error) {
        console.error('Failed to get auth status via IPC:', error);
        res.status(500).json({ error: 'Failed to retrieve auth status' });
    }
});

module.exports = router;
