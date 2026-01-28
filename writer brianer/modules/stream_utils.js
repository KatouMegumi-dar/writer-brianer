// modules/stream_utils.js
/**
 * stream_utils.js
 * Thin wrapper for legacy streaming API usage.
 */

(function () {
    'use strict';

    window.WBAP = window.WBAP || {};
    function buildPrompts(messages) {
        if (!Array.isArray(messages)) {
            return { systemPrompt: '', userPrompt: '' };
        }
        let systemPrompt = '';
        const userParts = [];

        messages.forEach(msg => {
            if (!msg) return;
            const role = msg.role || '';
            const content = msg.content ?? '';
            if (role === 'system' && !systemPrompt) {
                systemPrompt = content;
                return;
            }
            if (content) userParts.push(content);
        });

        return { systemPrompt, userPrompt: userParts.join('\n') };
    }

    function streamCompletion(apiConfig, messages, onChunk, onDone, onError) {
        const controller = new AbortController();
        const handleChunk = typeof onChunk === 'function' ? onChunk : null;
        const handleDone = typeof onDone === 'function' ? onDone : null;
        const handleError = typeof onError === 'function' ? onError : null;

        const model = apiConfig?.model;
        if (!model) {
            const err = new Error('Model is required for streaming.');
            if (handleError) handleError(err);
            return controller;
        }
        if (!WBAP.callAI) {
            const err = new Error('callAI is not available.');
            if (handleError) handleError(err);
            return controller;
        }

        const { systemPrompt, userPrompt } = buildPrompts(messages);

        Promise.resolve().then(async () => {
            try {
                const result = await WBAP.callAI(model, userPrompt, systemPrompt, {
                    ...apiConfig,
                    signal: controller.signal,
                    onToken: handleChunk || undefined
                });
                if (handleDone) handleDone(result);
            } catch (err) {
                if (handleError) handleError(err);
            }
        });

        return controller;
    }

    window.WBAP.StreamUtils = {
        streamCompletion
    };

})();