import express, { Request, Response } from 'express';
import { ipcRequest } from '../ipcBridge';

const router = express.Router();

router.put('/profile', async (req: Request, res: Response) => {
    try {
        await ipcRequest(req, 'update-user-profile', req.body);
        res.json({ message: 'Profile updated successfully' });
    } catch (error) {
        console.error('Failed to update profile via IPC:', error);
        res.status(500).json({ error: 'Failed to update profile' });
    }
});

router.get('/profile', async (req: Request, res: Response) => {
    try {
        console.log('[API] /profile request - req.uid:', req.uid);
        console.log('[API] /profile request - Headers:', {
            'X-User-ID': req.get('X-User-ID'),
            'User-Agent': req.get('User-Agent'),
        });

        const user = await ipcRequest(req, 'get-user-profile');
        console.log('[API] /profile IPC response:', user);

        if (!user) {
            console.log('[API] /profile - User not found in database');
            console.log('[API] /profile - This might mean:');
            console.log('[API] /profile - 1. AuthService is not authenticated');
            console.log('[API] /profile - 2. User does not exist in SQLite database');
            console.log('[API] /profile - 3. getCurrentUserId() returned wrong ID');
            return res.status(404).json({
                error: 'User not found',
                details: 'User profile not found in local database. Authentication may be required.',
            });
        }

        console.log('[API] /profile - Returning user data:', user);
        res.json(user);
    } catch (error: any) {
        console.error('Failed to get profile via IPC:', error);
        res.status(500).json({
            error: 'Failed to get profile',
            details: error.message,
            ipcError: true,
        });
    }
});

router.post('/find-or-create', async (req: Request, res: Response) => {
    try {
        console.log('[API] find-or-create request received:', req.body);

        if (!req.body || !(req.body as any).uid) {
            return res.status(400).json({ error: 'User data with uid is required' });
        }

        const user = await ipcRequest(req, 'find-or-create-user', req.body);
        console.log('[API] find-or-create response:', user);
        res.status(200).json(user);
    } catch (error: any) {
        console.error('Failed to find or create user via IPC:', error);
        console.error('Request body:', req.body);
        res.status(500).json({
            error: 'Failed to find or create user',
            details: error.message,
        });
    }
});

router.delete('/profile', async (req: Request, res: Response) => {
    try {
        await ipcRequest(req, 'delete-account');
        res.status(200).json({ message: 'User account and all data deleted successfully.' });
    } catch (error) {
        console.error('Failed to delete user account via IPC:', error);
        res.status(500).json({ error: 'Failed to delete user account' });
    }
});

router.get('/batch', async (req: Request, res: Response) => {
    try {
        const result = await ipcRequest(req, 'get-batch-data', (req.query as any).include);
        res.json(result);
    } catch (error) {
        console.error('Failed to get batch data via IPC:', error);
        res.status(500).json({ error: 'Failed to get batch data' });
    }
});

module.exports = router;
