// HubTraffic API Configuration
const HUBTRAFFIC_API = 'https://api.hubtraffic.com/Api.php';

// CORS Proxy options (in case of CORS issues)
const CORS_PROXIES = [
    'https://api.allorigins.win/raw?url=',
    'https://corsproxy.io/?',
    'https://api.codetabs.com/v1/proxy?quest='
];

// State
let currentData = {
    thumbnail: '',
    embedUrl: '',
    embedCode: '',
    viewkey: '',
    pornstars: '',
    categories: ''
};

/**
 * Extract viewkey from various Pornhub URL formats
 */
function extractViewkey(url) {
    // Clean up the URL
    url = url.trim();
    
    // Pattern 1: Standard view_video.php?viewkey=xxx
    let match = url.match(/view_video\.php\?viewkey=([^&\s]+)/i);
    if (match) return match[1];
    
    // Pattern 2: Direct /viewkey/xxx format
    match = url.match(/\/viewkey\/([^\/\?\s]+)/i);
    if (match) return match[1];
    
    // Pattern 3: embed/xxx format
    match = url.match(/embed\/([^\/\?\s]+)/i);
    if (match) return match[1];
    
    // Pattern 4: Just the viewkey if user pasted only that
    if (/^[a-z0-9]+$/i.test(url) && url.length > 5) {
        return url;
    }
    
    return null;
}

/**
 * Format duration from seconds to MM:SS or HH:MM:SS
 */
function formatDuration(duration) {
    if (!duration) return 'Unknown';
    if (typeof duration === 'string' && duration.includes(':')) return duration;
    
    const seconds = parseInt(duration);
    if (isNaN(seconds)) return duration;
    
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);
    
    if (hrs > 0) {
        return `${hrs}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }
    return `${mins}:${secs.toString().padStart(2, '0')}`;
}

/**
 * Try to fetch video data using HubTraffic API
 */
async function fetchVideoData(viewkey) {
    const params = new URLSearchParams({
        id: viewkey,
        action: 'get_video_by_id'
    });
    
    const apiUrl = `${HUBTRAFFIC_API}?${params.toString()}`;
    
    // Try direct fetch first
    try {
        const response = await fetch(apiUrl);
        if (response.ok) {
            const data = await response.json();
            return data;
        }
    } catch (e) {
        console.log('Direct fetch failed, trying CORS proxies...');
    }
    
    // Try CORS proxies
    for (const proxy of CORS_PROXIES) {
        try {
            const response = await fetch(`${proxy}${encodeURIComponent(apiUrl)}`);
            if (response.ok) {
                const data = await response.json();
                return data;
            }
        } catch (e) {
            console.log(`Proxy ${proxy} failed`);
        }
    }
    
    throw new Error('Failed to fetch video data. All CORS proxies exhausted.');
}

/**
 * Fallback method: Generate URLs based on known patterns
 * This works when API is unavailable but patterns are known
 */
function generateFallbackUrls(viewkey) {
    const path = generatePath(viewkey);
    
    // Common Pornhub CDN patterns
    const patterns = {
        thumbnails: [
            `https://ei.phncdn.com/videos/${path}/${viewkey}/thumbnails/${viewkey}.jpg`,
            `https://ei.phncdn.com/videos/${path}/${viewkey}/thumbnails/${viewkey}.1.jpg`,
            `https://di.phncdn.com/videos/${path}/${viewkey}/thumbnails/${viewkey}.jpg`,
            `https://ci.phncdn.com/videos/${path}/${viewkey}/thumbnails/${viewkey}.jpg`,
        ]
    };
    
    return patterns;
}

/**
 * Generate folder path based on viewkey pattern
 */
function generatePath(viewkey) {
    if (viewkey.startsWith('ph')) {
        const timestampPart = viewkey.substring(2);
        if (/^[a-f0-9]+$/i.test(timestampPart)) {
            const timestamp = parseInt(timestampPart.substring(0, 8), 16);
            if (!isNaN(timestamp) && timestamp > 1000000000) {
                const date = new Date(timestamp * 1000);
                if (date.getFullYear() >= 2010 && date.getFullYear() <= 2030) {
                    const year = date.getFullYear();
                    const month = String(date.getMonth() + 1).padStart(2, '0');
                    const day = String(date.getDate()).padStart(2, '0');
                    return `${year}/${month}/${day}`;
                }
            }
        }
    }
    return '2023/01/01'; // Very basic fallback
}

/**
 * Main extraction function using the Node.js backend
 */
async function extractMedia() {
    const urlInput = document.getElementById('videoUrl');
    const extractBtn = document.getElementById('extractBtn');
    const btnText = extractBtn.querySelector('.btn-text');
    const btnLoader = extractBtn.querySelector('.btn-loader');
    const errorDiv = document.getElementById('error-message');
    const resultsDiv = document.getElementById('results');
    const videoInfoDiv = document.getElementById('video-info');
    
    // Reset UI
    errorDiv.classList.add('hidden');
    resultsDiv.classList.add('hidden');
    videoInfoDiv.classList.add('hidden');
    
    // Validate input
    const url = urlInput.value.trim();
    if (!url) {
        showError('Please enter a Pornhub video URL');
        return;
    }
    
    // Show loading state
    extractBtn.disabled = true;
    btnText.classList.add('hidden');
    btnLoader.classList.remove('hidden');
    
    try {
        // Call our local Node.js backend
        const response = await fetch(`/api/extract?url=${encodeURIComponent(url)}`);
        const data = await response.json();
        
        if (!response.ok || !data.success) {
            throw new Error(data.error || 'Failed to extract media');
        }
        
        // Update state
        currentData.viewkey = data.viewkey;
        currentData.thumbnail = data.thumbnail;
        currentData.embedUrl = data.embedUrl;
        currentData.embedCode = data.embedCode;
        currentData.pornstars = data.pornstars;
        currentData.categories = data.categories;
        
        // Update display
        updateDisplay(data.thumbnail, data);
        
        resultsDiv.classList.remove('hidden');
        showToast('Media extracted successfully!');
        
    } catch (error) {
        showError('Error: ' + error.message);
        console.error('Extraction error:', error);
    } finally {
        // Reset button state
        extractBtn.disabled = false;
        btnText.classList.remove('hidden');
        btnLoader.classList.add('hidden');
    }
}

/**
 * Update the display with fetched data
 */
function updateDisplay(thumbnailUrl, videoData) {
    const thumbnailImg = document.getElementById('thumbnail');
    const thumbDimensions = document.getElementById('thumb-dimensions');
    const videoInfoDiv = document.getElementById('video-info');
    
    // Set thumbnail
    thumbnailImg.src = thumbnailUrl;
    thumbnailImg.onload = () => {
        thumbDimensions.textContent = `${thumbnailImg.naturalWidth} × ${thumbnailImg.naturalHeight}px`;
    };

    // Update video info
    if (videoData) {
        document.getElementById('video-title').textContent = videoData.title || 'Unknown';
        document.getElementById('video-duration').textContent = formatDuration(videoData.duration);
        document.getElementById('video-pornstar').textContent = videoData.pornstars || 'N/A';
        document.getElementById('video-category').textContent = videoData.categories || 'N/A';
        document.getElementById('video-viewkey').textContent = videoData.viewkey;
        document.getElementById('video-embed').value = videoData.embedCode;
        videoInfoDiv.classList.remove('hidden');
    }
}

/**
 * Download media to user's device
 */
async function downloadMedia(type) {
    const url = type === 'thumb' ? currentData.thumbnail : null;
    if (!url) return;
    
    showToast('Starting download...');
    
    try {
        const response = await fetch(url);
        const blob = await response.blob();
        const blobUrl = window.URL.createObjectURL(blob);
        
        const a = document.createElement('a');
        a.href = blobUrl;
        const extension = url.split('.').pop().split('?')[0] || 'jpg';
        a.download = `ph_media_${currentData.viewkey}.${extension}`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        window.URL.revokeObjectURL(blobUrl);
    } catch (err) {
        console.error('Download failed:', err);
        // Fallback: Open in new tab if blob fetch fails (CORS)
        window.open(url, '_blank');
        showToast('Redirecting to direct file link...');
    }
}

/**
 * Show error message
 */
function showError(message) {
    const errorDiv = document.getElementById('error-message');
    errorDiv.textContent = message;
    errorDiv.classList.remove('hidden');
}

/**
 * Copy link to clipboard
 */
async function copyLink(type) {
    let url = '';
    if (type === 'thumb') url = currentData.thumbnail;
    else if (type === 'embed') url = currentData.embedCode;
    
    if (!url) {
        showToast('No URL available to copy');
        return;
    }
    
    try {
        await navigator.clipboard.writeText(url);
        showToast('Copied to clipboard!');
    } catch (err) {
        // Fallback for older browsers
        const textArea = document.createElement('textarea');
        textArea.value = url;
        document.body.appendChild(textArea);
        textArea.select();
        document.execCommand('copy');
        document.body.removeChild(textArea);
        showToast('Copied to clipboard!');
    }
}

/**
 * Test if an image URL is valid by trying to load it
 */
function testImageUrl(url) {
    return new Promise((resolve) => {
        const img = new Image();
        img.onload = () => resolve({ success: true, url, width: img.naturalWidth, height: img.naturalHeight });
        img.onerror = () => resolve({ success: false, url });
        img.src = url;
    });
}

/**
 * Find working image URL from list of candidates
 */
async function findWorkingImage(urls) {
    // Test all URLs in parallel
    const results = await Promise.all(urls.map(url => testImageUrl(url)));
    
    // Return first working URL
    const working = results.find(r => r.success);
    return working || null;
}

/**
 * Show toast notification
 */
function showToast(message) {
    const toast = document.getElementById('toast');
    toast.textContent = message;
    toast.classList.remove('hidden');
    toast.classList.add('show');
    
    setTimeout(() => {
        toast.classList.remove('show');
        toast.classList.add('hidden');
    }, 2500);
}

// Event listeners
document.getElementById('videoUrl').addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
        extractMedia();
    }
});

// Allow pasting to trigger extraction
document.getElementById('videoUrl').addEventListener('paste', (e) => {
    setTimeout(() => {
        // Auto-extract after paste (optional - remove if not desired)
        // extractMedia();
    }, 100);
});
