/**
 * PEDSA WASM 适配器 - 替代 pedsa_client.js
 * 使用 Megumi-Kato 的 WASM PedsaEngine 实现二阶段预检索
 * 无需外部 Rust 服务，完全在浏览器内运行
 */
(function () {
    'use strict';

    window.WBAP = window.WBAP || {};
    const Logger = WBAP.Logger || console;
    const TAG = '[PedsaWasmAdapter]';

    // 情感常量（与 WASM 引擎对应）
    const EMOTION = {
        JOY: 1 << 0,          // 喜悦
        SHY: 1 << 1,          // 害羞
        FEAR: 1 << 2,         // 害怕
        SURPRISE: 1 << 3,     // 惊讶
        SADNESS: 1 << 4,      // 难过
        DISGUST: 1 << 5,      // 讨厌
        ANGER: 1 << 6,        // 生气
        ANTICIPATION: 1 << 7  // 期待
    };

    const PedsaWasmAdapter = {
        // 状态
        isAvailable: false,
        _engine: null,
        _wasmModule: null,
        _synced: false,
        _cacheKey: null,

        /**
         * 初始化适配器，加载 WASM 模块
         */
        async init() {
            Logger.log?.(TAG, '初始化 PEDSA WASM 适配器...');

            try {
                // 动态导入 WASM 模块
                const wasmPath = this._resolveWasmPath();
                this._wasmModule = await import(wasmPath);
                
                // 初始化 WASM
                await this._wasmModule.default();
                
                // 创建引擎实例
                this._engine = new this._wasmModule.PedsaEngine();
                this.isAvailable = true;
                
                Logger.log?.(TAG, `✅ WASM 引擎初始化成功，版本: ${this._wasmModule.version()}`);
            } catch (e) {
                this.isAvailable = false;
                Logger.warn?.(TAG, '⚠️ WASM 加载失败，将使用降级模式:', e.message);
            }
        },

        /**
         * 解析 WASM 模块路径
         */
        _resolveWasmPath() {
            // 使用 index.js 中探测到的模块基路径
            if (WBAP.MODULE_BASE_PATH) {
                return WBAP.MODULE_BASE_PATH + 'wasm/pedsa_wasm.js';
            }
            // fallback: 从已加载的 script 标签推断
            const scripts = document.getElementsByTagName('script');
            for (let i = 0; i < scripts.length; i++) {
                const src = scripts[i].src || '';
                if (src.includes('pedsa_wasm_adapter')) {
                    return src.replace('pedsa_wasm_adapter.js', 'wasm/pedsa_wasm.js');
                }
            }
            return './modules/wasm/pedsa_wasm.js';
        },

        /**
         * 同步世界书数据到 WASM 引擎
         * @param {Array} worldbooks - 世界书数组 [{name, entries}]
         * @param {Array} ontology - 本体边数组
         */
        async sync(worldbooks, ontology = []) {
            if (!this.isAvailable || !this._engine) {
                Logger.warn?.(TAG, '引擎不可用，跳过同步');
                return { success: false, reason: 'engine_unavailable' };
            }

            // 计算缓存签名
            const allEntries = worldbooks.flatMap(wb => wb.entries || []);
            const newCacheKey = this._computeEntriesSignature(allEntries);

            // 检查是否需要重建
            if (this._synced && this._cacheKey === newCacheKey) {
                Logger.log?.(TAG, '数据未变化，跳过重建');
                return { success: true, cached: true };
            }

            Logger.log?.(TAG, `同步数据: ${worldbooks.length} 个世界书, ${allEntries.length} 条目`);
            const startTime = performance.now();

            try {
                // 重建引擎
                this._engine.free();
                this._engine = new this._wasmModule.PedsaEngine();

                let nodesAdded = 0;
                let edgesAdded = 0;
                let featureIdCounter = 1000000n; // 特征节点 ID 起始值

                // 处理每个世界书
                for (const worldbook of worldbooks) {
                    const entries = worldbook.entries || [];
                    
                    for (const entry of entries) {
                        const uid = BigInt(entry.uid || 0);
                        const content = entry.content || '';
                        const timestamp = BigInt(entry.timestamp || this._extractTimestamp(content));
                        const emotions = entry.emotions 
                            ? this._emotionsArrayToBitmask(entry.emotions)
                            : this._extractEmotions(content);

                        // 添加事件节点
                        this._engine.add_event(uid, content, timestamp, emotions);
                        nodesAdded++;

                        // 提取关键词并添加特征节点和边
                        const keywords = this._extractKeywords(entry);
                        for (const keyword of keywords) {
                            const featureId = featureIdCounter++;
                            this._engine.add_feature(featureId, keyword);
                            this._engine.add_edge(featureId, uid, 0.8);
                            nodesAdded++;
                            edgesAdded++;
                        }
                    }
                }

                // 添加本体边
                for (const edge of ontology) {
                    this._engine.add_ontology_edge(
                        edge.src,
                        edge.tgt,
                        edge.weight || 0.9,
                        edge.is_equality || false
                    );
                    edgesAdded++;
                }

                // 编译引擎
                this._engine.compile();
                this._engine.build_temporal_backbone();

                this._synced = true;
                this._cacheKey = newCacheKey;

                const elapsed = performance.now() - startTime;
                Logger.log?.(TAG, `同步完成: +${nodesAdded} 节点, +${edgesAdded} 边, 耗时 ${elapsed.toFixed(2)}ms`);

                return {
                    success: true,
                    stats: {
                        nodes_added: nodesAdded,
                        edges_added: edgesAdded,
                        compile_time_ms: elapsed
                    }
                };
            } catch (e) {
                Logger.error?.(TAG, '同步失败:', e);
                this._synced = false;
                return { success: false, reason: e.message };
            }
        },

        /**
         * 执行检索
         * @param {string} query - 查询字符串
         * @param {Object} options - 检索选项
         */
        async retrieve(query, options = {}) {
            if (!this.isAvailable || !this._engine) {
                return { success: false, reason: 'engine_unavailable', results: [] };
            }

            if (!this._synced) {
                return { success: false, reason: 'not_synced', results: [] };
            }

            const topK = options.top_k || 20;
            const startTime = performance.now();

            try {
                // 调用 WASM 引擎检索
                const resultJson = this._engine.retrieve(query, topK);
                const rawResults = JSON.parse(resultJson);

                // 转换为 PedsaClient 兼容格式
                const results = rawResults.map(r => ({
                    node_id: Number(r.id),
                    score: r.score,
                    content: r.content,
                    timestamp: Number(r.timestamp),
                    emotions: r.emotions
                }));

                const elapsed = performance.now() - startTime;
                Logger.log?.(TAG, `检索完成: ${results.length} 个结果, 耗时 ${elapsed.toFixed(2)}ms`);

                return {
                    success: true,
                    results,
                    stats: {
                        retrieve_time_ms: elapsed,
                        total_nodes: this._engine.node_count()
                    }
                };
            } catch (e) {
                Logger.warn?.(TAG, '检索失败:', e.message);
                return { success: false, reason: e.message, results: [] };
            }
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

            // 创建 PEDSA 结果的 UID 到分数映射
            const scoreMap = new Map(pedsaResults.map(r => [r.node_id, r.score]));
            const relevantUids = new Set(pedsaResults.map(r => r.node_id));

            // 筛选出相关条目
            const filtered = allEntries.filter(entry =>
                relevantUids.has(entry.uid)
            );

            // 按 PEDSA 的分数排序
            filtered.sort((a, b) => {
                const scoreA = scoreMap.get(a.uid) || 0;
                const scoreB = scoreMap.get(b.uid) || 0;
                return scoreB - scoreA;
            });

            // 如果筛选结果太少，补充一些原始条目
            if (filtered.length < 5 && allEntries.length > filtered.length) {
                const existingUids = new Set(filtered.map(e => e.uid));
                const additional = allEntries
                    .filter(e => !existingUids.has(e.uid))
                    .slice(0, 5 - filtered.length);
                filtered.push(...additional);
            }

            return filtered;
        },

        /**
         * 将世界书条目转换为 PEDSA 格式
         * @param {Array} entries - 世界书条目
         * @param {string} bookName - 世界书名称
         */
        convertEntriesToPedsaFormat(entries, bookName) {
            return entries.map(entry => {
                const content = entry.content || '';
                return {
                    uid: entry.uid,
                    key: Array.isArray(entry.key) ? entry.key : [entry.key || ''],
                    comment: entry.comment || '',
                    content: content,
                    timestamp: this._extractTimestamp(content),
                    location: this._extractLocation(content),
                    emotions: this._extractEmotionsArray(content),
                    entry_type: this._inferType(entry)
                };
            });
        },

        // ==================== 内部辅助方法 ====================

        /**
         * 从文本中提取时间戳
         */
        _extractTimestamp(text) {
            if (!text) return 0;
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
        _extractLocation(text) {
            if (!text) return '';
            const locations = ['上海', '北京', '深圳', '杭州', '广州', '成都', '武汉', '南京', '徐家汇', '张江', '滨江'];
            for (const loc of locations) {
                if (text.includes(loc)) {
                    return loc;
                }
            }
            return '';
        },

        /**
         * 从文本中提取情感（返回数组）
         */
        _extractEmotionsArray(text) {
            if (!text) return [];
            const emotionMap = {
                joy: ['开心', '高兴', '欣慰', '快乐', '愉快', '幸福'],
                shy: ['害羞', '不好意思', '脸红'],
                fear: ['害怕', '担心', '焦虑', '恐惧'],
                surprise: ['惊讶', '没想到', '竟然', '意外'],
                sadness: ['难过', '伤心', '失望', '遗憾', '悲伤'],
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
         * 从文本中提取情感（返回 bitmask）
         */
        _extractEmotions(text) {
            if (!text) return 0;
            let bitmask = 0;

            const emotionKeywords = {
                [EMOTION.JOY]: ['开心', '高兴', '欣慰', '快乐', '愉快', '幸福'],
                [EMOTION.SHY]: ['害羞', '不好意思', '脸红'],
                [EMOTION.FEAR]: ['害怕', '担心', '焦虑', '恐惧'],
                [EMOTION.SURPRISE]: ['惊讶', '没想到', '竟然', '意外'],
                [EMOTION.SADNESS]: ['难过', '伤心', '失望', '遗憾', '悲伤'],
                [EMOTION.DISGUST]: ['讨厌', '不喜欢', '厌恶'],
                [EMOTION.ANGER]: ['生气', '愤怒', '恼火', '不爽'],
                [EMOTION.ANTICIPATION]: ['期待', '期望', '愿景', '规划']
            };

            for (const [bit, keywords] of Object.entries(emotionKeywords)) {
                if (keywords.some(kw => text.includes(kw))) {
                    bitmask |= parseInt(bit);
                }
            }

            return bitmask;
        },

        /**
         * 将情感数组转换为 bitmask
         */
        _emotionsArrayToBitmask(emotions) {
            if (!Array.isArray(emotions)) return 0;
            let bitmask = 0;
            const emotionToBit = {
                joy: EMOTION.JOY,
                shy: EMOTION.SHY,
                fear: EMOTION.FEAR,
                surprise: EMOTION.SURPRISE,
                sadness: EMOTION.SADNESS,
                disgust: EMOTION.DISGUST,
                anger: EMOTION.ANGER,
                anticipation: EMOTION.ANTICIPATION
            };
            for (const emotion of emotions) {
                if (emotionToBit[emotion]) {
                    bitmask |= emotionToBit[emotion];
                }
            }
            return bitmask;
        },

        /**
         * 从条目中提取关键词
         */
        _extractKeywords(entry) {
            const keywords = [];

            // 从 key 字段提取
            if (entry.key) {
                const keyStr = Array.isArray(entry.key) ? entry.key.join(',') : entry.key;
                keywords.push(...keyStr.split(/[,，、\s]+/).filter(k => k.length >= 2));
            }

            // 从 comment 提取中文词汇
            if (entry.comment) {
                const chineseWords = entry.comment.match(/[\u4e00-\u9fa5]{2,4}/g) || [];
                keywords.push(...chineseWords);
            }

            // 去重并限制数量
            return [...new Set(keywords)].slice(0, 10);
        },

        /**
         * 推断条目类型
         */
        _inferType(entry) {
            const combined = ((entry.comment || '') + ' ' + (entry.content || '')).toLowerCase();

            if (/角色|人物|character/.test(combined)) return 'character';
            if (/地点|位置|location/.test(combined)) return 'location';
            if (/事件|历史|event/.test(combined)) return 'event';
            if (/物品|道具|item/.test(combined)) return 'item';
            if (/概念|规则|concept/.test(combined)) return 'concept';

            return 'lore';
        },

        /**
         * 计算条目签名（用于缓存失效检测）
         */
        _computeEntriesSignature(entries) {
            if (!Array.isArray(entries) || entries.length === 0) return '0';

            // FNV-1a 32-bit
            let hash = 0x811c9dc5;
            const fnv1a = (str) => {
                for (let i = 0; i < str.length; i++) {
                    hash ^= str.charCodeAt(i);
                    hash = Math.imul(hash, 0x01000193);
                }
            };

            const maxItems = Math.min(entries.length, 300);
            for (let i = 0; i < maxItems; i++) {
                const e = entries[i] || {};
                fnv1a(String(e.uid ?? ''));
                fnv1a('|');
                fnv1a(String(e.comment ?? ''));
                fnv1a('|');
                fnv1a(String(e.content ?? '').slice(0, 120));
                fnv1a('\n');
            }

            return `${entries.length}:${(hash >>> 0).toString(16)}`;
        },

        /**
         * Ping 引擎，测量延迟（类似 WiFi 延迟检测）
         * 执行一次最小化检索操作并返回耗时
         * @returns {Promise<{latency: number, ok: boolean}>}
         */
        async ping() {
            if (!this.isAvailable || !this._engine) {
                return { latency: -1, ok: false };
            }
            try {
                const start = performance.now();
                // 最小化检索：单字符查询，top_k=1
                this._engine.retrieve('_', 1);
                const latency = performance.now() - start;
                return { latency, ok: true };
            } catch (e) {
                return { latency: -1, ok: false };
            }
        },

        /**
         * 获取引擎统计信息
         */
        getStats() {
            if (!this._engine) return null;
            return {
                node_count: this._engine.node_count(),
                edge_count: this._engine.edge_count(),
                synced: this._synced
            };
        },

        /**
         * 清除缓存，强制下次重建
         */
        invalidateCache() {
            this._synced = false;
            this._cacheKey = null;
            Logger.log?.(TAG, '缓存已失效');
        }
    };

    // 导出模块
    WBAP.PedsaWasmAdapter = PedsaWasmAdapter;
    Logger.log?.(TAG, '模块已加载');
})();
