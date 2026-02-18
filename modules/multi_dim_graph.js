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

            // 构建提示词（PEDSA-Web 图谱维护提示词）
            const now = new Date();
            const timeString = now.toLocaleString();

            // 拆分对话为用户/AI部分（尽力提取）
            const dialogueLines = dialogue.trim().split('\n');
            let userContent = dialogue;
            let aiContent = '';
            // 简单启发式：查找最后一组用户/AI对话
            for (let i = dialogueLines.length - 1; i >= 0; i--) {
                const line = dialogueLines[i];
                if (/^(AI|助手|Assistant|Pero|佩罗)\s*[:：]/i.test(line)) {
                    aiContent = dialogueLines.slice(i).join('\n');
                    userContent = dialogueLines.slice(0, i).join('\n');
                    break;
                }
            }
            if (!userContent.trim()) userContent = dialogue;

            const existingNodes = Array.from(this.nodes.values())
                .slice(0, 50)
                .map(n => n.label)
                .join(', ');

            const systemPrompt = `你是一个专业的知识图谱架构师。分析对话内容，输出增量的图谱维护指令。
输出严格的 JSON 格式，不要有其他内容。`;

            const userPrompt = `# 图谱构建提示词

你是一个专业的知识图谱架构师。你的任务是在每次对话结束后，分析对话内容，并输出增量的图谱维护指令。

**当前系统时间 (Reference Time)**: \`${timeString}\`
**对话上下文**:
${dialogue}

## 已知实体（可引用）
${existingNodes || '(无)'}

## 1. 核心任务

请从最近的对话中提取并生成以下两部分内容：

### A. 事件节点 (Event Node)
将本次对话的核心内容总结为一个独立的事件：
- **Summary**: 简洁的总结，字数控制在 **50个字左右**。
    - **必须以日期开头**：格式为"YYYY年MM月DD日"。**注意：必须根据 Reference Time 所处的历法系统，将对话中的相对时间（如"昨天"、"上周五"）转换为该历法下的绝对日期。**
    - **内容要素**：包含时间、地点、涉及的人物/事物、起因、结果。
- **Features**: 提取代表本次对话中所涉及事物的"词语"。**注意：这些词语必须与下文中 Ontology 维护的词语保持一致。**
- **Type**: 必须从以下 6 种实体类型中选择 **最匹配的一个**：
    - \`PERSON\` (人物/身份)
    - \`TECH\` (技术/概念)
    - \`EVENT\` (事件/动作)
    - \`LOCATION\` (地点)
    - \`OBJECT\` (物件)
    - \`VALUES\` (价值观)
- **Emotion**: 必须从以下 8 种情感中选择 **最主导的一个**（Plutchik 情感轮）：
    - \`JOY\` (喜悦) | \`SHY\` (害羞) | \`FEAR\` (恐惧) | \`SURPRISE\` (惊讶) | \`SADNESS\` (悲伤) | \`DISGUST\` (厌恶) | \`ANGER\` (生气) | \`ANTICIPATION\` (期待)
- **Time**: 使用带日期的 24 小时制格式，例如：\`2026-02-02 14:30:00\`。**注意：必须是遵循 Reference Time 历法的绝对时间。**

### B. Ontology 节点 (Ontology Node)
这是系统的"定义库"，仅用于描述词语的性质和身份。请遵循下述 **"提取原则"**：
- **拆解粒度**: 不要生成冗长的描述性短语，将其拆解为最小意义单元。**但注意：具有整体意义的专有名词严禁原子化拆解**。
- **仅限实词**: 严禁提取虚词、代词或无实际语义的助词。
- **语义聚焦**: 仅提取对理解事件、技术、情感或人物关系有实质贡献的关键词。

连接类型与属性说明：

1.  **relation_type** (核心三种边):
    - \`representation\` (默认): **表征**。"看到 Source 可能会联想到 Target"。单向概率性路径。严禁将临时状态定义为表征。
    - \`equality\`: **等价**。"Source 就是 Target"。双向强连接，用于同义词、缩写、别名。权重必定为1.0。
    - \`inhibition\`: **抑制**。"Source 与 Target 互斥"。双向负反馈连接，用于防止错误的联想扩散。

2.  **关键属性**:
    - \`strength\` (0.0 - 1.0): 联想强度。

**禁止项：** 不要将动作或逻辑关联作为表征。

## 2. 输出格式 (JSON Only)

请**只输出**有效的 JSON 字符串：

{
  "new_event": {
    "summary": "YYYY年MM月DD日，...",
    "features": ["词语1", "词语2"],
    "type": "PERSON | TECH | EVENT | LOCATION | OBJECT | VALUES",
    "emotion": "JOY | SHY | FEAR | SURPRISE | SADNESS | DISGUST | ANGER | ANTICIPATION",
    "time": "YYYY-MM-DD HH:mm:ss"
  },
  "ontology_updates": [
    {
      "source": "词语1",
      "target": "词语2",
      "relation_type": "representation | equality | inhibition",
      "strength": number,
      "action": "upsert | replace",
      "reason": "仅当 action 为 replace 时填写"
    }
  ]
}

## 3. 字段说明
- **action**:
    - \`upsert\` (默认): 常规更新。如果边存在则增强权重，不存在则创建。
    - \`replace\`: **逻辑覆盖**。当新信息与旧知识发生根本性冲突时使用。
- **reason**: 简要描述为何触发 replace。
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
         * 解析 LLM 返回的更新内容（PEDSA-Web 格式：new_event + ontology_updates）
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
                    new_event: parsed.new_event && typeof parsed.new_event === 'object' ? parsed.new_event : null,
                    ontology_updates: Array.isArray(parsed.ontology_updates) ? parsed.ontology_updates : [],
                    worldbookEntries: Array.isArray(parsed.worldbookEntries) ? parsed.worldbookEntries : []
                };
            } catch (e) {
                Logger.warn?.('[MultiDimGraph] JSON 解析失败，尝试备用解析:', e.message);
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
         * 备用解析：尝试从文本中提取 PEDSA-Web 格式的有效信息
         */
        fallbackParse(content) {
            const result = {
                new_event: null,
                ontology_updates: [],
                worldbookEntries: []
            };

            try {
                // 尝试提取 new_event 对象
                const eventMatch = content.match(/"new_event"\s*:\s*(\{[\s\S]*?\})\s*[,}]/);
                if (eventMatch) {
                    try {
                        result.new_event = JSON.parse(eventMatch[1]);
                    } catch (e) { /* 忽略 */ }
                }

                // 尝试提取 ontology_updates 数组
                const ontoMatch = content.match(/"ontology_updates"\s*:\s*\[([\s\S]*?)\]/);
                if (ontoMatch) {
                    const ontoObjects = ontoMatch[1].match(/\{[^{}]*\}/g) || [];
                    ontoObjects.forEach(obj => {
                        try {
                            result.ontology_updates.push(JSON.parse(obj));
                        } catch (e) { /* 忽略 */ }
                    });
                }

                // 尝试提取 worldbookEntries 数组
                const wbMatch = content.match(/"worldbookEntries"\s*:\s*\[([\s\S]*?)\]/);
                if (wbMatch) {
                    const wbObjects = wbMatch[1].match(/\{[^{}]*\}/g) || [];
                    wbObjects.forEach(obj => {
                        try {
                            result.worldbookEntries.push(JSON.parse(obj));
                        } catch (e) { /* 忽略 */ }
                    });
                }

                if (result.new_event || result.ontology_updates.length > 0) {
                    Logger.log?.(`[MultiDimGraph] 备用解析成功: event=${!!result.new_event}, ${result.ontology_updates.length} ontology updates`);
                    return result;
                }
            } catch (e) {
                Logger.warn?.('[MultiDimGraph] 备用解析也失败:', e.message);
            }

            return null;
        },

        /**
         * PEDSA-Web 实体类型到内部类型的映射
         */
        _pedsaTypeMap: {
            'PERSON': 'character',
            'TECH': 'concept',
            'EVENT': 'event',
            'LOCATION': 'location',
            'OBJECT': 'item',
            'VALUES': 'concept'
        },

        /**
         * PEDSA-Web 情感到内部情感状态的映射
         */
        _pedsaEmotionMap: {
            'JOY': 'positive',
            'SHY': 'shy',
            'FEAR': 'negative',
            'SURPRISE': 'surprise',
            'SADNESS': 'negative',
            'DISGUST': 'negative',
            'ANGER': 'negative',
            'ANTICIPATION': 'positive'
        },

        /**
         * 关系类型到维度的映射
         */
        _relationTypeToDimension(relationType, source, target) {
            // representation → 根据上下文推断最合适的维度
            // equality → THEMATIC（主题关联）
            // inhibition → CAUSAL（因果/互斥）
            if (relationType === 'equality') return EDGE_DIMENSIONS.THEMATIC;
            if (relationType === 'inhibition') return EDGE_DIMENSIONS.CAUSAL;

            // representation: 根据节点类型推断维度
            const sourceNode = this.findNodeByLabel(source);
            const targetNode = this.findNodeByLabel(target);
            const sourceType = sourceNode?.type || '';
            const targetType = targetNode?.type || '';

            if (sourceType === 'character' || targetType === 'character') return EDGE_DIMENSIONS.CHARACTER;
            if (sourceType === 'location' || targetType === 'location') return EDGE_DIMENSIONS.SPATIAL;
            if (sourceType === 'event' || targetType === 'event') return EDGE_DIMENSIONS.TEMPORAL;
            return EDGE_DIMENSIONS.THEMATIC;
        },

        /**
         * 应用增量更新（PEDSA-Web 格式：new_event + ontology_updates）
         */
        applyIncrementalUpdates(updates, maxNewEdges) {
            let edgesAdded = 0;
            let nodesAdded = 0;
            let statesChanged = 0;

            // 1. 处理事件节点 (new_event)
            if (updates.new_event) {
                const event = updates.new_event;
                const summary = event.summary || '';
                if (summary.length >= 5) {
                    const nodeId = `event-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`;
                    const internalType = this._pedsaTypeMap[event.type] || 'event';
                    const emotionalState = event.emotion || null;
                    const features = Array.isArray(event.features) ? event.features : [];

                    const newNode = {
                        id: nodeId,
                        label: summary.slice(0, 60),
                        type: internalType,
                        typeInfo: this.getTypeInfo(internalType),
                        keys: features.length > 0 ? features : [summary.slice(0, 30)],
                        keysLower: (features.length > 0 ? features : [summary.slice(0, 30)]).map(k => k.toLowerCase()),
                        content: summary,
                        contentLower: summary.toLowerCase(),
                        multiDimImportance: {},
                        energy: 0,
                        isDynamic: true,
                        createdAt: Date.now(),
                        emotionalState: emotionalState,
                        pedsaEmotion: emotionalState, // 保留原始 Plutchik 情感
                        eventTime: event.time || null,
                        features: features
                    };

                    this.nodes.set(nodeId, newNode);
                    this.dynamicNodes.set(nodeId, newNode);
                    this.nodeIndex.set(nodeId, { inEdges: [], outEdges: [] });
                    nodesAdded++;

                    // 为 features 中的每个词创建/查找节点，并建立与事件节点的边
                    for (const feature of features) {
                        if (!feature || feature.length < 1) continue;
                        let featureNode = this.findNodeByLabel(feature);
                        if (!featureNode) {
                            // 创建新的 ontology 节点
                            const fNodeId = `onto-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`;
                            featureNode = {
                                id: fNodeId,
                                label: feature,
                                type: 'concept',
                                typeInfo: this.getTypeInfo('concept'),
                                keys: [feature],
                                keysLower: [feature.toLowerCase()],
                                content: '',
                                contentLower: '',
                                multiDimImportance: {},
                                energy: 0,
                                isDynamic: true,
                                createdAt: Date.now()
                            };
                            this.nodes.set(fNodeId, featureNode);
                            this.dynamicNodes.set(fNodeId, featureNode);
                            this.nodeIndex.set(fNodeId, { inEdges: [], outEdges: [] });
                            nodesAdded++;
                        }

                        // 建立事件→feature 的边
                        if (edgesAdded < maxNewEdges) {
                            const edgeId = `${nodeId}->${featureNode.id}`;
                            if (!this.edges.find(e => e.id === edgeId)) {
                                const dim = EDGE_DIMENSIONS.THEMATIC;
                                const newEdge = {
                                    id: edgeId,
                                    source: nodeId,
                                    target: featureNode.id,
                                    dimensions: [{ dimension: dim, strength: 0.8 }],
                                    description: `event feature: ${feature}`,
                                    weight: 0.8,
                                    isDynamic: true,
                                    createdAt: Date.now(),
                                    relationType: 'representation'
                                };
                                this.edges.push(newEdge);
                                this.dynamicEdges.push(newEdge);
                                const dimEdges = this.dimensionIndex.get(dim.id);
                                if (dimEdges) dimEdges.push(newEdge);
                                const srcIdx = this.nodeIndex.get(nodeId);
                                const tgtIdx = this.nodeIndex.get(featureNode.id);
                                if (srcIdx) srcIdx.outEdges.push(newEdge);
                                if (tgtIdx) tgtIdx.inEdges.push(newEdge);
                                edgesAdded++;
                            }
                        }
                    }
                }
            }

            // 2. 处理 ontology_updates（三种关系类型）
            if (updates.ontology_updates) {
                for (const update of updates.ontology_updates) {
                    if (edgesAdded >= maxNewEdges) break;
                    if (!update.source || !update.target) continue;

                    const relationType = update.relation_type || 'representation';
                    const action = update.action || 'upsert';
                    const strength = Math.max(0, Math.min(1, update.strength || 0.5));

                    // 确保源节点和目标节点存在
                    let sourceNode = this.findNodeByLabel(update.source);
                    if (!sourceNode) {
                        const sNodeId = `onto-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`;
                        sourceNode = {
                            id: sNodeId,
                            label: update.source,
                            type: 'concept',
                            typeInfo: this.getTypeInfo('concept'),
                            keys: [update.source],
                            keysLower: [update.source.toLowerCase()],
                            content: '',
                            contentLower: '',
                            multiDimImportance: {},
                            energy: 0,
                            isDynamic: true,
                            createdAt: Date.now()
                        };
                        this.nodes.set(sNodeId, sourceNode);
                        this.dynamicNodes.set(sNodeId, sourceNode);
                        this.nodeIndex.set(sNodeId, { inEdges: [], outEdges: [] });
                        nodesAdded++;
                    }

                    let targetNode = this.findNodeByLabel(update.target);
                    if (!targetNode) {
                        const tNodeId = `onto-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`;
                        targetNode = {
                            id: tNodeId,
                            label: update.target,
                            type: 'concept',
                            typeInfo: this.getTypeInfo('concept'),
                            keys: [update.target],
                            keysLower: [update.target.toLowerCase()],
                            content: '',
                            contentLower: '',
                            multiDimImportance: {},
                            energy: 0,
                            isDynamic: true,
                            createdAt: Date.now()
                        };
                        this.nodes.set(tNodeId, targetNode);
                        this.dynamicNodes.set(tNodeId, targetNode);
                        this.nodeIndex.set(tNodeId, { inEdges: [], outEdges: [] });
                        nodesAdded++;
                    }

                    if (sourceNode.id === targetNode.id) continue;

                    // 推断维度
                    const dim = this._relationTypeToDimension(relationType, update.source, update.target);

                    // replace 动作：先清理冲突边
                    if (action === 'replace') {
                        this._handleReplaceAction(sourceNode, targetNode, dim, update.reason);
                        statesChanged++;
                    }

                    // 创建/更新边
                    const edgeId = `${sourceNode.id}->${targetNode.id}`;
                    const existingEdge = this.edges.find(e => e.id === edgeId);

                    if (existingEdge) {
                        const existingDim = existingEdge.dimensions.find(d => d.dimension.id === dim.id);
                        if (existingDim) {
                            if (action === 'replace') {
                                existingDim.strength = strength;
                            } else {
                                // upsert: 增强权重
                                existingDim.strength = Math.min(1.0, existingDim.strength + strength * 0.2);
                            }
                        } else {
                            existingEdge.dimensions.push({ dimension: dim, strength: strength });
                        }
                        existingEdge.isDynamic = true;
                        existingEdge.relationType = relationType;
                    } else {
                        const newEdge = {
                            id: edgeId,
                            source: sourceNode.id,
                            target: targetNode.id,
                            dimensions: [{ dimension: dim, strength: strength }],
                            description: update.reason || '',
                            weight: strength,
                            isDynamic: true,
                            createdAt: Date.now(),
                            relationType: relationType
                        };
                        this.edges.push(newEdge);
                        this.dynamicEdges.push(newEdge);
                        const dimEdges = this.dimensionIndex.get(dim.id);
                        if (dimEdges) dimEdges.push(newEdge);
                        const srcIdx = this.nodeIndex.get(sourceNode.id);
                        const tgtIdx = this.nodeIndex.get(targetNode.id);
                        if (srcIdx) srcIdx.outEdges.push(newEdge);
                        if (tgtIdx) tgtIdx.inEdges.push(newEdge);
                        edgesAdded++;
                    }

                    // equality: 创建反向边
                    if (relationType === 'equality') {
                        const reverseId = `${targetNode.id}->${sourceNode.id}`;
                        if (!this.edges.find(e => e.id === reverseId) && edgesAdded < maxNewEdges) {
                            const reverseEdge = {
                                id: reverseId,
                                source: targetNode.id,
                                target: sourceNode.id,
                                dimensions: [{ dimension: dim, strength: 1.0 }],
                                description: `equality: ${update.target} = ${update.source}`,
                                weight: 1.0,
                                isDynamic: true,
                                createdAt: Date.now(),
                                relationType: 'equality'
                            };
                            this.edges.push(reverseEdge);
                            this.dynamicEdges.push(reverseEdge);
                            const dimEdges = this.dimensionIndex.get(dim.id);
                            if (dimEdges) dimEdges.push(reverseEdge);
                            const tgtIdx = this.nodeIndex.get(targetNode.id);
                            const srcIdx = this.nodeIndex.get(sourceNode.id);
                            if (tgtIdx) tgtIdx.outEdges.push(reverseEdge);
                            if (srcIdx) srcIdx.inEdges.push(reverseEdge);
                            edgesAdded++;
                        }
                    }

                    // inhibition: 创建反向抑制边
                    if (relationType === 'inhibition') {
                        const reverseId = `${targetNode.id}->${sourceNode.id}`;
                        if (!this.edges.find(e => e.id === reverseId) && edgesAdded < maxNewEdges) {
                            const reverseEdge = {
                                id: reverseId,
                                source: targetNode.id,
                                target: sourceNode.id,
                                dimensions: [{ dimension: dim, strength: strength }],
                                description: update.reason || `inhibition: ${update.target} ≠ ${update.source}`,
                                weight: strength,
                                isDynamic: true,
                                createdAt: Date.now(),
                                relationType: 'inhibition'
                            };
                            this.edges.push(reverseEdge);
                            this.dynamicEdges.push(reverseEdge);
                            const dimEdges = this.dimensionIndex.get(dim.id);
                            if (dimEdges) dimEdges.push(reverseEdge);
                            const tgtIdx = this.nodeIndex.get(targetNode.id);
                            const srcIdx = this.nodeIndex.get(sourceNode.id);
                            if (tgtIdx) tgtIdx.outEdges.push(reverseEdge);
                            if (srcIdx) srcIdx.inEdges.push(reverseEdge);
                            edgesAdded++;
                        }
                    }
                }
            }

            // 3. 重新计算重要度
            if (edgesAdded > 0 || nodesAdded > 0) {
                this.calculateMultiDimImportance();
            }

            return { edges: edgesAdded, nodes: nodesAdded, states: statesChanged };
        },

        /**
         * 处理 replace 动作：清理与 source 节点相关的冲突边
         * 当属性发生根本性变更时（如发色改变），移除旧的冲突关联
         */
        _handleReplaceAction(sourceNode, newTargetNode, dim, reason) {
            // 查找 source 在同一维度上的现有边，如果 target 不同则弱化
            const edgesToWeaken = this.edges.filter(e => {
                if (e.source !== sourceNode.id) return false;
                if (e.target === newTargetNode.id) return false;
                // 同维度的边
                return e.dimensions.some(d => d.dimension.id === dim.id);
            });

            for (const edge of edgesToWeaken) {
                for (const d of edge.dimensions) {
                    if (d.dimension.id === dim.id) {
                        // 大幅降低旧边的强度
                        d.strength = Math.max(0.05, d.strength * 0.2);
                    }
                }
                edge.weight = Math.max(...edge.dimensions.map(d => d.strength));
            }

            if (edgesToWeaken.length > 0) {
                Logger.log?.(`[MultiDimGraph] replace 仲裁: 弱化 ${edgesToWeaken.length} 条冲突边 (${reason || 'no reason'})`);
            }
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
                concept: { id: 'concept', label: '概念', color: '#1abc9c', icon: '💡' },
                // PEDSA-Web 类型别名
                person: { id: 'character', label: '角色', color: '#ff6b6b', icon: '👤' },
                tech: { id: 'concept', label: '技术', color: '#9b59b6', icon: '⚙️' },
                object: { id: 'item', label: '物品', color: '#f39c12', icon: '🎁' },
                values: { id: 'concept', label: '价值观', color: '#e67e22', icon: '💎' }
            };
            return typeMap[type?.toLowerCase()] || typeMap.concept;
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

        // ==================== 序列化与反序列化 ====================

        /**
         * 序列化图谱为 JSON 兼容对象
         * @returns {Object} 可 JSON.stringify 的纯对象
         */
        serialize() {
            const serializeEdgeDimensions = (dims) =>
                (dims || []).map(d => ({
                    dimensionId: d.dimension?.id || 'thematic',
                    strength: d.strength
                }));

            return {
                version: 1,
                timestamp: Date.now(),
                nodes: Array.from(this.nodes.entries()).map(([id, node]) => {
                    const { entry, ...rest } = node;
                    return rest;
                }),
                edges: this.edges.map(edge => ({
                    ...edge,
                    dimensions: serializeEdgeDimensions(edge.dimensions)
                })),
                dynamicNodes: Array.from(this.dynamicNodes.entries()).map(([id, node]) => {
                    const { entry, ...rest } = node;
                    return rest;
                }),
                dynamicEdges: this.dynamicEdges.map(edge => ({
                    ...edge,
                    dimensions: serializeEdgeDimensions(edge.dimensions)
                }))
            };
        },

        /**
         * 从序列化数据恢复图谱
         * @param {Object} data - serialize() 的输出
         */
        deserialize(data) {
            this.clear();
            this.dynamicNodes = new Map();
            this.dynamicEdges = [];
            if (!data || data.version !== 1) return;

            // 构建 dimensionId -> dimension 对象映射
            const dimById = {};
            Object.values(EDGE_DIMENSIONS).forEach(d => { dimById[d.id] = d; });

            const rebuildEdgeDimensions = (dims) =>
                (dims || []).map(d => ({
                    dimension: dimById[d.dimensionId] || EDGE_DIMENSIONS.THEMATIC,
                    strength: d.strength
                }));

            // 恢复节点
            for (const node of (data.nodes || [])) {
                this.nodes.set(node.id, node);
            }

            // 恢复边
            for (const edge of (data.edges || [])) {
                edge.dimensions = rebuildEdgeDimensions(edge.dimensions);
                this.edges.push(edge);
            }

            // 恢复动态节点
            for (const node of (data.dynamicNodes || [])) {
                this.dynamicNodes.set(node.id, node);
            }

            // 恢复动态边
            for (const edge of (data.dynamicEdges || [])) {
                edge.dimensions = rebuildEdgeDimensions(edge.dimensions);
                this.dynamicEdges.push(edge);
            }

            // 重建索引
            this.buildIndices();
            this.calculateMultiDimImportance();
        },

        // ==================== IndexedDB 持久化 ====================

        /**
         * 打开 IndexedDB 连接
         * @returns {Promise<IDBDatabase>}
         */
        async openGraphDB() {
            const DB_NAME = 'WBAP_GraphStore';
            const DB_VERSION = 1;
            const STORE_NAME = 'graphs';

            return new Promise((resolve, reject) => {
                const request = indexedDB.open(DB_NAME, DB_VERSION);
                request.onupgradeneeded = (event) => {
                    const db = event.target.result;
                    if (!db.objectStoreNames.contains(STORE_NAME)) {
                        db.createObjectStore(STORE_NAME, { keyPath: 'characterId' });
                    }
                };
                request.onsuccess = () => resolve(request.result);
                request.onerror = () => reject(request.error);
            });
        },

        /**
         * 保存图谱到 IndexedDB
         * @param {string} characterId - 角色标识符
         */
        async saveToIndexedDB(characterId) {
            try {
                const db = await this.openGraphDB();
                const tx = db.transaction('graphs', 'readwrite');
                const store = tx.objectStore('graphs');
                const data = this.serialize();
                data.characterId = characterId;
                store.put(data);
                await new Promise((resolve, reject) => {
                    tx.oncomplete = resolve;
                    tx.onerror = () => reject(tx.error);
                });
                db.close();
            } catch (e) {
                Logger.error?.('[MultiDimGraph] IndexedDB 保存失败:', e);
            }
        },

        /**
         * 从 IndexedDB 加载图谱
         * @param {string} characterId - 角色标识符
         * @returns {Promise<boolean>} 是否成功加载
         */
        async loadFromIndexedDB(characterId) {
            try {
                const db = await this.openGraphDB();
                const tx = db.transaction('graphs', 'readonly');
                const store = tx.objectStore('graphs');
                const request = store.get(characterId);
                const data = await new Promise((resolve, reject) => {
                    request.onsuccess = () => resolve(request.result);
                    request.onerror = () => reject(request.error);
                });
                db.close();
                if (data) {
                    this.deserialize(data);
                    return true;
                }
                return false;
            } catch (e) {
                Logger.error?.('[MultiDimGraph] IndexedDB 加载失败:', e);
                return false;
            }
        },

        // ==================== 导出 ====================
        EDGE_DIMENSIONS
    };

    WBAP.MultiDimGraph = MultiDimGraph;
    WBAP.EDGE_DIMENSIONS = EDGE_DIMENSIONS;
    Logger.log?.('[MultiDimGraph] 多维知识图谱引擎已加载');
})();
