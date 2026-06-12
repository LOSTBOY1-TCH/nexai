const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');

// Get models
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
// POST /api/ai/chat
// ============================================================================
router.post('/chat', async (req, res) => {
    try {
        const { chatId, message, attachments } = req.body;

        if (!message || !message.trim()) {
            return res.status(400).json({ error: 'Message cannot be empty' });
        }

        // Verify chat belongs to user
        const Chat = mongoose.model('Chat');
        const chat = await Chat.findOne({ _id: chatId, userId: req.userId });
        if (!chat) {
            return res.status(404).json({ error: 'Chat not found' });
        }

        // Get chat history for context
        const history = await ChatHistory.find({ chatId }).sort({ createdAt: 1 });

        // Save user message
        const userMessage = new ChatHistory({
            chatId,
            userId: req.userId,
            role: 'user',
            content: message,
            attachments: attachments || []
        });

        await userMessage.save();

        // TODO: Integrate with actual AI service (OpenAI, Claude, etc.)
        // For now, return a simple echo response
        const aiResponse = `Echo: ${message}`;

        // Save AI response
        const assistantMessage = new ChatHistory({
            chatId,
            userId: req.userId,
            role: 'assistant',
            content: aiResponse
        });

        await assistantMessage.save();

        // Update chat timestamp
        chat.updatedAt = new Date();
        await chat.save();

        return res.json({
            message: 'Response generated',
            userMessage,
            assistantMessage
        });

    } catch (err) {
        console.error('[AI Chat Error]', err);
        res.status(500).json({ error: 'Failed to process chat: ' + err.message });
    }
});

// ============================================================================
// POST /api/ai/stream
// ============================================================================
router.post('/stream', async (req, res) => {
    try {
        const { chatId, message, attachments } = req.body;

        if (!message || !message.trim()) {
            return res.status(400).json({ error: 'Message cannot be empty' });
        }

        // Set headers for streaming
        res.setHeader('Content-Type', 'text/event-stream');
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('Connection', 'keep-alive');
        res.setHeader('Access-Control-Allow-Origin', '*');

        // Send initial connection confirmation
        res.write('data: {"status":"connected"}\n\n');

        // Verify chat belongs to user
        const Chat = mongoose.model('Chat');
        const chat = await Chat.findOne({ _id: chatId, userId: req.userId });
        if (!chat) {
            res.write('data: {"error":"Chat not found"}\n\n');
            res.end();
            return;
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

        // Simulate streaming response
        const responseText = `This is a streaming response to: "${message}". In a real implementation, this would stream tokens from an AI service.`;
        let charIndex = 0;

        const streamInterval = setInterval(() => {
            if (charIndex < responseText.length) {
                res.write(`data: ${JSON.stringify({ 
                    token: responseText.charAt(charIndex),
                    content: responseText.substring(0, charIndex + 1)
                })}\n\n`);
                charIndex++;
            } else {
                clearInterval(streamInterval);
                
                // Save completed response
                const assistantMessage = new ChatHistory({
                    chatId,
                    userId: req.userId,
                    role: 'assistant',
                    content: responseText
                });

                assistantMessage.save().then(() => {
                    chat.updatedAt = new Date();
                    return chat.save();
                }).then(() => {
                    res.write(`data: ${JSON.stringify({ 
                        status: 'completed',
                        messageId: assistantMessage._id 
                    })}\n\n`);
                    res.end();
                }).catch(err => {
                    res.write(`data: ${JSON.stringify({ 
                        status: 'error',
                        error: err.message 
                    })}\n\n`);
                    res.end();
                });
            }
        }, 10); // Adjust speed as needed

    } catch (err) {
        console.error('[AI Stream Error]', err);
        res.write(`data: ${JSON.stringify({ 
            status: 'error',
            error: err.message 
        })}\n\n`);
        res.end();
    }
});

module.exports = router;
