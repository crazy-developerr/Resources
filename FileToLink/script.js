(function() {
    'use strict';

    // ===== CONFIG & STATE =====
    const currentUrl = window.location.href;
    const finalUrl = currentUrl.includes('/watch/') ? currentUrl.replace("/watch/", "/") : currentUrl;
    const HOLD_DELAY = 300;
    
    const TOAST_TYPES = {
        SUCCESS: 'success',
        ERROR: 'error',
        WARNING: 'warning',
        INFO: 'info'
    };

    let toastTimeout = null;
    let spaceKeyState = {
        isHeld: false,
        originalSpeed: 1,
        wasPlaying: false,
        holdTimeout: null,
        isTap: false
    };

    // ===== DOM ELEMENTS =====
    const DOMElements = {
        fileName: document.getElementById('file-name'),
        streamDropdownContainer: document.getElementById('stream-dropdown-container'),
        streamMenu: document.getElementById('stream-menu'),
        streamMenuButton: document.getElementById('stream-btn-label'),
        toast: document.getElementById('toast'),
        toastMessage: document.querySelector('#toast .toast-message'),
        toastIcon: document.querySelector('#toast .toast-icon'),
        themeToggleBtn: document.querySelector('.theme-toggle'),
        player: document.getElementById('player'),
        metaContainer: document.querySelector('.file-meta'),
        yearSpan: document.getElementById('current-year')
    };

    // ===== UTILITY FUNCTIONS =====
    const sanitizeFilename = name => {
        return name.replace(/[^a-z0-9\-_]/gi, '_')
            .replace(/_+/g, '_')
            .replace(/^_+|_+$/g, '')
            .substring(0, 100);
    };

    const getFileExtension = url => {
        try {
            const p = new URL(url).pathname;
            const d = p.lastIndexOf('.');
            if (d > 0 && d < p.length - 1) return p.substring(d + 1).toLowerCase();
        } catch (e) {
            console.error('getFileExtension error:', e);
        }
        return 'file';
    };

    const getCurrentFileName = () => DOMElements.fileName?.textContent?.trim() || '';

    const isValidUrl = url => {
        try {
            new URL(url);
            return url.startsWith('http');
        } catch {
            return false;
        }
    };
    
    const formatTime = (secs, showHrs = false) => {
        if (isNaN(secs) || secs < 0) return showHrs ? '0:00:00' : '0:00';
        secs = Math.round(secs);
        const h = Math.floor(secs / 3600);
        const m = Math.floor((secs % 3600) / 60);
        const s = secs % 60;
        return (showHrs || h > 0) ? `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}` : `${m}:${s.toString().padStart(2, '0')}`;
    };

    // ===== UI COMPONENTS =====
    const showToast = (message, type = TOAST_TYPES.INFO, duration = 3000) => {
        if (!DOMElements.toast || !DOMElements.toastMessage) return;
        
        clearTimeout(toastTimeout);
        
        DOMElements.toastMessage.textContent = message;
        DOMElements.toast.className = `toast show ${type}`;
        DOMElements.toast.setAttribute('aria-hidden', 'false');

        if (DOMElements.toastIcon) {
            const icon = DOMElements.toastIcon.querySelector('i');
            if (icon) {
                const icons = {
                    [TOAST_TYPES.SUCCESS]: 'fa-check-circle',
                    [TOAST_TYPES.ERROR]: 'fa-times-circle',
                    [TOAST_TYPES.WARNING]: 'fa-exclamation-triangle',
                    [TOAST_TYPES.INFO]: 'fa-info-circle'
                };
                icon.className = `fas ${icons[type] || icons.INFO}`;
            }
        }

        toastTimeout = setTimeout(() => {
            DOMElements.toast.classList.add('hide');
            DOMElements.toast.setAttribute('aria-hidden', 'true');
            DOMElements.toast.addEventListener('transitionend', () => {
                DOMElements.toast.classList.remove('show', 'hide', TOAST_TYPES.SUCCESS, TOAST_TYPES.ERROR, TOAST_TYPES.WARNING, TOAST_TYPES.INFO);
            }, { once: true });
        }, duration);
    };

    const closeAllDropdowns = () => {
        document.querySelectorAll('.dropdown-container.open').forEach(container => {
            const button = container.querySelector('[aria-haspopup="true"]');
            container.classList.remove('open');
            button?.setAttribute('aria-expanded', 'false');
            button?.focus();
        });
        document.removeEventListener('click', handleGlobalClickForDropdown, true);
        document.removeEventListener('keydown', handleDropdownKeys);
    };

    const toggleDropdown = (container, e) => {
        if (!container) return;
        const menu = container.querySelector('.dropdown-menu');
        const button = container.querySelector('[aria-haspopup="true"]');
        const isOpen = container.classList.toggle('open');
        
        button.setAttribute('aria-expanded', isOpen.toString());

        if (isOpen) {
            const rect = container.getBoundingClientRect();
            const spaceAbove = rect.top;
            const spaceBelow = window.innerHeight - rect.bottom;
            const menuHeight = menu.offsetHeight > 0 ? menu.offsetHeight : 400;

            menu.style.bottom = (spaceAbove > menuHeight && spaceBelow < menuHeight) ? 'calc(100% + 10px)' : 'auto';
            menu.style.top = (spaceAbove > menuHeight && spaceBelow < menuHeight) ? 'auto' : 'calc(100% + 10px)';

            menu.querySelector('.dropdown-item[tabindex="0"]')?.focus();
            document.addEventListener('click', handleGlobalClickForDropdown, true);
            document.addEventListener('keydown', handleDropdownKeys);
        } else {
            closeAllDropdowns();
        }
        if (e) e.stopPropagation();
    };

    // ===== THEME MANAGEMENT =====
    const setTheme = theme => {
        document.documentElement.setAttribute('data-theme', theme);
        localStorage.setItem('theme', theme);
        const icon = DOMElements.themeToggleBtn?.querySelector('i');
        if (icon) {
            icon.className = theme === 'light' ? 'fas fa-moon' : 'fas fa-sun';
            icon.classList.add('rotate-icon');
            icon.addEventListener('animationend', () => icon.classList.remove('rotate-icon'), { once: true });
        }
        DOMElements.themeToggleBtn?.setAttribute('aria-pressed', (theme !== 'dark').toString());
        document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme === 'dark' ? '#1a1a2e' : '#f2efe7');
        document.documentElement.dispatchEvent(new CustomEvent('theme-changed', { detail: { theme } }));
    };

    const toggleDarkMode = () => {
        const currentTheme = document.documentElement.getAttribute('data-theme') || 'dark';
        setTheme(currentTheme === 'dark' ? 'light' : 'dark');
    };

    const setupTheme = () => {
        const savedTheme = localStorage.getItem('theme');
        const prefersDark = window.matchMedia?.('(prefers-color-scheme: dark)').matches;
        setTheme(savedTheme || (prefersDark ? 'dark' : 'light'));
    };

    // ===== PLAYER & STREAMING LOGIC =====
    const playerUrlBuilder = {
        'vlc-pc': url => `vlc://${url}`,
        'potplayer': url => `potplayer://${url}`,
        'mpc': url => `mpc://${url}`,
        'kmpc': url => `kmplayer://${url}`,
        'vlc': url => `intent:${url}#Intent;package=org.videolan.vlc;S.title=${encodeURIComponent(getCurrentFileName() || 'Video')};end`,
        'mx': url => `intent:${url}#Intent;package=com.mxtech.videoplayer.ad;S.title=${encodeURIComponent(getCurrentFileName() || 'Video')};end`,
        'mxpro': url => `intent:${url}#Intent;package=com.mxtech.videoplayer.pro;S.title=${encodeURIComponent(getCurrentFileName() || 'Video')};end`,
        'nplayer': url => `nplayer-${url}`,
        'splayer': url => `intent:${url}#Intent;action=com.young.simple.player.playback_online;package=com.young.simple.player;end`,
        'km': url => `intent:${url}#Intent;package=com.kmplayer;S.title=${encodeURIComponent(getCurrentFileName() || 'Video')};end`,
    };

    const playOnline = type => {
        closeAllDropdowns();
        const urlBuilder = playerUrlBuilder[type];
        const playerName = type.replace('-pc', ' (PC)').replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase());

        if (!urlBuilder || !isValidUrl(finalUrl)) {
            return showToast('Invalid URL or player type', TOAST_TYPES.ERROR);
        }

        const appUrl = urlBuilder(finalUrl);
        try {
            const win = window.open(appUrl, '_blank');
            if (win && !win.closed) {
                showToast(`Launching ${playerName}...`, TOAST_TYPES.INFO);
            } else {
                showToast(`Could not open ${playerName} - please install the app`, TOAST_TYPES.ERROR);
            }
        } catch (err) {
            console.error('Error opening external player:', err);
            showToast(`Failed to open ${playerName}`, TOAST_TYPES.ERROR);
        }
    };

    const initializePlayer = () => {
        if (!DOMElements.player) return;
        try {
            if (window.player && typeof window.player.destroy === 'function') {
                window.player.destroy();
            }
            window.player = new Plyr(DOMElements.player);
            window.player.on('ready', updateVideoMetadata);
            window.player.on('loadedmetadata', updateVideoMetadata);
        } catch (error) {
            console.error("Plyr initialization error:", error);
        }
    };

    const updateVideoMetadata = () => {
        if (!DOMElements.player || !DOMElements.metaContainer) return;
        
        const { duration, videoWidth, videoHeight } = DOMElements.player;

        const updateOrCreateMetaItem = (id, value, prefix) => {
            let element = DOMElements.metaContainer.querySelector(`#${id}`);
            if (!element) {
                element = document.createElement('span');
                element.id = id;
                DOMElements.metaContainer.appendChild(element);
            }
            element.textContent = `${prefix}: ${value}`;
        };

        const formattedDuration = (!isNaN(duration) && duration > 0) ? formatTime(duration, duration >= 3600) : 'Loading...';
        const resolution = (videoWidth > 0 && videoHeight > 0) ? `${videoWidth}x${videoHeight}` : 'N/A';
        
        updateOrCreateMetaItem('file-duration', formattedDuration, 'Duration');
        updateOrCreateMetaItem('file-resolution', resolution, 'Resolution');
    };

    // ===== EVENT HANDLERS =====
    const handleDownload = () => {
        if (!isValidUrl(finalUrl)) {
            return showToast('Invalid download URL', TOAST_TYPES.ERROR);
        }
        try {
            const link = document.createElement('a');
            link.href = finalUrl;
            link.download = `${sanitizeFilename(getCurrentFileName() || 'file')}.${getFileExtension(finalUrl)}`;
            link.rel = 'noopener noreferrer';
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            showToast('Download started', TOAST_TYPES.SUCCESS);
        } catch (err) {
            console.error('Download error:', err);
            showToast('Download failed', TOAST_TYPES.ERROR);
        }
    };

    const copyToClipboard = async () => {
        if (!isValidUrl(finalUrl)) {
            return showToast('Invalid URL', TOAST_TYPES.ERROR);
        }
        try {
            await navigator.clipboard.writeText(finalUrl);
            showToast('Link copied to clipboard', TOAST_TYPES.SUCCESS);
        } catch (err) {
            console.error('Clipboard error:', err);
            showToast('Copy failed - please copy manually', TOAST_TYPES.ERROR);
        }
    };

    const handleGlobalClickForDropdown = e => {
        if (!DOMElements.streamDropdownContainer?.contains(e.target)) {
            closeAllDropdowns();
        }
    };

    const handleDropdownKeys = e => {
        const container = document.querySelector('.dropdown-container.open');
        if (!container) return;

        const menu = container.querySelector('.dropdown-menu');
        const items = Array.from(menu?.querySelectorAll('.dropdown-item[tabindex="0"]') || []);
        if (items.length === 0) return;

        const activeIndex = items.findIndex(item => item === document.activeElement);
        let handled = false;

        switch (e.key) {
            case 'Escape': closeAllDropdowns(); handled = true; break;
            case 'ArrowDown': items[(activeIndex + 1) % items.length].focus(); handled = true; break;
            case 'ArrowUp': items[(activeIndex - 1 + items.length) % items.length].focus(); handled = true; break;
            case 'Home': items[0]?.focus(); handled = true; break;
            case 'End': items[items.length - 1]?.focus(); handled = true; break;
            case 'Tab': closeAllDropdowns(); break;
        }

        if (handled) {
            e.preventDefault();
            e.stopPropagation();
        }
    };

    const handleKeyboardShortcuts = (e) => {
        const targetIsInput = e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.isContentEditable;
        
        // Global shortcuts (even in inputs)
        if (e.key.toLowerCase() === 't' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); toggleDarkMode(); }
        
        if (targetIsInput) return;

        // Player shortcuts
        if (window.player) {
            const playerShortcuts = {
                'f': () => window.player.fullscreen.toggle(),
                'm': () => {
                    window.player.muted = !window.player.muted;
                    showToast(window.player.muted ? '🔇 Muted' : '🔊 Unmuted', TOAST_TYPES.INFO, 800);
                },
                'ArrowLeft': () => {
                    window.player.currentTime = Math.max(0, window.player.currentTime - 10);
                    showToast('⏪ -10s', TOAST_TYPES.INFO, 800);
                },
                'ArrowRight': () => {
                    window.player.currentTime = Math.min(window.player.duration, window.player.currentTime + 10);
                    showToast('⏩ +10s', TOAST_TYPES.INFO, 800);
                },
                'ArrowUp': () => {
                    window.player.volume = Math.min(1, window.player.volume + 0.1);
                    showToast(`🔊 Volume: ${Math.round(window.player.volume * 100)}%`, TOAST_TYPES.INFO, 800);
                },
                'ArrowDown': () => {
                    window.player.volume = Math.max(0, window.player.volume - 0.1);
                    showToast(`🔉 Volume: ${Math.round(window.player.volume * 100)}%`, TOAST_TYPES.INFO, 800);
                }
            };
            if (playerShortcuts[e.key]) {
                e.preventDefault();
                playerShortcuts[e.key]();
            }
        }
        
        // Action shortcuts
        const actionShortcuts = {
            'd': handleDownload,
            's': () => toggleDropdown(DOMElements.streamDropdownContainer),
        };
        if ((e.ctrlKey || e.metaKey) && actionShortcuts[e.key.toLowerCase()]) {
            e.preventDefault();
            actionShortcuts[e.key.toLowerCase()]();
        }
        if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === 'c') {
            e.preventDefault();
            copyToClipboard();
        }
        
        if (e.key === 'Escape') {
             closeAllDropdowns();
        }
    };

    const handleSpacebarDown = (e) => {
        if (e.code !== 'Space' || !window.player || e.target.tagName === 'INPUT' || e.target.isContentEditable) return;
        if (!spaceKeyState.isHeld && !spaceKeyState.holdTimeout) {
            e.preventDefault();
            spaceKeyState.isTap = true;
            spaceKeyState.holdTimeout = setTimeout(() => {
                spaceKeyState.isHeld = true;
                spaceKeyState.isTap = false;
                spaceKeyState.originalSpeed = window.player.speed;
                spaceKeyState.wasPlaying = !window.player.paused;
                if (window.player.paused) window.player.play();
                window.player.speed = 2;
                showToast('⚡ Hold for 2x Speed', TOAST_TYPES.INFO, 800);
            }, HOLD_DELAY);
        }
    };

    const handleSpacebarUp = (e) => {
        if (e.code !== 'Space' || !window.player || e.target.tagName === 'INPUT' || e.target.isContentEditable) return;
        
        e.preventDefault();
        clearTimeout(spaceKeyState.holdTimeout);
        spaceKeyState.holdTimeout = null;

        if (spaceKeyState.isHeld) {
            spaceKeyState.isHeld = false;
            window.player.speed = spaceKeyState.originalSpeed;
            if (!spaceKeyState.wasPlaying) {
                window.player.pause();
            }
            showToast('🔄 Normal Speed', TOAST_TYPES.INFO, 800);
        } else if (spaceKeyState.isTap) {
            window.player.togglePlay();
        }
        spaceKeyState.isTap = false;
    };
    
    const handleDoubleClickSpeed = (() => {
        let clickTimeout = null;
        let clickCount = 0;
        return (e) => {
            if (!window.player || !e.target.closest('.plyr')) return;
            clickCount++;
            if (clickCount === 1) {
                clickTimeout = setTimeout(() => { clickCount = 0; }, 300);
            } else if (clickCount === 2) {
                clearTimeout(clickTimeout);
                clickCount = 0;
                const newSpeed = window.player.speed === 1 ? 2 : 1;
                window.player.speed = newSpeed;
                showToast(newSpeed === 2 ? '⚡ 2x Speed' : '🔄 Normal Speed', TOAST_TYPES.INFO, 1500);
            }
        };
    })();

    const addUIEnhancements = () => {
        const addRippleEffect = (e) => {
            const button = e.currentTarget;
            const oldRipple = button.querySelector('.ripple');
            if (oldRipple) oldRipple.remove();

            const rect = button.getBoundingClientRect();
            const ripple = document.createElement('span');
            ripple.className = 'ripple';
            const size = Math.max(rect.width, rect.height) * 1.5;
            ripple.style.width = ripple.style.height = `${size}px`;
            ripple.style.left = `${e.clientX - rect.left - size / 2}px`;
            ripple.style.top = `${e.clientY - rect.top - size / 2}px`;

            button.appendChild(ripple);
            ripple.addEventListener('animationend', () => ripple.remove());
        };

        document.querySelectorAll('.button-base').forEach(btn => {
            btn.addEventListener('click', addRippleEffect, { passive: true });
        });
    };
    
    const setupEventListeners = () => {
        DOMElements.themeToggleBtn?.addEventListener('click', toggleDarkMode);
        DOMElements.streamMenuButton?.addEventListener('click', (e) => toggleDropdown(DOMElements.streamDropdownContainer, e));
        document.querySelector('.stream-menu-close')?.addEventListener('click', closeAllDropdowns);
        
        document.querySelectorAll('.player-card').forEach(card => {
            card.addEventListener('click', () => playOnline(card.dataset.playerType));
        });
        
        document.querySelector('[title="Download the video"]')?.addEventListener('click', handleDownload);
        document.querySelector('[title="Copy video link"]')?.addEventListener('click', copyToClipboard);
        
        document.addEventListener('keydown', handleKeyboardShortcuts);
        document.addEventListener('keydown', handleSpacebarDown);
        document.addEventListener('keyup', handleSpacebarUp);
        document.addEventListener('click', handleDoubleClickSpeed);
        
        window.addEventListener('beforeunload', () => clearTimeout(toastTimeout));
    };

    // ===== INITIALIZATION =====
    const init = () => {
        if (!isValidUrl(finalUrl)) {
            console.error("Invalid URL detected:", finalUrl);
            return showToast('Invalid media URL', TOAST_TYPES.ERROR);
        }
        
        if(DOMElements.yearSpan) {
            DOMElements.yearSpan.textContent = new Date().getFullYear();
        }

        if (DOMElements.fileName && !DOMElements.fileName.textContent?.trim()) {
            DOMElements.fileName.textContent = "File";
        }
        
        setupTheme();
        initializePlayer();
        setupEventListeners();
    };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

})();