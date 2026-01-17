/**
 * stream_utils.js
 * Handles streaming API requests for the Writer Brianer plugin.
 */

(function () {

    /**
     * Parses a single SSE data line from OpenAI-compatible API.
     * @param {string} line - The raw SSE line.
     * @returns {string} - The extracted content delta.
     */
    function parseStreamLine(line) {
        const trimmed = line.trim();
        if (!trimmed || trimmed === 'data: [DONE]') return '';
        if (!trimmed.startsWith('data: ')) return '';
        try {
            const jsonStr = trimmed.substring(6);
            const json = JSON.parse(jsonStr);
            if (json.choices && json.choices.length > 0) {
                const choice = json.choices[0];
                if (choice.delta && choice.delta.content) {
                    return choice.delta.content;
                }
                if (choice.text) {
                    // Legacy completion format support
                    return choice.text;
                }
            }
        } catch (e) {
            // Ignore parse errors for partial chunks
        }
        return '';
    }

    function resolveChatCompletionUrl(rawUrl) {
        const trimmedUrl = String(rawUrl || '').replace(/\/+$/, '');
        if (!trimmedUrl) return '';
        if (/\/(chat\/)?completions$/i.test(trimmedUrl)) {
            return trimmedUrl;
        }
        if (/\/v1$/i.test(trimmedUrl)) {
            return `${trimmedUrl}/chat/completions`;
        }
        return `${trimmedUrl}/v1/chat/completions`;
    }

    /**
     * Calls the AI endpoint with streaming enabled.
     * @param {object} apiConfig - The API configuration.
     * @param {array} messages - Array of message objects [{role, content}].
     * @param {function} onChunk - Callback for each text chunk: (text) => void.
     * @param {function} onDone - Callback when stream completes: (fullText) => void.
     * @param {function} onError - Callback for errors: (err) => void.
     * @returns {AbortController} - Controller to abort the request.
     */
    function streamCompletion(apiConfig, messages, onChunk, onDone, onError) {
        const controller = new AbortController();
        const signal = controller.signal;
        const handleChunk = typeof onChunk === 'function' ? onChunk : null;
        const handleDone = typeof onDone === 'function' ? onDone : null;
        const handleError = typeof onError === 'function' ? onError : null;
        let fullText = '';
        const timeoutSec = Number(apiConfig?.timeout);
        const timeoutMs = Number.isFinite(timeoutSec) && timeoutSec > 0 ? timeoutSec * 1000 : 0;
        const timeoutId = timeoutMs > 0 ? setTimeout(() => controller.abort(), timeoutMs) : null;

        const run = async () => {
            try {
                const rawUrl = apiConfig.apiUrl || apiConfig.url;
                const url = resolveChatCompletionUrl(rawUrl);
                if (!url) {
                    throw new Error('API URL is required for streaming.');
                }

                const apiKey = apiConfig.apiKey || apiConfig.key;
                const headers = {
                    'Content-Type': 'application/json',
                    'Accept': 'text/event-stream'
                };
                if (apiKey) {
                    headers['Authorization'] = `Bearer ${apiKey}`;
                }
                if (apiConfig.extraHeaders) {
                    Object.assign(headers, apiConfig.extraHeaders);
                }

                const body = {
                    model: apiConfig.model,
                    messages: messages,
                    stream: true,
                    max_tokens: apiConfig.maxTokens || 2000,
                    temperature: apiConfig.temperature || 0.7,
                    top_p: apiConfig.topP || 1,
                    presence_penalty: apiConfig.presencePenalty || 0,
                    frequency_penalty: apiConfig.frequencyPenalty || 0
                };

                const response = await fetch(url, {
                    method: 'POST',
                    headers: headers,
                    body: JSON.stringify(body),
                    signal: signal
                });

                if (!response.ok) {
                    const errText = await response.text();
                    throw new Error(`API Error ${response.status}: ${errText}`);
                }

                if (!response.body) {
                    throw new Error('Response body is null (Streaming not supported?)');
                }

                const reader = response.body.getReader();
                const decoder = new TextDecoder('utf-8');
                let buffer = '';

                try {
                    while (true) {
                        const { done, value } = await reader.read();
                        if (done) break;

                        const chunk = decoder.decode(value, { stream: true });
                        buffer += chunk;

                        const lines = buffer.split('\n');
                        buffer = lines.pop() || '';

                        for (const line of lines) {
                            const content = parseStreamLine(line);
                            if (content) {
                                fullText += content;
                                if (handleChunk) handleChunk(content);
                            }
                        }
                    }

                    if (buffer) {
                        const content = parseStreamLine(buffer);
                        if (content) {
                            fullText += content;
                            if (handleChunk) handleChunk(content);
                        }
                    }
                } finally {
                    reader.releaseLock();
                }

                if (handleDone) handleDone(fullText);
            } catch (err) {
                if (handleError) {
                    handleError(err);
                }
            } finally {
                if (timeoutId) {
                    clearTimeout(timeoutId);
                }
            }
        };

        void run();
        return controller;
    }

    // Expose
    window.WBAP = window.WBAP || {};
    window.WBAP.StreamUtils = {
        streamCompletion
    };

})();
