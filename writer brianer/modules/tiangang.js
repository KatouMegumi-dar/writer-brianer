// modules/tiangang.js
(function () {
    'use strict';

    window.WBAP = window.WBAP || {};
    const Logger = WBAP.Logger || console;

    function getConfig() {
        if (WBAP.CharacterManager && typeof WBAP.CharacterManager.getCurrentCharacterConfig === 'function') {
            return WBAP.CharacterManager.getCurrentCharacterConfig() || {};
        }
        return WBAP.config || {};
    }

    function getGlobalPools() {
        return WBAP.getGlobalPools ? WBAP.getGlobalPools() : (WBAP.mainConfig?.globalPools || {});
    }

    function getTiangangPromptPool() {
        const pools = getGlobalPools();
        if (!pools.prompts) pools.prompts = {};
        if (!Array.isArray(pools.prompts.tiangang)) {
            pools.prompts.tiangang = [];
        }
        if (pools.prompts.tiangang.length === 0) {
            pools.prompts.tiangang = [WBAP.createDefaultTiangangPromptPreset ? WBAP.createDefaultTiangangPromptPreset() : {}];
            WBAP.saveConfig?.();
        }
        return pools.prompts.tiangang;
    }

    function getTiangangApiProfile() {
        const pools = getGlobalPools();
        if (!pools.tiangang) pools.tiangang = {};
        if (!pools.tiangang.apiConfig) {
            pools.tiangang.apiConfig = WBAP.createDefaultTiangangApiProfile
                ? WBAP.createDefaultTiangangApiProfile()
                : {
                    apiUrl: '',
                    apiKey: '',
                    model: '',
                    maxTokens: 2000,
                    temperature: 0.7,
                    timeout: 60,
                    maxRetries: 1,
                    retryDelayMs: 800
                };
        }
        return pools.tiangang.apiConfig;
    }

    function ensureTiangangConfig(config) {
        if (!config?.tiangang) return null;
        const tgCfg = config.tiangang;
        const prompts = getTiangangPromptPool();
        if (tgCfg.selectedPromptIndex == null) tgCfg.selectedPromptIndex = 0;
        if (tgCfg.selectedPromptIndex >= prompts.length) {
            tgCfg.selectedPromptIndex = prompts.length > 0 ? prompts.length - 1 : 0;
        }
        if (!Array.isArray(tgCfg.worldBooks)) tgCfg.worldBooks = [];
        if (!tgCfg.assignedEntriesMap) tgCfg.assignedEntriesMap = {};
        return tgCfg;
    }

    function normalizeApiConfig(apiConfig, defaultTimeout, signal) {
        const timeout = (defaultTimeout > 0)
            ? defaultTimeout
            : ((apiConfig.timeout > 0) ? apiConfig.timeout : undefined);
        const maxRetries = Number.isInteger(apiConfig.maxRetries) ? Math.max(0, apiConfig.maxRetries) : 2;
        const retryDelayMs = Number.isFinite(apiConfig.retryDelayMs) ? apiConfig.retryDelayMs : 800;
        const enableStreaming = apiConfig.enableStreaming !== false;
        return {
            ...apiConfig,
            apiUrl: apiConfig.apiUrl || apiConfig.url || '',
            apiKey: apiConfig.apiKey || apiConfig.key || '',
            timeout: timeout,
            maxRetries: maxRetries,
            retryDelayMs: retryDelayMs,
            enableStreaming: enableStreaming,
            priority: apiConfig.priority || 'high',
            signal: signal
        };
    }

    function isTableWorldBook(book) {
        if (!book || !book.entries) return false;
        const entries = Object.values(book.entries).filter(e => e && e.disable !== true);
        if (entries.length === 0) return false;

        const comments = entries.map(e => e.comment || '');
        const indexCount = comments.filter(c => /Index\s+for\s+/i.test(c)).length;
        const detailPatternCount = comments.filter(c => /Detail:\s*.+?-/.test(c)).length;

        const columnCounts = {};
        comments.forEach((c, idx) => {
            const col = normalizeTableColumnName(c, String(idx));
            columnCounts[col] = (columnCounts[col] || 0) + 1;
        });
        const repeatedColumns = Object.values(columnCounts).filter(n => n >= 2).length;

        if (indexCount >= 3) return true;
        if (detailPatternCount >= 5 && repeatedColumns >= 3) return true;
        return false;
    }

    function normalizeTableColumnName(comment = '', entryId = '') {
        const trimmed = (comment || '').trim();
        const fallback = 'Unnamed Column';
        if (!trimmed) return fallback;
        const detailMatch = trimmed.match(/Detail:\s*([^-]+?)(\s*-\s*.*)?$/i);
        if (detailMatch) {
            return detailMatch[1].trim() || fallback;
        }
        const indexMatch = trimmed.match(/Index\s+for\s+(.+?)$/i);
        if (indexMatch) {
            return indexMatch[1].trim() || fallback;
        }
        const bracketMatch = trimmed.match(/\u3010([^\u3011]+)\u3011/);
        if (bracketMatch) {
            return bracketMatch[1].trim() || fallback;
        }
        const parts = trimmed.split(/\s*-\s*/);
        if (parts.length > 1) return parts[0].trim() || fallback;
        return trimmed || entryId || fallback;
    }

    function buildWorldbookContentForBook(book, selectedIds = []) {
        if (!book || !book.entries) return '';
        const enabledEntries = Object.entries(book.entries).filter(([, entry]) => entry && entry.disable !== true);
        if (enabledEntries.length === 0) return '';

        const tableLike = isTableWorldBook(book);
        if (tableLike) {
            const selectedColumns = new Set();
            if (Array.isArray(selectedIds) && selectedIds.length > 0) {
                selectedIds.forEach(id => {
                    const entry = book.entries[id];
                    if (entry && entry.disable !== true) {
                        selectedColumns.add(normalizeTableColumnName(entry.comment, id));
                    }
                });
            }
            const entriesForSelection = selectedColumns.size > 0
                ? enabledEntries.filter(([uid, entry]) => selectedColumns.has(normalizeTableColumnName(entry.comment, uid)))
                : enabledEntries;
            if (entriesForSelection.length === 0) return '';

            const columnBest = new Map();
            entriesForSelection.forEach(([uid, entry]) => {
                const colName = normalizeTableColumnName(entry.comment, uid);
                const isIndex = /Index\s+for\s+/i.test(entry.comment || '');
                const len = (entry.content || '').length;
                const existing = columnBest.get(colName);
                if (!existing) {
                    columnBest.set(colName, { uid, entry, isIndex, len });
                } else if (!existing.isIndex && isIndex) {
                    columnBest.set(colName, { uid, entry, isIndex, len });
                } else if (existing.isIndex === isIndex && len > existing.len) {
                    columnBest.set(colName, { uid, entry, isIndex, len });
                }
            });

            const columnBlocks = [];
            columnBest.forEach((info, name) => {
                columnBlocks.push(`[${name}]\n${info.entry.content || ''}`);
            });
            return columnBlocks.join('\n\n').trim();
        }

        const filtered = Array.isArray(selectedIds) && selectedIds.length > 0
            ? enabledEntries.filter(([uid]) => selectedIds.includes(uid))
            : enabledEntries;
        if (filtered.length === 0) return '';
        return filtered.map(([uid, entry]) => `[${entry.comment || uid}]\n${entry.content || ''}`).join('\n\n').trim();
    }

    async function buildWorldbookContent(tgCfg) {
        const names = Array.isArray(tgCfg.worldBooks) ? tgCfg.worldBooks.filter(Boolean) : [];
        if (names.length === 0) return '';
        const loaded = await Promise.all(names.map(name => WBAP.loadWorldBookEntriesByName?.(name)));
        const blocks = [];
        names.forEach((name, idx) => {
            const book = loaded[idx];
            if (!book || !book.entries) return;
            const selected = Array.isArray(tgCfg.assignedEntriesMap?.[name]) ? tgCfg.assignedEntriesMap[name] : [];
            const block = buildWorldbookContentForBook(book, selected);
            if (!block) return;
            blocks.push(`\u3010${name}\u3011\n${block}`);
        });
        return blocks.join('\n\n').trim();
    }

    function getSelectedPrompt(tgCfg) {
        const prompts = getTiangangPromptPool();
        let idx = tgCfg.selectedPromptIndex ?? 0;
        if (idx < 0 || idx >= prompts.length) idx = 0;
        return prompts[idx] || null;
    }

    async function process(inputText, options = {}) {
        const config = options.config || getConfig();
        const tgCfg = ensureTiangangConfig(config);
        if (!tgCfg || tgCfg.enabled !== true) return null;

        const promptTemplate = getSelectedPrompt(tgCfg);
        if (!promptTemplate) {
            Logger.warn('Tiangang skipped: no prompt template');
            return null;
        }

        const apiCfg = getTiangangApiProfile();
        const hasInternalApi = typeof SillyTavern !== 'undefined' && SillyTavern.getContext && SillyTavern.getContext()?.generate;
        const hasExternalApi = !!(apiCfg.apiUrl || apiCfg.url);
        const hasModel = !!apiCfg.model;
        if (!hasModel && !hasExternalApi && !hasInternalApi) {
            Logger.warn('Tiangang skipped: no API/model configured');
            return null;
        }
        if (!hasModel && hasExternalApi) {
            Logger.warn('Tiangang skipped: model is missing');
            return null;
        }

        const worldbookContent = await buildWorldbookContent(tgCfg);
        const userInput = options.userInput || '';
        const context = options.context || '';

        const promptBuilder = WBAP.buildPromptFromTemplate;
        if (typeof promptBuilder !== 'function') {
            Logger.warn('Tiangang skipped: prompt builder unavailable');
            return null;
        }

        const prompts = promptBuilder(promptTemplate, {
            userInput,
            worldbookContent,
            context,
            previousResults: inputText
        });

        const externalSignal = options.signal;
        const controller = externalSignal ? null : new AbortController();
        const activeSignal = externalSignal || controller?.signal;
        const showProgress = !options.suppressProgress && config?.showProgressPanel && WBAP.UI;
        const taskId = 'wbap-tiagang';
        if (showProgress) {
            WBAP.UI.showProgressPanel('\u5929\u7eb2\u5904\u7406\u4e2d...', 1);
            WBAP.UI.addProgressTask(taskId, '\u5929\u7eb2\u5904\u7406', '\u7b49\u5f85\u4e2d...');
            if (controller) {
                WBAP.UI.setCancelAllCallback?.(() => controller.abort());
                WBAP.UI.setCancelTaskCallback?.(taskId, () => controller.abort());
            }
            WBAP.UI.updateProgressTask(taskId, '\u5904\u7406\u4e2d...', 10);
        }

        try {
            const normalizedConfig = normalizeApiConfig(apiCfg, options.defaultTimeout || 0, activeSignal);
            const result = await WBAP.callAI(
                normalizedConfig.model,
                prompts.user,
                prompts.system,
                { ...normalizedConfig }
            );
            const finalText = typeof result === 'string' ? result.trim() : '';
            if (showProgress) {
                WBAP.UI.updateProgressTask(taskId, '\u5b8c\u6210', 100);
            }
            return finalText || null;
        } catch (err) {
            const isAbort = err?.name === 'AbortError';
            const message = isAbort ? '\u5df2\u7ec8\u6b62' : (err?.message || 'Unknown error');
            if (showProgress) {
                const statusText = isAbort ? '\u5df2\u7ec8\u6b62' : `\u5931\u8d25: ${message.substring(0, 20)}`;
                WBAP.UI.updateProgressTask(taskId, statusText, 100);
            }
            Logger.error('Tiangang processing failed', err);
            return null;
        }
    }

    window.WBAP.Tiangang = {
        process,
        buildWorldbookContent
    };
})();
