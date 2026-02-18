/**
 * 知识图谱引擎 (Graph Engine) - 精确链接版
 * 只建立真正有意义的链接，避免误链接
 */
(function () {
    'use strict';

    window.WBAP = window.WBAP || {};

    const Logger = console;

    // 节点类型定义
    const NODE_TYPES = {
        CHARACTER: { id: 'character', label: '角色', color: '#ff6b6b', icon: '👤' },
        LOCATION: { id: 'location', label: '地点', color: '#4ecdc4', icon: '📍' },
        ORGANIZATION: { id: 'organization', label: '组织', color: '#9b59b6', icon: '🏛' },
        ITEM: { id: 'item', label: '物品', color: '#f39c12', icon: '🎁' },
        EVENT: { id: 'event', label: '事件', color: '#3498db', icon: '📅' },
        CONCEPT: { id: 'concept', label: '概念', color: '#1abc9c', icon: '💡' },
        STATE: { id: 'state', label: '状态', color: '#e74c3c', icon: '📊' },
        LORE: { id: 'lore', label: '设定', color: '#95a5a6', icon: '📖' }
    };

    // 节点类型检测关键词
    const NODE_TYPE_KEYWORDS = {
        character: ['角色', '人物', 'character', 'npc', 'name', '姓名', '性别', '年龄', '身份', '外貌', '性格'],
        location: ['地点', '位置', '场所', '区域', 'location', 'place', '城市', '房间', '国家', '世界'],
        organization: ['组织', '团体', '势力', '公司', '机构', 'organization', 'group', '协会', '帮派'],
        item: ['物品', '道具', '武器', '装备', 'item', 'weapon', 'equipment', '工具'],
        event: ['事件', '历史', '剧情', 'event', 'history', '战争', '革命'],
        concept: ['概念', '规则', '系统', '魔法', 'concept', 'rule', 'magic', '技能'],
        state: ['状态', '关系', '属性', 'state', 'status', '好感度', '心情', '数值']
    };

    // 关系类型定义（简化，只保留最核心的）
    const RELATION_TYPES = {
        MENTIONED: { id: 'mentioned', label: '提及', color: '#6c757d', weight: 1.0 },
        BELONGS_TO: { id: 'belongs_to', label: '隶属', color: '#17a2b8', weight: 1.5 },
        LOCATED_IN: { id: 'located_in', label: '位于', color: '#28a745', weight: 1.5 },
        RELATED: { id: 'related', label: '关联', color: '#ffc107', weight: 1.2 }
    };

    // 关系检测模式（关键词 + 匹配模式）
    const RELATION_PATTERNS = {
        belongs_to: ['属于', '隶属于', '加入了', '是...的成员', '所属', '归属'],
        located_in: ['位于', '在...', '居住在', '坐落于', '处于', '所在']
    };

    const GraphEngine = {
        /**
         * 构建知识图谱
         */
        async build(entries, options = {}) {
            const startTime = performance.now();
            Logger.log?.(`[GraphEngine] 开始构建图谱，共 ${entries.length} 个条目`);

            const nodes = [];
            const links = [];
            const linkSet = new Set();
            const nodeMap = new Map();
            const keywordToNodes = new Map(); // 关键词 -> 节点ID列表

            // 1. 创建节点并建立关键词索引
            entries.forEach(entry => {
                const node = this.createNode(entry);
                if (node) {
                    nodes.push(node);
                    nodeMap.set(node.id, node);

                    // 索引关键词（只索引足够长且有意义的关键词）
                    node.keysLower.forEach(key => {
                        if (key.length >= 2) { // 至少2个字符
                            if (!keywordToNodes.has(key)) {
                                keywordToNodes.set(key, []);
                            }
                            keywordToNodes.get(key).push(node.id);
                        }
                    });
                }
            });

            // 2. 建立精确链接（基于关键词在内容中的明确出现）
            this.buildPreciseLinks(nodes, nodeMap, keywordToNodes, links, linkSet);

            // 3. 检测双向链接并强化
            this.detectBidirectionalLinks(links);

            // 4. 聚类分析
            const clusters = this.performClustering(nodes, links);
            nodes.forEach(node => {
                node.cluster = clusters.get(node.id) || 0;
            });

            // 5. 计算节点重要度
            this.calculateNodeImportance(nodes, links);

            const elapsed = (performance.now() - startTime).toFixed(2);
            Logger.log?.(`[GraphEngine] 图谱构建完成：${nodes.length} 节点，${links.length} 链接，耗时 ${elapsed}ms`);

            return {
                nodes,
                links,
                stats: {
                    nodeCount: nodes.length,
                    linkCount: links.length,
                    clusterCount: new Set(clusters.values()).size,
                    buildTime: elapsed
                }
            };
        },

        /**
         * 创建节点
         */
        createNode(entry) {
            const keys = this.normalizeKeys(entry.key);
            if (keys.length === 0) return null;

            const comment = (entry.comment || '').toLowerCase();
            const content = entry.content || '';
            const contentLower = content.toLowerCase();

            const type = this.detectNodeType(keys, comment, contentLower);
            const label = entry.comment || keys[0] || 'Untitled';

            return {
                id: entry.uid?.toString() || `node-${Math.random().toString(36).substr(2, 9)}`,
                label: label,
                type: type,
                typeInfo: NODE_TYPES[type.toUpperCase()] || NODE_TYPES.LORE,
                content: content,
                contentLower: contentLower,
                keys: keys,
                keysLower: keys.map(k => k.toLowerCase()),
                size: 15,
                importance: 0,
                cluster: 0,
                connections: 0,
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
                        // 过滤掉太短、纯数字、或看起来像占位符的关键词
                        if (trimmed &&
                            trimmed.length >= 2 &&
                            !/^\d+$/.test(trimmed) &&
                            !trimmed.startsWith('{{') &&
                            !trimmed.startsWith('[[')) {
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

            let bestType = 'lore';
            let bestScore = 0;

            for (const [type, keywords] of Object.entries(NODE_TYPE_KEYWORDS)) {
                let score = 0;
                keywords.forEach(kw => {
                    if (combined.includes(kw)) score++;
                });
                if (score > bestScore) {
                    bestScore = score;
                    bestType = type;
                }
            }

            return bestType;
        },

        /**
         * 精确链接构建 - 核心算法
         * 只创建真正有意义的链接
         */
        buildPreciseLinks(nodes, nodeMap, keywordToNodes, links, linkSet) {
            nodes.forEach(sourceNode => {
                const content = sourceNode.contentLower;
                const sourceKeys = new Set(sourceNode.keysLower);

                // 记录已经链接的目标，避免重复
                const linkedTargets = new Set();

                // 遍历所有关键词，检查是否在当前节点内容中明确出现
                keywordToNodes.forEach((targetNodeIds, keyword) => {
                    // 跳过太短的关键词（容易误匹配）
                    if (keyword.length < 2) return;

                    // 跳过源节点自己的关键词
                    if (sourceKeys.has(keyword)) return;

                    // 检查关键词是否作为完整词出现
                    // 对于中文：直接检查是否包含
                    // 对于英文：需要词边界
                    const isContained = this.isKeywordPresent(content, keyword);

                    if (isContained) {
                        targetNodeIds.forEach(targetId => {
                            if (targetId !== sourceNode.id && !linkedTargets.has(targetId)) {
                                // 额外验证：确保这个链接有意义
                                const targetNode = nodeMap.get(targetId);
                                if (targetNode && this.isLinkMeaningful(sourceNode, targetNode, keyword)) {
                                    linkedTargets.add(targetId);
                                    this.addLink(links, linkSet, sourceNode.id, targetId, RELATION_TYPES.MENTIONED);
                                }
                            }
                        });
                    }
                });
            });
        },

        /**
         * 检查关键词是否在文本中真正出现（而非作为子串误匹配）
         */
        isKeywordPresent(content, keyword) {
            // 中文关键词：直接包含即可，但要求足够长
            if (/[\u4e00-\u9fa5]/.test(keyword)) {
                if (keyword.length < 2) return false;
                return content.includes(keyword);
            }

            // 英文关键词：需要词边界匹配
            const escaped = keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            const regex = new RegExp(`\\b${escaped}\\b`, 'i');
            return regex.test(content);
        },

        /**
         * 验证链接是否有意义
         * 避免将所有包含某个常见词的条目都链接起来
         */
        isLinkMeaningful(sourceNode, targetNode, matchedKeyword) {
            // 规则1：关键词长度要求
            // 短关键词（2-3字符）需要更严格的验证
            if (matchedKeyword.length <= 3) {
                // 短关键词必须是目标节点的主关键词（第一个关键词）
                if (targetNode.keysLower[0] !== matchedKeyword) {
                    return false;
                }
            }

            // 规则2：避免链接到自己的变体
            // 如果源节点和目标节点的主关键词高度相似，可能是同一个概念
            const sourceMainKey = sourceNode.keysLower[0] || '';
            const targetMainKey = targetNode.keysLower[0] || '';
            if (sourceMainKey.includes(targetMainKey) || targetMainKey.includes(sourceMainKey)) {
                if (sourceMainKey !== targetMainKey) {
                    // 一个是另一个的子串，可能是变体形式，不建立链接
                    return false;
                }
            }

            // 规则3：关键词在内容中出现的上下文
            // 确保不是在注释、排除列表等无意义的位置
            const content = sourceNode.contentLower;
            const keywordPos = content.indexOf(matchedKeyword);

            if (keywordPos !== -1) {
                // 检查前后字符，排除明显的排除情况
                const before = keywordPos > 0 ? content.charAt(keywordPos - 1) : ' ';
                const after = keywordPos + matchedKeyword.length < content.length
                    ? content.charAt(keywordPos + matchedKeyword.length) : ' ';

                // 如果被引号包围，可能是关键词定义，不是引用
                if ((before === '"' && after === '"') || (before === "'" && after === "'")) {
                    // 检查是否在条目开头（定义自己）
                    if (keywordPos < 50) {
                        return false;
                    }
                }
            }

            return true;
        },

        /**
         * 检测双向链接并强化
         */
        detectBidirectionalLinks(links) {
            const linkMap = new Map();

            links.forEach(link => {
                const forwardKey = `${link.source}->${link.target}`;
                const reverseKey = `${link.target}->${link.source}`;
                linkMap.set(forwardKey, link);

                if (linkMap.has(reverseKey)) {
                    link.bidirectional = true;
                    link.weight = (link.weight || 1) * 1.5;
                    link.typeInfo = RELATION_TYPES.RELATED;
                    linkMap.get(reverseKey).bidirectional = true;
                    linkMap.get(reverseKey).weight = (linkMap.get(reverseKey).weight || 1) * 1.5;
                    linkMap.get(reverseKey).typeInfo = RELATION_TYPES.RELATED;
                }
            });
        },

        /**
         * 聚类分析（Union-Find）
         */
        performClustering(nodes, links) {
            const parent = new Map();
            const rank = new Map();

            nodes.forEach(node => {
                parent.set(node.id, node.id);
                rank.set(node.id, 0);
            });

            const find = (x) => {
                if (parent.get(x) !== x) {
                    parent.set(x, find(parent.get(x)));
                }
                return parent.get(x);
            };

            const union = (x, y) => {
                const px = find(x);
                const py = find(y);
                if (px === py) return;

                if (rank.get(px) < rank.get(py)) {
                    parent.set(px, py);
                } else if (rank.get(px) > rank.get(py)) {
                    parent.set(py, px);
                } else {
                    parent.set(py, px);
                    rank.set(px, rank.get(px) + 1);
                }
            };

            // 所有链接都合并聚类
            links.forEach(link => {
                union(link.source, link.target);
            });

            const clusters = new Map();
            const clusterIds = new Map();
            let nextClusterId = 0;

            nodes.forEach(node => {
                const root = find(node.id);
                if (!clusterIds.has(root)) {
                    clusterIds.set(root, nextClusterId++);
                }
                clusters.set(node.id, clusterIds.get(root));
            });

            return clusters;
        },

        /**
         * 计算节点重要度
         */
        calculateNodeImportance(nodes, links) {
            const inDegree = new Map();
            const outDegree = new Map();

            nodes.forEach(node => {
                inDegree.set(node.id, 0);
                outDegree.set(node.id, 0);
            });

            links.forEach(link => {
                inDegree.set(link.target, (inDegree.get(link.target) || 0) + 1);
                outDegree.set(link.source, (outDegree.get(link.source) || 0) + 1);
            });

            let maxDegree = 1;
            nodes.forEach(node => {
                const total = (inDegree.get(node.id) || 0) + (outDegree.get(node.id) || 0);
                node.connections = total;
                maxDegree = Math.max(maxDegree, total);
            });

            nodes.forEach(node => {
                node.importance = node.connections / maxDegree;
                node.size = 12 + node.importance * 15;
            });
        },

        /**
         * 添加链接
         */
        addLink(links, linkSet, sourceId, targetId, relationType) {
            const linkId = [sourceId, targetId].sort().join('-');

            if (!linkSet.has(linkId)) {
                linkSet.add(linkId);
                links.push({
                    id: linkId,
                    source: sourceId,
                    target: targetId,
                    type: relationType.id,
                    typeInfo: relationType,
                    weight: relationType.weight,
                    bidirectional: false
                });
            }
        },

        // 导出常量
        RELATION_TYPES,
        NODE_TYPES
    };

    WBAP.GraphEngine = GraphEngine;
    Logger.log?.('[GraphEngine] 精确链接版知识图谱引擎已加载');
})();
