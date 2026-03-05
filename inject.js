// YouTube Performance Optimizer - Inject Script
// Chạy trong MAIN world - Tối ưu + Bypass warnings

(function () {
    'use strict';

    if (window.__YT_OPTIMIZER_LOADED__) return;
    window.__YT_OPTIMIZER_LOADED__ = true;

    // ============================================
    // 1. STORAGE ACCESS API BYPASS
    // ============================================

    try {
        document.requestStorageAccess = () => Promise.resolve();
        document.hasStorageAccess = () => Promise.resolve(true);
        if (document.requestStorageAccessFor) {
            document.requestStorageAccessFor = () => Promise.resolve();
        }
    } catch (e) { }

    // ============================================
    // 2. SUPPRESS ADS/TRACKING ERRORS IN CONSOLE
    // ============================================

    const originalConsoleError = console.error;
    console.error = function (...args) {
        const message = args.join(' ');
        if (message.includes('requestStorageAccess') ||
            message.includes('ERR_BLOCKED_BY_CLIENT') ||
            message.includes('doubleclick') ||
            message.includes('googleads')) {
            return; // Suppress
        }
        originalConsoleError.apply(console, args);
    };

    // ============================================
    // 3. BYPASS YOUTUBE CONTENT WARNINGS
    // Intercept fetch/XHR để sửa response từ
    // verify_age, player, next endpoints
    // ============================================

    // Danh sách các key trong response cần loại bỏ/sửa
    const WARNING_KEYS_TO_REMOVE = [
        'contentCheckOk',
        'racyCheckOk'
    ];

    /**
     * Xử lý response JSON từ YouTube API
     * Loại bỏ các warning/age-gate flags
     */
    function patchYouTubeResponse(url, jsonData) {
        if (!jsonData || typeof jsonData !== 'object') return jsonData;

        try {
            let modified = false;

            // === PATCH playabilityStatus ===
            // Nếu video bị gán status "CONTENT_CHECK_REQUIRED" hoặc tương tự
            if (jsonData.playabilityStatus) {
                const ps = jsonData.playabilityStatus;

                // Bypass content warning status
                if (ps.status === 'CONTENT_CHECK_REQUIRED' ||
                    ps.status === 'LOGIN_REQUIRED' ||
                    ps.status === 'AGE_CHECK_REQUIRED') {
                    // Không thay đổi status vì có thể break player
                    // Thay vào đó, set các flag OK
                    modified = true;
                }

                // Remove desktopLegacyAgeGateReason
                if (ps.desktopLegacyAgeGateReason) {
                    delete ps.desktopLegacyAgeGateReason;
                    modified = true;
                }

                // Remove playabilityStatus.reason nếu là warning
                if (ps.reason && (
                    ps.reason.includes('self-harm') ||
                    ps.reason.includes('suicide') ||
                    ps.reason.includes('tự tử') ||
                    ps.reason.includes('tự hủy hoại') ||
                    ps.reason.includes('sensitive') ||
                    ps.reason.includes('content warning')
                )) {
                    delete ps.reason;
                    modified = true;
                }

                // Remove errorScreen nếu là content warning
                if (ps.errorScreen) {
                    const errorStr = JSON.stringify(ps.errorScreen);
                    if (errorStr.includes('confirm') ||
                        errorStr.includes('contentCheck') ||
                        errorStr.includes('ageCheck') ||
                        errorStr.includes('selfHarm') ||
                        errorStr.includes('suicide') ||
                        errorStr.includes('sensitive')) {
                        delete ps.errorScreen;
                        modified = true;
                    }
                }
            }

            // === PATCH overlay/warning UI elements ===
            // Xoá các overlay warning trong response
            if (jsonData.overlay) {
                const overlayStr = JSON.stringify(jsonData.overlay);
                if (overlayStr.includes('contentCheck') ||
                    overlayStr.includes('ageCheck') ||
                    overlayStr.includes('confirm') ||
                    overlayStr.includes('sensitive') ||
                    overlayStr.includes('selfHarm')) {
                    delete jsonData.overlay;
                    modified = true;
                }
            }

            // === PATCH onResponseReceivedActions ===
            // YouTube dùng field này để inject UI actions (confirm dialog)
            if (Array.isArray(jsonData.onResponseReceivedActions)) {
                const filtered = jsonData.onResponseReceivedActions.filter(action => {
                    const actionStr = JSON.stringify(action);
                    return !(
                        actionStr.includes('contentCheck') ||
                        actionStr.includes('ageCheck') ||
                        actionStr.includes('confirm') ||
                        actionStr.includes('selfHarm') ||
                        actionStr.includes('sensitiveContent')
                    );
                });
                if (filtered.length !== jsonData.onResponseReceivedActions.length) {
                    jsonData.onResponseReceivedActions = filtered;
                    modified = true;
                }
            }

            // === PATCH onResponseReceivedEndpoints ===
            if (Array.isArray(jsonData.onResponseReceivedEndpoints)) {
                const filtered = jsonData.onResponseReceivedEndpoints.filter(ep => {
                    const epStr = JSON.stringify(ep);
                    return !(
                        epStr.includes('contentCheck') ||
                        epStr.includes('ageCheck') ||
                        epStr.includes('selfHarm') ||
                        epStr.includes('sensitiveContent')
                    );
                });
                if (filtered.length !== jsonData.onResponseReceivedEndpoints.length) {
                    jsonData.onResponseReceivedEndpoints = filtered;
                    modified = true;
                }
            }

            if (modified) {
                console.log('[YT-Optimizer] Patched warning response for:', url);
            }
        } catch (e) {
            // Silent fail - không break video
        }

        return jsonData;
    }

    /**
     * Kiểm tra URL có phải YouTube API endpoint cần intercept không
     */
    function isTargetEndpoint(url) {
        if (!url || typeof url !== 'string') return false;
        return (
            url.includes('/youtubei/v1/player') ||
            url.includes('/youtubei/v1/next') ||
            url.includes('/youtubei/v1/verify_age') ||
            url.includes('/youtubei/v1/account/account_menu') ||
            url.includes('player?') ||
            url.includes('next?') ||
            url.includes('verify_age?')
        );
    }

    // === INTERCEPT FETCH ===
    const originalFetch = window.fetch;
    window.fetch = async function (...args) {
        const url = typeof args[0] === 'string' ? args[0] : (args[0]?.url || '');

        // Nếu là verify_age request, modify request body
        if (url.includes('/youtubei/v1/verify_age') || url.includes('verify_age?')) {
            try {
                const options = args[1] || {};
                if (options.body) {
                    const body = JSON.parse(options.body);
                    // Set contentCheckOk và racyCheckOk = true
                    body.contentCheckOk = true;
                    body.racyCheckOk = true;
                    args[1] = { ...options, body: JSON.stringify(body) };
                    console.log('[YT-Optimizer] Modified verify_age request');
                }
            } catch (e) { }
        }

        // Nếu là player hoặc next request, thêm params
        if (url.includes('/youtubei/v1/player') || url.includes('player?') ||
            url.includes('/youtubei/v1/next') || url.includes('next?')) {
            try {
                const options = args[1] || {};
                if (options.body) {
                    const body = JSON.parse(options.body);
                    body.contentCheckOk = true;
                    body.racyCheckOk = true;
                    args[1] = { ...options, body: JSON.stringify(body) };
                }
            } catch (e) { }
        }

        const response = await originalFetch.apply(this, args);

        if (!isTargetEndpoint(url)) return response;

        try {
            const cloned = response.clone();
            const text = await cloned.text();
            let jsonData;

            try {
                jsonData = JSON.parse(text);
            } catch (e) {
                return response;
            }

            const patched = patchYouTubeResponse(url, jsonData);
            const patchedText = JSON.stringify(patched);

            return new Response(patchedText, {
                status: response.status,
                statusText: response.statusText,
                headers: response.headers
            });
        } catch (e) {
            return response;
        }
    };

    // === INTERCEPT XMLHttpRequest ===
    const XHROpen = XMLHttpRequest.prototype.open;
    const XHRSend = XMLHttpRequest.prototype.send;

    XMLHttpRequest.prototype.open = function (method, url, ...rest) {
        this._ytOptUrl = url;
        return XHROpen.call(this, method, url, ...rest);
    };

    XMLHttpRequest.prototype.send = function (body) {
        // Modify request body cho verify_age, player, next
        if (this._ytOptUrl && body && typeof body === 'string') {
            try {
                if (isTargetEndpoint(this._ytOptUrl)) {
                    const parsed = JSON.parse(body);
                    parsed.contentCheckOk = true;
                    parsed.racyCheckOk = true;
                    body = JSON.stringify(parsed);
                    console.log('[YT-Optimizer] Modified XHR request:', this._ytOptUrl);
                }
            } catch (e) { }
        }

        if (isTargetEndpoint(this._ytOptUrl)) {
            this.addEventListener('readystatechange', function () {
                if (this.readyState === 4 && this.status === 200) {
                    try {
                        const jsonData = JSON.parse(this.responseText);
                        const patched = patchYouTubeResponse(this._ytOptUrl, jsonData);
                        const patchedText = JSON.stringify(patched);

                        Object.defineProperty(this, 'responseText', {
                            get: () => patchedText,
                            configurable: true
                        });
                        Object.defineProperty(this, 'response', {
                            get: () => patchedText,
                            configurable: true
                        });
                    } catch (e) { }
                }
            });
        }

        return XHRSend.call(this, body);
    };

    // ============================================
    // 4. PRECONNECT TO VIDEO SERVERS
    // ============================================

    const preconnectUrls = [
        'https://i.ytimg.com',
        'https://yt3.ggpht.com',
        'https://www.gstatic.com'
    ];

    preconnectUrls.forEach(url => {
        try {
            const link = document.createElement('link');
            link.rel = 'preconnect';
            link.href = url;
            link.crossOrigin = 'anonymous';
            document.head.appendChild(link);
        } catch (e) { }
    });

    // ============================================
    // 5. PERFORMANCE CSS
    // ============================================

    function injectPerformanceCSS() {
        if (document.getElementById('yt-optimizer-css')) return;

        const style = document.createElement('style');
        style.id = 'yt-optimizer-css';
        style.textContent = `
            /* Disable ambient mode (gây lag) */
            #cinematics, #cinematics-container {
                display: none !important;
            }
            
            /* GPU acceleration */
            #movie_player, .html5-video-player, video {
                transform: translateZ(0);
                will-change: transform;
            }
            
            /* Contain layout */
            #secondary, #related, #comments {
                contain: layout style;
            }
            
            /* Hide ads */
            #player-ads, .video-ads, .ytp-ad-module, .ytp-ad-overlay-container {
                display: none !important;
            }
            
            /* Faster transitions */
            .ytp-chrome-bottom {
                transition-duration: 0.1s !important;
            }
        `;
        document.head.appendChild(style);
    }

    // ============================================
    // 6. OPTIMIZE PLAYER (sau khi load)
    // ============================================

    function optimizePlayer() {
        const player = document.getElementById('movie_player');
        if (!player) return;

        try {
            // Disable annotations
            if (player.unloadModule) {
                player.unloadModule('annotations_module');
            }

            // Optimize video element
            const video = player.querySelector('video');
            if (video) {
                video.preload = 'auto';
            }
        } catch (e) { }
    }

    // ============================================
    // 7. INITIALIZE
    // ============================================

    function init() {
        injectPerformanceCSS();

        // Wait for player
        let attempts = 0;
        const checkPlayer = setInterval(() => {
            attempts++;
            if (document.getElementById('movie_player')) {
                optimizePlayer();
                clearInterval(checkPlayer);
            }
            if (attempts > 20) {
                clearInterval(checkPlayer);
            }
        }, 500);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

    console.log('[YT-Optimizer] Loaded with warning bypass');
})();
