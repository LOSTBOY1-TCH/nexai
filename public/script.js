// ===========================
// NEXAI – Frontend Application (fixed)
// ===========================

class NEXAI {
    constructor() {
        // Determine API URL based on environment
        // Priority: window.NEXAI_API_URL > localhost > same origin
        if (window.NEXAI_API_URL) {
            this.API_URL = window.NEXAI_API_URL;
        } else if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
            // Local development
            this.API_URL = 'http://localhost:3000/api';
        } else {
            // Production or v0 preview - use same origin
            this.API_URL = `${window.location.origin}/api`;
        }
        
        this.token     = localStorage.getItem('nexai_token');
        this.userId    = localStorage.getItem('nexai_userId');
        this.user      = null;
        this.chats     = [];
        this.attachments = [];
        this.currentChatId = null;
        this.isLoading = false;
        this.recognition = null;
        this.isListening = false;
        this.settings  = {
            theme:        localStorage.getItem('nexai_theme') || 'dark',
            voiceSpeed:   parseFloat(localStorage.getItem('nexai_voiceSpeed') || '1.0'),
            voicePitch:   parseFloat(localStorage.getItem('nexai_voicePitch') || '1.0'),
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

    // ─── DOM INIT ─────────────────────────────────────────────────────────────

    initializeDOM() {
        const get = id => {
            const el = document.getElementById(id);
            if (!el) console.warn(`[NEXAI] DOM element #${id} not found`);
            return el;
        };

        this.dom = {
            authContainer:         get('authContainer'),
            loginForm:             get('loginForm'),
            loginFormElement:      get('loginFormElement'),
            signupForm:            get('signupForm'),
            signupFormElement:     get('signupFormElement'),
            verificationForm:      get('verificationForm'),
            verificationFormElement: get('verificationFormElement'),
            chatLayout:            get('chatLayout'),
            sidebar:               get('sidebar'),
            sidebarToggle:         get('sidebarToggle'),
            sidebarOverlay:        get('sidebarOverlay'),
            newChatBtn:            get('newChatBtn'),
            chatList:              get('chatList'),
            searchInput:           get('searchInput'),
            messages:              get('messages'),
            messagesWrapper:       get('messagesWrapper'),
            loadingIndicator:      get('loadingIndicator'),
            messageInput:          get('messageInput'),
            sendBtn:               get('sendBtn'),
            fileBtn:               get('fileBtn'),
            fileInput:             get('fileInput'),
            voiceBtn:              get('voiceBtn'),
            attachmentPreview:     get('attachmentPreview'),
            attachmentList:        get('attachmentList'),
            settingsModal:         get('settingsModal'),
            profileModal:          get('profileModal'),
            settingsModalClose:    get('settingsModalClose'),
            profileModalClose:     get('profileModalClose'),
            chatActionsModal:      get('chatActionsModal'),
            modalClose:            get('modalClose'),
            userMenuBtn:           get('userMenuBtn'),
            userMenu:              get('userMenu'),
            userAvatar:            get('userAvatar'),
            userEmail:             get('userEmail'),
            profileBtn:            get('profileBtn'),
            settingsBtn:           get('settingsBtn'),
            logoutBtn:             get('logoutBtn'),
            notification:          get('notification')
        };

        this.applyTheme(this.settings.theme);
    }

    // ─── NOTIFICATIONS ────────────────────────────────────────────────────────

    notify(message, type = 'info', duration = 4000) {
        const el = this.dom.notification;
        if (!el) return;
        el.textContent = message;
        el.className   = `notification ${type} show`;
        clearTimeout(this._notifyTimer);
        this._notifyTimer = setTimeout(() => el.classList.remove('show'), duration);
    }

    // ─── EVENT LISTENERS ──────────────────────────────────────────────────────

    setupEventListeners() {
        const on = (id, evt, fn) => {
            const el = document.getElementById(id);
            if (el) el.addEventListener(evt, fn);
        };

        on('switchToSignup', 'click', e => { e.preventDefault(); this.switchAuthForm('signup'); });
        on('switchToLogin',  'click', e => { e.preventDefault(); this.switchAuthForm('login'); });
        on('backToSignup',   'click', e => { e.preventDefault(); this.switchAuthForm('signup'); });
        on('resendOtp',      'click', e => { e.preventDefault(); this.resendOtp(); });

        this.dom.loginFormElement?.addEventListener('submit',       e => this.handleLogin(e));
        this.dom.signupFormElement?.addEventListener('submit',      e => this.handleSignup(e));
        this.dom.verificationFormElement?.addEventListener('submit', e => this.handleVerifyOTP(e));

        this.dom.newChatBtn?.addEventListener('click',    () => this.createNewChat());
        this.dom.sidebarToggle?.addEventListener('click', () => this.toggleSidebar());
        this.dom.sidebarOverlay?.addEventListener('click', () => this.closeSidebar());

        this.dom.sendBtn?.addEventListener('click', () => this.sendMessage());
        this.dom.messageInput?.addEventListener('keydown', e => {
            if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') this.sendMessage();
        });

        this.dom.fileBtn?.addEventListener('click',   () => this.dom.fileInput?.click());
        this.dom.fileInput?.addEventListener('change', e => this.handleFileUpload(e));
        this.dom.voiceBtn?.addEventListener('click',  () => this.toggleVoiceInput());

        this.dom.settingsModalClose?.addEventListener('click', () => this.closeModal('settingsModal'));
        this.dom.profileModalClose?.addEventListener('click',  () => this.closeModal('profileModal'));
        this.dom.modalClose?.addEventListener('click',         () => this.closeModal('chatActionsModal'));

        this.dom.userMenuBtn?.addEventListener('click',  () => this.toggleUserMenu());
        this.dom.profileBtn?.addEventListener('click',   () => { this.closeUserMenu(); this.openProfileModal(); });
        this.dom.settingsBtn?.addEventListener('click',  () => { this.closeUserMenu(); this.openSettingsModal(); });
        this.dom.logoutBtn?.addEventListener('click',    () => this.logout());

        this.dom.searchInput?.addEventListener('input', e => this.filterChats(e.target.value));

        document.querySelectorAll('.theme-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                document.querySelectorAll('.theme-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                this.changeTheme(btn.dataset.theme);
            });
        });

        on('voiceSpeed',   'input', e => {
            this.settings.voiceSpeed = parseFloat(e.target.value);
            const el = document.getElementById('voiceSpeedValue');
            if (el) el.textContent = e.target.value + 'x';
            localStorage.setItem('nexai_voiceSpeed', e.target.value);
            this.saveSettings();
        });
        on('voicePitch',   'input', e => {
            this.settings.voicePitch = parseFloat(e.target.value);
            const el = document.getElementById('voicePitchValue');
            if (el) el.textContent = e.target.value + 'x';
            localStorage.setItem('nexai_voicePitch', e.target.value);
            this.saveSettings();
        });
        on('voiceEnabled', 'change', e => {
            this.settings.voiceEnabled = e.target.checked;
            localStorage.setItem('nexai_voiceEnabled', e.target.checked);
            this.saveSettings();
        });

        on('uploadAvatarBtn', 'click', () => document.getElementById('avatarInput')?.click());
        on('avatarInput',     'change', e => this.uploadAvatar(e));
        on('deleteAvatarBtn', 'click',  () => this.deleteAvatar());

        // Close user menu when clicking outside
        document.addEventListener('click', e => {
            if (this.dom.userMenu && !this.dom.userMenu.classList.contains('hidden')) {
                if (!this.dom.userMenuBtn?.contains(e.target) && !this.dom.userMenu.contains(e.target)) {
                    this.closeUserMenu();
                }
            }
        });
    }

    // ─── AUTH ─────────────────────────────────────────────────────────────────

    showAuthInterface() {
        this.dom.authContainer?.classList.add('active');
        this.dom.chatLayout?.classList.add('hidden');
        this.switchAuthForm('login');
    }

    showChatInterface() {
        this.dom.authContainer?.classList.remove('active');
        this.dom.chatLayout?.classList.remove('hidden');
    }

    switchAuthForm(form) {
        ['loginForm','signupForm','verificationForm'].forEach(id => {
            this.dom[id]?.classList.remove('active');
        });
        const map = { login: 'loginForm', signup: 'signupForm', verification: 'verificationForm' };
        this.dom[map[form]]?.classList.add('active');
    }

    async handleLogin(e) {
        e.preventDefault();
        const email    = document.getElementById('loginEmail')?.value.trim().toLowerCase() || '';
        const password = document.getElementById('loginPassword')?.value || '';
        const btn      = e.target.querySelector('button[type="submit"]');

        // Validate email format
        if (!email || !password) { 
            this.notify('Email and password are required.', 'error'); 
            return; 
        }
        if (!this._isValidEmail(email)) {
            this.notify('Please enter a valid email address.', 'error');
            return;
        }

        this._setLoading(btn, true, 'Signing In...');
        try {
            const data = await this._post('/auth/login', { email, password });
            if (!data.token || !data.userId) {
                this.notify('Invalid login response from server.', 'error');
                return;
            }
            this.token  = data.token;
            this.userId = data.userId;
            localStorage.setItem('nexai_token',  this.token);
            localStorage.setItem('nexai_userId', this.userId);
            this.user = { id: data.userId, username: data.username, email: data.email, avatar: data.avatar };
            e.target.reset();
            this.showChatInterface();
            this.loadUserProfile();
            this.loadChats();
        } catch (err) {
            // If unverified, redirect to verification form
            if (err.needsVerification) {
                localStorage.setItem('nexai_email', email);
                this.notify('Please verify your email first.', 'warning');
                this.switchAuthForm('verification');
            } else if (err.isNetworkError) {
                this.notify(`${err.message} Trying to connect to: ${this.API_URL}`, 'error');
            } else if (err.status === 401) {
                this.notify('Invalid email or password. Please try again.', 'error');
            } else {
                this.notify(err.message || 'Login failed. Please try again.', 'error');
            }
        }
        this._setLoading(btn, false);
    }

    async handleSignup(e) {
        e.preventDefault();
        const username        = document.getElementById('signupUsername')?.value.trim() || '';
        const email           = document.getElementById('signupEmail')?.value.trim().toLowerCase() || '';
        const password        = document.getElementById('signupPassword')?.value || '';
        const passwordConfirm = document.getElementById('signupPasswordConfirm')?.value || '';
        const btn             = e.target.querySelector('button[type="submit"]');

        if (!username || !email || !password || !passwordConfirm) {
            this.notify('All fields are required.', 'error'); 
            return;
        }
        if (username.length < 3) {
            this.notify('Username must be at least 3 characters.', 'error');
            return;
        }
        if (!this._isValidEmail(email)) {
            this.notify('Please enter a valid email address.', 'error');
            return;
        }
        if (password.length < 6) {
            this.notify('Password must be at least 6 characters.', 'error');
            return;
        }
        if (password !== passwordConfirm) {
            this.notify('Passwords do not match.', 'error'); 
            return;
        }

        this._setLoading(btn, true, 'Creating Account...');
        try {
            await this._post('/auth/register', { username, email, password, passwordConfirm });
            localStorage.setItem('nexai_email', email);
            e.target.reset();
            this.notify('Account created! Check your email for the verification code.', 'success', 6000);
            this.switchAuthForm('verification');
        } catch (err) {
            if (err.isNetworkError) {
                this.notify(`${err.message} Trying to connect to: ${this.API_URL}`, 'error');
            } else if (err.status === 409) {
                this.notify('Email or username already exists. Try logging in or use a different email.', 'error');
            } else {
                this.notify(err.message || 'Signup failed. Please try again.', 'error');
            }
        }
        this._setLoading(btn, false);
    }

    async handleVerifyOTP(e) {
        e.preventDefault();
        const code  = document.getElementById('otpCode')?.value.trim() || '';
        const email = localStorage.getItem('nexai_email');
        const btn   = e.target.querySelector('button[type="submit"]');

        if (!email) { 
            this.notify('Session expired. Please sign up again.', 'error'); 
            this.switchAuthForm('signup'); 
            return; 
        }
        if (!code || code.length !== 6) { 
            this.notify('Please enter a valid 6-digit code.', 'error'); 
            return; 
        }
        if (!/^\d+$/.test(code)) {
            this.notify('Code must contain only numbers.', 'error');
            return;
        }

        this._setLoading(btn, true, 'Verifying...');
        try {
            const data = await this._post('/auth/verify-otp', { email, code });
            if (!data.token || !data.userId) {
                this.notify('Invalid verification response from server.', 'error');
                return;
            }
            this.token  = data.token;
            this.userId = data.userId;
            localStorage.setItem('nexai_token',  this.token);
            localStorage.setItem('nexai_userId', this.userId);
            localStorage.removeItem('nexai_email');
            e.target.reset();
            this.notify('Email verified! Welcome to NEXAI.', 'success');
            this.showChatInterface();
            this.loadUserProfile();
            this.createNewChat();
        } catch (err) {
            if (err.isNetworkError) {
                this.notify(`${err.message} Trying to connect to: ${this.API_URL}`, 'error');
            } else if (err.status === 401) {
                this.notify('Invalid or expired verification code. Please try again or request a new code.', 'error');
            } else {
                this.notify(err.message || 'Verification failed. Please try again.', 'error');
            }
        }
        this._setLoading(btn, false);
    }

    async resendOtp() {
        const email = localStorage.getItem('nexai_email');
        if (!email) { this.notify('No pending signup found. Please sign up again.', 'error'); return; }
        this.notify('Resending code…', 'info');
        try {
            // Trigger a lightweight re-register attempt won't work — just hint user
            this.notify('Please use the code already sent, or sign up again if it expired.', 'warning', 6000);
        } catch (err) {
            this.notify('Could not resend. Try signing up again.', 'error');
        }
    }

    async loadUserProfile() {
        try {
            const data = await this._get('/user/profile');
            if (data.success) { this.user = data.user; this.updateUserUI(); }
        } catch {}
    }

    updateUserUI() {
        if (!this.user) return;
        const initial = (this.user.username || 'U').charAt(0).toUpperCase();

        if (this.dom.userAvatar) {
            if (this.user.avatar) {
                this.dom.userAvatar.style.backgroundImage = `url(${this.user.avatar})`;
                this.dom.userAvatar.style.backgroundSize  = 'cover';
                this.dom.userAvatar.textContent = '';
            } else {
                this.dom.userAvatar.style.backgroundImage = '';
                this.dom.userAvatar.textContent = initial;
            }
        }
        if (this.dom.userEmail) this.dom.userEmail.textContent = this.user.username || '';

        const profileUsername = document.getElementById('profileUsername');
        const profileEmail    = document.getElementById('profileEmail');
        const profileJoined   = document.getElementById('profileJoined');
        const profileAvatar   = document.getElementById('profileAvatar');

        if (profileUsername) profileUsername.textContent = this.user.username || '';
        if (profileEmail)    profileEmail.textContent    = this.user.email    || '';
        if (profileJoined)   profileJoined.textContent   = this.user.createdAt
            ? new Date(this.user.createdAt).toLocaleDateString() : '—';
        if (profileAvatar && this.user.avatar) profileAvatar.src = this.user.avatar;
    }

    async logout() {
        try { await this._post('/auth/logout', {}); } catch {}
        localStorage.removeItem('nexai_token');
        localStorage.removeItem('nexai_userId');
        this.token  = null;
        this.userId = null;
        this.user   = null;
        this.chats  = [];
        this.showAuthInterface();
    }

    // ─── CHAT MANAGEMENT ──────────────────────────────────────────────────────

    async loadChats() {
        try {
            const data = await this._get('/chats');
            if (data.success) { this.chats = data.chats; this.renderChatList(); }
        } catch {}
    }

    renderChatList() {
        if (!this.dom.chatList) return;
        this.dom.chatList.innerHTML = '';
        if (!this.chats.length) {
            this.dom.chatList.innerHTML = '<div class="empty-state"><i class="fas fa-inbox"></i><p>No chats yet</p></div>';
            return;
        }
        this.chats.forEach(chat => {
            // API returns chatId / chatTitle (fixed field names)
            const id    = chat.chatId;
            const title = this.escapeHtml(chat.chatTitle || 'Untitled Chat');
            const item  = document.createElement('div');
            item.className = 'chat-item' + (this.currentChatId === id ? ' active' : '');
            item.dataset.chatId = id;
            item.innerHTML = `
                <div class="chat-item-main">
                    <div class="chat-item-title">${title}</div>
                </div>
                <button class="chat-item-menu" aria-label="Chat options">
                    <i class="fas fa-ellipsis-v"></i>
                </button>`;
            item.querySelector('.chat-item-main').addEventListener('click', () => this.selectChat(id));
            item.querySelector('.chat-item-menu').addEventListener('click', ev => { ev.stopPropagation(); this.showChatMenu(id, ev); });
            this.dom.chatList.appendChild(item);
        });
    }

    createNewChat() {
        this.currentChatId = 'chat_' + Date.now();
        if (this.dom.messages) this.dom.messages.innerHTML = '';
        this.dom.messageInput?.focus();
        this.closeSidebar();
        this.renderChatList();
    }

    async selectChat(chatId) {
        this.currentChatId = chatId;
        this.renderChatList();
        try {
            const data = await this._get(`/chats/${chatId}`);
            if (data.success && this.dom.messages) {
                this.dom.messages.innerHTML = '';
                (data.chat.messages || []).forEach(msg => this.displayMessage(msg));
                if (this.dom.messagesWrapper) this.dom.messagesWrapper.scrollTop = this.dom.messagesWrapper.scrollHeight;
            }
        } catch {}
        this.closeSidebar();
    }

    async deleteChat(chatId) {
        if (!confirm('Delete this chat?')) return;
        try {
            await this._delete(`/chats/${chatId}`);
            await this.loadChats();
            if (this.currentChatId === chatId) this.createNewChat();
        } catch { this.notify('Could not delete chat.', 'error'); }
    }

    showChatMenu(chatId, event) {
        event.stopPropagation();
        this.showModal('chatActionsModal');
        const body = document.getElementById('modalBody');
        if (body) {
            body.innerHTML = '';
            const btn = document.createElement('button');
            btn.className = 'action-btn danger';
            btn.innerHTML = '<i class="fas fa-trash"></i> Delete Chat';
            btn.addEventListener('click', () => { this.closeModal('chatActionsModal'); this.deleteChat(chatId); });
            body.appendChild(btn);
        }
    }

    filterChats(query) {
        document.querySelectorAll('.chat-item').forEach(item => {
            const title = item.querySelector('.chat-item-title')?.textContent.toLowerCase() || '';
            item.style.display = title.includes(query.toLowerCase()) ? '' : 'none';
        });
    }

    toggleSidebar() {
        this.dom.sidebar?.classList.toggle('active');
        this.dom.sidebarOverlay?.classList.toggle('active');
    }

    closeSidebar() {
        this.dom.sidebar?.classList.remove('active');
        this.dom.sidebarOverlay?.classList.remove('active');
    }

    // ─── MESSAGES ─────────────────────────────────────────────────────────────

    async sendMessage() {
        const message = this.dom.messageInput?.value.trim();
        if (!message || this.isLoading) return;
        if (this.dom.messageInput) this.dom.messageInput.value = '';

        this.displayMessage({ role: 'user', content: message, timestamp: new Date() });
        this.showLoading(true);

        try {
            const history = Array.from(this.dom.messages?.querySelectorAll('.message') || []).map(el => ({
                role:    el.classList.contains('user') ? 'user' : 'assistant',
                content: el.querySelector('.message-content')?.textContent || ''
            }));

            const data = await this._post('/ai/chat', { message, conversationHistory: history });
            if (data.success) {
                const aiMsg = { role: 'assistant', content: data.response || 'No response', timestamp: new Date() };
                this.displayMessage(aiMsg);
                if (this.settings.voiceEnabled) this.speak(aiMsg.content);
                this.saveChat();
            }
        } catch (err) {
            this.displayMessage({ role: 'assistant', content: 'Error communicating with AI. Please try again.', timestamp: new Date() });
        }

        this.showLoading(false);
    }

    displayMessage(msg) {
        if (!this.dom.messages) return;
        const el      = document.createElement('div');
        el.className  = `message ${msg.role}`;
        const avatar  = msg.role === 'user' ? this.getInitial(this.user?.username || 'U') : '🤖';
        const tsText  = msg.timestamp ? new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '';
        const content = this.escapeHtml(String(msg.content || ''));

        // Safe copy handler using dataset to avoid inline JS injection
        el.innerHTML = `
            <div class="message-avatar">${msg.role === 'user' && this.user?.avatar
                ? `<img src="${this.escapeHtml(this.user.avatar)}" alt="User">`
                : avatar}</div>
            <div class="message-content-container">
                <div class="message-content">${content}</div>
                <div class="message-meta">${tsText}</div>
                <div class="message-actions">
                    <button class="message-action-btn copy-btn" title="Copy"><i class="fas fa-copy"></i> Copy</button>
                    <button class="message-action-btn del-btn"  title="Delete"><i class="fas fa-trash"></i></button>
                </div>
            </div>`;

        el.querySelector('.copy-btn').addEventListener('click', () => {
            navigator.clipboard.writeText(msg.content || '').then(() => this.notify('Copied!', 'success', 1500));
        });
        el.querySelector('.del-btn').addEventListener('click', () => el.remove());

        this.dom.messages.appendChild(el);
        if (this.dom.messagesWrapper) this.dom.messagesWrapper.scrollTop = this.dom.messagesWrapper.scrollHeight;
    }

    showLoading(show) {
        this.isLoading = show;
        this.dom.loadingIndicator?.classList.toggle('hidden', !show);
        if (this.dom.messagesWrapper) this.dom.messagesWrapper.scrollTop = this.dom.messagesWrapper.scrollHeight;
    }

    async saveChat() {
        if (!this.currentChatId || !this.dom.messages) return;
        const messages = Array.from(this.dom.messages.querySelectorAll('.message')).map(el => ({
            role:      el.classList.contains('user') ? 'user' : 'assistant',
            content:   el.querySelector('.message-content')?.textContent || '',
            timestamp: new Date()
        }));
        let chatTitle = messages[0]?.content.substring(0, 50) || 'New Chat';
        if ((messages[0]?.content || '').length > 50) chatTitle += '…';

        try {
            await this._post('/chats', { chatId: this.currentChatId, chatTitle, messages });
            this.loadChats();
        } catch {}
    }

    // ─── FILE UPLOAD ──────────────────────────────────────────────────────────

    async handleFileUpload(e) {
        const file = e.target.files?.[0];
        if (!file) return;
        const formData = new FormData();
        formData.append('file', file);
        try {
            const resp = await fetch(`${this.API_URL}/upload`, {
                method:  'POST',
                headers: { 'Authorization': `Bearer ${this.token}` },
                body:    formData
            });
            const data = await resp.json();
            if (data.success) this.addAttachment(data.file);
            else this.notify(data.message || 'Upload failed.', 'error');
        } catch { this.notify('Upload error.', 'error'); }
        if (this.dom.fileInput) this.dom.fileInput.value = '';
    }

    addAttachment(file) {
        this.attachments.push(file);
        const item = document.createElement('div');
        item.className = 'attachment-item';
        item.innerHTML = `<i class="fas fa-file"></i><span>${this.escapeHtml(file.name)}</span>`;
        const rm = document.createElement('button');
        rm.className = 'attachment-remove';
        rm.innerHTML = '<i class="fas fa-times"></i>';
        rm.addEventListener('click', () => { this.removeAttachment(file.name); item.remove(); });
        item.appendChild(rm);
        this.dom.attachmentList?.appendChild(item);
        if (this.dom.attachmentPreview) this.dom.attachmentPreview.style.display = 'block';
    }

    removeAttachment(name) {
        this.attachments = this.attachments.filter(a => a.name !== name);
        if (!this.attachments.length && this.dom.attachmentPreview) {
            this.dom.attachmentPreview.style.display = 'none';
        }
    }

    // ─── VOICE ────────────────────────────────────────────────────────────────

    setupSpeechRecognition() {
        const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
        if (!SR) { if (this.dom.voiceBtn) this.dom.voiceBtn.style.display = 'none'; return; }
        this.recognition = new SR();
        this.recognition.continuous = false;
        this.recognition.interimResults = true;
        this.recognition.lang = 'en-US';
        this.recognition.onstart  = () => { this.isListening = true;  this.dom.voiceBtn?.classList.add('listening'); };
        this.recognition.onend    = () => { this.isListening = false; this.dom.voiceBtn?.classList.remove('listening'); };
        this.recognition.onerror  = ev => console.warn('Speech error:', ev.error);
        this.recognition.onresult = ev => {
            let t = '';
            for (let i = ev.resultIndex; i < ev.results.length; i++) t += ev.results[i][0].transcript;
            if (ev.results[ev.results.length - 1].isFinal) {
                if (this.dom.messageInput) this.dom.messageInput.value = t;
                this.sendMessage();
            }
        };
    }

    toggleVoiceInput() {
        if (!this.recognition) return;
        this.isListening ? this.recognition.stop() : this.recognition.start();
    }

    speak(text) {
        if (!('speechSynthesis' in window)) return;
        speechSynthesis.cancel();
        const u = new SpeechSynthesisUtterance(text);
        u.rate  = this.settings.voiceSpeed;
        u.pitch = this.settings.voicePitch;
        speechSynthesis.speak(u);
    }

    // ─── SETTINGS / PROFILE ───────────────────────────────────────────────────

    openSettingsModal() {
        this.showModal('settingsModal');
        document.querySelectorAll('.theme-btn').forEach(b => {
            b.classList.toggle('active', b.dataset.theme === this.settings.theme);
        });
        const vs = document.getElementById('voiceSpeed');
        const vp = document.getElementById('voicePitch');
        const ve = document.getElementById('voiceEnabled');
        if (vs) { vs.value = this.settings.voiceSpeed; const lbl = document.getElementById('voiceSpeedValue'); if (lbl) lbl.textContent = vs.value + 'x'; }
        if (vp) { vp.value = this.settings.voicePitch; const lbl = document.getElementById('voicePitchValue'); if (lbl) lbl.textContent = vp.value + 'x'; }
        if (ve) ve.checked = this.settings.voiceEnabled;
    }

    openProfileModal() { this.showModal('profileModal'); this.updateUserUI(); }

    async uploadAvatar(e) {
        const file = e.target.files?.[0];
        if (!file) return;
        const formData = new FormData();
        formData.append('avatar', file);
        try {
            const resp = await fetch(`${this.API_URL}/user/avatar`, {
                method:  'POST',
                headers: { 'Authorization': `Bearer ${this.token}` },
                body:    formData
            });
            const data = await resp.json();
            if (data.success) { this.user.avatar = data.avatar; this.updateUserUI(); this.notify('Avatar updated!', 'success'); }
            else this.notify(data.message || 'Upload failed.', 'error');
        } catch { this.notify('Avatar upload error.', 'error'); }
        const ai = document.getElementById('avatarInput');
        if (ai) ai.value = '';
    }

    async deleteAvatar() {
        try {
            const data = await this._delete('/user/avatar');
            if (data.success) { if (this.user) this.user.avatar = null; this.updateUserUI(); this.notify('Avatar removed.', 'success'); }
        } catch { this.notify('Could not remove avatar.', 'error'); }
    }

    async saveSettings() {
        try {
            await this._put('/settings', {
                theme:        this.settings.theme,
                voiceSpeed:   this.settings.voiceSpeed,
                voicePitch:   this.settings.voicePitch,
                voiceEnabled: this.settings.voiceEnabled
            });
        } catch {}
    }

    async loadSettings() {
        try {
            const data = await this._get('/settings');
            if (data.success) {
                this.settings = {
                    theme:        data.settings.theme || 'dark',
                    voiceSpeed:   data.settings.voiceSpeed || 1.0,
                    voicePitch:   data.settings.voicePitch || 1.0,
                    voiceEnabled: data.settings.voiceEnabled !== false
                };
                this.applyTheme(this.settings.theme);
            }
        } catch {}
    }

    changeTheme(theme) {
        this.settings.theme = theme;
        this.applyTheme(theme);
        localStorage.setItem('nexai_theme', theme);
        this.saveSettings();
    }

    applyTheme(theme) {
        document.body.className = document.body.className
            .replace(/theme-\S+/g, '').trim() + ` theme-${theme}`;
    }

    // ─── MODALS ───────────────────────────────────────────────────────────────

    showModal(id)  { document.getElementById(id)?.classList.remove('hidden'); }
    closeModal(id) { document.getElementById(id)?.classList.add('hidden');    }
    toggleUserMenu() { this.dom.userMenu?.classList.toggle('hidden'); }
    closeUserMenu()  { this.dom.userMenu?.classList.add('hidden'); }

    // ─── HTTP HELPERS ─────────────────────────────────────────────────────────

    async _request(method, path, body) {
        const opts = {
            method,
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${this.token}` }
        };
        if (body !== undefined) opts.body = JSON.stringify(body);
        
        try {
            const url = `${this.API_URL}${path}`;
            const resp = await fetch(url, opts);
            const data = await resp.json().catch(() => ({}));
            
            if (!resp.ok) {
                const err = new Error(data.message || `HTTP ${resp.status}`);
                err.needsVerification = data.needsVerification || false;
                err.status = resp.status;
                throw err;
            }
            return data;
        } catch (err) {
            // Network error or connection refused
            if (err instanceof TypeError && err.message.includes('Failed to fetch')) {
                const error = new Error(`Cannot connect to API server. Please check your connection and try again.`);
                error.isNetworkError = true;
                throw error;
            }
            throw err;
        }
    }

    _get(path)        { return this._request('GET',    path); }
    _post(path, body) { return this._request('POST',   path, body); }
    _put(path, body)  { return this._request('PUT',    path, body); }
    _delete(path)     { return this._request('DELETE', path); }

    // ─── UTILS ────────────────────────────────────────────────────────────────

    getInitial(str) { return str?.charAt(0).toUpperCase() || '?'; }

    escapeHtml(text) {
        return String(text).replace(/[&<>"']/g, c => ({
            '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;'
        }[c]));
    }

    _isValidEmail(email) {
        // Simple email validation regex
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        return emailRegex.test(email);
    }

    _setLoading(btn, loading, loadingText = 'Loading...') {
        if (!btn) return;
        if (loading) {
            btn._origHTML = btn.innerHTML;
            btn.disabled  = true;
            btn.innerHTML = `<i class="fas fa-spinner fa-spin"></i> ${loadingText}`;
        } else {
            btn.disabled  = false;
            btn.innerHTML = btn._origHTML || btn.innerHTML;
        }
    }
}

document.addEventListener('DOMContentLoaded', () => { window.nexai = new NEXAI(); });
