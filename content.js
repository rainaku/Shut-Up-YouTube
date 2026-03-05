// YouTube Performance Optimizer - Content Script
// Chạy trong ISOLATED world - DOM manipulation + auto dismiss warnings

(function () {
  'use strict';

  // ============================================
  // 1. FORCE RELOAD ON VIDEO NAVIGATION
  // Force reload khi click vào video từ bất kỳ trang nào
  // ============================================

  let lastUrl = window.location.href;

  // Detect URL changes (YouTube SPA navigation)
  const observer = new MutationObserver(() => {
    if (window.location.href !== lastUrl) {
      const newUrl = window.location.href;
      const oldUrl = lastUrl;
      lastUrl = newUrl;

      // Nếu đang navigate đến video (watch hoặc shorts)
      const isGoingToVideo = newUrl.includes('/watch?') || newUrl.includes('/shorts/');

      // Nếu từ trang không phải video, hoặc sang video khác
      const wasNotOnVideo = !oldUrl.includes('/watch?') && !oldUrl.includes('/shorts/');
      const isDifferentVideo = getVideoId(oldUrl) !== getVideoId(newUrl);

      if (isGoingToVideo && (wasNotOnVideo || isDifferentVideo)) {
        // Force reload để video load đúng
        window.location.reload();
      }
    }
  });

  observer.observe(document.body, { childList: true, subtree: true });

  function getVideoId(url) {
    try {
      const urlObj = new URL(url);
      if (url.includes('/watch?')) {
        return urlObj.searchParams.get('v');
      } else if (url.includes('/shorts/')) {
        return urlObj.pathname.split('/shorts/')[1]?.split('?')[0];
      }
    } catch (e) { }
    return null;
  }

  // ============================================
  // 2. AUTO DISMISS YOUTUBE CONTENT WARNINGS
  // Tự động click nút xác nhận trên warning screens
  // ============================================

  // Các selector cho nút xác nhận/confirm trên warning screens
  const CONFIRM_BUTTON_SELECTORS = [
    // Nút "Tôi hiểu và muốn tiếp tục" / "I understand and wish to proceed"
    '#content-warning-ok-button',
    'tp-yt-paper-button#content-warning-ok-button',
    '[id="content-warning-ok-button"]',

    // Nút proceed/continue trên various warning dialogs
    'yt-button-renderer#content-warning-ok-button button',
    'ytd-button-renderer#content-warning-ok-button button',
    '#proceed-button button',

    // Age verification / content check buttons
    'tp-yt-paper-button.content-warning-confirm',
    '.content-warning-confirm-button',

    // Generic confirm buttons trên overlay
    '#confirm-button button',
    'ytd-enforcement-message-view-model button.yt-spec-button-shape-next',

    // Player error screen buttons
    '.ytp-error-content-wrap button',
    '.yt-playability-error-supported-renderers button',

    // Sensitive content warning overlay  
    'ytd-player-error-message-renderer button',
    '#player-error-message-container button',
  ];

  // Các selector cho warning overlay containers
  const WARNING_OVERLAY_SELECTORS = [
    'ytd-enforcement-message-view-model',
    '#content-warning',
    '.content-warning-container',
    'ytd-player-error-message-renderer',
    '#player-error-message-container',
    '.ytp-error',
  ];

  /**
   * Tìm và click nút confirm/proceed trên warning screen
   */
  function dismissWarning() {
    // Thử click từng selector
    for (const selector of CONFIRM_BUTTON_SELECTORS) {
      try {
        const buttons = document.querySelectorAll(selector);
        for (const btn of buttons) {
          if (btn && btn.offsetParent !== null) { // Visible check
            btn.click();
            console.log('[YT-Optimizer] Auto-clicked warning button:', selector);
            return true;
          }
        }
      } catch (e) { }
    }

    // Tìm button bằng text content
    try {
      const allButtons = document.querySelectorAll('button, tp-yt-paper-button, ytd-button-renderer');
      for (const btn of allButtons) {
        const text = (btn.textContent || btn.innerText || '').trim().toLowerCase();
        if (
          text.includes('tôi hiểu') ||
          text.includes('tiếp tục') ||
          text.includes('i understand') ||
          text.includes('proceed') ||
          text.includes('continue') ||
          text.includes('xác nhận') ||
          text.includes('confirm') ||
          text.includes('ok')
        ) {
          // Kiểm tra button này có nằm trong warning context không
          const parent = btn.closest(
            'ytd-enforcement-message-view-model, ' +
            '#content-warning, ' +
            '.content-warning-container, ' +
            'ytd-player-error-message-renderer, ' +
            '#player-error-message-container, ' +
            '.ytp-error, ' +
            'ytd-watch-flexy[player-error-message], ' +
            'tp-yt-paper-dialog, ' +
            'ytd-popup-container'
          );

          if (parent && btn.offsetParent !== null) {
            btn.click();
            console.log('[YT-Optimizer] Auto-clicked warning button by text:', text);
            return true;
          }
        }
      }
    } catch (e) { }

    return false;
  }

  /**
   * Ẩn warning overlay bằng CSS nếu không click được button
   */
  function hideWarningOverlays() {
    for (const selector of WARNING_OVERLAY_SELECTORS) {
      try {
        const elements = document.querySelectorAll(selector);
        for (const el of elements) {
          if (el && el.offsetParent !== null) {
            // Kiểm tra nội dung có phải warning không
            const text = el.textContent || '';
            if (
              text.includes('tự tử') ||
              text.includes('tự hủy hoại') ||
              text.includes('self-harm') ||
              text.includes('suicide') ||
              text.includes('sensitive') ||
              text.includes('content warning') ||
              text.includes('Cần nhắc') ||
              text.includes('Nội dung sau đây')
            ) {
              el.style.display = 'none';
              console.log('[YT-Optimizer] Hidden warning overlay:', selector);
              return true;
            }
          }
        }
      } catch (e) { }
    }
    return false;
  }

  // ============================================
  // 3. WARNING DISMISS LOOP
  // Chạy liên tục để phát hiện và dismiss warnings
  // ============================================

  let warningCheckAttempts = 0;
  const MAX_WARNING_CHECKS = 50; // 25 giây

  function startWarningDismisser() {
    warningCheckAttempts = 0;

    const warningInterval = setInterval(() => {
      warningCheckAttempts++;

      // Thử click nút trước
      const clicked = dismissWarning();

      // Nếu không click được, thử hide overlay
      if (!clicked) {
        hideWarningOverlays();
      }

      // Dừng sau khi đã click thành công hoặc quá nhiều attempts
      if (clicked || warningCheckAttempts > MAX_WARNING_CHECKS) {
        clearInterval(warningInterval);
      }
    }, 500);
  }

  // Observer để phát hiện warning mới được thêm vào DOM
  const warningObserver = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      for (const node of mutation.addedNodes) {
        if (node.nodeType !== 1) continue; // Skip non-element nodes

        // Kiểm tra node mới có phải warning không
        const text = node.textContent || '';
        const isWarning =
          text.includes('tự tử') ||
          text.includes('tự hủy hoại') ||
          text.includes('self-harm') ||
          text.includes('suicide') ||
          text.includes('Nội dung sau đây') ||
          text.includes('content warning') ||
          text.includes('Cần nhắc') ||
          text.includes('sensitive content');

        if (isWarning) {
          console.log('[YT-Optimizer] Detected warning element added to DOM');
          // Delay ngắn để DOM render xong
          setTimeout(() => dismissWarning(), 200);
          setTimeout(() => dismissWarning(), 500);
          setTimeout(() => {
            if (!dismissWarning()) {
              hideWarningOverlays();
            }
          }, 1000);
        }
      }
    }
  });

  // ============================================
  // 4. PERFORMANCE CSS
  // ============================================

  function injectPerformanceCSS() {
    if (document.getElementById('yt-optimizer-css')) return;

    const style = document.createElement('style');
    style.id = 'yt-optimizer-css';
    style.textContent = `
            /* GPU acceleration */
            #movie_player, .html5-video-player, video {
                transform: translateZ(0);
                backface-visibility: hidden;
            }
            
            /* Contain layout calculations */
            #secondary, #related, #comments {
                contain: layout style paint;
            }
            
            /* Disable heavy effects */
            #cinematics, #cinematics-container {
                display: none !important;
            }
            
            /* Hide ads */
            #player-ads, .video-ads, .ytp-ad-module, .ytp-ad-overlay-container {
                display: none !important;
            }
            
            /* Faster thumbnail hover */
            ytd-thumbnail:hover {
                transition-duration: 0.1s !important;
            }
        `;
    document.head.appendChild(style);
  }

  // ============================================
  // 5. INITIALIZE
  // ============================================

  function init() {
    injectPerformanceCSS();

    // Start warning dismisser
    startWarningDismisser();

    // Observe DOM cho warning mới
    if (document.body) {
      warningObserver.observe(document.body, {
        childList: true,
        subtree: true,
      });
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  // Re-run khi page navigate (YouTube SPA)
  document.addEventListener('yt-navigate-finish', () => {
    startWarningDismisser();
  });

  console.log('[YT-Optimizer] Content script loaded with warning bypass');
})();
