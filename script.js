// ===========================
// NEXAI - JavaScript Logic
// Production-level AI Chat App
// ===========================

class NEXAI {
    constructor() {
        // Configuration
        this.API_URL = 'https://api.bk9.dev/ai/BK92';
        this.AI_NAME = 'NEXAI';
        this.OWNER = 'Lostboy Tech';
        this.CREATOR_BIO = `I'm NEXAI, an advanced AI assistant created by ${this.OWNER}. ${this.OWNER} is a talented developer and creator specializing in building sophisticated bots, websites, and AI systems. I'm designed to provide intelligent, helpful, and creative responses to assist with a wide range of tasks.`;

        // DOM Elements
        this.chatList = document.getElementById('chatList');
        this.messagesContainer = document.getElementById('messages');
        this.messageInput = document.getElementById('messageInput');
        this.sendBtn = document.getElementById('sendBtn');
        this.fileBtn = document.getElementById('fileBtn');
        this.fileInput = document.getElementById('fileInput');
        this.newChatBtn = document.getElementById('newChatBtn');
        this.loadingIndicator = document.getElementById('loadingIndicator');
        this.sidebarToggle = document.getElementById('sidebarToggle');
        this.sidebar = document.querySelector('.sidebar');
        this.sidebarOverlay = document.getElementById('sidebarOverlay');
        this.messagesWrapper = document.querySelector('.messages-wrapper');

        // State
        this.chats = [];
        this.currentChatId = null;
        this.isLoading = false;

        // Initialize
        this.init();
    }

    init() {
        this.loadChatsFromStorage();
        this.attachEventListeners();
        this.renderChatList();

        // Load or create default chat
        if (this.chats.length === 0) {
            this.createNewChat();
        } else {
            this.setActiveChat(this.chats[0].id);
        }
    }

    // ===========================
    // EVENT LISTENERS
    // ===========================

    attachEventListeners() {
        this.sendBtn.addEventListener('click', () => this.sendMessage());
        this.messageInput.addEventListener('keydown', (e) => {
            if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
                this.sendMessage();
            }
        });

        this.newChatBtn.addEventListener('click', () => this.createNewChat());
        this.fileBtn.addEventListener('click', () => this.fileInput.click());
        this.fileInput.addEventListener('change', (e) => this.handleFileUpload(e));

        // Mobile sidebar toggle
        this.sidebarToggle.addEventListener('click', () => this.toggleSidebar());
        this.sidebarOverlay.addEventListener('click', () => this.closeSidebar());

        // Close sidebar on message send (mobile)
        this.messageInput.addEventListener('keydown', () => {
            if (window.innerWidth <= 768) {
                this.closeSidebar();
            }
        });
    }

    // ===========================
    // CHAT MANAGEMENT
    // ===========================

    createNewChat() {
        const chatId = Date.now().toString();
        const newChat = {
            id: chatId,
            title: 'New Chat',
            messages: [],
            createdAt: new Date().toISOString()
        };

        this.chats.unshift(newChat);
        this.saveChatsToStorage();
        this.setActiveChat(chatId);
        this.renderChatList();
        this.messageInput.focus();
    }

    deleteChat(chatId) {
        if (this.chats.length === 1) {
            alert('You need at least one chat. Create a new one first.');
            return;
        }

        this.chats = this.chats.filter(chat => chat.id !== chatId);
        this.saveChatsToStorage();

        if (this.currentChatId === chatId) {
            this.setActiveChat(this.chats[0].id);
        }

        this.renderChatList();
    }

    setActiveChat(chatId) {
        this.currentChatId = chatId;
        this.messagesContainer.innerHTML = '';
        this.messageInput.value = '';
        this.messageInput.focus();

        const chat = this.chats.find(c => c.id === chatId);
        if (chat) {
            // Update chat title based on first message
            if (chat.messages.length > 0 && chat.title === 'New Chat') {
                const firstUserMessage = chat.messages.find(m => m.role === 'user');
                if (firstUserMessage) {
                    chat.title = firstUserMessage.content.substring(0, 30) + (firstUserMessage.content.length > 30 ? '...' : '');
                    this.saveChatsToStorage();
                }
            }

            this.renderMessages(chat.messages);
            this.renderChatList();
            this.scrollToBottom();
        }

        // Close sidebar on mobile
        if (window.innerWidth <= 768) {
            this.closeSidebar();
        }
    }

    // ===========================
    // STORAGE MANAGEMENT
    // ===========================

    saveChatsToStorage() {
        try {
            localStorage.setItem('NEXAI_CHATS', JSON.stringify(this.chats));
        } catch (error) {
            console.error('Error saving chats:', error);
        }
    }

    loadChatsFromStorage() {
        try {
            const stored = localStorage.getItem('NEXAI_CHATS');
            this.chats = stored ? JSON.parse(stored) : [];
        } catch (error) {
            console.error('Error loading chats:', error);
            this.chats = [];
        }
    }

    // ===========================
    // UI RENDERING
    // ===========================

    renderChatList() {
        this.chatList.innerHTML = '';

        this.chats.forEach(chat => {
            const chatItem = document.createElement('div');
            chatItem.className = `chat-item ${chat.id === this.currentChatId ? 'active' : ''}`;
            chatItem.innerHTML = `
                <span class="chat-item-title">${this.escapeHtml(chat.title)}</span>
                <button class="chat-item-delete" title="Delete chat">🗑</button>
            `;

            chatItem.querySelector('.chat-item-title').addEventListener('click', () => {
                this.setActiveChat(chat.id);
            });

            chatItem.querySelector('.chat-item-delete').addEventListener('click', (e) => {
                e.stopPropagation();
                if (confirm('Delete this chat? This action cannot be undone.')) {
                    this.deleteChat(chat.id);
                }
            });

            this.chatList.appendChild(chatItem);
        });
    }

    renderMessages(messages) {
        this.messagesContainer.innerHTML = '';

        messages.forEach(message => {
            this.renderMessage(message);
        });
    }

    renderMessage(message) {
        const messageEl = document.createElement('div');
        messageEl.className = `message ${message.role}`;

        const avatar = document.createElement('div');
        avatar.className = `message-avatar ${message.role}`;
        avatar.textContent = message.role === 'user' ? 'YOU' : this.AI_NAME.charAt(0);

        const contentEl = document.createElement('div');
        contentEl.className = 'message-content';
        contentEl.innerHTML = this.formatMessage(message.content);

        messageEl.appendChild(avatar);
        messageEl.appendChild(contentEl);
        this.messagesContainer.appendChild(messageEl);
    }

    formatMessage(text) {
        if (!text) return '';

        // Escape HTML first to prevent XSS
        let formatted = this.escapeHtml(text);

        // Convert URLs to clickable links
        formatted = formatted.replace(
            /(\bhttps?:\/\/[-A-Z0-9+&@#\/%?=~_|!:,.;]*[-A-Z0-9+&@#\/%=~_|])/gi,
            '<a href="$1" target="_blank" rel="noopener noreferrer">$1</a>'
        );

        // Bold text: **text** or __text__
        formatted = formatted.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
        formatted = formatted.replace(/__(.*?)__/g, '<strong>$1</strong>');

        // Italic text: *text* or _text_
        formatted = formatted.replace(/\*(.*?)\*/g, '<em>$1</em>');
        formatted = formatted.replace(/_(.*?)_/g, '<em>$1</em>');

        // Inline code: `code`
        formatted = formatted.replace(/`([^`]+)`/g, '<code>$1</code>');

        // Line breaks
        formatted = formatted.replace(/\n/g, '<br>');

        return formatted;
    }

    escapeHtml(text) {
        const map = {
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            '"': '&quot;',
            "'": '&#039;'
        };
        return text.replace(/[&<>"']/g, m => map[m]);
    }

    // ===========================
    // MESSAGE HANDLING
    // ===========================

    async sendMessage() {
        const message = this.messageInput.value.trim();
        if (!message || this.isLoading) return;

        // Clear input
        this.messageInput.value = '';

        // Add user message
        const userMessage = {
            role: 'user',
            content: message
        };

        const currentChat = this.chats.find(c => c.id === this.currentChatId);
        currentChat.messages.push(userMessage);
        this.saveChatsToStorage();
        this.renderMessage(userMessage);
        this.scrollToBottom();

        // Show loading indicator
        this.isLoading = true;
        this.loadingIndicator.classList.remove('hidden');
        this.sendBtn.disabled = true;

        try {
            // Get AI response
            const response = await this.callAIAPI(message);
            const aiMessage = {
                role: 'assistant',
                content: response
            };

            currentChat.messages.push(aiMessage);
            this.saveChatsToStorage();

            // Update chat title if it's the first message
            if (currentChat.messages.length === 2) {
                currentChat.title = message.substring(0, 30) + (message.length > 30 ? '...' : '');
                this.saveChatsToStorage();
                this.renderChatList();
            }

            // Render AI response with typing animation
            this.loadingIndicator.classList.add('hidden');
            this.renderMessage(aiMessage);
            this.scrollToBottom();
        } catch (error) {
            console.error('Error:', error);
            this.loadingIndicator.classList.add('hidden');

            const errorMessage = {
                role: 'assistant',
                content: `I encountered an error: ${error.message || 'Unable to connect to the API. Please check your connection and try again.'}`
            };

            currentChat.messages.push(errorMessage);
            this.saveChatsToStorage();
            this.renderMessage(errorMessage);
            this.scrollToBottom();
        } finally {
            this.isLoading = false;
            this.sendBtn.disabled = false;
            this.messageInput.focus();
        }
    }

    async callAIAPI(message) {
        // Check for Lostboy Tech queries
        if (this.isLostboyTechQuery(message)) {
            return this.CREATOR_BIO;
        }

        const systemPrompt = `You are ${this.AI_NAME}, an advanced AI assistant created by ${this.OWNER}. ${this.OWNER} is a developer and creator of bots, websites, and AI systems. Always be helpful, creative, and intelligent in your responses. When asked about your creator or owner, acknowledge that you were created by ${this.OWNER}.`;

        try {
            const encodedSystemPrompt = encodeURIComponent(systemPrompt);
            const encodedMessage = encodeURIComponent(message);
            const apiUrl = `${this.API_URL}?q=${encodedMessage}&BK9=${encodedSystemPrompt}&model=openai%2Fgpt-oss-120b`;

            const response = await fetch(apiUrl, {
                method: 'GET',
                headers: {
                    'Accept': 'application/json',
                    'User-Agent': 'NEXAI-ChatApp/1.0'
                }
            });

            if (!response.ok) {
                throw new Error(`API Error: ${response.statusText}`);
            }

            const data = await response.json();
            let responseText = '';

            // Handle different response formats
            if (typeof data === 'string') {
                responseText = data;
            } else if (data.response) {
                responseText = data.response;
            } else if (data.result) {
                responseText = data.result;
            } else if (data.message) {
                responseText = data.message;
            } else {
                responseText = JSON.stringify(data);
            }

            return responseText || 'I received an empty response. Please try again.';
        } catch (error) {
            console.error('API Call Error:', error);
            throw new Error('Failed to connect to AI service. Please try again later.');
        }
    }

    isLostboyTechQuery(message) {
        const lostboyKeywords = [
            'lostboy',
            'creator',
            'owner',
            'built you',
            'who created you',
            'who made you',
            'your creator',
            'your owner'
        ];

        return lostboyKeywords.some(keyword =>
            message.toLowerCase().includes(keyword)
        );
    }

    // ===========================
    // FILE HANDLING
    // ===========================

    handleFileUpload(event) {
        const file = event.target.files[0];
        if (!file) return;

        if (!file.name.endsWith('.txt')) {
            alert('Please upload a .txt file');
            return;
        }

        const reader = new FileReader();
        reader.onload = (e) => {
            const content = e.target.result;
            this.messageInput.value = content;
            this.messageInput.focus();
        };

        reader.onerror = () => {
            alert('Error reading file');
        };

        reader.readAsText(file);
        // Reset file input
        this.fileInput.value = '';
    }

    // ===========================
    // MOBILE SIDEBAR
    // ===========================

    toggleSidebar() {
        if (this.sidebar.classList.contains('active')) {
            this.closeSidebar();
        } else {
            this.openSidebar();
        }
    }

    openSidebar() {
        this.sidebar.classList.add('active');
        this.sidebarOverlay.classList.add('active');
    }

    closeSidebar() {
        this.sidebar.classList.remove('active');
        this.sidebarOverlay.classList.remove('active');
    }

    // ===========================
    // UTILITY FUNCTIONS
    // ===========================

    scrollToBottom() {
        setTimeout(() => {
            this.messagesWrapper.scrollTop = this.messagesWrapper.scrollHeight;
        }, 0);
    }
}

// ===========================
// INITIALIZATION
// ===========================

document.addEventListener('DOMContentLoaded', () => {
    new NEXAI();
});

// Handle window resize for responsive behavior
window.addEventListener('resize', () => {
    const nexai = window.nexaiInstance;
    if (window.innerWidth > 768) {
        document.querySelector('.sidebar').classList.remove('active');
        document.getElementById('sidebarOverlay').classList.remove('active');
    }
});

// Store instance globally for debugging
window.nexaiInstance = null;
document.addEventListener('DOMContentLoaded', () => {
    window.nexaiInstance = new NEXAI();
});
