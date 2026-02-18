// modules/api.js

(function () {
    'use strict';

    // 确保全局命名空间存在
    window.WBAP = window.WBAP || {};
    const Logger = WBAP.Logger;

    // 【BUG修复】创建可清理的超时信号
    function createTimeoutSignal(ms) {
        if (typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function') {
            try {
                return AbortSignal.timeout(ms);
            } catch (e) {
                // 某些环境可能抛错，继续使用备用方案
            }
        }
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), ms);
        // 将 timeoutId 附加到 signal 上，以便调用方可以清理
        controller.signal._timeoutId = timeoutId;
        controller.signal._controller = controller;
        return controller.signal;
    }

    // 【BUG修复】清理超时信号
    function clearTimeoutSignal(signal) {
        if (signal && signal._timeoutId) {
            clearTimeout(signal._timeoutId);
            signal._timeoutId = null;
        }
    }

    function resolveApiChannel(apiConfig) {
        const raw = String(apiConfig?.apiChannel || apiConfig?.channel || '').toLowerCase();
        if (raw === 'st-backend' || raw === 'sillytavern' || raw === 'st') return 'st-backend';
        return 'direct';
    }

    function getApiProvider(apiConfig) {
        return apiConfig?.apiProvider || apiConfig?.provider || 'openai';
    }

    function getRequestHeadersSafe() {
        try {
            if (typeof SillyTavern !== 'undefined' && SillyTavern.getContext) {
                const ctx = SillyTavern.getContext();
                if (typeof ctx?.getRequestHeaders === 'function') {
                    return ctx.getRequestHeaders();
                }
            }
        } catch (e) {
            // ignore
        }
        if (typeof window !== 'undefined' && typeof window.getRequestHeaders === 'function') {
            try {
                return window.getRequestHeaders();
            } catch (e) {
                // ignore
            }
        }
        return {};
    }

    async function getAllWorldBookNames() {
        try {
            if (Array.isArray(window.world_names)) {
                Logger.log(`通过 window.world_names 获取到 ${window.world_names.length} 本世界书`);
                return [...window.world_names];
            }
            if (typeof SillyTavern !== 'undefined' && SillyTavern.getContext) {
                const context = SillyTavern.getContext();
                if (Array.isArray(context.worldNames)) {
                    Logger.log(`通过 context.worldNames 获取到 ${context.worldNames.length} 本世界书`);
                    return [...context.worldNames];
                }
            }
            const worldInfoSelect = document.getElementById('world_info');
            if (worldInfoSelect) {
                const options = worldInfoSelect.querySelectorAll('option');
                const names = [];
                options.forEach(opt => {
                    const name = opt.textContent?.trim();
                    // 过滤 None / none 等占位选项
                    const normalized = (name || '').toLowerCase().replace(/[\s]/g, '');
                    if (name && normalized !== '' && normalized !== 'none') {
                        names.push(name);
                    }
                });
                if (names.length > 0) {
                    Logger.log(`通过 DOM #world_info 获取到 ${names.length} 本世界书`);
                    return names;
                }
            }
            Logger.warn('无法获取世界书列表');
            return [];
        } catch (e) {
            Logger.error('获取世界书列表时发生错误:', e);
            return [];
        }
    }

    async function loadWorldBookEntriesByName(name) {
        try {
            if (typeof SillyTavern !== 'undefined' && SillyTavern.getContext) {
                const context = SillyTavern.getContext();
                if (context && context.loadWorldInfo) {
                    const book = await context.loadWorldInfo(name);
                    if (book) return book;
                }
            }
            const response = await fetch('/api/worldinfo/get', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name })
            });
            if (response.ok) {
                const data = await response.json();
                if (data && data.entries) return data;
            }
            throw new Error('无法通过 Context API 或 Fetch API 加载世界书条目');
        } catch (e) {
            Logger.error(`加载世界书条目 "${name}" 失败:`, e);
            return null;
        }
    }

    async function saveWorldBookEntriesByName(name, data, immediately = true) {
        try {
            if (!name || !data) throw new Error('缺少 worldbook name 或 data');

            if (typeof SillyTavern !== 'undefined' && SillyTavern.getContext) {
                const context = SillyTavern.getContext();
                if (context && typeof context.saveWorldInfo === 'function') {
                    await context.saveWorldInfo(name, data, immediately);
                    return { success: true };
                }
            }

            const response = await fetch('/api/worldinfo/edit', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name, data }),
            });

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }

            return { success: true };
        } catch (e) {
            Logger.error(`保存世界书 "${name}" 失败:`, e);
            return { success: false, reason: e.message };
        }
    }

    async function createWorldBook(name, config = {}) {
        try {
            if (!name || typeof name !== 'string' || !name.trim()) {
                return { success: false, reason: '世界书名称不能为空' };
            }

            const trimmedName = name.trim();

            // 动态导入 world-info.js 获取 createNewWorldInfo 等函数
            const worldInfoModule = await import('/scripts/world-info.js');
            const { createNewWorldInfo, world_names, updateWorldInfoList, loadWorldInfo, saveWorldInfo, worldInfoCache } = worldInfoModule;

            // 检查是否已存在
            if (Array.isArray(world_names) && world_names.includes(trimmedName)) {
                Logger.warn(`世界书 "${trimmedName}" 已存在`);
                return { success: false, reason: '世界书已存在' };
            }

            // 创建新世界书
            await createNewWorldInfo(trimmedName);

            // 如果提供了配置，应用到世界书
            if (config.scanDepth !== undefined || config.insertionOrder !== undefined || config.depth !== undefined) {
                // 等待一小段时间确保文件已写入
                await new Promise(resolve => setTimeout(resolve, 100));

                const bookData = await loadWorldInfo(trimmedName);
                if (bookData) {
                    // 设置全局默认值
                    if (config.scanDepth !== undefined) {
                        bookData.scanDepth = config.scanDepth;
                    }
                    if (config.insertionOrder !== undefined) {
                        bookData.insertionOrder = config.insertionOrder;
                    }
                    if (config.depth !== undefined) {
                        bookData.depth = config.depth;
                    }

                    // 强制保存，确保配置写入文件
                    await saveWorldInfo(trimmedName, bookData, true);

                    // 清除缓存，强制重新加载
                    if (worldInfoCache && typeof worldInfoCache.delete === 'function') {
                        worldInfoCache.delete(trimmedName);
                        Logger.log('已清除世界书缓存');
                    }

                    // 再次加载验证配置是否生效
                    const verifyData = await loadWorldInfo(trimmedName);
                    Logger.log(`已应用世界书配置: scanDepth=${config.scanDepth}, insertionOrder=${config.insertionOrder}, depth=${config.depth}`);
                    Logger.log(`验证配置: scanDepth=${verifyData?.scanDepth}, insertionOrder=${verifyData?.insertionOrder}, depth=${verifyData?.depth}`);
                } else {
                    Logger.error('无法加载刚创建的世界书，配置可能未生效');
                }
            }

            // 确保 world_names 列表更新
            if (Array.isArray(world_names) && !world_names.includes(trimmedName)) {
                world_names.push(trimmedName);
                world_names.sort();
            }

            // 刷新世界书列表
            if (typeof updateWorldInfoList === 'function') {
                await updateWorldInfoList();
            }

            // 如果世界书编辑器当前打开，强制重新加载以显示新配置
            try {
                const selectedWorldName = $('#world_editor_select').val();
                if (selectedWorldName && world_names[selectedWorldName] === trimmedName) {
                    // 当前选中的就是新创建的世界书，触发重新加载
                    $('#world_editor_select').trigger('change');
                    Logger.log('已触发世界书编辑器刷新');
                }
            } catch (e) {
                Logger.warn('刷新世界书编辑器失败:', e);
            }

            Logger.log(`成功创建世界书 "${trimmedName}"`);
            return { success: true, name: trimmedName };
        } catch (e) {
            Logger.error(`创建世界书 "${name}" 失败:`, e);
            return { success: false, reason: e.message };
        }
    }

    async function createWorldBookEntry(bookName, entryData = {}) {
        try {
            if (!bookName) {
                return { success: false, reason: '世界书名称不能为空' };
            }

            // 动态导入 world-info.js
            const worldInfoModule = await import('/scripts/world-info.js');
            const { loadWorldInfo, createWorldInfoEntry, saveWorldInfo } = worldInfoModule;

            // 加载世界书
            let bookData = await loadWorldInfo(bookName);
            if (!bookData || !bookData.entries) {
                return { success: false, reason: `世界书 "${bookName}" 不存在或无法加载` };
            }

            // 创建新条目
            const newEntry = createWorldInfoEntry(bookName, bookData);
            if (!newEntry) {
                return { success: false, reason: '创建条目失败' };
            }

            // 填充条目数据
            if (entryData.comment !== undefined) newEntry.comment = entryData.comment;
            if (entryData.content !== undefined) newEntry.content = entryData.content;
            if (entryData.key !== undefined) {
                newEntry.key = Array.isArray(entryData.key) ? entryData.key : [entryData.key];
            }
            if (entryData.keysecondary !== undefined) {
                newEntry.keysecondary = Array.isArray(entryData.keysecondary) ? entryData.keysecondary : [entryData.keysecondary];
            }
            if (entryData.disable !== undefined) newEntry.disable = !!entryData.disable;

            // 根据世界书的 scanDepth 配置设置条目的 constant 字段
            // scanDepth: 0 = 绿灯（关键词触发），1 = 蓝灯（始终激活）
            if (bookData.scanDepth !== undefined) {
                newEntry.constant = bookData.scanDepth === 1;
                Logger.log(`根据世界书配置设置条目激活模式: ${newEntry.constant ? '蓝灯（始终激活）' : '绿灯（关键词触发）'}`);
            }

            // 如果 entryData 明确指定了 constant，则覆盖默认值
            if (entryData.constant !== undefined) {
                newEntry.constant = !!entryData.constant;
            }

            // 保存世界书
            await saveWorldInfo(bookName, bookData, true);

            Logger.log(`成功在世界书 "${bookName}" 中创建条目 (uid: ${newEntry.uid})`);
            return { success: true, uid: newEntry.uid, entry: newEntry };
        } catch (e) {
            Logger.error(`在世界书 "${bookName}" 中创建条目失败:`, e);
            return { success: false, reason: e.message };
        }
    }

    function getFreeWorldEntryUid(entries) {
        const used = new Set();
        Object.values(entries || {}).forEach((e) => {
            const uid = Number(e?.uid);
            if (Number.isFinite(uid) && uid >= 0) used.add(uid);
        });
        let uid = 0;
        while (used.has(uid)) uid += 1;
        return uid;
    }

    function cloneObject(obj) {
        if (!obj) return obj;
        try {
            if (typeof structuredClone === 'function') return structuredClone(obj);
        } catch (e) {}
        return JSON.parse(JSON.stringify(obj));
    }

    function normalizeKeyList(key) {
        if (!key) return [];
        if (Array.isArray(key)) return key.map(String).map(s => s.trim()).filter(Boolean);
        return String(key)
            .split(/[,，、;\s]+/)
            .map(s => s.trim())
            .filter(Boolean);
    }

    async function upsertWorldBookEntry(bookName, entryPatch, options = {}) {
        const {
            mode = 'append', // 'append' | 'upsert'
            immediately = true,
        } = options;

        try {
            if (!bookName) throw new Error('缺少 worldbook name');
            if (!entryPatch || typeof entryPatch !== 'object') throw new Error('缺少 entryPatch');

            const book = await loadWorldBookEntriesByName(bookName);
            if (!book || !book.entries) throw new Error('世界书不存在或无 entries');

            const entries = book.entries;
            const patchUid = entryPatch.uid;
            const hasUid = Number.isFinite(Number(patchUid));
            const uid = (mode === 'upsert' && hasUid && entries[String(patchUid)]) ? Number(patchUid) : getFreeWorldEntryUid(entries);

            let baseEntry = Object.values(entries)[0];
            if (!baseEntry) {
                // 极简兜底：空世界书也能写入（字段不足时 ST 可能在 UI 上表现异常）
                baseEntry = { uid: 0, key: [], keysecondary: [], comment: '', content: '', disable: false };
            }

            const newEntry = cloneObject(baseEntry);
            newEntry.uid = uid;
            newEntry.comment = entryPatch.comment ?? newEntry.comment ?? '';
            newEntry.content = entryPatch.content ?? newEntry.content ?? '';

            // ST 世界书 entry.key 常见为数组；本插件内部也允许字符串
            const keys = normalizeKeyList(entryPatch.key);
            if (Array.isArray(newEntry.key)) newEntry.key = keys;
            else newEntry.key = keys;

            // 可选：secondary key
            if (entryPatch.keysecondary !== undefined) {
                const secondary = normalizeKeyList(entryPatch.keysecondary);
                if (Array.isArray(newEntry.keysecondary)) newEntry.keysecondary = secondary;
                else newEntry.keysecondary = secondary;
            }

            // 强制启用（避免写入后被禁用导致“看似没生效”）
            if (entryPatch.disable !== undefined) newEntry.disable = !!entryPatch.disable;
            else if (newEntry.disable === undefined) newEntry.disable = false;

            // 写入 entries（键通常是字符串）
            entries[String(uid)] = newEntry;

            const saveResult = await saveWorldBookEntriesByName(bookName, book, immediately);
            if (!saveResult.success) return saveResult;

            return { success: true, uid };
        } catch (e) {
            Logger.error(`[Worldbook] upsert entry failed (${bookName}):`, e);
            return { success: false, reason: e.message };
        }
    }

    async function loadWorldBookByName(name) {
        try {
            const book = await WBAP.loadWorldBookEntriesByName(name);
            if (book && book.entries) {
                let fullContent = '';
                for (const entry of Object.values(book.entries)) {
                    if (entry.disable !== true) {
                        fullContent += entry.content + '\n\n';
                    }
                }
                return { name: name, content: fullContent.trim() };
            }
            return null;
        } catch (e) {
            Logger.error(`加载世界书 "${name}" 失败:`, e);
            return null;
        }
    }

    // 辅助函数：解析 API 错误
    async function parseApiError(response) {
        // 【BUG修复】先检查 content-type，避免对 HTML 错误页面进行 JSON 解析
        const contentType = response.headers.get('content-type') || '';
        const text = await response.text();
        
        // 只有当 content-type 包含 json 时才尝试 JSON 解析
        if (contentType.includes('json')) {
            try {
                const json = JSON.parse(text);
                if (json.error && json.error.message) {
                    return json.error.message; // OpenAI 格式
                }
                if (json.message) {
                    return json.message; // 通用格式
                }
            } catch (e) {
                // JSON 解析失败，返回原始文本
            }
        }
        
        // 返回截断的文本（可能是 HTML 错误页面）
        return text.slice(0, 100) + (text.length > 100 ? '...' : '');
    }

    const inFlightRequests = new Map();

    function getEndpointKey(apiConfig, apiUrl, modelName) {
        return apiConfig?.id || apiConfig?.endpointId || apiUrl || modelName || 'unknown';
    }

    function shouldUseCache(apiConfig) {
        if (apiConfig?.enableCache === true) return true;
        if (apiConfig?.enableCache === false) return false;
        return Number.isFinite(apiConfig?.cacheTtlMs) && apiConfig.cacheTtlMs > 0;
    }

    function resolveCacheTtl(apiConfig) {
        if (Number.isFinite(apiConfig?.cacheTtlMs) && apiConfig.cacheTtlMs > 0) {
            return apiConfig.cacheTtlMs;
        }
        return CACHE_TTL;
    }

    async function callAI(modelName, prompt, systemPrompt = '', apiConfig = null) {
        const modelKey = modelName || apiConfig?.model || 'internal';
        const apiUrlKey = apiConfig?.apiUrl || apiConfig?.url || '';
        const endpointKey = getEndpointKey(apiConfig, apiUrlKey, modelKey);
        const useCache = shouldUseCache(apiConfig);
        const allowDedupe = apiConfig?.dedupe !== false;
        const requestKey = (useCache || allowDedupe)
            ? computeCacheKey(modelKey, systemPrompt || '', prompt || '', endpointKey)
            : null;
        const cacheTtlMs = useCache ? resolveCacheTtl(apiConfig) : 0;

        if (requestKey && useCache) {
            const cached = getCachedResponse(requestKey, cacheTtlMs);
            if (cached !== null) return cached;
        }

        if (requestKey && allowDedupe && inFlightRequests.has(requestKey)) {
            return await inFlightRequests.get(requestKey);
        }

        const executeRequest = async () => {
            let apiUrl = apiConfig?.apiUrl || apiConfig?.url;
            if (!modelName && apiUrl) throw new Error('模型名称不能为空');
            const apiKey = apiConfig?.apiKey || apiConfig?.key;
            const timeoutSec = (apiConfig?.timeout && apiConfig.timeout > 0) ? apiConfig.timeout : 60;
            const maxRetries = Number.isInteger(apiConfig?.maxRetries) ? Math.max(0, apiConfig.maxRetries) : 2; // 默认增加重试次数
            const baseRetryDelay = apiConfig?.retryDelayMs ?? 1000;
            const onProgress = (typeof apiConfig?.onProgress === 'function') ? apiConfig.onProgress : null;
            const onToken = (typeof apiConfig?.onToken === 'function') ? apiConfig.onToken : null;
            const enableStreaming = apiConfig?.enableStreaming !== false;
            const apiChannel = resolveApiChannel(apiConfig);
            const apiProvider = getApiProvider(apiConfig);
            const useStBackend = apiChannel === 'st-backend';

            const sleep = (ms) => new Promise(res => setTimeout(res, ms));

            if (!apiUrl && useStBackend) {
                throw new Error('未配置 API URL，无法使用 SillyTavern 后端通道');
            }

            // 智能重试判断
            const shouldRetry = (err, status, attempt) => {
                if (attempt >= maxRetries) return false;
                if (err?.name === 'AbortError') return false; // 用户主动取消不重试

                // 网络错误(status==0或undefined) -> 重试
                if (!status || status === 0) return true;

                // 429 Too Many Requests -> 重试
                if (status === 429) return true;

                // 5xx Server Errors -> 重试 (500, 502, 503, 504)
                if (status >= 500) return true;

                return false;
            };

            // 计算指数退避的等待时间
            const getBackoffDelay = (attempt) => {
                const exp = Math.pow(2, attempt);
                const jitter = Math.random() * 0.5 + 0.5; // 0.5 ~ 1.0 jitter
                return Math.min(baseRetryDelay * exp * jitter, 10000); // 上限 10s
            };

            // 组合信号
            const baseTimeoutSignal = createTimeoutSignal(timeoutSec * 1000);
            let mergedSignal = baseTimeoutSignal;
            if (apiConfig?.signal) {
                // 检查传入的signal是否已经aborted，避免使用已失效的signal
                if (apiConfig.signal.aborted) {
                    Logger.warn('API调用收到已中止的signal，将仅使用timeout signal');
                    mergedSignal = baseTimeoutSignal;
                } else if (typeof AbortSignal.any === 'function') {
                    mergedSignal = AbortSignal.any([apiConfig.signal, baseTimeoutSignal]);
                } else {
                    const controller = new AbortController();
                    const abort = () => controller.abort();
                    apiConfig.signal.addEventListener('abort', abort, { once: true });
                    baseTimeoutSignal.addEventListener('abort', abort, { once: true });
                    mergedSignal = controller.signal;
                }
            }

            // ST后端模式：已移除 generateRaw 实现
            // 现在统一使用下方的 ST 后端代理实现（通过 /api/backends/text-completions/generate）
            // 这样可以使用插件配置的 API，而不是 ST 自己配置的 API

            if (!apiUrl) {
                // 直连模式但未配置URL：尝试使用ST内置API作为fallback
                if (typeof SillyTavern !== 'undefined' && typeof SillyTavern.getContext === 'function') {
                    const context = SillyTavern.getContext();
                    if (context && context.generate) {
                        const displayModel = modelName || '默认模型';
                        Logger.log(`使用 SillyTavern 内置 API (${displayModel})`);
                        const messages = [];
                        // 自动拼接全局破限词（笔墨城公民协议）
                        let stSystemPrompt = systemPrompt || '';
                        const stGlobalPools = WBAP.getGlobalPools ? WBAP.getGlobalPools() : null;
                        if (stGlobalPools?.globalJailbreak?.enabled && stGlobalPools.globalJailbreak.content) {
                            stSystemPrompt = stGlobalPools.globalJailbreak.content + (systemPrompt || '');
                        }
                        if (stSystemPrompt) messages.push({ role: 'system', content: stSystemPrompt });
                        messages.push({ role: 'user', content: prompt });
                        const start = performance.now();
                        const result = await context.generate(messages);
                        updateEndpointStats(endpointKey, { success: true, latency: performance.now() - start });
                        return result;
                    }
                }
                throw new Error('未配置 API 且无法获取 SillyTavern API');
            }
            const messages = [];
            // 自动拼接全局破限词（笔墨城公民协议）
            let finalSystemPrompt = systemPrompt || '';
            const globalPools = WBAP.getGlobalPools ? WBAP.getGlobalPools() : null;
            if (globalPools?.globalJailbreak?.enabled && globalPools.globalJailbreak.content) {
                finalSystemPrompt = globalPools.globalJailbreak.content + (systemPrompt || '');
            }
            if (finalSystemPrompt) messages.push({ role: 'system', content: finalSystemPrompt });
            messages.push({ role: 'user', content: prompt });

            let chatUrl = '';
            let headers = {};

            if (useStBackend) {
                chatUrl = '/api/backends/chat-completions/generate';
                headers = { ...getRequestHeadersSafe(), 'Content-Type': 'application/json' };
                if (enableStreaming) {
                    headers['Accept'] = 'text/event-stream';
                } else {
                    headers['Accept'] = 'application/json';
                }
                if (apiConfig?.extraHeaders) {
                    Object.assign(headers, apiConfig.extraHeaders);
                }
            } else {
                // URL 规范化
                const trimmedUrl = apiUrl.replace(/\/+$/, '');
                chatUrl = trimmedUrl;
                if (!/\/(chat\/)?completions$/i.test(trimmedUrl)) {
                    if (/\/v1$/i.test(trimmedUrl)) {
                        chatUrl = `${trimmedUrl}/chat/completions`;
                    } else {
                        chatUrl = `${trimmedUrl}/v1/chat/completions`;
                    }
                }

                headers = {
                    'Content-Type': 'application/json',
                    // 'Connection': 'keep-alive' // 浏览器通常不允许手动设置此 header，改用 keepalive 选项
                };
                if (apiKey) headers['Authorization'] = `Bearer ${apiKey}`;
                if (enableStreaming) {
                    headers['Accept'] = 'text/event-stream';
                } else {
                    headers['Accept'] = 'application/json';
                }

                // 允许通过 apiConfig 注入额外的 headers (例如自定义 Referer 或 特殊 Auth)
                if (apiConfig?.extraHeaders) {
                    Object.assign(headers, apiConfig.extraHeaders);
                }
            }

            const body = useStBackend ? {
                chat_completion_source: apiProvider,
                reverse_proxy: apiUrl,
                proxy_password: apiKey,
                model: modelName,
                messages: messages,
                max_tokens: apiConfig.maxTokens,
                temperature: apiConfig.temperature,
                stream: enableStreaming
            } : {
                model: modelName,
                messages: messages,
                max_tokens: apiConfig.maxTokens,
                temperature: apiConfig.temperature,
                stream: enableStreaming
            };
            if (apiConfig.topP !== undefined) body.top_p = apiConfig.topP;
            if (apiConfig.presencePenalty !== undefined) body.presence_penalty = apiConfig.presencePenalty;
            if (apiConfig.frequencyPenalty !== undefined) body.frequency_penalty = apiConfig.frequencyPenalty;
            if (useStBackend) {
                if (apiConfig.customPromptPostProcessing !== undefined) {
                    body.custom_prompt_post_processing = apiConfig.customPromptPostProcessing;
                } else if (!/googleapis\.com/i.test(apiUrl || '')) {
                    body.custom_prompt_post_processing = 'strict';
                }
                if (apiConfig.enableWebSearch !== undefined) body.enable_web_search = apiConfig.enableWebSearch;
                if (apiConfig.includeReasoning !== undefined) body.include_reasoning = apiConfig.includeReasoning;
                if (apiConfig.requestImages !== undefined) body.request_images = apiConfig.requestImages;
                if (apiConfig.reasoningEffort) body.reasoning_effort = apiConfig.reasoningEffort;
                if (Array.isArray(apiConfig.groupNames)) body.group_names = apiConfig.groupNames;
            }

            const buildHeaders = (streaming) => {
                if (streaming) return headers;
                const next = { ...headers, Accept: 'application/json' };
                if (apiConfig?.extraHeaders) {
                    Object.assign(next, apiConfig.extraHeaders);
                }
                return next;
            };

            const buildBody = (streaming) => {
                if (streaming) return body;
                return { ...body, stream: false };
            };

            let attempt = 0;
            while (true) {
                try {
                    Logger.debug(`API Request: ${modelName} (Attempt ${attempt + 1})`);
                    const attemptStart = performance.now();
                    const fetchOptions = {
                        method: 'POST',
                        headers: buildHeaders(enableStreaming),
                        body: JSON.stringify(buildBody(enableStreaming)),
                        signal: mergedSignal,
                        priority: 'high'  // 高优先级，让浏览器优先处理AI请求
                    };

                    const response = await fetch(chatUrl, fetchOptions);
                    const ttfb = performance.now() - attemptStart;
                    recordEndpointLatency(endpointKey, ttfb);

                    if (!response.ok) {
                        const errorMsg = await parseApiError(response);
                        // 抛出非 2xx 状态码的错误，便于 catch 处理
                        const err = new Error(`HTTP ${response.status}: ${errorMsg}`);
                        err.status = response.status;
                        throw err;
                    }

                    // === 成功响应处理 ===

                    // 处理流式
                    const contentType = response.headers.get('content-type') || '';
                    const isJsonResponse = isJsonContentType(contentType);
                    const canStream = enableStreaming && response.body && typeof response.body.getReader === 'function';
                    if (canStream && !isJsonResponse) {
                        try {
                            Logger.log('[API调用] 开始流式读取...');
                            const content = await readStream(response.body, onToken, onProgress);
                            Logger.log('[API调用] 流式读取完成，内容长度:', content?.length);
                            updateEndpointStats(endpointKey, { success: true });
                            // 【BUG修复】清理超时信号
                            clearTimeoutSignal(baseTimeoutSignal);
                            return content;
                        } catch (streamErr) {
                            if (isStreamEmptyError(streamErr)) {
                                const fallbackStart = performance.now();
                                const fallbackOptions = {
                                    method: 'POST',
                                    headers: buildHeaders(false),
                                    body: JSON.stringify(buildBody(false)),
                                    signal: mergedSignal
                                };
                                fallbackOptions.priority = apiConfig?.priority || 'high';

                                const fallbackResponse = await fetch(chatUrl, fallbackOptions);
                                const fallbackTtfb = performance.now() - fallbackStart;
                                recordEndpointLatency(endpointKey, fallbackTtfb);

                                if (!fallbackResponse.ok) {
                                    const fallbackError = await parseApiError(fallbackResponse);
                                    const err = new Error(`HTTP ${fallbackResponse.status}: ${fallbackError}`);
                                    err.status = fallbackResponse.status;
                                    throw err;
                                }

                                const fallbackContent = await parseNonStreamResponse(fallbackResponse);
                                if (!fallbackContent) {
                                    throw new Error('Empty response body');
                                }
                                if (onProgress) onProgress(100);
                                updateEndpointStats(endpointKey, { success: true });
                                // 【BUG修复】清理超时信号
                                clearTimeoutSignal(baseTimeoutSignal);
                                return fallbackContent;
                            }
                            throw streamErr;
                        }
                    }

                    // 处理非流式 JSON
                    const content = await parseNonStreamResponse(response);
                    if (!content) {
                        throw new Error('Empty response body');
                    }
                    if (onProgress) onProgress(100);
                    updateEndpointStats(endpointKey, { success: true });
                    // 【BUG修复】清理超时信号
                    clearTimeoutSignal(baseTimeoutSignal);
                    return content;

                } catch (err) {
                    const status = err.status || 0; // 0 usually means network error (fetch failed)

                    // 记录详细错误信息
                    Logger.error(`[API调用失败] 尝试 ${attempt + 1}/${maxRetries + 1}`);
                    Logger.error(`[API调用失败] 错误类型: ${err.name}`);
                    Logger.error(`[API调用失败] 错误消息: ${err.message}`);
                    Logger.error(`[API调用失败] HTTP状态: ${status || 'Network Error'}`);
                    Logger.error(`[API调用失败] 请求URL: ${chatUrl}`);
                    Logger.error(`[API调用失败] 使用模式: ${useStBackend ? 'ST后端' : '直连'}`);
                    if (useStBackend) {
                        Logger.error(`[API调用失败] 目标API: ${apiUrl}`);
                        Logger.error(`[API调用失败] Provider: ${apiProvider}`);
                    }

                    if (shouldRetry(err, status, attempt)) {
                        attempt++;
                        const delay = getBackoffDelay(attempt);
                        Logger.warn(`API 异常 (${status || 'Network Error'}), 重试 ${attempt}/${maxRetries} ，等待 ${Math.round(delay)}ms...`);
                        Logger.debug(`详细错误: ${err.message}`);
                        await sleep(delay);
                        continue;
                    }

                    // 最终失败
                    if (err?.name !== 'AbortError') {
                        updateEndpointStats(endpointKey, { success: false });
                    }
                    Logger.error(`API 调用最终失败: ${err.message}`);

                    // 提供更友好的错误提示
                    if (status === 0 || err.message.includes('Failed to fetch')) {
                        if (useStBackend) {
                            Logger.error(`💡 提示: ST后端模式失败，可能原因：`);
                            Logger.error(`   1. SillyTavern后端未正确配置API`);
                            Logger.error(`   2. API URL或Key配置错误`);
                            Logger.error(`   3. 请检查SillyTavern控制台的错误日志`);
                        } else {
                            Logger.error(`💡 提示: 直连模式失败，可能原因：`);
                            Logger.error(`   1. CORS跨域问题（浏览器限制）`);
                            Logger.error(`   2. API URL不可访问`);
                            Logger.error(`   3. 网络连接问题`);
                            Logger.error(`   建议: 切换到"ST后端"模式以便排查`);
                        }
                    }

                    // 【BUG修复】清理超时信号
                    clearTimeoutSignal(baseTimeoutSignal);
                    throw err;
                }
            }
        };

        const requestPromise = executeRequest();
        if (requestKey && allowDedupe) {
            inFlightRequests.set(requestKey, requestPromise);
        }

        try {
            const result = await requestPromise;
            if (requestKey && useCache) {
                setCachedResponse(requestKey, result);
            }
            return result;
        } finally {
            if (requestKey && allowDedupe) {
                inFlightRequests.delete(requestKey);
            }
            // 注意：baseTimeoutSignal 在 executeRequest 内部创建，无法在这里清理
            // 清理逻辑已在 executeRequest 的错误处理中添加
        }
    }

    // 辅助：解析非流式响应
    function extractTextFromPayload(payload) {
        if (payload == null) return '';
        if (typeof payload === 'string') return payload;
        if (typeof payload.content === 'string') return payload.content;
        if (typeof payload.response === 'string') return payload.response;
        if (typeof payload.output === 'string') return payload.output;
        if (typeof payload.output_text === 'string') return payload.output_text;

        const choice = Array.isArray(payload.choices) ? payload.choices[0] : null;
        if (choice) {
            const delta = choice.delta?.content ?? choice.delta?.text;
            if (typeof delta === 'string' && delta) return delta;
            const message = choice.message?.content ?? choice.text ?? choice.message?.text;
            if (typeof message === 'string' && message) return message;
        }

        if (typeof payload.completion === 'string') return payload.completion;
        if (typeof payload.delta?.text === 'string') return payload.delta.text;
        if (Array.isArray(payload.content)) {
            const text = payload.content.map(block => block?.text).filter(Boolean).join('');
            if (text) return text;
        }

        const gen = payload.generations?.[0]?.text;
        if (typeof gen === 'string' && gen) return gen;

        const candidate = payload.candidates?.[0];
        if (candidate) {
            if (typeof candidate.output === 'string' && candidate.output) return candidate.output;
            const parts = candidate.content?.parts;
            if (Array.isArray(parts)) {
                const text = parts.map(part => part?.text).filter(Boolean).join('');
                if (text) return text;
            }
            if (typeof candidate.content?.text === 'string' && candidate.content.text) return candidate.content.text;
        }

        if (Array.isArray(payload.output)) {
            let text = '';
            payload.output.forEach(item => {
                const blocks = Array.isArray(item?.content) ? item.content : [];
                blocks.forEach(block => {
                    if (typeof block?.text === 'string') text += block.text;
                });
            });
            if (text) return text;
        }

        return '';
    }

    function mergeStreamingText(current, incoming) {
        const nextText = String(incoming || '');
        if (!nextText) return { next: current || '', delta: '' };
        const currentText = String(current || '');
        if (!currentText) return { next: nextText, delta: nextText };
        if (nextText.startsWith(currentText)) {
            return { next: nextText, delta: nextText.slice(currentText.length) };
        }
        if (currentText.startsWith(nextText)) {
            return { next: currentText, delta: '' };
        }
        return { next: currentText + nextText, delta: nextText };
    }

    function parseStaticResponse(data) {
        const extracted = extractTextFromPayload(data);
        if (extracted) return extracted;
        if (Array.isArray(data.choices) && data.choices.length > 0) {
            return data.choices[0]?.message?.content ?? data.choices[0]?.text ?? '';
        }
        if (typeof data.content === 'string') return data.content;
        if (typeof data === 'string') return data;
        throw new Error('未知的响应格式');
    }

    // 辅助：读取流
    function isJsonContentType(value = '') {
        return /application\/json|text\/json|application\/problem\+json/i.test(value || '');
    }

    function isStreamEmptyError(err) {
        const message = String(err?.message || '');
        const normalized = message.replace(/\s+/g, '').toLowerCase();
        return message.includes('\u6d41\u5f0f\u54cd\u5e94\u4e3a\u7a7a')
            || normalized.includes('streamempty')
            || normalized.includes('emptyresponsebody')
            || normalized.includes('responsebodyisnull');
    }

    async function parseNonStreamResponse(response) {
        const rawText = await response.text();
        if (!rawText) return '';
        try {
            const parsed = JSON.parse(rawText);
            const extracted = extractTextFromPayload(parsed);
            if (extracted) return extracted;
            return parseStaticResponse(parsed);
        } catch (e) {
            return rawText;
        }
    }

    async function readStream(stream, onToken, onProgress) {
        const reader = stream.getReader();
        const decoder = new TextDecoder();
        let content = '';
        let buffer = '';
        let charCount = 0;
        let raw = '';
        let lastProgressUpdate = 0;
        const progressThrottle = 50; // 限制进度更新频率为 50ms

        try {
            while (true) {
                const { done, value } = await reader.read();
                if (done) break;

                const chunk = decoder.decode(value, { stream: true });
                raw += chunk;
                buffer += chunk;

                const lines = buffer.split('\n');
                buffer = lines.pop() || ''; // 保留未完成的行

                for (const line of lines) {
                    const trimmed = line.trim();
                    if (!trimmed) continue;
                    const dataMatch = trimmed.match(/^data:\s?(.*)$/);
                    if (!dataMatch) continue;
                    const dataVal = dataMatch[1];
                    if (!dataVal || dataVal === '[DONE]') continue;
                    try {
                        const parsed = JSON.parse(dataVal);
                        Logger.log('[流式解析] 收到数据块:', parsed);
                        const extracted = extractTextFromPayload(parsed);
                        Logger.log('[流式解析] 提取文本:', extracted);
                        if (extracted) {
                            const merged = mergeStreamingText(content, extracted);
                            content = merged.next;
                            if (merged.delta) {
                                charCount += merged.delta.length;
                                if (onToken) onToken(merged.delta);
                                // 节流进度更新，减少 UI 重绘开销
                                const now = performance.now();
                                if (onProgress && (now - lastProgressUpdate) >= progressThrottle) {
                                    onProgress(95 * (1 - Math.exp(-charCount / 500)));
                                    lastProgressUpdate = now;
                                }
                            }
                        }
                    } catch (e) {
                        Logger.warn('[流式解析] JSON解析失败:', e, 'dataVal:', dataVal);
                        if (dataVal[0] && dataVal[0] !== '{' && dataVal[0] !== '[') {
                            const merged = mergeStreamingText(content, dataVal);
                            content = merged.next;
                            if (merged.delta) {
                                charCount += merged.delta.length;
                                if (onToken) onToken(merged.delta);
                                const now = performance.now();
                                if (onProgress && (now - lastProgressUpdate) >= progressThrottle) {
                                    onProgress(95 * (1 - Math.exp(-charCount / 500)));
                                    lastProgressUpdate = now;
                                }
                            }
                        }
                    }
                }
            }
        } finally {
            reader.releaseLock();
        }

        if (!content && raw.trim()) {
            // Fallback to parse non-SSE responses.
            Logger.log('[流式解析] 流式内容为空，尝试解析完整响应:', raw.substring(0, 500));
            try {
                const parsed = JSON.parse(raw);
                const result = parseStaticResponse(parsed);
                Logger.log('[流式解析] 静态解析结果:', result);
                return result;
            } catch (e) {
                Logger.warn('[流式解析] 静态解析失败:', e);
            }
        }

        if (!content) {
            Logger.error('[流式解析] 最终内容为空，raw长度:', raw.length);
            throw new Error('流式响应为空');
        }
        Logger.log('[流式解析] 成功！最终内容长度:', content.length, '内容预览:', content.substring(0, 200));
        if (onProgress) onProgress(100);
        return content;
    }

    async function testEndpointConnection(apiConfig) {
        // 校验必填字段
        const apiUrl = apiConfig?.apiUrl || apiConfig?.url;
        const apiKey = apiConfig?.apiKey || apiConfig?.key;
        const model = apiConfig?.model;

        if (!apiUrl || apiUrl.trim() === '') {
            return { success: false, message: '请先填写 API URL' };
        }
        if (!apiKey || apiKey.trim() === '') {
            return { success: false, message: '请先填写 API Key' };
        }
        if (!model || model.trim() === '') {
            return { success: false, message: '请先填写模型名称' };
        }

        try {
            const response = await callAI(model, '这是一条连通性测试消息', 'You are a test assistant.', apiConfig);
            if (response) {
                return { success: true, message: 'Test succeeded.' };
            }
            return { success: false, message: '响应为空' };
        } catch (e) {
            return { success: false, message: e.message };
        }
    }

    async function fetchEndpointModels(apiConfig) {
        let apiUrl = apiConfig.apiUrl || apiConfig.url;
        const apiKey = apiConfig.apiKey || apiConfig.key;
        const apiChannel = resolveApiChannel(apiConfig);
        const apiProvider = getApiProvider(apiConfig);
        const useStBackend = apiChannel === 'st-backend';

        if (!apiUrl) {
            return { success: false, message: '请先输入 API URL' };
        }

        try {
            if (useStBackend) {
                const headers = { ...getRequestHeadersSafe(), 'Content-Type': 'application/json' };
                const response = await fetch('/api/backends/chat-completions/status', {
                    method: 'POST',
                    headers: headers,
                    signal: createTimeoutSignal(15 * 1000),
                    body: JSON.stringify({
                        reverse_proxy: apiUrl,
                        proxy_password: apiKey,
                        chat_completion_source: apiProvider
                    })
                });

                if (!response.ok) throw new Error(`API 请求失败: ${response.status} ${response.statusText}. ${await response.text()}`);

                const data = await response.json();
                const models = Array.isArray(data) ? data : (data.data || data.models || []);
                if (!Array.isArray(models) || models.length === 0) {
                    return { success: false, message: '未找到任何模型' };
                }
                const normalized = models.map(m => m.id || m.name || m.model || m).filter(Boolean);
                return { success: true, models: normalized.sort() };
            }

            const headers = { 'Content-Type': 'application/json' };
            if (apiKey) headers['Authorization'] = `Bearer ${apiKey}`;
            // 处理用户传入完整 chat/completions 路径的情况，截断尾部再请求 /v1/models
            let baseUrl = apiUrl.replace(/\/(v1\/)?chat\/completions\/?$/i, '');
            baseUrl = baseUrl.replace(/\/v1\/?$/i, '');
            baseUrl = baseUrl.replace(/\/+$/, '');

            const response = await fetch(`${baseUrl}/v1/models`, {
                method: 'GET',
                headers: headers,
                signal: createTimeoutSignal(15 * 1000)
            });

            if (!response.ok) throw new Error(`API 请求失败: ${response.status} ${response.statusText}. ${await response.text()}`);

            const data = await response.json();
            const models = data.data?.map(m => m.id) || [];

            if (models.length === 0) {
                return { success: false, message: '未找到任何模型' };
            }
            return { success: true, models: models.sort() };
        } catch (e) {
            return { success: false, message: e.message };
        }
    }

    // ========== 预连接(Preconnect) ==========
    const preconnectedHosts = new Set();
    function setupPreconnect(endpoints) {
        if (!Array.isArray(endpoints)) return;
        endpoints.forEach(ep => {
            try {
                if (resolveApiChannel(ep) === 'st-backend') return;
                const url = ep.apiUrl || ep.url;
                if (!url) return;
                const host = new URL(url).origin;
                if (preconnectedHosts.has(host)) return;
                preconnectedHosts.add(host);
                const dnsPrefetch = document.createElement('link');
                dnsPrefetch.rel = 'dns-prefetch';
                dnsPrefetch.href = host;
                document.head.appendChild(dnsPrefetch);
                const link = document.createElement('link');
                link.rel = 'preconnect';
                link.href = host;
                link.crossOrigin = 'anonymous';
                document.head.appendChild(link);
                Logger.log(`预连接已添加: ${host}`);
            } catch (e) { /* ignore invalid URLs */ }
        });
    }

    // ========== 延迟测速 (Latency Measurement) ==========
    const latencyScores = new Map(); // endpointId -> { latency, timestamp }
    const endpointStats = new Map(); // endpointId -> stats
    const LATENCY_TTL = 5 * 60 * 1000; // 5 minutes
    const FAILURE_PENALTY_WINDOW = 2 * 60 * 1000; // 2 minutes
    const FAILURE_PENALTY_STEP = 1500;
    const MAX_FAILURE_PENALTY = 5;

    function updateEndpointStats(endpointId, { success = false, latency } = {}) {
        if (!endpointId) return;
        const now = Date.now();
        const stats = endpointStats.get(endpointId) || {
            successes: 0,
            failures: 0,
            consecutiveFailures: 0,
            avgLatency: 0,
            lastLatency: 0,
            lastSuccess: 0,
            lastFailure: 0
        };

        if (Number.isFinite(latency) && latency > 0) {
            stats.lastLatency = latency;
            stats.avgLatency = stats.avgLatency > 0
                ? (stats.avgLatency * 0.8 + latency * 0.2)
                : latency;
        }

        if (success) {
            stats.successes += 1;
            stats.consecutiveFailures = 0;
            stats.lastSuccess = now;
        } else {
            stats.failures += 1;
            stats.consecutiveFailures = Math.min(10, (stats.consecutiveFailures || 0) + 1);
            stats.lastFailure = now;
        }

        endpointStats.set(endpointId, stats);
    }

    function recordEndpointLatency(endpointId, latency) {
        if (!endpointId || !Number.isFinite(latency) || latency <= 0) return;
        latencyScores.set(endpointId, { latency, timestamp: Date.now() });
        const stats = endpointStats.get(endpointId) || {
            successes: 0,
            failures: 0,
            consecutiveFailures: 0,
            avgLatency: 0,
            lastLatency: 0,
            lastSuccess: 0,
            lastFailure: 0
        };
        const next = {
            ...stats,
            lastLatency: latency,
            avgLatency: stats.avgLatency > 0
                ? (stats.avgLatency * 0.8 + latency * 0.2)
                : latency
        };
        endpointStats.set(endpointId, next);
    }

        async function measureLatency(endpoint) {
        const url = endpoint.apiUrl || endpoint.url;
        if (!url) return Infinity;
        const useStBackend = resolveApiChannel(endpoint) === 'st-backend';
        try {
            if (useStBackend) {
                const headers = { ...getRequestHeadersSafe(), 'Content-Type': 'application/json' };
                const start = performance.now();
                const res = await fetch('/api/backends/chat-completions/status', {
                    method: 'POST',
                    headers,
                    signal: createTimeoutSignal(5000),
                    priority: 'low',
                    body: JSON.stringify({
                        reverse_proxy: url,
                        proxy_password: endpoint.apiKey || endpoint.key,
                        chat_completion_source: getApiProvider(endpoint)
                    })
                });
                const latency = performance.now() - start;
                if (res.ok) {
                    recordEndpointLatency(endpoint.id, latency);
                    Logger.log(`端点 ${endpoint.name || endpoint.id} 延迟: ${latency.toFixed(0)}ms`);
                    return latency;
                }
            } else {
                const trimmedUrl = url.replace(/\/+$/, '').replace(/\/(v1\/)?(chat\/)?completions$/i, '');
                const baseUrl = trimmedUrl.replace(/\/v1\/?$/i, '');
                const testUrl = `${baseUrl}/v1/models`;
                const headers = { 'Content-Type': 'application/json' };
                if (endpoint.apiKey || endpoint.key) {
                    headers['Authorization'] = `Bearer ${endpoint.apiKey || endpoint.key}`;
                }
                const start = performance.now();
                const res = await fetch(testUrl, {
                    method: 'GET',
                    headers,
                    signal: createTimeoutSignal(5000),
                    priority: 'low'
                });
                const latency = performance.now() - start;
                if (res.ok) {
                    recordEndpointLatency(endpoint.id, latency);
                    Logger.log(`端点 ${endpoint.name || endpoint.id} 延迟: ${latency.toFixed(0)}ms`);
                    return latency;
                }
            }
        } catch (e) { /* timeout or error */ }
        return Infinity;
    }

    function getEndpointLatency(endpointId) {
        const record = latencyScores.get(endpointId);
        if (!record) return Infinity;
        if (Date.now() - record.timestamp > LATENCY_TTL) {
            latencyScores.delete(endpointId);
            return Infinity;
        }
        return record.latency;
    }

    function getEndpointStats(endpointId) {
        return endpointStats.get(endpointId) || null;
    }

    function getEndpointScore(endpoint) {
        if (!endpoint) return Infinity;
        const endpointId = endpoint.id;
        const stats = endpointId ? endpointStats.get(endpointId) : null;
        const measuredLatency = endpointId ? getEndpointLatency(endpointId) : Infinity;
        const statsLatency = stats?.avgLatency || stats?.lastLatency || Infinity;
        let baseLatency = Number.isFinite(measuredLatency) ? measuredLatency : statsLatency;
        if (!Number.isFinite(baseLatency)) baseLatency = 5000;

        let penalty = 0;
        if (stats?.consecutiveFailures) {
            penalty += Math.min(MAX_FAILURE_PENALTY, stats.consecutiveFailures) * FAILURE_PENALTY_STEP;
        }
        if (stats?.lastFailure && Date.now() - stats.lastFailure < FAILURE_PENALTY_WINDOW) {
            penalty += FAILURE_PENALTY_STEP;
        }
        return baseLatency + penalty;
    }

    function sortEndpointsByLatency(endpoints) {
        return [...endpoints].sort((a, b) => getEndpointScore(a) - getEndpointScore(b));
    }

    async function refreshAllLatencies(endpoints) {
        if (!Array.isArray(endpoints)) return;
        await Promise.all(endpoints.map(ep => measureLatency(ep)));
    }

    // ========== 响应缓存 (Response Cache) ==========
    const responseCache = new Map();
    const CACHE_TTL = 5 * 60 * 1000; // 5 minutes
    const CACHE_MAX_SIZE = 50;

    function computeCacheKey(modelName, systemPrompt, userPrompt, endpointKey = '') {
        const str = `${endpointKey}||${modelName}||${systemPrompt}||${userPrompt}`;
        let hash = 0;
        for (let i = 0; i < str.length; i++) {
            const char = str.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash |= 0;
        }
        return hash.toString(36);
    }

    function getCachedResponse(key, ttlMs = CACHE_TTL) {
        const entry = responseCache.get(key);
        if (!entry) return null;
        if (Date.now() - entry.timestamp > ttlMs) {
            responseCache.delete(key);
            return null;
        }
        Logger.log(`缓存命中: ${key}`);
        return entry.response;
    }

    function setCachedResponse(key, response) {
        if (responseCache.size >= CACHE_MAX_SIZE) {
            const oldestKey = responseCache.keys().next().value;
            responseCache.delete(oldestKey);
        }
        responseCache.set(key, { response, timestamp: Date.now() });
    }

    function clearResponseCache() {
        responseCache.clear();
        Logger.log('响应缓存已清空');
    }

    // ========== 删除世界书条目 ==========
    async function deleteWorldBookEntries(bookName, uids) {
        try {
            if (!bookName) {
                return { success: false, reason: '世界书名称不能为空' };
            }
            if (!Array.isArray(uids) || uids.length === 0) {
                return { success: false, reason: '未指定要删除的条目' };
            }

            const worldInfoModule = await import('/scripts/world-info.js');
            const { loadWorldInfo, saveWorldInfo } = worldInfoModule;

            const bookData = await loadWorldInfo(bookName);
            if (!bookData || !bookData.entries) {
                return { success: false, reason: `世界书 "${bookName}" 不存在或无法加载` };
            }

            const deletedUids = [];
            uids.forEach(uid => {
                const key = String(uid);
                if (bookData.entries[key]) {
                    delete bookData.entries[key];
                    deletedUids.push(uid);
                }
            });

            if (deletedUids.length === 0) {
                return { success: false, reason: '未找到要删除的条目' };
            }

            await saveWorldInfo(bookName, bookData, true);
            Logger.log(`成功从世界书 "${bookName}" 删除 ${deletedUids.length} 个条目`);
            return { success: true, deletedUids };
        } catch (e) {
            Logger.error(`删除世界书条目失败:`, e);
            return { success: false, reason: e.message };
        }
    }

    // ========== 按条件查找世界书条目 ==========
    async function findWorldBookEntries(bookName, predicate) {
        try {
            if (!bookName) return [];
            const bookData = await loadWorldBookEntriesByName(bookName);
            if (!bookData || !bookData.entries) return [];

            const results = [];
            for (const [key, entry] of Object.entries(bookData.entries)) {
                if (predicate(entry, key)) {
                    results.push(entry);
                }
            }
            return results;
        } catch (e) {
            Logger.error(`查找世界书条目失败:`, e);
            return [];
        }
    }

    // ========== 删除整个世界书 ==========
    async function deleteWorldBook(bookName) {
        try {
            if (!bookName || typeof bookName !== 'string' || !bookName.trim()) {
                return { success: false, reason: '世界书名称不能为空' };
            }

            const trimmedName = bookName.trim();

            // 动态导入 world-info.js
            const worldInfoModule = await import('/scripts/world-info.js');
            const { deleteWorldInfo, world_names, updateWorldInfoList } = worldInfoModule;

            // 检查世界书是否存在
            if (!Array.isArray(world_names) || !world_names.includes(trimmedName)) {
                Logger.warn(`世界书 "${trimmedName}" 不存在`);
                return { success: false, reason: '世界书不存在' };
            }

            // 删除世界书
            await deleteWorldInfo(trimmedName);

            // 从 world_names 列表中移除
            const index = world_names.indexOf(trimmedName);
            if (index > -1) {
                world_names.splice(index, 1);
            }

            // 刷新世界书列表
            if (typeof updateWorldInfoList === 'function') {
                await updateWorldInfoList();
            }

            Logger.log(`成功删除世界书 "${trimmedName}"`);
            return { success: true, name: trimmedName };
        } catch (e) {
            Logger.error(`删除世界书 "${bookName}" 失败:`, e);
            return { success: false, reason: e.message };
        }
    }

    // 挂载函数到全局命名空间
    window.WBAP.getAllWorldBookNames = getAllWorldBookNames;
    window.WBAP.loadWorldBookEntriesByName = loadWorldBookEntriesByName;
    window.WBAP.saveWorldBookEntriesByName = saveWorldBookEntriesByName;
    window.WBAP.createWorldBook = createWorldBook;
    window.WBAP.createWorldBookEntry = createWorldBookEntry;
    window.WBAP.upsertWorldBookEntry = upsertWorldBookEntry;
    window.WBAP.loadWorldBookByName = loadWorldBookByName;
    window.WBAP.callAI = callAI;
    window.WBAP.testEndpointConnection = testEndpointConnection;
    window.WBAP.fetchEndpointModels = fetchEndpointModels;
    // 新增导出
    window.WBAP.setupPreconnect = setupPreconnect;
    window.WBAP.measureLatency = measureLatency;
    window.WBAP.getEndpointLatency = getEndpointLatency;
    window.WBAP.getEndpointStats = getEndpointStats;
    window.WBAP.getEndpointScore = getEndpointScore;
    window.WBAP.sortEndpointsByLatency = sortEndpointsByLatency;
    window.WBAP.refreshAllLatencies = refreshAllLatencies;
    window.WBAP.computeCacheKey = computeCacheKey;
    window.WBAP.getCachedResponse = getCachedResponse;
    window.WBAP.setCachedResponse = setCachedResponse;
    window.WBAP.clearResponseCache = clearResponseCache;
    window.WBAP.deleteWorldBookEntries = deleteWorldBookEntries;
    window.WBAP.findWorldBookEntries = findWorldBookEntries;
    window.WBAP.deleteWorldBook = deleteWorldBook;

})();









