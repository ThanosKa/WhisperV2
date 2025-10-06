import express, { Request, Response } from 'express';
import { ipcRequest } from '../ipcBridge';

const router = express.Router();

router.get('/', async (req: Request, res: Response) => {
    try {
        const presets = await ipcRequest(req, 'get-presets');
        res.json(presets);
    } catch (error) {
        console.error('Failed to get presets via IPC:', error);
        res.status(500).json({ error: 'Failed to retrieve presets' });
    }
});

router.put('/:id', async (req: Request, res: Response) => {
    try {
        await ipcRequest(req, 'update-preset', { id: req.params.id, data: req.body });
        res.json({ message: 'Preset updated successfully' });
    } catch (error) {
        console.error('Failed to update preset via IPC:', error);
        res.status(500).json({ error: 'Failed to update preset' });
    }
});

module.exports = router;
