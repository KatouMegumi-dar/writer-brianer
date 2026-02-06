/**
 * 超级记忆模块 (Super Memory)
 * 负责智能检索世界书内容并注入对话上下文
 * 集成多维知识图谱进行智能检索
 */
(function () {
    'use strict';

    window.WBAP = window.WBAP || {};
    const Logger = WBAP.Logger;

    // 图谱缓存
    let graphCache = null;
    let graphCacheKey = null;

    // PEDSA-JS 引擎实例（一阶段）
    let pedsaJsEngine = null;
    let pedsaJsCacheKey = null;

    function clampNumber(value, min, max, fallback) {
        const num = Number(value);
        if (!Number.isFinite(num)) return fallback;
        return Math.min(max, Math.max(min, num));
    }

    // 轻量签名：用于检测 entries 内容变化，避免 entries.length 不变但内容变了导致缓存不更新
    function computeEntriesSignature(entries) {
        if (!Array.isArray(entries) || entries.length === 0) return '0';

        // FNV-1a 32-bit
        let hash = 0x811c9dc5;
        const fnv1a = (str) => {
            for (let i = 0; i < str.length; i++) {
                hash ^= str.charCodeAt(i);
                hash = Math.imul(hash, 0x01000193);
            }
        };

        // 采样/截断，避免对超长内容做全量哈希
        const maxItems = Math.min(entries.length, 300);
        for (let i = 0; i < maxItems; i++) {
            const e = entries[i] || {};
            const uid = e.uid ?? '';
            const comment = e.comment ?? '';
            const key = e.key ?? '';
            const content = e.content ?? '';
            const head = typeof content === 'string' ? content.slice(0, 120) : '';
            const len = typeof content === 'string' ? content.length : 0;
            fnv1a(String(uid));
            fnv1a('|');
            fnv1a(String(comment));
            fnv1a('|');
            fnv1a(String(key));
            fnv1a('|');
            fnv1a(String(len));
            fnv1a('|');
            fnv1a(head);
            fnv1a('\n');
        }

        return `${entries.length}:${(hash >>> 0).toString(16)}`;
    }

    const SuperMemory = {
        /**
         * 主入口：执行超级记忆检索
         * @param {string} userInput - 用户当前输入
         * @param {string} context - 最近对话上下文
         * @returns {Promise<string>} - 生成的记忆注入块
         */
        async retrieve(userInput, context) {
            // 【关键修复】始终从 CharacterManager 获取最新配置
            const charConfig = WBAP.CharacterManager?.getCurrentCharacterConfig?.() || WBAP.config || {};
            const config = charConfig.superMemory;
            if (!config?.enabled) {
                Logger.log('[SuperMemory] 未启用，跳过');
                return '';
            }

            const selectedBooks = config.selectedWorldBooks || [];
            if (selectedBooks.length === 0) {
                Logger.log('[SuperMemory] 未选择世界书，跳过');
                return '';
            }

            Logger.log(`[SuperMemory] 开始检索，世界书: ${selectedBooks.join(', ')}`);

            // 1. 加载所有选中的世界书内容
            let worldbookContent = await this.loadSelectedWorldbooks(selectedBooks);
            if (!worldbookContent || worldbookContent.length === 0) {
                Logger.warn('[SuperMemory] 世界书内容为空');
                return '';
            }

            Logger.log(`[SuperMemory] 加载了 ${worldbookContent.length} 个条目`);

            // 1.5 PEDSA 预检索（优先使用本地JS引擎，其次使用Rust服务）
            let pedsaFiltered = false;
            let pedsaSource = null;

            // 一阶段：PEDSA-JS 本地引擎（纯JavaScript，无需Rust）
            if (WBAP.PedsaEngine && config.usePedsaJsRetrieval !== false) {
                try {
                    const pedsaJsResult = await this.pedsaJsRetrieval(userInput, worldbookContent, selectedBooks);
                    if (pedsaJsResult.success && pedsaJsResult.results.length > 0) {
                        const originalCount = worldbookContent.length;
                        worldbookContent = this.filterEntriesByPedsaJsResults(worldbookContent, pedsaJsResult.results);
                        pedsaFiltered = true;
                        pedsaSource = 'PEDSA-JS';
                        Logger.log(`[SuperMemory] PEDSA-JS 预检索: ${originalCount} → ${worldbookContent.length} 条目, 耗时 ${pedsaJsResult.stats.retrieveTimeMs.toFixed(2)}ms`);
                    }
                } catch (e) {
                    Logger.warn('[SuperMemory] PEDSA-JS 检索失败:', e.message);
                }
            }

            // 二阶段：PEDSA Rust 服务（如果JS引擎未筛选且Rust服务可用）
            // 注意：二阶段为显式开关（与 UI 保持一致）：仅当 usePedsaRetrieval === true 才启用
            if (!pedsaFiltered && WBAP.PedsaClient?.isAvailable && config.usePedsaRetrieval === true) {
                try {
                    // 首次同步数据到 PEDSA
                    if (!WBAP.PedsaClient._synced) {
                        Logger.log('[SuperMemory] 首次同步世界书数据到 PEDSA...');
                        await this.syncToPedsa(selectedBooks, worldbookContent);
                    }

                    // 执行 PEDSA 检索
                    const pedsaStart = performance.now();
                    const pedsaResults = await WBAP.PedsaClient.retrieve(userInput, {
                        top_k: 20,
                        enable_temporal: true,
                        enable_affective: true,
                        enable_spatial: true
                    });
                    const pedsaTime = performance.now() - pedsaStart;

                    if (pedsaResults.success && pedsaResults.results.length > 0) {
                        const originalCount = worldbookContent.length;
                        worldbookContent = WBAP.PedsaClient.filterEntriesByPedsaResults(
                            worldbookContent,
                            pedsaResults.results
                        );
                        pedsaFiltered = true;
                        pedsaSource = 'PEDSA-Rust';
                        Logger.log(`[SuperMemory] PEDSA-Rust 预检索: ${originalCount} → ${worldbookContent.length} 条目, 耗时 ${pedsaTime.toFixed(2)}ms`);
                    }
                } catch (e) {
                    Logger.warn('[SuperMemory] PEDSA 检索失败，使用全量数据:', e.message);
                }
            }

            // 2. 构建/获取多维图谱并执行智能检索
            let graphRetrievalResult = null;
            if (WBAP.MultiDimGraph && config.useGraphRetrieval !== false) {
                graphRetrievalResult = await this.graphBasedRetrieval(userInput, context, worldbookContent, selectedBooks);

                // 2.5 LLM 增量更新图谱（如果启用）
                if (config.useLLMGraphUpdate !== false && context && context.length > 50) {
                    this.scheduleIncrementalUpdate(context + '\n' + userInput);
                }
            }

            // 3. 根据图谱检索结果筛选世界书内容（核心改进：精准筛选而非简单排序）
            let filteredContent = worldbookContent;
            if (graphRetrievalResult?.nodes?.length > 0) {
                filteredContent = this.filterByGraphResult(
                    worldbookContent,
                    graphRetrievalResult,
                    config?.graphEnergyThreshold
                );
                Logger.log(`[SuperMemory] 图谱筛选：${worldbookContent.length} → ${filteredContent.length} 条目`);
            }

            // 4. 并发调用三个 Agent（使用筛选后的内容）
            const agentConfig = config.agents || {};
            const results = await Promise.allSettled([
                this.callAgent('archivist', agentConfig.archivist, userInput, context, filteredContent, graphRetrievalResult),
                this.callAgent('historian', agentConfig.historian, userInput, context, filteredContent, graphRetrievalResult),
                this.callAgent('status_reader', agentConfig.status_reader, userInput, context, filteredContent, graphRetrievalResult)
            ]);

            // 5. 整合结果（包含图谱洞察）
            const memoryBlock = this.assembleResults(results, graphRetrievalResult);

            if (memoryBlock) {
                Logger.log('[SuperMemory] 检索完成，生成记忆块');
            }

            return memoryBlock;
        },

        /**
         * 基于图谱的智能检索
         */
        async graphBasedRetrieval(userInput, context, entries, bookNames) {
            try {
                const sortedBooks = [...(bookNames || [])].sort();
                const signature = computeEntriesSignature(entries);
                const cacheKey = sortedBooks.join('|') + '|' + signature;

                // 检查缓存
                if (graphCache && graphCacheKey === cacheKey) {
                    Logger.log('[SuperMemory] 使用缓存的图谱');
                } else {
                    // 构建新图谱
                    Logger.log('[SuperMemory] 构建多维图谱...');
                    graphCache = await WBAP.MultiDimGraph.build(entries);
                    graphCacheKey = cacheKey;
                }

                // 执行智能检索
                const result = await WBAP.MultiDimGraph.smartRetrieve(userInput, context, { topK: 15 });
                return result;
            } catch (e) {
                Logger.warn('[SuperMemory] 图谱检索失败:', e);
                return null;
            }
        },

        /**
         * 根据图谱结果精准筛选内容（核心方法）
         */
        filterByGraphResult(entries, graphResult, energyThreshold) {
            if (!graphResult?.nodes?.length) return entries;

            // 1. 创建高相关节点的 ID 集合
            const relevantNodeIds = new Set();
            const energyMap = new Map();

            const threshold = clampNumber(energyThreshold, 0.01, 0.5, 0.1);
            graphResult.nodes.forEach(node => {
                if (node.energy >= threshold) {
                    relevantNodeIds.add(node.id);
                    energyMap.set(node.id, node.energy);
                    if (node.entry?.uid) {
                        relevantNodeIds.add(node.entry.uid.toString());
                        energyMap.set(node.entry.uid.toString(), node.energy);
                    }
                }
            });

            // 2. 筛选出相关条目
            const filtered = entries.filter(entry => {
                const uid = entry.uid?.toString();
                return relevantNodeIds.has(uid);
            });

            // 3. 按能量排序
            filtered.sort((a, b) => {
                const energyA = energyMap.get(a.uid?.toString()) || 0;
                const energyB = energyMap.get(b.uid?.toString()) || 0;
                return energyB - energyA;
            });

            // 4. 如果筛选结果太少，补充一些高重要度节点
            if (filtered.length < 5 && entries.length > filtered.length) {
                const existingUids = new Set(filtered.map(e => e.uid?.toString()));
                const additional = entries
                    .filter(e => !existingUids.has(e.uid?.toString()))
                    .slice(0, 5 - filtered.length);
                filtered.push(...additional);
            }

            return filtered;
        },

        /**
         * 根据图谱结果优化内容排序（保留作为备用）
         */
        optimizeContentOrder(entries, graphResult) {
            if (!graphResult?.nodes?.length) return entries;

            // 创建节点ID到能量的映射
            const energyMap = new Map();
            graphResult.nodes.forEach(node => {
                energyMap.set(node.id, node.energy || 0);
                // 也用 entry.uid 映射
                if (node.entry?.uid) {
                    energyMap.set(node.entry.uid.toString(), node.energy || 0);
                }
            });

            // 按能量排序
            const sorted = [...entries].sort((a, b) => {
                const energyA = energyMap.get(a.uid?.toString()) || 0;
                const energyB = energyMap.get(b.uid?.toString()) || 0;
                return energyB - energyA;
            });

            return sorted;
        },

        /**
         * 加载选中的世界书内容
         */
        async loadSelectedWorldbooks(bookNames) {
            const allEntries = [];

            for (const bookName of bookNames) {
                try {
                    const book = await WBAP.loadWorldBookEntriesByName(bookName);
                    if (book && book.entries) {
                        const entries = Object.values(book.entries)
                            .filter(e => e && e.disable !== true)
                            .map(e => ({
                                uid: e.uid,
                                key: Array.isArray(e.key) ? e.key.join(', ') : (e.key || ''),
                                comment: e.comment || '',
                                content: e.content || '',
                                book: bookName
                            }));
                        allEntries.push(...entries);
                    }
                } catch (e) {
                    Logger.warn(`[SuperMemory] 加载世界书 ${bookName} 失败:`, e);
                }
            }

            return allEntries;
        },

        /**
         * 调用单个 Agent
         */
        async callAgent(agentType, agentConfig, userInput, context, worldbookContent, graphResult = null) {
            if (!agentConfig) {
                return { type: agentType, result: null, error: 'No config' };
            }

            // 获取 API 配置
            let apiConfig = null;
            if (agentConfig.endpointId) {
                const endpoints = WBAP.getGlobalPools?.()?.selectiveMode?.apiEndpoints || [];
                apiConfig = endpoints.find(ep => ep.id === agentConfig.endpointId);
            }

            if (!apiConfig) {
                // 使用默认 API（第一个可用的）
                const endpoints = WBAP.getGlobalPools?.()?.selectiveMode?.apiEndpoints || [];
                apiConfig = endpoints.find(ep => ep.enabled !== false);
            }

            if (!apiConfig) {
                return { type: agentType, result: null, error: 'No API available' };
            }

            // 构建提示词
            const systemPrompt = agentConfig.systemPrompt || this.getDefaultPrompt(agentType);
            const model = agentConfig.model || apiConfig.model;

            // 构建图谱洞察（核心分析）
            const graphInsight = this.buildGraphInsight(graphResult, agentType);

            // 构建世界书摘要（已经是筛选后的高相关内容）
            const worldbookSummary = this.buildWorldbookSummary(worldbookContent, 6000);

            // 重构 prompt：图谱分析为核心，世界书为参考
            const userPrompt = graphInsight ? `
## 用户查询
${userInput}

## 对话上下文
${context || '(无)'}

## 🔮 知识图谱分析（核心参考）
${graphInsight}

## 📚 相关知识条目（已筛选，共${worldbookContent.length}条）
${worldbookSummary}

## 你的任务
基于【知识图谱分析】中的关联路径和维度信息，结合【相关知识条目】的具体内容，按照你的角色定位进行分析。
重点关注图谱标注的核心关联和关联路径，这些是与查询最相关的信息。
` : `
## 用户查询
${userInput}

## 对话上下文
${context || '(无)'}

## 可用知识
${worldbookSummary}

## 你的任务
从上述知识中检索最相关的信息，按照你的角色定位进行分析和总结。
`;

            try {
                const response = await WBAP.callAI(
                    model,
                    userPrompt,
                    systemPrompt,
                    {
                        apiUrl: apiConfig.apiUrl || apiConfig.url,
                        apiKey: apiConfig.apiKey || apiConfig.key,
                        maxTokens: 1000,
                        temperature: 0.3,
                        timeout: 60
                    }
                );

                return {
                    type: agentType,
                    result: typeof response === 'string' ? response : (response?.content || response?.message?.content || ''),
                    error: null
                };
            } catch (e) {
                Logger.error(`[SuperMemory] Agent ${agentType} 调用失败:`, e);
                return { type: agentType, result: null, error: e.message };
            }
        },

        /**
         * 构建图谱洞察信息（增强版：包含关联路径和详细分析）
         */
        buildGraphInsight(graphResult, agentType) {
            if (!graphResult?.nodes?.length) return '';

            const EDGE_DIMENSIONS = WBAP.EDGE_DIMENSIONS || {};
            const dimensionWeights = graphResult.dimensionWeights || {};

            // 根据 Agent 类型选择相关维度
            const relevantDimensions = {
                archivist: ['thematic', 'character'],
                historian: ['temporal', 'causal'],
                status_reader: ['emotional', 'spatial']
            };

            const dims = relevantDimensions[agentType] || Object.keys(dimensionWeights);
            const insights = [];

            // 1. 维度权重信息
            const activeDims = dims.filter(d => (dimensionWeights[d] || 0) >= 0.4);
            if (activeDims.length > 0) {
                const dimLabels = activeDims.map(d => {
                    const dim = Object.values(EDGE_DIMENSIONS).find(ed => ed.id === d);
                    const weight = dimensionWeights[d] || 0;
                    return dim ? `${dim.icon}${dim.label}(${(weight * 100).toFixed(0)}%)` : null;
                }).filter(Boolean);
                insights.push(`【激活维度】${dimLabels.join(' | ')}`);
            }

            // 2. 高相关节点及其能量值
            const topNodes = graphResult.nodes.slice(0, 8);
            if (topNodes.length > 0) {
                const nodeList = topNodes.map(n => {
                    const energy = (n.energy * 100).toFixed(0);
                    return `${n.label}(${energy}%)`;
                }).join(', ');
                insights.push(`【核心关联】${nodeList}`);
            }

            // 3. 关联路径分析（从图谱边中提取）
            const graph = WBAP.MultiDimGraph;
            if (graph && topNodes.length >= 2) {
                const paths = this.extractRelationPaths(topNodes, dims);
                if (paths.length > 0) {
                    insights.push(`【关联路径】\n${paths.join('\n')}`);
                }
            }

            // 4. Agent 特定信息
            if (agentType === 'historian') {
                // 时间线信息
                const events = graphResult.nodes.filter(n => n.eventSummary || n.temporalInfo);
                if (events.length > 0) {
                    const eventList = events.slice(0, 3).map(e => {
                        const time = e.temporalInfo?.join('/') || e.eventSummary?.temporal?.join('/') || '?';
                        return `${e.label}[${time}]`;
                    }).join(' → ');
                    insights.push(`【时间脉络】${eventList}`);
                }
            } else if (agentType === 'status_reader') {
                // 状态变化信息
                const stateNodes = graphResult.nodes.filter(n => n.stateHistory?.length > 0 || n.emotionalState);
                if (stateNodes.length > 0) {
                    const stateList = stateNodes.slice(0, 3).map(n => {
                        const emotion = n.emotionalState || 'neutral';
                        const location = n.spatialInfo?.[0] || '?';
                        return `${n.label}: 情感=${emotion}, 位置=${location}`;
                    }).join('\n');
                    insights.push(`【状态快照】\n${stateList}`);
                }
            }

            return insights.join('\n\n');
        },

        /**
         * 提取关联路径
         */
        extractRelationPaths(nodes, relevantDims) {
            const graph = WBAP.MultiDimGraph;
            if (!graph) return [];

            const paths = [];
            const nodeIds = new Set(nodes.map(n => n.id));

            // 查找节点之间的直接关联
            graph.edges.forEach(edge => {
                if (nodeIds.has(edge.source) && nodeIds.has(edge.target)) {
                    const sourceNode = graph.nodes.get(edge.source);
                    const targetNode = graph.nodes.get(edge.target);
                    if (!sourceNode || !targetNode) return;

                    // 筛选相关维度的边
                    const relevantEdgeDims = edge.dimensions?.filter(d =>
                        relevantDims.includes(d.dimension?.id)
                    ) || [];

                    if (relevantEdgeDims.length > 0) {
                        const dimIcons = relevantEdgeDims.map(d => d.dimension?.icon || '').join('');
                        const strength = relevantEdgeDims.reduce((sum, d) => sum + (d.strength || 0.5), 0) / relevantEdgeDims.length;
                        paths.push(`  ${sourceNode.label} ${dimIcons}→ ${targetNode.label} (强度:${(strength * 100).toFixed(0)}%)`);
                    }
                }
            });

            return paths.slice(0, 5); // 最多5条路径
        },

        /**
         * 构建世界书摘要（控制长度）
         */
        buildWorldbookSummary(entries, maxChars) {
            let summary = '';
            let currentLength = 0;

            for (const entry of entries) {
                const entryText = `【${entry.comment || entry.key}】\n${entry.content}\n\n`;
                if (currentLength + entryText.length > maxChars) {
                    summary += `\n... (还有 ${entries.length - entries.indexOf(entry)} 个条目被截断)`;
                    break;
                }
                summary += entryText;
                currentLength += entryText.length;
            }

            return summary || '(无可用知识)';
        },

        /**
         * 整合三个 Agent 的结果
         */
        assembleResults(results, graphResult = null) {
            const parts = [];
            const typeNames = {
                archivist: '📚 档案检索',
                historian: '📜 历史脉络',
                status_reader: '📊 状态监测'
            };

            // 添加图谱概览（如果有）
            if (graphResult?.dimensionWeights) {
                const EDGE_DIMENSIONS = WBAP.EDGE_DIMENSIONS || {};
                const activeDims = Object.entries(graphResult.dimensionWeights)
                    .filter(([_, w]) => w >= 0.5)
                    .map(([id, w]) => {
                        const dim = Object.values(EDGE_DIMENSIONS).find(d => d.id === id);
                        return dim ? `${dim.icon}${dim.label}(${(w * 100).toFixed(0)}%)` : null;
                    })
                    .filter(Boolean);

                if (activeDims.length > 0) {
                    parts.push(`### 🔮 图谱分析\n激活维度: ${activeDims.join(' | ')}\n关联节点: ${graphResult.nodes?.length || 0} 个`);
                }
            }

            for (const result of results) {
                if (result.status === 'fulfilled' && result.value?.result) {
                    const { type, result: content } = result.value;
                    if (content && content.trim()) {
                        parts.push(`### ${typeNames[type] || type}\n${content.trim()}`);
                    }
                }
            }

            if (parts.length === 0) {
                return '';
            }

            return `
<超级记忆检索结果>
${parts.join('\n\n')}
</超级记忆检索结果>
`.trim();
        },

        /**
         * 获取默认 Agent 提示词
         */
        getDefaultPrompt(agentType) {
            const defaults = {
                archivist: `你是一名专业的档案管理员。你的任务是：
1. 根据用户的查询，在世界书内容中检索最相关的条目
2. 提取并总结关键信息
3. 以简洁、客观的方式呈现检索结果
输出格式：直接列出相关的知识点，每条用 - 开头。`,

                historian: `你是一名历史学家。你的任务是：
1. 分析对话上下文和用户输入中涉及的时间线索
2. 从世界书中找出相关的历史事件
3. 梳理事件的发展脉络和因果关系
输出格式：按时间顺序列出关键事件，注明事件之间的关联。`,

                status_reader: `你是一名状态监测员。你的任务是：
1. 从对话上下文中提取角色的当前状态（物理状态、心理状态、装备、位置等）
2. 识别环境的变化
3. 标记任何需要注意的状态变化
输出格式：以列表形式呈现各项状态。`
            };
            return defaults[agentType] || '';
        },

        // ==================== LLM 增量更新 ====================

        /**
         * 增量更新防抖定时器
         */
        _updateTimer: null,
        _pendingDialogue: '',

        /**
         * 调度增量更新（防抖，避免频繁调用）
         */
        scheduleIncrementalUpdate(dialogue) {
            // 累积对话内容
            this._pendingDialogue += '\n' + dialogue;

            // 清除之前的定时器
            if (this._updateTimer) {
                clearTimeout(this._updateTimer);
            }

            // 延迟执行（3秒后，如果没有新对话则执行更新）
            this._updateTimer = setTimeout(async () => {
                if (this._pendingDialogue.length > 100 && WBAP.MultiDimGraph) {
                    Logger.log('[SuperMemory] 执行图谱增量更新...');
                    const result = await WBAP.MultiDimGraph.incrementalUpdate(this._pendingDialogue);
                    if (result.success) {
                        Logger.log(`[SuperMemory] 增量更新完成: +${result.edges} 边, +${result.nodes} 节点`);
                    }
                }
                this._pendingDialogue = '';
            }, 3000);
        },

        /**
         * 手动触发增量更新
         */
        async forceIncrementalUpdate(dialogue) {
            if (!WBAP.MultiDimGraph) {
                return { success: false, reason: 'MultiDimGraph not loaded' };
            }
            return await WBAP.MultiDimGraph.incrementalUpdate(dialogue);
        },

        /**
         * 获取图谱动态数据统计
         */
        getGraphDynamicStats() {
            if (!WBAP.MultiDimGraph) return null;
            return WBAP.MultiDimGraph.getDynamicStats();
        },

        /**
         * 清除图谱动态数据
         */
        clearGraphDynamicData() {
            if (WBAP.MultiDimGraph) {
                WBAP.MultiDimGraph.clearDynamicData();
            }
        },

        // ==================== PEDSA 集成 ====================

        // ==================== PEDSA-JS 一阶段（纯JavaScript） ====================

        /**
         * PEDSA-JS 本地检索
         * @param {string} query - 查询文本
         * @param {Array} entries - 世界书条目
         * @param {Array} bookNames - 世界书名称列表
         * @returns {Promise<Object>} - 检索结果
         */
        async pedsaJsRetrieval(query, entries, bookNames) {
            if (!WBAP.PedsaEngine) {
                return { success: false, results: [], stats: {} };
            }

            const startTime = performance.now();
            const sortedBooks = [...(bookNames || [])].sort();
            const signature = computeEntriesSignature(entries);
            const cacheKey = sortedBooks.join('|') + '|' + signature;

            // 检查是否需要重建引擎
            if (!pedsaJsEngine || pedsaJsCacheKey !== cacheKey) {
                Logger.log('[SuperMemory] 构建 PEDSA-JS 引擎...');
                pedsaJsEngine = new WBAP.PedsaEngine();

                // 添加所有条目作为事件节点
                for (let i = 0; i < entries.length; i++) {
                    const entry = entries[i];
                    const content = `${entry.comment || ''} ${entry.key || ''} ${entry.content || ''}`;
                    pedsaJsEngine.addEvent(entry.uid || i, content, {
                        timestamp: this.extractTimestampFromEntry(entry),
                        location: this.extractLocationFromEntry(entry),
                        emotions: this.extractEmotionsFromEntry(entry),
                        originalEntry: entry
                    });

                    // 提取关键词作为特征节点并建立边
                    const keywords = this.extractKeywordsFromEntry(entry);
                    for (const keyword of keywords) {
                        const featureId = pedsaJsEngine.getOrCreateFeature(keyword);
                        pedsaJsEngine.addEdge(featureId, entry.uid || i, 0.8);
                    }
                }

                // 构建本体边（语义关系）
                this.buildPedsaJsOntology(pedsaJsEngine, entries);

                // 编译引擎
                pedsaJsEngine.compile();
                pedsaJsCacheKey = cacheKey;

                const buildTime = performance.now() - startTime;
                Logger.log(`[SuperMemory] PEDSA-JS 引擎构建完成: ${pedsaJsEngine.getStats().totalNodes} 节点, 耗时 ${buildTime.toFixed(2)}ms`);
            }

            // 执行检索
            const result = pedsaJsEngine.retrieve(query, { topK: 20 });

            return result;
        },

        /**
         * 从条目中提取时间戳
         */
        extractTimestampFromEntry(entry) {
            const text = `${entry.comment || ''} ${entry.content || ''}`;
            const match = text.match(/(\d{4})年(\d{1,2})月(\d{1,2})日/);
            if (match) {
                const [, year, month, day] = match;
                return new Date(parseInt(year), parseInt(month) - 1, parseInt(day)).getTime() / 1000;
            }
            return 0;
        },

        /**
         * 从条目中提取地点
         */
        extractLocationFromEntry(entry) {
            const text = `${entry.comment || ''} ${entry.content || ''}`;
            const locations = ['上海', '深圳', '北京', '杭州', '广州', '成都', '武汉', '南京'];
            for (const loc of locations) {
                if (text.includes(loc)) return loc;
            }
            return '';
        },

        /**
         * 从条目中提取情感
         */
        extractEmotionsFromEntry(entry) {
            const text = `${entry.comment || ''} ${entry.content || ''}`;
            const emotions = [];
            const emotionKeywords = {
                joy: ['开心', '高兴', '欣慰', '快乐', '成功', '幸福'],
                sadness: ['难过', '低落', '失望', '遗憾', '悲伤'],
                anger: ['生气', '恼火', '不爽', '愤怒'],
                fear: ['害怕', '担心', '焦虑', '恐惧'],
                surprise: ['没想到', '竟然', '惊讶', '意外']
            };
            for (const [emotion, keywords] of Object.entries(emotionKeywords)) {
                if (keywords.some(kw => text.includes(kw))) {
                    emotions.push(emotion);
                }
            }
            return emotions;
        },

        /**
         * 从条目中提取关键词
         */
        extractKeywordsFromEntry(entry) {
            const keywords = [];

            // 从 key 字段提取
            if (entry.key) {
                const keyStr = Array.isArray(entry.key) ? entry.key.join(',') : entry.key;
                keywords.push(...keyStr.split(/[,，、\s]+/).filter(k => k.length >= 2));
            }

            // 从 comment 提取
            if (entry.comment) {
                // 提取中文词汇（简单的2-4字词）
                const chineseWords = entry.comment.match(/[\u4e00-\u9fa5]{2,4}/g) || [];
                keywords.push(...chineseWords);
            }

            // 去重
            return [...new Set(keywords)].slice(0, 10);
        },

        /**
         * 构建 PEDSA-JS 本体边
         */
        buildPedsaJsOntology(engine, entries) {
            // 从条目中提取实体并建立语义关系
            const entityMap = new Map(); // 实体名 -> 出现的条目ID列表

            for (const entry of entries) {
                const text = `${entry.comment || ''} ${entry.content || ''}`;

                // 提取人名（简单启发式：2-3字中文名）
                const names = text.match(/[\u4e00-\u9fa5]{2,3}(?=说|想|做|去|来|是|的|了)/g) || [];
                for (const name of names) {
                    if (!entityMap.has(name)) entityMap.set(name, []);
                    entityMap.get(name).push(entry.uid);
                }
            }

            // 为共现的实体建立本体边
            for (const [entity, entryIds] of entityMap) {
                if (entryIds.length < 2) continue;

                const featureId = engine.getOrCreateFeature(entity);

                // 实体与其出现的条目建立边
                for (const entryId of entryIds) {
                    engine.addEdge(featureId, entryId, 0.7);
                }
            }

            // 添加一些通用的语义关系
            const semanticPairs = [
                ['喜欢', '爱', 0.9, true],
                ['讨厌', '不喜欢', 0.9, true],
                ['朋友', '好友', 0.95, true],
                ['家人', '亲人', 0.95, true],
                ['工作', '职业', 0.8, false],
                ['学习', '学校', 0.7, false]
            ];

            for (const [word1, word2, weight, isEquality] of semanticPairs) {
                engine.addOntologyEdge(word1, word2, weight, isEquality);
            }
        },

        /**
         * 根据 PEDSA-JS 结果筛选条目
         */
        filterEntriesByPedsaJsResults(entries, pedsaResults) {
            if (!pedsaResults || pedsaResults.length === 0) return entries;

            // 创建结果ID到分数的映射
            const scoreMap = new Map();
            for (const result of pedsaResults) {
                scoreMap.set(result.nodeId, result.score);
                // 也用 originalEntry 的 uid 映射
                if (result.originalEntry?.uid) {
                    scoreMap.set(result.originalEntry.uid, result.score);
                }
            }

            // 筛选出在结果中的条目
            const filtered = entries.filter(entry => {
                return scoreMap.has(entry.uid);
            });

            // 按分数排序
            filtered.sort((a, b) => {
                const scoreA = scoreMap.get(a.uid) || 0;
                const scoreB = scoreMap.get(b.uid) || 0;
                return scoreB - scoreA;
            });

            // 如果筛选结果太少，补充一些原始条目
            if (filtered.length < 5 && entries.length > filtered.length) {
                const existingUids = new Set(filtered.map(e => e.uid));
                const additional = entries
                    .filter(e => !existingUids.has(e.uid))
                    .slice(0, Math.max(5, 10 - filtered.length));
                filtered.push(...additional);
            }

            return filtered;
        },

        /**
         * 清除 PEDSA-JS 引擎缓存
         */
        clearPedsaJsCache() {
            if (pedsaJsEngine) {
                pedsaJsEngine.clear();
                pedsaJsEngine = null;
            }
            pedsaJsCacheKey = null;
            Logger.log('[SuperMemory] PEDSA-JS 缓存已清除');
        },

        /**
         * 获取 PEDSA-JS 引擎统计
         */
        getPedsaJsStats() {
            if (!pedsaJsEngine) return null;
            return pedsaJsEngine.getStats();
        },

        // ==================== PEDSA-Rust 二阶段（需要Rust服务） ====================

        /**
         * 同步世界书数据到 PEDSA Rust 服务（二阶段）
         */
        async syncToPedsa(selectedBooks, entries) {
            if (!WBAP.PedsaClient) return;

            const worldbooks = [];

            for (const bookName of selectedBooks) {
                const bookEntries = entries.filter(e => e.book === bookName);
                if (bookEntries.length > 0) {
                    const convertedEntries = WBAP.PedsaClient.convertEntriesToPedsaFormat(bookEntries, bookName);
                    worldbooks.push({
                        name: bookName,
                        entries: convertedEntries
                    });
                }
            }

            // 构建本体边（可从配置加载）
            const ontology = this.buildOntologyEdges();

            const result = await WBAP.PedsaClient.sync(worldbooks, ontology);
            if (result.success) {
                WBAP.PedsaClient._synced = true;
                Logger.log('[SuperMemory] PEDSA 同步完成');
            }
        },

        /**
         * 构建本体边（语义关系）
         */
        buildOntologyEdges() {
            // 基础本体边，可以从配置中扩展
            return [
                // 示例：可以根据角色设定添加更多
            ];
        },

        /**
         * 标记 PEDSA 需要重新同步
         */
        invalidatePedsaSync() {
            if (WBAP.PedsaClient) {
                WBAP.PedsaClient._synced = false;
            }
        }
    };

    // 导出模块
    WBAP.SuperMemory = SuperMemory;
    Logger.log('[SuperMemory] 模块已加载');
})();
