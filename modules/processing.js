// modules/processing.js

(function () {
    'use strict';

    // Ensure namespace
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
    const ANALYSIS_BLOCK_REGEX = new RegExp(
        `<details[^>]*data-wbap\\s*=\\s*["']analysis["'][\\s\\S]*?<\\/details>|` +
        `<details[^>]*>\\s*<summary>\\s*(?:${SUMMARY_PATTERN})\\s*<\\/summary>[\\s\\S]*?<\\/details>`,
        'gi'
    );

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

    // Build prompts (system + user) with injected context and worldbook content
    function buildPromptFromTemplate(promptTemplate, { userInput, worldbookContent, context, previousResults }) {
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

        // Final system prompt = finalDirective + systemPrompt
        const finalSystemPrompt = (finalDirective ? finalDirective + '\n' : '') + systemPrompt;

        // User prompt injects user input + worldbook content
        let finalMainPrompt = replaceAllPlaceholders(mainPrompt, '{user_input}', userInput || '');
        finalMainPrompt = replaceAllPlaceholders(finalMainPrompt, '{worldbook_content}', worldbookContent || '');
        finalMainPrompt = replaceAllPlaceholders(finalMainPrompt, '{context}', context || '');
        finalMainPrompt = replaceAllPlaceholders(finalMainPrompt, '{previous_results}', previousResults || '');

        return { system: finalSystemPrompt, user: finalMainPrompt };
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

    // Expose main processing function
    async function runSelectiveModeProcessing(userInput, bookName = null, context = '') {
        const { config, loadWorldBookEntriesByName, callAI, mainConfig } = WBAP;
        const globalSettings = mainConfig?.globalSettings || {};
        const maxConcurrent = globalSettings.maxConcurrent || 0;
        const defaultTimeout = globalSettings.timeout || 0;
        const abortMessage = '任务已被终止';
        const buildAnalysisBlock = (content) => `<details data-wbap="analysis">\n<summary>${ANALYSIS_SUMMARY_TITLE}</summary>\n${content}\n</details>`;
        let abortAllRequested = false;

        try {
            if (config?.showProgressPanel && WBAP.UI) {
                WBAP.UI.showProgressPanel('正在初始化任务...');
            }

            if (!config || !config.selectiveMode) {
                Logger.warn('配置尚未初始化，跳过自选模式处理。');
                return null;
            }

            const endpoints = Array.isArray(config.selectiveMode.apiEndpoints) ? config.selectiveMode.apiEndpoints : [];
            if (endpoints.length === 0) {
                Logger.warn('未找到可用的 API 端点。');
                return null;
            }

            const allEndpoints = endpoints.filter(ep => ep && ep.enabled !== false);
            if (allEndpoints.length === 0) {
                Logger.warn('所有 API 端点均被禁用，已跳过处理。');
                return null;
            }
            const endpointsToProcessRaw = bookName
                ? allEndpoints.filter(ep => {
                    const wbs = Array.isArray(ep.worldBooks)
                        ? ep.worldBooks
                        : (ep.worldBook ? [ep.worldBook] : []);
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

            const tasksByBook = {};
            for (const endpoint of endpointsToProcess) {
                const worldBooks = Array.isArray(endpoint.worldBooks)
                    ? endpoint.worldBooks
                    : (endpoint.worldBook ? [endpoint.worldBook] : []);
                const entriesMap = endpoint.assignedEntriesMap || {};
                const legacyEntries = Array.isArray(endpoint.assignedEntries) ? endpoint.assignedEntries : [];
                worldBooks.forEach(wb => {
                    const assigned = entriesMap[wb] || legacyEntries;
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
            const usedWorldBooks = new Set();
            const usedEntriesByBook = new Map();
            for (const currentBookName in tasksByBook) {
                const book = bookCache.get(currentBookName);
                if (!book || !book.entries) {
                    continue; // Already warned above
                }
                const tableLike = isTableWorldBook(book);

                const endpointsForBook = tasksByBook[currentBookName];
                for (const { endpoint, assigned } of endpointsForBook) {
                    let content = '';
                    let entryIds = Array.isArray(assigned) ? assigned : [];
                    const enabledEntries = Object.entries(book.entries)
                        .filter(([, e]) => e && e.disable !== true);
                    const usedEntryIds = new Set();

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
                            usedEntryIds.add(info.uid);
                            columnBlocks.push(`[${name}]\n${info.entry.content || ''}`);
                        });
                        content = columnBlocks.join('\n\n');
                    } else if (entryIds.length === 0) {
                        // Non-table and nothing selected: skip execution
                        continue;
                    }

                    if (!tableLike) {
                        entryIds.forEach(entryId => {
                            const entry = book.entries[entryId];
                            if (entry && entry.disable !== true) {
                                usedEntryIds.add(entryId);
                                content += `[${entry.comment || entryId}]\n${entry.content}\n\n`;
                            }
                        });
                    }

                    if (content) {
                        baseTasks.push({
                            id: endpoint.id,
                            name: endpoint.name,
                            endpoint,
                            promptContent: content.trim()
                        });
                        usedWorldBooks.add(currentBookName);
                        if (usedEntryIds.size > 0) {
                            let entrySet = usedEntriesByBook.get(currentBookName);
                            if (!entrySet) {
                                entrySet = new Set();
                                usedEntriesByBook.set(currentBookName, entrySet);
                            }
                            usedEntryIds.forEach(id => entrySet.add(id));
                        }
                    }
                }
            }

            if (baseTasks.length === 0) {
                Logger.log('No executable tasks found.');
                return null;
            }

            // 选择提示词，并根据绑定的 API 分流任务
            const combinedPrompts = WBAP.PromptManager.getCombinedPrompts();
            if (!Array.isArray(combinedPrompts) || combinedPrompts.length === 0) {
                throw new Error('没有可用的提示词，请先创建或导入。');
            }
            const promptSelections = [];
            let primaryIndex = config?.selectedPromptIndex || 0;
            if (primaryIndex >= combinedPrompts.length) {
                primaryIndex = Math.max(0, combinedPrompts.length - 1);
                config.selectedPromptIndex = primaryIndex;
                WBAP.saveConfig();
            }
            const primaryTemplate = combinedPrompts?.[primaryIndex];
            if (!primaryTemplate) throw new Error('Prompt template not found');
            promptSelections.push({
                key: 'primary',
                template: primaryTemplate,
                promptIndex: primaryIndex,
                boundIds: Array.isArray(primaryTemplate.boundEndpointIds) ? primaryTemplate.boundEndpointIds.filter(Boolean) : []
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
                    promptSelections.push({
                        key: 'secondary',
                        template: secTemplate,
                        promptIndex: secIndex,
                        boundIds: Array.isArray(secConf.boundEndpointIds) ? secConf.boundEndpointIds.filter(Boolean) : []
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

                baseTasks.forEach((t, idx) => {
                    if (t.endpoint.enabled === false) return;

                    if (hasBinding) {
                        if (!allowed.has(t.id)) return;
                    } else {
                        // 若任意提示词已绑定该端点，则未绑定的提示词不得使用该端点
                        if (boundAnywhere.size > 0 && boundAnywhere.has(t.id)) {
                            return;
                        }
                        // 未绑定端点默认只随主提示词执行，避免被副提示词等重复消耗
                        if (sel.key !== 'primary') {
                            return;
                        }
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
                        promptTemplate: sel.template
                    });
                });
            });

            if (taskConfigs.length === 0) {
                Logger.warn('No tasks match the prompt bound API instances.');
                return null;
            }

            // Support single/abort-all termination
            const abortAll = () => {
                abortAllRequested = true;
                abortControllers.forEach(ctrl => ctrl.abort());
            };

            let completedTaskCount = 0;
            const processTask = async (task) => {
                if (config?.showProgressPanel && WBAP.UI) {
                    const pct = Math.round((completedTaskCount / taskConfigs.length) * 100);
                    WBAP.UI.updateProgressPanel(pct, `正在处理: ${task.name}`);
                }
                if (abortAllRequested || task.controller.signal.aborted) {
                    completedTaskCount++;
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
                const chunkShare = 95 / chunks.length;
                for (let i = 0; i < chunks.length; i++) {
                    const promptsForChunk = buildPromptFromTemplate(promptTemplate, {
                        userInput,
                        worldbookContent: chunks[i],
                        context
                    });
                    const progressBase = chunkShare * i;
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
                        completedTaskCount++;
                        return { name: task.name, error: message };
                    }
                }

                const merged = chunkResults.length > 1
                    ? chunkResults.map((r, idx) => `[分段 ${idx + 1}/${chunkResults.length}]\n${r}`).join('\n\n')
                    : chunkResults[0];

                completedTaskCount++;
                if (config?.showProgressPanel && WBAP.UI) {
                    const pct = Math.round((completedTaskCount / taskConfigs.length) * 100);
                    WBAP.UI.updateProgressPanel(pct, `完成: ${task.name}`);
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
                Logger.warn('All analysis tasks returned no result; nothing will be injected.');
                return null;
            }

            let baseResultsBlock = successfulResults.map(res => `--- ${res.name} 分析 ---\n${res.result}`).join('\n\n').trim();
            let finalContent = baseResultsBlock;

            // 总局二次处理
            const aggregatorMode = config?.aggregatorMode || {};
            const aggEndpoint = aggregatorMode.enabled
                ? (config?.selectiveMode?.apiEndpoints || []).find(ep => ep.id === aggregatorMode.endpointId && ep.enabled !== false)
                : null;

            if (aggregatorMode.enabled && aggEndpoint) {
                // 如果总局端点与主提示词相同且提示词索引一致，则跳过以避免重复执行
                const primaryPromptIndex = config?.selectedPromptIndex || 0;
                if (executedEndpointIds.has(aggEndpoint.id) && aggregatorMode.promptIndex === primaryPromptIndex) {
                    Logger.log('Aggregator skipped to avoid duplicate execution with primary prompt.');
                    return buildAnalysisBlock(finalContent);
                }

                const controller = new AbortController();
                const aggTaskId = `aggregator-${aggEndpoint.id}`;
                const aggTask = { id: aggTaskId, name: `${aggEndpoint.name || '总局 API'} - 二次处理` };
                const aggAbortMap = new Map([[aggTaskId, controller]]);
                let aggRan = false;

                const combinedPrompts = WBAP.PromptManager.getCombinedPrompts();
                let aggPromptIndex = aggregatorMode.promptIndex || 0;
                if (aggPromptIndex >= combinedPrompts.length) {
                    aggPromptIndex = Math.max(0, combinedPrompts.length - 1);
                }
                const aggPromptTemplate = combinedPrompts[aggPromptIndex];

                // Skip aggregator if the same endpoint already ran with the same prompt index (dedupe + efficiency)
                const aggPairKey = `${aggEndpoint.id}::${aggPromptIndex}`;
                if (executedPairs.has(aggPairKey)) {
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
                            previousResults: baseResultsBlock
                        });
                        try {
                            const aggResult = await callAI(
                                aggApiConfig.model,
                                aggPrompts.user,
                                aggPrompts.system,
                                { ...aggApiConfig }
                            );
                            // 只输出总局结果（去除前序分段的合并文本）
                            finalContent = aggResult.trim();
                            aggRan = true;
                        } catch (err) {
                            const message = err.name === 'AbortError' ? 'Aggregator aborted' : err.message;
                            Logger.error('Aggregator processing failed', err);
                        }
                    } else {
                        Logger.warn('Aggregator enabled but prompt not found');
                    }
                }

            } else if (aggregatorMode.enabled) {
                Logger.warn('Aggregator enabled but endpoint is missing or disabled.');
            }

            if (config.enablePlotOptimization && WBAP.Optimization && WBAP.Optimization.openPanel) {
                const selectedEntries = {};
                usedEntriesByBook.forEach((set, bookName) => {
                    selectedEntries[bookName] = Array.from(set);
                });
                // 如果启用了剧情优化，则不直接返回 AnalysisBlock，而是打开面板
                // 并将当前结果传递给面板
                WBAP.Optimization.openPanel(finalContent, {
                    userInput,
                    context,
                    worldBooks: Array.from(usedWorldBooks),
                    selectedEntries,
                    endpoints: executedEndpointIds // 传递已使用的端点信息等
                });

                // 返回 null 或特定标记，告诉调用者已被拦截
                Logger.log('Processing intercepted by Plot Optimization Panel.');
                return null;
            }

            return buildAnalysisBlock(finalContent);
        } catch (e) {
            Logger.error('Selective mode processing failed', e);
            throw e;
        } finally {
            if (config?.showProgressPanel && WBAP.UI) {
                WBAP.UI.hideProgressPanel();
            }
        }
    }

    window.WBAP.runSelectiveModeProcessing = runSelectiveModeProcessing;
    window.WBAP.getCurrentChatContext = getCurrentChatContext;
    window.WBAP.getRecentContext = getRecentContext;

})();

