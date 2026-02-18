// modules/processing.js

(function () {
    'use strict';

    // Ensure namespace
    window.WBAP = window.WBAP || {};
    const Logger = WBAP.Logger;
    const ANALYSIS_SUMMARY_TITLE = '背景分析';
    const TAG_CONTEXT_PROMPT_TEMPLATE = [
        '【背景资料使用约束】',
        '目标名称：{tag_name}',
        '',
        '请注意：与“{tag_name}”相关的一切资料仅可作为背景事实参考，用于避免理解偏差，不得作为独立分析对象。',
        '禁止事项（必须严格遵守）：',
        '- 不得单独分析或讨论“{tag_name}”本身；',
        '- 不得在输出中出现与“{tag_name}”相关的心理活动、情感倾向、行动动机、行为预测、角色标签或评价；',
        '- 不得以列表、注释、补充说明、旁白等形式直接或间接输出“{tag_name}”相关信息。',
        '',
        '允许事项：',
        '- 在不显式提及“{tag_name}”或其相关资料的前提下，用于整体背景一致性与事实校验。',
        '',
        '若无法避免，请优先保证输出中不出现任何与“{tag_name}”有关的情感/心理/行动类描述。'
    ].join('\n');

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
    const ANALYSIS_BLOCK_REGEX = new RegExp(
        `<details[^>]*data-wbap\\s*=\\s*["']analysis["'][\\s\\S]*?<\\/details>|` +
        `<details[^>]*>\\s*<summary>\\s*(?:${SUMMARY_PATTERN})\\s*<\\/summary>[\\s\\S]*?<\\/details>`,
        'gi'
    );
    const TIANGANG_SUMMARY_TITLE = '天纲';
    const MEMORY_BLOCK_REGEX = /<memory>[\s\S]*?<\/memory>/gi;
    const PLOT_BLOCK_REGEX = /<plot_progression>[\s\S]*?<\/plot_progression>/gi;

    function getGlobalPools() {
        return WBAP.getGlobalPools ? WBAP.getGlobalPools() : (WBAP.mainConfig?.globalPools || {});
    }

    function getGlobalSettings() {
        return WBAP.mainConfig?.globalSettings || {};
    }

    // 获取 showProgressPanel 设置，优先使用全局设置
    function shouldShowProgressPanel(config) {
        const globalSettings = getGlobalSettings();
        if (globalSettings.showProgressPanel !== undefined) {
            return globalSettings.showProgressPanel;
        }
        return config?.showProgressPanel !== false;
    }

    function getSelectiveEndpoints() {
        const pools = getGlobalPools();
        return Array.isArray(pools?.selectiveMode?.apiEndpoints) ? pools.selectiveMode.apiEndpoints : [];
    }

    function getEndpointBinding(config, endpointId) {
        const bindings = config?.selectiveMode?.endpointBindings || {};
        const binding = bindings[endpointId] || {};
        return {
            worldBooks: Array.isArray(binding.worldBooks) ? binding.worldBooks : [],
            assignedEntriesMap: binding.assignedEntriesMap || {}
        };
    }


    function stripInjectedBlocks(text) {
        if (!text || typeof text !== 'string') return '';
        return text
            .replace(ANALYSIS_BLOCK_REGEX, '')
            .replace(MEMORY_BLOCK_REGEX, '')
            .replace(PLOT_BLOCK_REGEX, '')
            .trim();
    }

    function getCurrentChatContext() {
        try {
            const context = SillyTavern.getContext();
            return context.chat || [];
        } catch (e) {
            Logger.error('Failed to read chat context', e);
            return [];
        }
    }

    function getRecentContext(chat, contextRounds) {
        const rounds = Number.isFinite(contextRounds) ? contextRounds : 0;
        if (rounds <= 0) return '';
        const maxMessages = rounds * 2;
        const recent = chat.slice(-maxMessages);
        return recent.map(msg => {
            const role = msg.role || (msg.is_user ? 'user' : 'assistant');
            let content = msg.content || msg.mes || '';
            // Strip injected analysis blocks to avoid recursion (兼容旧版乱码标题/编码问题)
            content = content.replace(ANALYSIS_BLOCK_REGEX, '').trim();
            return `${role}: ${content}`;
        }).join('\n\n');
    }

    function applyPromptVariables(promptText, variables) {
        if (!promptText || !variables) {
            return promptText;
        }

        let processedText = promptText;
        for (let i = 1; i <= 4; i++) {
            const key = `sulv${i}`;
            const value = variables[key] || '';

            // Handle @VAR = sulv1 or @VAR=sulv1
            const regex1 = new RegExp(`@([a-zA-Z0-9_]+)\\s*=\\s*${key}`, 'g');
            processedText = processedText.replace(regex1, (match, varName) => {
                return `@${varName}=${value}`;
            });

            // Handle {sulv1}
            const regex2 = new RegExp(`\\{${key}\\}`, 'g');
            processedText = processedText.replace(regex2, value);
        }
        return processedText;
    }

    function replaceAllPlaceholders(text, placeholder, value) {
        if (typeof text !== 'string') return text;
        return text.split(placeholder).join(value ?? '');
    }

    function replaceExtraPlaceholders(text, extraVars) {
        if (typeof text !== 'string' || !extraVars) return text;
        let output = text;
        Object.entries(extraVars).forEach(([key, value]) => {
            output = output.split(`{${key}}`).join(value ?? '');
        });
        return output;
    }

    // Normalize Tiangang output: ensure explicit prefix and trimmed text
    function formatTiangangOutput(tgText) {
        const tgRaw = typeof tgText === 'string' ? tgText.trim() : '';
        if (!tgRaw) return '';
        const tgPrefixPattern = /^(?:\u3010?\u5929\u7eb2\u3011?|\u5929\u7eb2[:\uFF1A]|\[\u5929\u7eb2\])/;
        return tgPrefixPattern.test(tgRaw) ? tgRaw : `\u3010\u5929\u7eb2\u3011\n${tgRaw}`;
    }

    function getSelectedWorldBooksFromUI() {
        const select = document.getElementById('world_info') || document.getElementById('character_world');
        if (!select) return [];
        const options = select.selectedOptions ? Array.from(select.selectedOptions) : [];
        const names = options.map(opt => (opt.textContent || opt.value || '').trim());
        if (!select.multiple && names.length === 0 && select.value) {
            names.push(String(select.value).trim());
        }
        return names.filter(name => {
            const normalized = (name || '').toLowerCase().replace(/[\s—-]/g, '');
            return normalized !== '' && normalized !== 'none' && normalized !== '—none—';
        });
    }

    function splitTextIntoChunks(text, chunkSize = 4000) {
        const paragraphs = text.split(/\n\s*\n/);
        const chunks = [];
        let currentChunk = '';

        for (const p of paragraphs) {
            if (currentChunk.length + p.length + 2 > chunkSize && currentChunk.length > 0) {
                chunks.push(currentChunk);
                currentChunk = '';
            }
            if (p.length > chunkSize) {
                const sentences = p.split(/(?<=[.!?\u3002\uff1f\uff01])\s+/);
                let tempChunk = '';
                for (const s of sentences) {
                    if (tempChunk.length + s.length + 1 > chunkSize && tempChunk.length > 0) {
                        chunks.push(tempChunk);
                        tempChunk = '';
                    }
                    tempChunk += (tempChunk.length > 0 ? ' ' : '') + s;
                }
                if (tempChunk.length > 0) {
                    chunks.push(tempChunk);
                }
            } else {
                currentChunk += (currentChunk.length > 0 ? '\n\n' : '') + p;
            }
        }

        if (currentChunk.length > 0) {
            chunks.push(currentChunk);
        }

        return chunks;
    }

    // 检查条目是否应该被排除（基于标签）
    function shouldExcludeEntry(entry, excludeTags) {
        if (!excludeTags || excludeTags.length === 0) return false;
        if (!entry) return false;

        // 检查条目的 secondary_keys（标签）
        const entryTags = Array.isArray(entry.secondary_keys)
            ? entry.secondary_keys.map(t => String(t).trim().toLowerCase()).filter(Boolean)
            : [];

        // 检查条目的 key（主键）
        const entryKey = String(entry.key || '').trim().toLowerCase();

        // 检查条目的 comment（注释）
        const entryComment = String(entry.comment || '').trim().toLowerCase();

        // 如果条目的任何标签、主键或注释匹配排除列表，则排除
        for (const excludeTag of excludeTags) {
            if (entryTags.includes(excludeTag)) return true;
            if (entryKey.includes(excludeTag)) return true;
            if (entryComment.includes(excludeTag)) return true;
        }

        return false;
    }

    // Build prompts (system + user) with injected context and worldbook content
    function buildPromptFromTemplate(promptTemplate, { userInput, worldbookContent, context, previousResults, extraVars, systemAppend }) {
        const tpl = promptTemplate || {};
        const vars = tpl.variables || {};

        let systemPromptRaw = tpl.systemPrompt || '';
        let finalDirective = tpl.finalSystemDirective || '';
        let mainPromptRaw = tpl.mainPrompt || '';

        // Variable replacements (sulv1-4) and placeholders
        let systemPrompt = applyPromptVariables(systemPromptRaw, vars);
        let mainPrompt = applyPromptVariables(mainPromptRaw, vars);
        finalDirective = applyPromptVariables(finalDirective, vars);

        // Inject context/worldbook content
        systemPrompt = replaceAllPlaceholders(systemPrompt, '{context}', context || '');
        systemPrompt = replaceAllPlaceholders(systemPrompt, '{worldbook_content}', worldbookContent || '');
        systemPrompt = replaceAllPlaceholders(systemPrompt, '{user_input}', userInput || '');
        systemPrompt = replaceAllPlaceholders(systemPrompt, '{previous_results}', previousResults || '');
        finalDirective = replaceAllPlaceholders(finalDirective, '{context}', context || '');
        finalDirective = replaceAllPlaceholders(finalDirective, '{worldbook_content}', worldbookContent || '');
        finalDirective = replaceAllPlaceholders(finalDirective, '{user_input}', userInput || '');
        finalDirective = replaceAllPlaceholders(finalDirective, '{previous_results}', previousResults || '');
        finalDirective = replaceExtraPlaceholders(finalDirective, extraVars);

        // Final system prompt = finalDirective + systemPrompt
        const finalSystemPrompt = (finalDirective ? finalDirective + '\n' : '') + systemPrompt;

        // User prompt injects user input + worldbook content
        let finalMainPrompt = replaceAllPlaceholders(mainPrompt, '{user_input}', userInput || '');
        finalMainPrompt = replaceAllPlaceholders(finalMainPrompt, '{worldbook_content}', worldbookContent || '');
        finalMainPrompt = replaceAllPlaceholders(finalMainPrompt, '{context}', context || '');
        finalMainPrompt = replaceAllPlaceholders(finalMainPrompt, '{previous_results}', previousResults || '');
        finalMainPrompt = replaceExtraPlaceholders(finalMainPrompt, extraVars);

        let finalSystemWithExtras = replaceExtraPlaceholders(finalSystemPrompt, extraVars);
        const appendText = typeof systemAppend === 'string' ? systemAppend.trim() : '';
        if (appendText) {
            finalSystemWithExtras = finalSystemWithExtras
                ? `${finalSystemWithExtras}\n\n${appendText}`
                : appendText;
        }
        return { system: finalSystemWithExtras, user: finalMainPrompt };
    }

    function buildApiConfig(endpoint, defaultTimeout, signal) {
        const epTimeout = (defaultTimeout > 0)
            ? defaultTimeout
            : ((endpoint.timeout > 0) ? endpoint.timeout : undefined);
        return {
            ...endpoint,
            apiUrl: endpoint.apiUrl || endpoint.url || '',
            apiKey: endpoint.apiKey || endpoint.key || '',
            timeout: epTimeout,
            signal: signal
        };
    }

    function createAbortError(message) {
        const err = new Error(message || 'Task aborted');
        err.name = 'AbortError';
        return err;
    }

    function createConcurrencyLimiter(limit) {
        const max = Number.isFinite(limit) ? limit : 0;
        if (max <= 0) return null;
        let active = 0;
        const queue = [];
        const acquire = () => new Promise(resolve => {
            if (active < max) {
                active += 1;
                resolve();
            } else {
                queue.push(resolve);
            }
        });
        const release = () => {
            active -= 1;
            if (queue.length > 0) {
                active += 1;
                queue.shift()();
            }
        };
        return async (fn) => {
            await acquire();
            try {
                return await fn();
            } finally {
                release();
            }
        };
    }

    // Detect table-style worldbook:
    // - many "Detail: XXX - YYY" entries sharing the same column prefix
    // - or multiple "Index for XXX" entries
    function isTableWorldBook(book) {
        if (!book || !book.entries) return false;
        const entries = Object.values(book.entries).filter(e => e && e.disable !== true);
        if (entries.length === 0) return false;

        const comments = entries.map(e => e.comment || '');
        const indexCount = comments.filter(c => /Index\s+for\s+/i.test(c)).length;
        const detailPatternCount = comments.filter(c => /Detail:\s*.+?-/.test(c)).length;

        // Count how many columns have multiple entries
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

    // Normalize table column name: keep the category part before the first dash in "Detail: X - Y"
    function normalizeTableColumnName(comment = '', entryId = '') {
        const trimmed = (comment || '').trim();
        const fallback = 'Unnamed Column';
        if (!trimmed) return fallback;

        // 识别插件生成的总结书条目
        if (trimmed.endsWith('楼小总结')) {
            return '小总结';
        }
        if (trimmed.endsWith('楼大总结')) {
            return '大总结';
        }

        // 原有逻辑
        const detailMatch = trimmed.match(/Detail:\s*([^-]+?)(\s*-\s*.*)?$/i);
        if (detailMatch) {
            return detailMatch[1].trim() || fallback;
        }
        const indexMatch = trimmed.match(/Index\s+for\s+(.+?)$/i);
        if (indexMatch) {
            return indexMatch[1].trim() || fallback;
        }
        const bracketMatch = trimmed.match(/【([^】]+)】/);
        if (bracketMatch) {
            return bracketMatch[1].trim() || fallback;
        }
        const parts = trimmed.split(/\s*-\s*/);
        if (parts.length > 1) return parts[0].trim() || fallback;
        return trimmed || entryId || fallback;
    }

    function buildWorldBookContent(book) {
        if (!book || !book.entries) return '';
        const enabledEntries = Object.entries(book.entries).filter(([, e]) => e && e.disable !== true);
        if (enabledEntries.length === 0) return '';

        const tableLike = isTableWorldBook(book);
        if (tableLike) {
            // 对于插件总结书，需要保留所有条目而不是只选最佳的
            const summaryEntries = { '大总结': [], '小总结': [] };
            const columnBest = new Map();

            enabledEntries.forEach(([uid, entry]) => {
                const colName = normalizeTableColumnName(entry.comment, uid);

                // 插件总结书：收集所有条目
                if (colName === '大总结' || colName === '小总结') {
                    summaryEntries[colName].push({ uid, entry });
                } else {
                    // 原有逻辑：Amily 表格书只保留最佳条目
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
                }
            });

            const columnBlocks = [];

            // 处理插件总结书
            ['大总结', '小总结'].forEach(summaryType => {
                const entries = summaryEntries[summaryType];
                if (entries.length > 0) {
                    let minFloor = Infinity;
                    let maxFloor = -Infinity;
                    const contents = [];

                    entries.forEach(({ entry }) => {
                        const comment = entry.comment || '';
                        const match = comment.match(/^(\d+)-(\d+)楼/);
                        if (match) {
                            minFloor = Math.min(minFloor, parseInt(match[1]));
                            maxFloor = Math.max(maxFloor, parseInt(match[2]));
                        }
                        if (entry.content) {
                            contents.push(entry.content);
                        }
                    });

                    if (contents.length > 0) {
                        const displayName = minFloor !== Infinity
                            ? `${summaryType}（${minFloor}-${maxFloor}层）`
                            : summaryType;
                        columnBlocks.push(`[${displayName}]\n${contents.join('\n\n')}`);
                    }
                }
            });

            // 处理 Amily 表格书
            columnBest.forEach((info, name) => {
                columnBlocks.push(`[${name}]\n${info.entry.content || ''}`);
            });

            return columnBlocks.join('\n\n').trim();
        }

        let content = '';
        enabledEntries.forEach(([uid, entry]) => {
            content += `[${entry.comment || uid}]\n${entry.content}\n\n`;
        });
        return content.trim();
    }

    function entryMatchesTag(entry, tagLower) {
        if (!entry || !tagLower) return false;
        const comment = String(entry.comment || '');
        const content = String(entry.content || '');
        const haystack = `${comment}\n${content}`.toLowerCase();
        return haystack.includes(tagLower);
    }

    function buildTagEntryBlock(entry, entryId, bookName) {
        const title = entry?.comment || entryId || '未命名条目';
        const bookLabel = bookName ? `【世界书：${bookName}】` : '【世界书】';
        const content = entry?.content || '';
        return `${bookLabel} ${title}\n${content}`.trim();
    }

    function buildTagContextPrompt(tagName, entryBlocks = []) {
        if (!tagName) return '';
        const constraint = TAG_CONTEXT_PROMPT_TEMPLATE.replace(/{tag_name}/g, tagName);
        if (!entryBlocks || entryBlocks.length === 0) {
            return `${constraint}\n\n【相关资料】\n（未检索到相关资料）`;
        }
        return `${constraint}\n\n【相关资料】\n${entryBlocks.join('\n\n')}`;
    }

    async function buildCabinetWorldbookContent(bookName, loadWorldBookEntriesByName, fallbackNames = []) {
        let names = bookName ? [bookName] : getSelectedWorldBooksFromUI();
        if (!names || names.length === 0) {
            names = Array.isArray(fallbackNames) ? fallbackNames : [];
        }
        if (!names || names.length === 0) return '';
        names = Array.from(new Set(names.filter(Boolean)));
        const loaded = await Promise.all(names.map(name => loadWorldBookEntriesByName(name)));
        const blocks = [];
        names.forEach((name, idx) => {
            const book = loaded[idx];
            if (!book || !book.entries) {
                Logger.warn(`Worldbook "${name}" could not be loaded and will be skipped.`);
                return;
            }
            const content = buildWorldBookContent(book);
            if (content) {
                blocks.push(`[世界书：${name}]\n${content}`);
            }
        });
        return blocks.join('\n\n').trim();
    }

    function getEndpointDisplayName(endpoint) {
        if (!endpoint) return '';
        return endpoint.name || endpoint.model || endpoint.id || '';
    }

    function formatCabinetResults(outputs, labelMap, roundLabel, excludeId) {
        const blocks = [];
        outputs.forEach(output => {
            if (!output || output.endpointId === excludeId) return;
            const label = labelMap.get(output.endpointId) || output.name || output.endpointId || '大学士';
            const roundText = roundLabel ? ` · ${roundLabel}` : '';
            blocks.push(`【${label}${roundText}】\n${output.content || ''}`);
        });
        return blocks.join('\n\n').trim();
    }

    async function runCabinetDiscussion({
        userInput,
        bookName,
        context,
        config,
        mainConfig,
        callAI,
        loadWorldBookEntriesByName,
        abortMessage
    }) {
        // 检测进度面板是否已打开（可能由 interceptor 打开）
        const cabinetPanelAlreadyOpen = WBAP.UI?.isProgressPanelOpen?.();

        if (!config || !config.selectiveMode) {
            Logger.warn('Cabinet skipped: config not initialized.');
            return null;
        }
        const globalSettings = mainConfig?.globalSettings || {};
        const maxConcurrent = globalSettings.maxConcurrent || 0;
        const defaultTimeout = globalSettings.timeout || 0;
        const pools = getGlobalPools();
        const superCfg = WBAP.ensureSuperConcurrencyConfig ? WBAP.ensureSuperConcurrencyConfig(config) : (config.superConcurrency || {});
        const prompts = Array.isArray(pools?.prompts?.cabinet) ? pools.prompts.cabinet : [];
        let promptIndex = superCfg.selectedPromptIndex ?? 0;
        if (promptIndex < 0 || promptIndex >= prompts.length) promptIndex = 0;
        const promptTemplate = { ...(prompts[promptIndex] || {}) };
        if (!promptTemplate.mainPrompt && promptTemplate.promptTemplate) {
            promptTemplate.mainPrompt = promptTemplate.promptTemplate;
            delete promptTemplate.promptTemplate;
        }
        if (!promptTemplate) {
            Logger.warn('Cabinet skipped: no prompt template found.');
            return null;
        }

        const endpoints = getSelectiveEndpoints().filter(ep => ep && ep.enabled !== false);
        if (endpoints.length === 0) {
            Logger.warn('Cabinet skipped: no enabled API endpoints.');
            return null;
        }

        const aggregatorId = config?.aggregatorMode?.endpointId;
        let chancellorEndpoint = aggregatorId ? endpoints.find(ep => ep.id === aggregatorId) : null;
        if (!chancellorEndpoint) {
            chancellorEndpoint = endpoints[0];
            Logger.warn('Cabinet: no aggregator endpoint configured, fallback to first enabled endpoint.');
        }

        const scholarEndpoints = endpoints.filter(ep => ep.id !== chancellorEndpoint.id);
        const scholarLabelMap = new Map();
        scholarEndpoints.forEach((ep, idx) => {
            scholarLabelMap.set(ep.id, `大学士${idx + 1} · ${getEndpointDisplayName(ep)}`);
        });

        const chancellorLabel = `宰相 · ${getEndpointDisplayName(chancellorEndpoint)}`;
        const fallbackBooks = Array.from(new Set(endpoints.flatMap(ep => {
            const binding = getEndpointBinding(config, ep.id);
            return Array.isArray(binding.worldBooks) ? binding.worldBooks : [];
        }).filter(Boolean)));
        const worldbookContent = await buildCabinetWorldbookContent(bookName, loadWorldBookEntriesByName, fallbackBooks);
        if (!worldbookContent) {
            Logger.warn('Cabinet skipped: no worldbook content available.');
            return null;
        }

        const cabinetUI = WBAP.CabinetUI;
        const showCabinetPanel = superCfg.showPanel !== false && cabinetUI;
        if (showCabinetPanel) {
            cabinetUI.reset?.();
            cabinetUI.setMeta?.({ chancellorName: chancellorLabel, scholarTotal: scholarEndpoints.length });
            cabinetUI.open?.();
        }

        let abortAllRequested = false;
        const abortControllers = new Map();
        const abortAll = () => {
            abortAllRequested = true;
            abortControllers.forEach(ctrl => ctrl.abort());
        };

        if (shouldShowProgressPanel(config) && WBAP.UI) {
            const totalTasks = scholarEndpoints.length + 1;
            WBAP.UI.showProgressPanel('内阁讨论中...', totalTasks);
            scholarEndpoints.forEach(ep => {
                const label = scholarLabelMap.get(ep.id) || getEndpointDisplayName(ep);
                WBAP.UI.addProgressTask(`cabinet-${ep.id}`, label, '等待中...');
            });
            WBAP.UI.addProgressTask('cabinet-merge', '宰相合并', '等待中...');
            WBAP.UI.setCancelAllCallback(abortAll);
        }

        const limiter = createConcurrencyLimiter(maxConcurrent);
        const callAIWithLimit = limiter
            ? (fn) => limiter(fn)
            : (fn) => fn();

        const totalReviewRounds = (superCfg.mode === 'advanced')
            ? Math.max(1, Math.min(5, parseInt(superCfg.reviewRounds || 1, 10)))
            : 0;

        const callScholar = async (endpoint, roundIndex, previousResults) => {
            const controller = new AbortController();
            abortControllers.set(`${endpoint.id}-${roundIndex}`, controller);
            const apiConfig = buildApiConfig(endpoint, defaultTimeout, controller.signal);
            const label = scholarLabelMap.get(endpoint.id) || getEndpointDisplayName(endpoint);
            const extraVars = {
                role_name: label,
                role_type: '大学士',
                endpoint_name: getEndpointDisplayName(endpoint),
                model_name: endpoint.model || '',
                review_round: String(roundIndex + 1)
            };
            const promptsForRound = buildPromptFromTemplate(promptTemplate, {
                userInput,
                worldbookContent,
                context,
                previousResults: previousResults || '',
                extraVars
            });
            try {
                const result = await callAIWithLimit(() => {
                    if (abortAllRequested || controller.signal.aborted) {
                        throw createAbortError(abortMessage);
                    }
                    return callAI(apiConfig.model, promptsForRound.user, promptsForRound.system, { ...apiConfig, signal: controller.signal });
                });
                if (shouldShowProgressPanel(config) && WBAP.UI) {
                    const progress = Math.min(90, 10 + Math.round(((roundIndex + 1) / (totalReviewRounds + 1)) * 80));
                    WBAP.UI.updateProgressTask(`cabinet-${endpoint.id}`, `完成（第${roundIndex + 1}轮）`, progress);
                }
                return { endpointId: endpoint.id, name: label, content: result };
            } catch (err) {
                const message = err?.name === 'AbortError' ? 'Task aborted' : (err?.message || 'Unknown error');
                if (shouldShowProgressPanel(config) && WBAP.UI) {
                    WBAP.UI.updateProgressTask(`cabinet-${endpoint.id}`, `失败: ${message.substring(0, 20)}`, 100);
                }
                return { endpointId: endpoint.id, name: label, content: `【错误】${message}` };
            }
        };

        let currentOutputs = [];
        if (scholarEndpoints.length === 0) {
            currentOutputs = [];
        } else {
            const initialTasks = scholarEndpoints.map(ep => callScholar(ep, 0, ''));
            currentOutputs = await Promise.all(initialTasks);
            if (showCabinetPanel) {
                currentOutputs.forEach(output => {
                    const uiLabel = `${output.name} · 初稿`;
                    cabinetUI.addMessage?.({ role: 'scholar', label: uiLabel, content: output.content });
                });
            }
        }

        if (abortAllRequested) {
            Logger.warn('Cabinet aborted before merge.');
            // 注意：不在这里隐藏进度面板，由 interceptor 统一管理
            if (shouldShowProgressPanel(config) && WBAP.UI && !cabinetPanelAlreadyOpen) {
                WBAP.UI.hideProgressPanel();
            }
            return null;
        }

        for (let round = 1; round <= totalReviewRounds; round++) {
            const nextOutputs = await Promise.all(scholarEndpoints.map(ep => {
                const label = round === 1 ? '初稿' : `第${round}轮`;
                const peers = formatCabinetResults(currentOutputs, scholarLabelMap, label, ep.id);
                return callScholar(ep, round, peers);
            }));
            currentOutputs = nextOutputs;
            if (showCabinetPanel) {
                currentOutputs.forEach(output => {
                    const uiLabel = `${output.name} · 第${round + 1}轮`;
                    cabinetUI.addMessage?.({ role: 'scholar', label: uiLabel, content: output.content });
                });
            }
            if (abortAllRequested) break;
        }

        if (abortAllRequested) {
            Logger.warn('Cabinet aborted before merge.');
            // 注意：不在这里隐藏进度面板，由 interceptor 统一管理
            if (shouldShowProgressPanel(config) && WBAP.UI && !cabinetPanelAlreadyOpen) {
                WBAP.UI.hideProgressPanel();
            }
            return null;
        }

        if (shouldShowProgressPanel(config) && WBAP.UI) {
            scholarEndpoints.forEach(ep => {
                WBAP.UI.updateProgressTask(`cabinet-${ep.id}`, '完成', 100);
            });
        }

        const mergeInput = formatCabinetResults(currentOutputs, scholarLabelMap, '最终', null);
        const chancellorController = new AbortController();
        abortControllers.set('cabinet-merge', chancellorController);
        const chancellorApiConfig = buildApiConfig(chancellorEndpoint, defaultTimeout, chancellorController.signal);
        const chancellorVars = {
            role_name: '宰相',
            role_type: '宰相',
            endpoint_name: getEndpointDisplayName(chancellorEndpoint),
            model_name: chancellorEndpoint.model || '',
            review_round: String(totalReviewRounds + 1)
        };
        const chancellorPrompts = buildPromptFromTemplate(promptTemplate, {
            userInput,
            worldbookContent,
            context,
            previousResults: mergeInput,
            extraVars: chancellorVars
        });

        let finalResult = '';
        try {
            finalResult = await callAIWithLimit(() => {
                if (abortAllRequested || chancellorController.signal.aborted) {
                    throw createAbortError(abortMessage);
                }
                return callAI(chancellorApiConfig.model, chancellorPrompts.user, chancellorPrompts.system, { ...chancellorApiConfig, signal: chancellorController.signal });
            });
            if (shouldShowProgressPanel(config) && WBAP.UI) {
                WBAP.UI.updateProgressTask('cabinet-merge', '完成', 100);
            }
        } catch (err) {
            const message = err?.name === 'AbortError' ? 'Task aborted' : (err?.message || 'Unknown error');
            Logger.error('Cabinet merge failed', err);
            if (shouldShowProgressPanel(config) && WBAP.UI) {
                WBAP.UI.updateProgressTask('cabinet-merge', `失败: ${message.substring(0, 20)}`, 100);
            }
            finalResult = mergeInput || '';
        }

        if (showCabinetPanel) {
            cabinetUI.addMessage?.({ role: 'chancellor', label: chancellorLabel, content: finalResult });
        }

        // 注意：不在这里隐藏进度面板，由 interceptor 统一管理
        if (shouldShowProgressPanel(config) && WBAP.UI && !cabinetPanelAlreadyOpen) {
            WBAP.UI.hideProgressPanel();
        }

        return finalResult || mergeInput || '';
    }

    // Expose main processing function
    async function runSelectiveModeProcessing(userInput, bookName = null, context = '') {
        // 【关键修复】始终从 CharacterManager 获取最新配置，而不是使用可能过时的 WBAP.config
        const config = WBAP.CharacterManager?.getCurrentCharacterConfig?.() || WBAP.config;
        Logger.log(`[自选模式] ===== 开始处理 =====`);
        Logger.log(`[自选模式] selectiveMode.enabled=${config?.selectiveMode?.enabled}, 端点数=${(WBAP.getGlobalPools?.()?.selectiveMode?.apiEndpoints || []).filter(ep => ep?.enabled !== false).length}`);
        const { loadWorldBookEntriesByName, callAI, mainConfig } = WBAP;
        const globalSettings = mainConfig?.globalSettings || {};
        const maxConcurrent = globalSettings.maxConcurrent || 0;
        const defaultTimeout = globalSettings.timeout || 0;
        const abortMessage = '任务已被终止';
        const buildAnalysisBlock = (content) => `<details data-wbap="analysis">\n<summary>${ANALYSIS_SUMMARY_TITLE}</summary>\n${content}\n</details>`;
        const buildTiangangBlock = (content) => `<details data-wbap="tiangang">\n<summary>${TIANGANG_SUMMARY_TITLE}</summary>\n${content}\n</details>`;
        let abortAllRequested = false;

        if (globalSettings.enableSuperConcurrency === true) {
            // 超级并发模式也需要自选模式开关启用
            if (config?.selectiveMode?.enabled !== true) {
                // 自选模式未启用，但天纲/超级记忆可能需要独立运行
                const tiangangCfgEarly = config?.tiangang || {};
                const tgEnabledEarly = tiangangCfgEarly.enabled && WBAP.Tiangang?.process;
                const smEnabledEarly = WBAP.SuperMemory && config?.superMemory?.enabled;
                if (tgEnabledEarly || smEnabledEarly) {
                    Logger.log('超级并发模式下自选模式未启用，仅运行独立模块');
                    // 走普通分支处理独立模块（fall through to non-super-concurrency path below）
                } else {
                    Logger.log('自选模式未启用，跳过超级并发处理');
                    return null;
                }
            } else {
            // 检测进度面板是否已打开（可能由 interceptor 打开）
            const superPanelAlreadyOpen = WBAP.UI?.isProgressPanelOpen?.();

            const cabinetResult = await runCabinetDiscussion({
                userInput,
                bookName,
                context,
                config,
                mainConfig,
                callAI,
                loadWorldBookEntriesByName,
                abortMessage
            });
            if (!cabinetResult) return null;
            const baseContent = cabinetResult;
            const level3Cfg = config?.optimizationLevel3 || {};
            const doLevel3 = config?.enablePlotOptimization && level3Cfg.enabled && WBAP.Optimization?.processLevel3;
            const tiangangCfg = config?.tiangang || {};
            const tgEnabled = tiangangCfg.enabled && WBAP.Tiangang?.process;
            const tiangangInput = stripInjectedBlocks(userInput || '');

            const tgTaskId = 'wbap-tiangang';
            const level3TaskId = 'wbap-level3';
            const showProgress = shouldShowProgressPanel(config) && WBAP.UI;
            const extraTasks = (tgEnabled ? 1 : 0) + (doLevel3 ? 1 : 0);
            if (showProgress && extraTasks > 0) {
                if (superPanelAlreadyOpen) {
                    // 面板已打开，只增加任务数
                    WBAP.UI.addToTotalTaskCount?.(extraTasks);
                } else {
                    // 面板未打开，初始化面板
                    WBAP.UI.showProgressPanel('\u6b63\u5728\u5904\u7406...', extraTasks);
                }
                if (tgEnabled) {
                    WBAP.UI.addProgressTask?.(tgTaskId, '\u5929\u7eb2', '\u7b49\u5f85\u4e2d...');
                }
                if (doLevel3) {
                    const initialStatus = level3Cfg.autoConfirm ? '\u7b49\u5f85\u4e2d...' : '\u7b49\u5f85\u786e\u8ba4...';
                    WBAP.UI.addProgressTask?.(level3TaskId, '\u4e09\u7ea7\u4f18\u5316', initialStatus);
                }
            }

            const tgPromise = tgEnabled
                ? (async () => {
                    try {
                        if (showProgress) WBAP.UI.updateProgressTask(tgTaskId, '\u5904\u7406\u4e2d...', 15);
                        const tgRounds = parseInt(tiangangCfg.contextRounds ?? 0, 10);
                        const tgContext = (Number.isFinite(tgRounds) && tgRounds > 0)
                            ? getRecentContext(getCurrentChatContext(), tgRounds)
                            : '';
                        const tgResult = await WBAP.Tiangang.process(tiangangInput, {
                            userInput: tiangangInput,
                            context: tgContext,
                            config,
                            defaultTimeout,
                            suppressProgress: true
                        });
                        if (showProgress) WBAP.UI.updateProgressTask(tgTaskId, '\u5b8c\u6210', 100);
                        return typeof tgResult === 'string' ? tgResult : null;
                    } catch (err) {
                        Logger.warn('Tiangang processing skipped or failed', err);
                        if (showProgress) {
                            WBAP.UI.updateProgressTask(tgTaskId, `\u5931\u8d25: ${(err?.message || '').slice(0, 20)}`, 100);
                        }
                        return null;
                    }
                })()
                : Promise.resolve(null);

            const level3Promise = doLevel3
                ? (async () => {
                    try {
                        if (showProgress) {
                            const status = level3Cfg.autoConfirm ? '\u5904\u7406\u4e2d...' : '\u7b49\u5f85\u786e\u8ba4...';
                            WBAP.UI.updateProgressTask(level3TaskId, status, level3Cfg.autoConfirm ? 15 : 5);
                        }
                        Logger.log('Start level-3 optimization...');
                        const optimizedContent = await WBAP.Optimization.processLevel3(baseContent, {
                            originalInput: userInput,
                            context: context,
                            keepProgressPanel: true
                        });
                        if (optimizedContent && typeof optimizedContent === 'string') {
                            Logger.log('Level-3 optimization done');
                            if (showProgress) WBAP.UI.updateProgressTask(level3TaskId, '\u5b8c\u6210', 100);
                            return optimizedContent;
                        }
                    } catch (err) {
                        Logger.warn('Level-3 optimization skipped or failed', err);
                        if (showProgress) {
                            WBAP.UI.updateProgressTask(level3TaskId, `\u5931\u8d25: ${(err?.message || '').slice(0, 20)}`, 100);
                        }
                    }
                    if (showProgress) WBAP.UI.updateProgressTask(level3TaskId, '\u5b8c\u6210', 100);
                    return baseContent;
                })()
                : Promise.resolve(baseContent);
            const [level3Result, tgResult] = await Promise.all([level3Promise, tgPromise]);
            const finalContent = level3Result || baseContent;
            let output = buildAnalysisBlock(finalContent);
            const tgText = typeof tgResult === 'string' ? tgResult.trim() : '';
            if (tgText && tgText !== tiangangInput) {
                output += `\n\n${buildTiangangBlock(formatTiangangOutput(tgText))}`;
            } else if (tgText) {
                Logger.warn('Tiangang result equals user input; ignored');
            }
            // 注意：不在这里隐藏进度面板，由 interceptor 统一管理
            if (shouldShowProgressPanel(config) && WBAP.UI && !superPanelAlreadyOpen) {
                WBAP.UI.hideProgressPanel();
            }
            return output;
            } // end else (selectiveMode.enabled in super concurrency)
        }

        // 检测进度面板是否已打开（可能由 interceptor 或 memory_manager 打开）
        const panelAlreadyOpen = WBAP.UI?.isProgressPanelOpen?.();

        try {
            // 进度面板初始化时传递任务总数（稍后确定）
            let progressInitialized = false;

            if (!config) {
                Logger.warn('配置尚未初始化，跳过处理。');
                return null;
            }

            // 即使没有 selectiveMode 配置，天纲和超级记忆仍可独立运行
            if (!config.selectiveMode) {
                const tiangangCfgEarly = config?.tiangang || {};
                const tgEnabledEarly = tiangangCfgEarly.enabled && WBAP.Tiangang?.process;
                const smEnabledEarly = WBAP.SuperMemory && config?.superMemory?.enabled;

                if (!tgEnabledEarly && !smEnabledEarly) {
                    Logger.warn('自选模式未配置，且无独立模块启用，跳过处理。');
                    return null;
                }

                Logger.log('自选模式未配置，但有独立模块启用，继续执行天纲/超级记忆');
            }

            const showProgress = shouldShowProgressPanel(config) && WBAP.UI;
            const tiangangCfg = config?.tiangang || {};
            const tgEnabled = tiangangCfg.enabled && WBAP.Tiangang?.process;
            const tiangangInput = stripInjectedBlocks(userInput || '');
            const tgTaskId = 'wbap-tiangang';
            let tgPromise = Promise.resolve(null);

            // ==================== 超级记忆集成 ====================
            let superMemoryBlock = '';
            if (WBAP.SuperMemory && config?.superMemory?.enabled) {
                const smTaskId = 'wbap-supermemory';
                if (showProgress && !panelAlreadyOpen) {
                    WBAP.UI.showProgressPanel('正在处理...', 1);
                    WBAP.UI.addProgressTask?.(smTaskId, '超级记忆', '检索中...');
                } else if (showProgress) {
                    WBAP.UI.addToTotalTaskCount?.(1);
                    WBAP.UI.addProgressTask?.(smTaskId, '超级记忆', '检索中...');
                }

                try {
                    const recentContext = getRecentContext(getCurrentChatContext(), config.contextRounds || 3);
                    superMemoryBlock = await WBAP.SuperMemory.retrieve(userInput, recentContext);

                    if (showProgress) {
                        WBAP.UI.updateProgressTask?.(smTaskId, superMemoryBlock ? '完成' : '无结果', 100);
                        WBAP.UI.completeProgressTask?.(smTaskId);
                    }

                    if (superMemoryBlock) {
                        Logger.log('[Processing] 超级记忆检索成功，已生成记忆块');
                    }
                } catch (e) {
                    Logger.error('[Processing] 超级记忆检索失败:', e);
                    if (showProgress) {
                        WBAP.UI.updateProgressTask?.(smTaskId, '失败', 100);
                        WBAP.UI.completeProgressTask?.(smTaskId);
                    }
                }
            }
            // ==================== 超级记忆结束 ====================

            // 辅助函数：仅运行天纲和超级记忆（无自选模式端点时使用）
            const runIndependentModulesOnly = async (reason) => {
                Logger.log(`${reason}，执行独立模块（天纲/超级记忆）`);

                if (showProgress && tgEnabled && !progressInitialized) {
                    if (panelAlreadyOpen) {
                        WBAP.UI.addToTotalTaskCount?.(1);
                    } else {
                        WBAP.UI.showProgressPanel('正在处理...', 1);
                    }
                    WBAP.UI.addProgressTask(tgTaskId, '天纲', '等待中...');
                }

                if (tgEnabled) {
                    const tgController = new AbortController();
                    // 注册天纲取消回调
                    if (showProgress) {
                        WBAP.UI.setCancelAllCallback?.(() => tgController.abort());
                        WBAP.UI.setCancelTaskCallback?.(tgTaskId, () => tgController.abort());
                    }
                    tgPromise = (async () => {
                        try {
                            if (showProgress) WBAP.UI.updateProgressTask(tgTaskId, '处理中...', 15);
                            const tgRounds = parseInt(tiangangCfg.contextRounds ?? 0, 10);
                            const tgContext = (Number.isFinite(tgRounds) && tgRounds > 0)
                                ? getRecentContext(getCurrentChatContext(), tgRounds)
                                : '';
                            const tgResult = await WBAP.Tiangang.process(tiangangInput, {
                                userInput: tiangangInput,
                                context: tgContext,
                                config,
                                defaultTimeout,
                                signal: tgController.signal,
                                suppressProgress: true
                            });
                            if (showProgress) WBAP.UI.updateProgressTask(tgTaskId, '完成', 100);
                            return typeof tgResult === 'string' ? tgResult : null;
                        } catch (err) {
                            Logger.warn('Tiangang processing skipped or failed', err);
                            if (showProgress) {
                                WBAP.UI.updateProgressTask(tgTaskId, `失败: ${(err?.message || '').slice(0, 20)}`, 100);
                            }
                            return null;
                        }
                    })();
                }

                const tgResult = await tgPromise;
                let output = '';
                const tgText = typeof tgResult === 'string' ? tgResult.trim() : '';
                if (tgText && tgText !== tiangangInput) {
                    output = buildTiangangBlock(formatTiangangOutput(tgText));
                }
                if (superMemoryBlock) {
                    output = output ? `${output}\n\n${superMemoryBlock}` : superMemoryBlock;
                }
                return output || null;
            };

            // 自选模式开关检查
            const selectiveModeEnabled = config?.selectiveMode?.enabled === true;
            if (!selectiveModeEnabled) {
                if (tgEnabled || superMemoryBlock) {
                    return await runIndependentModulesOnly('自选模式未启用');
                }
                Logger.log('自选模式未启用，跳过处理');
                return null;
            }

            const endpoints = getSelectiveEndpoints();
            if (endpoints.length === 0) {
                if (tgEnabled || superMemoryBlock) {
                    return await runIndependentModulesOnly('无自选模式端点');
                }

                Logger.error('❌ 未找到可用的 API 端点');
                Logger.error('请在扩展设置中配置至少一个API端点');
                if (window.toastr) {
                    toastr.error('请先配置API端点', '配置错误', { timeOut: 5000 });
                }
                throw new Error('未找到可用的 API 端点');
            }

            const allEndpoints = endpoints.filter(ep => ep && ep.enabled !== false);
            if (allEndpoints.length === 0) {
                if (tgEnabled || superMemoryBlock) {
                    return await runIndependentModulesOnly('所有端点被禁用');
                }

                Logger.error('❌ 所有 API 端点均被禁用');
                Logger.error('请在扩展设置中启用至少一个API端点');
                if (window.toastr) {
                    toastr.error('所有API端点都已禁用，请启用至少一个', '配置错误', { timeOut: 5000 });
                }
                throw new Error('所有 API 端点均被禁用');
            }
            const endpointsToProcessRaw = bookName
                ? allEndpoints.filter(ep => {
                    const binding = getEndpointBinding(config, ep.id);
                    const wbs = Array.isArray(binding.worldBooks) ? binding.worldBooks : [];
                    return wbs.includes(bookName);
                })
                : allEndpoints;

            // 按延迟排序（智能端点选择）
            const endpointsToProcess = WBAP.sortEndpointsByLatency
                ? WBAP.sortEndpointsByLatency(endpointsToProcessRaw)
                : endpointsToProcessRaw;

            if (!endpointsToProcess || endpointsToProcess.length === 0) {
                Logger.log('No configured API endpoints found.');
                return null;
            }

            const tagName = String(config?.tagExtractionName || '').trim();
            const tagLower = tagName.toLowerCase();
            const tagBlocksByEndpointId = tagName ? new Map() : null;
            const mergeWorldBooks = config?.mergeWorldBooks !== false;
            const includeUiWorldBooks = config?.useSelectedWorldBooks !== false;

            // 解析排除标签列表（支持逗号分隔）
            const excludeTagsStr = String(config?.analysisExcludeTags || '').trim();
            const excludeTags = excludeTagsStr
                ? excludeTagsStr.split(',').map(t => t.trim().toLowerCase()).filter(Boolean)
                : [];
            Logger.log(`排除标签: ${excludeTags.length > 0 ? excludeTags.join(', ') : '无'}`);

            const tasksByBook = {};
            const fallbackWorldBooks = !bookName ? getSelectedWorldBooksFromUI() : [];
            for (const endpoint of endpointsToProcess) {
                const binding = getEndpointBinding(config, endpoint.id);
                const worldBooks = Array.isArray(binding.worldBooks)
                    ? binding.worldBooks
                    : [];
                let effectiveBooks = worldBooks.length > 0
                    ? worldBooks
                    : (bookName ? [bookName] : fallbackWorldBooks);
                if (!bookName && includeUiWorldBooks && fallbackWorldBooks.length > 0) {
                    effectiveBooks = Array.from(new Set([...effectiveBooks, ...fallbackWorldBooks]));
                }
                effectiveBooks = Array.from(new Set((effectiveBooks || []).filter(Boolean)));
                const entriesMap = binding.assignedEntriesMap || {};
                effectiveBooks.forEach(wb => {
                    let assigned = entriesMap[wb];
                    if (!Array.isArray(assigned)) {
                        assigned = [];
                    }
                    if (!tasksByBook[wb]) tasksByBook[wb] = [];
                    tasksByBook[wb].push({ endpoint, assigned });
                });
            }

            // Optimization: Fetch all required world books at once.
            const allBookNames = Object.keys(tasksByBook);
            const bookPromises = allBookNames.map(name => loadWorldBookEntriesByName(name));
            const loadedBooks = await Promise.all(bookPromises);
            const bookCache = new Map();
            allBookNames.forEach((name, index) => {
                if (loadedBooks[index]) {
                    bookCache.set(name, loadedBooks[index]);
                } else {
                    Logger.warn(`Worldbook "${name}" could not be loaded and will be skipped.`);
                }
            });

            let baseTasks = [];
            for (const currentBookName in tasksByBook) {
                const book = bookCache.get(currentBookName);
                if (!book || !book.entries) {
                    continue; // Already warned above
                }
                const tableLike = isTableWorldBook(book);

                const endpointsForBook = tasksByBook[currentBookName];
                const enabledEntries = Object.entries(book.entries)
                    .filter(([, e]) => e && e.disable !== true)
                    .filter(([, e]) => !shouldExcludeEntry(e, excludeTags)); // 应用排除标签过滤
                for (const { endpoint, assigned } of endpointsForBook) {
                    let content = '';
                    let entryIds = Array.isArray(assigned) ? assigned : [];
                    const tagBlocks = tagBlocksByEndpointId ? [] : null;

                    if (tableLike) {
                        const selectedIds = Array.isArray(entryIds)
                            ? entryIds.filter(id => book.entries[id] && book.entries[id].disable !== true)
                            : [];
                        const selectedColumns = new Set();
                        selectedIds.forEach(id => {
                            const entry = book.entries[id];
                            if (entry) {
                                selectedColumns.add(normalizeTableColumnName(entry.comment, id));
                            }
                        });
                        const entriesForSelection = selectedColumns.size > 0
                            ? enabledEntries.filter(([uid, entry]) => selectedColumns.has(normalizeTableColumnName(entry.comment, uid)))
                            : enabledEntries;
                        if (entriesForSelection.length === 0) {
                            continue;
                        }

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
                            if (tagBlocks && entryMatchesTag(info.entry, tagLower)) {
                                tagBlocks.push(buildTagEntryBlock(info.entry, info.uid, currentBookName));
                            }
                        });
                        content = columnBlocks.join('\n\n');
                    }

                    if (!tableLike) {
                        if (entryIds.length === 0) {
                            entryIds = enabledEntries.map(([uid]) => uid);
                        }
                        entryIds.forEach(entryId => {
                            const entry = book.entries[entryId];
                            if (entry && entry.disable !== true) {
                                content += `[${entry.comment || entryId}]\n${entry.content}\n\n`;
                                if (tagBlocks && entryMatchesTag(entry, tagLower)) {
                                    tagBlocks.push(buildTagEntryBlock(entry, entryId, currentBookName));
                                }
                            }
                        });
                    }

                    if (tagBlocks && tagBlocks.length > 0) {
                        const existing = tagBlocksByEndpointId.get(endpoint.id) || new Set();
                        tagBlocks.forEach(block => existing.add(block));
                        tagBlocksByEndpointId.set(endpoint.id, existing);
                    }

                    if (content) {
                        const normalizedContent = content.trim();
                        if (!normalizedContent) continue;
                        const promptContent = (mergeWorldBooks && currentBookName)
                            ? `【世界书：${currentBookName}】\n${normalizedContent}`
                            : normalizedContent;
                        baseTasks.push({
                            id: endpoint.id,
                            name: endpoint.name,
                            endpoint,
                            promptContent
                        });
                    }
                }
            }

            if (mergeWorldBooks && baseTasks.length > 1) {
                const mergedMap = new Map();
                baseTasks.forEach(task => {
                    const existing = mergedMap.get(task.id);
                    if (!existing) {
                        mergedMap.set(task.id, { ...task });
                        return;
                    }
                    if (task.promptContent) {
                        existing.promptContent = existing.promptContent
                            ? `${existing.promptContent}\n\n${task.promptContent}`
                            : task.promptContent;
                    }
                });
                baseTasks = Array.from(mergedMap.values());
            }

            if (baseTasks.length === 0) {
                Logger.error('❌ 没有可执行的任务');
                Logger.error('可能的原因:');
                Logger.error('  1. API端点未绑定世界书');
                Logger.error('  2. 世界书中没有匹配的条目');
                Logger.error('  3. 世界书未在SillyTavern中选择');
                if (window.toastr) {
                    toastr.error('请为API端点绑定世界书，并确保世界书中有匹配的条目', '配置错误', { timeOut: 5000 });
                }
                throw new Error('No executable tasks found. 请检查 API 实例是否选择了世界书/条目。');
            }

            const tagContextByEndpointId = new Map();
            if (tagName) {
                const endpointIds = new Set(baseTasks.map(task => task.id));
                endpointIds.forEach(endpointId => {
                    const blocks = tagBlocksByEndpointId?.get(endpointId);
                    const blockList = blocks ? Array.from(blocks) : [];
                    tagContextByEndpointId.set(endpointId, buildTagContextPrompt(tagName, blockList));
                });
            }

            // 选择提示词，并根据绑定的 API 分流任务
            const combinedPrompts = WBAP.PromptManager.getCombinedPrompts();
            if (!Array.isArray(combinedPrompts) || combinedPrompts.length === 0) {
                Logger.error('❌ 没有可用的提示词');
                Logger.error('请在扩展设置中创建或导入提示词');
                if (window.toastr) {
                    toastr.error('请先创建或导入提示词', '配置错误', { timeOut: 5000 });
                }
                throw new Error('没有可用的提示词，请先创建或导入。');
            }
            const promptSelections = [];
            let primaryIndex = config?.selectedPromptIndex || 0;
            if (primaryIndex >= combinedPrompts.length) {
                primaryIndex = Math.max(0, combinedPrompts.length - 1);
                config.selectedPromptIndex = primaryIndex;
                WBAP.saveConfig();
            }
            let primaryTemplate = combinedPrompts?.[primaryIndex];
            if (!primaryTemplate) throw new Error('Prompt template not found');
            // 主提示词绑定：优先从 prompt 对象的 boundEndpointIds 读取（UI 直接写入），
            // 回退到 config.promptBindings[name]（旧版迁移数据）
            const promptBindings = config?.promptBindings || {};
            const primaryKey = primaryTemplate?.name || '';
            let primaryBoundFromPrompt = Array.isArray(primaryTemplate?.boundEndpointIds)
                ? primaryTemplate.boundEndpointIds.filter(Boolean)
                : [];
            let primaryBoundFromConfig = primaryKey && Array.isArray(promptBindings[primaryKey])
                ? promptBindings[primaryKey].filter(Boolean)
                : [];
            let primaryBoundIds = primaryBoundFromPrompt.length > 0
                ? primaryBoundFromPrompt
                : primaryBoundFromConfig;

            // 【修复】如果当前索引指向的提示词没有绑定，尝试通过 promptBindings 找到正确的提示词
            // 这可以修复迁移后 selectedPromptIndex 指向错误提示词的问题
            if (primaryBoundIds.length === 0) {
                Logger.log(`[自选模式] 主提示词「${primaryKey}」(索引${primaryIndex}) 无绑定，尝试查找有绑定的提示词...`);
                for (const [bindingName, bindingIds] of Object.entries(promptBindings)) {
                    if (Array.isArray(bindingIds) && bindingIds.filter(Boolean).length > 0) {
                        const foundIndex = combinedPrompts.findIndex(p => p.name === bindingName);
                        if (foundIndex >= 0) {
                            Logger.log(`[自选模式] 通过 promptBindings 找到有绑定的提示词「${bindingName}」(索引${foundIndex})`);
                            primaryIndex = foundIndex;
                            primaryTemplate = combinedPrompts[foundIndex];
                            primaryBoundFromPrompt = Array.isArray(primaryTemplate?.boundEndpointIds)
                                ? primaryTemplate.boundEndpointIds.filter(Boolean)
                                : [];
                            primaryBoundFromConfig = bindingIds.filter(Boolean);
                            primaryBoundIds = primaryBoundFromPrompt.length > 0
                                ? primaryBoundFromPrompt
                                : primaryBoundFromConfig;
                            // 修正索引并保存
                            config.selectedPromptIndex = foundIndex;
                            WBAP.saveConfig();
                            break;
                        }
                    }
                }
                // 如果 promptBindings 也没有，扫描所有提示词对象
                if (primaryBoundIds.length === 0) {
                    for (let i = 0; i < combinedPrompts.length; i++) {
                        const p = combinedPrompts[i];
                        if (Array.isArray(p.boundEndpointIds) && p.boundEndpointIds.filter(Boolean).length > 0) {
                            Logger.log(`[自选模式] 通过扫描找到有绑定的提示词「${p.name}」(索引${i})`);
                            primaryIndex = i;
                            primaryTemplate = p;
                            primaryBoundFromPrompt = p.boundEndpointIds.filter(Boolean);
                            primaryBoundIds = primaryBoundFromPrompt;
                            config.selectedPromptIndex = i;
                            WBAP.saveConfig();
                            break;
                        }
                    }
                }
            }

            Logger.log(`[自选模式] 主提示词「${primaryTemplate?.name || primaryKey}」绑定: prompt上=${JSON.stringify(primaryBoundFromPrompt)}, config上=${JSON.stringify(primaryBoundFromConfig)}, 最终=${JSON.stringify(primaryBoundIds)}`);
            Logger.log(`[自选模式] baseTasks端点IDs: ${baseTasks.map(t => `${t.name}(${t.id})`).join(', ') || '空'}`);
            Logger.log(`[自选模式] 全局端点IDs: ${getSelectiveEndpoints().filter(ep => ep.enabled !== false).map(ep => `${ep.name}(${ep.id})`).join(', ')}`);
            promptSelections.push({
                key: 'primary',
                template: primaryTemplate,
                promptIndex: primaryIndex,
                boundIds: primaryBoundIds
            });

            const secConf = config?.secondaryPrompt || {};
            if (secConf.enabled) {
                let secIndex = secConf.selectedPromptIndex || 0;
                if (secIndex >= combinedPrompts.length) {
                    secIndex = Math.max(0, combinedPrompts.length - 1);
                    config.secondaryPrompt.selectedPromptIndex = secIndex;
                    WBAP.saveConfig();
                }
                const secTemplate = combinedPrompts?.[secIndex];
                if (secTemplate) {
                    const secBoundIds = Array.isArray(secConf.boundEndpointIds) ? secConf.boundEndpointIds.filter(Boolean) : [];
                    Logger.log(`[自选模式] 副提示词「${secTemplate.name || ''}」绑定: ${JSON.stringify(secBoundIds)}`);
                    promptSelections.push({
                        key: 'secondary',
                        template: secTemplate,
                        promptIndex: secIndex,
                        boundIds: secBoundIds
                    });
                }
            }

            const abortControllers = new Map();
            const taskConfigs = [];
            // Collect endpoints that are explicitly bound to any prompt to avoid double execution:
            // if a prompt has bindings, that endpoint should only run with bound prompts, not again via unbound prompts.
            const boundAnywhere = new Set();
            promptSelections.forEach(sel => {
                (sel.boundIds || []).forEach(id => boundAnywhere.add(id));
            });

            promptSelections.forEach(sel => {
                const hasBinding = sel.boundIds && sel.boundIds.length > 0;
                const allowed = hasBinding ? new Set(sel.boundIds) : null;
                Logger.log(`[自选模式] 匹配提示词「${sel.template?.name || sel.key}」: hasBinding=${hasBinding}, boundIds=${JSON.stringify(sel.boundIds)}`);

                baseTasks.forEach((t, idx) => {
                    if (t.endpoint.enabled === false) return;

                    // 【BUG修复】只有被提示词绑定的 API 实例才会启动
                    // 核心原则：API 实例必须被至少一个提示词绑定才能运行
                    // 未绑定提示词的端点不应该执行，无论是否有其他端点绑定了提示词
                    
                    if (hasBinding) {
                        // 当前提示词有绑定，只执行绑定的端点
                        if (!allowed.has(t.id)) {
                            Logger.log(`[自选模式] 端点「${t.name}」(${t.id}) 不在绑定列表中，跳过`);
                            return;
                        }
                        Logger.log(`[自选模式] 端点「${t.name}」(${t.id}) 匹配成功`);
                    } else {
                        // 当前提示词没有绑定任何端点，跳过所有任务
                        // 这确保了"未选定提示词的API实例不会运行"
                        return;
                    }

                    const controller = new AbortController();
                    const apiConfig = buildApiConfig(t.endpoint, defaultTimeout, controller.signal);
                    const execId = `${sel.key}-${t.id}-${idx}`;

                    abortControllers.set(execId, controller);
                    taskConfigs.push({
                        id: execId,
                        name: `${t.name} - ${sel.template.name || sel.key}`,
                        promptIndex: sel.promptIndex,
                        apiConfig,
                        promptContent: t.promptContent,
                        controller,
                        promptTemplate: sel.template,
                        tagContext: tagContextByEndpointId.get(t.id)
                    });
                });
            });

            if (taskConfigs.length === 0) {
                // 【诊断】检查是否存在 ID 不匹配问题
                const allEndpointsList = getSelectiveEndpoints().filter(ep => ep.enabled !== false);
                const currentIdSet = new Set(allEndpointsList.map(ep => ep.id));
                let hasStaleBindings = false;

                promptSelections.forEach(sel => {
                    if (!sel.boundIds || sel.boundIds.length === 0) return;
                    const staleIds = sel.boundIds.filter(id => !currentIdSet.has(id));
                    if (staleIds.length > 0) {
                        hasStaleBindings = true;
                        Logger.warn(`[自选模式] 提示词「${sel.template?.name || sel.key}」包含过期的端点ID: ${staleIds.join(', ')}`);
                        Logger.warn(`[自选模式] 当前有效端点ID: ${Array.from(currentIdSet).join(', ')}`);
                    }
                });

                if (hasStaleBindings && baseTasks.length > 0) {
                    // 尝试自动修复：如果绑定的ID全部过期，用当前端点ID替换
                    Logger.log('[自选模式] 检测到过期绑定，尝试自动修复...');
                    let autoRepaired = false;

                    promptSelections.forEach(sel => {
                        if (!sel.boundIds || sel.boundIds.length === 0) return;
                        const validIds = sel.boundIds.filter(id => currentIdSet.has(id));
                        const staleIds = sel.boundIds.filter(id => !currentIdSet.has(id));
                        if (staleIds.length === 0) return;

                        // 如果所有ID都过期，且过期ID数量等于当前端点数量，按顺序映射
                        if (validIds.length === 0 && staleIds.length <= allEndpointsList.length) {
                            const newIds = allEndpointsList.slice(0, staleIds.length).map(ep => ep.id);
                            Logger.log(`[自选模式] 自动修复绑定: [${staleIds.join(', ')}] → [${newIds.join(', ')}]`);
                            sel.boundIds = newIds;
                            autoRepaired = true;
                        }
                    });

                    if (autoRepaired) {
                        // 重新构建 taskConfigs
                        promptSelections.forEach(sel => {
                            const hasBinding = sel.boundIds && sel.boundIds.length > 0;
                            const allowed = hasBinding ? new Set(sel.boundIds) : null;

                            baseTasks.forEach((t, idx) => {
                                if (t.endpoint.enabled === false) return;
                                if (!hasBinding || !allowed.has(t.id)) return;

                                const controller = new AbortController();
                                const apiConfig = buildApiConfig(t.endpoint, defaultTimeout, controller.signal);
                                const execId = `${sel.key}-${t.id}-${idx}`;
                                abortControllers.set(execId, controller);
                                taskConfigs.push({
                                    id: execId,
                                    name: `${t.name} - ${sel.template.name || sel.key}`,
                                    promptIndex: sel.promptIndex,
                                    apiConfig,
                                    promptContent: t.promptContent,
                                    controller,
                                    promptTemplate: sel.template,
                                    tagContext: tagContextByEndpointId.get(t.id)
                                });
                            });
                        });

                        // 持久化修复后的绑定
                        if (taskConfigs.length > 0) {
                            promptSelections.forEach(sel => {
                                if (sel.key === 'primary' && sel.template) {
                                    sel.template.boundEndpointIds = sel.boundIds;
                                    WBAP.PromptManager.addOrUpdatePrompt(sel.template);
                                } else if (sel.key === 'secondary') {
                                    const secConf = config?.secondaryPrompt;
                                    if (secConf) secConf.boundEndpointIds = sel.boundIds;
                                }
                            });
                            WBAP.saveConfig();
                            Logger.log(`[自选模式] 自动修复成功，匹配到 ${taskConfigs.length} 个任务`);
                            if (window.toastr) {
                                toastr.info('已自动修复提示词的API绑定', '笔者之脑', { timeOut: 3000 });
                            }
                        }
                    }
                }
            }

            if (taskConfigs.length === 0) {
                Logger.log('没有匹配提示词绑定的API实例，自选模式跳过');
                Logger.log(`[自选模式] baseTasks数量: ${baseTasks.length}, promptSelections数量: ${promptSelections.length}`);
                promptSelections.forEach(sel => {
                    Logger.log(`[自选模式] 提示词「${sel.template?.name || sel.key}」绑定IDs: ${(sel.boundIds || []).join(', ') || '无'}`);
                });
                baseTasks.forEach(t => {
                    Logger.log(`[自选模式] baseTask端点: ${t.name} (id=${t.id})`);
                });

                // 显示用户可见的诊断信息
                if (window.toastr && baseTasks.length > 0) {
                    toastr.warning('提示词绑定的API端点ID与当前端点不匹配，请重新绑定提示词到API实例', '笔者之脑 - 配置问题', { timeOut: 8000 });
                }

                if (tgEnabled || superMemoryBlock) {
                    return await runIndependentModulesOnly('自选模式无匹配任务');
                }
                Logger.warn('No tasks match the prompt bound API instances, and no independent modules enabled.');
                return null;
            }

            // 初始化进度面板（传递任务总数）
            if (showProgress && !progressInitialized) {
                const totalTasks = taskConfigs.length + (tgEnabled ? 1 : 0);
                if (panelAlreadyOpen) {
                    // 面板已打开，只增加任务数
                    WBAP.UI.addToTotalTaskCount?.(totalTasks);
                } else {
                    // 面板未打开，初始化面板
                    WBAP.UI.showProgressPanel('正在处理任务...', totalTasks);
                }
                progressInitialized = true;
                // 为每个任务创建进度条目
                taskConfigs.forEach(task => {
                    WBAP.UI.addProgressTask(task.id, task.name, '等待中...');
                });
                if (tgEnabled) {
                    WBAP.UI.addProgressTask(tgTaskId, '天纲', '等待中...');
                }
            }

            if (tgEnabled) {
                const tgController = new AbortController();
                abortControllers.set(tgTaskId, tgController);
                tgPromise = (async () => {
                    try {
                        if (showProgress) WBAP.UI.updateProgressTask(tgTaskId, '处理中...', 15);
                        const tgRounds = parseInt(tiangangCfg.contextRounds ?? 0, 10);
                        const tgContext = (Number.isFinite(tgRounds) && tgRounds > 0)
                            ? getRecentContext(getCurrentChatContext(), tgRounds)
                            : '';
                        const tgResult = await WBAP.Tiangang.process(tiangangInput, {
                            userInput: tiangangInput,
                            context: tgContext,
                            config,
                            defaultTimeout,
                            signal: tgController.signal,
                            suppressProgress: true
                        });
                        if (showProgress) WBAP.UI.updateProgressTask(tgTaskId, '完成', 100);
                        return typeof tgResult === 'string' ? tgResult : null;
                    } catch (err) {
                        Logger.warn('Tiangang processing skipped or failed', err);
                        if (showProgress) {
                            WBAP.UI.updateProgressTask(tgTaskId, `失败: ${(err?.message || '').slice(0, 20)}`, 100);
                        }
                        return null;
                    }
                })();
            }

            // Support single/abort-all termination
            const abortAll = () => {
                abortAllRequested = true;
                abortControllers.forEach(ctrl => ctrl.abort());
            };

            // 注册取消全部回调
            if (shouldShowProgressPanel(config) && WBAP.UI?.setCancelAllCallback) {
                WBAP.UI.setCancelAllCallback(abortAll);
            }

            // 注册单个任务取消回调
            const cancelSingleTask = (taskId) => {
                const controller = abortControllers.get(taskId);
                if (controller) {
                    controller.abort();
                }
            };
            if (shouldShowProgressPanel(config) && WBAP.UI?.setCancelTaskCallback) {
                taskConfigs.forEach(task => {
                    WBAP.UI.setCancelTaskCallback(task.id, cancelSingleTask);
                });
                if (tgEnabled) {
                    WBAP.UI.setCancelTaskCallback(tgTaskId, cancelSingleTask);
                }
            }

            const processTask = async (task) => {
                // 更新任务状态为处理中
                if (shouldShowProgressPanel(config) && WBAP.UI) {
                    WBAP.UI.updateProgressTask(task.id, '处理中...', 10);
                }
                if (abortAllRequested || task.controller.signal.aborted) {
                    if (shouldShowProgressPanel(config) && WBAP.UI) {
                        WBAP.UI.updateProgressTask(task.id, '已终止', 100);
                    }
                    return { name: task.name, error: abortMessage };
                }

                const promptTemplate = task.promptTemplate;
                if (!promptTemplate) {
                    throw new Error('Prompt template not found');
                }
                const chunkingEnabled = config?.enableChunking === true;

                // Split long content into chunks to avoid oversize payload (仅在开启分段时)
                const chunkSize = task.apiConfig.chunkSize || 3500;
                const maxChunks = task.apiConfig.maxChunks || 6;
                let allChunks = [task.promptContent];
                let chunks = [task.promptContent];
                if (chunkingEnabled) {
                    allChunks = splitTextIntoChunks(task.promptContent, chunkSize);
                    chunks = allChunks.slice(0, maxChunks);
                    if (allChunks.length > chunks.length) {
                        Logger.warn(`Task ${task.name} content too long, truncated to ${chunks.length}/${allChunks.length} chunks`);
                    }
                }

                const chunkResults = [];
                for (let i = 0; i < chunks.length; i++) {
                    const promptsForChunk = buildPromptFromTemplate(promptTemplate, {
                        userInput,
                        worldbookContent: chunks[i],
                        context,
                        systemAppend: task.tagContext
                    });
                    try {
                        const chunkResult = await callAI(
                            task.apiConfig.model,
                            promptsForChunk.user,
                            promptsForChunk.system,
                            { ...task.apiConfig, signal: task.controller.signal }
                        );
                        chunkResults.push(chunkResult);
                    } catch (err) {
                        const message = err.name === 'AbortError' ? 'Task aborted' : err.message;
                        if (shouldShowProgressPanel(config) && WBAP.UI) {
                            WBAP.UI.updateProgressTask(task.id, `失败: ${message.substring(0, 20)}`, 100);
                        }
                        return { name: task.name, error: message };
                    }
                }

                const merged = chunkResults.length > 1
                    ? chunkResults.map((r, idx) => `[分段 ${idx + 1}/${chunkResults.length}]\n${r}`).join('\n\n')
                    : chunkResults[0];

                // 更新任务为已完成状态
                if (shouldShowProgressPanel(config) && WBAP.UI) {
                    WBAP.UI.updateProgressTask(task.id, '✓ 完成', 100);
                }
                return { name: task.name, result: merged, endpointId: task.apiConfig.id, promptIndex: task.promptIndex };
            };

            async function runWithConcurrency(tasks, limit) {
                if (!limit || limit <= 0) {
                    return await Promise.all(tasks.map(processTask));
                }
                const results = new Array(tasks.length);
                let idx = 0;
                const workers = Array(Math.min(limit, tasks.length)).fill(0).map(async () => {
                    while (true) {
                        if (abortAllRequested) break;
                        const current = idx++;
                        if (current >= tasks.length) break;
                        results[current] = await processTask(tasks[current]);
                    }
                });
                await Promise.all(workers);
                return results;
            }

            const results = await runWithConcurrency(taskConfigs, maxConcurrent);
            const successfulResults = results.filter(res => res && res.result);
            const executedEndpointIds = new Set(successfulResults.map(res => res.endpointId).filter(Boolean));
            const executedPairs = new Set(successfulResults
                .filter(res => res.endpointId && res.promptIndex !== undefined)
                .map(res => `${res.endpointId}::${res.promptIndex}`));

            if (abortAllRequested) {
                Logger.warn('处理被全部终止，未写入任何内容。');
                return null;
            }

            if (successfulResults.length === 0) {
                Logger.error('❌ 所有分析任务都未返回结果');
                Logger.error('可能的原因:');
                Logger.error('  1. API端点配置错误或无法访问');
                Logger.error('  2. 世界书或条目未正确绑定');
                Logger.error('  3. 提示词配置错误');
                Logger.error('  4. API返回了错误响应');

                // 显示用户友好的错误提示
                if (window.toastr) {
                    toastr.error('所有分析任务都失败了，请检查配置和网络连接', '分析失败', {
                        timeOut: 5000
                    });
                }

                return null;
            }

            let baseResultsBlock = successfulResults.map(res => `--- ${res.name} 分析 ---\n${res.result}`).join('\n\n').trim();
            let finalContent = baseResultsBlock;
            const aggregatorWorldbookContent = Array.from(new Set(
                baseTasks.map(task => task.promptContent).filter(Boolean)
            )).join('\n\n').trim();

            // 总局二次处理
            const aggregatorMode = config?.aggregatorMode || {};
            const allowDuplicate = aggregatorMode.allowDuplicate === true;
            const aggEndpoint = aggregatorMode.enabled
                ? getSelectiveEndpoints().find(ep => ep.id === aggregatorMode.endpointId && ep.enabled !== false)
                : null;

            let skipAggregator = false;
            if (aggregatorMode.enabled && aggEndpoint) {
                // 如果总局端点与主提示词相同且提示词索引一致，则跳过以避免重复执行
                const primaryPromptIndex = config?.selectedPromptIndex || 0;
                if (!allowDuplicate && executedEndpointIds.has(aggEndpoint.id) && aggregatorMode.promptIndex === primaryPromptIndex) {
                    Logger.log('Aggregator skipped to avoid duplicate execution with primary prompt.');
                    skipAggregator = true;
                }

                if (!skipAggregator) {
                    const controller = new AbortController();
                    const aggTaskId = `wbap-agg-${aggEndpoint.id || 'default'}`;

                    const combinedPrompts = WBAP.PromptManager.getCombinedPrompts();
                    let aggPromptIndex = aggregatorMode.promptIndex || 0;
                    if (aggPromptIndex >= combinedPrompts.length) {
                        aggPromptIndex = Math.max(0, combinedPrompts.length - 1);
                    }
                    const aggPromptTemplate = combinedPrompts[aggPromptIndex];

                    // Skip aggregator if the same endpoint already ran with the same prompt index (dedupe + efficiency)
                    const aggPairKey = `${aggEndpoint.id}::${aggPromptIndex}`;
                    if (!allowDuplicate && executedPairs.has(aggPairKey)) {
                        Logger.log('Aggregator skipped: endpoint already executed with the same prompt index.');
                    } else {
                        // Validate aggregator endpoint basic config
                        const hasModel = !!aggEndpoint.model;
                        const hasExternalApi = !!aggEndpoint.apiUrl || !!aggEndpoint.url;
                        const hasInternalApi = typeof SillyTavern !== 'undefined' && SillyTavern.getContext && SillyTavern.getContext()?.generate;

                        if (!hasModel && !hasExternalApi && !hasInternalApi) {
                            Logger.warn('Aggregator skipped: no model or API configured for aggregator endpoint.');
                        } else if (aggEndpoint.enabled === false) {
                            Logger.warn('Aggregator skipped: endpoint is disabled.');
                        } else if (aggPromptTemplate) {
                            const aggApiConfig = buildApiConfig(aggEndpoint, defaultTimeout, controller.signal);
                            const aggPrompts = buildPromptFromTemplate(aggPromptTemplate, {
                                userInput,
                                context,
                                worldbookContent: aggregatorWorldbookContent,
                                previousResults: baseResultsBlock
                            });
                            if (shouldShowProgressPanel(config) && WBAP.UI) {
                                WBAP.UI.showProgressPanel('总局二次处理中...', 1);
                                WBAP.UI.addProgressTask(aggTaskId, '总局二次处理', '等待中...');
                                if (WBAP.UI?.setCancelAllCallback) {
                                    WBAP.UI.setCancelAllCallback(() => controller.abort());
                                }
                                if (WBAP.UI?.setCancelTaskCallback) {
                                    WBAP.UI.setCancelTaskCallback(aggTaskId, () => controller.abort());
                                }
                                WBAP.UI.updateProgressTask(aggTaskId, '处理中...', 10);
                            }
                            try {
                                const aggResult = await callAI(
                                    aggApiConfig.model,
                                    aggPrompts.user,
                                    aggPrompts.system,
                                    { ...aggApiConfig }
                                );
                                // 只输出总局结果（去除前序分段的合并文本）
                                finalContent = aggResult.trim();
                                if (shouldShowProgressPanel(config) && WBAP.UI) {
                                    WBAP.UI.updateProgressTask(aggTaskId, '完成', 100);
                                }
                            } catch (err) {
                                const isAbort = err?.name === 'AbortError';
                                const message = isAbort ? '已终止' : (err?.message || 'Unknown error');
                                if (shouldShowProgressPanel(config) && WBAP.UI) {
                                    const statusText = isAbort ? '已终止' : `失败: ${message.substring(0, 20)}`;
                                    WBAP.UI.updateProgressTask(aggTaskId, statusText, 100);
                                }
                                Logger.error('Aggregator processing failed', err);
                            }
                        } else {
                            Logger.warn('Aggregator enabled but prompt not found');
                        }
                    }
                }

            } else if (aggregatorMode.enabled) {
                Logger.warn('Aggregator enabled but endpoint is missing or disabled.');
            }

            // ==================== Level-3 optimization & Tiangang (parallel) ====================
            const level3Cfg = config?.optimizationLevel3 || {};
            const doLevel3 = config?.enablePlotOptimization && level3Cfg.enabled && WBAP.Optimization?.processLevel3;
            const baseContent = finalContent;
            const level3TaskId = 'wbap-level3';

            const level3Promise = doLevel3
                ? (async () => {
                    try {
                        if (showProgress) {
                            const status = level3Cfg.autoConfirm ? '\u5904\u7406\u4e2d...' : '\u7b49\u5f85\u786e\u8ba4...';
                            WBAP.UI.updateProgressTask(level3TaskId, status, level3Cfg.autoConfirm ? 15 : 5);
                        }
                        Logger.log('Start level-3 optimization...');
                        const optimizedContent = await WBAP.Optimization.processLevel3(baseContent, {
                            originalInput: userInput,
                            context: context,
                            keepProgressPanel: true
                        });
                        if (optimizedContent && typeof optimizedContent === 'string') {
                            Logger.log('Level-3 optimization done');
                            if (showProgress) WBAP.UI.updateProgressTask(level3TaskId, '\u5b8c\u6210', 100);
                            return optimizedContent;
                        }
                    } catch (err) {
                        Logger.warn('Level-3 optimization skipped or failed', err);
                        if (showProgress) {
                            WBAP.UI.updateProgressTask(level3TaskId, `\u5931\u8d25: ${(err?.message || '').slice(0, 20)}`, 100);
                        }
                    }
                    if (showProgress) WBAP.UI.updateProgressTask(level3TaskId, '\u5b8c\u6210', 100);
                    return baseContent;
                })()
                : Promise.resolve(baseContent);
            const [level3Result, tgResult] = await Promise.all([level3Promise, tgPromise]);
            finalContent = level3Result || baseContent;
            let output = buildAnalysisBlock(finalContent);
            const tgText = typeof tgResult === 'string' ? tgResult.trim() : '';
            if (tgText && tgText !== tiangangInput) {
                output += `\n\n${buildTiangangBlock(formatTiangangOutput(tgText))}`;
            } else if (tgText) {
                Logger.warn('Tiangang result equals user input; ignored');
            }

            // 附加超级记忆检索结果
            if (superMemoryBlock) {
                output += `\n\n${superMemoryBlock}`;
            }

            return output;
        } catch (e) {
            Logger.error('Selective mode processing failed', e);
            throw e;
        } finally {
            // 注意：不在这里隐藏进度面板，由 interceptor 统一管理
            // 如果是独立调用（面板由本模块打开），则隐藏
            if (shouldShowProgressPanel(config) && WBAP.UI && !panelAlreadyOpen) {
                WBAP.UI.hideProgressPanel();
            }
        }
    }

    window.WBAP.runSelectiveModeProcessing = runSelectiveModeProcessing;
    window.WBAP.buildPromptFromTemplate = buildPromptFromTemplate;
    window.WBAP.getCurrentChatContext = getCurrentChatContext;
    window.WBAP.getRecentContext = getRecentContext;

})();

