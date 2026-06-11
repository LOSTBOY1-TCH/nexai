// ===========================
// NEXAI - Premium AI Chat Application
// Advanced Memory System & ChatGPT-Style Interface
// ===========================

class NEXAI {
    constructor() {
        // Configuration
        this.API_URL = 'https://api.bk9.dev/ai/BK92';
        this.AI_NAME = 'NEXAI';
        this.OWNER = 'Lostboy Tech';
        this.STORAGE_VERSION = 2;

        // Storage Keys
        this.STORAGE_KEYS = {
            CHATS: 'NEXAI_CHATS_v2',
            CHAT_INDEX: 'NEXAI_CHAT_INDEX_v2',
            MEMORY: 'NEXAI_MEMORY',
            GLOBAL_MEMORY: 'NEXAI_GLOBAL_MEMORY',
            PREFERENCES: 'NEXAI_PREFERENCES',
            USER_PROFILE: 'NEXAI_USER_PROFILE'
        };

        // DOM Elements
        this.elements = {
            sidebar: document.getElementById('sidebar'),
            sidebarToggle: document.getElementById('sidebarToggle'),
            sidebarOverlay: document.getElementById('sidebarOverlay'),
            logo: document.querySelector('.logo'),
            newChatBtn: document.getElementById('newChatBtn'),
            chatList: document.getElementById('chatList'),
            searchInput: document.getElementById('searchInput'),
            messagesContainer: document.getElementById('messages'),
            messagesWrapper: document.getElementById('messagesWrapper'),
            messageInput: document.getElementById('messageInput'),
            sendBtn: document.getElementById('sendBtn'),
            voiceBtn: document.getElementById('voiceBtn'),
            fileBtn: document.getElementById('fileBtn'),
            fileInput: document.getElementById('fileInput'),
            loadingIndicator: document.getElementById('loadingIndicator'),
            chatActionsModal: document.getElementById('chatActionsModal'),
            modalClose: document.getElementById('modalClose'),
            memoryModal: document.getElementById('memoryModal'),
            memoryModalClose: document.getElementById('memoryModalClose'),
            headerMemoryBtn: document.getElementById('headerMemoryBtn')
        };

        // State
        this.chats = [];
        this.chatIndex = [];
        this.currentChatId = null;
        this.isLoading = false;
        this.stopStreaming = false;
        this.currentFileContext = null;
        this.userMemory = {};
        this.globalMemory = {};
        this.preferences = {
            theme: 'dark',
            notifications: true,
            autoTitles: true
        };

        // Voice Recognition Setup
        this.recognition = null;
        this.isListening = false;
        this.setupSpeechRecognition();

        // Initialize Application
        this.init();
    }

    // ===========================
    // INITIALIZATION
    // ===========================

    init() {
        this.loadAllData();
        this.attachEventListeners();
        this.renderChatList();

        // Load or create default chat
        if (this.chats.length === 0) {
            this.createNewChat();
        } else {
            this.setActiveChat(this.chatIndex[0]?.id || this.chats[0].id);
        }

        this.focusInput();
    }

    loadAllData() {
        this.loadChatsFromStorage();
        this.loadChatIndex();
        this.loadUserMemory();
        this.loadGlobalMemory();
        this.loadPreferences();
    }

    // ===========================
    // EVENT LISTENERS
    // ===========================

    attachEventListeners() {
        // Message sending
        this.elements.sendBtn.addEventListener('click', () => this.sendMessage());
        this.elements.messageInput.addEventListener('keydown', (e) => {
            if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
                this.sendMessage();
            }
        });

        // Chat management
        this.elements.newChatBtn.addEventListener('click', () => this.createNewChat());
        this.elements.fileBtn.addEventListener('click', () => this.elements.fileInput.click());
        this.elements.fileInput.addEventListener('change', (e) => this.handleFileUpload(e));

        // Voice input
        this.elements.voiceBtn.addEventListener('click', () => this.toggleVoiceInput());

        // Search
        this.elements.searchInput.addEventListener('input', (e) => this.searchChats(e.target.value));

        // Mobile sidebar
        this.elements.sidebarToggle.addEventListener('click', () => this.toggleSidebar());
        this.elements.sidebarOverlay.addEventListener('click', () => this.closeSidebar());

        // Modal close
        this.elements.modalClose.addEventListener('click', () => this.closeModal());
        this.elements.memoryModalClose.addEventListener('click', () => this.closeMemoryModal());

        // Memory button
        this.elements.headerMemoryBtn.addEventListener('click', () => this.showMemory());

        // Close sidebar on message send (mobile)
        this.elements.messageInput.addEventListener('keydown', () => {
            if (window.innerWidth <= 768) {
                this.closeSidebar();
            }
        });
    }

    // ===========================
    // CHAT MANAGEMENT
    // ===========================

    createNewChat() {
        const chatId = `chat_${Date.now()}`;
        const newChat = {
            id: chatId,
            title: 'New Chat',
            messages: [],
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
        };

        this.chats.push(newChat);
        this.chatIndex.unshift({
            id: chatId,
            title: 'New Chat',
            createdAt: new Date().toISOString()
        });

        this.saveAllData();
        this.setActiveChat(chatId);
        this.renderChatList();
        this.focusInput();
    }

    setActiveChat(chatId) {
        this.currentChatId = chatId;
        this.elements.messagesContainer.innerHTML = '';
        this.elements.messageInput.value = '';
        this.focusInput();

        const chat = this.chats.find(c => c.id === chatId);
        if (chat) {
            this.renderMessages(chat.messages);
            this.renderChatList();
            this.scrollToBottom();
        }

        // Close sidebar on mobile
        if (window.innerWidth <= 768) {
            this.closeSidebar();
        }
    }

    deleteChat(chatId) {
        if (this.chats.length === 1) {
            alert('You need at least one chat. Create a new one first.');
            return;
        }

        this.chats = this.chats.filter(chat => chat.id !== chatId);
        this.chatIndex = this.chatIndex.filter(item => item.id !== chatId);
        this.saveAllData();

        if (this.currentChatId === chatId) {
            const nextChat = this.chats[0] || this.createNewChat();
            this.setActiveChat(nextChat.id);
        }

        this.renderChatList();
    }

    renameChat(chatId, newTitle) {
        const chat = this.chats.find(c => c.id === chatId);
        const indexItem = this.chatIndex.find(i => i.id === chatId);

        if (chat) {
            chat.title = newTitle;
            chat.updatedAt = new Date().toISOString();
        }
        if (indexItem) {
            indexItem.title = newTitle;
        }

        this.saveAllData();
        this.renderChatList();
    }

    duplicateChat(chatId) {
        const originalChat = this.chats.find(c => c.id === chatId);
        if (!originalChat) return;

        const newChatId = `chat_${Date.now()}`;
        const newChat = {
            id: newChatId,
            title: `${originalChat.title} (Copy)`,
            messages: JSON.parse(JSON.stringify(originalChat.messages)),
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
        };

        this.chats.push(newChat);
        this.chatIndex.unshift({
            id: newChatId,
            title: newChat.title,
            createdAt: new Date().toISOString()
        });

        this.saveAllData();
        this.setActiveChat(newChatId);
        this.renderChatList();
    }

    clearChat(chatId) {
        const chat = this.chats.find(c => c.id === chatId);
        if (chat) {
            chat.messages = [];
            chat.updatedAt = new Date().toISOString();
            this.saveAllData();
            this.setActiveChat(chatId);
        }
    }

    // ===========================
    // CHAT ACTIONS (Modal)
    // ===========================

    showChatActions(chatId) {
        const chat = this.chats.find(c => c.id === chatId);
        if (!chat) return;

        const modalBody = document.getElementById('modalBody');
        modalBody.innerHTML = `
            <div class="action-group">
                <label>Rename Chat</label>
                <div style="display: flex; gap: 8px;">
                    <input type="text" id="renameInput" value="${this.escapeHtml(chat.title)}" class="action-input" placeholder="New chat title">
                    <button class="action-btn primary" id="renameConfirm">
                        <i class="fas fa-check"></i> Rename
                    </button>
                </div>
            </div>
            <div class="action-group">
                <button class="action-btn" id="duplicateBtn">
                    <i class="fas fa-copy"></i> Duplicate Chat
                </button>
            </div>
            <div class="action-group">
                <button class="action-btn" id="exportBtn">
                    <i class="fas fa-download"></i> Export Chat
                </button>
            </div>
            <div class="action-group">
                <button class="action-btn danger" id="clearBtn">
                    <i class="fas fa-eraser"></i> Clear Messages
                </button>
            </div>
            <div class="action-group">
                <button class="action-btn danger" id="deleteBtn">
                    <i class="fas fa-trash"></i> Delete Chat
                </button>
            </div>
        `;

        document.getElementById('renameConfirm').addEventListener('click', () => {
            const newTitle = document.getElementById('renameInput').value.trim();
            if (newTitle) {
                this.renameChat(chatId, newTitle);
                this.closeModal();
            }
        });

        document.getElementById('duplicateBtn').addEventListener('click', () => {
            this.duplicateChat(chatId);
            this.closeModal();
        });

        document.getElementById('exportBtn').addEventListener('click', () => {
            this.exportChat(chatId);
            this.closeModal();
        });

        document.getElementById('clearBtn').addEventListener('click', () => {
            if (confirm('Clear all messages in this chat? This cannot be undone.')) {
                this.clearChat(chatId);
                this.closeModal();
            }
        });

        document.getElementById('deleteBtn').addEventListener('click', () => {
            if (confirm('Delete this chat? This cannot be undone.')) {
                this.deleteChat(chatId);
                this.closeModal();
            }
        });

        this.openModal();
    }

    exportChat(chatId) {
        const chat = this.chats.find(c => c.id === chatId);
        if (!chat) return;

        const exportData = {
            chat: chat,
            exportDate: new Date().toISOString(),
            version: this.STORAGE_VERSION
        };

        const dataStr = JSON.stringify(exportData, null, 2);
        const dataBlob = new Blob([dataStr], { type: 'application/json' });
        const url = URL.createObjectURL(dataBlob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `${chat.title.replace(/\s+/g, '_')}_${Date.now()}.json`;
        link.click();
        URL.revokeObjectURL(url);
    }

    // ===========================
    // SEARCH FUNCTIONALITY
    // ===========================

    searchChats(query) {
        const searchQuery = query.toLowerCase();
        const filtered = this.chatIndex.filter(item =>
            item.title.toLowerCase().includes(searchQuery)
        );

        this.renderChatList(filtered);
    }

    // ===========================
    // MEMORY SYSTEM
    // ===========================

    addToMemory(key, value) {
        this.userMemory[key] = {
            value: value,
            addedAt: new Date().toISOString()
        };
        this.saveUserMemory();
    }

    removeFromMemory(key) {
        delete this.userMemory[key];
        this.saveUserMemory();
    }

    getMemory(key) {
        return this.userMemory[key]?.value || null;
    }

    showMemory() {
        const memoryContent = document.getElementById('memoryContent');
        const globalMemoryEntries = Object.entries(this.globalMemory);
        const chatMemoryEntries = Object.entries(this.userMemory);

        if (globalMemoryEntries.length === 0 && chatMemoryEntries.length === 0) {
            memoryContent.innerHTML = `
                <div class="memory-empty">
                    <i class="fas fa-brain"></i>
                    <p>No memories saved yet.</p>
                    <p style="font-size: 0.9em; color: var(--text-secondary); margin-top: 10px;">
                        Chat history is auto-saved! Use "remember" to save info across all chats.
                    </p>
                </div>
            `;
        } else {
            let html = '<div class="memory-list">';

            // Show global persistent memories first
            if (globalMemoryEntries.length > 0) {
                html += '<div class="memory-section"><h4 style="margin: 0 0 10px; color: var(--primary-color); font-size: 0.95em;">🌍 Persistent (All Chats)</h4>';
                globalMemoryEntries.forEach(([key, entry]) => {
                    const date = new Date(entry.addedAt);
                    const formattedDate = date.toLocaleDateString() + ' ' + date.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
                    html += `
                        <div class="memory-item global-memory">
                            <div class="memory-header">
                                <span style="font-size: 0.9em; color: var(--primary-color); font-weight: 600;">💾</span>
                                <button class="memory-delete" onclick="delete nexaiInstance.globalMemory['${this.escapeHtml(key)}']; nexaiInstance.saveGlobalMemory(); nexaiInstance.showMemory();" title="Delete memory">
                                    <i class="fas fa-trash"></i>
                                </button>
                            </div>
                            <div class="memory-value">${this.escapeHtml(entry.value)}</div>
                            <div class="memory-date">${formattedDate}</div>
                        </div>
                    `;
                });
                html += '</div>';
            }

            // Show chat memories
            if (chatMemoryEntries.length > 0) {
                html += '<div class="memory-section"><h4 style="margin: 10px 0 10px; color: var(--text-secondary); font-size: 0.95em;">📝 Chat History</h4>';
                chatMemoryEntries.forEach(([key, entry]) => {
                    const date = new Date(entry.addedAt);
                    const formattedDate = date.toLocaleDateString() + ' ' + date.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
                    const badge = entry.type === 'chat_history' ? '📜' : '📌';
                    html += `
                        <div class="memory-item">
                            <div class="memory-header">
                                <span style="font-size: 0.9em;">${badge}</span>
                                <button class="memory-delete" onclick="nexaiInstance.removeFromMemory('${this.escapeHtml(key)}'); nexaiInstance.showMemory();" title="Delete memory">
                                    <i class="fas fa-trash"></i>
                                </button>
                            </div>
                            <div class="memory-value">${this.escapeHtml(entry.value)}</div>
                            <div class="memory-date">${formattedDate}</div>
                        </div>
                    `;
                });
                html += '</div>';
            }

            html += '</div>';
            html += `<div class="memory-info"><small>💾 Persistent: ${globalMemoryEntries.length} | 📝 Chat: ${chatMemoryEntries.length}</small></div>`;
            memoryContent.innerHTML = html;
        }

        this.openMemoryModal();
    }

    // ===========================
    // STORAGE MANAGEMENT
    // ===========================

    saveAllData() {
        this.saveChatsToStorage();
        this.saveChatIndex();
    }

    saveChatsToStorage() {
        try {
            localStorage.setItem(this.STORAGE_KEYS.CHATS, JSON.stringify(this.chats));
        } catch (error) {
            console.error('Error saving chats:', error);
            alert('Failed to save chats. Storage might be full.');
        }
    }

    loadChatsFromStorage() {
        try {
            const stored = localStorage.getItem(this.STORAGE_KEYS.CHATS);
            this.chats = stored ? JSON.parse(stored) : [];
        } catch (error) {
            console.error('Error loading chats:', error);
            this.chats = [];
        }
    }

    saveChatIndex() {
        try {
            localStorage.setItem(this.STORAGE_KEYS.CHAT_INDEX, JSON.stringify(this.chatIndex));
        } catch (error) {
            console.error('Error saving chat index:', error);
        }
    }

    loadChatIndex() {
        try {
            const stored = localStorage.getItem(this.STORAGE_KEYS.CHAT_INDEX);
            this.chatIndex = stored ? JSON.parse(stored) : [];
        } catch (error) {
            console.error('Error loading chat index:', error);
            this.chatIndex = [];
        }
    }

    saveUserMemory() {
        try {
            localStorage.setItem(this.STORAGE_KEYS.MEMORY, JSON.stringify(this.userMemory));
        } catch (error) {
            console.error('Error saving user memory:', error);
        }
    }

    loadUserMemory() {
        try {
            const stored = localStorage.getItem(this.STORAGE_KEYS.MEMORY);
            this.userMemory = stored ? JSON.parse(stored) : {};
        } catch (error) {
            console.error('Error loading user memory:', error);
            this.userMemory = {};
        }
    }

    loadGlobalMemory() {
        try {
            const stored = localStorage.getItem(this.STORAGE_KEYS.GLOBAL_MEMORY);
            this.globalMemory = stored ? JSON.parse(stored) : {};
        } catch (error) {
            console.error('Error loading global memory:', error);
            this.globalMemory = {};
        }
    }

    saveGlobalMemory() {
        try {
            localStorage.setItem(this.STORAGE_KEYS.GLOBAL_MEMORY, JSON.stringify(this.globalMemory));
        } catch (error) {
            console.error('Error saving global memory:', error);
        }
    }

    addToGlobalMemory(key, value) {
        this.globalMemory[key] = {
            value: value,
            addedAt: new Date().toISOString()
        };
        this.saveGlobalMemory();
    }

    savePreferences() {
        try {
            localStorage.setItem(this.STORAGE_KEYS.PREFERENCES, JSON.stringify(this.preferences));
        } catch (error) {
            console.error('Error saving preferences:', error);
        }
    }

    loadPreferences() {
        try {
            const stored = localStorage.getItem(this.STORAGE_KEYS.PREFERENCES);
            this.preferences = stored ? JSON.parse(stored) : this.preferences;
        } catch (error) {
            console.error('Error loading preferences:', error);
        }
    }

    // ===========================
    // UI RENDERING
    // ===========================

    renderChatList(items = null) {
        const displayItems = items || this.chatIndex;
        this.elements.chatList.innerHTML = '';

        if (displayItems.length === 0) {
            this.elements.chatList.innerHTML = '<div class="empty-state"><i class="fas fa-inbox"></i><p>No chats yet</p></div>';
            return;
        }

        displayItems.forEach(item => {
            const chatEl = document.createElement('div');
            chatEl.className = `chat-item ${item.id === this.currentChatId ? 'active' : ''}`;

            chatEl.innerHTML = `
                <div class="chat-item-main">
                    <span class="chat-item-title">${this.escapeHtml(item.title)}</span>
                </div>
                <button class="chat-item-menu" title="Chat options">
                    <i class="fas fa-ellipsis-v"></i>
                </button>
            `;

            chatEl.querySelector('.chat-item-main').addEventListener('click', () => {
                this.setActiveChat(item.id);
            });

            chatEl.querySelector('.chat-item-menu').addEventListener('click', (e) => {
                e.stopPropagation();
                this.showChatActions(item.id);
            });

            this.elements.chatList.appendChild(chatEl);
        });
    }

    renderMessages(messages) {
        this.elements.messagesContainer.innerHTML = '';
        messages.forEach(message => this.renderMessage(message));
    }

    renderMessage(message) {
        const messageEl = document.createElement('div');
        messageEl.className = `message ${message.role}`;
        messageEl.setAttribute('data-role', message.role);

        const avatar = document.createElement('div');
        avatar.className = `message-avatar ${message.role}`;
        if (message.role === 'user') {
            avatar.innerHTML = '<i class="fas fa-user"></i>';
        } else {
            avatar.innerHTML = '<i class="fas fa-robot"></i>';
        }

        const contentEl = document.createElement('div');
        contentEl.className = 'message-content';
        contentEl.innerHTML = this.formatMessage(message.content);

        messageEl.appendChild(avatar);
        messageEl.appendChild(contentEl);
        this.elements.messagesContainer.appendChild(messageEl);
    }

    formatMessage(text) {
        if (!text) return '';

        let formatted = this.escapeHtml(text);

        // URLs to links - handles URLs wrapped in text like "https://www.name.com/?utm_source=nexai"
        // This regex captures full URLs with query parameters
        formatted = formatted.replace(
            /(https?:\/\/(?:www\.)?[-A-Z0-9+&@#\/%?=~_|!:,.;]*[-A-Z0-9+&@#\/%=~_|])/gi,
            (match) => {
                // Create clickable link while keeping surrounding text
                return `<a href="${match}" target="_blank" rel="noopener noreferrer" class="message-link">${match}</a>`;
            }
        );

        // Bold
        formatted = formatted.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
        formatted = formatted.replace(/__(.*?)__/g, '<strong>$1</strong>');

        // Italic
        formatted = formatted.replace(/\*(.*?)\*/g, '<em>$1</em>');
        formatted = formatted.replace(/_(.*?)_/g, '<em>$1</em>');

        // Code
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
        return String(text).replace(/[&<>"']/g, m => map[m]);
    }

    // ===========================
    // MESSAGE HANDLING
    // ===========================

    async sendMessage() {
        const message = this.elements.messageInput.value.trim();
        if (!message || this.isLoading) return;

        this.elements.messageInput.value = '';
        this.isLoading = true;
        this.stopStreaming = false;
        this.elements.loadingIndicator.classList.remove('hidden');
        this.elements.sendBtn.disabled = true;

        const userMessage = {
            role: 'user',
            content: message
        };

        const currentChat = this.chats.find(c => c.id === this.currentChatId);
        currentChat.messages.push(userMessage);
        this.saveAllData();
        this.renderMessage(userMessage);
        this.scrollToBottom();

        // Auto-save chat history to memory for context
        this.autoSaveChatMemory(currentChat);

        // Check for "remember" keywords and save to global memory
        this.detectAndSaveRemember(message);

        // Auto-generate title on first message
        if (currentChat.messages.length === 1) {
            await this.generateChatTitle(this.currentChatId, message);
        }

        try {
            // Include file context if available
            let messageForAI = message;
            if (this.currentFileContext) {
                messageForAI = `${this.currentFileContext}\n\nUser request: ${message}`;
                this.currentFileContext = null; // Clear after use
            }

            const response = await this.callAIAPI(messageForAI, currentChat.messages);
            
            // Create AI message element for streaming
            const aiMessage = {
                role: 'assistant',
                content: ''
            };

            currentChat.messages.push(aiMessage);
            
            // Create message element with stop button
            const messageEl = document.createElement('div');
            messageEl.className = 'message assistant';
            messageEl.setAttribute('data-role', 'assistant');

            const avatar = document.createElement('div');
            avatar.className = 'message-avatar assistant';
            avatar.innerHTML = '<i class="fas fa-robot"></i>';

            const contentEl = document.createElement('div');
            contentEl.className = 'message-content';
            contentEl.id = `msg-${Date.now()}`;

            const stopBtn = document.createElement('button');
            stopBtn.className = 'stop-btn';
            stopBtn.innerHTML = '⏹ Stop';
            stopBtn.onclick = () => {
                this.stopStreaming = true;
                stopBtn.style.display = 'none';
            };

            messageEl.appendChild(avatar);
            messageEl.appendChild(contentEl);
            messageEl.appendChild(stopBtn);
            this.elements.messagesContainer.appendChild(messageEl);

            // Stream response letter by letter
            await this.streamResponse(response, contentEl, aiMessage);

            stopBtn.style.display = 'none';

            // Save final message
            this.saveAllData();

            // Check for memory commands
            this.processMemoryCommands(message, aiMessage.content);
            
            // Also check AI response for "remember" mentions
            this.detectAndSaveRemember(aiMessage.content);

        } catch (error) {
            console.error('Error:', error);

            const errorMessage = {
                role: 'assistant',
                content: `⚠️ Error: ${error.message || 'Unable to connect to the API. Please check your connection.'}`
            };

            currentChat.messages.push(errorMessage);
            this.saveAllData();
            this.renderMessage(errorMessage);
            this.scrollToBottom();
        } finally {
            this.isLoading = false;
            this.elements.loadingIndicator.classList.add('hidden');
            this.elements.sendBtn.disabled = false;
            this.focusInput();
        }
    }

    async streamResponse(text, contentEl, messageObj) {
        let currentText = '';
        const delay = 10; // milliseconds between characters

        for (let i = 0; i < text.length; i++) {
            if (this.stopStreaming) break;

            currentText += text[i];
            messageObj.content = currentText;

            // Update display with formatted content
            contentEl.innerHTML = this.formatMessage(currentText);

            this.scrollToBottom();

            // Add small delay for effect
            await new Promise(resolve => setTimeout(resolve, delay));
        }
    }

    async generateChatTitle(chatId, message) {
        const chat = this.chats.find(c => c.id === chatId);
        const indexItem = this.chatIndex.find(i => i.id === chatId);

        // Use first message for auto-title
        let title = message.substring(0, 50);
        if (message.length > 50) title += '...';

        // Clean up title
        title = title.replace(/[^\w\s\?\-]/g, '').trim();
        if (title.length < 5) title = message.substring(0, 30);

        if (chat) {
            chat.title = title;
        }
        if (indexItem) {
            indexItem.title = title;
        }

        this.saveAllData();
        this.renderChatList();
    }

    processMemoryCommands(userMessage, aiResponse) {
        const lower = userMessage.toLowerCase();

        // Pattern: "remember that..." or "please remember..."
        if (lower.includes('remember') && !lower.includes('forget')) {
            const match = userMessage.match(/(?:remember|recall|memorize|note|remember that)\s+(?:I\s+)?(?:am\s+|that\s+|my\s+|you\s+)?(.+?)(?:\.|$|!|\?)/i);
            if (match && match[1].length > 2) {
                const value = match[1].trim();
                const key = this.generateMemoryKey(value);
                this.addToMemory(key, value);
                this.showNotification(`✅ Memory saved: "${value.substring(0, 30)}..."`);
            }
        }

        // Pattern: "forget" or "delete memory"
        if (lower.includes('forget') || lower.includes('clear memory') || lower.includes('delete memory')) {
            const match = userMessage.match(/forget\s+(?:about\s+)?(.+?)(?:\.|$|!|\?)/i);
            const keys = Object.keys(this.userMemory);
            
            if (match && match[1]) {
                // Try to find and delete specific memory
                const searchTerm = match[1].toLowerCase();
                const keyToDelete = keys.find(k => 
                    this.userMemory[k].value.toLowerCase().includes(searchTerm) ||
                    k.toLowerCase().includes(searchTerm)
                );
                if (keyToDelete) {
                    this.removeFromMemory(keyToDelete);
                    this.showNotification(`🗑️ Memory deleted`);
                }
            } else if (keys.length > 0) {
                // Delete most recent memory
                const mostRecentKey = keys.reduce((a, b) => 
                    new Date(this.userMemory[a].addedAt) > new Date(this.userMemory[b].addedAt) ? a : b
                );
                this.removeFromMemory(mostRecentKey);
                this.showNotification(`🗑️ Memory deleted`);
            }
        }

        // Pattern: "show memories" or "what do you remember"
        if (lower.includes('show') && lower.includes('memor') || lower.includes('what do you remember')) {
            this.showMemory();
        }
    }

    generateMemoryKey(value) {
        // Generate a smart key from the value
        const words = value.split(/\s+/).slice(0, 3).join('_').substring(0, 20);
        const timestamp = Date.now().toString().slice(-4);
        return `${words}_${timestamp}`;
    }

    autoSaveChatMemory(chat) {
        // Auto-save chat history summary to memory for context across chats
        if (!chat || chat.messages.length === 0) return;

        // Save last 3 messages as context
        const recentMessages = chat.messages.slice(-3);
        const summary = recentMessages.map(m => `${m.role}: ${m.content.substring(0, 50)}`).join(' | ');
        
        if (summary.length > 0) {
            const key = `chat_${chat.id.substring(0, 8)}_${Date.now().toString().slice(-4)}`;
            this.userMemory[key] = {
                value: summary,
                addedAt: new Date().toISOString(),
                type: 'chat_history'
            };
            
            // Keep only last 20 chat memories
            const chatMemories = Object.entries(this.userMemory)
                .filter(([, v]) => v.type === 'chat_history')
                .sort((a, b) => new Date(b[1].addedAt) - new Date(a[1].addedAt));
            
            if (chatMemories.length > 20) {
                const keysToDelete = chatMemories.slice(20).map(([k]) => k);
                keysToDelete.forEach(k => delete this.userMemory[k]);
            }
            
            this.saveMemoryToStorage();
        }
    }

    detectAndSaveRemember(text) {
        // Detect "remember" keywords and save to global persistent memory
        if (!text || typeof text !== 'string') return;

        const lower = text.toLowerCase();
        
        // Look for "remember" patterns - these are saved globally across ALL chats
        const rememberPatterns = [
            /(?:remember|note|save|keep in mind|memorize)\s+(?:that\s+)?(?:i\s+|you\s+)?([^.!?]+)/gi,
            /(?:i\s+(?:am|have|like|prefer|use|work with|know))\s+([^.!?]+)/gi
        ];

        rememberPatterns.forEach(pattern => {
            let match;
            while ((match = pattern.exec(text)) !== null) {
                const value = match[1]?.trim();
                if (value && value.length > 5 && value.length < 500) {
                    const key = this.generateMemoryKey(value);
                    this.addToGlobalMemory(key, value);
                    this.showNotification(`💾 Global memory saved: "${value.substring(0, 25)}..."`);
                }
            }
        });
    }

    saveMemoryToStorage() {
        try {
            localStorage.setItem(this.STORAGE_KEYS.MEMORY, JSON.stringify(this.userMemory));
        } catch (error) {
            console.error('Error saving memory:', error);
        }
    }

    // ===========================
    // API INTERACTION
    // ===========================

    async callAIAPI(message, conversationHistory = []) {
        // Build context with memory and file information
        let contextInfo = `You are ${this.AI_NAME}, an advanced AI assistant created by ${this.OWNER}. Be helpful, creative, and intelligent. When asked about your creator, acknowledge that you were created by ${this.OWNER}.\n\n`;
        
        // Add global persistent memory (across all chats)
        const globalMemoryEntries = Object.entries(this.globalMemory);
        if (globalMemoryEntries.length > 0) {
            contextInfo += `[Persistent User Profile (Across All Chats)]\n`;
            globalMemoryEntries.slice(0, 10).forEach(([key, entry]) => {
                contextInfo += `- ${entry.value}\n`;
            });
            contextInfo += '\n';
        }

        // Add chat-specific memory context
        const memoryEntries = Object.entries(this.userMemory);
        if (memoryEntries.length > 0) {
            contextInfo += `[Chat History Context]\n`;
            memoryEntries.slice(0, 5).forEach(([key, entry]) => {
                if (entry.type !== 'chat_history') {
                    contextInfo += `- ${entry.value}\n`;
                }
            });
            contextInfo += '\n';
        }
        
        // Add conversation history for context (last 5 messages)
        if (conversationHistory.length > 0) {
            contextInfo += `[Recent Conversation Context]\n`;
            conversationHistory.slice(-5).forEach(msg => {
                const role = msg.role === 'user' ? 'User' : 'Assistant';
                const preview = msg.content.substring(0, 100);
                contextInfo += `${role}: ${preview}${msg.content.length > 100 ? '...' : ''}\n`;
            });
            contextInfo += '\n';
        }
        
        // Add file context from current chat
        const currentChat = this.chats.find(c => c.id === this.currentChatId);
        if (currentChat && currentChat.uploadedFiles && currentChat.uploadedFiles.length > 0) {
            contextInfo += `[Uploaded Files in This Chat]\n`;
            currentChat.uploadedFiles.forEach(file => {
                contextInfo += `- ${file.name} (${this.formatFileSize(file.size)})\n`;
            });
            contextInfo += '\n';
        }

        const systemPrompt = contextInfo;

        try {
            const encodedMessage = encodeURIComponent(message);
            const encodedSystem = encodeURIComponent(systemPrompt);
            const apiUrl = `${this.API_URL}?q=${encodedMessage}&BK9=${encodedSystem}&model=openai%2Fgpt-oss-120b`;

            const response = await fetch(apiUrl, {
                method: 'GET',
                headers: {
                    'Accept': 'application/json',
                    'User-Agent': 'NEXAI-ChatApp/2.0'
                }
            });

            if (!response.ok) {
                throw new Error(`API Error: ${response.statusText}`);
            }

            const data = await response.json();
            return this.parseAPIResponse(data);
        } catch (error) {
            console.error('API Error:', error);
            throw new Error('Failed to get response from AI service.');
        }
    }

    parseAPIResponse(data) {
        // Handle BK9 endpoint response
        if (data.BK9) {
            return String(data.BK9).trim();
        }

        // Handle other response formats
        if (typeof data === 'string') {
            return data;
        }
        if (data.response) {
            return String(data.response).trim();
        }
        if (data.result) {
            return String(data.result).trim();
        }
        if (data.message) {
            return String(data.message).trim();
        }

        // Default fallback - never show raw JSON
        return 'I received an unclear response. Please try again.';
    }

    // ===========================
    // VOICE INTERFACE
    // ===========================

    setupSpeechRecognition() {
        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        if (SpeechRecognition) {
            this.recognition = new SpeechRecognition();
            this.recognition.continuous = false;
            this.recognition.interimResults = true;
            this.recognition.language = 'en-US';

            this.recognition.onstart = () => {
                this.isListening = true;
                this.elements.voiceBtn.classList.add('listening');
                this.elements.voiceBtn.title = 'Listening...';
            };

            this.recognition.onresult = (event) => {
                let interimTranscript = '';
                for (let i = event.resultIndex; i < event.results.length; i++) {
                    const transcript = event.results[i][0].transcript;
                    if (event.results[i].isFinal) {
                        this.elements.messageInput.value = transcript;
                    } else {
                        interimTranscript += transcript;
                    }
                }
            };

            this.recognition.onend = () => {
                this.isListening = false;
                this.elements.voiceBtn.classList.remove('listening');
                this.elements.voiceBtn.title = 'Voice input';
            };

            this.recognition.onerror = (event) => {
                console.error('Speech recognition error:', event.error);
                this.isListening = false;
                this.elements.voiceBtn.classList.remove('listening');
            };
        }
    }

    toggleVoiceInput() {
        if (!this.recognition) {
            alert('Speech Recognition is not supported in your browser. Please use Chrome, Edge, or Safari.');
            return;
        }

        if (this.isListening) {
            this.recognition.stop();
        } else {
            this.recognition.start();
        }
    }

    // ===========================
    // FILE HANDLING
    // ===========================

    handleFileUpload(event) {
        const file = event.target.files[0];
        if (!file) return;

        const validExtensions = ['.txt', '.json', '.pdf', '.md', '.csv', '.log'];
        const isValidFile = validExtensions.some(ext => file.name.toLowerCase().endsWith(ext));
        
        if (!isValidFile) {
            this.showNotification('Please upload a .txt, .json, .pdf, .md, .csv, or .log file');
            return;
        }

        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const content = e.target.result;
                const fileName = file.name;
                const fileSize = this.formatFileSize(file.size);
                
                // Store file in current chat for context
                const currentChat = this.chats.find(c => c.id === this.currentChatId);
                if (currentChat) {
                    if (!currentChat.uploadedFiles) {
                        currentChat.uploadedFiles = [];
                    }
                    currentChat.uploadedFiles.push({
                        name: fileName,
                        type: file.type,
                        size: file.size,
                        uploadedAt: new Date().toISOString(),
                        content: content.substring(0, 100000) // Limit content size
                    });
                    this.saveAllData();
                }
                
                // Create a clean file context message for the AI
                const fileContext = `[File: ${fileName} (${fileSize})]\n\nPlease analyze or help with this file:\n\n${content.substring(0, 5000)}${content.length > 5000 ? '\n...[file content truncated for display]' : ''}`;
                
                // Set message input with just a prompt
                this.elements.messageInput.value = `Analyze this file: ${fileName}`;
                this.elements.messageInput.placeholder = 'Ask about the uploaded file...';
                
                // Store the file content for this session (hidden from user)
                this.currentFileContext = fileContext;
                
                // Show file upload notification
                this.showNotification(`✅ File "${fileName}" (${fileSize}) ready to analyze!`);
                this.focusInput();
            } catch (error) {
                this.showNotification(`❌ Error processing file: ${error.message}`);
            }
        };

        reader.onerror = () => {
            this.showNotification('❌ Error reading file. Please try again.');
        };

        reader.readAsText(file);
        this.elements.fileInput.value = '';
    }

    formatFileSize(bytes) {
        if (bytes === 0) return '0 Bytes';
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
    }

    showNotification(message) {
        const notification = document.createElement('div');
        notification.className = 'notification';
        notification.textContent = message;
        notification.style.cssText = `
            position: fixed;
            bottom: 20px;
            right: 20px;
            background: var(--primary-color);
            color: white;
            padding: 12px 20px;
            border-radius: 8px;
            z-index: 10000;
            animation: slideIn 0.3s ease-out;
            max-width: 300px;
            word-wrap: break-word;
        `;
        document.body.appendChild(notification);
        setTimeout(() => {
            notification.style.animation = 'slideOut 0.3s ease-out';
            setTimeout(() => notification.remove(), 300);
        }, 3000);
    }

    // ===========================
    // MODAL & UI INTERACTIONS
    // ===========================

    openModal() {
        this.elements.chatActionsModal.classList.remove('hidden');
    }

    closeModal() {
        this.elements.chatActionsModal.classList.add('hidden');
    }

    openMemoryModal() {
        this.elements.memoryModal.classList.remove('hidden');
    }

    closeMemoryModal() {
        this.elements.memoryModal.classList.add('hidden');
    }

    toggleSidebar() {
        if (this.elements.sidebar.classList.contains('active')) {
            this.closeSidebar();
        } else {
            this.openSidebar();
        }
    }

    openSidebar() {
        this.elements.sidebar.classList.add('active');
        this.elements.sidebarOverlay.classList.add('active');
    }

    closeSidebar() {
        this.elements.sidebar.classList.remove('active');
        this.elements.sidebarOverlay.classList.remove('active');
    }

    focusInput() {
        this.elements.messageInput.focus();
    }

    scrollToBottom() {
        setTimeout(() => {
            this.elements.messagesWrapper.scrollTop = this.elements.messagesWrapper.scrollHeight;
        }, 0);
    }
}

// ===========================
// INITIALIZATION
// ===========================

let nexaiInstance = null;

document.addEventListener('DOMContentLoaded', () => {
    nexaiInstance = new NEXAI();
    window.nexaiInstance = nexaiInstance;
});

// Handle window resize
window.addEventListener('resize', () => {
    if (window.innerWidth > 768) {
        document.querySelector('.sidebar').classList.remove('active');
        document.getElementById('sidebarOverlay').classList.remove('active');
    }
});
