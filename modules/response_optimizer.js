// modules/response_optimizer.js
// 正文优化模块 - 拦截 AI 返回的正文内容并进行优化

(function () {
    'use strict';

    window.WBAP = window.WBAP || {};
    const Logger = WBAP.Logger || console;

    // ==================== 状态管理 ====================
    
    // 助手面板状态枚举
    const PANEL_STATE = {
        IDLE: 'idle',                 // 无优化数据
        STREAMING: 'streaming',       // 实时优化中
        COMPLETED: 'completed',       // 优化完成
        CHATTING: 'chatting'          // 用户对话中
    };

    const state = {
        initialized: false,
        processing: new Map(),        // messageId -> { controller, startTime }
        messageCache: new Map(),      // messageId -> originalContent
        streamBuffer: new Map(),      // messageId -> accumulated tokens
        realtimeThrottleTimers: new Map(),
        elements: {},
        panelInjected: false,
        // 拦截状态
        intercepting: false,          // 是否正在拦截
        currentInterceptMessageId: null, // 当前拦截的消息ID
        streamInterceptBuffer: '',    // 流式拦截缓冲区
        streamOptimizedBuffer: '',    // 流式优化结果缓冲区
        pendingOptimization: null,    // 待处理的优化 Promise
        isProcessingOptimization: false, // 防止重复触发优化
        // 助手面板状态
        assistant: {
            panelInjected: false,
            isOpen: false,
            panelState: PANEL_STATE.IDLE,  // 面板状态机
            currentMessageId: null,
            originalContent: '',      // 优化前原文
            optimizedContent: '',     // 优化后内容
            diffHtml: '',             // 差异对比HTML
            conversationHistory: [],  // 对话历史 [{role, content}]
            maxRounds: 10,            // 最大记忆轮数
            elements: {},             // DOM 元素缓存
            isProcessing: false,      // 是否正在处理消息
            streamingSnapshot: {      // 流式过程快照（用于回放）
                original: '',
                optimized: '',
                timestamp: 0
            },
            // 优化上下文记忆（用于助手对话时提供真实的优化依据）
            optimizationContext: {
                worldbookContent: '',     // 优化时使用的世界书内容
                systemPromptUsed: '',     // 优化时使用的系统提示词
                userPromptUsed: '',       // 优化时使用的用户提示词
                presetName: '',           // 使用的提示词预设名称
                worldbookNames: '',       // 使用的世界书名称
                timestamp: 0              // 优化时间戳
            }
        }
    };

    // ==================== 配置获取 ====================

    function getConfig() {
        let charConfig = WBAP.CharacterManager?.getCurrentCharacterConfig?.() || WBAP.config || {};

        // 【关键修复】如果是临时配置（主页），优先从默认配置读取
        // 这样刷新后能正确获取之前保存的设置
        if (WBAP.CharacterManager?.isTemporaryConfig && WBAP.mainConfig?.characterConfigs?.default) {
            charConfig = WBAP.mainConfig.characterConfigs.default;
        }

        const merged = {
            ...getDefaultConfig(),
            ...(charConfig.responseOptimizer || {})
        };
        if (!Array.isArray(merged.worldBooks)) merged.worldBooks = [];
        if (!merged.assignedEntriesMap || typeof merged.assignedEntriesMap !== 'object') merged.assignedEntriesMap = {};
        return merged;
    }

    function getGlobalPools() {
        return WBAP.getGlobalPools ? WBAP.getGlobalPools() : (WBAP.mainConfig?.globalPools || {});
    }

    function getApiConfig() {
        const pools = getGlobalPools();
        return pools.responseOptimizer?.apiConfig || WBAP.createDefaultResponseOptimizerApiProfile?.() || {};
    }

    function getPromptPresets() {
        const pools = getGlobalPools();
        return pools.prompts?.responseOptimizer || [WBAP.createDefaultResponseOptimizerPromptPreset?.() || createFallbackPreset()];
    }

    function getSelectedPromptPreset() {
        const config = getConfig();
        const presets = getPromptPresets();
        const idx = config.selectedPromptIndex || 0;
        return presets[idx] || presets[0] || createFallbackPreset();
    }

    function getDefaultConfig() {
        return {
            enabled: false,
            autoIntercept: true,
            manualTrigger: true,
            streamingMode: 'wait',
            selectedPromptIndex: 0,
            showProgress: true,
            minContentLength: 50,
            excludePatterns: [],
            preserveFormatting: true,
            targetTag: '',  // 目标标签，如 'content'。为空则优化整个消息
            // 世界书参考（角色绑定）
            worldBooks: [],
            assignedEntriesMap: {}
        };
    }

    function createFallbackPreset() {
        return {
            name: '默认正文优化提示词',
            description: '提升文本质量，保持原意和风格',
            systemPrompt: WBAP.DEFAULT_RESPONSE_OPT_SYSTEM_PROMPT || '你是一名专业的文本优化助手。',
            promptTemplate: WBAP.DEFAULT_RESPONSE_OPT_PROMPT_TEMPLATE || '请优化以下正文内容：\n\n{content}'
        };
    }

    // ==================== 事件钩子 ====================

    function initializeEventHooks() {
        try {
            const context = SillyTavern.getContext();
            if (!context?.eventSource || !context?.event_types) {
                Logger.warn('[正文优化] SillyTavern 事件系统不可用，稍后重试');
                setTimeout(initializeEventHooks, 2000);
                return;
            }

            const { eventSource, event_types } = context;

            // 核心拦截：监听消息接收事件（在渲染前触发）
            // 这是实现真实拦截的关键 - 在消息渲染到 UI 之前进行优化
            eventSource.on(event_types.MESSAGE_RECEIVED, handleMessageReceived);

            // 监听流式token接收事件 - 用于实时模式显示进度
            if (event_types.STREAM_TOKEN_RECEIVED) {
                eventSource.on(event_types.STREAM_TOKEN_RECEIVED, handleStreamToken);
            }

            // 监听生成开始事件 - 准备拦截状态
            eventSource.on(event_types.GENERATION_STARTED, handleGenerationStarted);

            // 监听生成结束事件 - 用于清理状态
            eventSource.on(event_types.GENERATION_ENDED, handleGenerationEnded);

            // 监听生成停止事件（用户点击停止按钮）- 清理拦截状态
            if (event_types.GENERATION_STOPPED) {
                eventSource.on(event_types.GENERATION_STOPPED, handleGenerationStopped);
            }

            // 监听消息渲染完成事件（用于手动触发按钮）
            eventSource.on(event_types.CHARACTER_MESSAGE_RENDERED, handleMessageRendered);

            Logger.log('[正文优化] 事件钩子已初始化（MESSAGE_RECEIVED 拦截模式）');
        } catch (e) {
            Logger.warn('[正文优化] 初始化事件钩子失败，稍后重试', e);
            setTimeout(initializeEventHooks, 2000);
        }
    }

    // 用户点击停止生成时清理拦截状态
    function handleGenerationStopped() {
        Logger.log('[正文优化] 检测到生成被停止，清理拦截状态');

        // 重置拦截状态
        state.intercepting = false;
        state.isProcessingOptimization = false;
        state.streamInterceptBuffer = '';
        state.streamOptimizedBuffer = '';
        state.currentInterceptMessageId = null;

        // 更新悬浮球状态
        updateFabProcessingState(false);
    }

    // 生成开始时准备拦截状态
    function handleGenerationStarted(type, options, dryRun) {
        if (dryRun) return;

        const config = getConfig();
        if (!config.enabled || !config.autoIntercept) return;

        // 重置拦截状态
        state.intercepting = true;
        state.isProcessingOptimization = false;
        state.streamInterceptBuffer = '';
        state.streamOptimizedBuffer = '';
        state.currentInterceptMessageId = null;

        // 更新悬浮球状态为处理中
        updateFabProcessingState(true);

        // 如果是实时模式，自动打开助手面板显示流式内容
        if (config.streamingMode === 'realtime') {
            // 设置面板状态为流式中
            state.assistant.panelState = PANEL_STATE.STREAMING;
            state.assistant.streamingSnapshot = { original: '', optimized: '', timestamp: Date.now() };
            
            injectAssistantPanel();
            const panel = state.assistant.elements.panel;
            if (panel) {
                panel.classList.add('open');
                panel.classList.remove('wbap-hidden');
                state.assistant.isOpen = true;
                // 清空之前的内容，显示等待提示
                renderPanelContent();
            }
        }

        Logger.log('[正文优化] 生成开始，准备拦截');
    }

    // 处理流式token - 实时拦截
    function handleStreamToken(token) {
        const config = getConfig();
        if (!config.enabled || !config.autoIntercept) return;
        if (!state.intercepting) return;

        // 累积token
        state.streamInterceptBuffer += token;

        // 如果是实时模式，进行实时处理
        if (config.streamingMode === 'realtime') {
            throttledRealtimeProcess();
        } else if (state.assistant.isOpen) {
            // 等待模式下，如果面板打开，也更新显示
            throttledUpdateStreamDisplay();
        }
    }

    // 等待模式下更新流式显示的节流函数
    let streamDisplayTimer = null;
    function throttledUpdateStreamDisplay() {
        if (streamDisplayTimer) return;

        streamDisplayTimer = setTimeout(() => {
            streamDisplayTimer = null;

            if (!state.intercepting || !state.streamInterceptBuffer) return;
            if (!state.assistant.isOpen) return;

            // 更新快照
            state.assistant.streamingSnapshot.original = state.streamInterceptBuffer;
            state.assistant.streamingSnapshot.optimized = state.streamOptimizedBuffer;
            state.assistant.streamingSnapshot.timestamp = Date.now();

            // 如果面板状态不是流式中，切换到流式状态
            if (state.assistant.panelState !== PANEL_STATE.STREAMING) {
                state.assistant.panelState = PANEL_STATE.STREAMING;
            }

            renderPanelContent();
        }, 100);
    }

    // 核心拦截：MESSAGE_RECEIVED 事件处理
    // 在消息接收后立即进行优化，然后更新消息内容
    async function handleMessageReceived(messageId) {
        const config = getConfig();
        if (!config.enabled || !config.autoIntercept) return;

        // 【BUG修复】检查是否有有效的提示词预设（非 fallback）
        const pools = getGlobalPools();
        const presets = pools.prompts?.responseOptimizer;
        if (!Array.isArray(presets) || presets.length === 0) {
            Logger.log('[正文优化] 未配置提示词预设，跳过优化');
            return;
        }
        const selectedPreset = presets[config.selectedPromptIndex || 0] || presets[0];
        if (!selectedPreset || !selectedPreset.systemPrompt || !selectedPreset.promptTemplate) {
            Logger.log('[正文优化] 选中的提示词预设无效，跳过优化');
            return;
        }

        // 防止重复触发
        if (state.isProcessingOptimization) {
            Logger.log(`[正文优化] 优化正在进行中，跳过消息 ${messageId}`);
            return;
        }

        const isRealtimeMode = config.streamingMode === 'realtime';

        try {
            const context = SillyTavern.getContext();
            const message = context.chat[messageId];

            // 只处理 AI 消息
            if (!message || message.is_user) return;

            const originalFullMessage = message.mes || '';

            // 内容预检
            if (!shouldOptimize(originalFullMessage, config)) {
                Logger.log(`[正文优化] 消息 ${messageId} 不满足优化条件，跳过`);
                return;
            }

            // 设置处理标志，防止重复触发
            state.isProcessingOptimization = true;
            state.currentInterceptMessageId = messageId;

            // 【关键】新优化开始时，彻底清空所有助手状态
            clearAssistantState();

            // 清空流式缓冲区
            state.streamOptimizedBuffer = '';

            // 实时模式：自动打开助手面板显示流式内容
            if (isRealtimeMode) {
                // 保存原始内容到流式缓冲区（用于实时显示）
                state.streamInterceptBuffer = originalFullMessage;

                // 设置面板状态为流式中
                state.assistant.panelState = PANEL_STATE.STREAMING;
                state.assistant.streamingSnapshot = {
                    original: originalFullMessage,
                    optimized: '',
                    timestamp: Date.now()
                };

                injectAssistantPanel();
                const panel = state.assistant.elements.panel;
                if (panel) {
                    panel.classList.add('open');
                    panel.classList.remove('wbap-hidden');
                    state.assistant.isOpen = true;
                    // 显示初始状态
                    renderPanelContent();
                }
            }

            // 获取目标标签配置
            const targetTag = config.targetTag || '';  // 默认为空，表示不使用标签提取

            // 确定要优化的内容
            let contentToOptimize = originalFullMessage;
            let useTagExtraction = false;

            if (targetTag) {
                // 尝试提取标签内容
                const extractedContent = extractContentByTag(originalFullMessage, targetTag);
                if (extractedContent && extractedContent.trim()) {
                    contentToOptimize = extractedContent;
                    useTagExtraction = true;
                    Logger.log(`[正文优化] 使用标签提取模式，目标标签: <${targetTag}>，提取内容长度: ${contentToOptimize.length}`);

                    // 实时模式：更新流式缓冲区为提取的内容
                    if (isRealtimeMode) {
                        state.streamInterceptBuffer = contentToOptimize;
                        throttledRealtimeProcess();
                    }
                } else {
                    Logger.log(`[正文优化] 未找到目标标签 <${targetTag}>，将优化整个消息`);
                }
            }

            Logger.log(`[正文优化] MESSAGE_RECEIVED: 开始优化消息 ${messageId}，内容长度: ${contentToOptimize.length}，实时模式: ${isRealtimeMode}`);

            // 保存原始内容（用于差异对比）
            state.assistant.originalContent = contentToOptimize;
            state.assistant.currentMessageId = messageId;

            // 执行优化（实时模式启用流式）
            const shouldInjectWorldbook = !targetTag || useTagExtraction;
            const optimizedTagContent = await executeOptimization(messageId, contentToOptimize, targetTag, {
                enableStreaming: isRealtimeMode,
                injectWorldbook: shouldInjectWorldbook
            });

            if (optimizedTagContent && optimizedTagContent !== contentToOptimize) {
                // 构建最终的优化后消息
                let finalOptimizedMessage;
                if (useTagExtraction) {
                    // 标签模式：只替换标签内的内容
                    finalOptimizedMessage = replaceContentByTag(originalFullMessage, targetTag, optimizedTagContent);
                    Logger.log(`[正文优化] 标签模式：已替换 <${targetTag}> 标签内容`);
                } else {
                    // 全文模式：直接使用优化后的内容
                    finalOptimizedMessage = optimizedTagContent;
                }

                // 更新消息对象
                message.mes = finalOptimizedMessage;

                // 如果有 swipes，也更新当前 swipe
                if (message.swipes && message.swipe_id !== undefined) {
                    message.swipes[message.swipe_id] = finalOptimizedMessage;
                }

                // 保存优化后内容并生成差异（差异对比使用标签内容）
                state.assistant.optimizedContent = optimizedTagContent;
                state.assistant.diffHtml = generateDiffHtml(contentToOptimize, optimizedTagContent);

                // 保存流式快照（用于回放）
                state.assistant.streamingSnapshot = {
                    original: contentToOptimize,
                    optimized: optimizedTagContent,
                    timestamp: Date.now()
                };

                // 切换面板状态为完成
                state.assistant.panelState = PANEL_STATE.COMPLETED;

                // 关键：更新 DOM（消息可能已经渲染）
                await updateMessageDom(messageId, finalOptimizedMessage, message);

                Logger.log(`[正文优化] 消息 ${messageId} 优化完成并已更新显示`);

                // 实时模式：更新助手面板显示完成状态
                if (isRealtimeMode && state.assistant.isOpen) {
                    renderPanelContent();
                }

                // 显示成功提示
                if (window.toastr) {
                    toastr.success('正文优化完成，点击消息旁的魔杖按钮查看差异', '笔者之脑');
                }
            }

        } catch (e) {
            Logger.error('[正文优化] MESSAGE_RECEIVED 处理失败', e);
            if (window.toastr) {
                toastr.error(`正文优化失败: ${e.message}`, '笔者之脑');
            }
        } finally {
            state.isProcessingOptimization = false;
            // 【说明】此时消息已完全接收，流式传输已结束，可以安全重置拦截状态
            // handleGenerationStopped 会在用户手动停止时调用，这里是正常完成时的清理
            state.intercepting = false;
            updateFabProcessingState(false);
        }
    }

    // 更新消息 DOM（参考 Amily 的 setChatMessage 实现）
    async function updateMessageDom(messageId, newContent, message) {
        try {
            const context = SillyTavern.getContext();

            // 查找消息 DOM 元素
            const $mesElement = $(`#chat .mes[mesid="${messageId}"] .mes_text`);
            if ($mesElement.length) {
                // 使用 SillyTavern 的消息格式化
                const formatted = context.messageFormatting
                    ? context.messageFormatting(newContent, message.name, message.is_system, message.is_user, messageId)
                    : newContent;

                // 使用 jQuery 的 empty().append() 方法更新内容
                $mesElement.empty().append(formatted);

                // 触发消息渲染完成事件
                const { eventSource, event_types } = context;
                if (eventSource && event_types) {
                    const eventType = message.is_user
                        ? event_types.USER_MESSAGE_RENDERED
                        : event_types.CHARACTER_MESSAGE_RENDERED;
                    await eventSource.emit(eventType, messageId);
                }

                Logger.log(`[正文优化] 消息 ${messageId} DOM 已更新`);
            }

            // 保存聊天
            if (context.saveChatConditional) {
                await context.saveChatConditional();
            }
        } catch (e) {
            Logger.error('[正文优化] 更新消息 DOM 失败', e);
        }
    }

    // 执行优化（不更新 DOM，只返回优化后的内容）
    // targetTag: 如果指定，会尝试从返回内容中提取该标签的内容
    // options.enableStreaming: 是否启用流式返回
    // options.onToken: 流式 token 回调
    async function executeOptimization(messageId, content, targetTag = '', options = {}) {
        const config = getConfig();
        const apiConfig = getApiConfig();
        const isRealtimeMode = config.streamingMode === 'realtime';
        const enableStreaming = options.enableStreaming ?? isRealtimeMode;
        const onToken = options.onToken;

        // 检查是否正在处理
        if (state.processing.has(messageId)) {
            Logger.warn(`[正文优化] 消息 ${messageId} 正在处理中`);
            return content;
        }

        // 缓存原始内容
        state.messageCache.set(messageId, content);

        // 创建取消控制器
        const controller = new AbortController();
        state.processing.set(messageId, {
            controller,
            startTime: Date.now()
        });

        // 实时模式：清空优化缓冲区
        if (isRealtimeMode) {
            state.streamOptimizedBuffer = '';
        }

        try {
            // 获取选中的提示词预设
            const preset = getSelectedPromptPreset();

            // 世界书参考（角色绑定）
            // 【BUG修复】使用传入的 targetTag 参数，而不是重新从 config 读取（避免参数遮蔽）
            const effectiveTargetTag = targetTag || config.targetTag || '';
            let shouldInjectWorldbook = options.injectWorldbook;
            if (shouldInjectWorldbook === undefined) {
                if (!effectiveTargetTag) {
                    shouldInjectWorldbook = true;
                } else {
                    const extracted = extractContentByTag(content, effectiveTargetTag);
                    shouldInjectWorldbook = !!(extracted && extracted.trim());
                }
            }
            const worldbookText = shouldInjectWorldbook
                ? await buildWorldbookReferenceText(config.worldBooks, config.assignedEntriesMap)
                : '';
            const worldbookNames = shouldInjectWorldbook && Array.isArray(config.worldBooks)
                ? config.worldBooks.join(', ')
                : '';

            // 构建提示词
            const systemPrompt = preset.systemPrompt || '';
            const userPrompt = buildUserPrompt(preset.promptTemplate, content, {
                targetTag: effectiveTargetTag,
                worldbook_content: worldbookText,
                worldbook_names: worldbookNames,
                variables: preset.variables || {}
            });

            // 【关键】保存优化上下文到助手状态（用于后续对话时提供真实依据）
            state.assistant.optimizationContext = {
                worldbookContent: worldbookText,
                systemPromptUsed: systemPrompt,
                userPromptUsed: userPrompt,
                presetName: preset.name || '未命名预设',
                worldbookNames: worldbookNames,
                timestamp: Date.now()
            };

            Logger.log(`[正文优化] 调用 LLM 优化消息 ${messageId}，流式模式: ${enableStreaming}`);
            Logger.log(`[正文优化] 已保存优化上下文，世界书: ${worldbookNames || '无'}, 预设: ${preset.name || '默认'}`);

            // 流式 token 处理回调
            const handleStreamToken = enableStreaming ? (token) => {
                // 累积到优化缓冲区
                state.streamOptimizedBuffer += token;

                // 触发实时显示更新
                throttledRealtimeProcess();

                // 调用外部回调
                if (onToken) onToken(token);
            } : null;

            // 调用 LLM
            const rawResponse = await WBAP.callAI(
                apiConfig.model,
                userPrompt,
                systemPrompt,
                {
                    ...apiConfig,
                    signal: controller.signal,
                    enableStreaming: enableStreaming,
                    onToken: handleStreamToken
                }
            );

            if (!rawResponse || rawResponse.trim().length === 0) {
                throw new Error('优化结果为空');
            }

            // 尝试从返回内容中提取标签内容
            let optimizedContent;
            if (effectiveTargetTag) {
                const extractedFromResponse = extractContentByTag(rawResponse, effectiveTargetTag);
                if (extractedFromResponse && extractedFromResponse.trim()) {
                    optimizedContent = extractedFromResponse.trim();
                    Logger.log(`[正文优化] 从返回内容中提取到 <${effectiveTargetTag}> 标签内容，长度: ${optimizedContent.length}`);
                } else {
                    // 如果没有找到标签，使用清理后的原始返回
                    Logger.log(`[正文优化] 返回内容中未找到 <${effectiveTargetTag}> 标签，使用清理后的内容`);
                    optimizedContent = cleanOptimizedContent(rawResponse);
                }
            } else {
                // 非标签模式，直接清理返回内容
                optimizedContent = cleanOptimizedContent(rawResponse);
            }

            // 应用格式保留（如果启用）
            if (config.preserveFormatting) {
                optimizedContent = preserveOriginalFormatting(content, optimizedContent);
                Logger.log(`[正文优化] 已应用格式保留`);
            }

            // 验证返回内容
            const validationResult = validateOptimizedContent(optimizedContent, content);
            if (validationResult !== true) {
                Logger.warn(`[正文优化] 优化结果验证失败，使用原始内容`);
                if (window.toastr) {
                    toastr.warning(validationResult || '优化结果不符合预期，已保留原文', '正文优化');
                }
                return content;
            }

            return optimizedContent;

        } catch (err) {
            if (err.name === 'AbortError' || err.message?.includes('abort')) {
                Logger.log(`[正文优化] 消息 ${messageId} 优化已取消`);
                if (window.toastr) {
                    toastr.info('正文优化已取消', '笔者之脑');
                }
            } else {
                Logger.error(`[正文优化] 消息 ${messageId} 优化失败:`, err);
                if (window.toastr) {
                    toastr.error(`正文优化失败: ${err.message || '未知错误'}`, '笔者之脑');
                }
            }
            return content;  // 返回原始内容
        } finally {
            state.processing.delete(messageId);
            state.messageCache.delete(messageId);
        }
    }

    /**
     * 保留原文的格式特征（段落、换行、缩进等）
     * @param {string} originalContent - 原始内容
     * @param {string} optimizedContent - 优化后的内容
     * @returns {string} 应用了原文格式的优化内容
     */
    function preserveOriginalFormatting(originalContent, optimizedContent) {
        // 1. 检测原文的段落分隔方式
        const hasDoubleNewlines = /\n\n/.test(originalContent);
        const hasSingleNewlines = /\n(?!\n)/.test(originalContent);

        // 2. 检测原文的缩进模式
        const indentMatch = originalContent.match(/^([ \t]+)/m);
        const indentStr = indentMatch ? indentMatch[1] : '';

        // 3. 统计原文的段落数量
        const originalParagraphs = hasDoubleNewlines
            ? originalContent.split(/\n\n+/).filter(p => p.trim())
            : originalContent.split(/\n/).filter(p => p.trim());

        // 4. 分割优化后的内容为段落
        let optimizedParagraphs = hasDoubleNewlines
            ? optimizedContent.split(/\n\n+/).filter(p => p.trim())
            : optimizedContent.split(/\n/).filter(p => p.trim());

        // 5. 如果优化后段落数量与原文相近，尝试保持段落对应关系
        const paragraphRatio = optimizedParagraphs.length / originalParagraphs.length;

        // 6. 应用格式
        let formatted;
        if (hasDoubleNewlines) {
            // 原文使用双换行分段
            formatted = optimizedParagraphs.join('\n\n');
        } else if (hasSingleNewlines) {
            // 原文使用单换行分段
            formatted = optimizedParagraphs.join('\n');
        } else {
            // 原文没有明显分段，保持优化后的格式
            formatted = optimizedContent;
        }

        // 7. 应用缩进（如果原文有缩进）
        if (indentStr && formatted) {
            formatted = formatted.split('\n').map(line => {
                return line.trim() ? indentStr + line : line;
            }).join('\n');
        }

        // 8. 保留原文的首尾空白特征
        const startsWithNewline = /^\n/.test(originalContent);
        const endsWithNewline = /\n$/.test(originalContent);

        if (startsWithNewline && !/^\n/.test(formatted)) {
            formatted = '\n' + formatted;
        }
        if (endsWithNewline && !/\n$/.test(formatted)) {
            formatted = formatted + '\n';
        }

        return formatted;
    }

    /**
     * 清理优化后的返回内容
     * 移除模型可能添加的额外格式和说明
     */
    function cleanOptimizedContent(rawContent) {
        let content = rawContent.trim();

        // 移除 markdown 代码块
        const codeBlockMatch = content.match(/^```(?:\w*\n)?([\s\S]*?)```$/);
        if (codeBlockMatch) {
            content = codeBlockMatch[1].trim();
        }

        // 移除常见的前缀说明
        const prefixPatterns = [
            /^(?:优化后的?(?:文本|内容)?(?:如下)?[:：]\s*)/i,
            /^(?:以下是优化后的?(?:文本|内容)?[:：]\s*)/i,
            /^(?:Here is the optimized (?:text|content)[:：]?\s*)/i,
        ];
        for (const pattern of prefixPatterns) {
            content = content.replace(pattern, '');
        }

        // 移除常见的后缀说明
        const suffixPatterns = [
            /(?:\n\n---\n[\s\S]*)?$/,  // 移除分隔线后的内容
            /(?:\n\n\[注[:：][\s\S]*\])?$/,  // 移除注释
        ];
        for (const pattern of suffixPatterns) {
            content = content.replace(pattern, '');
        }

        // 移除可能的标签包裹
        const tagMatch = content.match(/^<(?:content|text|output)>([\s\S]*?)<\/(?:content|text|output)>$/i);
        if (tagMatch) {
            content = tagMatch[1].trim();
        }

        return content.trim();
    }

    /**
     * 验证优化后的内容是否合理
     * @returns {true|string} 验证通过返回 true，失败返回错误信息字符串
     */
    function validateOptimizedContent(optimizedContent, originalContent) {
        // 内容不能为空
        if (!optimizedContent || optimizedContent.length === 0) {
            Logger.warn('[正文优化] 验证失败：优化结果为空');
            return '优化结果为空，已保留原文';
        }

        // 内容长度不能差异过大（允许 20% - 300% 的范围）
        const lengthRatio = optimizedContent.length / originalContent.length;
        if (lengthRatio < 0.2) {
            Logger.warn(`[正文优化] 验证失败：长度差异过大 (${(lengthRatio * 100).toFixed(1)}%)`);
            return '优化结果过短，已保留原文';
        }
        if (lengthRatio > 3) {
            Logger.warn(`[正文优化] 验证失败：长度差异过大 (${(lengthRatio * 100).toFixed(1)}%)`);
            return '优化结果过长，已保留原文';
        }

        // 检查是否包含明显的错误标记
        const errorPatterns = [
            /^(?:抱歉|对不起|I'm sorry|I cannot)/i,
            /^(?:作为AI|As an AI)/i,
            /^(?:我无法|I can't)/i,
        ];
        for (const pattern of errorPatterns) {
            if (pattern.test(optimizedContent)) {
                Logger.warn('[正文优化] 验证失败：检测到错误响应');
                return 'AI 拒绝优化请求，已保留原文';
            }
        }

        return true;
    }

    // ==================== 标签提取功能 ====================

    /**
     * 查找文本中最后一个指定标签的位置信息
     * @param {string} text - 要搜索的文本
     * @param {string} tagName - 标签名称（不含尖括号）
     * @returns {Object|null} 包含位置信息的对象，或 null
     */
    function findLastTagIndices(text, tagName) {
        const closeTag = `</${tagName}>`;
        const closeIndex = text.lastIndexOf(closeTag);

        if (closeIndex === -1) return null;

        // 从结束标签位置向前搜索开始标签
        const openTagStart = `<${tagName}`;
        let openIndex = text.lastIndexOf(openTagStart, closeIndex);

        if (openIndex === -1) return null;

        // 找到开始标签的结束位置（>）
        const openTagEnd = text.indexOf('>', openIndex);
        if (openTagEnd === -1 || openTagEnd > closeIndex) return null;

        return {
            blockStart: openIndex,           // 整个标签块的开始位置
            contentStart: openTagEnd + 1,    // 标签内容的开始位置
            contentEnd: closeIndex,          // 标签内容的结束位置
            blockEnd: closeIndex + closeTag.length  // 整个标签块的结束位置
        };
    }

    /**
     * 提取标签内的内容
     * @param {string} text - 要搜索的文本
     * @param {string} tagName - 标签名称
     * @returns {string|null} 标签内的内容，或 null
     */
    function extractContentByTag(text, tagName) {
        const indices = findLastTagIndices(text, tagName);
        if (!indices) return null;
        return text.substring(indices.contentStart, indices.contentEnd);
    }

    /**
     * 提取完整的标签块（包含标签本身）
     * @param {string} text - 要搜索的文本
     * @param {string} tagName - 标签名称
     * @returns {string|null} 完整的标签块，或 null
     */
    function extractFullTagBlock(text, tagName) {
        const indices = findLastTagIndices(text, tagName);
        if (!indices) return null;
        return text.substring(indices.blockStart, indices.blockEnd);
    }

    /**
     * 替换标签内的内容
     * @param {string} text - 原始文本
     * @param {string} tagName - 标签名称
     * @param {string} newContent - 新的内容
     * @returns {string} 替换后的文本
     */
    function replaceContentByTag(text, tagName, newContent) {
        const indices = findLastTagIndices(text, tagName);
        if (!indices) return text;

        const before = text.substring(0, indices.contentStart);
        const after = text.substring(indices.contentEnd);

        return before + newContent + after;
    }

    /**
     * 使用正则表达式提取标签内容（备用方法）
     * @param {string} text - 要搜索的文本
     * @param {string} tagName - 标签名称
     * @returns {string|null} 标签内的内容，或 null
     */
    function extractContentByTagRegex(text, tagName) {
        const regex = new RegExp(`<${tagName}[^>]*>([\\s\\S]*?)<\\/${tagName}>`, 'i');
        const match = text.match(regex);
        return match ? match[1] : null;
    }

    // 消息渲染完成后（用于手动触发按钮）
    function handleMessageRendered(messageId) {
        // 仅用于添加手动触发按钮
        const config = getConfig();
        if (config.enabled && config.manualTrigger) {
            const messageElement = document.querySelector(`#chat .mes[mesid="${messageId}"]`);
            if (messageElement && !messageElement.classList.contains('mes_user')) {
                addOptimizeButton(messageElement);
            }
        }
    }

    // 生成结束事件处理 - 用于清理状态
    async function handleGenerationEnded(messageId) {
        const config = getConfig();

        if (!config.enabled || !config.autoIntercept) {
            return;
        }

        // 重置拦截状态
        state.intercepting = false;

        // 更新悬浮球状态
        updateFabProcessingState(false);

        // 注意：保存聊天已在 updateMessageDom 中完成，这里不再重复保存
        Logger.log(`[正文优化] 生成结束，消息 ${messageId}`);
    }

    // ==================== 差异对比功能 ====================

    /**
     * 生成差异对比HTML - 绿红相间的 inline diff
     * 绿色背景 + 删除线 = 被删除的原文
     * 红色背景 = 新增的替换文本
     */
    function generateDiffHtml(original, optimized) {
        // 处理边界情况
        if (!original && !optimized) return '';

        if (!original) {
            // 全部是新增
            const escapedText = escapeHtml(optimized).replace(/\n/g, '<br>');
            return `<div class="wbap-diff-container wbap-diff-inline"><span class="wbap-diff-ins">${escapedText}</span></div>`;
        }

        if (!optimized) {
            // 全部是删除
            const escapedText = escapeHtml(original).replace(/\n/g, '<br>');
            return `<div class="wbap-diff-container wbap-diff-inline"><span class="wbap-diff-del">${escapedText}</span></div>`;
        }

        // 使用词级别的 diff 算法
        const diff = computeWordDiff(original, optimized);

        let html = '<div class="wbap-diff-container wbap-diff-inline">';

        diff.forEach(item => {
            const escapedText = escapeHtml(item.text).replace(/\n/g, '<br>');
            if (item.type === 'delete') {
                // 被删除的原文 - 绿色背景 + 删除线
                html += `<span class="wbap-diff-del">${escapedText}</span>`;
            } else if (item.type === 'insert') {
                // 新增的文本 - 红色背景
                html += `<span class="wbap-diff-ins">${escapedText}</span>`;
            } else {
                // 未变化的文本
                html += `<span class="wbap-diff-same">${escapedText}</span>`;
            }
        });

        html += '</div>';
        return html;
    }

    /**
     * 计算词级差异（更人性化的 diff）
     * 按词/标点分割，然后使用 LCS 算法
     */
    function computeWordDiff(original, optimized) {
        // 按词/标点/换行分割
        const tokenize = (text) => {
            const tokens = [];
            let current = '';
            for (const char of text) {
                // 中文字符、中英文标点、空格、换行都作为分隔点
                if (/[\u4e00-\u9fff]/.test(char) ||
                    /[，。！？、；：""''（）【】《》\s\n]/.test(char) ||
                    /[.,!?;:'"()\[\]{}<>]/.test(char)) {
                    if (current) {
                        tokens.push(current);
                        current = '';
                    }
                    tokens.push(char);
                } else if (/[a-zA-Z0-9]/.test(char)) {
                    current += char;
                } else {
                    if (current) {
                        tokens.push(current);
                        current = '';
                    }
                    tokens.push(char);
                }
            }
            if (current) tokens.push(current);
            return tokens;
        };

        const originalTokens = tokenize(original);
        const optimizedTokens = tokenize(optimized);

        // 使用 LCS 算法
        const m = originalTokens.length;
        const n = optimizedTokens.length;

        // 构建 LCS 表
        const dp = Array(m + 1).fill(null).map(() => Array(n + 1).fill(0));

        for (let i = 1; i <= m; i++) {
            for (let j = 1; j <= n; j++) {
                if (originalTokens[i - 1] === optimizedTokens[j - 1]) {
                    dp[i][j] = dp[i - 1][j - 1] + 1;
                } else {
                    dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
                }
            }
        }

        // 回溯生成差异 - 由于使用 unshift，优先插入会让删除最终显示在前面
        let i = m, j = n;
        const diffItems = [];

        while (i > 0 || j > 0) {
            if (i > 0 && j > 0 && originalTokens[i - 1] === optimizedTokens[j - 1]) {
                diffItems.unshift({ type: 'unchanged', text: originalTokens[i - 1] });
                i--;
                j--;
            } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
                // 优先处理插入，由于 unshift，删除会最终显示在插入之前
                diffItems.unshift({ type: 'insert', text: optimizedTokens[j - 1] });
                j--;
            } else if (i > 0) {
                // 后处理删除，由于 unshift，会被放在前面
                diffItems.unshift({ type: 'delete', text: originalTokens[i - 1] });
                i--;
            }
        }

        // 合并相邻的相同类型项
        const merged = [];
        for (const item of diffItems) {
            if (merged.length > 0 && merged[merged.length - 1].type === item.type) {
                merged[merged.length - 1].text += item.text;
            } else {
                merged.push({ ...item });
            }
        }

        return merged;
    }

    /**
     * 实时处理节流函数
     * 同时显示原始内容和优化模型的实时返回
     */
    let realtimeProcessTimer = null;
    function throttledRealtimeProcess() {
        if (realtimeProcessTimer) return;

        realtimeProcessTimer = setTimeout(async () => {
            realtimeProcessTimer = null;

            const config = getConfig();

            // 检查是否有内容需要显示（原始内容或优化内容）
            const hasOriginal = state.streamInterceptBuffer && state.streamInterceptBuffer.length > 0;
            const hasOptimized = state.streamOptimizedBuffer && state.streamOptimizedBuffer.length > 0;

            if (!hasOriginal && !hasOptimized) return;

            try {
                // 更新快照
                state.assistant.streamingSnapshot.original = state.streamInterceptBuffer;
                state.assistant.streamingSnapshot.optimized = state.streamOptimizedBuffer;
                state.assistant.streamingSnapshot.timestamp = Date.now();

                // 如果面板打开且处于流式状态，更新显示
                if (state.assistant.isOpen && state.assistant.panelState === PANEL_STATE.STREAMING) {
                    renderPanelContent();
                }

                // 如果差异面板打开，实时更新差异预览
                if (state.assistant.elements.diffPanel?.classList.contains('visible') && hasOriginal && hasOptimized) {
                    const partialDiff = generateDiffHtml(
                        state.streamInterceptBuffer,
                        state.streamOptimizedBuffer
                    );
                    updateDiffPreview(partialDiff);
                }
            } catch (e) {
                Logger.warn('[正文优化] 实时处理失败', e);
            }
        }, 80); // 80ms 节流，更快的更新频率
    }

    /**
     * 更新差异预览面板
     */
    function updateDiffPreview(diffHtml) {
        const diffContainer = state.assistant.elements.diffContainer;
        if (diffContainer) {
            diffContainer.innerHTML = diffHtml;
            diffContainer.scrollTop = diffContainer.scrollHeight;
        }
    }

    // ==================== 核心优化逻辑 ====================

    async function processMessageOptimization(messageId, content, options = {}) {
        const config = getConfig();
        const apiConfig = getApiConfig();
        const isInterceptMode = options.interceptMode === true;

        // 检查是否正在处理
        if (state.processing.has(messageId)) {
            Logger.warn(`[正文优化] 消息 ${messageId} 正在处理中`);
            return content;
        }

        // 缓存原始内容
        state.messageCache.set(messageId, content);

        // 创建取消控制器
        const controller = new AbortController();
        state.processing.set(messageId, {
            controller,
            startTime: Date.now()
        });

        try {
            // 获取选中的提示词预设
            const preset = getSelectedPromptPreset();

            // 世界书参考（角色绑定）
            const effectiveTargetTag = config.targetTag || '';
            let shouldInjectWorldbook = options.injectWorldbook;
            if (shouldInjectWorldbook === undefined) {
                if (!effectiveTargetTag) {
                    shouldInjectWorldbook = true;
                } else {
                    const extracted = extractContentByTag(content, effectiveTargetTag);
                    shouldInjectWorldbook = !!(extracted && extracted.trim());
                }
            }
            const worldbookText = shouldInjectWorldbook
                ? await buildWorldbookReferenceText(config.worldBooks, config.assignedEntriesMap)
                : '';
            const worldbookNames = shouldInjectWorldbook && Array.isArray(config.worldBooks)
                ? config.worldBooks.join(', ')
                : '';

            // 构建提示词
            const systemPrompt = preset.systemPrompt || '';
            const userPrompt = buildUserPrompt(preset.promptTemplate, content, {
                targetTag: effectiveTargetTag,
                worldbook_content: worldbookText,
                worldbook_names: worldbookNames,
                variables: preset.variables || {}
            });

            // 显示进度（非拦截模式）
            if (config.showProgress && !isInterceptMode) {
                showOptimizingIndicator(messageId);
            }

            Logger.log(`[正文优化] 开始优化消息 ${messageId}，内容长度: ${content.length}，拦截模式: ${isInterceptMode}`);

            // 调用 LLM
            const optimizedContent = await WBAP.callAI(
                apiConfig.model,
                userPrompt,
                systemPrompt,
                {
                    ...apiConfig,
                    signal: controller.signal,
                    enableStreaming: !isInterceptMode && apiConfig.enableStreaming !== false,
                    onToken: isInterceptMode ? null : options.onToken
                }
            );

            if (!optimizedContent || optimizedContent.trim().length === 0) {
                throw new Error('优化结果为空');
            }

            const trimmedResult = optimizedContent.trim();

            // 非拦截模式：更新消息内容
            if (!isInterceptMode) {
                await updateMessageContent(messageId, trimmedResult);
            }

            Logger.log(`[正文优化] 消息 ${messageId} 优化完成`);

            // 保存数据供助手面板使用
            state.assistant.currentMessageId = messageId;
            state.assistant.originalContent = content;
            state.assistant.optimizedContent = trimmedResult;
            state.assistant.diffHtml = generateDiffHtml(content, trimmedResult);

            // 显示成功提示
            if (window.toastr) {
                toastr.success('正文优化完成，点击消息旁的魔杖按钮查看差异', '笔者之脑');
            }

            return trimmedResult;

        } catch (err) {
            if (err.name === 'AbortError' || err.message?.includes('abort')) {
                Logger.log(`[正文优化] 消息 ${messageId} 优化已取消`);
                if (window.toastr) {
                    toastr.info('正文优化已取消', '笔者之脑');
                }
            } else {
                Logger.error(`[正文优化] 消息 ${messageId} 优化失败:`, err);
                if (window.toastr) {
                    toastr.error(`正文优化失败: ${err.message}`, '笔者之脑');
                }
            }

            // 返回原始内容
            return content;
        } finally {
            state.processing.delete(messageId);
            state.messageCache.delete(messageId);
            if (!isInterceptMode) {
                hideOptimizingIndicator(messageId);
            }
        }
    }

    function shouldOptimize(content, config) {
        if (!content || typeof content !== 'string') return false;

        // 长度检查
        if (content.length < (config.minContentLength || 50)) return false;

        // 排除模式检查
        const excludePatterns = config.excludePatterns || [];
        for (const pattern of excludePatterns) {
            try {
                if (new RegExp(pattern, 'i').test(content)) return false;
            } catch (e) {
                Logger.warn('[正文优化] 无效的排除模式:', pattern);
            }
        }

        // 检查是否已包含优化标记
        if (content.includes('<!-- wbap-resp-optimized -->')) return false;

        // 检查是否是系统消息或特殊格式
        if (content.startsWith('[') && content.endsWith(']')) return false;

        return true;
    }

    function buildUserPrompt(template, content, options = {}) {
        let prompt = template || '请优化以下内容：\n\n{content}';
        prompt = prompt.replace(/{content}/g, content);
        prompt = prompt.replace(/{context}/g, options.context || '');

        // 处理目标标签
        const targetTag = options.targetTag || '';
        prompt = prompt.replace(/{targetTag}/g, targetTag);

        // 世界书参考（可选）
        prompt = prompt.replace(/{worldbook_content}/g, options.worldbook_content || '');
        prompt = prompt.replace(/{worldbook_names}/g, options.worldbook_names || '');

        // 如果使用标签模式，添加标签包裹提示
        if (targetTag) {
            // 检查模板中是否已经包含标签相关指令
            if (!prompt.includes(targetTag) && !prompt.includes('{targetTag}')) {
                prompt += `\n\n请将优化后的内容用 <${targetTag}> 标签包裹返回。`;
            }
        }

        // 处理自定义变量
        const variables = options.variables || {};
        for (let i = 1; i <= 4; i++) {
            const key = `sulv${i}`;
            prompt = prompt.replace(new RegExp(`\\{${key}\\}`, 'g'), variables[key] || '');
        }

        // 若用户选择了世界书，但模板未显式包含 {worldbook_content}，则自动追加参考块
        if (options.worldbook_content && typeof options.worldbook_content === 'string' && options.worldbook_content.trim()) {
            const templateStr = String(template || '');
            if (!templateStr.includes('{worldbook_content}')) {
                prompt += `\n\n【世界书参考】\n${options.worldbook_content}\n\n要求：仅作为用词/设定参考，不要新增或篡改事实。`;
            }
        }

        return prompt;
    }

    async function buildWorldbookReferenceText(worldBooks, assignedEntriesMap) {
        const names = Array.isArray(worldBooks) ? Array.from(new Set(worldBooks.filter(Boolean))) : [];
        // 【修改】移除字符上限检查，只检查是否有世界书
        if (names.length === 0) return '';
        if (!WBAP.loadWorldBookEntriesByName) return '';
        const entriesMap = assignedEntriesMap && typeof assignedEntriesMap === 'object' ? assignedEntriesMap : {};

        let output = '';

        for (const name of names) {
            try {
                const book = await WBAP.loadWorldBookEntriesByName(name);
                const rawEntries = book?.entries || {};
                const enabledPairs = Object.entries(rawEntries).filter(([, e]) => e && e.disable !== true);
                if (enabledPairs.length === 0) continue;

                // 【修复】获取选中的条目 ID，统一转为字符串进行比较
                const selectedIds = Array.isArray(entriesMap?.[name]) ? entriesMap[name].map(String) : null;

                // 【修复】如果 selectedIds 是空数组，说明用户明确没有选择任何条目，跳过该世界书
                // 如果 selectedIds 是 null（未配置），则使用所有启用的条目
                let filteredPairs;
                if (selectedIds === null) {
                    // 未配置条目选择，使用所有启用的条目
                    filteredPairs = enabledPairs;
                } else if (selectedIds.length === 0) {
                    // 明确配置为空数组，跳过该世界书
                    continue;
                } else {
                    // 有选中的条目，过滤出选中的条目（统一转为字符串比较）
                    filteredPairs = enabledPairs.filter(([uid]) => selectedIds.includes(String(uid)));
                }

                if (filteredPairs.length === 0) continue;

                const header = `[世界书：${name}]\n`;
                output += header;

                for (const [, entry] of filteredPairs) {
                    const title = entry.comment || (Array.isArray(entry.key) ? entry.key.join(', ') : (entry.key || entry.uid || '未命名条目'));
                    const body = entry.content || '';
                    const block = `【${title}】\n${body}\n\n`;
                    output += block;
                }
                output += '\n';
            } catch (e) {
                Logger.warn('[正文优化] 加载世界书失败:', name, e);
            }
        }

        return output.trim();
    }

    async function updateMessageContent(messageId, newContent) {
        try {
            const context = SillyTavern.getContext();
            const message = context.chat[messageId];

            if (!message) {
                Logger.warn(`[正文优化] 消息 ${messageId} 不存在`);
                return;
            }

            // 1. 更新消息对象
            message.mes = newContent;

            // 如果有 swipes，也更新当前 swipe
            if (message.swipes && message.swipe_id !== undefined) {
                message.swipes[message.swipe_id] = newContent;
            }

            // 2. 保存聊天（先保存，确保数据持久化）
            if (context.saveChatConditional) {
                await context.saveChatConditional();
            }

            // 3. 更新 DOM（参考 Amily 的实现，使用 jQuery 的 empty().append()）
            const $mesElement = $(`#chat .mes[mesid="${messageId}"] .mes_text`);
            if ($mesElement.length) {
                // 使用 SillyTavern 的消息格式化
                const formatted = context.messageFormatting
                    ? context.messageFormatting(newContent, message.name, message.is_system, message.is_user, messageId)
                    : newContent;

                // 使用 jQuery 的 empty().append() 方法，与 Amily 保持一致
                $mesElement.empty().append(formatted);

                // 4. 触发消息渲染完成事件，通知 ST 消息已更新
                const { eventSource, event_types } = context;
                if (eventSource && event_types) {
                    const eventType = message.is_user
                        ? event_types.USER_MESSAGE_RENDERED
                        : event_types.CHARACTER_MESSAGE_RENDERED;
                    await eventSource.emit(eventType, messageId);
                    Logger.log(`[正文优化] 已触发 ${message.is_user ? 'USER' : 'CHARACTER'}_MESSAGE_RENDERED 事件`);
                }
            }

            Logger.log(`[正文优化] 消息 ${messageId} 内容已更新`);
        } catch (e) {
            Logger.error('[正文优化] 更新消息内容失败', e);
        }
    }

    // ==================== 实时流式优化 ====================

    function throttledRealtimeOptimize(messageId) {
        const config = getConfig();
        if (config.streamingMode !== 'realtime') return;

        // 清除之前的定时器
        if (state.realtimeThrottleTimers.has(messageId)) {
            clearTimeout(state.realtimeThrottleTimers.get(messageId));
        }

        // 设置新的定时器
        const timer = setTimeout(async () => {
            const buffer = state.streamBuffer.get(messageId);
            if (!buffer || buffer.length < 100) return;

            // 实时优化逻辑（分段优化）
            // 这里可以实现增量优化
        }, 500);

        state.realtimeThrottleTimers.set(messageId, timer);
    }

    async function finalizeRealtimeOptimization(messageId, content) {
        if (!content || content.length < 50) {
            Logger.log('[正文优化] 实时模式内容太短，跳过优化');
            return;
        }

        try {
            Logger.log(`[正文优化] 实时模式完成，开始最终优化处理，内容长度: ${content.length}`);

            // 保存原始内容
            state.assistant.originalContent = content;
            state.assistant.currentMessageId = messageId;

            // 执行优化
            const optimizedContent = await processMessageOptimization(messageId, content, {
                interceptMode: true,
                isRealtime: true
            });

            if (optimizedContent && optimizedContent !== content) {
                // 更新消息内容
                const context = SillyTavern.getContext();
                const message = context.chat[messageId];
                if (message) {
                    message.mes = optimizedContent;
                    if (message.swipes && message.swipe_id !== undefined) {
                        message.swipes[message.swipe_id] = optimizedContent;
                    }

                    // 更新 DOM
                    const messageElement = document.querySelector(`#chat .mes[mesid="${messageId}"] .mes_text`);
                    if (messageElement) {
                        if (context.messageFormatting) {
                            const formatted = context.messageFormatting(optimizedContent, message.name, message.is_system, message.is_user, messageId);
                            messageElement.innerHTML = formatted || optimizedContent;
                        } else {
                            messageElement.innerHTML = optimizedContent;
                        }
                    }

                    // 保存聊天
                    if (context.saveChatConditional) {
                        await context.saveChatConditional();
                    }
                }

                // 保存优化后内容并生成差异
                state.assistant.optimizedContent = optimizedContent;
                state.assistant.diffHtml = generateDiffHtml(content, optimizedContent);

                // 保存流式快照
                state.assistant.streamingSnapshot = {
                    original: content,
                    optimized: optimizedContent,
                    timestamp: Date.now()
                };

                // 切换面板状态为完成
                state.assistant.panelState = PANEL_STATE.COMPLETED;

                // 更新助手面板显示完成状态
                if (state.assistant.isOpen) {
                    renderPanelContent();
                }

                Logger.log(`[正文优化] 实时模式优化完成`);
            }

        } catch (e) {
            Logger.error('[正文优化] 实时模式最终处理失败', e);
            if (window.toastr) {
                toastr.error(`实时优化失败: ${e.message || '未知错误'}`, '笔者之脑');
            }
        } finally {
            // 清空缓冲区
            state.streamInterceptBuffer = '';
            state.streamOptimizedBuffer = '';
        }
    }

    // ==================== 手动触发 ====================

    async function manualOptimize(messageId) {
        try {
            const context = SillyTavern.getContext();
            const message = context.chat[messageId];
            const config = getConfig();
            const isRealtimeMode = config.streamingMode === 'realtime';

            // 【BUG修复】检查是否有有效的提示词预设
            const pools = getGlobalPools();
            const presets = pools.prompts?.responseOptimizer;
            if (!Array.isArray(presets) || presets.length === 0) {
                Logger.warn('[正文优化] 未配置提示词预设');
                if (window.toastr) {
                    toastr.error('请先配置正文优化提示词', '正文优化');
                }
                return;
            }
            const selectedPreset = presets[config.selectedPromptIndex || 0] || presets[0];
            if (!selectedPreset || !selectedPreset.systemPrompt || !selectedPreset.promptTemplate) {
                Logger.warn('[正文优化] 选中的提示词预设无效');
                if (window.toastr) {
                    toastr.error('选中的提示词预设无效，请检查配置', '正文优化');
                }
                return;
            }

            if (!message) {
                Logger.warn(`[正文优化] 消息 ${messageId} 不存在`);
                if (window.toastr) {
                    toastr.error('消息不存在', '正文优化');
                }
                return;
            }

            if (message.is_user) {
                if (window.toastr) {
                    toastr.warning('只能优化 AI 消息', '正文优化');
                }
                return;
            }

            const content = message.mes || '';
            if (!content || content.length < 10) {
                if (window.toastr) {
                    toastr.warning('消息内容太短，无需优化', '正文优化');
                }
                return;
            }

            // 【关键】新的手动优化开始时，彻底清空所有助手状态
            clearAssistantState();
            
            // 设置当前消息ID和原始内容（clearAssistantState会清空这些，所以要重新设置）
            state.assistant.currentMessageId = messageId;
            state.assistant.originalContent = content;

            // 清空流式缓冲区
            state.streamOptimizedBuffer = '';

            // 如果是实时模式，打开面板并设置流式状态
            if (isRealtimeMode) {
                state.assistant.panelState = PANEL_STATE.STREAMING;
                state.assistant.streamingSnapshot = {
                    original: content,
                    optimized: '',
                    timestamp: Date.now()
                };

                injectAssistantPanel();
                const panel = state.assistant.elements.panel;
                if (panel) {
                    panel.classList.add('open');
                    panel.classList.remove('wbap-hidden');
                    state.assistant.isOpen = true;
                    renderPanelContent();
                }

                // 更新悬浮球状态为处理中
                updateFabProcessingState(true);
            }

            // 执行优化，实时模式传递 onToken 回调
            await processMessageOptimization(messageId, content, {
                onToken: isRealtimeMode ? (token) => {
                    // 实时更新优化缓冲区
                    state.streamOptimizedBuffer += token;
                    state.assistant.streamingSnapshot.optimized = state.streamOptimizedBuffer;
                    state.assistant.streamingSnapshot.timestamp = Date.now();
                    // 触发实时显示更新
                    throttledRealtimeProcess();
                } : null
            });

            // 优化完成后，设置面板状态为完成
            state.assistant.panelState = PANEL_STATE.COMPLETED;

            // 更新悬浮球状态
            updateFabProcessingState(false);

            // 如果面板打开，更新显示
            if (state.assistant.isOpen) {
                renderPanelContent();
            }

        } catch (e) {
            Logger.error('[正文优化] 手动优化失败', e);
            updateFabProcessingState(false);
        }
    }

    function cancelOptimization(messageId) {
        const processing = state.processing.get(messageId);
        if (processing?.controller) {
            processing.controller.abort();
            Logger.log(`[正文优化] 已取消消息 ${messageId} 的优化`);
            // 【BUG修复】立即清理状态，不等待 executeOptimization 的 finally 块
            state.processing.delete(messageId);
            state.messageCache.delete(messageId);
        }
    }

    // ==================== UI 相关 ====================

    function showOptimizingIndicator(messageId) {
        const messageElement = document.querySelector(`#chat .mes[mesid="${messageId}"]`);
        if (!messageElement) return;

        // 检查是否已存在指示器
        if (messageElement.querySelector('.wbap-resp-opt-indicator')) return;

        const indicator = document.createElement('div');
        indicator.className = 'wbap-resp-opt-indicator';
        indicator.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> 正在优化...';
        indicator.style.cssText = 'position: absolute; top: 5px; right: 5px; background: var(--SmartThemeBlurTintColor, rgba(0,0,0,0.7)); color: var(--SmartThemeBodyColor, #fff); padding: 4px 8px; border-radius: 4px; font-size: 12px; z-index: 10;';

        messageElement.style.position = 'relative';
        messageElement.appendChild(indicator);
    }

    function hideOptimizingIndicator(messageId) {
        const messageElement = document.querySelector(`#chat .mes[mesid="${messageId}"]`);
        if (!messageElement) return;

        const indicator = messageElement.querySelector('.wbap-resp-opt-indicator');
        if (indicator) {
            indicator.remove();
        }
    }

    function injectMessageButtons() {
        // 使用 MutationObserver 监听新消息
        const observer = new MutationObserver((mutations) => {
            mutations.forEach((mutation) => {
                mutation.addedNodes.forEach((node) => {
                    if (node.nodeType === 1 && node.classList?.contains('mes')) {
                        addOptimizeButton(node);
                    }
                });
            });
        });

        const chatContainer = document.getElementById('chat');
        if (chatContainer) {
            observer.observe(chatContainer, { childList: true });

            // 为现有消息添加按钮
            chatContainer.querySelectorAll('.mes:not(.mes_user)').forEach(addOptimizeButton);
        }
    }

    function addOptimizeButton(messageElement) {
        const config = getConfig();
        if (!config.enabled || !config.manualTrigger) return;

        // 检查是否是 AI 消息
        if (messageElement.classList.contains('mes_user')) return;

        // 检查是否已添加按钮
        if (messageElement.querySelector('.wbap-resp-opt-btn')) return;

        const messageId = messageElement.getAttribute('mesid');
        if (!messageId) return;

        // 创建按钮
        const btn = document.createElement('div');
        btn.className = 'wbap-resp-opt-btn mes_button';
        btn.title = '正文优化 / 查看差异';
        btn.innerHTML = '<i class="fa-solid fa-wand-magic-sparkles"></i>';
        btn.style.cssText = 'cursor: pointer; opacity: 0.7; transition: opacity 0.2s;';
        btn.addEventListener('mouseenter', () => btn.style.opacity = '1');
        btn.addEventListener('mouseleave', () => btn.style.opacity = '0.7');
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const msgId = parseInt(messageId, 10);

            // 如果当前消息已有优化数据，直接打开助手面板查看差异
            if (state.assistant.currentMessageId === msgId &&
                state.assistant.originalContent &&
                state.assistant.optimizedContent) {
                openAssistantPanel();
            } else {
                // 否则执行优化
                manualOptimize(msgId);
            }
        });

        // 插入到消息操作栏
        const extraButtons = messageElement.querySelector('.extraMesButtons');
        if (extraButtons) {
            extraButtons.appendChild(btn);
        }
    }

    function refreshMessageButtons() {
        const config = getConfig();
        const chatContainer = document.getElementById('chat');
        if (!chatContainer) return;

        if (config.enabled && config.manualTrigger) {
            // 添加按钮
            chatContainer.querySelectorAll('.mes:not(.mes_user)').forEach(addOptimizeButton);
        } else {
            // 移除按钮
            chatContainer.querySelectorAll('.wbap-resp-opt-btn').forEach(btn => btn.remove());
        }
    }

    // ==================== 初始化 ====================

    function initialize() {
        if (state.initialized) return;
        state.initialized = true;

        initializeEventHooks();
        injectMessageButtons();
        ensureFloatingButton(); // 添加悬浮球

        Logger.log('[正文优化] 模块已初始化');
    }

    // ==================== 悬浮球 ====================

    function ensureFloatingButton() {
        if (state.elements.fab) return;

        const btn = document.createElement('button');
        btn.id = 'wbap-resp-opt-fab';
        btn.className = 'wbap-resp-opt-fab';
        btn.title = '正文优化助手';
        btn.innerHTML = '<i class="fa-solid fa-wand-magic-sparkles"></i>';
        document.body.appendChild(btn);

        // 恢复位置
        const restorePosition = () => {
            const saved = localStorage.getItem('wbap_resp_opt_fab_position');
            if (saved) {
                try {
                    const pos = JSON.parse(saved);
                    btn.style.top = pos.top;
                    btn.style.left = pos.left;
                    btn.style.right = 'auto';
                    btn.style.bottom = 'auto';
                } catch (e) {
                    // 使用默认位置
                }
            }
            clampFabToViewport(btn);
        };

        // 拖拽支持（包含点击处理）
        if (WBAP.makeDraggable) {
            const onDragEnd = (pos) => {
                localStorage.setItem('wbap_resp_opt_fab_position', JSON.stringify(pos));
                clampFabToViewport(btn);
            };
            // makeDraggable 会处理点击和拖拽，避免重复绑定 click 事件
            WBAP.makeDraggable(btn, () => toggleAssistantPanel(), onDragEnd);
        } else {
            // 降级：如果 makeDraggable 不可用，使用普通点击事件
            btn.addEventListener('click', () => {
                toggleAssistantPanel();
            });
        }

        restorePosition();
        window.addEventListener('resize', () => clampFabToViewport(btn));
        state.elements.fab = btn;

        // 根据配置显示/隐藏
        updateFloatingButtonVisibility();
    }

    function clampFabToViewport(el) {
        if (!el) return;
        const rect = el.getBoundingClientRect();
        const margin = 14;
        const top = Math.max(margin, Math.min(rect.top, window.innerHeight - rect.height - margin));
        const left = Math.max(margin, Math.min(rect.left, window.innerWidth - rect.width - margin));
        el.style.top = `${top}px`;
        el.style.left = `${left}px`;
        el.style.right = 'auto';
        el.style.bottom = 'auto';
    }

    function updateFloatingButtonVisibility() {
        const fab = state.elements.fab;
        if (!fab) return;

        // 【关键修复】直接使用 getConfig() 函数，它已经处理了主页模式的逻辑
        // 检查 WBAP.mainConfig 是否已加载
        if (!WBAP.mainConfig) {
            Logger.log('[正文优化] mainConfig 未加载，稍后重试更新悬浮球');
            setTimeout(updateFloatingButtonVisibility, 500);
            return;
        }

        // 使用统一的 getConfig() 函数获取配置
        const config = getConfig();

        // 当正文优化启用、助手面板启用且悬浮球开关开启时显示悬浮球
        if (config.enabled && config.enableAssistant !== false && config.showFab !== false) {
            fab.classList.remove('wbap-hidden');
            Logger.log('[正文优化] 悬浮球已显示');
        } else {
            fab.classList.add('wbap-hidden');
            Logger.log('[正文优化] 悬浮球已隐藏');
        }
    }

    // 更新悬浮球状态（处理中显示动画）
    function updateFabProcessingState(isProcessing) {
        const fab = state.elements.fab;
        if (!fab) return;

        if (isProcessing) {
            fab.classList.add('wbap-processing');
            fab.title = '正在优化中...点击查看';
        } else {
            fab.classList.remove('wbap-processing');
            fab.title = '正文优化助手';
        }
    }

    // ==================== 助手面板 ====================

    function injectAssistantPanel() {
        if (state.assistant.panelInjected) return;

        const template = WBAP.UI_TEMPLATES?.RESP_OPT_ASSISTANT_PANEL_HTML;
        if (!template) {
            Logger.warn('[正文优化助手] 面板模板未找到');
            return;
        }

        const div = document.createElement('div');
        div.innerHTML = template;
        document.body.appendChild(div.firstElementChild);

        // 缓存 DOM 元素
        state.assistant.elements = {
            panel: document.getElementById('wbap-resp-opt-assistant'),
            chat: document.getElementById('wbap-roa-chat'),
            input: document.getElementById('wbap-roa-input'),
            sendBtn: document.getElementById('wbap-roa-send'),
            closeBtn: document.getElementById('wbap-roa-close'),
            // 差异对比相关
            diffToggle: document.getElementById('wbap-roa-diff-toggle'),
            diffPanel: document.getElementById('wbap-roa-diff-panel'),
            diffContainer: document.getElementById('wbap-roa-diff-container'),
            diffClose: document.getElementById('wbap-roa-diff-close'),
            // 原文相关
            originalToggle: document.getElementById('wbap-roa-original-toggle'),
            originalPanel: document.getElementById('wbap-roa-original-panel'),
            originalText: document.getElementById('wbap-roa-original-text'),
            originalClose: document.getElementById('wbap-roa-original-close'),
            // 其他
            memoryCount: document.getElementById('wbap-roa-memory-count'),
            clearMemory: document.getElementById('wbap-roa-clear-memory'),
            revertBtn: document.getElementById('wbap-roa-revert'),
            acceptBtn: document.getElementById('wbap-roa-accept')
        };

        bindAssistantPanelEvents();
        state.assistant.panelInjected = true;
        Logger.log('[正文优化助手] 面板已注入');
    }

    function bindAssistantPanelEvents() {
        const els = state.assistant.elements;

        // 关闭按钮
        els.closeBtn?.addEventListener('click', closeAssistantPanel);

        // 发送按钮
        els.sendBtn?.addEventListener('click', () => {
            const input = els.input?.value?.trim();
            if (input) {
                sendAssistantMessage(input);
                els.input.value = '';
            }
        });

        // 输入框回车发送
        els.input?.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                const input = els.input?.value?.trim();
                if (input) {
                    sendAssistantMessage(input);
                    els.input.value = '';
                }
            }
        });

        // 查看差异对比按钮
        els.diffToggle?.addEventListener('click', () => {
            // 检查是否有数据
            if (!state.assistant.originalContent || !state.assistant.optimizedContent) {
                if (window.toastr) {
                    toastr.info('暂无优化数据', '笔者之脑');
                }
                return;
            }

            if (els.diffPanel) {
                // 关闭原文面板
                els.originalPanel?.classList.remove('visible');
                // 切换差异面板
                const isVisible = els.diffPanel.classList.contains('visible');
                if (isVisible) {
                    els.diffPanel.classList.remove('visible');
                } else {
                    els.diffPanel.classList.add('visible');
                    // 渲染差异
                    if (state.assistant.diffHtml) {
                        els.diffContainer.innerHTML = state.assistant.diffHtml;
                    } else {
                        const diffHtml = generateDiffHtml(state.assistant.originalContent, state.assistant.optimizedContent);
                        state.assistant.diffHtml = diffHtml;
                        els.diffContainer.innerHTML = diffHtml;
                    }
                }
            }
        });

        // 关闭差异面板
        els.diffClose?.addEventListener('click', () => {
            els.diffPanel?.classList.remove('visible');
        });

        // 查看原文按钮
        els.originalToggle?.addEventListener('click', () => {
            // 检查是否有数据
            if (!state.assistant.originalContent) {
                if (window.toastr) {
                    toastr.info('暂无原文数据', '笔者之脑');
                }
                return;
            }

            if (els.originalPanel) {
                // 关闭差异面板
                els.diffPanel?.classList.remove('visible');
                // 切换原文面板
                const isVisible = els.originalPanel.classList.contains('visible');
                if (isVisible) {
                    els.originalPanel.classList.remove('visible');
                } else {
                    els.originalPanel.classList.add('visible');
                    els.originalText.value = state.assistant.originalContent;
                }
            }
        });

        // 关闭原文面板
        els.originalClose?.addEventListener('click', () => {
            els.originalPanel?.classList.remove('visible');
        });

        // 清空记忆
        els.clearMemory?.addEventListener('click', clearAssistantMemory);

        // 恢复原文
        els.revertBtn?.addEventListener('click', revertToOriginal);

        // 接受优化
        els.acceptBtn?.addEventListener('click', acceptOptimization);
    }

    function toggleAssistantPanel() {
        if (state.assistant.isOpen) {
            closeAssistantPanel();
        } else {
            openAssistantPanel();
        }
    }

    function openAssistantPanel() {
        const config = getConfig();

        // 检查是否启用助手面板
        if (config.enableAssistant === false) {
            Logger.warn('[正文优化助手] 助手面板已禁用');
            if (window.toastr) {
                toastr.info('优化助手面板已禁用，请在设置中启用', '笔者之脑');
            }
            return;
        }

        // 更新最大轮数配置
        const maxRounds = Number.isFinite(config.assistantMaxRounds) && config.assistantMaxRounds > 0
            ? config.assistantMaxRounds
            : 10;
        state.assistant.maxRounds = maxRounds;

        injectAssistantPanel();

        const panel = state.assistant.elements.panel;
        if (!panel) return;

        panel.classList.add('open');
        panel.classList.remove('wbap-hidden');
        state.assistant.isOpen = true;

        // 根据当前状态决定显示内容
        determinePanelState();
        renderPanelContent();
        updateMemoryCount();
        updatePanelButtons();

        Logger.log('[正文优化助手] 面板已打开');
    }

    /**
     * 智能判断面板应该处于什么状态
     */
    function determinePanelState() {
        const config = getConfig();
        
        // 如果正在处理优化，保持当前状态
        if (state.isProcessingOptimization || state.intercepting) {
            // 如果是实时模式且有缓冲区数据，显示流式状态
            if (config.streamingMode === 'realtime' && 
                (state.streamInterceptBuffer || state.streamOptimizedBuffer)) {
                state.assistant.panelState = PANEL_STATE.STREAMING;
                return;
            }
        }

        // 如果有对话历史，显示对话状态
        if (state.assistant.conversationHistory.length > 0) {
            state.assistant.panelState = PANEL_STATE.CHATTING;
            return;
        }

        // 如果有优化数据，显示完成状态
        if (state.assistant.originalContent && state.assistant.optimizedContent) {
            state.assistant.panelState = PANEL_STATE.COMPLETED;
            return;
        }

        // 默认显示空闲状态
        state.assistant.panelState = PANEL_STATE.IDLE;
    }

    /**
     * 统一的面板内容渲染函数
     * 根据 panelState 决定显示什么内容
     */
    function renderPanelContent() {
        const chat = state.assistant.elements.chat;
        if (!chat) return;

        switch (state.assistant.panelState) {
            case PANEL_STATE.STREAMING:
                renderStreamingContent();
                break;
            case PANEL_STATE.COMPLETED:
                renderCompletedContent();
                break;
            case PANEL_STATE.CHATTING:
                renderAssistantMessages();
                break;
            case PANEL_STATE.IDLE:
            default:
                renderIdleContent();
                break;
        }

        // 更新按钮状态
        updatePanelButtons();
    }

    /**
     * 渲染空闲状态（无优化数据）
     */
    function renderIdleContent() {
        const chat = state.assistant.elements.chat;
        if (!chat) return;

        chat.innerHTML = `
            <div class="wbap-roa-message wbap-roa-message-system">
                <div class="wbap-roa-message-content">
                    <p>👋 欢迎使用正文优化助手！</p>
                    <p>当前暂无优化数据。</p>
                    <p>当 AI 生成回复后，系统会自动进行优化处理。</p>
                    <p>您也可以点击消息旁的 <i class="fa-solid fa-wand-magic-sparkles"></i> 按钮手动触发优化。</p>
                </div>
            </div>
        `;
    }

    /**
     * 渲染流式内容（正在接收/优化时）
     */
    function renderStreamingContent() {
        const chat = state.assistant.elements.chat;
        if (!chat) return;

        const snapshot = state.assistant.streamingSnapshot;
        const hasOriginal = snapshot.original && snapshot.original.length > 0;
        const hasOptimized = snapshot.optimized && snapshot.optimized.length > 0;

        let html = `
            <div class="wbap-roa-message wbap-roa-message-system">
                <div class="wbap-roa-message-content">
                    <p><i class="fa-solid fa-spinner fa-spin"></i> 正在进行实时优化...</p>
                    <p>${hasOriginal || hasOptimized ? '实时内容将在下方显示' : '等待内容...'}</p>
                </div>
            </div>
            <div class="wbap-roa-stream-content">
        `;

        // 显示原始内容
        if (hasOriginal) {
            html += `
                <div class="wbap-roa-stream-section">
                    <div class="wbap-roa-stream-label">
                        <i class="fa-solid fa-file-lines"></i> 原始内容 (${snapshot.original.length} 字符)
                    </div>
                    <div class="wbap-roa-stream-text">${escapeHtml(snapshot.original)}</div>
                </div>
            `;
        }

        // 显示优化内容
        if (hasOptimized) {
            html += `
                <div class="wbap-roa-stream-section wbap-roa-stream-optimized">
                    <div class="wbap-roa-stream-label">
                        <i class="fa-solid fa-wand-magic-sparkles"></i> 优化中 (${snapshot.optimized.length} 字符)
                        <span class="wbap-roa-stream-status"><i class="fa-solid fa-spinner fa-spin"></i></span>
                    </div>
                    <div class="wbap-roa-stream-text">${escapeHtml(snapshot.optimized)}</div>
                </div>
            `;
        } else if (state.isProcessingOptimization && hasOriginal) {
            html += `
                <div class="wbap-roa-stream-section wbap-roa-stream-optimized">
                    <div class="wbap-roa-stream-label">
                        <i class="fa-solid fa-wand-magic-sparkles"></i> 优化中
                        <span class="wbap-roa-stream-status"><i class="fa-solid fa-spinner fa-spin"></i> 等待模型响应...</span>
                    </div>
                </div>
            `;
        }

        html += '</div>';
        chat.innerHTML = html;

        // 滚动到底部
        const streamContent = chat.querySelector('.wbap-roa-stream-content');
        if (streamContent) {
            streamContent.scrollTop = streamContent.scrollHeight;
        }
    }

    /**
     * 渲染完成状态（优化完成，可以对话）
     */
    function renderCompletedContent() {
        const chat = state.assistant.elements.chat;
        if (!chat) return;

        // 如果有对话历史，显示对话
        if (state.assistant.conversationHistory.length > 0) {
            renderAssistantMessages();
            return;
        }

        // 否则显示完成提示
        chat.innerHTML = `
            <div class="wbap-roa-message wbap-roa-message-system">
                <div class="wbap-roa-message-content">
                    <p><i class="fa-solid fa-check" style="color: #4ade80;"></i> 优化完成！</p>
                    <p>您可以询问模型为什么这样优化，或者提出修改建议。</p>
                    <p>点击右上角的 <i class="fa-solid fa-code-compare"></i> 按钮查看差异对比。</p>
                    <p>点击 <i class="fa-regular fa-file-lines"></i> 按钮可以查看优化前的原文。</p>
                </div>
            </div>
        `;
    }

    /**
     * 更新面板按钮状态（启用/禁用）
     */
    function updatePanelButtons() {
        const els = state.assistant.elements;
        if (!els) return;

        const hasData = state.assistant.originalContent && state.assistant.optimizedContent;
        const isProcessing = state.assistant.isProcessing;

        // 差异对比按钮
        if (els.diffToggle) {
            if (hasData) {
                els.diffToggle.disabled = false;
                els.diffToggle.style.opacity = '1';
                els.diffToggle.title = '查看差异对比';
            } else {
                els.diffToggle.disabled = true;
                els.diffToggle.style.opacity = '0.3';
                els.diffToggle.title = '暂无优化数据';
            }
        }

        // 原文按钮
        if (els.originalToggle) {
            if (hasData) {
                els.originalToggle.disabled = false;
                els.originalToggle.style.opacity = '1';
                els.originalToggle.title = '查看原文';
            } else {
                els.originalToggle.disabled = true;
                els.originalToggle.style.opacity = '0.3';
                els.originalToggle.title = '暂无原文数据';
            }
        }

        // 发送按钮和输入框
        if (els.sendBtn) {
            els.sendBtn.disabled = isProcessing || !hasData;
        }
        if (els.input) {
            els.input.disabled = isProcessing || !hasData;
            els.input.placeholder = hasData 
                ? '询问模型为什么这样优化...' 
                : '等待优化完成后可以对话...';
        }

        // 恢复原文按钮
        if (els.revertBtn) {
            els.revertBtn.disabled = !hasData || isProcessing;
        }

        // 接受优化按钮
        if (els.acceptBtn) {
            els.acceptBtn.disabled = !hasData || isProcessing;
        }

        // 清空记忆按钮
        if (els.clearMemory) {
            els.clearMemory.disabled = state.assistant.conversationHistory.length === 0;
        }
    }

    function closeAssistantPanel() {
        const panel = state.assistant.elements.panel;
        if (panel) {
            panel.classList.remove('open');
        }
        state.assistant.isOpen = false;

        // 隐藏原文面板和差异面板（使用 visible 类控制显示）
        state.assistant.elements.originalPanel?.classList.remove('visible');
        state.assistant.elements.diffPanel?.classList.remove('visible');

        Logger.log('[正文优化助手] 面板已关闭');
    }

    function renderAssistantMessages() {
        const chat = state.assistant.elements.chat;
        if (!chat) return;

        chat.innerHTML = '';

        // 如果没有对话历史，显示欢迎消息
        if (state.assistant.conversationHistory.length === 0) {
            // 根据是否有优化数据显示不同内容
            if (state.assistant.originalContent && state.assistant.optimizedContent) {
                renderCompletedContent();
            } else {
                renderIdleContent();
            }
            return;
        }

        // 渲染对话历史
        state.assistant.conversationHistory.forEach((msg) => {
            const msgDiv = document.createElement('div');
            msgDiv.className = `wbap-roa-message wbap-roa-message-${msg.role}`;
            msgDiv.innerHTML = `
                <div class="wbap-roa-message-content">${escapeHtml(msg.content)}</div>
            `;
            chat.appendChild(msgDiv);
        });

        // 滚动到底部
        chat.scrollTop = chat.scrollHeight;
    }

    function escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML.replace(/\n/g, '<br>');
    }

    async function sendAssistantMessage(userMessage) {
        if (state.assistant.isProcessing) {
            if (window.toastr) {
                toastr.warning('正在处理中，请稍候', '笔者之脑');
            }
            return;
        }

        // 检查是否有优化数据
        if (!state.assistant.originalContent || !state.assistant.optimizedContent) {
            if (window.toastr) {
                toastr.warning('暂无优化数据，无法对话', '笔者之脑');
            }
            return;
        }

        state.assistant.isProcessing = true;

        // 切换到对话状态
        state.assistant.panelState = PANEL_STATE.CHATTING;

        // 添加用户消息
        addToConversation('user', userMessage);
        renderAssistantMessages();

        // 显示加载状态
        const chat = state.assistant.elements.chat;
        const loadingDiv = document.createElement('div');
        loadingDiv.className = 'wbap-roa-message wbap-roa-message-loading';
        loadingDiv.innerHTML = '<div class="wbap-roa-message-content"><i class="fa-solid fa-spinner fa-spin"></i> 思考中...</div>';
        chat?.appendChild(loadingDiv);
        if (chat) chat.scrollTop = chat.scrollHeight;

        // 更新按钮状态
        updatePanelButtons();

        try {
            const apiConfig = getApiConfig();
            const ctx = state.assistant.optimizationContext;
            
            // 构建包含完整优化上下文的系统提示
            let systemPrompt = `你是正文优化助手。用户询问关于文本优化的问题。

【优化前原文】
${state.assistant.originalContent}

【优化后内容】
${state.assistant.optimizedContent}

【优化时使用的提示词预设】
预设名称：${ctx.presetName || '未知'}

【优化时的系统提示词】
${ctx.systemPromptUsed || '（无）'}

【优化时的用户提示词】
${ctx.userPromptUsed || '（无）'}`;

            // 如果有世界书内容，也加入上下文
            if (ctx.worldbookContent && ctx.worldbookContent.trim()) {
                systemPrompt += `

【优化时参考的世界书内容】
世界书名称：${ctx.worldbookNames || '未知'}
${ctx.worldbookContent}`;
            }

            systemPrompt += `

请根据以上完整的优化上下文，准确解释你的优化理由或回答用户的问题。
你必须基于上述提供的提示词和世界书内容来解释，不要编造不存在的理由。
回答要简洁明了。`;

            // 构建消息历史
            const messages = state.assistant.conversationHistory.map(msg => ({
                role: msg.role === 'user' ? 'user' : 'assistant',
                content: msg.content
            }));

            const response = await WBAP.callAI(
                apiConfig.model,
                userMessage,
                systemPrompt,
                {
                    ...apiConfig,
                    enableStreaming: false
                }
            );

            // 移除加载状态
            loadingDiv.remove();

            if (response) {
                addToConversation('assistant', response);
                renderAssistantMessages();
            }

        } catch (err) {
            loadingDiv.remove();
            Logger.error('[正文优化助手] 发送消息失败', err);
            if (window.toastr) {
                toastr.error(`发送失败: ${err.message}`, '笔者之脑');
            }
        } finally {
            state.assistant.isProcessing = false;
            updatePanelButtons();
        }
    }

    function addToConversation(role, content) {
        state.assistant.conversationHistory.push({ role, content });

        // 限制最大轮数（1轮 = 2条消息）
        const maxMessages = state.assistant.maxRounds * 2;
        if (state.assistant.conversationHistory.length > maxMessages) {
            // 移除最早的一轮（2条消息）
            state.assistant.conversationHistory.splice(0, 2);
        }

        updateMemoryCount();
    }

    function updateMemoryCount() {
        const countEl = state.assistant.elements.memoryCount;
        if (countEl) {
            const rounds = Math.floor(state.assistant.conversationHistory.length / 2);
            countEl.textContent = `记忆: ${rounds}/${state.assistant.maxRounds} 轮`;
        }
    }

    /**
     * 彻底清空助手状态（新优化开始时调用）
     * 清空所有记忆、对话历史、优化上下文，并重置面板显示
     */
    function clearAssistantState() {
        // 清空对话历史
        state.assistant.conversationHistory = [];
        
        // 清空优化数据
        state.assistant.originalContent = '';
        state.assistant.optimizedContent = '';
        state.assistant.diffHtml = '';
        state.assistant.currentMessageId = null;
        
        // 清空优化上下文记忆
        state.assistant.optimizationContext = {
            worldbookContent: '',
            systemPromptUsed: '',
            userPromptUsed: '',
            presetName: '',
            worldbookNames: '',
            timestamp: 0
        };
        
        // 清空流式快照
        state.assistant.streamingSnapshot = {
            original: '',
            optimized: '',
            timestamp: 0
        };
        
        // 重置面板状态
        state.assistant.panelState = PANEL_STATE.IDLE;
        state.assistant.isProcessing = false;
        
        // 更新面板显示（如果面板已打开）
        if (state.assistant.isOpen) {
            renderPanelContent();
        }
        
        // 更新记忆计数
        updateMemoryCount();
        
        Logger.log('[正文优化] 助手状态已彻底清空');
    }

    function clearAssistantMemory() {
        state.assistant.conversationHistory = [];
        
        // 切换回完成状态
        if (state.assistant.originalContent && state.assistant.optimizedContent) {
            state.assistant.panelState = PANEL_STATE.COMPLETED;
        } else {
            state.assistant.panelState = PANEL_STATE.IDLE;
        }
        
        updateMemoryCount();
        renderPanelContent();
        
        if (window.toastr) {
            toastr.success('记忆已清空', '笔者之脑');
        }
    }

    // 【BUG修复】改为 async 函数并 await updateMessageContent
    async function revertToOriginal() {
        if (!confirm('确定要恢复为优化前的原文吗？此操作不可撤销。')) {
            return;
        }

        const messageId = state.assistant.currentMessageId;
        const original = state.assistant.originalContent;

        if (messageId !== null && original) {
            try {
                await updateMessageContent(messageId, original);
                if (window.toastr) {
                    toastr.success('已恢复原文', '笔者之脑');
                }
            } catch (e) {
                Logger.error('[正文优化] 恢复原文失败:', e);
                if (window.toastr) {
                    toastr.error('恢复原文失败: ' + e.message, '笔者之脑');
                }
                return; // 失败时不关闭面板
            }
        }
        closeAssistantPanel();
    }

    function acceptOptimization() {
        if (window.toastr) {
            toastr.success('已接受优化', '笔者之脑');
        }
        closeAssistantPanel();
    }

    // ==================== 导出 API ====================

    window.WBAP.ResponseOptimizer = {
        initialize,
        processMessageOptimization,
        manualOptimize,
        cancelOptimization,
        getConfig,
        getApiConfig,
        getPromptPresets,
        getSelectedPromptPreset,
        refreshMessageButtons,
        // 差异对比 API
        generateDiffHtml,
        // 悬浮球 API
        updateFloatingButtonVisibility,
        // 助手面板 API
        toggleAssistantPanel,
        openAssistantPanel,
        closeAssistantPanel,
        clearAssistantMemory,
        renderPanelContent,
        updatePanelButtons,
        // 标签提取 API
        extractContentByTag,
        extractFullTagBlock,
        replaceContentByTag,
        // 面板状态枚举
        PANEL_STATE,
        // 内部状态（调试用）
        _state: state
    };

    // 延迟初始化，等待其他模块和配置加载完成
    // 注意：initPlugin() 会在配置加载完成后调用 updateFloatingButtonVisibility()
    // 这里的初始化主要是注册事件钩子和注入按钮
    function delayedInitialize() {
        // 检查 WBAP.config 是否已加载
        if (!WBAP.config && !WBAP.CharacterManager?.getCurrentCharacterConfig?.()) {
            // 配置未加载，继续等待
            Logger.log('[正文优化] 等待配置加载...');
            setTimeout(delayedInitialize, 500);
            return;
        }

        // 配置已加载，执行初始化
        initialize();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => {
            setTimeout(delayedInitialize, 1000);
        });
    } else {
        setTimeout(delayedInitialize, 1000);
    }

})();
