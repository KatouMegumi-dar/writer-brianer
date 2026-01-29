// modules/interceptor.js

(function () {
    'use strict';

    window.WBAP = window.WBAP || {};
    const Logger = WBAP.Logger;
    const ANALYSIS_SUMMARY_TITLE = '背景分析';

    function escapeRegExp(value) {
        return String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }

    function buildSummaryVariants(summaryTitle) {
        const variants = new Set();
        if (summaryTitle) variants.add(summaryTitle);
        try {
            if (typeof TextEncoder !== 'undefined' && typeof TextDecoder !== 'undefined') {
                const bytes = new TextEncoder().encode(summaryTitle);
                variants.add(new TextDecoder('latin1').decode(bytes));
                try {
                    variants.add(new TextDecoder('windows-1252', { fatal: false }).decode(bytes));
                } catch (e) {
                    // Ignore unsupported encodings
                }
            }
        } catch (e) {
            // Ignore encoding fallback errors
        }
        return Array.from(variants).filter(Boolean);
    }

    const SUMMARY_VARIANTS = buildSummaryVariants(ANALYSIS_SUMMARY_TITLE);
    const SUMMARY_PATTERN = SUMMARY_VARIANTS.map(escapeRegExp).join('|') || escapeRegExp(ANALYSIS_SUMMARY_TITLE);
    const SUMMARY_BLOCK_REGEX = new RegExp(`<details[^>]*>\\s*<summary>\\s*(?:${SUMMARY_PATTERN})`, 'i');
    const SUMMARY_REGEX = new RegExp(SUMMARY_PATTERN, 'i');

    let isProcessing = false;
    let skipNextHook = false;
    let sendButton = null;
    let sendTextarea = null;

    // 常见标记：插件生成的背景分析、Plot_progression、memory 块等
    const PROCESSED_PATTERNS = [
        /<details[^>]*data-wbap\s*=\s*["']analysis["']/i,
        SUMMARY_BLOCK_REGEX,
        /--- .*分析 ---/i,
        /<plot_progression>/i,
        /<\/memory>/i,
        /<summary>【过去记忆碎片】/i,
        /过去记忆碎片/,
        SUMMARY_REGEX,
        /<important_information>/i,
        /<historical_occurrences>/i,
        /<index_terms>/i,
        /以上是用户的最新输入，请勿忽略/i
    ];

    function isLikelyAlreadyProcessed(text) {
        if (!text || typeof text !== 'string') return false;
        return PROCESSED_PATTERNS.some((re) => re.test(text));
    }

    // 核心处理函数
    async function handleSendWithMemory(event) {
        if (skipNextHook) {
            Logger.log('跳过拦截，执行原始发送');
            skipNextHook = false;
            return;
        }

        const { config, runSelectiveModeProcessing } = WBAP;

        // 未开启时不拦截，交给原始发送逻辑
        if (!config || config.enabled === false) {
            return;
        }

        if (isProcessing) {
            Logger.warn('正在处理中，请稍候...');
            event.preventDefault();
            event.stopPropagation();
            event.stopImmediatePropagation();
            return;
        }

        const textarea = sendTextarea || document.getElementById('send_textarea');
        if (!textarea) {
            Logger.warn('发送输入框未找到，跳过拦截');
            return;
        }
        const originalInput = textarea.value; // 完整保留用户最初输入
        const userInput = originalInput.trim();
        const context = WBAP.getRecentContext(WBAP.getCurrentChatContext(), config.contextRounds);

        if (!userInput) {
            return; // 没有输入内容，不拦截
        }

        // 若内容已含其他插件/本插件的注入标记，则按设置决定是否放行，避免重复处理
        const skipProcessed = config.skipProcessedMessages !== false;
        if (skipProcessed && isLikelyAlreadyProcessed(userInput)) {
            Logger.log('检测到已处理内容，按设置跳过记忆注入');
            return;
        }

        // 阻止原始发送事件
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();

        isProcessing = true;
        if (sendButton) sendButton.disabled = true;
        Logger.log('消息已拦截，开始处理...');

        // 统一初始化进度面板（由 interceptor 管理）
        const showProgress = config?.showProgressPanel && WBAP.UI;
        if (showProgress) {
            // 先显示面板，具体任务数由各模块添加
            WBAP.UI.showProgressPanel('正在处理...', 0);
        }

        try {
            // 并行执行：记忆模块 + 自选模式（内含天纲）
            const memoryPromise = (WBAP.MemoryModule && typeof WBAP.MemoryModule.processMessage === 'function')
                ? WBAP.MemoryModule.processMessage(userInput).catch(err => {
                    Logger.warn('记忆模块处理失败，已跳过', err);
                    return '';
                })
                : Promise.resolve('');

            const analysisPromise = runSelectiveModeProcessing(originalInput.trim(), null, context).catch(err => {
                Logger.warn('自选模式处理失败，已跳过', err);
                return '';
            });

            // 等待所有任务完成
            const [memoryBlock, analysisResult] = await Promise.all([memoryPromise, analysisPromise]);

            // 合并结果
            let finalOutput = originalInput;
            if (memoryBlock) {
                finalOutput = `${finalOutput}\n\n${memoryBlock}`;
            }
            if (analysisResult) {
                finalOutput = `${finalOutput}\n\n${analysisResult}`;
            }

            textarea.value = finalOutput;

            // 触发 input 事件以确保 SillyTavern UI 更新
            textarea.dispatchEvent(new Event('input', { bubbles: true }));

            // 触发真正的发送
            skipNextHook = true;
            document.getElementById('send_but').click();

        } catch (e) {
            Logger.error('拦截器处理失败:', e);
            alert('笔者之脑处理失败: ' + e.message);
            // 出错时，恢复原始输入
            textarea.value = originalInput;
        } finally {
            isProcessing = false;
            if (sendButton) sendButton.disabled = false;
            // 统一关闭进度面板
            if (showProgress) {
                WBAP.UI.hideProgressPanel();
            }
            // 确保 skipNextHook 在短时间后被重置，以防万一
            setTimeout(() => { skipNextHook = false; }, 100);
        }
    }

    // 挂载拦截器 - 增强版 (MutationObserver + 多事件捕获)
    function initializeInterceptor() {
        Logger.log('正在初始化消息拦截器 (强力模式)...');
        console.log('[WBAP] 正在初始化消息拦截器 (强力模式)...');

        const HOOK_MARK = 'data-wbap-hooked';

        const handleEnterKey = (event) => {
            if (event.key === 'Enter' && !event.shiftKey) {
                // 必须在捕获阶段阻止，防止其他监听器执行
                event.preventDefault();
                event.stopPropagation();
                event.stopImmediatePropagation();

                const btn = document.getElementById('send_but');
                if (btn) {
                    // 模拟点击，触发 handleSendWithMemory
                    // 注意：这会触发我们自己的 click 监听器，进入 handleSendWithMemory
                    const clickEvent = new MouseEvent('click', {
                        bubbles: true,
                        cancelable: true,
                        view: window
                    });
                    btn.dispatchEvent(clickEvent);
                }
            }
        };

        // 强力阻断函数：在非处理阶段放行，在处理阶段拦截一切
        const blockingHandler = (event) => {
            // 如果是我们的模拟触发（skipNextHook=true），则放行
            if (skipNextHook) return;

            // 核心拦截逻辑：handleSendWithMemory
            // 这里我们直接复用 handleSendWithMemory 的逻辑，或者直接调用它
            // 为了安全，click 事件调用主逻辑，其他事件（如 mousedown）仅做预拦截/防止误触
            if (event.type === 'click') {
                handleSendWithMemory(event);
            } else {
                // 针对 mousedown/pointerdown 等，如果在处理中，则阻止
                // 注意：这里我们仅在其试图触发时阻止，但如果不在这里调用 preventDefault，
                // 后续的 click 可能会发生。所以对于 mousedown，如果我们在处理中，也应该阻止吗？
                // 通常只阻止 click 即可，但为了“强力”拦截，防止 mousedown 触发其他脚本的逻辑：
                if (isProcessing) {
                    event.preventDefault();
                    event.stopPropagation();
                    event.stopImmediatePropagation();
                }
            }
        };

        const bindButton = (btn) => {
            if (!btn || btn.getAttribute(HOOK_MARK) === 'true') return;

            console.log('[WBAP] 绑定发送按钮拦截器 (Capture Phase)');

            // 使用 Capture 阶段 (true) 确保最先执行
            // 同时拦截 click, mousedown, pointerdown 防止某些脚本通过非 click 触发
            btn.addEventListener('click', blockingHandler, true);
            btn.addEventListener('mousedown', blockingHandler, true);
            btn.addEventListener('pointerdown', blockingHandler, true);

            btn.setAttribute(HOOK_MARK, 'true');
            sendButton = btn;
        };

        const bindTextarea = (area) => {
            if (!area || area.getAttribute(HOOK_MARK) === 'true') return;

            console.log('[WBAP] 绑定输入框回车拦截器 (Capture Phase)');
            area.addEventListener('keydown', handleEnterKey, true);
            area.setAttribute(HOOK_MARK, 'true');
            sendTextarea = area;
        };

        // 初始绑定
        const initBind = () => {
            bindButton(document.getElementById('send_but'));
            bindTextarea(document.getElementById('send_textarea'));
        };

        initBind();

        // 使用 MutationObserver 监听 DOM 变化，防止按钮重绘后失效
        const observer = new MutationObserver((mutations) => {
            let needRebind = false;
            for (const mutation of mutations) {
                if (mutation.type === 'childList' && mutation.addedNodes.length > 0) {
                    // 简单粗暴：只要有节点增加，就检查一次 (性能消耗极低)
                    needRebind = true;
                    break;
                }
            }
            if (needRebind) {
                initBind();
            }
        });

        // 监听 body 的子节点变化（覆盖面最广，适配 ST 各种重绘）
        observer.observe(document.body, { childList: true, subtree: true });

        // 保留一个低频轮询作为兜底，防止 Observer 漏掉某些属性变化
        setInterval(initBind, 2000);

        Logger.log('消息拦截器监控已启动 (Observer + Polling)');
    }

    // 暴露初始化函数
    window.WBAP.initializeInterceptor = initializeInterceptor;

})();
