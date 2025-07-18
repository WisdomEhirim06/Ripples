// Ripple App - Main JavaScript - Connected to Backend (Enhanced with threaded replies)

class RippleApp {
    constructor() {
        this.currentRoomId = null;
        this.userIdentity = null;
        this.socket = null;
        this.roomTimer = null;
        this.posts = [];
        this.baseUrl = 'https://ripple-backend-ye3b.onrender.com';
        this.replyingToPostId = null; // Track which post we're replying to
        this.init();
    }

    init() {
        this.setupEventListeners();
        this.checkRoute();
    }

    setupEventListeners() {
        // Landing page
        document.getElementById('create-room-btn').addEventListener('click', () => {
            this.showRoomModal();
        });

        // Room modal
        document.getElementById('cancel-room').addEventListener('click', () => {
            this.hideRoomModal();
        });

        document.getElementById('room-form').addEventListener('submit', (e) => {
            e.preventDefault();
            this.createRoom();
        });

        // Room page
        document.getElementById('post-input').addEventListener('input', (e) => {
            this.updateCharCount(e.target.value);
        });

        document.getElementById('submit-post').addEventListener('click', () => {
            this.submitPost();
        });

        // Cancel reply mode on Escape key
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && this.replyingToPostId) {
                this.cancelReply();
            }
        });

        // Handle page routing
        window.addEventListener('popstate', () => {
            this.checkRoute();
        });
    }

    checkRoute() {
        const path = window.location.pathname;
        if (path.startsWith('/room/')) {
            const roomId = path.split('/')[2];
            this.joinRoom(roomId);
        } else {
            this.showLandingPage();
        }
    }

    showLandingPage() {
        document.getElementById('landing-page').classList.remove('hidden');
        document.getElementById('room-page').classList.add('hidden');
        document.getElementById('expired-page').classList.add('hidden');
    }

    showRoomModal() {
        document.getElementById('room-modal').classList.remove('hidden');
        document.getElementById('room-modal').classList.add('flex');
        document.getElementById('room-topic').focus();
    }

    hideRoomModal() {
        document.getElementById('room-modal').classList.add('hidden');
        document.getElementById('room-modal').classList.remove('flex');
        document.getElementById('room-form').reset();
    }

    async createRoom() {
        const topic = document.getElementById('room-topic').value;
        const duration = parseInt(document.getElementById('room-duration').value);
        const maxParticipants = document.getElementById('max-participants').value;

        if (!topic.trim()) {
            this.showNotification('Please enter a room topic', 'error');
            return;
        }

        const submitBtn = document.querySelector('#room-form button[type="submit"]');
        const originalText = submitBtn.textContent;
        submitBtn.disabled = true;
        submitBtn.innerHTML = '<div class="loading-spinner" style="width: 20px; height: 20px; margin: 0 auto;"></div>';

        try {
            const response = await fetch(`${this.baseUrl}/api/rooms`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    topic,
                    duration_hours: duration,
                    max_participants: maxParticipants ? parseInt(maxParticipants) : null
                })
            });

            if (response.ok) {
                const room = await response.json();
                this.hideRoomModal();
                this.showNotification('Room created successfully!', 'success');
                window.history.pushState({}, '', `/room/${room.id}`);
                this.joinRoom(room.id);
            } else {
                const error = await response.json();
                this.showNotification(error.detail || 'Failed to create room', 'error');
            }
        } catch (error) {
            console.error('Error creating room:', error);
            this.showNotification('Failed to create room. Please try again.', 'error');
        } finally {
            submitBtn.disabled = false;
            submitBtn.textContent = originalText;
        }
    }

    async joinRoom(roomId) {
        this.currentRoomId = roomId;
        
        try {
            // Get room info
            const roomResponse = await fetch(`${this.baseUrl}/api/rooms/${roomId}`);
            if (!roomResponse.ok) {
                if (roomResponse.status === 404) {
                    this.showExpiredPage();
                    return;
                }
                throw new Error('Failed to fetch room');
            }

            const room = await roomResponse.json();
            
            // Check if room is expired
            if (new Date(room.expires_at) < new Date()) {
                this.showExpiredPage();
                return;
            }

            // Join room
            const joinResponse = await fetch(`${this.baseUrl}/api/rooms/${roomId}/join`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                }
            });

            if (joinResponse.ok) {
                const joinData = await joinResponse.json();
                this.userIdentity = joinData.identity;
                
                this.showRoomPage(room);
                this.loadPosts();
                this.connectWebSocket();
                this.startRoomTimer(room.expires_at);
            } else {
                const error = await joinResponse.json();
                this.showNotification(error.detail || 'Failed to join room', 'error');
            }
        } catch (error) {
            console.error('Error joining room:', error);
            this.showNotification('Failed to join room. Please try again.', 'error');
        }
    }

    showRoomPage(room) {
        document.getElementById('landing-page').classList.add('hidden');
        document.getElementById('room-page').classList.remove('hidden');
        document.getElementById('expired-page').classList.add('hidden');
        
        document.getElementById('room-topic-header').textContent = room.topic;
        const identityElement = document.getElementById('user-identity');
        identityElement.innerHTML = `You are <span class="font-medium text-purple-200">${this.userIdentity}</span>`;
        
        // Add typewriter effect
        setTimeout(() => {
            identityElement.classList.add('typewriter');
        }, 500);
    }

    showExpiredPage() {
        document.getElementById('landing-page').classList.add('hidden');
        document.getElementById('room-page').classList.add('hidden');
        document.getElementById('expired-page').classList.remove('hidden');
        this.cleanup();
    }

    async loadPosts() {
        try {
            const response = await fetch(`${this.baseUrl}/api/rooms/${this.currentRoomId}/posts`);
            if (response.ok) {
                const posts = await response.json();
                this.posts = posts;
                this.renderPosts();
            }
        } catch (error) {
            console.error('Error loading posts:', error);
            this.showNotification('Failed to load posts', 'error');
        }
    }

    renderPosts() {
        const container = document.getElementById('posts-container');
        const loading = document.getElementById('loading-posts');
        const noPosts = document.getElementById('no-posts');

        loading.classList.add('hidden');

        if (this.posts.length === 0) {
            noPosts.classList.remove('hidden');
            container.innerHTML = '';
            return;
        }

        noPosts.classList.add('hidden');
        container.innerHTML = this.posts.map(post => this.createPostElement(post)).join('');
        this.attachPostEventListeners();
    }

    createPostElement(post, level = 0) {
        const mood = this.detectMood(post.content);
        const timeAgo = this.getTimeAgo(post.created_at);

        const repliesHtml = (post.replies || [])
            .map(reply => this.createPostElement(reply, level + 1))
            .join('');

        return `
            <div class="post-card fade-in ml-${level * 4}" data-post-id="${post.id}">
                <div class="flex items-start justify-between mb-3">
                    <div class="flex items-center gap-3">
                        <span class="font-medium text-slate-700">${post.anonymous_identity}</span>
                        <span class="mood-badge mood-${mood}">${mood}</span>
                    </div>
                    <span class="text-sm text-slate-500">${timeAgo}</span>
                </div>
                <p class="text-slate-800 mb-4 leading-relaxed">${this.escapeHtml(post.content)}</p>
                <div class="flex items-center gap-4 mb-2">
                    <button class="vote-btn" data-post-id="${post.id}" data-vote="up">👍 ${post.vote_score || 0}</button>
                    <button class="vote-btn" data-post-id="${post.id}" data-vote="down">👎</button>
                    <button class="reply-btn text-blue-600" data-post-id="${post.id}">Reply</button>
                </div>
                <div class="ml-6">${repliesHtml}</div>
            </div>
        `;
    }

    attachPostEventListeners() {
        // Voting buttons
        document.querySelectorAll('.vote-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const postId = e.currentTarget.dataset.postId;
                const voteType = e.currentTarget.dataset.vote;
                this.votePost(postId, voteType, e.currentTarget);
            });
        });

        // Reply buttons
        document.querySelectorAll('.reply-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const postId = e.currentTarget.dataset.postId;
                this.enterReplyMode(postId);
            });
        });
    }

    enterReplyMode(postId) {
        this.replyingToPostId = postId;
        const input = document.getElementById('post-input');
        input.placeholder = `Replying to post ${postId}... (press Esc to cancel)`;
        input.focus();
    }

    cancelReply() {
        this.replyingToPostId = null;
        document.getElementById('post-input').placeholder = 'Share your thoughts...';
    }

    async votePost(postId, voteType, buttonElement) {
        try {
            const response = await fetch(`${this.baseUrl}/api/posts/${postId}/vote`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ vote_type: voteType })
            });

            if (response.ok) {
                // Update will come through WebSocket
                this.addRippleEffect(buttonElement);
            } else {
                const error = await response.json();
                this.showNotification(error.detail || 'Failed to vote', 'error');
            }
        } catch (error) {
            console.error('Error voting:', error);
            this.showNotification('Failed to vote. Please try again.', 'error');
        }
    }

    connectWebSocket() {
        // Convert HTTPS to WSS, HTTP to WS
        const protocol = this.baseUrl.startsWith('https') ? 'wss:' : 'ws:';
        const baseUrlWithoutProtocol = this.baseUrl.replace(/^https?:\/\//, '');
        const wsUrl = `${protocol}//${baseUrlWithoutProtocol}/api/rooms/${this.currentRoomId}/ws`;
        
        this.socket = new WebSocket(wsUrl);

        this.socket.onopen = () => {
            console.log('WebSocket connected');
        };

        this.socket.onmessage = (event) => {
            const data = JSON.parse(event.data);
            this.handleWebSocketMessage(data);
        };

        this.socket.onclose = () => {
            console.log('WebSocket disconnected');
            // Reconnect logic
            setTimeout(() => {
                if (this.currentRoomId) {
                    this.connectWebSocket();
                }
            }, 3000);
        };

        this.socket.onerror = (error) => {
            console.error('WebSocket error:', error);
        };
    }

    handleWebSocketMessage(data) {
        if (data.type === 'new_post') {
            this.posts.unshift(data.post);
            this.renderPosts();
            this.smoothScrollToTop();
        } else if (data.type === 'post_vote') {
            const postIndex = this.posts.findIndex(p => p.id === data.post_id);
            if (postIndex !== -1) {
                this.posts[postIndex] = { ...this.posts[postIndex], ...data.vote_data };
                this.renderPosts();
            }
        } else if (data.type === 'room_expired') {
            this.showExpiredPage();
            this.showNotification('Room has expired', 'info');
        }
    }

    async submitPost() {
        const content = document.getElementById('post-input').value.trim();
        if (!content) return;

        const submitBtn = document.getElementById('submit-post');
        const originalText = submitBtn.textContent;
        submitBtn.disabled = true;
        submitBtn.innerHTML = '<div class="loading-spinner" style="width: 16px; height: 16px; margin: 0 auto;"></div>';

        const payload = { content };
        if (this.replyingToPostId) payload.parent_id = this.replyingToPostId;

        try {
            const response = await fetch(`${this.baseUrl}/api/rooms/${this.currentRoomId}/posts`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(payload)
            });

            if (response.ok) {
                document.getElementById('post-input').value = '';
                this.updateCharCount('');
                this.addRippleEffect(submitBtn);
                this.showNotification('Post shared successfully!', 'success');
                this.cancelReply();
            } else {
                const error = await response.json();
                this.showNotification(error.detail || 'Failed to submit post', 'error');
            }
        } catch (error) {
            console.error('Error submitting post:', error);
            this.showNotification('Failed to submit post. Please try again.', 'error');
        } finally {
            submitBtn.disabled = false;
            submitBtn.innerHTML = `<i class="fas fa-paper-plane mr-2"></i>${originalText}`;
        }
    }

    updateCharCount(content) {
        const count = content.length;
        const countElement = document.getElementById('char-count');
        countElement.textContent = `${count}/300`;
        
        const submitBtn = document.getElementById('submit-post');
        submitBtn.disabled = count === 0 || count > 300;
        
        countElement.classList.remove('text-orange-500', 'text-red-500');
        if (count > 250) {
            countElement.classList.add('text-orange-500');
        }
        if (count > 280) {
            countElement.classList.remove('text-orange-500');
            countElement.classList.add('text-red-500');
        }
    }

    startRoomTimer(expiresAt) {
        const updateTimer = () => {
            const now = new Date();
            const expires = new Date(expiresAt);
            const remaining = expires - now;

            if (remaining <= 0) {
                this.showExpiredPage();
                return;
            }

            const hours = Math.floor(remaining / (1000 * 60 * 60));
            const minutes = Math.floor((remaining % (1000 * 60 * 60)) / (1000 * 60));
            const seconds = Math.floor((remaining % (1000 * 60)) / 1000);

            const timerElement = document.getElementById('room-timer');
            timerElement.textContent = `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;

            // Add warning animation when less than 15 minutes
            if (remaining < 15 * 60 * 1000) {
                timerElement.classList.add('warning-pulse', 'text-orange-500');
            }

            // Add critical animation when less than 5 minutes
            if (remaining < 5 * 60 * 1000) {
                timerElement.classList.add('text-red-500');
                timerElement.classList.remove('text-orange-500');
            }
        };

        updateTimer();
        this.roomTimer = setInterval(updateTimer, 1000);
    }

    detectMood(content) {
        const text = content.toLowerCase();
        
        const moodKeywords = {
            sad: ['sad', 'depressed', 'cry', 'hurt', 'pain', 'lonely', 'empty', 'lost', 'broken', 'grief', 'sorrow'],
            anxious: ['anxious', 'worried', 'nervous', 'scared', 'afraid', 'panic', 'stress', 'overwhelmed', 'fear', 'tension'],
            hopeful: ['hope', 'better', 'good', 'positive', 'happy', 'grateful', 'thankful', 'blessed', 'excited', 'optimistic', 'joy'],
            calm: ['calm', 'peaceful', 'serene', 'relaxed', 'centered', 'balanced', 'content', 'quiet', 'tranquil', 'zen']
        };

        for (const [mood, keywords] of Object.entries(moodKeywords)) {
            if (keywords.some(keyword => text.includes(keyword))) {
                return mood;
            }
        }

        return 'neutral';
    }

    getTimeAgo(timestamp) {
        const now = new Date();
        const time = new Date(timestamp);
        const diffInSeconds = Math.floor((now - time) / 1000);

        if (diffInSeconds < 60) {
            return 'just now';
        } else if (diffInSeconds < 3600) {
            const minutes = Math.floor(diffInSeconds / 60);
            return `${minutes}m ago`;
        } else if (diffInSeconds < 86400) {
            const hours = Math.floor(diffInSeconds / 3600);
            return `${hours}h ago`;
        } else {
            const days = Math.floor(diffInSeconds / 86400);
            return `${days}d ago`;
        }
    }

    addRippleEffect(element) {
        element.classList.add('ripple-effect');
        setTimeout(() => {
            element.classList.remove('ripple-effect');
        }, 600);
    }

    smoothScrollToTop() {
        const postsContainer = document.getElementById('posts-container');
        if (postsContainer.children.length > 0) {
            postsContainer.children[0].scrollIntoView({
                behavior: 'smooth',
                block: 'start'
            });
        }
    }

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    showNotification(message, type = 'info') {
        const notification = document.createElement('div');
        notification.className = `notification ${type}`;
        notification.textContent = message;
        
        const container = document.getElementById('notifications') || this.createNotificationContainer();
        container.appendChild(notification);
        
        // Animate in
        setTimeout(() => {
            notification.classList.add('show');
        }, 100);
        
        // Animate out and remove
        setTimeout(() => {
            notification.classList.remove('show');
            setTimeout(() => {
                if (container.contains(notification)) {
                    container.removeChild(notification);
                }
            }, 300);
        }, 4000);
    }

    createNotificationContainer() {
        const container = document.createElement('div');
        container.id = 'notifications';
        container.className = 'fixed top-4 right-4 z-50 space-y-2';
        document.body.appendChild(container);
        return container;
    }

    cleanup() {
        if (this.socket) {
            this.socket.close();
            this.socket = null;
        }
        if (this.roomTimer) {
            clearInterval(this.roomTimer);
            this.roomTimer = null;
        }
    }
}

// Initialize the app
document.addEventListener('DOMContentLoaded', () => {
    window.rippleApp = new RippleApp();
});

// Cleanup on page unload
window.addEventListener('beforeunload', () => {
    if (window.rippleApp) {
        window.rippleApp.cleanup();
    }
});

// Enhanced keyboard shortcuts
document.addEventListener('keydown', (e) => {
    // Cmd/Ctrl + Enter to submit post
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
        const postInput = document.getElementById('post-input');
        if (document.activeElement === postInput && postInput.value.trim()) {
            document.getElementById('submit-post').click();
        }
    }
    
    // Escape to close modal
    if (e.key === 'Escape') {
        const modal = document.getElementById('room-modal');
        if (modal && !modal.classList.contains('hidden')) {
            window.rippleApp.hideRoomModal();
        }
    }
});

// Network status monitoring
window.addEventListener('online', () => {
    if (window.rippleApp) {
        window.rippleApp.showNotification('Connection restored', 'success');
    }
});

window.addEventListener('offline', () => {
    if (window.rippleApp) {
        window.rippleApp.showNotification('Connection lost. Check your network.', 'error');
    }
});

// Enhanced error handling
window.addEventListener('error', (e) => {
    console.error('Application error:', e.error);
    if (window.rippleApp) {
        window.rippleApp.showNotification('Something went wrong. Please try again.', 'error');
    }
});