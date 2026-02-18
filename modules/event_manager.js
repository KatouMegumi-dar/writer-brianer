// modules/event_manager.js

(function() {
    'use strict';

    window.WBAP = window.WBAP || {};
    const Logger = WBAP.Logger;

    let refreshDebounceTimer = null;
    let worldInfoObserver = null;
    let pollingTimer = null;
    let lastOptionsSignature = '';

    // 防抖刷新函数
    function debouncedRefresh() {
        if (refreshDebounceTimer) {
            clearTimeout(refreshDebounceTimer);
        }
        refreshDebounceTimer = setTimeout(() => {
            Logger.log('检测到世界书更新，自动刷新列表...');
            if (window.WBAP.UI && typeof window.WBAP.UI.refreshWorldBookList === 'function') {
                WBAP.UI.refreshWorldBookList();
            }
        }, 1000); // 1秒防抖
    }

    // 初始化，监听SillyTavern的事件
    function initialize() {
        let eventListenerAttached = false;
        if (typeof SillyTavern !== 'undefined' && SillyTavern.getContext) {
            const context = SillyTavern.getContext();
            if (context.eventSource && context.event_types) {
                
                // 监听世界书更新事件
                if (context.event_types.WORLDINFO_UPDATED) {
                    context.eventSource.on(context.event_types.WORLDINFO_UPDATED, debouncedRefresh);
                    Logger.log('已成功监听世界书更新事件 (WORLDINFO_UPDATED)。');
                    eventListenerAttached = true;
                } else {
                    Logger.warn('无法监听 WORLDINFO_UPDATED 事件。');
                }

                // 监听世界书设置更新事件（例如，启用/禁用一本书）
                if (context.event_types.WORLDINFO_SETTINGS_UPDATED) {
                    context.eventSource.on(context.event_types.WORLDINFO_SETTINGS_UPDATED, debouncedRefresh);
                    Logger.log('已成功监听世界书设置更新事件 (WORLDINFO_SETTINGS_UPDATED)。');
                    eventListenerAttached = true;
                } else {
                    Logger.warn('无法监听 WORLDINFO_SETTINGS_UPDATED 事件。');
                }

            } else {
                Logger.warn('SillyTavern 事件系统不可用，无法实现世界书自动刷新。');
            }
        } else {
            Logger.warn('SillyTavern 上下文不可用，无法实现世界书自动刷新。');
        }

        // 兜底：监听世界书下拉的 DOM 变化；仅在事件监听不可用时启动轮询降级
        const enablePollingFallback = !eventListenerAttached;
        startDomObserver(enablePollingFallback);
    }

    function computeOptionsSignature(selectEl) {
        if (!selectEl) return '';
        const options = Array.from(selectEl.querySelectorAll('option'));
        return options.map(o => (o.textContent || '').trim()).join('|');
    }

    function startDomObserver(enablePollingFallback = true) {
        const target = document.getElementById('world_info') || document.getElementById('character_world');
        if (!target) {
            // 下拉尚未渲染，稍后重试
            setTimeout(() => startDomObserver(enablePollingFallback), 2000);
            return;
        }
        try {
            if (worldInfoObserver) worldInfoObserver.disconnect();
            worldInfoObserver = new MutationObserver(() => debouncedRefresh());
            worldInfoObserver.observe(target, { childList: true, subtree: true, attributes: true });
            lastOptionsSignature = computeOptionsSignature(target);
            Logger.log('已开启世界书下拉 DOM 监听作为兜底。');
            if (enablePollingFallback) startPollingFallback();
        } catch (e) {
            Logger.warn('设置世界书 DOM 监听失败:', e);
        }
    }

    function startPollingFallback() {
        if (pollingTimer) return;
        pollingTimer = setInterval(() => {
            const selectEl = document.getElementById('world_info') || document.getElementById('character_world');
            if (!selectEl) return;
            const signature = computeOptionsSignature(selectEl);
            if (signature && signature !== lastOptionsSignature) {
                lastOptionsSignature = signature;
                debouncedRefresh();
            }
        }, 5000);
    }

    // 暴露接口
    window.WBAP.EventManager = {
        initialize
    };

})();
