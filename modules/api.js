// modules/api.js

(function () {
    'use strict';

    // 确保全局命名空间存在
    window.WBAP = window.WBAP || {};
    const Logger = WBAP.Logger;

    function createTimeoutSignal(ms) {
        if (typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function') {
            try {
                return AbortSignal.timeout(ms);
            } catch (e) {
                // 某些环境下会抛错，继续使用回退方案
            }
        }
        const controller = new AbortController();
        setTimeout(() => controller.abort(), ms);
        return controller.signal;
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
                    // 过滤 None / — None — 占位项（全角、半角破折号均适配）
                    const normalized = (name || '').toLowerCase().replace(/[\s—-]/g, '');
                    if (name && normalized !== '' && normalized !== 'none' && normalized !== '—none—') {
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
        const text = await response.text();
        try {
            const json = JSON.parse(text);
            if (json.error && json.error.message) {
                return json.error.message; // OpenAI 格式
            }
            if (json.message) {
                return json.message; // 通用格式
            }
        } catch (e) {
            // 如果不是 JSON，返回部分文本
            return text.slice(0, 100) + (text.length > 100 ? '...' : '');
        }
        return text; // 返回原始文本（如果无法解析）
    }



    async function callAI(modelName, prompt, systemPrompt = '', apiConfig = null) {
        let apiUrl = apiConfig?.apiUrl || apiConfig?.url;
        if (!modelName && apiUrl) throw new Error('模型名称不能为空');
        const apiKey = apiConfig?.apiKey || apiConfig?.key;
        const timeoutSec = (apiConfig?.timeout && apiConfig.timeout > 0) ? apiConfig.timeout : 60;
        const maxRetries = Number.isInteger(apiConfig?.maxRetries) ? Math.max(0, apiConfig.maxRetries) : 2; // 默认增加重试次数
        const baseRetryDelay = apiConfig?.retryDelayMs ?? 1000;
        const onProgress = (typeof apiConfig?.onProgress === 'function') ? apiConfig.onProgress : null;
        const onToken = (typeof apiConfig?.onToken === 'function') ? apiConfig.onToken : null;
        const enableStreaming = apiConfig?.enableStreaming !== false;

        const sleep = (ms) => new Promise(res => setTimeout(res, ms));

        // 智能重试判断
        const shouldRetry = (err, status, attempt) => {
            if (attempt >= maxRetries) return false;
            if (err?.name === 'AbortError') return false; // 用户主动取消不重试

            // 网络错误 (status === 0 或 undefined) -> 重试
            if (!status || status === 0) return true;

            // 429 Too Many Requests -> 重试
            if (status === 429) return true;

            // 5xx Server Errors -> 重试 (500, 502, 503, 504)
            if (status >= 500) return true;

            return false;
        };

        // 计算带抖动的退避时间
        const getBackoffDelay = (attempt) => {
            const exp = Math.pow(2, attempt);
            const jitter = Math.random() * 0.5 + 0.5; // 0.5 ~ 1.0 jitter
            return Math.min(baseRetryDelay * exp * jitter, 10000); // 上限 10秒
        };

        // 组合信号
        const baseTimeoutSignal = createTimeoutSignal(timeoutSec * 1000);
        let mergedSignal = baseTimeoutSignal;
        if (apiConfig?.signal) {
            if (typeof AbortSignal.any === 'function') {
                mergedSignal = AbortSignal.any([apiConfig.signal, baseTimeoutSignal]);
            } else {
                const controller = new AbortController();
                const abort = () => controller.abort();
                apiConfig.signal.addEventListener('abort', abort, { once: true });
                baseTimeoutSignal.addEventListener('abort', abort, { once: true });
                mergedSignal = controller.signal;
            }
        }

        if (!apiUrl) {
            // SillyTavern Internal API Fallback
            if (typeof SillyTavern !== 'undefined' && typeof SillyTavern.getContext === 'function') {
                const context = SillyTavern.getContext();
                if (context && context.generate) {
                    const displayModel = modelName || '默认模型';
                    Logger.log(`使用 SillyTavern 内置 API (${displayModel})`);
                    const messages = [];
                    if (systemPrompt) messages.push({ role: 'system', content: systemPrompt });
                    messages.push({ role: 'user', content: prompt });
                    return await context.generate(messages);
                }
            }
            throw new Error('未配置 API 且无法获取 SillyTavern API');
        }

        // URL 规范化
        const trimmedUrl = apiUrl.replace(/\/+$/, '');
        let chatUrl = trimmedUrl;
        if (!/\/(chat\/)?completions$/i.test(trimmedUrl)) {
            if (/\/v1$/i.test(trimmedUrl)) {
                chatUrl = `${trimmedUrl}/chat/completions`;
            } else {
                chatUrl = `${trimmedUrl}/v1/chat/completions`;
            }
        }

        const headers = {
            'Content-Type': 'application/json',
            // 'Connection': 'keep-alive' // 浏览器通常不允许手动设置此 header，改用 keepalive选项
        };
        if (apiKey) headers['Authorization'] = `Bearer ${apiKey}`;

        // 允许通过 apiConfig 注入额外的 headers (例如自定义 Referer 或 特殊 Auth)
        if (apiConfig?.extraHeaders) {
            Object.assign(headers, apiConfig.extraHeaders);
        }

        const messages = [];
        if (systemPrompt) messages.push({ role: 'system', content: systemPrompt });
        messages.push({ role: 'user', content: prompt });

        const body = {
            model: modelName,
            messages: messages,
            max_tokens: apiConfig.maxTokens,
            temperature: apiConfig.temperature,
            stream: enableStreaming
        };
        if (apiConfig.topP !== undefined) body.top_p = apiConfig.topP;
        if (apiConfig.presencePenalty !== undefined) body.presence_penalty = apiConfig.presencePenalty;
        if (apiConfig.frequencyPenalty !== undefined) body.frequency_penalty = apiConfig.frequencyPenalty;

        let attempt = 0;
        while (true) {
            try {
                Logger.debug(`API Request: ${modelName} (Attempt ${attempt + 1})`);

                const response = await fetch(chatUrl, {
                    method: 'POST',
                    headers: headers,
                    body: JSON.stringify(body),
                    signal: mergedSignal
                    // 移除可能导致 Network Error 的严格选项 (keepalive, mode: cors等)
                });

                if (!response.ok) {
                    const errorMsg = await parseApiError(response);
                    // 抛出带状态码的错误，以便 catch 块捕获处理
                    const err = new Error(`HTTP ${response.status}: ${errorMsg}`);
                    err.status = response.status;
                    throw err;
                }

                // === 成功响应处理 ===

                // 处理流式
                const canStream = enableStreaming && response.body && typeof response.body.getReader === 'function';
                if (canStream) {
                    const content = await readStream(response.body, onToken, onProgress);
                    return content;
                }

                // 处理非流式 JSON
                const data = await response.json();
                const content = parseStaticResponse(data);
                if (onProgress) onProgress(100);
                return content;

            } catch (err) {
                const status = err.status || 0; // 0 usually means network error (fetch failed)

                if (shouldRetry(err, status, attempt)) {
                    attempt++;
                    const delay = getBackoffDelay(attempt);
                    Logger.warn(`API 异常 (${status || 'Network Error'}), 重试 ${attempt}/${maxRetries} 后等待 ${Math.round(delay)}ms...`);
                    Logger.debug(`详细错误: ${err.message}`);
                    await sleep(delay);
                    continue;
                }

                // 彻底失败
                Logger.error(`API 调用最终失败: ${err.message}`);
                throw err;
            }
        }
    }

    // 辅助：解析非流式响应
    function parseStaticResponse(data) {
        if (Array.isArray(data.choices) && data.choices.length > 0) {
            return data.choices[0]?.message?.content ?? data.choices[0]?.text ?? '';
        }
        if (typeof data.content === 'string') return data.content;
        if (typeof data === 'string') return data;
        throw new Error('未知的响应格式');
    }

    // 辅助：读取流
    async function readStream(stream, onToken, onProgress) {
        const reader = stream.getReader();
        const decoder = new TextDecoder();
        let content = '';
        let buffer = '';
        let charCount = 0;

        try {
            while (true) {
                const { done, value } = await reader.read();
                if (done) break;

                const chunk = decoder.decode(value, { stream: true });
                buffer += chunk;

                const lines = buffer.split('\n');
                buffer = lines.pop() || ''; // 保留未完成的行

                for (const line of lines) {
                    const trimmed = line.trim();
                    if (!trimmed) continue;
                    if (trimmed.startsWith('data: ')) {
                        const dataVal = trimmed.slice(6);
                        if (dataVal === '[DONE]') continue;
                        try {
                            const parsed = JSON.parse(dataVal);
                            const delta = parsed.choices?.[0]?.delta?.content
                                ?? parsed.choices?.[0]?.text
                                ?? '';
                            if (delta) {
                                content += delta;
                                charCount += delta.length;
                                if (onToken) onToken(delta);
                                // 计算伪进度
                                if (onProgress) onProgress(95 * (1 - Math.exp(-charCount / 500)));
                            }
                        } catch (e) {
                            // ignore json error
                        }
                    }
                }
            }
        } finally {
            reader.releaseLock();
        }

        if (!content && buffer) {
            // 尝试从残留 buffer 恢复（某些非标准流）
            try {
                const parsed = JSON.parse(buffer);
                return parseStaticResponse(parsed);
            } catch (e) { }
        }

        if (!content) throw new Error('流式响应为空');
        if (onProgress) onProgress(100);
        return content;
    }

    async function testEndpointConnection(apiConfig) {
        // 验证必填字段
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
            const response = await callAI(model, '加藤惠向你呼叫！', 'You are a test assistant.', apiConfig);
            if (response) {
                return { success: true, message: '测试成功，收到响应。' };
            }
            return { success: false, message: '响应为空' };
        } catch (e) {
            return { success: false, message: e.message };
        }
    }

    async function fetchEndpointModels(apiConfig) {
        let apiUrl = apiConfig.apiUrl || apiConfig.url;
        const apiKey = apiConfig.apiKey || apiConfig.key;

        if (!apiUrl) {
            return { success: false, message: '请先输入 API URL' };
        }

        try {
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

    // ========== 预连接 (Preconnect) ==========
    const preconnectedHosts = new Set();
    function setupPreconnect(endpoints) {
        if (!Array.isArray(endpoints)) return;
        endpoints.forEach(ep => {
            try {
                const url = ep.apiUrl || ep.url;
                if (!url) return;
                const host = new URL(url).origin;
                if (preconnectedHosts.has(host)) return;
                preconnectedHosts.add(host);
                const link = document.createElement('link');
                link.rel = 'preconnect';
                link.href = host;
                link.crossOrigin = 'anonymous';
                document.head.appendChild(link);
                Logger.log(`预连接已添加: ${host}`);
            } catch (e) { /* ignore invalid URLs */ }
        });
    }

    // ========== 延迟测量 (Latency Measurement) ==========
    const latencyScores = new Map(); // endpointId -> { latency, timestamp }
    const LATENCY_TTL = 5 * 60 * 1000; // 5 minutes

    async function measureLatency(endpoint) {
        const url = endpoint.apiUrl || endpoint.url;
        if (!url) return Infinity;
        try {
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
                latencyScores.set(endpoint.id, { latency, timestamp: Date.now() });
                Logger.log(`端点 ${endpoint.name || endpoint.id} 延迟: ${latency.toFixed(0)}ms`);
                return latency;
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

    function sortEndpointsByLatency(endpoints) {
        return [...endpoints].sort((a, b) => getEndpointLatency(a.id) - getEndpointLatency(b.id));
    }

    async function refreshAllLatencies(endpoints) {
        if (!Array.isArray(endpoints)) return;
        await Promise.all(endpoints.map(ep => measureLatency(ep)));
    }

    // ========== 响应缓存 (Response Cache) ==========
    const responseCache = new Map();
    const CACHE_TTL = 5 * 60 * 1000; // 5 minutes
    const CACHE_MAX_SIZE = 50;

    function computeCacheKey(modelName, systemPrompt, userPrompt) {
        const str = `${modelName}||${systemPrompt}||${userPrompt}`;
        let hash = 0;
        for (let i = 0; i < str.length; i++) {
            const char = str.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash |= 0;
        }
        return hash.toString(36);
    }

    function getCachedResponse(key) {
        const entry = responseCache.get(key);
        if (!entry) return null;
        if (Date.now() - entry.timestamp > CACHE_TTL) {
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

    // 暴露函数到全局命名空间
    window.WBAP.getAllWorldBookNames = getAllWorldBookNames;
    window.WBAP.loadWorldBookEntriesByName = loadWorldBookEntriesByName;
    window.WBAP.loadWorldBookByName = loadWorldBookByName;
    window.WBAP.callAI = callAI;
    window.WBAP.testEndpointConnection = testEndpointConnection;
    window.WBAP.fetchEndpointModels = fetchEndpointModels;
    // 新增导出
    window.WBAP.setupPreconnect = setupPreconnect;
    window.WBAP.measureLatency = measureLatency;
    window.WBAP.getEndpointLatency = getEndpointLatency;
    window.WBAP.sortEndpointsByLatency = sortEndpointsByLatency;
    window.WBAP.refreshAllLatencies = refreshAllLatencies;
    window.WBAP.computeCacheKey = computeCacheKey;
    window.WBAP.getCachedResponse = getCachedResponse;
    window.WBAP.setCachedResponse = setCachedResponse;
    window.WBAP.clearResponseCache = clearResponseCache;

})();
