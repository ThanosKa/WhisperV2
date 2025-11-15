import express, { Request, Response } from 'express';
import { ipcRequest } from '../ipcBridge';
import type { Session, SessionDetails } from '../types/session';

const router = express.Router();

router.get('/', async (req: Request, res: Response) => {
    try {
        const sessions = await ipcRequest<Session[]>(req, 'get-sessions');
        res.json(sessions);
    } catch (error) {
        console.error('Failed to get sessions via IPC:', error);
        res.status(500).json({ error: 'Failed to retrieve sessions' });
    }
});

router.get('/meetings', async (req: Request, res: Response) => {
    try {
        const sessions = await ipcRequest<Session[]>(req, 'get-sessions');
        const meetings = (sessions || []).filter(s => s.session_type === 'listen');

        const limit = Math.max(1, Math.min(parseInt((req.query.limit as string) || '10', 10), 50));
        const offset = Math.max(0, parseInt((req.query.offset as string) || '0', 10));

        const page = meetings.slice(offset, offset + limit);
        res.json({
            items: page,
            nextOffset: offset + page.length < meetings.length ? offset + page.length : null,
            total: meetings.length,
        });
    } catch (error) {
        console.error('Failed to get meetings via IPC:', error);
        res.status(500).json({ error: 'Failed to retrieve meetings' });
    }
});

router.get('/questions', async (req: Request, res: Response) => {
    try {
        const sessions = await ipcRequest<Session[]>(req, 'get-sessions');
        const questions = (sessions || []).filter(s => s.session_type === 'ask');

        const limit = Math.max(1, Math.min(parseInt((req.query.limit as string) || '10', 10), 50));
        const offset = Math.max(0, parseInt((req.query.offset as string) || '0', 10));

        const page = questions.slice(offset, offset + limit);
        res.json({
            items: page,
            nextOffset: offset + page.length < questions.length ? offset + page.length : null,
            total: questions.length,
        });
    } catch (error) {
        console.error('Failed to get questions via IPC:', error);
        res.status(500).json({ error: 'Failed to retrieve questions' });
    }
});

router.post('/', async (req: Request, res: Response) => {
    try {
        const result = await ipcRequest(req, 'create-session', req.body);
        res.status(201).json({ ...(result as object), message: 'Session created successfully' });
    } catch (error) {
        console.error('Failed to create session via IPC:', error);
        res.status(500).json({ error: 'Failed to create session' });
    }
});

router.put('/:session_id', async (req: Request, res: Response) => {
    try {
        const { title } = (req.body || {}) as { title?: string };
        if (!title || typeof title !== 'string') {
            return res.status(400).json({ error: 'title is required' });
        }
        const result = await ipcRequest(req, 'update-session-title', { id: req.params.session_id, title });
        res.json(result || { changes: 1 });
    } catch (error) {
        console.error(`Failed to update session title via IPC for ${req.params.session_id}:`, error);
        res.status(500).json({ error: 'Failed to update session title' });
    }
});

router.delete('/:session_id', async (req: Request, res: Response) => {
    try {
        await ipcRequest(req, 'delete-session', req.params.session_id);
        res.status(200).json({ message: 'Session deleted successfully' });
    } catch (error) {
        console.error(`Failed to delete session via IPC for ${req.params.session_id}:`, error);
        res.status(500).json({ error: 'Failed to delete session' });
    }
});

router.get('/stats', async (req: Request, res: Response) => {
    try {
        const sessions = await ipcRequest<Session[]>(req, 'get-sessions');
        const meetings = (sessions || []).filter(s => s.session_type === 'listen');

        const nowSec = Math.floor(Date.now() / 1000);
        const totalMeetingSeconds = meetings.reduce((sum: number, s: Session) => {
            if (!s.started_at) return sum;
            const end = s.ended_at || nowSec;
            const dur = Math.max(0, end - s.started_at);
            return sum + dur;
        }, 0);

        const detailPromises = (sessions || []).map(s => ipcRequest<SessionDetails | null>(req, 'get-session-details', s.id).catch(() => null));
        const details = await Promise.all(detailPromises);
        const totalQuestions = details.reduce((acc: number, d: SessionDetails | null) => {
            if (!d || !Array.isArray(d.ai_messages)) return acc;
            return acc + d.ai_messages.filter((m: { role: string }) => m.role === 'user').length;
        }, 0);

        res.json({ totalMeetingSeconds, totalQuestions });
    } catch (error) {
        console.error('Failed to get stats via IPC:', error);
        res.status(500).json({ error: 'Failed to retrieve stats' });
    }
});

router.get('/search', async (req: Request, res: Response) => {
    try {
        const q = ((req.query.q as string) || '').toString().trim();
        if (!q) {
            return res.json([]);
        }
        const sessions = await ipcRequest<Session[]>(req, 'get-sessions');
        const needle = q.toLowerCase();
        const results = (sessions || []).filter(s => (s.title || '').toLowerCase().includes(needle));
        res.json(results);
    } catch (error) {
        console.error('Failed to search sessions via IPC:', error);
        res.status(500).json({ error: 'Failed to search conversations' });
    }
});

// Paginated, scoped search: supports searching by title (default) or summaries when scope=summary
router.get('/search/page', async (req: Request, res: Response) => {
    try {
        const scope = ((req.query.scope as string) || 'title').toString().trim().toLowerCase() as 'title' | 'summary' | 'all';
        const q = ((req.query.q as string) || '').toString().trim().toLowerCase();
        const limit = Math.max(1, Math.min(parseInt((req.query.limit as string) || '10', 10), 50));
        const offset = Math.max(0, parseInt((req.query.offset as string) || '0', 10));

        const sessions = await ipcRequest<Session[]>(req, 'get-sessions');
        const ordered = sessions || []; // already ordered DESC by started_at from repository

        let filtered: Session[] = [];

        if (scope === 'all') {
            if (!q) {
                const page = ordered.slice(offset, offset + limit);
                return res.json({
                    items: page,
                    nextOffset: offset + page.length < ordered.length ? offset + page.length : null,
                    total: ordered.length,
                });
            }
            // Filter by title for all sessions and by summary for meetings; keep original order
            const titleMatches = new Set(ordered.filter(s => ((s.title || '') as string).toLowerCase().includes(q)).map(s => s.id as string));
            const listenSessions = ordered.filter(s => s.session_type === 'listen');
            const detailPromises = listenSessions.map(s => ipcRequest<SessionDetails | null>(req, 'get-session-details', s.id).catch(() => null));
            const details = await Promise.all(detailPromises);
            const summaryMatches = new Set<string>();
            details.forEach((d, idx) => {
                if (!d || !d.summary) return;
                const tldr = ((d.summary.tldr || '') as string).toLowerCase();
                const text = ((d.summary.text || '') as string).toLowerCase();
                if (tldr.includes(q) || text.includes(q)) {
                    summaryMatches.add(listenSessions[idx].id as string);
                }
            });
            filtered = ordered.filter(s => titleMatches.has(s.id as string) || summaryMatches.has(s.id as string));
            const page = filtered.slice(offset, offset + limit);
            return res.json({
                items: page,
                nextOffset: offset + page.length < filtered.length ? offset + page.length : null,
                total: filtered.length,
            });
        }

        if (scope === 'summary') {
            // If query empty, just list meetings (listen) paginated
            const listenSessions = ordered.filter(s => s.session_type === 'listen');
            if (!q) {
                const page = listenSessions.slice(offset, offset + limit);
                return res.json({
                    items: page,
                    nextOffset: offset + page.length < listenSessions.length ? offset + page.length : null,
                    total: listenSessions.length,
                });
            }

            // With query, fetch details to access summary and filter
            const detailPromises = listenSessions.map(s => ipcRequest<SessionDetails | null>(req, 'get-session-details', s.id).catch(() => null));
            const details = await Promise.all(detailPromises);
            const needle = q;
            filtered = listenSessions.filter((s, idx) => {
                const d = details[idx];
                if (!d || !d.summary) return false;
                const tldr = (d.summary.tldr || '').toLowerCase();
                const text = (d.summary.text || '').toLowerCase();
                return tldr.includes(needle) || text.includes(needle);
            });
        } else {
            // Default: title search
            if (!q) {
                return res.json({ items: [], nextOffset: null, total: 0 });
            }
            const needle = q;
            filtered = ordered.filter(s => (s.title || '').toLowerCase().includes(needle));
        }

        const page = filtered.slice(offset, offset + limit);
        res.json({
            items: page,
            nextOffset: offset + page.length < filtered.length ? offset + page.length : null,
            total: filtered.length,
        });
    } catch (error) {
        console.error('Failed to perform paginated search via IPC:', error);
        res.status(500).json({ error: 'Failed to search conversations (paged)' });
    }
});

router.get('/:session_id', async (req: Request, res: Response) => {
    try {
        const details = await ipcRequest<SessionDetails>(req, 'get-session-details', req.params.session_id);
        if (!details) {
            return res.status(404).json({ error: 'Session not found' });
        }
        res.json(details);
    } catch (error) {
        console.error(`Failed to get session details via IPC for ${req.params.session_id}:`, error);
        res.status(500).json({ error: 'Failed to retrieve session details' });
    }
});

module.exports = router;
