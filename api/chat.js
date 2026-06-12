const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');

// Get models
const Chat = mongoose.model('Chat');
const ChatHistory = mongoose.model('ChatHistory');

// Middleware to get user from token
async function getUserFromToken(req, res, next) {
    try {
        const token = req.headers.authorization?.replace('Bearer ', '');
        if (!token) {
            return res.status(401).json({ error: 'No token provided' });
        }

        const Session = mongoose.model('Session');
        const session = await Session.findOne({ token });
        if (!session) {
            return res.status(401).json({ error: 'Invalid token' });
        }

        req.userId = session.userId;
        next();
    } catch (err) {
        res.status(500).json({ error: 'Token verification failed' });
    }
}

router.use(getUserFromToken);

// ============================================================================
// GET /api/chat/list
// ============================================================================
router.get('/list', async (req, res) => {
    try {
        const chats = await Chat.find({ userId: req.userId })
            .select('_id title createdAt updatedAt')
            .sort({ updatedAt: -1 });

        return res.json(chats);
    } catch (err) {
        console.error('[Chat List Error]', err);
        res.status(500).json({ error: 'Failed to fetch chats' });
    }
});

// ============================================================================
// POST /api/chat/create
// ============================================================================
router.post('/create', async (req, res) => {
    try {
        const { title } = req.body;

        const newChat = new Chat({
            userId: req.userId,
            title: title || 'New Chat'
        });

        await newChat.save();

        return res.status(201).json({
            message: 'Chat created',
            chat: newChat
        });
    } catch (err) {
        console.error('[Chat Create Error]', err);
        res.status(500).json({ error: 'Failed to create chat' });
    }
});

// ============================================================================
// GET /api/chat/:chatId/history
// ============================================================================
router.get('/:chatId/history', async (req, res) => {
    try {
        const { chatId } = req.params;

        // Verify chat belongs to user
        const chat = await Chat.findOne({ _id: chatId, userId: req.userId });
        if (!chat) {
            return res.status(404).json({ error: 'Chat not found' });
        }

        const history = await ChatHistory.find({ chatId })
            .sort({ createdAt: 1 });

        return res.json(history);
    } catch (err) {
        console.error('[Chat History Error]', err);
        res.status(500).json({ error: 'Failed to fetch chat history' });
    }
});

// ============================================================================
// POST /api/chat/:chatId/message
// ============================================================================
router.post('/:chatId/message', async (req, res) => {
    try {
        const { chatId } = req.params;
        const { message, attachments } = req.body;

        if (!message || !message.trim()) {
            return res.status(400).json({ error: 'Message cannot be empty' });
        }

        // Verify chat belongs to user
        const chat = await Chat.findOne({ _id: chatId, userId: req.userId });
        if (!chat) {
            return res.status(404).json({ error: 'Chat not found' });
        }

        // Save user message
        const userMessage = new ChatHistory({
            chatId,
            userId: req.userId,
            role: 'user',
            content: message,
            attachments: attachments || []
        });

        await userMessage.save();

        // Update chat timestamp
        chat.updatedAt = new Date();
        await chat.save();

        return res.json({
            message: 'Message saved',
            data: userMessage
        });
    } catch (err) {
        console.error('[Chat Message Error]', err);
        res.status(500).json({ error: 'Failed to save message' });
    }
});

// ============================================================================
// DELETE /api/chat/:chatId
// ============================================================================
router.delete('/:chatId', async (req, res) => {
    try {
        const { chatId } = req.params;

        // Verify chat belongs to user
        const chat = await Chat.findOne({ _id: chatId, userId: req.userId });
        if (!chat) {
            return res.status(404).json({ error: 'Chat not found' });
        }

        await Chat.deleteOne({ _id: chatId });
        await ChatHistory.deleteMany({ chatId });

        return res.json({ message: 'Chat deleted' });
    } catch (err) {
        console.error('[Chat Delete Error]', err);
        res.status(500).json({ error: 'Failed to delete chat' });
    }
});

// ============================================================================
// PUT /api/chat/:chatId
// ============================================================================
router.put('/:chatId', async (req, res) => {
    try {
        const { chatId } = req.params;
        const { title } = req.body;

        const chat = await Chat.findOneAndUpdate(
            { _id: chatId, userId: req.userId },
            { title, updatedAt: new Date() },
            { new: true }
        );

        if (!chat) {
            return res.status(404).json({ error: 'Chat not found' });
        }

        return res.json({ message: 'Chat updated', chat });
    } catch (err) {
        console.error('[Chat Update Error]', err);
        res.status(500).json({ error: 'Failed to update chat' });
    }
});

module.exports = router;
