// modules/api.js

(function () {
    'use strict';

    // 纭繚鍏ㄥ眬鍛藉悕绌洪棿瀛樺湪
    window.WBAP = window.WBAP || {};
    const Logger = WBAP.Logger;

    function createTimeoutSignal(ms) {
        if (typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function') {
            try {
                return AbortSignal.timeout(ms);
            } catch (e) {
                // 鏌愪簺鐜涓嬩細鎶涢敊锛岀户缁娇鐢ㄥ洖閫€鏂规
            }
        }
        const controller = new AbortController();
        setTimeout(() => controller.abort(), ms);
        return controller.signal;
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
                Logger.log(`閫氳繃 window.world_names 鑾峰彇鍒?${window.world_names.length} 鏈笘鐣屼功`);
                return [...window.world_names];
            }
            if (typeof SillyTavern !== 'undefined' && SillyTavern.getContext) {
                const context = SillyTavern.getContext();
                if (Array.isArray(context.worldNames)) {
                    Logger.log(`閫氳繃 context.worldNames 鑾峰彇鍒?${context.worldNames.length} 鏈笘鐣屼功`);
                    return [...context.worldNames];
                }
            }
            const worldInfoSelect = document.getElementById('world_info');
            if (worldInfoSelect) {
                const options = worldInfoSelect.querySelectorAll('option');
                const names = [];
                options.forEach(opt => {
                    const name = opt.textContent?.trim();
                    // 杩囨护 None / 鈥?None 鈥?鍗犱綅椤癸紙鍏ㄨ銆佸崐瑙掔牬鎶樺彿鍧囬€傞厤锛?
                    const normalized = (name || '').toLowerCase().replace(/[\s鈥?]/g, '');
                    if (name && normalized !== '' && normalized !== 'none') {
                        names.push(name);
                    }
                });
                if (names.length > 0) {
                    Logger.log(`閫氳繃 DOM #world_info 鑾峰彇鍒?${names.length} 鏈笘鐣屼功`);
                    return names;
                }
            }
            Logger.warn('鏃犳硶鑾峰彇涓栫晫涔﹀垪琛?');
            return [];
        } catch (e) {
            Logger.error('鑾峰彇涓栫晫涔﹀垪琛ㄦ椂鍙戠敓閿欒:', e);
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
            throw new Error('鏃犳硶閫氳繃 Context API 鎴?Fetch API 鍔犺浇涓栫晫涔︽潯鐩?');
        } catch (e) {
            Logger.error(`鍔犺浇涓栫晫涔︽潯鐩?"${name}" 澶辫触:`, e);
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
            Logger.error(`鍔犺浇涓栫晫涔?"${name}" 澶辫触:`, e);
            return null;
        }
    }

    // 杈呭姪鍑芥暟锛氳В鏋?API 閿欒
    async function parseApiError(response) {
        const text = await response.text();
        try {
            const json = JSON.parse(text);
            if (json.error && json.error.message) {
                return json.error.message; // OpenAI 鏍煎紡
            }
            if (json.message) {
                return json.message; // 閫氱敤鏍煎紡
            }
        } catch (e) {
            // 濡傛灉涓嶆槸 JSON锛岃繑鍥為儴鍒嗘枃鏈?
            return text.slice(0, 100) + (text.length > 100 ? '...' : '');
        }
        return text; // 杩斿洖鍘熷鏂囨湰锛堝鏋滄棤娉曡В鏋愶級
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
            if (!modelName && apiUrl) throw new Error('妯″瀷鍚嶇О涓嶈兘涓虹┖');
            const apiKey = apiConfig?.apiKey || apiConfig?.key;
            const timeoutSec = (apiConfig?.timeout && apiConfig.timeout > 0) ? apiConfig.timeout : 60;
            const maxRetries = Number.isInteger(apiConfig?.maxRetries) ? Math.max(0, apiConfig.maxRetries) : 2; // 榛樿澧炲姞閲嶈瘯娆℃暟
            const baseRetryDelay = apiConfig?.retryDelayMs ?? 1000;
            const onProgress = (typeof apiConfig?.onProgress === 'function') ? apiConfig.onProgress : null;
            const onToken = (typeof apiConfig?.onToken === 'function') ? apiConfig.onToken : null;
            const enableStreaming = apiConfig?.enableStreaming !== false;
            const apiChannel = resolveApiChannel(apiConfig);
            const apiProvider = getApiProvider(apiConfig);
            const useStBackend = apiChannel === 'st-backend';

            const sleep = (ms) => new Promise(res => setTimeout(res, ms));

            // 鏅鸿兘閲嶈瘯鍒ゆ柇
            const shouldRetry = (err, status, attempt) => {
                if (attempt >= maxRetries) return false;
                if (err?.name === 'AbortError') return false; // 鐢ㄦ埛涓诲姩鍙栨秷涓嶉噸璇?

                // 缃戠粶閿欒 (status === 0 鎴?undefined) -> 閲嶈瘯
                if (!status || status === 0) return true;

                // 429 Too Many Requests -> 閲嶈瘯
                if (status === 429) return true;

                // 5xx Server Errors -> 閲嶈瘯 (500, 502, 503, 504)
                if (status >= 500) return true;

                return false;
            };

            // 璁＄畻甯︽姈鍔ㄧ殑閫€閬挎椂闂?
            const getBackoffDelay = (attempt) => {
                const exp = Math.pow(2, attempt);
                const jitter = Math.random() * 0.5 + 0.5; // 0.5 ~ 1.0 jitter
                return Math.min(baseRetryDelay * exp * jitter, 10000); // 涓婇檺 10绉?
            };

            // 缁勫悎淇″彿
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

            if (!apiUrl && useStBackend) {
                throw new Error('鏈厤缃?API URL锛屾棤娉曚娇鐢?SillyTavern 鍚庣閫氶亾');
            }

            if (!apiUrl) {
                // SillyTavern Internal API Fallback
                if (typeof SillyTavern !== 'undefined' && typeof SillyTavern.getContext === 'function') {
                    const context = SillyTavern.getContext();
                    if (context && context.generate) {
                        const displayModel = modelName || '榛樿妯″瀷';
                        Logger.log(`浣跨敤 SillyTavern 鍐呯疆 API (${displayModel})`);
                        const messages = [];
                        if (systemPrompt) messages.push({ role: 'system', content: systemPrompt });
                        messages.push({ role: 'user', content: prompt });
                        const start = performance.now();
                        const result = await context.generate(messages);
                        updateEndpointStats(endpointKey, { success: true, latency: performance.now() - start });
                        return result;
                    }
                }
                throw new Error('鏈厤缃?API 涓旀棤娉曡幏鍙?SillyTavern API');
            }
            const messages = [];
            if (systemPrompt) messages.push({ role: 'system', content: systemPrompt });
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
                        signal: mergedSignal
                        // 绉婚櫎鍙兘瀵艰嚧 Network Error 鐨勪弗鏍奸€夐」 (keepalive, mode: cors绛?
                    };
                    fetchOptions.priority = apiConfig?.priority || 'high';

                    const response = await fetch(chatUrl, fetchOptions);
                    const ttfb = performance.now() - attemptStart;
                    recordEndpointLatency(endpointKey, ttfb);

                    if (!response.ok) {
                        const errorMsg = await parseApiError(response);
                        // 鎶涘嚭甯︾姸鎬佺爜鐨勯敊璇紝浠ヤ究 catch 鍧楁崟鑾峰鐞?
                        const err = new Error(`HTTP ${response.status}: ${errorMsg}`);
                        err.status = response.status;
                        throw err;
                    }

                    // === 鎴愬姛鍝嶅簲澶勭悊 ===

                    // 澶勭悊娴佸紡
                    const contentType = response.headers.get('content-type') || '';
                    const isJsonResponse = isJsonContentType(contentType);
                    const canStream = enableStreaming && response.body && typeof response.body.getReader === 'function';
                    if (canStream && !isJsonResponse) {
                        try {
                            const content = await readStream(response.body, onToken, onProgress);
                            updateEndpointStats(endpointKey, { success: true });
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
                                return fallbackContent;
                            }
                            throw streamErr;
                        }
                    }

                    // 澶勭悊闈炴祦寮?JSON
                    const content = await parseNonStreamResponse(response);
                    if (!content) {
                        throw new Error('Empty response body');
                    }
                    if (onProgress) onProgress(100);
                    updateEndpointStats(endpointKey, { success: true });
                    return content;

                } catch (err) {
                    const status = err.status || 0; // 0 usually means network error (fetch failed)

                    if (shouldRetry(err, status, attempt)) {
                        attempt++;
                        const delay = getBackoffDelay(attempt);
                        Logger.warn(`API 寮傚父 (${status || 'Network Error'}), 閲嶈瘯 ${attempt}/${maxRetries} 鍚庣瓑寰?${Math.round(delay)}ms...`);
                        Logger.debug(`璇︾粏閿欒: ${err.message}`);
                        await sleep(delay);
                        continue;
                    }

                    // 褰诲簳澶辫触
                    if (err?.name !== 'AbortError') {
                        updateEndpointStats(endpointKey, { success: false });
                    }
                    Logger.error(`API 璋冪敤鏈€缁堝け璐? ${err.message}`);
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
        }
    }

    // 杈呭姪锛氳В鏋愰潪娴佸紡鍝嶅簲
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
        throw new Error('鏈煡鐨勫搷搴旀牸寮?');
    }

    // 杈呭姪锛氳鍙栨祦
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

        try {
            while (true) {
                const { done, value } = await reader.read();
                if (done) break;

                const chunk = decoder.decode(value, { stream: true });
                raw += chunk;
                buffer += chunk;

                const lines = buffer.split('\n');
                buffer = lines.pop() || ''; // 淇濈暀鏈畬鎴愮殑琛?

                for (const line of lines) {
                    const trimmed = line.trim();
                    if (!trimmed) continue;
                    const dataMatch = trimmed.match(/^data:\s?(.*)$/);
                    if (!dataMatch) continue;
                    const dataVal = dataMatch[1];
                    if (!dataVal || dataVal === '[DONE]') continue;
                    try {
                        const parsed = JSON.parse(dataVal);
                        const extracted = extractTextFromPayload(parsed);
                        if (extracted) {
                            const merged = mergeStreamingText(content, extracted);
                            content = merged.next;
                            if (merged.delta) {
                                charCount += merged.delta.length;
                                if (onToken) onToken(merged.delta);
                                if (onProgress) onProgress(95 * (1 - Math.exp(-charCount / 500)));
                            }
                        }
                    } catch (e) {
                        if (dataVal[0] && dataVal[0] !== '{' && dataVal[0] !== '[') {
                            const merged = mergeStreamingText(content, dataVal);
                            content = merged.next;
                            if (merged.delta) {
                                charCount += merged.delta.length;
                                if (onToken) onToken(merged.delta);
                                if (onProgress) onProgress(95 * (1 - Math.exp(-charCount / 500)));
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
            try {
                const parsed = JSON.parse(raw);
                return parseStaticResponse(parsed);
            } catch (e) { }
        }

        if (!content) throw new Error('娴佸紡鍝嶅簲涓虹┖');
        if (onProgress) onProgress(100);
        return content;
    }

    async function testEndpointConnection(apiConfig) {
        // 楠岃瘉蹇呭～瀛楁
        const apiUrl = apiConfig?.apiUrl || apiConfig?.url;
        const apiKey = apiConfig?.apiKey || apiConfig?.key;
        const model = apiConfig?.model;

        if (!apiUrl || apiUrl.trim() === '') {
            return { success: false, message: '璇峰厛濉啓 API URL' };
        }
        if (!apiKey || apiKey.trim() === '') {
            return { success: false, message: '璇峰厛濉啓 API Key' };
        }
        if (!model || model.trim() === '') {
            return { success: false, message: '璇峰厛濉啓妯″瀷鍚嶇О' };
        }

        try {
            const response = await callAI(model, '鍔犺棨鎯犲悜浣犲懠鍙紒', 'You are a test assistant.', apiConfig);
            if (response) {
                return { success: true, message: 'Test succeeded.' };
            }
            return { success: false, message: '鍝嶅簲涓虹┖' };
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

    // ========== 棰勮繛鎺?(Preconnect) ==========
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
                Logger.log(`棰勮繛鎺ュ凡娣诲姞: ${host}`);
            } catch (e) { /* ignore invalid URLs */ }
        });
    }

    // ========== 寤惰繜娴嬮噺 (Latency Measurement) ==========
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

    // ========== 鍝嶅簲缂撳瓨 (Response Cache) ==========
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
        Logger.log(`缂撳瓨鍛戒腑: ${key}`);
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
        Logger.log('鍝嶅簲缂撳瓨宸叉竻绌?');
    }

    // 鏆撮湶鍑芥暟鍒板叏灞€鍛藉悕绌洪棿
    window.WBAP.getAllWorldBookNames = getAllWorldBookNames;
    window.WBAP.loadWorldBookEntriesByName = loadWorldBookEntriesByName;
    window.WBAP.loadWorldBookByName = loadWorldBookByName;
    window.WBAP.callAI = callAI;
    window.WBAP.testEndpointConnection = testEndpointConnection;
    window.WBAP.fetchEndpointModels = fetchEndpointModels;
    // 鏂板瀵煎嚭
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

})();





