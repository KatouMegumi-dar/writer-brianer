/**
 * 超级记忆模块 (Super Memory)
 * 
 * 负责智能检索世界书内容并注入对话上下文，集成多维知识图谱进行智能检索。
 * 
 * ## 架构概述
 * 
 * 本模块支持两种检索架构：
 * 
 * ### 1. 图谱驱动PEDSA检索（默认，useGraphDrivenRetrieval=true）
 * 
 * 新架构流程：
 * ```
 * 用户输入 → 图谱前置分析 → 提取关键实体/关系/时间线索
 *                              ↓
 *                    构建增强查询（多个检索词）
 *                              ↓
 *                    PEDSA 精准检索世界书
 *                              ↓
 *                        返回相关片段
 * ```
 * 
 * 核心改进：
 * - 图谱分析从后置过滤提升为前置增强
 * - 支持多检索词能量累加
 * - 维度权重影响检索结果排序
 * 
 * ### 2. 并行独立架构（旧架构，useGraphDrivenRetrieval=false）
 * 
 * 图谱和PEDSA独立执行，结果后置合并。
 * 
 * ## 主要组件
 * 
 * - **QueryBuilder**: 从图谱洞察构建增强查询
 * - **SuperMemory**: 主模块，协调图谱和PEDSA检索
 * - **PedsaEngine**: PEDSA检索引擎（外部模块）
 * - **MultiDimGraph**: 多维知识图谱引擎（外部模块）
 * 
 * ## 配置项
 * 
 * | 配置项 | 默认值 | 说明 |
 * |--------|--------|------|
 * | useGraphDrivenRetrieval | true | 是否启用图谱驱动检索 |
 * | maxEnhancedTerms | 15 | 最大扩展检索词数量 |
 * | dimensionBoostThreshold | 0.5 | 维度增强阈值 |
 * | seedEnergyThreshold | 0.3 | 种子节点能量阈值 |
 * | pathStrengthThreshold | 0.4 | 路径强度阈值 |
 * | graphMinNodes | 3 | 图谱最小节点数阈值 |
 * 
 * @module SuperMemory
 * @requires MultiDimGraph
 * @requires PedsaEngine
 */

// ============================================================================
// 图谱驱动PEDSA检索 - 类型定义
// ============================================================================

/**
 * 种子节点 - 图谱中与查询高度相关的节点
 * @typedef {Object} SeedNode
 * @property {string} id - 节点ID
 * @property {string} label - 节点标签
 * @property {number} energy - 能量值 (0-1)
 * @property {Array<string>} keys - 关键词列表
 * @property {string} type - 节点类型
 */

/**
 * 关联路径 - 图谱中节点之间的关联关系
 * @typedef {Object} RelationPath
 * @property {string} source - 源节点标签
 * @property {string} target - 目标节点标签
 * @property {string} dimension - 维度类型
 * @property {number} strength - 关联强度 (0-1)
 */

/**
 * 图谱洞察对象 - 从图谱分析中提取的实体、关系和维度信息
 * @typedef {Object} GraphInsight
 * @property {Array<SeedNode>} nodes - 种子节点列表
 * @property {Object<string, number>} dimensionWeights - 维度权重映射
 * @property {Array<RelationPath>} paths - 关联路径列表
 * @property {number} seedCount - 种子节点数量
 */

/**
 * 检索词 - 用于PEDSA检索的扩展词项
 * @typedef {Object} QueryTerm
 * @property {string} term - 检索词文本
 * @property {number} weight - 权重 (0-1)
 * @property {string} source - 来源 ('seed'|'path'|'dimension'|'original')
 */

/**
 * 增强查询对象 - 基于图谱洞察构建的扩展检索词集合
 * @typedef {Object} EnhancedQuery
 * @property {string} originalQuery - 原始查询
 * @property {Array<QueryTerm>} terms - 扩展检索词列表
 * @property {Object<string, number>} dimensionWeights - 维度权重
 * @property {number} totalTerms - 检索词总数
 */

// ============================================================================

(function () {
    'use strict';

    window.WBAP = window.WBAP || {};
    const Logger = WBAP.Logger;

    // PEDSA-JS 引擎实例（一阶段）
    let pedsaJsEngine = null;
    let pedsaJsCacheKey = null;

    function clampNumber(value, min, max, fallback) {
        const num = Number(value);
        if (!Number.isFinite(num)) return fallback;
        return Math.min(max, Math.max(min, num));
    }
    // ============================================================================
    // QueryBuilder 模块 - 从图谱洞察构建增强查询
    // ============================================================================

    /**
     * 查询构建器
     * 
     * 负责从 GraphInsight 构建 EnhancedQuery，是图谱驱动PEDSA检索的核心组件。
     * 
     * ## 功能概述
     * 
     * QueryBuilder 从三个来源提取检索词：
     * 1. **种子节点 (seed)**: 从图谱中高能量节点提取标签和关键词
     * 2. **关联路径 (path)**: 从节点间的关联路径提取源/目标节点名称
     * 3. **维度特征 (dimension)**: 从高权重维度提取特征词
     * 
     * ## 处理流程
     * 
     * ```
     * GraphInsight → extractFromSeeds() → 种子检索词
     *             → extractFromPaths() → 路径检索词
     *             → extractFromDimensions() → 维度检索词
     *                        ↓
     *             deduplicateSortAndTruncate()
     *                        ↓
     *                  EnhancedQuery
     * ```
     * 
     * ## 正确性保证
     * 
     * - **Property 8**: 检索词列表无重复、按权重降序、数量不超过 maxEnhancedTerms
     * 
     * @namespace QueryBuilder
     * @see Requirements 2.1, 2.2, 2.3, 2.4, 2.5
     */
    const QueryBuilder = {
        /**
         * 构建增强查询
         * @param {string} originalQuery - 原始查询
         * @param {GraphInsight} graphInsight - 图谱洞察
         * @param {Object} config - 配置选项
         * @param {number} [config.maxEnhancedTerms=15] - 最大扩展检索词数量
         * @param {number} [config.seedEnergyThreshold=0.3] - 种子节点能量阈值
         * @param {number} [config.pathStrengthThreshold=0.4] - 路径强度阈值
         * @param {number} [config.dimensionBoostThreshold=0.5] - 维度增强阈值
         * @returns {EnhancedQuery}
         */
        buildEnhancedQuery(originalQuery, graphInsight, config = {}) {
            const maxTerms = config.maxEnhancedTerms ?? 15;
            const seedThreshold = config.seedEnergyThreshold ?? 0.3;
            const pathThreshold = config.pathStrengthThreshold ?? 0.4;
            const dimThreshold = config.dimensionBoostThreshold ?? 0.5;

            // 收集所有检索词
            let allTerms = [];

            // 1. 添加原始查询作为检索词
            if (originalQuery && originalQuery.trim()) {
                allTerms.push({
                    term: originalQuery.trim(),
                    weight: 1.0,
                    source: 'original'
                });
            }

            // 2. 从种子节点提取检索词
            if (graphInsight?.nodes?.length > 0) {
                const seedTerms = this.extractFromSeeds(graphInsight.nodes, seedThreshold);
                allTerms.push(...seedTerms);
            }

            // 3. 从关联路径提取检索词
            if (graphInsight?.paths?.length > 0) {
                const pathTerms = this.extractFromPaths(graphInsight.paths, pathThreshold);
                allTerms.push(...pathTerms);
            }

            // 4. 从维度权重提取特征词
            if (graphInsight?.dimensionWeights) {
                const dimTerms = this.extractFromDimensions(graphInsight.dimensionWeights, dimThreshold);
                allTerms.push(...dimTerms);
            }

            // 5. 去重、排序、截断
            const finalTerms = this.deduplicateSortAndTruncate(allTerms, maxTerms);

            return {
                originalQuery: originalQuery || '',
                terms: finalTerms,
                dimensionWeights: graphInsight?.dimensionWeights || {},
                totalTerms: finalTerms.length
            };
        },

        /**
         * 从种子节点提取检索词
         * @param {Array<SeedNode>} nodes - 种子节点列表
         * @param {number} energyThreshold - 能量阈值
         * @returns {Array<QueryTerm>}
         */
        extractFromSeeds(nodes, energyThreshold = 0.3) {
            const terms = [];

            for (const node of nodes) {
                // 跳过能量低于阈值的节点
                if ((node.energy ?? 0) < energyThreshold) continue;

                // 提取节点标签作为检索词
                if (node.label && node.label.trim()) {
                    terms.push({
                        term: node.label.trim(),
                        weight: node.energy ?? 0.5,
                        source: 'seed'
                    });
                }

                // 提取节点关键词作为检索词
                if (Array.isArray(node.keys)) {
                    for (const key of node.keys) {
                        if (key && key.trim()) {
                            terms.push({
                                term: key.trim(),
                                weight: (node.energy ?? 0.5) * 0.8, // 关键词权重略低于标签
                                source: 'seed'
                            });
                        }
                    }
                }
            }

            return terms;
        },

        /**
         * 从关联路径提取检索词
         * @param {Array<RelationPath>} paths - 关联路径列表
         * @param {number} strengthThreshold - 强度阈值
         * @returns {Array<QueryTerm>}
         */
        extractFromPaths(paths, strengthThreshold = 0.4) {
            const terms = [];

            for (const path of paths) {
                // 跳过强度低于阈值的路径
                if ((path.strength ?? 0) < strengthThreshold) continue;

                // 提取源节点名称
                if (path.source && path.source.trim()) {
                    terms.push({
                        term: path.source.trim(),
                        weight: path.strength ?? 0.5,
                        source: 'path'
                    });
                }

                // 提取目标节点名称
                if (path.target && path.target.trim()) {
                    terms.push({
                        term: path.target.trim(),
                        weight: path.strength ?? 0.5,
                        source: 'path'
                    });
                }
            }

            return terms;
        },

        /**
         * 从维度权重提取特征词
         * @param {Object<string, number>} dimensionWeights - 维度权重映射
         * @param {number} threshold - 阈值
         * @returns {Array<QueryTerm>}
         */
        extractFromDimensions(dimensionWeights, threshold = 0.5) {
            const terms = [];

            // 维度到特征词的映射
            const dimensionFeatures = {
                temporal: ['时间', '日期', '年份', '月份', '过去', '未来', '历史'],
                spatial: ['地点', '位置', '场所', '地方', '空间'],
                emotional: ['情感', '心情', '感受', '情绪', '心理'],
                causal: ['原因', '结果', '因果', '导致', '影响'],
                character: ['角色', '人物', '关系', '身份'],
                thematic: ['主题', '话题', '内容', '概念']
            };

            for (const [dimension, weight] of Object.entries(dimensionWeights)) {
                // 跳过权重低于阈值的维度
                if (weight < threshold) continue;

                // 获取该维度的特征词
                const features = dimensionFeatures[dimension];
                if (!features) continue;

                // 添加特征词（只取前2个最相关的）
                for (let i = 0; i < Math.min(2, features.length); i++) {
                    terms.push({
                        term: features[i],
                        weight: weight * 0.6, // 维度特征词权重较低
                        source: 'dimension'
                    });
                }
            }

            return terms;
        },

        /**
         * 去重、排序和截断检索词列表
         * @param {Array<QueryTerm>} terms - 检索词列表
         * @param {number} maxTerms - 最大数量
         * @returns {Array<QueryTerm>}
         */
        deduplicateSortAndTruncate(terms, maxTerms) {
            // 1. 按 term 字段去重（保留权重最高的）
            const termMap = new Map();
            for (const t of terms) {
                const key = t.term.toLowerCase();
                if (!termMap.has(key) || termMap.get(key).weight < t.weight) {
                    termMap.set(key, t);
                }
            }

            // 2. 转为数组并按权重降序排序
            const uniqueTerms = Array.from(termMap.values());
            uniqueTerms.sort((a, b) => b.weight - a.weight);

            // 3. 截断到 maxTerms
            return uniqueTerms.slice(0, maxTerms);
        }
    };



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

    /**
     * 获取函数调用配置
     * 从角色配置中读取 superMemory.functionCalling 设置，缺失时使用默认值
     * @param {Object} [charConfig] - 角色配置对象（可选，默认从 CharacterManager 获取）
     * @returns {Object} - 函数调用配置 { enabled, maxRounds, maxResultLength, agents }
     */
    function getFunctionCallingConfig(charConfig) {
        const config = charConfig || WBAP.CharacterManager?.getCurrentCharacterConfig?.() || WBAP.config || {};
        const fc = config.superMemory?.functionCalling || {};

        return {
            enabled: fc.enabled === true,  // 默认 false
            maxRounds: (Number.isFinite(fc.maxRounds) && fc.maxRounds >= 1) ? fc.maxRounds : 3,
            maxResultLength: (Number.isFinite(fc.maxResultLength) && fc.maxResultLength >= 1) ? fc.maxResultLength : 4000,
            agents: fc.agents || {}
        };
    }

    const SuperMemory = {
        /** 图谱是否已从 IndexedDB 加载 */
        _graphLoaded: false,

        /**
         * 获取当前角色标识符
         * @returns {string|null}
         */
        getCurrentCharacterId() {
            try {
                // 直接使用 CharacterManager 的角色ID（与配置存储key一致）
                // 避免从配置对象内部取字段导致不同角色共享同一图谱
                const cmId = WBAP.CharacterManager?.currentCharacterId;
                if (cmId) return String(cmId);
                // 降级：从 ST context 提取
                const ctx = SillyTavern.getContext();
                return WBAP.CharacterManager?.extractCharacterIdFromContext?.(ctx) || null;
            } catch (e) {
                return null;
            }
        },

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

            // 1.1 首次调用时从 IndexedDB 加载图谱
            if (!this._graphLoaded && WBAP.MultiDimGraph) {
                const charId = this.getCurrentCharacterId();
                if (charId) {
                    try {
                        await WBAP.MultiDimGraph.loadFromIndexedDB(charId);
                        Logger.log(`[SuperMemory] 从 IndexedDB 加载图谱完成，节点数: ${WBAP.MultiDimGraph.nodes.size}`);
                    } catch (e) {
                        Logger.warn('[SuperMemory] 从 IndexedDB 加载图谱失败:', e.message);
                    }
                }
                this._graphLoaded = true;
            }

            // 1.2 图谱驱动检索路由 (Requirement 6.2)
            // 当 useGraphDrivenRetrieval 启用时，使用新的图谱驱动PEDSA检索流程
            if (config.useGraphDrivenRetrieval !== false && WBAP.PedsaEngine) {
                Logger.log('[SuperMemory] 使用图谱驱动PEDSA检索流程');
                try {
                    const gdResult = await this.graphDrivenRetrieve(userInput, context, worldbookContent, config);

                    // 使用图谱驱动检索的结果替换 worldbookContent
                    if (gdResult.success && gdResult.entries.length > 0) {
                        worldbookContent = gdResult.entries;
                        Logger.log(`[SuperMemory] 图谱驱动检索完成: ${gdResult.stats.finalEntries} 条目, 耗时 ${gdResult.stats.totalTimeMs.toFixed(2)}ms`);
                    }

                    // 2.5 对话后触发图谱增量更新
                    if (WBAP.MultiDimGraph && config.useLLMGraphUpdate !== false && context && context.length > 50) {
                        this.scheduleIncrementalUpdate(context + '\n' + userInput);
                    }

                    // 调用 Agent 并整合结果（使用图谱驱动检索的结果）
                    const agentConfig = config.agents || {};
                    const results = await Promise.allSettled([
                        this.callAgent('archivist', agentConfig.archivist, userInput, context, worldbookContent, gdResult.graphInsight),
                        this.callAgent('historian', agentConfig.historian, userInput, context, worldbookContent, gdResult.graphInsight),
                        this.callAgent('status_reader', agentConfig.status_reader, userInput, context, worldbookContent, gdResult.graphInsight)
                    ]);

                    const memoryBlock = this.assembleResults(results, gdResult.graphInsight);
                    if (memoryBlock) {
                        Logger.log('[SuperMemory] 图谱驱动检索完成，生成记忆块');
                    }
                    return memoryBlock;
                } catch (e) {
                    Logger.warn('[SuperMemory] 图谱驱动检索失败，回退到原有流程:', e.message);
                    // 回退到下面的原有并行架构
                }
            }

            // ===== 原有并行架构（useGraphDrivenRetrieval=false 或回退时使用） =====

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

            // 二阶段：PEDSA WASM 引擎（如果JS引擎未筛选且WASM可用）
            // 注意：二阶段为显式开关（与 UI 保持一致）：仅当 usePedsaRetrieval === true 才启用
            if (!pedsaFiltered && WBAP.PedsaWasmAdapter?.isAvailable && config.usePedsaRetrieval === true) {
                try {
                    // 首次同步数据到 PEDSA WASM
                    if (!WBAP.PedsaWasmAdapter._synced) {
                        Logger.log('[SuperMemory] 首次同步世界书数据到 PEDSA WASM...');
                        await this.syncToPedsa(selectedBooks, worldbookContent);
                    }

                    // 执行 PEDSA 检索
                    const pedsaStart = performance.now();
                    const pedsaResults = await WBAP.PedsaWasmAdapter.retrieve(userInput, {
                        top_k: 20,
                        enable_temporal: true,
                        enable_affective: true,
                        enable_spatial: true
                    });
                    const pedsaTime = performance.now() - pedsaStart;

                    if (pedsaResults.success && pedsaResults.results.length > 0) {
                        const originalCount = worldbookContent.length;
                        worldbookContent = WBAP.PedsaWasmAdapter.filterEntriesByPedsaResults(
                            worldbookContent,
                            pedsaResults.results
                        );
                        pedsaFiltered = true;
                        pedsaSource = 'PEDSA-WASM';
                        Logger.log(`[SuperMemory] PEDSA-WASM 预检索: ${originalCount} → ${worldbookContent.length} 条目, 耗时 ${pedsaTime.toFixed(2)}ms`);
                    }
                } catch (e) {
                    Logger.warn('[SuperMemory] PEDSA WASM 检索失败，使用全量数据:', e.message);
                }
            }

            // 2. 图谱智能检索（仅当图谱节点数达到阈值时）
            let graphRetrievalResult = null;
            if (WBAP.MultiDimGraph && config.useGraphRetrieval !== false) {
                const nodeCount = WBAP.MultiDimGraph.nodes.size;
                const minNodes = config.graphMinNodes || 3;
                if (nodeCount >= minNodes) {
                    graphRetrievalResult = await this.graphBasedRetrieval(userInput, context);
                } else {
                    Logger.log(`[SuperMemory] 图谱节点不足 (${nodeCount}/${minNodes})，跳过图谱检索`);
                }
            }

            // 2.5 对话后触发图谱增量更新
            if (WBAP.MultiDimGraph && config.useLLMGraphUpdate !== false && context && context.length > 50) {
                this.scheduleIncrementalUpdate(context + '\n' + userInput);
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
         * 不再接受 entries/bookNames 参数，不再调用 build()，直接检索
         */
        async graphBasedRetrieval(userInput, context) {
            try {
                if (!WBAP.MultiDimGraph || WBAP.MultiDimGraph.nodes.size === 0) {
                    Logger.log('[SuperMemory] 图谱为空，跳过图谱检索');
                    return null;
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

            // ===== Function Calling 模式路由 =====
            const fcConfig = getFunctionCallingConfig();
            if (fcConfig.enabled && WBAP.FunctionCalling?.callAgentWithTools) {
                // 检查该 agent 类型是否单独禁用了 FC
                const agentFcOverride = fcConfig.agents?.[agentType];
                const agentFcEnabled = agentFcOverride?.enabled !== false; // 默认跟随全局

                if (agentFcEnabled) {
                    Logger.log(`[SuperMemory] Agent ${agentType} 使用 Function Calling 模式`);
                    try {
                        return await WBAP.FunctionCalling.callAgentWithTools(
                            agentType,
                            agentConfig,
                            userInput,
                            context,
                            worldbookContent,
                            fcConfig
                        );
                    } catch (e) {
                        Logger.warn(`[SuperMemory] Agent ${agentType} FC 模式失败，回退到传统模式:`, e.message);
                        // 回退到传统模式
                    }
                }
            }

            // ===== 传统模式（无 Function Calling） =====

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
你有两个工具可用：
- pedsa_retrieve：搜索世界书知识库中的条目
- graph_retrieve：搜索从对话中积累的知识图谱，获取实体关系和状态信息
建议先用 graph_retrieve 查找对话中积累的实体和关系，再用 pedsa_retrieve 补充世界书中的详细知识。
输出格式：直接列出相关的知识点，每条用 - 开头。`,

                historian: `你是一名历史学家。你的任务是：
1. 分析对话上下文和用户输入中涉及的时间线索
2. 从世界书中找出相关的历史事件
3. 梳理事件的发展脉络和因果关系
你有两个工具可用：
- pedsa_retrieve：搜索世界书知识库中的条目
- graph_retrieve：搜索从对话中积累的知识图谱，获取实体关系和状态变更历史
建议先用 graph_retrieve 查找对话中出现的事件和时间线索，再用 pedsa_retrieve 补充世界书中的背景知识。
输出格式：按时间顺序列出关键事件，注明事件之间的关联。`,

                status_reader: `你是一名状态监测员。你的任务是：
1. 从对话上下文中提取角色的当前状态（物理状态、心理状态、装备、位置等）
2. 识别环境的变化
3. 标记任何需要注意的状态变化
你有两个工具可用：
- pedsa_retrieve：搜索世界书知识库中的条目
- graph_retrieve：搜索从对话中积累的知识图谱，获取角色状态、位置和情感变化
建议优先使用 graph_retrieve 查找角色的最新状态和变化历史，再用 pedsa_retrieve 补充世界书中的基础设定。
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
                        // 持久化到 IndexedDB
                        const charId = this.getCurrentCharacterId();
                        if (charId) {
                            try {
                                await WBAP.MultiDimGraph.saveToIndexedDB(charId);
                                Logger.log('[SuperMemory] 图谱已持久化到 IndexedDB');
                            } catch (e) {
                                Logger.warn('[SuperMemory] 图谱持久化失败:', e.message);
                            }
                        }
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

        // ==================== PEDSA-WASM 二阶段（浏览器内WASM） ====================

        /**
         * 同步世界书数据到 PEDSA WASM 引擎（二阶段）
         */
        async syncToPedsa(selectedBooks, entries) {
            if (!WBAP.PedsaWasmAdapter) return;

            const worldbooks = [];

            for (const bookName of selectedBooks) {
                const bookEntries = entries.filter(e => e.book === bookName);
                if (bookEntries.length > 0) {
                    const convertedEntries = WBAP.PedsaWasmAdapter.convertEntriesToPedsaFormat(bookEntries, bookName);
                    worldbooks.push({
                        name: bookName,
                        entries: convertedEntries
                    });
                }
            }

            // 构建本体边（可从配置加载）
            const ontology = this.buildOntologyEdges();

            const result = await WBAP.PedsaWasmAdapter.sync(worldbooks, ontology);
            if (result.success) {
                WBAP.PedsaWasmAdapter._synced = true;
                Logger.log('[SuperMemory] PEDSA WASM 同步完成');
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
         * 标记 PEDSA WASM 需要重新同步
         */
        invalidatePedsaSync() {
            if (WBAP.PedsaWasmAdapter) {
                WBAP.PedsaWasmAdapter._synced = false;
            }
        },

        // ==================== 图谱驱动PEDSA检索 ====================

        /**
         * 图谱驱动检索 - 新主流程
         * 
         * 实现图谱前置分析，构建增强查询，调用PEDSA增强检索。
         * 这是图谱驱动PEDSA检索架构的核心入口方法。
         * 
         * ## 执行流程
         * 
         * 1. **图谱前置分析** (Requirement 1.1)
         *    - 检查图谱节点数量是否达到阈值 (Requirement 1.3)
         *    - 调用 MultiDimGraph.smartRetrieve 获取 GraphInsight
         *    - 失败时回退到原始查询 (Requirement 1.4)
         * 
         * 2. **构建增强查询** (Requirements 2.1-2.5)
         *    - 调用 QueryBuilder.buildEnhancedQuery
         *    - 从种子节点、关联路径、维度权重提取检索词
         * 
         * 3. **PEDSA增强检索** (Requirement 3.1)
         *    - 调用 PedsaEngine.retrieveEnhanced
         *    - 多检索词能量累加
         * 
         * 4. **结果合并** (Requirements 5.1-5.4)
         *    - 合并图谱洞察和PEDSA结果
         *    - 按综合相关度排序并截断
         * 
         * ## 错误处理
         * 
         * - 图谱分析失败：回退到原始查询，继续PEDSA检索
         * - 增强查询构建失败：使用空检索词列表
         * - PEDSA检索失败：返回空结果
         * 
         * @param {string} userInput - 用户输入
         * @param {string} context - 对话上下文
         * @param {Array<Object>} worldbookContent - 世界书条目数组
         * @param {Object} config - 配置选项
         * @param {number} [config.graphMinNodes=3] - 图谱最小节点数阈值
         * @param {number} [config.maxEnhancedTerms=15] - 最大扩展检索词数量
         * @param {number} [config.seedEnergyThreshold=0.3] - 种子节点能量阈值
         * @param {number} [config.pathStrengthThreshold=0.4] - 路径强度阈值
         * @param {number} [config.dimensionBoostThreshold=0.5] - 维度增强阈值
         * @param {number} [config.maxResults=20] - 最大返回结果数
         * @returns {Promise<Object>} 增强检索结果
         * @returns {boolean} returns.success - 是否成功
         * @returns {Array<Object>} returns.entries - 检索到的条目（含 relevanceScore 和 relationPaths）
         * @returns {Object|null} returns.graphInsight - 图谱洞察
         * @returns {EnhancedQuery} returns.enhancedQuery - 使用的增强查询
         * @returns {Object} returns.stats - 统计信息
         * 
         * @see Requirements 1.1, 1.3, 1.4, 3.1, 5.1, 5.2, 5.3, 5.4
         */
        async graphDrivenRetrieve(userInput, context, worldbookContent, config = {}) {
            const startTime = performance.now();
            let graphInsight = null;
            let enhancedQuery = null;
            let pedsaResults = null;

            // 获取配置
            const graphMinNodes = config.graphMinNodes || 3;
            const maxEnhancedTerms = config.maxEnhancedTerms ?? 15;
            const seedEnergyThreshold = config.seedEnergyThreshold ?? 0.3;
            const pathStrengthThreshold = config.pathStrengthThreshold ?? 0.4;
            const dimensionBoostThreshold = config.dimensionBoostThreshold ?? 0.5;

            // 1. 图谱前置分析 (Requirement 1.1)
            // 检查图谱节点阈值 (Requirement 1.3)
            const nodeCount = WBAP.MultiDimGraph?.nodes?.size || 0;
            if (nodeCount >= graphMinNodes && WBAP.MultiDimGraph) {
                try {
                    // 执行图谱分析
                    graphInsight = await WBAP.MultiDimGraph.smartRetrieve(userInput, context, { topK: 15 });
                    Logger.log(`[SuperMemory] 图谱前置分析完成: ${graphInsight?.nodes?.length || 0} 个种子节点`);
                } catch (error) {
                    // 图谱分析失败时回退 (Requirement 1.4)
                    Logger.warn('[SuperMemory] 图谱分析失败，回退到原始查询:', error.message);
                    graphInsight = null;
                }
            } else {
                Logger.log(`[SuperMemory] 图谱节点不足 (${nodeCount}/${graphMinNodes})，跳过图谱分析`);
            }

            // 2. 构建增强查询 (Requirement 2.1-2.5)
            try {
                // 将图谱结果转换为 GraphInsight 格式
                const formattedInsight = graphInsight ? {
                    nodes: (graphInsight.nodes || []).map(n => ({
                        id: n.id,
                        label: n.label,
                        energy: n.energy || 0,
                        keys: n.keys || [],
                        type: n.type || 'entity'
                    })),
                    dimensionWeights: graphInsight.dimensionWeights || {},
                    paths: this.extractPathsFromGraphResult(graphInsight),
                    seedCount: graphInsight.nodes?.length || 0
                } : null;

                enhancedQuery = QueryBuilder.buildEnhancedQuery(userInput, formattedInsight, {
                    maxEnhancedTerms,
                    seedEnergyThreshold,
                    pathStrengthThreshold,
                    dimensionBoostThreshold
                });
                Logger.log(`[SuperMemory] 增强查询构建完成: ${enhancedQuery.totalTerms} 个检索词`);
            } catch (error) {
                // 增强查询构建失败时回退 (Requirement 1.4)
                Logger.warn('[SuperMemory] 增强查询构建失败，使用原始查询:', error.message);
                enhancedQuery = {
                    originalQuery: userInput,
                    terms: [],
                    dimensionWeights: {},
                    totalTerms: 0
                };
            }

            // 3. PEDSA增强检索 (Requirement 3.1)
            try {
                // 确保 PEDSA-JS 引擎已构建
                if (!pedsaJsEngine) {
                    await this.pedsaJsRetrieval(userInput, worldbookContent, []);
                }

                if (pedsaJsEngine) {
                    pedsaResults = pedsaJsEngine.retrieveEnhanced(enhancedQuery, { topK: 20 });
                    Logger.log(`[SuperMemory] PEDSA增强检索完成: ${pedsaResults?.results?.length || 0} 条结果`);
                } else {
                    // 回退到普通检索
                    pedsaResults = await this.pedsaJsRetrieval(userInput, worldbookContent, []);
                }
            } catch (error) {
                Logger.error('[SuperMemory] PEDSA检索失败:', error.message);
                pedsaResults = { success: false, results: [] };
            }

            // 4. 结果合并 (Requirement 5.1, 5.2)
            const mergedResults = this.mergeGraphAndPedsaResults(
                graphInsight,
                pedsaResults,
                worldbookContent,
                config
            );

            const elapsed = performance.now() - startTime;

            return {
                success: true,
                entries: mergedResults.entries,
                graphInsight: graphInsight,
                enhancedQuery: enhancedQuery,
                stats: {
                    totalTimeMs: elapsed,
                    graphNodes: graphInsight?.nodes?.length || 0,
                    enhancedTerms: enhancedQuery?.totalTerms || 0,
                    pedsaResults: pedsaResults?.results?.length || 0,
                    finalEntries: mergedResults.entries.length
                }
            };
        },

        /**
         * 从图谱结果中提取关联路径
         * 
         * 遍历图谱中种子节点之间的边，提取关联路径信息。
         * 
         * @param {Object} graphResult - 图谱检索结果
         * @param {Array<Object>} graphResult.nodes - 种子节点列表
         * @returns {Array<RelationPath>} 关联路径数组（最多10条）
         */
        extractPathsFromGraphResult(graphResult) {
            if (!graphResult?.nodes || !WBAP.MultiDimGraph) return [];

            const paths = [];
            const nodeIds = new Set(graphResult.nodes.map(n => n.id));
            const graph = WBAP.MultiDimGraph;

            // 查找节点之间的直接关联
            graph.edges.forEach(edge => {
                if (nodeIds.has(edge.source) && nodeIds.has(edge.target)) {
                    const sourceNode = graph.nodes.get(edge.source);
                    const targetNode = graph.nodes.get(edge.target);
                    if (!sourceNode || !targetNode) return;

                    // 提取边的维度信息
                    const dimensions = edge.dimensions || [];
                    for (const dim of dimensions) {
                        paths.push({
                            source: sourceNode.label || sourceNode.id,
                            target: targetNode.label || targetNode.id,
                            dimension: dim.dimension?.id || 'unknown',
                            strength: dim.strength || 0.5
                        });
                    }
                }
            });

            return paths.slice(0, 10); // 最多10条路径
        },

        /**
         * 合并图谱洞察和PEDSA检索结果
         * 
         * 将图谱分析结果和PEDSA检索结果整合为统一的输出。
         * 
         * ## 合并策略
         * 
         * 1. **收集PEDSA结果**: 从 pedsaResults 中提取条目和分数
         * 2. **补充图谱洞察**: 从 graphInsight 中补充条目，增加能量加成
         * 3. **添加关联路径**: 为相关条目附加关联路径信息 (Requirement 5.2)
         * 4. **排序**: 按综合相关度降序排列 (Requirement 5.3)
         * 5. **截断**: 保留最相关的 maxResults 条 (Requirement 5.4)
         * 
         * @param {Object|null} graphInsight - 图谱洞察
         * @param {Object} pedsaResults - PEDSA检索结果
         * @param {Array<Object>} worldbookContent - 世界书条目
         * @param {Object} config - 配置选项
         * @param {number} [config.maxResults=20] - 最大返回结果数
         * @returns {Object} 合并后的结果
         * @returns {Array<Object>} returns.entries - 合并后的条目（含 relevanceScore 和 relationPaths）
         * @returns {number} returns.totalBeforeTruncation - 截断前的总数
         * 
         * @see Requirements 5.1, 5.2, 5.3, 5.4
         */
        mergeGraphAndPedsaResults(graphInsight, pedsaResults, worldbookContent, config = {}) {
            const maxResults = config.maxResults || 20;
            const entryScoreMap = new Map(); // uid -> { entry, score, paths }

            // 1. 从PEDSA结果中收集条目和分数
            if (pedsaResults?.results?.length > 0) {
                for (const result of pedsaResults.results) {
                    const entry = result.originalEntry;
                    if (entry?.uid) {
                        entryScoreMap.set(entry.uid, {
                            entry,
                            score: result.score || 0,
                            paths: []
                        });
                    }
                }
            }

            // 2. 从图谱洞察中补充条目和关联路径 (Requirement 5.2)
            if (graphInsight?.nodes?.length > 0) {
                for (const node of graphInsight.nodes) {
                    const uid = node.entry?.uid || node.id;
                    if (entryScoreMap.has(uid)) {
                        // 已存在，增加图谱能量加成
                        const existing = entryScoreMap.get(uid);
                        existing.score += (node.energy || 0) * 0.5;
                    } else {
                        // 新条目，从世界书中查找
                        const entry = worldbookContent.find(e => e.uid === uid || e.uid?.toString() === uid?.toString());
                        if (entry) {
                            entryScoreMap.set(uid, {
                                entry,
                                score: node.energy || 0.3,
                                paths: []
                            });
                        }
                    }
                }

                // 添加关联路径信息
                const paths = this.extractPathsFromGraphResult(graphInsight);
                for (const path of paths) {
                    // 为源节点和目标节点添加路径信息
                    for (const [uid, data] of entryScoreMap) {
                        const entry = data.entry;
                        const label = entry.comment || entry.key || '';
                        if (label.includes(path.source) || label.includes(path.target)) {
                            data.paths.push(path);
                        }
                    }
                }
            }

            // 3. 按综合相关度排序 (Requirement 5.3)
            const sortedEntries = Array.from(entryScoreMap.values())
                .sort((a, b) => b.score - a.score);

            // 4. 截断到配置限制 (Requirement 5.4)
            const truncatedEntries = sortedEntries.slice(0, maxResults);

            return {
                entries: truncatedEntries.map(item => ({
                    ...item.entry,
                    relevanceScore: item.score,
                    relationPaths: item.paths
                })),
                totalBeforeTruncation: sortedEntries.length
            };
        }
    };

    // 导出模块
    WBAP.SuperMemory = SuperMemory;
    WBAP.SuperMemory.getFunctionCallingConfig = getFunctionCallingConfig;
    WBAP.QueryBuilder = QueryBuilder;
    /** 暴露内部 PEDSA-JS 引擎实例（仅供 ping 延迟检测使用） */
    WBAP.SuperMemory._getPedsaJsEngine = () => pedsaJsEngine;
    Logger.log('[SuperMemory] 模块已加载');
})();
