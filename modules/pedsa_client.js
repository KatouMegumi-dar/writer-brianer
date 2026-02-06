/**
 * PEDSA 客户端 - 与 PEDSA 本地服务通信
 * 提供高速检索能力，作为超级记忆的预检索层
 */
(function () {
    'use strict';

    window.WBAP = window.WBAP || {};
    const Logger = WBAP.Logger || console;
    const TAG = '[PedsaClient]';

    const PEDSA_BASE_URL = 'http://localhost:7878/api';
    const REQUEST_TIMEOUT = 2000; // 2000ms 超时

    const PedsaClient = {
        // 服务状态
        isAvailable: false,
        lastHealthCheck: 0,
        healthCheckInterval: 30000, // 30秒检查一次

        /**
         * 初始化客户端
         */
        async init() {
            Logger.log?.(TAG, '初始化 PEDSA 客户端...');
            await this.checkHealth();

            if (this.isAvailable) {
                Logger.log?.(TAG, '✅ PEDSA 服务可用');
            } else {
                Logger.warn?.(TAG, '⚠️ PEDSA 服务不可用，将使用降级模式');
            }
        },

        /**
         * 健康检查
         */
        async checkHealth() {
            const now = Date.now();
            if (now - this.lastHealthCheck < this.healthCheckInterval) {
                return this.isAvailable;
            }

            try {
                const response = await fetch(`${PEDSA_BASE_URL}/health`, {
                    method: 'GET',
                    signal: AbortSignal.timeout(REQUEST_TIMEOUT)
                });

                if (response.ok) {
                    const data = await response.json();
                    this.isAvailable = data.status === 'healthy';
                    this.lastHealthCheck = now;

                    if (this.isAvailable) {
                        Logger.log?.(TAG, `健康检查通过 - 版本: ${data.version}, 节点数: ${data.stats.total_nodes}`);
                    }
                } else {
                    this.isAvailable = false;
                }
            } catch (e) {
                this.isAvailable = false;
                Logger.warn?.(TAG, '健康检查失败:', e.message);
            }

            return this.isAvailable;
        },

        /**
         * 同步世界书数据到 PEDSA
         * @param {Array} worldbooks - 世界书数组
         * @param {Array} ontology - 本体边数组
         */
        async sync(worldbooks, ontology = []) {
            if (!this.isAvailable) {
                Logger.warn?.(TAG, '服务不可用，跳过同步');
                return { success: false, reason: 'service_unavailable' };
            }

            Logger.log?.(TAG, `同步数据: ${worldbooks.length} 个世界书, ${ontology.length} 条本体边`);

            try {
                const response = await fetch(`${PEDSA_BASE_URL}/sync`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ worldbooks, ontology }),
                    signal: AbortSignal.timeout(10000) // 同步允许更长时间
                });

                if (response.ok) {
                    const data = await response.json();
                    Logger.log?.(TAG, `同步完成: +${data.stats.nodes_added} 节点, +${data.stats.edges_added} 边, 编译耗时 ${data.stats.compile_time_ms}ms`);
                    return data;
                } else {
                    throw new Error(`HTTP ${response.status}`);
                }
            } catch (e) {
                Logger.error?.(TAG, '同步失败:', e);
                return { success: false, reason: e.message };
            }
        },

        /**
         * 执行快速检索
         * @param {string} query - 查询字符串
         * @param {Object} options - 检索选项
         */
        async retrieve(query, options = {}) {
            if (!this.isAvailable) {
                return { success: false, reason: 'service_unavailable' };
            }

            const defaultOptions = {
                top_k: 20,
                enable_temporal: true,
                enable_affective: true,
                enable_spatial: true,
                current_time: Math.floor(Date.now() / 1000)
            };

            const mergedOptions = { ...defaultOptions, ...options };

            try {
                const startTime = performance.now();

                const response = await fetch(`${PEDSA_BASE_URL}/retrieve`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        query,
                        options: mergedOptions
                    }),
                    signal: AbortSignal.timeout(REQUEST_TIMEOUT)
                });

                if (response.ok) {
                    const data = await response.json();
                    const totalTime = performance.now() - startTime;

                    Logger.log?.(TAG, `检索完成: ${data.results.length} 个结果, 总耗时 ${totalTime.toFixed(2)}ms (PEDSA: ${data.stats.retrieve_time_ms.toFixed(2)}ms)`);

                    return data;
                } else {
                    throw new Error(`HTTP ${response.status}`);
                }
            } catch (e) {
                Logger.warn?.(TAG, '检索失败:', e.message);
                return { success: false, reason: e.message };
            }
        },

        /**
         * 时间骨架追溯
         * @param {number} nodeId - 起始节点 ID
         * @param {string} direction - 方向: "backward" | "forward" | "both"
         * @param {number} maxSteps - 最大步数
         */
        async temporalTrace(nodeId, direction = 'backward', maxSteps = 5) {
            if (!this.isAvailable) {
                return { success: false, reason: 'service_unavailable' };
            }

            try {
                const response = await fetch(`${PEDSA_BASE_URL}/temporal_trace`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        node_id: nodeId,
                        direction,
                        max_steps: maxSteps
                    }),
                    signal: AbortSignal.timeout(REQUEST_TIMEOUT)
                });

                if (response.ok) {
                    const data = await response.json();
                    Logger.log?.(TAG, `时间追溯完成: ${data.timeline.length} 个事件`);
                    return data;
                } else {
                    throw new Error(`HTTP ${response.status}`);
                }
            } catch (e) {
                Logger.warn?.(TAG, '时间追溯失败:', e.message);
                return { success: false, reason: e.message };
            }
        },

        /**
         * 将世界书条目转换为 PEDSA 格式
         * @param {Array} entries - 世界书条目
         * @param {string} bookName - 世界书名称
         */
        convertEntriesToPedsaFormat(entries, bookName) {
            return entries.map(entry => {
                // 提取时间戳（简单解析）
                const timestamp = this.extractTimestamp(entry.content);

                // 提取地点
                const location = this.extractLocation(entry.content);

                // 提取情感
                const emotions = this.extractEmotions(entry.content);

                // 推断类型
                const entryType = this.inferType(entry);

                return {
                    uid: entry.uid,
                    key: Array.isArray(entry.key) ? entry.key : [entry.key],
                    comment: entry.comment || '',
                    content: entry.content || '',
                    timestamp,
                    location,
                    emotions,
                    entry_type: entryType
                };
            });
        },

        /**
         * 从文本中提取时间戳（简单实现）
         */
        extractTimestamp(text) {
            // 匹配 "YYYY年MM月DD日" 格式
            const match = text.match(/(\d{4})年(\d{1,2})月(\d{1,2})日/);
            if (match) {
                const [, year, month, day] = match;
                const date = new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
                return Math.floor(date.getTime() / 1000);
            }
            return 0;
        },

        /**
         * 从文本中提取地点
         */
        extractLocation(text) {
            const locations = ['上海', '北京', '深圳', '杭州', '广州', '徐家汇', '张江', '滨江'];
            for (const loc of locations) {
                if (text.includes(loc)) {
                    return loc;
                }
            }
            return '';
        },

        /**
         * 从文本中提取情感
         */
        extractEmotions(text) {
            const emotionMap = {
                joy: ['开心', '高兴', '欣慰', '快乐', '愉快'],
                shy: ['害羞', '不好意思', '脸红'],
                fear: ['害怕', '担心', '焦虑', '恐惧'],
                surprise: ['惊讶', '没想到', '竟然'],
                sadness: ['难过', '伤心', '失望', '遗憾'],
                disgust: ['讨厌', '不喜欢', '厌恶'],
                anger: ['生气', '愤怒', '恼火', '不爽'],
                anticipation: ['期待', '期望', '愿景', '规划']
            };

            const detected = [];
            for (const [emotion, keywords] of Object.entries(emotionMap)) {
                if (keywords.some(kw => text.includes(kw))) {
                    detected.push(emotion);
                }
            }
            return detected;
        },

        /**
         * 推断条目类型
         */
        inferType(entry) {
            const combined = (entry.comment + ' ' + entry.content).toLowerCase();

            if (/角色|人物|character/.test(combined)) return 'character';
            if (/地点|位置|location/.test(combined)) return 'location';
            if (/事件|历史|event/.test(combined)) return 'event';
            if (/物品|道具|item/.test(combined)) return 'item';
            if (/概念|规则|concept/.test(combined)) return 'concept';

            return 'lore';
        },

        /**
         * 根据 PEDSA 结果筛选世界书条目
         * @param {Array} allEntries - 所有世界书条目
         * @param {Array} pedsaResults - PEDSA 检索结果
         */
        filterEntriesByPedsaResults(allEntries, pedsaResults) {
            if (!pedsaResults || pedsaResults.length === 0) {
                return allEntries;
            }

            // 创建 PEDSA 结果的 UID 集合
            const relevantUids = new Set(pedsaResults.map(r => r.node_id));

            // 筛选出相关条目
            const filtered = allEntries.filter(entry =>
                relevantUids.has(entry.uid)
            );

            // 按 PEDSA 的分数排序
            const scoreMap = new Map(pedsaResults.map(r => [r.node_id, r.score]));
            filtered.sort((a, b) => {
                const scoreA = scoreMap.get(a.uid) || 0;
                const scoreB = scoreMap.get(b.uid) || 0;
                return scoreB - scoreA;
            });

            return filtered;
        }
    };

    // 导出模块
    WBAP.PedsaClient = PedsaClient;
    Logger.log?.(TAG, '模块已加载');
})();
