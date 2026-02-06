/**
 * 多维知识图谱引擎 (Multi-Dimensional Knowledge Graph)
 * 支持：时间线、情感线、地点线、因果线、角色线、主题线
 * 实现：能量扩散算法、查询意图识别、多维检索
 */
(function () {
    'use strict';

    window.WBAP = window.WBAP || {};
    const Logger = WBAP.Logger || console;

    // ==================== 维度定义 ====================
    const EDGE_DIMENSIONS = {
        TEMPORAL: {
            id: 'temporal',
            label: '时间线',
            color: '#3498db',
            icon: '⏰',
            weight: 1.0,
            keywords: ['之前', '之后', '当时', '后来', '曾经', '现在', '过去', '未来', '年', '月', '日', '时间']
        },
        SPATIAL: {
            id: 'spatial',
            label: '地点线',
            color: '#2ecc71',
            icon: '📍',
            weight: 1.0,
            keywords: ['在', '位于', '前往', '离开', '到达', '地点', '位置', '这里', '那里', '房间', '城市']
        },
        EMOTIONAL: {
            id: 'emotional',
            label: '情感线',
            color: '#e74c3c',
            icon: '💗',
            weight: 1.0,
            keywords: ['喜欢', '讨厌', '爱', '恨', '开心', '难过', '愤怒', '恐惧', '信任', '好感', '厌恶', '感情']
        },
        CAUSAL: {
            id: 'causal',
            label: '因果线',
            color: '#9b59b6',
            icon: '🔗',
            weight: 1.0,
            keywords: ['因为', '所以', '导致', '引起', '结果', '原因', '由于', '因此', '造成', '影响']
        },
        CHARACTER: {
            id: 'character',
            label: '角色线',
            color: '#f39c12',
            icon: '👥',
            weight: 1.0,
            keywords: ['认识', '朋友', '敌人', '家人', '同伴', '关系', '相遇', '分离', '合作', '对抗']
        },
        THEMATIC: {
            id: 'thematic',
            label: '主题线',
            color: '#1abc9c',
            icon: '📚',
            weight: 1.0,
            keywords: ['关于', '主题', '类型', '属于', '类别', '相关', '涉及', '包含']
        }
    };

    // ==================== 多维图谱引擎 ====================
    const MultiDimGraph = {
        nodes: new Map(),
        edges: [],
        dimensionIndex: new Map(), // dimension -> edges[]
        nodeIndex: new Map(),      // nodeId -> {inEdges, outEdges}
        eventNodes: [],            // 事件节点列表

        /**
         * 从现有图谱数据构建多维图谱
         */
        async build(entries, existingGraph = null) {
            const startTime = performance.now();
            Logger.log?.('[MultiDimGraph] 开始构建多维图谱');

            this.clear();

            // 1. 创建节点（复用或新建）
            if (existingGraph?.nodes) {
                existingGraph.nodes.forEach(n => {
                    this.nodes.set(n.id, this.enhanceNode(n));
                });
            } else {
                entries.forEach(entry => {
                    const node = this.createNode(entry);
                    if (node) {
                        this.nodes.set(node.id, node);
                    }
                });
            }

            // 2. 构建多维边
            this.buildMultiDimensionalEdges(entries);

            // 3. 提取事件节点并生成摘要
            await this.extractEventNodes();

            // 4. 建立索引
            this.buildIndices();

            // 5. 计算节点多维重要度
            this.calculateMultiDimImportance();

            const elapsed = (performance.now() - startTime).toFixed(2);
            Logger.log?.(`[MultiDimGraph] 构建完成: ${this.nodes.size} 节点, ${this.edges.length} 边, ${this.eventNodes.length} 事件, 耗时 ${elapsed}ms`);

            return {
                nodes: Array.from(this.nodes.values()),
                edges: this.edges,
                eventNodes: this.eventNodes,
                stats: {
                    nodeCount: this.nodes.size,
                    edgeCount: this.edges.length,
                    eventCount: this.eventNodes.length,
                    dimensionStats: this.getDimensionStats()
                }
            };
        },

        /**
         * 清空图谱
         */
        clear() {
            this.nodes.clear();
            this.edges = [];
            this.dimensionIndex.clear();
            this.nodeIndex.clear();
            this.eventNodes = [];
        },

        /**
         * 增强节点属性
         */
        enhanceNode(node) {
            return {
                ...node,
                multiDimImportance: {},  // 各维度重要度
                eventSummary: null,      // 事件摘要
                temporalInfo: null,      // 时间信息
                spatialInfo: null,       // 空间信息
                emotionalState: null,    // 情感状态
                energy: 0                // 扩散能量
            };
        },

        /**
         * 创建节点
         */
        createNode(entry) {
            const keys = this.normalizeKeys(entry.key);
            if (keys.length === 0) return null;

            const content = entry.content || '';
            const comment = entry.comment || '';

            return {
                id: entry.uid?.toString() || `node-${Math.random().toString(36).substr(2, 9)}`,
                label: comment || keys[0] || 'Untitled',
                keys: keys,
                keysLower: keys.map(k => k.toLowerCase()),
                content: content,
                contentLower: content.toLowerCase(),
                comment: comment,
                type: this.detectNodeType(keys, comment, content),
                multiDimImportance: {},
                eventSummary: null,
                temporalInfo: this.extractTemporalInfo(content),
                spatialInfo: this.extractSpatialInfo(content),
                emotionalState: this.extractEmotionalState(content),
                energy: 0,
                entry: entry
            };
        },

        /**
         * 规范化关键词
         */
        normalizeKeys(key) {
            if (!key) return [];
            const keys = Array.isArray(key) ? key : [key];
            const result = [];

            keys.forEach(k => {
                if (typeof k === 'string') {
                    k.split(',').forEach(sub => {
                        const trimmed = sub.trim();
                        if (trimmed && trimmed.length >= 2 && !/^\d+$/.test(trimmed)) {
                            result.push(trimmed);
                        }
                    });
                }
            });

            return result;
        },

        /**
         * 检测节点类型
         */
        detectNodeType(keys, comment, content) {
            const combined = (keys.join(' ') + ' ' + comment + ' ' + content.substring(0, 300)).toLowerCase();
            const typeKeywords = {
                character: ['角色', '人物', 'character', '姓名', '性别', '年龄'],
                location: ['地点', '位置', 'location', '城市', '房间'],
                event: ['事件', '历史', 'event', '发生'],
                item: ['物品', '道具', 'item', '武器'],
                concept: ['概念', '规则', 'concept', '系统']
            };

            for (const [type, keywords] of Object.entries(typeKeywords)) {
                if (keywords.some(kw => combined.includes(kw))) {
                    return type;
                }
            }
            return 'lore';
        },

        /**
         * 提取时间信息
         */
        extractTemporalInfo(content) {
            const patterns = [
                /(\d{4})年/g,
                /(第[一二三四五六七八九十百千]+[天日周月年])/g,
                /(之前|之后|当时|后来|曾经|现在)/g
            ];

            const matches = [];
            patterns.forEach(pattern => {
                let match;
                while ((match = pattern.exec(content)) !== null) {
                    matches.push(match[1]);
                }
            });

            return matches.length > 0 ? matches : null;
        },

        /**
         * 提取空间信息
         */
        extractSpatialInfo(content) {
            const patterns = [
                /在(.{2,10})[里中内]/g,
                /位于(.{2,15})/g,
                /前往(.{2,10})/g
            ];

            const matches = [];
            patterns.forEach(pattern => {
                let match;
                while ((match = pattern.exec(content)) !== null) {
                    matches.push(match[1]);
                }
            });

            return matches.length > 0 ? matches : null;
        },

        /**
         * 提取情感状态
         */
        extractEmotionalState(content) {
            const emotions = {
                positive: ['喜欢', '爱', '开心', '高兴', '快乐', '信任', '感激'],
                negative: ['讨厌', '恨', '难过', '愤怒', '恐惧', '厌恶', '悲伤'],
                neutral: ['平静', '冷漠', '无感']
            };

            const detected = { positive: 0, negative: 0, neutral: 0 };
            const contentLower = content.toLowerCase();

            for (const [type, words] of Object.entries(emotions)) {
                words.forEach(word => {
                    if (contentLower.includes(word)) {
                        detected[type]++;
                    }
                });
            }

            if (detected.positive > detected.negative) return 'positive';
            if (detected.negative > detected.positive) return 'negative';
            return 'neutral';
        },

        /**
         * 构建多维边
         */
        buildMultiDimensionalEdges(entries) {
            const nodeArray = Array.from(this.nodes.values());
            const keywordToNodes = new Map();

            // 建立关键词索引
            nodeArray.forEach(node => {
                node.keysLower.forEach(key => {
                    if (key.length >= 2) {
                        if (!keywordToNodes.has(key)) {
                            keywordToNodes.set(key, []);
                        }
                        keywordToNodes.get(key).push(node.id);
                    }
                });
            });

            // 遍历节点对，检测多维关系
            nodeArray.forEach(sourceNode => {
                const content = sourceNode.contentLower;
                const sourceKeys = new Set(sourceNode.keysLower);

                keywordToNodes.forEach((targetNodeIds, keyword) => {
                    if (keyword.length < 2 || sourceKeys.has(keyword)) return;

                    if (content.includes(keyword)) {
                        targetNodeIds.forEach(targetId => {
                            if (targetId !== sourceNode.id) {
                                const targetNode = this.nodes.get(targetId);
                                if (targetNode) {
                                    // 检测各维度关系
                                    const dimensions = this.detectEdgeDimensions(sourceNode, targetNode, keyword);
                                    if (dimensions.length > 0) {
                                        this.addMultiDimEdge(sourceNode.id, targetId, dimensions, keyword);
                                    }
                                }
                            }
                        });
                    }
                });
            });
        },

        /**
         * 检测边的维度
         */
        detectEdgeDimensions(sourceNode, targetNode, matchedKeyword) {
            const dimensions = [];
            const sourceContent = sourceNode.contentLower;
            const targetContent = targetNode.contentLower;

            // 检测各维度
            for (const [dimKey, dim] of Object.entries(EDGE_DIMENSIONS)) {
                let score = 0;

                // 基于关键词检测
                dim.keywords.forEach(kw => {
                    if (sourceContent.includes(kw)) score += 0.5;
                    if (targetContent.includes(kw)) score += 0.5;
                });

                // 基于节点属性检测
                if (dimKey === 'TEMPORAL') {
                    if (sourceNode.temporalInfo || targetNode.temporalInfo) score += 1;
                }
                if (dimKey === 'SPATIAL') {
                    if (sourceNode.spatialInfo || targetNode.spatialInfo) score += 1;
                    if (sourceNode.type === 'location' || targetNode.type === 'location') score += 1;
                }
                if (dimKey === 'EMOTIONAL') {
                    if (sourceNode.emotionalState !== 'neutral' || targetNode.emotionalState !== 'neutral') score += 1;
                }
                if (dimKey === 'CHARACTER') {
                    if (sourceNode.type === 'character' || targetNode.type === 'character') score += 1;
                }
                if (dimKey === 'CAUSAL') {
                    if (sourceNode.type === 'event' || targetNode.type === 'event') score += 0.5;
                }

                if (score >= 1) {
                    dimensions.push({
                        dimension: dim,
                        strength: Math.min(score / 3, 1)
                    });
                }
            }

            // 如果没有检测到特定维度，添加主题维度
            if (dimensions.length === 0) {
                dimensions.push({
                    dimension: EDGE_DIMENSIONS.THEMATIC,
                    strength: 0.5
                });
            }

            return dimensions;
        },

        /**
         * 添加多维边
         */
        addMultiDimEdge(sourceId, targetId, dimensions, matchedKeyword) {
            const edgeId = `${sourceId}->${targetId}`;

            // 检查是否已存在
            const existing = this.edges.find(e => e.id === edgeId);
            if (existing) {
                // 合并维度
                dimensions.forEach(dim => {
                    const existingDim = existing.dimensions.find(d => d.dimension.id === dim.dimension.id);
                    if (existingDim) {
                        existingDim.strength = Math.max(existingDim.strength, dim.strength);
                    } else {
                        existing.dimensions.push(dim);
                    }
                });
                return;
            }

            this.edges.push({
                id: edgeId,
                source: sourceId,
                target: targetId,
                dimensions: dimensions,
                matchedKeyword: matchedKeyword,
                weight: dimensions.reduce((sum, d) => sum + d.strength, 0) / dimensions.length
            });
        },

        /**
         * 提取事件节点
         */
        async extractEventNodes() {
            this.nodes.forEach(node => {
                // 判断是否为事件节点
                const isEvent = node.type === 'event' ||
                    node.temporalInfo?.length > 0 ||
                    /发生|事件|历史/.test(node.content);

                if (isEvent) {
                    node.eventSummary = this.generateEventSummary(node);
                    this.eventNodes.push(node);
                }
            });
        },

        /**
         * 生成事件摘要
         */
        generateEventSummary(node) {
            const content = node.content;
            // 简单摘要：取前100字符
            let summary = content.substring(0, 100);
            if (content.length > 100) summary += '...';

            return {
                title: node.label,
                summary: summary,
                temporal: node.temporalInfo,
                spatial: node.spatialInfo,
                emotional: node.emotionalState
            };
        },

        /**
         * 建立索引
         */
        buildIndices() {
            // 维度索引
            Object.values(EDGE_DIMENSIONS).forEach(dim => {
                this.dimensionIndex.set(dim.id, []);
            });

            this.edges.forEach(edge => {
                edge.dimensions.forEach(d => {
                    const dimEdges = this.dimensionIndex.get(d.dimension.id);
                    if (dimEdges) {
                        dimEdges.push(edge);
                    }
                });
            });

            // 节点索引
            this.nodes.forEach((node, nodeId) => {
                this.nodeIndex.set(nodeId, { inEdges: [], outEdges: [] });
            });

            this.edges.forEach(edge => {
                const sourceIndex = this.nodeIndex.get(edge.source);
                const targetIndex = this.nodeIndex.get(edge.target);
                if (sourceIndex) sourceIndex.outEdges.push(edge);
                if (targetIndex) targetIndex.inEdges.push(edge);
            });
        },

        /**
         * 计算多维重要度
         */
        calculateMultiDimImportance() {
            this.nodes.forEach(node => {
                const nodeEdges = this.nodeIndex.get(node.id);
                if (!nodeEdges) return;

                const allEdges = [...nodeEdges.inEdges, ...nodeEdges.outEdges];

                Object.values(EDGE_DIMENSIONS).forEach(dim => {
                    const dimEdges = allEdges.filter(e =>
                        e.dimensions.some(d => d.dimension.id === dim.id)
                    );
                    node.multiDimImportance[dim.id] = dimEdges.length;
                });
            });

            // 归一化
            Object.values(EDGE_DIMENSIONS).forEach(dim => {
                let maxVal = 1;
                this.nodes.forEach(node => {
                    maxVal = Math.max(maxVal, node.multiDimImportance[dim.id] || 0);
                });
                this.nodes.forEach(node => {
                    node.multiDimImportance[dim.id] = (node.multiDimImportance[dim.id] || 0) / maxVal;
                });
            });
        },

        /**
         * 获取维度统计
         */
        getDimensionStats() {
            const stats = {};
            this.dimensionIndex.forEach((edges, dimId) => {
                stats[dimId] = edges.length;
            });
            return stats;
        },

        // ==================== 多维扩散算法 ====================

        /**
         * 多维能量扩散
         * @param {string[]} seedNodeIds - 种子节点ID
         * @param {Object} dimensionWeights - 维度权重 {temporal: 0.8, spatial: 0.5, ...}
         * @param {Object} options - 配置选项
         */
        multiDimensionalDiffuse(seedNodeIds, dimensionWeights, options = {}) {
            const {
                maxIterations = 5,
                decayFactor = 0.7,
                threshold = 0.01,
                topK = 20
            } = options;

            // 重置能量
            this.nodes.forEach(node => {
                node.energy = 0;
            });

            // 初始化种子节点能量
            seedNodeIds.forEach(id => {
                const node = this.nodes.get(id);
                if (node) {
                    node.energy = 1.0;
                }
            });

            // 迭代扩散
            for (let iter = 0; iter < maxIterations; iter++) {
                const energyUpdates = new Map();

                this.edges.forEach(edge => {
                    const sourceNode = this.nodes.get(edge.source);
                    const targetNode = this.nodes.get(edge.target);
                    if (!sourceNode || !targetNode) return;

                    // 计算加权边强度
                    let edgeStrength = 0;
                    edge.dimensions.forEach(d => {
                        const dimWeight = dimensionWeights[d.dimension.id] || 0.5;
                        edgeStrength += d.strength * dimWeight;
                    });
                    edgeStrength /= edge.dimensions.length;

                    // 双向扩散
                    if (sourceNode.energy > threshold) {
                        const transfer = sourceNode.energy * edgeStrength * decayFactor;
                        energyUpdates.set(edge.target, (energyUpdates.get(edge.target) || 0) + transfer);
                    }
                    if (targetNode.energy > threshold) {
                        const transfer = targetNode.energy * edgeStrength * decayFactor;
                        energyUpdates.set(edge.source, (energyUpdates.get(edge.source) || 0) + transfer);
                    }
                });

                // 应用更新
                energyUpdates.forEach((energy, nodeId) => {
                    const node = this.nodes.get(nodeId);
                    if (node) {
                        node.energy = Math.min(1.0, node.energy + energy);
                    }
                });
            }

            // 返回 Top-K 节点
            const sortedNodes = Array.from(this.nodes.values())
                .filter(n => n.energy > threshold)
                .sort((a, b) => b.energy - a.energy)
                .slice(0, topK);

            return sortedNodes;
        },

        // ==================== 查询意图识别 ====================

        /**
         * 推断查询的维度权重
         * @param {string} query - 用户查询
         * @param {string} context - 对话上下文
         */
        inferDimensionWeights(query, context = '') {
            const combined = (query + ' ' + context).toLowerCase();
            const weights = {};

            Object.entries(EDGE_DIMENSIONS).forEach(([key, dim]) => {
                let score = 0.3; // 基础权重

                dim.keywords.forEach(kw => {
                    if (combined.includes(kw)) {
                        score += 0.15;
                    }
                });

                // 特殊模式检测
                if (dim.id === 'temporal') {
                    if (/什么时候|何时|之前|之后|历史/.test(combined)) score += 0.3;
                }
                if (dim.id === 'spatial') {
                    if (/在哪|哪里|位置|地点/.test(combined)) score += 0.3;
                }
                if (dim.id === 'emotional') {
                    if (/感觉|心情|态度|喜欢|讨厌/.test(combined)) score += 0.3;
                }
                if (dim.id === 'causal') {
                    if (/为什么|原因|导致|结果/.test(combined)) score += 0.3;
                }
                if (dim.id === 'character') {
                    if (/谁|关系|认识|朋友/.test(combined)) score += 0.3;
                }

                weights[dim.id] = Math.min(score, 1.0);
            });

            return weights;
        },

        /**
         * 智能检索
         * @param {string} query - 用户查询
         * @param {string} context - 对话上下文
         * @param {Object} options - 配置选项
         */
        async smartRetrieve(query, context = '', options = {}) {
            const { topK = 15 } = options;

            // 1. 推断维度权重
            const dimensionWeights = this.inferDimensionWeights(query, context);
            Logger.log?.('[MultiDimGraph] 维度权重:', dimensionWeights);

            // 2. 找到种子节点（关键词匹配）
            const queryLower = query.toLowerCase();
            const seedNodes = [];

            this.nodes.forEach(node => {
                const matchScore = node.keysLower.reduce((score, key) => {
                    if (queryLower.includes(key) || key.includes(queryLower)) {
                        return score + 1;
                    }
                    return score;
                }, 0);

                if (matchScore > 0 || node.contentLower.includes(queryLower)) {
                    seedNodes.push(node.id);
                }
            });

            if (seedNodes.length === 0) {
                Logger.log?.('[MultiDimGraph] 未找到种子节点，返回高重要度节点');
                // 返回各维度重要度最高的节点
                return this.getTopImportantNodes(topK, dimensionWeights);
            }

            // 3. 执行多维扩散
            const results = this.multiDimensionalDiffuse(seedNodes, dimensionWeights, { topK });

            // 4. 按维度分组结果
            const groupedResults = this.groupByDimension(results, dimensionWeights);

            return {
                nodes: results,
                grouped: groupedResults,
                dimensionWeights: dimensionWeights,
                seedCount: seedNodes.length
            };
        },

        /**
         * 获取高重要度节点
         */
        getTopImportantNodes(topK, dimensionWeights) {
            const scored = Array.from(this.nodes.values()).map(node => {
                let score = 0;
                Object.entries(dimensionWeights).forEach(([dimId, weight]) => {
                    score += (node.multiDimImportance[dimId] || 0) * weight;
                });
                return { node, score };
            });

            return scored
                .sort((a, b) => b.score - a.score)
                .slice(0, topK)
                .map(s => s.node);
        },

        /**
         * 按维度分组结果
         */
        groupByDimension(nodes, dimensionWeights) {
            const groups = {};

            Object.entries(EDGE_DIMENSIONS).forEach(([key, dim]) => {
                if (dimensionWeights[dim.id] >= 0.5) {
                    groups[dim.id] = nodes.filter(n =>
                        (n.multiDimImportance[dim.id] || 0) > 0.3
                    ).slice(0, 5);
                }
            });

            return groups;
        },

        // ==================== LLM 增量维护 ====================

        /**
         * 动态关系缓存（对话中产生的临时关系）
         */
        dynamicEdges: [],
        dynamicNodes: new Map(),

        /**
         * LLM 增量更新图谱
         * @param {string} dialogue - 最新对话内容
         * @param {Object} options - 配置选项
         */
        async incrementalUpdate(dialogue, options = {}) {
            const {
                apiConfig = null,
                model = null,
                maxNewEdges = 10
            } = options;

            if (!dialogue || dialogue.trim().length < 20) {
                return { success: false, reason: 'dialogue too short' };
            }

            const activeConfig = WBAP.CharacterManager?.getCurrentCharacterConfig?.() || WBAP.config || {};
            const superMemoryConfig = activeConfig.superMemory || {};
            const writeCfg = superMemoryConfig.graphWriteToWorldbook || {};
            const writeEnabled = writeCfg.enabled === true;
            const writeTargetBook = (writeCfg.targetBook || '').trim();
            const writeMaxEntries = Number.isFinite(Number(writeCfg.maxEntries))
                ? Math.max(0, Math.min(10, Number(writeCfg.maxEntries)))
                : 3;

            // 获取 API 配置
            let config = apiConfig;
            if (!config) {
                const endpoints = WBAP.getGlobalPools?.()?.selectiveMode?.apiEndpoints || [];
                const preferredId = superMemoryConfig.graphUpdateEndpointId;
                config = preferredId
                    ? endpoints.find(ep => ep.id === preferredId && ep.enabled !== false)
                    : null;
                if (!config) config = endpoints.find(ep => ep.enabled !== false);
            }

            if (!config) {
                Logger.warn?.('[MultiDimGraph] 无可用 API，跳过增量更新');
                return { success: false, reason: 'no API' };
            }

            // 构建提示词
            const existingNodes = Array.from(this.nodes.values())
                .slice(0, 50)
                .map(n => n.label)
                .join(', ');

            const dimensionList = Object.values(EDGE_DIMENSIONS)
                .map(d => `${d.id}: ${d.label}`)
                .join(', ');

            const systemPrompt = `你是一个知识图谱分析专家。分析对话内容，提取实体关系。
输出严格的 JSON 格式，不要有其他内容。`;

            const userPrompt = `分析以下对话，提取新的实体关系：

## 对话内容
${dialogue}

## 已知实体（可引用）
${existingNodes || '(无)'}

## 可用的关系维度
${dimensionList}

## 输出格式（严格 JSON）
{
  "relations": [
    {
      "source": "实体A名称",
      "target": "实体B名称",
      "dimension": "维度ID",
      "strength": 0.8,
      "description": "关系描述"
    }
  ],
  "stateChanges": [
    {
      "entity": "实体名称",
      "attribute": "属性名",
      "oldValue": "旧值或null",
      "newValue": "新值"
    }
  ],
  "newEntities": [
    {
      "name": "新实体名称",
      "type": "character/location/event/item/concept",
      "description": "简短描述"
    }
   ]
 }

注意：
1. 只提取对话中明确提到的关系，不要推测
2. dimension 必须是: temporal, spatial, emotional, causal, character, thematic 之一
3. strength 范围 0.1-1.0
4. 如果没有发现新关系，返回空数组
${(writeEnabled && writeTargetBook && writeMaxEntries > 0) ? `

## 额外任务：将关键变化写入世界书（持久化）
请同时生成要写入世界书《${writeTargetBook}》的条目（最多 ${writeMaxEntries} 条），用于长期记忆。
你必须只写入对话中明确出现的信息，不要推测或编造。

输出 JSON 额外增加字段：
"worldbookEntries": [
  {
    "comment": "一句话标题（建议以 YYYY-MM-DD 开头）",
    "key": ["关键词1","关键词2"],
    "content": "条目正文（可包含日期、地点、情绪、事件摘要）"
  }
]

如果不需要写入，返回空数组 worldbookEntries: []` : ''}`;

            try {
                const response = await WBAP.callAI(
                    model || superMemoryConfig.graphUpdateModel || config.model,
                    userPrompt,
                    systemPrompt,
                    {
                        apiUrl: config.apiUrl || config.url,
                        apiKey: config.apiKey || config.key,
                        maxTokens: 1500,
                        temperature: 0.2,
                        timeout: 30
                    }
                );

                const content = typeof response === 'string'
                    ? response
                    : (response?.content || response?.message?.content || '');

                // 解析 JSON
                const updates = this.parseUpdateResponse(content);

                if (updates) {
                    // 应用更新
                    const applied = this.applyIncrementalUpdates(updates, maxNewEdges);
                    Logger.log?.(`[MultiDimGraph] 增量更新: +${applied.edges} 边, +${applied.nodes} 节点, ${applied.states} 状态变更`);

                    // 可选：持久化写入世界书
                    let worldbookWritten = 0;
                    if (writeEnabled && writeTargetBook && writeMaxEntries > 0 && Array.isArray(updates.worldbookEntries)) {
                        const entriesToWrite = updates.worldbookEntries.slice(0, writeMaxEntries);
                        if (typeof WBAP.upsertWorldBookEntry === 'function') {
                            for (const entry of entriesToWrite) {
                                try {
                                    if (!entry || typeof entry !== 'object') continue;
                                    if (!entry.content || String(entry.content).trim().length < 10) continue;
                                    const res = await WBAP.upsertWorldBookEntry(writeTargetBook, entry, { mode: 'append', immediately: true });
                                    if (res?.success) worldbookWritten += 1;
                                } catch (e) {}
                            }
                        }
                    }

                    return {
                        success: true,
                        ...applied,
                        worldbook: writeEnabled ? { targetBook: writeTargetBook || null, written: worldbookWritten } : null,
                    };
                }

                return { success: false, reason: 'parse failed' };
            } catch (e) {
                Logger.error?.('[MultiDimGraph] 增量更新失败:', e);
                return { success: false, reason: e.message };
            }
        },

        /**
         * 解析 LLM 返回的更新内容（增强容错）
         */
        parseUpdateResponse(content) {
            try {
                // 尝试提取 JSON
                let jsonStr = content;
                const jsonMatch = content.match(/\{[\s\S]*\}/);
                if (jsonMatch) {
                    jsonStr = jsonMatch[0];
                }

                // 尝试修复常见的 JSON 格式问题
                jsonStr = this.tryFixJson(jsonStr);

                const parsed = JSON.parse(jsonStr);
                return {
                    relations: Array.isArray(parsed.relations) ? parsed.relations : [],
                    stateChanges: Array.isArray(parsed.stateChanges) ? parsed.stateChanges : [],
                    newEntities: Array.isArray(parsed.newEntities) ? parsed.newEntities : [],
                    worldbookEntries: Array.isArray(parsed.worldbookEntries) ? parsed.worldbookEntries : []
                };
            } catch (e) {
                Logger.warn?.('[MultiDimGraph] JSON 解析失败，尝试备用解析:', e.message);
                // 尝试备用解析：提取各个数组
                return this.fallbackParse(content);
            }
        },

        /**
         * 尝试修复常见的 JSON 格式问题
         */
        tryFixJson(jsonStr) {
            // 移除可能的 markdown 代码块标记
            jsonStr = jsonStr.replace(/```json\s*/gi, '').replace(/```\s*/g, '');

            // 修复未闭合的字符串（在行尾添加引号）
            jsonStr = jsonStr.replace(/:\s*"([^"]*?)(\n|$)/g, ': "$1"$2');

            // 修复尾随逗号
            jsonStr = jsonStr.replace(/,(\s*[}\]])/g, '$1');

            // 修复缺少逗号的情况（两个对象/数组之间）
            jsonStr = jsonStr.replace(/}(\s*){/g, '},$1{');
            jsonStr = jsonStr.replace(/](\s*)\[/g, '],$1[');

            return jsonStr;
        },

        /**
         * 备用解析：尝试从文本中提取有效信息
         */
        fallbackParse(content) {
            const result = {
                relations: [],
                stateChanges: [],
                newEntities: []
            };

            try {
                // 尝试提取 relations 数组
                const relMatch = content.match(/"relations"\s*:\s*\[([\s\S]*?)\]/);
                if (relMatch) {
                    const relStr = '[' + relMatch[1] + ']';
                    try {
                        const fixedRelStr = this.tryFixJson(relStr);
                        result.relations = JSON.parse(fixedRelStr);
                    } catch (e) {
                        // 尝试逐个提取关系对象
                        const relObjects = relMatch[1].match(/\{[^{}]*\}/g) || [];
                        relObjects.forEach(obj => {
                            try {
                                result.relations.push(JSON.parse(obj));
                            } catch (e2) { /* 忽略单个解析失败 */ }
                        });
                    }
                }

                // 尝试提取 newEntities 数组
                const entMatch = content.match(/"newEntities"\s*:\s*\[([\s\S]*?)\]/);
                if (entMatch) {
                    const entObjects = entMatch[1].match(/\{[^{}]*\}/g) || [];
                    entObjects.forEach(obj => {
                        try {
                            result.newEntities.push(JSON.parse(obj));
                        } catch (e) { /* 忽略 */ }
                    });
                }

                // 尝试提取 stateChanges 数组
                const stateMatch = content.match(/"stateChanges"\s*:\s*\[([\s\S]*?)\]/);
                if (stateMatch) {
                    const stateObjects = stateMatch[1].match(/\{[^{}]*\}/g) || [];
                    stateObjects.forEach(obj => {
                        try {
                            result.stateChanges.push(JSON.parse(obj));
                        } catch (e) { /* 忽略 */ }
                    });
                }

                if (result.relations.length > 0 || result.newEntities.length > 0 || result.stateChanges.length > 0) {
                    Logger.log?.(`[MultiDimGraph] 备用解析成功: ${result.relations.length} 关系, ${result.newEntities.length} 实体`);
                    return result;
                }
            } catch (e) {
                Logger.warn?.('[MultiDimGraph] 备用解析也失败:', e.message);
            }

            return null;
        },

        /**
         * 应用增量更新
         */
        applyIncrementalUpdates(updates, maxNewEdges) {
            let edgesAdded = 0;
            let nodesAdded = 0;
            let statesChanged = 0;

            // 1. 添加新实体
            if (updates.newEntities) {
                updates.newEntities.forEach(entity => {
                    if (!entity.name || entity.name.length < 2) return;

                    const nodeId = `dynamic-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`;
                    const newNode = {
                        id: nodeId,
                        label: entity.name,
                        type: entity.type || 'concept',
                        typeInfo: this.getTypeInfo(entity.type),
                        keys: [entity.name],
                        keysLower: [entity.name.toLowerCase()],
                        content: entity.description || '',
                        contentLower: (entity.description || '').toLowerCase(),
                        multiDimImportance: {},
                        energy: 0,
                        isDynamic: true,
                        createdAt: Date.now()
                    };

                    this.nodes.set(nodeId, newNode);
                    this.dynamicNodes.set(nodeId, newNode);
                    this.nodeIndex.set(nodeId, { inEdges: [], outEdges: [] });
                    nodesAdded++;
                });
            }

            // 2. 添加新关系
            if (updates.relations && edgesAdded < maxNewEdges) {
                updates.relations.forEach(rel => {
                    if (edgesAdded >= maxNewEdges) return;
                    if (!rel.source || !rel.target || !rel.dimension) return;

                    // 查找源节点和目标节点
                    const sourceNode = this.findNodeByLabel(rel.source);
                    const targetNode = this.findNodeByLabel(rel.target);

                    if (!sourceNode || !targetNode) return;
                    if (sourceNode.id === targetNode.id) return;

                    // 验证维度
                    const dim = EDGE_DIMENSIONS[rel.dimension.toUpperCase()] ||
                                Object.values(EDGE_DIMENSIONS).find(d => d.id === rel.dimension);
                    if (!dim) return;

                    // 创建新边
                    const edgeId = `${sourceNode.id}->${targetNode.id}`;
                    const existingEdge = this.edges.find(e => e.id === edgeId);

                    if (existingEdge) {
                        // 更新现有边的维度
                        const existingDim = existingEdge.dimensions.find(d => d.dimension.id === dim.id);
                        if (existingDim) {
                            existingDim.strength = Math.max(existingDim.strength, rel.strength || 0.5);
                        } else {
                            existingEdge.dimensions.push({
                                dimension: dim,
                                strength: rel.strength || 0.5
                            });
                        }
                        existingEdge.isDynamic = true;
                    } else {
                        // 创建新边
                        const newEdge = {
                            id: edgeId,
                            source: sourceNode.id,
                            target: targetNode.id,
                            dimensions: [{
                                dimension: dim,
                                strength: rel.strength || 0.5
                            }],
                            description: rel.description || '',
                            weight: rel.strength || 0.5,
                            isDynamic: true,
                            createdAt: Date.now()
                        };

                        this.edges.push(newEdge);
                        this.dynamicEdges.push(newEdge);

                        // 更新索引
                        const dimEdges = this.dimensionIndex.get(dim.id);
                        if (dimEdges) dimEdges.push(newEdge);

                        const sourceIndex = this.nodeIndex.get(sourceNode.id);
                        const targetIndex = this.nodeIndex.get(targetNode.id);
                        if (sourceIndex) sourceIndex.outEdges.push(newEdge);
                        if (targetIndex) targetIndex.inEdges.push(newEdge);

                        edgesAdded++;
                    }
                });
            }

            // 3. 应用状态变更
            if (updates.stateChanges) {
                updates.stateChanges.forEach(change => {
                    if (!change.entity || !change.attribute || change.newValue === undefined) return;

                    const node = this.findNodeByLabel(change.entity);
                    if (!node) return;

                    // 记录状态变更
                    if (!node.stateHistory) node.stateHistory = [];
                    node.stateHistory.push({
                        attribute: change.attribute,
                        oldValue: change.oldValue,
                        newValue: change.newValue,
                        timestamp: Date.now()
                    });

                    // 更新特定属性
                    if (change.attribute === 'emotional' || change.attribute === 'emotionalState') {
                        node.emotionalState = change.newValue;
                    } else if (change.attribute === 'location' || change.attribute === 'spatial') {
                        node.spatialInfo = [change.newValue];
                    }

                    statesChanged++;
                });
            }

            // 4. 重新计算重要度
            if (edgesAdded > 0 || nodesAdded > 0) {
                this.calculateMultiDimImportance();
            }

            return { edges: edgesAdded, nodes: nodesAdded, states: statesChanged };
        },

        /**
         * 根据标签查找节点
         */
        findNodeByLabel(label) {
            if (!label) return null;
            const labelLower = label.toLowerCase();

            // 精确匹配
            for (const node of this.nodes.values()) {
                if (node.label.toLowerCase() === labelLower) return node;
            }

            // 关键词匹配
            for (const node of this.nodes.values()) {
                if (node.keysLower?.includes(labelLower)) return node;
            }

            // 模糊匹配
            for (const node of this.nodes.values()) {
                if (node.label.toLowerCase().includes(labelLower) ||
                    labelLower.includes(node.label.toLowerCase())) {
                    return node;
                }
            }

            return null;
        },

        /**
         * 获取类型信息
         */
        getTypeInfo(type) {
            const typeMap = {
                character: { id: 'character', label: '角色', color: '#ff6b6b', icon: '👤' },
                location: { id: 'location', label: '地点', color: '#4ecdc4', icon: '📍' },
                event: { id: 'event', label: '事件', color: '#3498db', icon: '📅' },
                item: { id: 'item', label: '物品', color: '#f39c12', icon: '🎁' },
                concept: { id: 'concept', label: '概念', color: '#1abc9c', icon: '💡' }
            };
            return typeMap[type] || typeMap.concept;
        },

        /**
         * 清除动态数据（可选，用于重置）
         */
        clearDynamicData() {
            // 移除动态边
            this.edges = this.edges.filter(e => !e.isDynamic);
            this.dynamicEdges = [];

            // 移除动态节点
            this.dynamicNodes.forEach((_, nodeId) => {
                this.nodes.delete(nodeId);
                this.nodeIndex.delete(nodeId);
            });
            this.dynamicNodes.clear();

            // 重建索引
            this.buildIndices();
            this.calculateMultiDimImportance();

            Logger.log?.('[MultiDimGraph] 动态数据已清除');
        },

        /**
         * 获取动态数据统计
         */
        getDynamicStats() {
            return {
                dynamicNodes: this.dynamicNodes.size,
                dynamicEdges: this.dynamicEdges.length,
                totalNodes: this.nodes.size,
                totalEdges: this.edges.length
            };
        },

        // ==================== 导出 ====================
        EDGE_DIMENSIONS
    };

    WBAP.MultiDimGraph = MultiDimGraph;
    WBAP.EDGE_DIMENSIONS = EDGE_DIMENSIONS;
    Logger.log?.('[MultiDimGraph] 多维知识图谱引擎已加载');
})();
