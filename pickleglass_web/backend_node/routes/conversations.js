const express = require('express');
const router = express.Router();
const { ipcRequest } = require('../ipcBridge');

router.get('/', async (req, res) => {
    try {
        const sessions = await ipcRequest(req, 'get-sessions');
        res.json(sessions);
    } catch (error) {
        console.error('Failed to get sessions via IPC:', error);
        res.status(500).json({ error: 'Failed to retrieve sessions' });
    }
});

// Filtered views: meetings (listen) and questions (ask)
router.get('/meetings', async (req, res) => {
    try {
        const sessions = await ipcRequest(req, 'get-sessions');
        const meetings = (sessions || []).filter(s => s.session_type === 'listen');
        res.json(meetings);
    } catch (error) {
        console.error('Failed to get meetings via IPC:', error);
        res.status(500).json({ error: 'Failed to retrieve meetings' });
    }
});

router.get('/questions', async (req, res) => {
    try {
        const sessions = await ipcRequest(req, 'get-sessions');
        const questions = (sessions || []).filter(s => s.session_type === 'ask');
        res.json(questions);
    } catch (error) {
        console.error('Failed to get questions via IPC:', error);
        res.status(500).json({ error: 'Failed to retrieve questions' });
    }
});

router.post('/', async (req, res) => {
    try {
        const result = await ipcRequest(req, 'create-session', req.body);
        res.status(201).json({ ...result, message: 'Session created successfully' });
    } catch (error) {
        console.error('Failed to create session via IPC:', error);
        res.status(500).json({ error: 'Failed to create session' });
    }
});

// (moved GET /:session_id to the bottom to avoid shadowing /search and /stats)

router.put('/:session_id', async (req, res) => {
    try {
        const { title } = req.body || {};
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

router.delete('/:session_id', async (req, res) => {
    try {
        await ipcRequest(req, 'delete-session', req.params.session_id);
        res.status(200).json({ message: 'Session deleted successfully' });
    } catch (error) {
        console.error(`Failed to delete session via IPC for ${req.params.session_id}:`, error);
        res.status(500).json({ error: 'Failed to delete session' });
    }
});

// Aggregate stats: total meeting time (ended sessions) and total user questions
router.get('/stats', async (req, res) => {
    try {
        const sessions = await ipcRequest(req, 'get-sessions');
        const meetings = (sessions || []).filter(s => s.session_type === 'listen');

        // Sum durations; include active sessions up to now
        const nowSec = Math.floor(Date.now() / 1000);
        const totalMeetingSeconds = meetings.reduce((sum, s) => {
            if (!s.started_at) return sum;
            const end = s.ended_at || nowSec;
            const dur = Math.max(0, end - s.started_at);
            return sum + dur;
        }, 0);

        // Count user questions across all sessions by fetching details (could be optimized later)
        const detailPromises = (sessions || []).map(s => ipcRequest(req, 'get-session-details', s.id).catch(() => null));
        const details = await Promise.all(detailPromises);
        const totalQuestions = details.reduce((acc, d) => {
            if (!d || !Array.isArray(d.ai_messages)) return acc;
            return acc + d.ai_messages.filter(m => m.role === 'user').length;
        }, 0);

        res.json({ totalMeetingSeconds, totalQuestions });
    } catch (error) {
        console.error('Failed to get stats via IPC:', error);
        res.status(500).json({ error: 'Failed to retrieve stats' });
    }
});

// The search functionality will be more complex to move to IPC.
// For now, we can disable it or leave it as is, knowing it's a future task.
// Basic title-based search implemented via IPC sessions fetch
router.get('/search', async (req, res) => {
    try {
        const q = (req.query.q || '').toString().trim();
        if (!q) {
            return res.json([]);
        }
        const sessions = await ipcRequest(req, 'get-sessions');
        const needle = q.toLowerCase();
        const results = (sessions || []).filter(s => (s.title || '').toLowerCase().includes(needle));
        res.json(results);
    } catch (error) {
        console.error('Failed to search sessions via IPC:', error);
        res.status(500).json({ error: 'Failed to search conversations' });
    }
});

// GET details by ID (placed after explicit GET routes)
router.get('/:session_id', async (req, res) => {
    try {
        const details = await ipcRequest(req, 'get-session-details', req.params.session_id);
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
