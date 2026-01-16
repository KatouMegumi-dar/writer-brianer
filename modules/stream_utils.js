/**
 * stream_utils.js
 * Handles streaming API requests for the Writer Brianer plugin.
 */

(function () {
    const Logger = window.WBAP.Logger;

    /**
     * Parses a stream chunk from OpenAI-compatible API.
     * @param {string} chunk - The raw chunk string.
     * @returns {string} - The extracted content delta.
     */
    function parseStreamChunk(chunk) {
        const lines = chunk.split('\n');
        let delta = '';

        for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed || trimmed === 'data: [DONE]') continue;
            if (trimmed.startsWith('data: ')) {
                try {
                    const jsonStr = trimmed.substring(6);
                    const json = JSON.parse(jsonStr);
                    if (json.choices && json.choices.length > 0) {
                        const choice = json.choices[0];
                        if (choice.delta && choice.delta.content) {
                            delta += choice.delta.content;
                        } else if (choice.text) {
                            // Legacy completion format support
                            delta += choice.text;
                        }
                    }
                } catch (e) {
                    // Ignore parse errors for partial chunks
                }
            }
        }
        return delta;
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
    async function streamCompletion(apiConfig, messages, onChunk, onDone, onError) {
        const controller = new AbortController();
        const signal = controller.signal;
        let fullText = '';

        try {
            const url = apiConfig.apiUrl.endsWith('/') ? `${apiConfig.apiUrl}chat/completions` : `${apiConfig.apiUrl}/chat/completions`;

            const headers = {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiConfig.apiKey}`
            };

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

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;

                const chunk = decoder.decode(value, { stream: true });
                buffer += chunk;

                // Process complete lines in buffer
                const lines = buffer.split('\n');
                // Keep the last line in buffer if it's incomplete (doesn't end with \n)
                // Actually, split removes separators. If the last char wasn't \n, the last item is partial.
                // But data: lines are usually usually complete.
                // Safer approach: split by data: prefix?
                // Standard SSE format is double newline separated.

                // Simplified buffer handling for standard SSE
                buffer = lines.pop() || '';

                for (const line of lines) {
                    const content = parseStreamChunk(line);
                    if (content) {
                        fullText += content;
                        onChunk(content);
                    }
                }
            }

            // Process remaining buffer
            if (buffer) {
                const content = parseStreamChunk(buffer);
                if (content) {
                    fullText += content;
                    onChunk(content);
                }
            }

            onDone(fullText);

        } catch (err) {
            if (err.name === 'AbortError') {
                // Ignore aborts
            } else {
                onError(err);
            }
        }

        return controller;
    }

    // Expose
    window.WBAP = window.WBAP || {};
    window.WBAP.StreamUtils = {
        streamCompletion
    };

})();
