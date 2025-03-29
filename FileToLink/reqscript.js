document.addEventListener('DOMContentLoaded', function() {
    // Initialize player
    const player = document.getElementById('player');
    const playBtn = document.querySelector('.play-btn');
    const playIcon = document.querySelector('.play-icon');
    const pauseIcon = document.querySelector('.pause-icon');
    const progressBar = document.getElementById('progress-bar');
    const progressContainer = document.getElementById('progress-container');
    const currentTime = document.querySelector('.current-time');
    const duration = document.querySelector('.duration');
    const volumeBtn = document.querySelector('.volume-btn');
    const volumeIcon = volumeBtn.querySelector('i');
    const volumeSlider = document.querySelector('#volume-range');
    const loadingOverlay = document.getElementById('loading-overlay');
    const errorOverlay = document.getElementById('error-overlay');
    const errorMessage = document.getElementById('error-message');
    const settingsBtn = document.querySelector('.settings-btn');
    const settingsMenu = document.getElementById('settings-menu');
    const fileSizeEl = document.getElementById('file-size');
    const fileResolutionEl = document.getElementById('file-resolution');
    const fileDurationEl = document.getElementById('file-duration');
    const qualityOptions = document.querySelectorAll('.quality-option[data-quality]');
    const speedOptions = document.querySelectorAll('.quality-option[data-speed]');
    
    // Set theme based on user preference
    const savedTheme = localStorage.getItem('theme');
    if (savedTheme) {
        document.documentElement.setAttribute('data-theme', savedTheme);
        updateThemeIcon(savedTheme);
    } else if (window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches) {
        document.documentElement.setAttribute('data-theme', 'light');
        updateThemeIcon('light');
    }
    
    // Initialize loading state
    let isVideoLoading = true;
    let hasPlaybackStarted = false;
    let videoFailed = false;
    let mouseInactivityTimer;
    let lastVolume = 1;
    
    // Check file metadata dynamically
    setFileMetadata();
    
    // Ensure native controls are disabled programmatically
    player.controls = false;
    
    // Play/Pause toggle
    playBtn.addEventListener('click', togglePlayPause);
    
    // Video click to play/pause
    player.addEventListener('click', togglePlayPause);
    
    // Progress bar update
    player.addEventListener('timeupdate', updateProgress);
    
    // Progress bar seek
    progressContainer.addEventListener('click', seekVideo);
    
    // Make progress bar draggable
    let isDragging = false;
    progressContainer.addEventListener('mousedown', function() {
        isDragging = true;
        player.pause();
    });
    
    document.addEventListener('mousemove', function(e) {
        if (isDragging) {
            const rect = progressContainer.getBoundingClientRect();
            const percent = Math.min(Math.max(0, (e.clientX - rect.left) / rect.width), 1);
            progressBar.style.width = percent * 100 + '%';
        }
    });
    
    document.addEventListener('mouseup', function() {
        if (isDragging) {
            const rect = progressContainer.getBoundingClientRect();
            const percent = (progressBar.offsetWidth / progressContainer.offsetWidth);
            player.currentTime = percent * player.duration;
            if (!player.paused) player.play();
            isDragging = false;
        }
    });
    
    // Update duration display
    player.addEventListener('loadedmetadata', function() {
        duration.textContent = formatTime(player.duration);
        fileDurationEl.textContent = formatTime(player.duration, true);
        detectVideoResolution();
        isVideoLoading = false;
        loadingOverlay.classList.add('hidden');
        updateFileSize();
    });
    
    // Add volume control functionality
    volumeSlider.addEventListener('input', function() {
        player.volume = this.value;
        lastVolume = this.value;
        updateVolumeIcon(this.value);
    });
    
    // Mute/unmute toggle
    volumeBtn.addEventListener('click', function() {
        if (player.volume > 0) {
            lastVolume = player.volume;
            player.volume = 0;
            volumeSlider.value = 0;
        } else {
            player.volume = lastVolume;
            volumeSlider.value = lastVolume;
        }
        updateVolumeIcon(player.volume);
    });
    
    // Handle fullscreen
    const fullscreenBtn = document.querySelector('.fullscreen-btn');
    fullscreenBtn.addEventListener('click', toggleFullscreen);
    
    // Rewind and Forward buttons
    const rewindBtn = document.querySelector('.rewind-btn');
    const forwardBtn = document.querySelector('.forward-btn');
    
    rewindBtn.addEventListener('click', function() {
        skip(-10);
    });
    
    forwardBtn.addEventListener('click', function() {
        skip(10);
    });
    
    // Settings button toggle
    settingsBtn.addEventListener('click', function() {
        settingsMenu.classList.toggle('show');
    });
    
    // Hide settings when clicking elsewhere
    document.addEventListener('click', function(event) {
        if (!settingsBtn.contains(event.target) && !settingsMenu.contains(event.target)) {
            settingsMenu.classList.remove('show');
        }
    });
    
    // Quality options click handler
    qualityOptions.forEach(option => {
        option.addEventListener('click', function() {
            // Remove active class from all quality options
            qualityOptions.forEach(opt => opt.classList.remove('active'));
            // Add active class to clicked option
            this.classList.add('active');
            
            const quality = this.getAttribute('data-quality');
            // In a real implementation, this would switch video sources
            // For this demo, we'll just show a toast
            showToast(`Quality changed to ${quality}`);
        });
    });
    
    // Playback speed options
    speedOptions.forEach(option => {
        option.addEventListener('click', function() {
            speedOptions.forEach(opt => opt.classList.remove('active'));
            this.classList.add('active');
            
            const speed = parseFloat(this.getAttribute('data-speed'));
            player.playbackRate = speed;
            showToast(`Playback speed: ${speed}x`);
        });
    });
    
    // Handle document click for dropdown
    document.addEventListener('click', function(event) {
        const dropdown = document.getElementById('stream-menu');
        const streamBtn = document.querySelector('.stream-btn');
        
        // If click is outside dropdown and its toggle button
        if (dropdown && !dropdown.contains(event.target) && event.target !== streamBtn && !streamBtn.contains(event.target)) {
            dropdown.classList.remove('show');
        }
    });
    
    // Video loading states
    player.addEventListener('waiting', function() {
        isVideoLoading = true;
        loadingOverlay.classList.remove('hidden');
    });
    
    player.addEventListener('playing', function() {
        isVideoLoading = false;
        hasPlaybackStarted = true;
        loadingOverlay.classList.add('hidden');
        errorOverlay.classList.remove('show');
        videoFailed = false;
    });
    
    // Error handling
    player.addEventListener('error', function(e) {
        console.error('Video error:', e);
        isVideoLoading = false;
        videoFailed = true;
        loadingOverlay.classList.add('hidden');
        errorOverlay.classList.add('show');
        
        const errorCode = e.target.error ? e.target.error.code : 0;
        let errorText = 'An unknown error occurred while playing the video.';
        
        switch(errorCode) {
            case 1:
                errorText = 'Video playback was aborted.';
                break;
            case 2:
                errorText = 'Network error occurred while loading the video.';
                break;
            case 3:
                errorText = 'Error decoding the video.';
                break;
            case 4:
                errorText = 'Video format not supported.';
                break;
        }
        
        errorMessage.textContent = errorText;
    });
    
    // Hide controls when mouse is inactive
    const videoWrapper = document.querySelector('.video-wrapper');
    const videoControls = document.querySelector('.video-controls');
    
    videoWrapper.addEventListener('mousemove', function() {
        if (!player.paused) {
            clearTimeout(mouseInactivityTimer);
            videoControls.style.opacity = '1';
            
            mouseInactivityTimer = setTimeout(function() {
                videoControls.style.opacity = '0';
            }, 3000);
        }
    });
    
    videoWrapper.addEventListener('mouseleave', function() {
        if (!player.paused) {
            videoControls.style.opacity = '0';
        }
    });
    
    // Keyboard controls
    document.addEventListener('keydown', function(e) {
        if (document.activeElement.tagName.toLowerCase() === 'input') return;
        
        switch(e.key) {
            case ' ':
            case 'k':
                e.preventDefault();
                togglePlayPause();
                break;
            case 'ArrowRight':
                e.preventDefault();
                skip(10);
                break;
            case 'ArrowLeft':
                e.preventDefault();
                skip(-10);
                break;
            case 'f':
                e.preventDefault();
                toggleFullscreen();
                break;
            case 'm':
                e.preventDefault();
                if (player.volume > 0) {
                    lastVolume = player.volume;
                    player.volume = 0;
                    volumeSlider.value = 0;
                } else {
                    player.volume = lastVolume;
                    volumeSlider.value = lastVolume;
                }
                updateVolumeIcon(player.volume);
                break;
            case 'ArrowUp':
                e.preventDefault();
                player.volume = Math.min(1, player.volume + 0.05);
                volumeSlider.value = player.volume;
                updateVolumeIcon(player.volume);
                break;
            case 'ArrowDown':
                e.preventDefault();
                player.volume = Math.max(0, player.volume - 0.05);
                volumeSlider.value = player.volume;
                updateVolumeIcon(player.volume);
                break;
            case '0':
            case '1':
            case '2':
            case '3':
            case '4':
            case '5':
            case '6':
            case '7':
            case '8':
            case '9':
                e.preventDefault();
                player.currentTime = player.duration * (parseInt(e.key) / 10);
                break;
        }
    });
    
    // Helper functions
    function togglePlayPause() {
        if (player.paused) {
            player.play().catch(err => {
                console.error('Error playing video:', err);
                if (!hasPlaybackStarted) {
                    errorOverlay.classList.add('show');
                    videoFailed = true;
                }
            });
            playIcon.style.display = 'none';
            pauseIcon.style.display = 'block';
        } else {
            player.pause();
            playIcon.style.display = 'block';
            pauseIcon.style.display = 'none';
        }
    }
    
    function updateProgress() {
        const percent = (player.currentTime / player.duration) * 100;
        progressBar.style.width = percent + '%';
        currentTime.textContent = formatTime(player.currentTime);
        
        // Update ARIA values for accessibility
        progressContainer.setAttribute('aria-valuenow', percent);
        progressContainer.setAttribute('aria-valuetext', formatTime(player.currentTime));
    }
    
    function seekVideo(e) {
        const rect = progressContainer.getBoundingClientRect();
        const percent = (e.clientX - rect.left) / rect.width;
        player.currentTime = percent * player.duration;
    }
    
    function skip(seconds) {
        player.currentTime = Math.max(0, Math.min(player.duration, player.currentTime + seconds));
        showToast(`${seconds > 0 ? '+' : ''}${seconds} seconds`);
    }
    
    function updateVolumeIcon(volume) {
        if (volume === 0) {
            volumeIcon.className = 'fas fa-volume-mute';
        } else if (volume < 0.5) {
            volumeIcon.className = 'fas fa-volume-down';
        } else {
            volumeIcon.className = 'fas fa-volume-up';
        }
    }
    
    function toggleFullscreen() {
        if (!document.fullscreenElement) {
            if (player.parentElement.requestFullscreen) {
                player.parentElement.requestFullscreen();
            } else if (player.parentElement.webkitRequestFullscreen) {
                player.parentElement.webkitRequestFullscreen();
            } else if (player.parentElement.msRequestFullscreen) {
                player.parentElement.msRequestFullscreen();
            }
            fullscreenBtn.querySelector('i').className = 'fas fa-compress';
        } else {
            if (document.exitFullscreen) {
                document.exitFullscreen();
            } else if (document.webkitExitFullscreen) {
                document.webkitExitFullscreen();
            } else if (document.msExitFullscreen) {
                document.msExitFullscreen();
            }
            fullscreenBtn.querySelector('i').className = 'fas fa-expand';
        }
    }
    
    function detectVideoResolution() {
        // For real implementation, you would detect the actual video resolution
        // For this demo, we'll simulate it
        const width = player.videoWidth || 1280;
        const height = player.videoHeight || 720;
        fileResolutionEl.textContent = `${width}x${height}`;
    }
    
    function updateFileSize() {
        // In a real implementation, server would provide file size
        // For this demo, we'll simulate it based on duration and resolution
        const duration = player.duration || 0;
        const width = player.videoWidth || 1280;
        const height = player.videoHeight || 720;
        
        // Rough estimate based on resolution and duration
        const bitrate = (width * height < 921600) ? 1 : 2; // Mbps
        const estimatedSize = (bitrate * 1024 * 1024 / 8) * duration / 1024 / 1024;
        
        fileSizeEl.textContent = estimatedSize.toFixed(1) + ' MB';
    }
});

// Format time to MM:SS or HH:MM:SS if needed
function formatTime(seconds, showHours = false) {
    seconds = Math.floor(seconds);
    const hours = Math.floor(seconds / 3600);
    seconds = seconds % 3600;
    const minutes = Math.floor(seconds / 60);
    seconds = seconds % 60;
    
    if (showHours || hours > 0) {
        return hours + ':' + 
            (minutes < 10 ? '0' : '') + minutes + ':' + 
            (seconds < 10 ? '0' : '') + seconds;
    }
    
    return minutes + ':' + (seconds < 10 ? '0' : '') + seconds;
}

// Toggle dark/light mode
function toggleDarkMode() {
    const currentTheme = document.documentElement.getAttribute('data-theme');
    const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
    
    document.documentElement.setAttribute('data-theme', newTheme);
    localStorage.setItem('theme', newTheme);
    
    updateThemeIcon(newTheme);
}

// Update theme toggle icon
function updateThemeIcon(theme) {
    const icon = document.querySelector('.toggle-dark-mode i');
    
    if (theme === 'light') {
        icon.className = 'fas fa-sun';
    } else {
        icon.className = 'fas fa-moon';
    }
}

// Toggle stream dropdown menu
function toggleStreamMenu() {
    const menu = document.getElementById('stream-menu');
    menu.classList.toggle('show');
}

// Play in external apps
function playOnline(player) {
    const videoUrl = encodeURIComponent(document.getElementById('player').querySelector('source').src);
    let appUrl = '';
    
    switch(player) {
        case 'vlc':
            appUrl = 'vlc://' + videoUrl;
            break;
        case 'mx':
            appUrl = 'intent:' + videoUrl + '#Intent;package=com.mxtech.videoplayer.ad;end';
            break;
        case 'mxpro':
            appUrl = 'intent:' + videoUrl + '#Intent;package=com.mxtech.videoplayer.pro;end';
            break;
        case 'nplayer':
            appUrl = 'nplayer-' + videoUrl;
            break;
        case 'splayer':
            appUrl = 'splayer://' + videoUrl;
            break;
        case 'km':
            appUrl = 'kmplayer://' + videoUrl;
            break;
        default:
            appUrl = videoUrl;
    }
    
    window.location.href = appUrl;
    showToast(`Opening in ${player}...`);
    
    // Close dropdown
    document.getElementById('stream-menu').classList.remove('show');
}

// Download file
function download() {
    const videoUrl = document.getElementById('player').querySelector('source').src;
    const a = document.createElement('a');
    a.href = videoUrl;
    a.download = document.getElementById('file-name').textContent;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    
    showToast('Download started');
}

// Copy link to clipboard
function copyLink() {
    const videoUrl = document.getElementById('player').querySelector('source').src;
    navigator.clipboard.writeText(videoUrl).then(function() {
        showToast('Link copied to clipboard');
    }).catch(function() {
        // Fallback for older browsers
        const textarea = document.createElement('textarea');
        textarea.value = videoUrl;
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand('copy');
        document.body.removeChild(textarea);
        showToast('Link copied to clipboard');
    });
}

// Retry playback after error
function retryPlayback() {
    const player = document.getElementById('player');
    const errorOverlay = document.getElementById('error-overlay');
    const loadingOverlay = document.getElementById('loading-overlay');
    
    errorOverlay.classList.remove('show');
    loadingOverlay.classList.remove('hidden');
    
    // Reset video source and reload
    const currentSrc = player.querySelector('source').src;
    player.querySelector('source').src = currentSrc;
    player.load();
    player.play().catch(err => {
        console.error('Error retrying video:', err);
        errorOverlay.classList.add('show');
    });
}

// Show toast notification
function showToast(message) {
    const toast = document.getElementById('toast');
    const toastMessage = toast.querySelector('.toast-message');
    
    toastMessage.textContent = message;
    toast.classList.add('show');
    
    // Auto hide after 3 seconds
    setTimeout(function() {
        toast.classList.remove('show');
    }, 3000);
}

// Dynamically set file metadata
function setFileMetadata() {
    // This would be replaced by server-side variables
    const fileName = document.getElementById('file-name').textContent;
    document.title = fileName + " | File Streaming";
}

// Service Worker Registration for PWA support
if ('serviceWorker' in navigator) {
    window.addEventListener('load', function() {
        navigator.serviceWorker.register('/sw.js').then(function(registration) {
            console.log('ServiceWorker registration successful');
        }).catch(function(err) {
            console.log('ServiceWorker registration failed: ', err);
        });
    });
}