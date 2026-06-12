// ===========================
// NEXAI - Premium AI Chat Application
// Complete Frontend Application
// ===========================

class NEXAI {
    constructor() {
        // Auto-detect API URL from current location (works on any port)
        this.API_URL = `${window.location.origin}/api`;
        this.token = localStorage.getItem('nexai_token');
        this.userId = localStorage.getItem('nexai_userId');
        this.user = null;
        this.chats = [];
        this.currentChatId = null;
        this.isLoading = false;
        this.recognition = null;
        this.isListening = false;
        this.settings = {
            theme: localStorage.getItem('nexai_theme') || 'dark',
            voiceSpeed: parseFloat(localStorage.getItem('nexai_voiceSpeed') || '1.0'),
            voicePitch: parseFloat(localStorage.getItem('nexai_voicePitch') || '1.0'),
            voiceEnabled: localStorage.getItem('nexai_voiceEnabled') !== 'false'
        };

        this.initializeDOM();
        this.setupEventListeners();
        this.setupSpeechRecognition();
        
        if (this.token && this.userId) {
            this.showChatInterface();
            this.loadUserProfile();
            this.loadChats();
            this.loadSettings();
        } else {
            this.showAuthInterface();
        }
    }

    // ===========================
    // DOM INITIALIZATION
    // ===========================

    initializeDOM() {
        this.dom = {
            // Auth
            authContainer: document.getElementById('authContainer'),
            loginForm: document.getElementById('loginForm'),
            loginFormElement: document.getElementById('loginFormElement'),
            signupForm: document.getElementById('signupForm'),
            signupFormElement: document.getElementById('signupFormElement'),
            verificationForm: document.getElementById('verificationForm'),
            verificationFormElement: document.getElementById('verificationFormElement'),

            // Chat Layout
            chatLayout: document.getElementById('chatLayout'),
            sidebar: document.getElementById('sidebar'),
            sidebarToggle: document.getElementById('sidebarToggle'),
            sidebarOverlay: document.getElementById('sidebarOverlay'),
            newChatBtn: document.getElementById('newChatBtn'),
            chatList: document.getElementById('chatList'),
            searchInput: document.getElementById('searchInput'),

            // Messages
            messages: document.getElementById('messages'),
            messagesWrapper: document.getElementById('messagesWrapper'),
            loadingIndicator: document.getElementById('loadingIndicator'),

            // Input
            messageInput: document.getElementById('messageInput'),
            sendBtn: document.getElementById('sendBtn'),
            stopBtn: document.getElementById('stopBtn'),
            fileBtn: document.getElementById('fileBtn'),
            fileInput: document.getElementById('fileInput'),
            voiceBtn: document.getElementById('voiceBtn'),
            attachmentPreview: document.getElementById('attachmentPreview'),
            attachmentList: document.getElementById('attachmentList'),

            // Modals
            settingsModal: document.getElementById('settingsModal'),
            profileModal: document.getElementById('profileModal'),
            settingsModalClose: document.getElementById('settingsModalClose'),
            profileModalClose: document.getElementById('profileModalClose'),
            chatActionsModal: document.getElementById('chatActionsModal'),
            modalClose: document.getElementById('modalClose'),

            // User Menu
            userMenuBtn: document.getElementById('userMenuBtn'),
            userMenu: document.getElementById('userMenu'),
            userAvatar: document.getElementById('userAvatar'),
            userEmail: document.getElementById('userEmail'),
            profileBtn: document.getElementById('profileBtn'),
            settingsBtn: document.getElementById('settingsBtn'),
            logoutBtn: document.getElementById('logoutBtn')
        };

        this.applyTheme(this.settings.theme);
    }

    // ===========================
    // EVENT LISTENERS
    // ===========================

    setupEventListeners() {
        // Auth Events
        document.getElementById('switchToSignup').addEventListener('click', (e) => {
            e.preventDefault();
            this.switchAuthForm('signup');
        });

        document.getElementById('switchToLogin').addEventListener('click', (e) => {
            e.preventDefault();
            this.switchAuthForm('login');
        });

        document.getElementById('backToSignup').addEventListener('click', (e) => {
            e.preventDefault();
            this.switchAuthForm('signup');
        });

        this.dom.loginFormElement.addEventListener('submit', (e) => this.handleLogin(e));
        this.dom.signupFormElement.addEventListener('submit', (e) => this.handleSignup(e));
        this.dom.verificationFormElement.addEventListener('submit', (e) => this.handleVerifyOTP(e));

        // Chat Events
        this.dom.newChatBtn.addEventListener('click', () => this.createNewChat());
        this.dom.sidebarToggle.addEventListener('click', () => this.toggleSidebar());
        this.dom.sidebarOverlay.addEventListener('click', () => this.closeSidebar());

        // Message Events
        this.dom.sendBtn.addEventListener('click', () => this.sendMessage());
        this.dom.messageInput.addEventListener('keydown', (e) => {
            if (e.ctrlKey && e.key === 'Enter') {
                this.sendMessage();
            }
        });

        this.dom.fileBtn.addEventListener('click', () => this.dom.fileInput.click());
        this.dom.fileInput.addEventListener('change', (e) => this.handleFileUpload(e));
        this.dom.voiceBtn.addEventListener('click', () => this.toggleVoiceInput());

        // Modal Events
        this.dom.settingsModalClose.addEventListener('click', () => this.closeModal('settingsModal'));
        this.dom.profileModalClose.addEventListener('click', () => this.closeModal('profileModal'));
        this.dom.modalClose.addEventListener('click', () => this.closeModal('chatActionsModal'));

        // User Menu Events
        this.dom.userMenuBtn.addEventListener('click', () => this.toggleUserMenu());
        this.dom.profileBtn.addEventListener('click', () => {
            this.closeUserMenu();
            this.openProfileModal();
        });
        this.dom.settingsBtn.addEventListener('click', () => {
            this.closeUserMenu();
            this.openSettingsModal();
        });
        this.dom.logoutBtn.addEventListener('click', () => this.logout());

        // Search
        this.dom.searchInput.addEventListener('input', (e) => this.filterChats(e.target.value));

        // Settings Theme Selector
        document.querySelectorAll('.theme-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                document.querySelectorAll('.theme-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                this.changeTheme(btn.dataset.theme);
            });
        });

        // Voice Settings
        document.getElementById('voiceSpeed').addEventListener('change', (e) => {
            this.settings.voiceSpeed = parseFloat(e.target.value);
            document.getElementById('voiceSpeedValue').textContent = e.target.value + 'x';
            localStorage.setItem('nexai_voiceSpeed', e.target.value);
            this.saveSettings();
        });

        document.getElementById('voicePitch').addEventListener('change', (e) => {
            this.settings.voicePitch = parseFloat(e.target.value);
            document.getElementById('voicePitchValue').textContent = e.target.value + 'x';
            localStorage.setItem('nexai_voicePitch', e.target.value);
            this.saveSettings();
        });

        document.getElementById('voiceEnabled').addEventListener('change', (e) => {
            this.settings.voiceEnabled = e.target.checked;
            localStorage.setItem('nexai_voiceEnabled', e.target.checked);
            this.saveSettings();
        });

        // Profile
        document.getElementById('uploadAvatarBtn').addEventListener('click', () => {
            document.getElementById('avatarInput').click();
        });

        document.getElementById('avatarInput').addEventListener('change', (e) => this.uploadAvatar(e));
        document.getElementById('deleteAvatarBtn').addEventListener('click', () => this.deleteAvatar());
    }

    // ===========================
    // AUTHENTICATION
    // ===========================

    showAuthInterface() {
        this.dom.authContainer.classList.add('active');
        this.dom.chatLayout.classList.add('hidden');
        this.switchAuthForm('login');
    }

    showChatInterface() {
        this.dom.authContainer.classList.remove('active');
        this.dom.chatLayout.classList.remove('hidden');
    }

    switchAuthForm(form) {
        this.dom.loginForm.classList.remove('active');
        this.dom.signupForm.classList.remove('active');
        this.dom.verificationForm.classList.remove('active');

        if (form === 'login') this.dom.loginForm.classList.add('active');
        else if (form === 'signup') this.dom.signupForm.classList.add('active');
        else if (form === 'verification') this.dom.verificationForm.classList.add('active');
    }

    async handleLogin(e) {
        e.preventDefault();
        const email = document.getElementById('loginEmail').value;
        const password = document.getElementById('loginPassword').value;

        try {
            console.log('Attempting login to:', `${this.API_URL}/auth/login`);
            
            const response = await fetch(`${this.API_URL}/auth/login`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email, password })
            });

            if (!response.ok) {
                throw new Error(`Server error: ${response.status} ${response.statusText}`);
            }

            const data = await response.json();
            if (data.success) {
                this.token = data.token;
                this.userId = data.userId;
                localStorage.setItem('nexai_token', this.token);
                localStorage.setItem('nexai_userId', this.userId);
                this.user = {
                    id: data.userId,
                    username: data.username,
                    email: data.email,
                    avatar: data.avatar
                };
                this.showChatInterface();
                this.loadUserProfile();
                this.loadChats();
            } else {
                alert(data.message || 'Login failed');
            }
        } catch (error) {
            console.error('Login error:', error);
            if (error.message.includes('Failed to fetch')) {
                alert(`❌ Cannot connect to server.\n\nAttempted to reach: ${this.API_URL}/auth/login\n\nMake sure:\n1. Server is running\n2. Server is running on the same machine\n3. Network connection is active\n\nError: ${error.message}`);
            } else {
                alert('❌ Login error: ' + error.message);
            }
        }
    }

    async handleSignup(e) {
        e.preventDefault();
        const username = document.getElementById('signupUsername').value;
        const email = document.getElementById('signupEmail').value;
        const password = document.getElementById('signupPassword').value;
        const passwordConfirm = document.getElementById('signupPasswordConfirm').value;

        try {
            console.log('Attempting signup to:', `${this.API_URL}/auth/register`);
            
            const response = await fetch(`${this.API_URL}/auth/register`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username, email, password, passwordConfirm })
            });

            if (!response.ok) {
                throw new Error(`Server error: ${response.status} ${response.statusText}`);
            }

            const data = await response.json();
            if (data.success) {
                localStorage.setItem('nexai_email', email);
                alert('✅ Signup successful! Check your email for verification code.');
                this.switchAuthForm('verification');
            } else {
                alert(data.message || 'Signup failed');
            }
        } catch (error) {
            console.error('Signup error:', error);
            if (error.message.includes('Failed to fetch')) {
                alert(`❌ Cannot connect to server.\n\nAttempted to reach: ${this.API_URL}/auth/register\n\nMake sure:\n1. Server is running\n2. Server is running on the same machine\n3. Network connection is active\n\nError: ${error.message}`);
            } else {
                alert('❌ Signup error: ' + error.message);
            }
        }
    }

    async handleVerifyOTP(e) {
        e.preventDefault();
        const code = document.getElementById('otpCode').value;
        const email = localStorage.getItem('nexai_email');

        try {
            console.log('Verifying OTP for:', email);
            
            const response = await fetch(`${this.API_URL}/auth/verify-otp`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email, code })
            });

            if (!response.ok) {
                throw new Error(`Server error: ${response.status} ${response.statusText}`);
            }

            const data = await response.json();
            if (data.success) {
                this.token = data.token;
                this.userId = data.userId;
                localStorage.setItem('nexai_token', this.token);
                localStorage.setItem('nexai_userId', this.userId);
                localStorage.removeItem('nexai_email');
                alert('✅ Email verified successfully!');
                this.showChatInterface();
                this.loadUserProfile();
                this.createNewChat();
            } else {
                alert(data.message || 'Verification failed');
            }
        } catch (error) {
            console.error('Verification error:', error);
            if (error.message.includes('Failed to fetch')) {
                alert(`❌ Cannot connect to server.\n\nAttempted to reach: ${this.API_URL}/auth/verify-otp\n\nMake sure:\n1. Server is running\n2. Server is running on the same machine\n3. Network connection is active\n\nError: ${error.message}`);
            } else {
                alert('❌ Verification error: ' + error.message);
            }
        }
    }

    async loadUserProfile() {
        try {
            const response = await fetch(`${this.API_URL}/user/profile`, {
                headers: { 'Authorization': `Bearer ${this.token}` }
            });

            const data = await response.json();
            if (data.success) {
                this.user = data.user;
                this.updateUserUI();
            }
        } catch (error) {
            console.error('Profile load error:', error);
        }
    }

    updateUserUI() {
        if (!this.user) return;

        const initial = this.user.username.charAt(0).toUpperCase();
        this.dom.userAvatar.textContent = initial;
        this.dom.userEmail.textContent = this.user.username;

        document.getElementById('profileUsername').textContent = this.user.username;
        document.getElementById('profileEmail').textContent = this.user.email;
        const joinDate = new Date(this.user.created_at).toLocaleDateString();
        document.getElementById('profileJoined').textContent = joinDate;

        if (this.user.avatar) {
            const avatarImg = document.getElementById('profileAvatar');
            avatarImg.src = this.user.avatar;
            this.dom.userAvatar.style.background = `url(${this.user.avatar})`;
            this.dom.userAvatar.style.backgroundSize = 'cover';
            this.dom.userAvatar.textContent = '';
        }
    }

    logout() {
        localStorage.removeItem('nexai_token');
        localStorage.removeItem('nexai_userId');
        this.token = null;
        this.userId = null;
        this.user = null;
        this.showAuthInterface();
    }

    // ===========================
    // CHAT MANAGEMENT
    // ===========================

    async loadChats() {
        try {
            const response = await fetch(`${this.API_URL}/chats`, {
                headers: { 'Authorization': `Bearer ${this.token}` }
            });

            const data = await response.json();
            if (data.success) {
                this.chats = data.chats;
                this.renderChatList();
            }
        } catch (error) {
            console.error('Load chats error:', error);
        }
    }

    renderChatList() {
        this.dom.chatList.innerHTML = '';

        if (this.chats.length === 0) {
            this.dom.chatList.innerHTML = '<div class="empty-state"><i class="fas fa-inbox"></i><p>No chats yet</p></div>';
            return;
        }

        this.chats.forEach(chat => {
            const chatItem = document.createElement('div');
            chatItem.className = 'chat-item' + (this.currentChatId === chat.chat_id ? ' active' : '');
            chatItem.innerHTML = `
                <div class="chat-item-main" onclick="nexai.selectChat('${chat.chat_id}')">
                    <div class="chat-item-title">${chat.chat_title || 'Untitled Chat'}</div>
                </div>
                <button class="chat-item-menu" onclick="nexai.showChatMenu('${chat.chat_id}', event)">
                    <i class="fas fa-ellipsis-v"></i>
                </button>
            `;
            this.dom.chatList.appendChild(chatItem);
        });
    }

    async createNewChat() {
        this.currentChatId = 'chat_' + Date.now();
        this.dom.messages.innerHTML = '';
        this.dom.messageInput.focus();
        this.closeSidebar();
    }

    async selectChat(chatId) {
        this.currentChatId = chatId;
        this.renderChatList();

        try {
            const response = await fetch(`${this.API_URL}/chats/${chatId}`, {
                headers: { 'Authorization': `Bearer ${this.token}` }
            });

            const data = await response.json();
            if (data.success) {
                this.dom.messages.innerHTML = '';
                data.chat.messages.forEach(msg => this.displayMessage(msg));
            }
        } catch (error) {
            console.error('Select chat error:', error);
        }

        this.closeSidebar();
    }

    async deleteChat(chatId) {
        if (!confirm('Delete this chat?')) return;

        try {
            const response = await fetch(`${this.API_URL}/chats/${chatId}`, {
                method: 'DELETE',
                headers: { 'Authorization': `Bearer ${this.token}` }
            });

            const data = await response.json();
            if (data.success) {
                this.loadChats();
                if (this.currentChatId === chatId) {
                    this.createNewChat();
                }
            }
        } catch (error) {
            console.error('Delete chat error:', error);
        }
    }

    showChatMenu(chatId, event) {
        event.stopPropagation();
        // Implement chat menu modal
        this.showModal('chatActionsModal');
        const modalBody = document.getElementById('modalBody');
        modalBody.innerHTML = `
            <button class="action-btn" onclick="nexai.deleteChat('${chatId}')">
                <i class="fas fa-trash"></i> Delete Chat
            </button>
        `;
    }

    filterChats(query) {
        const items = document.querySelectorAll('.chat-item');
        items.forEach(item => {
            const title = item.querySelector('.chat-item-title').textContent.toLowerCase();
            item.style.display = title.includes(query.toLowerCase()) ? '' : 'none';
        });
    }

    toggleSidebar() {
        this.dom.sidebar.classList.toggle('active');
        this.dom.sidebarOverlay.classList.toggle('active');
    }

    closeSidebar() {
        this.dom.sidebar.classList.remove('active');
        this.dom.sidebarOverlay.classList.remove('active');
    }

    // ===========================
    // MESSAGE HANDLING
    // ===========================

    async sendMessage() {
        const message = this.dom.messageInput.value.trim();
        if (!message || this.isLoading) return;

        this.dom.messageInput.value = '';
        this.displayMessage({ role: 'user', content: message, timestamp: new Date() });

        this.showLoading(true);
        try {
            // Get conversation history
            const messages = Array.from(this.dom.messages.querySelectorAll('.message')).map(el => ({
                role: el.classList.contains('user') ? 'user' : 'assistant',
                content: el.querySelector('.message-content')?.textContent || ''
            }));

            const response = await fetch(`${this.API_URL}/ai/chat`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${this.token}`
                },
                body: JSON.stringify({
                    message,
                    conversationHistory: messages
                })
            });

            const data = await response.json();
            if (data.success) {
                const aiMessage = {
                    role: 'assistant',
                    content: data.response || 'No response',
                    timestamp: new Date()
                };
                this.displayMessage(aiMessage);

                // Speak response if enabled
                if (this.settings.voiceEnabled) {
                    this.speak(aiMessage.content);
                }

                // Save chat
                this.saveChat();
            }
        } catch (error) {
            console.error('Send message error:', error);
            this.displayMessage({
                role: 'assistant',
                content: 'Error communicating with AI. Please try again.',
                timestamp: new Date()
            });
        }
        this.showLoading(false);
    }

    displayMessage(msg) {
        const msgEl = document.createElement('div');
        msgEl.className = `message ${msg.role}`;

        const avatar = msg.role === 'user' ? this.getInitial(this.user?.username || 'U') : '🤖';
        const timestamp = new Date(msg.timestamp).toLocaleTimeString();

        msgEl.innerHTML = `
            <div class="message-avatar" title="${msg.role === 'user' ? this.user?.username : 'NEXAI'}">
                ${msg.role === 'user' && this.user?.avatar ? 
                    `<img src="${this.user.avatar}" alt="User">` : 
                    avatar
                }
            </div>
            <div class="message-content-container">
                <div class="message-content">${this.escapeHtml(msg.content)}</div>
                <div class="message-actions">
                    <button class="message-action-btn" title="Copy" onclick="navigator.clipboard.writeText(\`${msg.content.replace(/`/g, '\\`')}\`)">
                        <i class="fas fa-copy"></i> Copy
                    </button>
                    <button class="message-action-btn" title="Delete" onclick="this.closest('.message').remove()">
                        <i class="fas fa-trash"></i> Delete
                    </button>
                </div>
            </div>
        `;

        this.dom.messages.appendChild(msgEl);
        this.dom.messagesWrapper.scrollTop = this.dom.messagesWrapper.scrollHeight;
    }

    showLoading(show) {
        this.isLoading = show;
        if (show) {
            this.dom.loadingIndicator.classList.remove('hidden');
        } else {
            this.dom.loadingIndicator.classList.add('hidden');
        }
        this.dom.messagesWrapper.scrollTop = this.dom.messagesWrapper.scrollHeight;
    }

    async saveChat() {
        if (!this.currentChatId) return;

        const messages = Array.from(this.dom.messages.querySelectorAll('.message')).map(el => ({
            role: el.classList.contains('user') ? 'user' : 'assistant',
            content: el.querySelector('.message-content').textContent,
            timestamp: new Date()
        }));

        // Auto-generate title from first message
        let chatTitle = 'New Chat';
        if (messages.length > 0) {
            chatTitle = messages[0].content.substring(0, 50) + (messages[0].content.length > 50 ? '...' : '');
        }

        try {
            await fetch(`${this.API_URL}/chats`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${this.token}`
                },
                body: JSON.stringify({
                    chatId: this.currentChatId,
                    chatTitle,
                    messages
                })
            });
            this.loadChats();
        } catch (error) {
            console.error('Save chat error:', error);
        }
    }

    // ===========================
    // FILE HANDLING
    // ===========================

    async handleFileUpload(e) {
        const file = e.target.files[0];
        if (!file) return;

        const formData = new FormData();
        formData.append('file', file);

        try {
            const response = await fetch(`${this.API_URL}/upload`, {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${this.token}` },
                body: formData
            });

            const data = await response.json();
            if (data.success) {
                this.addAttachment(data.file);
            }
        } catch (error) {
            alert('Upload error: ' + error.message);
        }

        this.dom.fileInput.value = '';
    }

    addAttachment(file) {
        if (!this.attachments) this.attachments = [];
        this.attachments.push(file);

        const item = document.createElement('div');
        item.className = 'attachment-item';
        item.innerHTML = `
            <i class="fas fa-file"></i>
            <span>${file.name}</span>
            <button class="attachment-remove" onclick="nexai.removeAttachment('${file.name}')">
                <i class="fas fa-times"></i>
            </button>
        `;

        this.dom.attachmentList.appendChild(item);
        this.dom.attachmentPreview.style.display = 'block';
    }

    removeAttachment(name) {
        this.attachments = this.attachments.filter(a => a.name !== name);
        if (this.attachments.length === 0) {
            this.dom.attachmentPreview.style.display = 'none';
        } else {
            const items = document.querySelectorAll('.attachment-item');
            items.forEach(item => {
                if (item.textContent.includes(name)) item.remove();
            });
        }
    }

    // ===========================
    // VOICE INPUT/OUTPUT
    // ===========================

    setupSpeechRecognition() {
        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        if (!SpeechRecognition) {
            this.dom.voiceBtn.style.display = 'none';
            return;
        }

        this.recognition = new SpeechRecognition();
        this.recognition.continuous = false;
        this.recognition.interimResults = true;
        this.recognition.lang = 'en-US';

        this.recognition.onstart = () => {
            this.isListening = true;
            this.dom.voiceBtn.classList.add('listening');
        };

        this.recognition.onend = () => {
            this.isListening = false;
            this.dom.voiceBtn.classList.remove('listening');
        };

        this.recognition.onresult = (event) => {
            let transcript = '';
            for (let i = event.resultIndex; i < event.results.length; i++) {
                transcript += event.results[i][0].transcript;
            }
            if (event.results[event.results.length - 1].isFinal) {
                this.dom.messageInput.value = transcript;
                this.sendMessage();
            }
        };

        this.recognition.onerror = (event) => {
            console.error('Speech recognition error:', event.error);
        };
    }

    toggleVoiceInput() {
        if (!this.recognition) return;

        if (this.isListening) {
            this.recognition.stop();
        } else {
            this.recognition.start();
        }
    }

    speak(text) {
        if (!('speechSynthesis' in window)) return;

        const utterance = new SpeechSynthesisUtterance(text);
        utterance.rate = this.settings.voiceSpeed;
        utterance.pitch = this.settings.voicePitch;
        speechSynthesis.speak(utterance);
    }

    // ===========================
    // SETTINGS & PROFILE
    // ===========================

    openSettingsModal() {
        this.showModal('settingsModal');

        // Set current theme
        document.querySelectorAll('.theme-btn').forEach(btn => {
            btn.classList.remove('active');
            if (btn.dataset.theme === this.settings.theme) {
                btn.classList.add('active');
            }
        });

        // Set voice settings
        document.getElementById('voiceSpeed').value = this.settings.voiceSpeed;
        document.getElementById('voiceSpeedValue').textContent = this.settings.voiceSpeed + 'x';
        document.getElementById('voicePitch').value = this.settings.voicePitch;
        document.getElementById('voicePitchValue').textContent = this.settings.voicePitch + 'x';
        document.getElementById('voiceEnabled').checked = this.settings.voiceEnabled;
    }

    openProfileModal() {
        this.showModal('profileModal');
        this.updateUserUI();
    }

    async uploadAvatar(e) {
        const file = e.target.files[0];
        if (!file) return;

        const formData = new FormData();
        formData.append('avatar', file);

        try {
            const response = await fetch(`${this.API_URL}/user/avatar`, {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${this.token}` },
                body: formData
            });

            const data = await response.json();
            if (data.success) {
                this.user.avatar = data.avatar;
                this.updateUserUI();
            }
        } catch (error) {
            alert('Upload error: ' + error.message);
        }

        document.getElementById('avatarInput').value = '';
    }

    async deleteAvatar() {
        try {
            const response = await fetch(`${this.API_URL}/user/avatar`, {
                method: 'DELETE',
                headers: { 'Authorization': `Bearer ${this.token}` }
            });

            const data = await response.json();
            if (data.success) {
                this.user.avatar = null;
                this.updateUserUI();
            }
        } catch (error) {
            alert('Delete error: ' + error.message);
        }
    }

    async saveSettings() {
        try {
            await fetch(`${this.API_URL}/settings`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${this.token}`
                },
                body: JSON.stringify({
                    theme: this.settings.theme,
                    voice_speed: this.settings.voiceSpeed,
                    voice_pitch: this.settings.voicePitch,
                    voice_enabled: this.settings.voiceEnabled
                })
            });
        } catch (error) {
            console.error('Save settings error:', error);
        }
    }

    async loadSettings() {
        try {
            const response = await fetch(`${this.API_URL}/settings`, {
                headers: { 'Authorization': `Bearer ${this.token}` }
            });

            const data = await response.json();
            if (data.success) {
                this.settings = {
                    theme: data.settings.theme || 'dark',
                    voiceSpeed: data.settings.voice_speed || 1.0,
                    voicePitch: data.settings.voice_pitch || 1.0,
                    voiceEnabled: data.settings.voice_enabled !== false
                };
                this.applyTheme(this.settings.theme);
            }
        } catch (error) {
            console.error('Load settings error:', error);
        }
    }

    changeTheme(theme) {
        this.settings.theme = theme;
        this.applyTheme(theme);
        localStorage.setItem('nexai_theme', theme);
        this.saveSettings();
    }

    applyTheme(theme) {
        document.body.classList.remove('theme-dark', 'theme-light', 'theme-red', 'theme-blue', 'theme-green', 'theme-purple');
        document.body.classList.add(`theme-${theme}`);
    }

    // ===========================
    // MODAL MANAGEMENT
    // ===========================

    showModal(id) {
        const modal = document.getElementById(id);
        if (modal) {
            modal.classList.remove('hidden');
        }
    }

    closeModal(id) {
        const modal = document.getElementById(id);
        if (modal) {
            modal.classList.add('hidden');
        }
    }

    toggleUserMenu() {
        this.dom.userMenu.classList.toggle('hidden');
    }

    closeUserMenu() {
        this.dom.userMenu.classList.add('hidden');
    }

    // ===========================
    // UTILITY FUNCTIONS
    // ===========================

    getInitial(str) {
        return str ? str.charAt(0).toUpperCase() : '?';
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
}

// Initialize NEXAI on page load
document.addEventListener('DOMContentLoaded', () => {
    window.nexai = new NEXAI();
});
