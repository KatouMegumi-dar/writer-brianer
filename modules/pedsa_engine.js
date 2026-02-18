/**
 * PEDSA-JS 引擎 (一阶段)
 * 纯 JavaScript 实现的 PEDSA 核心算法
 * 包含：SimHash、AC自动机、双数据库、能量扩散
 */
(function () {
    'use strict';

    window.WBAP = window.WBAP || {};
    const Logger = WBAP.Logger || console;
    const TAG = '[PEDSA-JS]';

    // ============================================================================
    // 1. SimHash 语义指纹
    // ============================================================================

    const SimHash = {
        MASK_SEMANTIC: 0xFFFFFFFFn,
        MASK_SPATIO_TEMPORAL: 0xFFFF00000000n,
        MASK_AFFECTIVE: 0x00FF000000000000n,
        MASK_TYPE: 0xFF00000000000000n,

        TYPE_UNKNOWN: 0x00,
        TYPE_PERSON: 0x01,
        TYPE_TECH: 0x02,
        TYPE_EVENT: 0x03,
        TYPE_LOCATION: 0x04,
        TYPE_OBJECT: 0x05,

        EMOTION_JOY: 1 << 0,
        EMOTION_SHY: 1 << 1,
        EMOTION_FEAR: 1 << 2,
        EMOTION_SURPRISE: 1 << 3,
        EMOTION_SADNESS: 1 << 4,
        EMOTION_DISGUST: 1 << 5,
        EMOTION_ANGER: 1 << 6,
        EMOTION_ANTICIPATION: 1 << 7,

        // 简单哈希函数
        hash64(str) {
            let h1 = 0xdeadbeef, h2 = 0x41c6ce57;
            for (let i = 0; i < str.length; i++) {
                const ch = str.charCodeAt(i);
                h1 = Math.imul(h1 ^ ch, 2654435761);
                h2 = Math.imul(h2 ^ ch, 1597334677);
            }
            h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
            h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
            return BigInt((h2 >>> 0)) << 32n | BigInt((h1 >>> 0));
        },

        // 计算32位文本哈希
        computeTextHash32(text) {
            const v = new Int32Array(32);
            const tokens = this.tokenize(text);

            for (const token of tokens) {
                const hash = this.hash64(token);
                for (let i = 0; i < 32; i++) {
                    const bit = (hash >> BigInt(i)) & 1n;
                    v[i] += bit === 1n ? 1 : -1;
                }
            }

            let fingerprint = 0;
            for (let i = 0; i < 32; i++) {
                if (v[i] > 0) fingerprint |= (1 << i);
            }
            return fingerprint >>> 0;
        },

        // 分词
        tokenize(text) {
            const tokens = [];
            // 英文单词
            const words = text.match(/[a-zA-Z]+/g) || [];
            tokens.push(...words.map(w => w.toLowerCase()));
            // 中文字符
            for (const char of text) {
                if (/[\u4e00-\u9fa5]/.test(char)) {
                    tokens.push(char);
                }
            }
            return tokens;
        },

        // 计算时空哈希
        computeSpatioTemporalHash(timestamp, location) {
            const combined = `${timestamp}|${location}`;
            const hash = this.hash64(combined);
            return Number(hash & 0xFFFFn);
        },

        // 计算多模态指纹
        computeMultimodal(text, timestamp = 0, location = '', emotion = 0, typeVal = 0) {
            let fp = 0n;

            // 语义区 [0-31]
            const semanticHash = this.computeTextHash32(text);
            fp |= BigInt(semanticHash) & this.MASK_SEMANTIC;

            // 时空区 [32-47]
            if (timestamp > 0 || location) {
                const stHash = this.computeSpatioTemporalHash(timestamp, location);
                fp |= (BigInt(stHash) << 32n) & this.MASK_SPATIO_TEMPORAL;
            }

            // 情感区 [48-55]
            fp |= (BigInt(emotion) << 48n) & this.MASK_AFFECTIVE;

            // 类型区 [56-63]
            fp |= (BigInt(typeVal) << 56n) & this.MASK_TYPE;

            return fp;
        },

        // 从查询中提取特征并计算指纹
        computeForQuery(query) {
            let timestamp = 0;
            let location = '';
            let emotion = 0;
            let typeVal = this.TYPE_UNKNOWN;

            // 时间提取
            if (query.includes('2024')) timestamp = 1704067200;
            if (query.includes('2025')) timestamp = 1735689600;
            if (query.includes('2026')) timestamp = 1767225600;

            // 地点提取
            const locations = { '上海': 'Shanghai', '深圳': 'Shenzhen', '北京': 'Beijing', '杭州': 'Hangzhou' };
            for (const [cn, en] of Object.entries(locations)) {
                if (query.includes(cn)) { location = en; typeVal = this.TYPE_LOCATION; break; }
            }

            // 情感提取
            const emotionKeywords = {
                [this.EMOTION_JOY]: ['开心', '高兴', '欣慰', '快乐', '成功'],
                [this.EMOTION_SHY]: ['害羞', '不好意思', '脸红'],
                [this.EMOTION_FEAR]: ['害怕', '担心', '焦虑'],
                [this.EMOTION_SURPRISE]: ['没想到', '竟然', '惊讶'],
                [this.EMOTION_SADNESS]: ['难过', '低落', '失望', '遗憾'],
                [this.EMOTION_DISGUST]: ['讨厌', '不喜欢'],
                [this.EMOTION_ANGER]: ['生气', '恼火', '不爽'],
                [this.EMOTION_ANTICIPATION]: ['期待', '愿景', '未来', '规划']
            };
            for (const [emo, keywords] of Object.entries(emotionKeywords)) {
                if (keywords.some(kw => query.includes(kw))) {
                    emotion |= parseInt(emo);
                }
            }

            // 类型推断
            if (query.match(/用户|女孩|角色|人物/)) typeVal = this.TYPE_PERSON;
            else if (query.match(/代码|算法|技术|Rust|Python/i)) typeVal = this.TYPE_TECH;
            else if (query.match(/事情|发生|事件/)) typeVal = this.TYPE_EVENT;

            return this.computeMultimodal(query, timestamp, location, emotion, typeVal);
        },

        // 计算相似度
        similarity(a, b, mask = 0xFFFFFFFFFFFFFFFFn) {
            const xor = (a ^ b) & mask;
            let dist = 0;
            let temp = xor;
            while (temp > 0n) {
                dist += Number(temp & 1n);
                temp >>= 1n;
            }
            let totalBits = 0;
            temp = mask;
            while (temp > 0n) {
                totalBits += Number(temp & 1n);
                temp >>= 1n;
            }
            if (totalBits === 0) return 0;
            return 1 - (dist / totalBits);
        }
    };

    // ============================================================================
    // 2. AC 自动机（Aho-Corasick）
    // ============================================================================

    class AhoCorasick {
        constructor() {
            this.goto = [new Map()];
            this.fail = [0];
            this.output = [[]];
            this.patterns = [];
        }

        addPattern(pattern, id) {
            let state = 0;
            for (const char of pattern) {
                if (!this.goto[state].has(char)) {
                    const newState = this.goto.length;
                    this.goto.push(new Map());
                    this.fail.push(0);
                    this.output.push([]);
                    this.goto[state].set(char, newState);
                }
                state = this.goto[state].get(char);
            }
            this.output[state].push({ pattern, id });
            this.patterns.push({ pattern, id });
        }

        build() {
            const queue = [];
            // 初始化深度1的fail指针
            for (const [char, state] of this.goto[0]) {
                this.fail[state] = 0;
                queue.push(state);
            }

            // BFS构建fail指针
            while (queue.length > 0) {
                const r = queue.shift();
                for (const [char, s] of this.goto[r]) {
                    queue.push(s);
                    let state = this.fail[r];
                    while (state !== 0 && !this.goto[state].has(char)) {
                        state = this.fail[state];
                    }
                    this.fail[s] = this.goto[state]?.get(char) || 0;
                    if (this.fail[s] === s) this.fail[s] = 0;
                    // 合并输出
                    this.output[s] = this.output[s].concat(this.output[this.fail[s]]);
                }
            }
        }

        search(text) {
            const results = [];
            let state = 0;

            for (let i = 0; i < text.length; i++) {
                const char = text[i];
                while (state !== 0 && !this.goto[state].has(char)) {
                    state = this.fail[state];
                }
                state = this.goto[state]?.get(char) || 0;

                for (const match of this.output[state]) {
                    results.push({
                        pattern: match.pattern,
                        id: match.id,
                        position: i - match.pattern.length + 1
                    });
                }
            }
            return results;
        }
    }

    // ============================================================================
    // 3. PEDSA 引擎
    // ============================================================================

    class PedsaEngine {
        constructor() {
            this.nodes = new Map();           // 所有节点
            this.memoryGraph = new Map();     // 记忆库边
            this.ontologyGraph = new Map();   // 本体库边
            this.acMatcher = null;            // AC自动机
            this.keywordToNode = new Map();   // 关键词到节点映射
            this.inDegrees = new Map();       // 入度统计
            this.spatioTemporalIndex = new Map(); // 时空索引
            this.affectiveIndex = new Map();  // 情感索引
            this.compiled = false;
        }

        // 添加特征节点
        addFeature(id, keyword) {
            const node = {
                id,
                type: 'feature',
                content: keyword,
                fingerprint: SimHash.computeMultimodal(keyword),
                timestamp: 0,
                prevEvent: null,
                nextEvent: null
            };
            this.nodes.set(id, node);
            this.keywordToNode.set(keyword, id);
        }

        // 添加事件节点
        addEvent(id, content, metadata = {}) {
            const fingerprint = SimHash.computeForQuery(content);
            const timestamp = metadata.timestamp || this.extractTimestamp(content);

            const node = {
                id,
                type: 'event',
                content,
                fingerprint,
                timestamp,
                location: metadata.location || '',
                emotions: metadata.emotions || [],
                prevEvent: null,
                nextEvent: null,
                originalEntry: metadata.originalEntry || null
            };
            this.nodes.set(id, node);

            // 更新索引
            const stHash = Number((fingerprint & SimHash.MASK_SPATIO_TEMPORAL) >> 32n);
            if (stHash !== 0) {
                if (!this.spatioTemporalIndex.has(stHash)) {
                    this.spatioTemporalIndex.set(stHash, []);
                }
                this.spatioTemporalIndex.get(stHash).push(id);
            }

            const emotionHash = Number((fingerprint & SimHash.MASK_AFFECTIVE) >> 48n);
            if (emotionHash !== 0) {
                for (let i = 0; i < 8; i++) {
                    if (emotionHash & (1 << i)) {
                        const key = 1 << i;
                        if (!this.affectiveIndex.has(key)) {
                            this.affectiveIndex.set(key, []);
                        }
                        this.affectiveIndex.get(key).push(id);
                    }
                }
            }
        }

        // 从文本提取时间戳
        extractTimestamp(text) {
            const match = text.match(/(\d{4})年(\d{1,2})月(\d{1,2})日/);
            if (match) {
                const [, year, month, day] = match;
                return new Date(parseInt(year), parseInt(month) - 1, parseInt(day)).getTime() / 1000;
            }
            return 0;
        }

        // 添加记忆库边
        addEdge(src, tgt, weight = 1.0) {
            const quantized = Math.round(Math.min(1, Math.max(0, weight)) * 65535);
            if (!this.memoryGraph.has(src)) {
                this.memoryGraph.set(src, []);
            }
            const edges = this.memoryGraph.get(src);
            const existing = edges.find(e => e.target === tgt);
            if (existing) {
                existing.weight = Math.max(existing.weight, quantized);
            } else {
                edges.push({ target: tgt, weight: quantized });
            }
        }

        // 添加本体库边
        addOntologyEdge(srcWord, tgtWord, weight = 1.0, isEquality = false) {
            const srcId = this.getOrCreateFeature(srcWord);
            const tgtId = this.getOrCreateFeature(tgtWord);
            const quantized = Math.round(Math.min(1, Math.max(0, weight)) * 65535);

            if (!this.ontologyGraph.has(srcId)) {
                this.ontologyGraph.set(srcId, []);
            }
            const edges = this.ontologyGraph.get(srcId);
            if (!edges.find(e => e.target === tgtId)) {
                edges.push({ target: tgtId, weight: quantized });
            }

            if (isEquality) {
                if (!this.ontologyGraph.has(tgtId)) {
                    this.ontologyGraph.set(tgtId, []);
                }
                const revEdges = this.ontologyGraph.get(tgtId);
                if (!revEdges.find(e => e.target === srcId)) {
                    revEdges.push({ target: srcId, weight: quantized });
                }
            }
        }

        // 获取或创建特征节点
        getOrCreateFeature(word) {
            if (this.keywordToNode.has(word)) {
                return this.keywordToNode.get(word);
            }
            const id = this.hashString(word);
            this.addFeature(id, word);
            return id;
        }

        // 字符串哈希
        hashString(str) {
            let hash = 0;
            for (let i = 0; i < str.length; i++) {
                const char = str.charCodeAt(i);
                hash = ((hash << 5) - hash) + char;
                hash = hash & hash;
            }
            return Math.abs(hash);
        }

        // 构建时序脊梁
        buildTemporalBackbone() {
            const events = Array.from(this.nodes.values())
                .filter(n => n.type === 'event')
                .sort((a, b) => a.timestamp - b.timestamp || a.id - b.id);

            for (let i = 0; i < events.length; i++) {
                if (i > 0) events[i].prevEvent = events[i - 1].id;
                if (i < events.length - 1) events[i].nextEvent = events[i + 1].id;
            }
        }

        // 编译引擎
        compile() {
            // 构建AC自动机
            this.acMatcher = new AhoCorasick();
            for (const [keyword, nodeId] of this.keywordToNode) {
                this.acMatcher.addPattern(keyword, nodeId);
            }
            this.acMatcher.build();

            // 计算入度
            this.inDegrees.clear();
            for (const edges of this.memoryGraph.values()) {
                for (const edge of edges) {
                    this.inDegrees.set(edge.target, (this.inDegrees.get(edge.target) || 0) + 1);
                }
            }
            for (const edges of this.ontologyGraph.values()) {
                for (const edge of edges) {
                    this.inDegrees.set(edge.target, (this.inDegrees.get(edge.target) || 0) + 1);
                }
            }

            // 构建时序脊梁
            this.buildTemporalBackbone();

            this.compiled = true;
            Logger.log?.(TAG, `编译完成: ${this.nodes.size} 节点, ${this.keywordToNode.size} 关键词`);
        }

        // 执行检索
        retrieve(query, options = {}) {
            const topK = options.topK || 20;
            const startTime = performance.now();

            if (!this.compiled) {
                Logger.warn?.(TAG, '引擎未编译');
                return { success: false, results: [], stats: {} };
            }

            const queryFp = SimHash.computeForQuery(query);
            const activated = new Map(); // nodeId -> energy

            // Step 1: AC自动机关键词匹配
            const matches = this.acMatcher.search(query);
            for (const match of matches) {
                activated.set(match.id, 1.0);
            }

            // Step 2: 时空共振
            const stHash = Number((queryFp & SimHash.MASK_SPATIO_TEMPORAL) >> 32n);
            if (stHash !== 0 && this.spatioTemporalIndex.has(stHash)) {
                for (const id of this.spatioTemporalIndex.get(stHash)) {
                    const current = activated.get(id) || 0;
                    activated.set(id, Math.max(current, 0.6));
                }
            }

            // Step 3: 情感共振
            const emotionHash = Number((queryFp & SimHash.MASK_AFFECTIVE) >> 48n);
            if (emotionHash !== 0) {
                for (let i = 0; i < 8; i++) {
                    if (emotionHash & (1 << i)) {
                        const key = 1 << i;
                        if (this.affectiveIndex.has(key)) {
                            for (const id of this.affectiveIndex.get(key)) {
                                const current = activated.get(id) || 0;
                                activated.set(id, Math.max(current, 0.7));
                            }
                        }
                    }
                }
            }

            // Step 4: 本体库扩散
            const ontologyExpanded = new Map(activated);
            for (const [nodeId, score] of activated) {
                const edges = this.ontologyGraph.get(nodeId);
                if (!edges) continue;

                for (const edge of edges) {
                    const weight = edge.weight / 65535;
                    const degree = this.inDegrees.get(edge.target) || 1;
                    const inhibition = 1 / (1 + Math.log10(degree));
                    const energy = score * weight * 0.95 * inhibition;

                    if (energy < 0.05) continue;

                    const current = ontologyExpanded.get(edge.target) || 0;
                    ontologyExpanded.set(edge.target, Math.max(current, energy));
                }
            }

            // Step 5: 能量归一化
            let totalEnergy = 0;
            for (const e of ontologyExpanded.values()) totalEnergy += e;
            if (totalEnergy > 10) {
                const factor = 10 / totalEnergy;
                for (const [k, v] of ontologyExpanded) {
                    ontologyExpanded.set(k, v * factor);
                }
            }

            // Step 6: 记忆库扩散
            const finalScores = new Map(ontologyExpanded);
            const decay = 0.85;

            // 取能量最高的种子
            const seeds = Array.from(ontologyExpanded.entries())
                .sort((a, b) => b[1] - a[1])
                .slice(0, 5000);

            for (const [nodeId, score] of seeds) {
                const edges = this.memoryGraph.get(nodeId);
                if (!edges) continue;

                for (const edge of edges) {
                    const weight = edge.weight / 65535;
                    const degree = this.inDegrees.get(edge.target) || 1;
                    const inhibition = 1 / (1 + Math.log10(degree));
                    const energy = score * weight * decay * inhibition;

                    if (energy < 0.01) continue;

                    const current = finalScores.get(edge.target) || 0;
                    finalScores.set(edge.target, current + energy);
                }
            }

            // Step 7: 筛选事件节点并排序
            let results = Array.from(finalScores.entries())
                .filter(([id]) => {
                    const node = this.nodes.get(id);
                    return node && node.type === 'event';
                })
                .sort((a, b) => b[1] - a[1]);

            // Step 8: SimHash 细化（前50个）
            for (let i = 0; i < Math.min(50, results.length); i++) {
                const [id, score] = results[i];
                const node = this.nodes.get(id);
                if (!node) continue;

                let boost = 0;

                // 语义共振
                const semanticSim = SimHash.similarity(queryFp, node.fingerprint, SimHash.MASK_SEMANTIC);
                boost += semanticSim * 0.6;

                // 时空共振
                if ((queryFp & SimHash.MASK_SPATIO_TEMPORAL) !== 0n) {
                    const temporalSim = SimHash.similarity(queryFp, node.fingerprint, SimHash.MASK_SPATIO_TEMPORAL);
                    boost += temporalSim * 0.5;
                }

                // 情感共鸣
                if ((queryFp & SimHash.MASK_AFFECTIVE) !== 0n) {
                    const qEmo = (queryFp & SimHash.MASK_AFFECTIVE) >> 48n;
                    const nEmo = (node.fingerprint & SimHash.MASK_AFFECTIVE) >> 48n;
                    if ((qEmo & nEmo) !== 0n) boost += 0.6;
                }

                // 类型对齐
                if ((queryFp & SimHash.MASK_TYPE) !== 0n) {
                    const typeSim = SimHash.similarity(queryFp, node.fingerprint, SimHash.MASK_TYPE);
                    boost += typeSim * 0.8;
                }

                // 艾宾浩斯衰减
                const currentTime = Date.now() / 1000;
                const tau = 31536000; // 365天
                if (node.timestamp > 0 && node.timestamp < currentTime) {
                    const deltaT = currentTime - node.timestamp;
                    const decayFactor = Math.max(0.8, Math.exp(-deltaT / tau));
                    results[i][1] = score * decayFactor + boost;
                } else {
                    results[i][1] = score + boost;
                }
            }

            // 重新排序
            results.sort((a, b) => b[1] - a[1]);
            results = results.slice(0, topK);

            const elapsed = performance.now() - startTime;

            return {
                success: true,
                results: results.map(([id, score]) => {
                    const node = this.nodes.get(id);
                    return {
                        nodeId: id,
                        score,
                        content: node?.content || '',
                        timestamp: node?.timestamp || 0,
                        originalEntry: node?.originalEntry || null
                    };
                }),
                stats: {
                    retrieveTimeMs: elapsed,
                    activatedKeywords: matches.length,
                    totalResults: results.length
                }
            };
        }

        /**
         * 增强检索 - 接收 EnhancedQuery 对象进行多词检索
         * @param {EnhancedQuery} enhancedQuery - 增强查询对象
         * @param {Object} options - 检索选项
         * @param {number} [options.topK=20] - 返回结果数量
         * @returns {Object} 检索结果
         *
         * Requirements: 3.1, 3.5
         */
        retrieveEnhanced(enhancedQuery, options = {}) {
            const topK = options.topK || 20;
            const startTime = performance.now();

            if (!this.compiled) {
                Logger.warn?.(TAG, '引擎未编译');
                return { success: false, results: [], stats: {} };
            }

            // 处理空 terms 数组的回退逻辑 (Requirement 3.5)
            const terms = enhancedQuery?.terms;
            if (!terms || terms.length === 0) {
                // 回退到使用原始查询
                const originalQuery = enhancedQuery?.originalQuery || '';
                if (!originalQuery) {
                    return { success: true, results: [], stats: { retrieveTimeMs: 0, activatedKeywords: 0, totalResults: 0 } };
                }
                Logger.log?.(TAG, '增强查询为空，回退到原始查询');
                return this.retrieve(originalQuery, options);
            }

            // 获取维度权重
            const dimensionWeights = enhancedQuery.dimensionWeights || {};

            // 执行多词检索
            const { activated, matchCount } = this.multiTermRetrieve(terms);

            // 应用维度权重增强
            this.applyDimensionBoost(activated, dimensionWeights);

            // 本体库扩散
            const ontologyExpanded = new Map(activated);
            for (const [nodeId, score] of activated) {
                const edges = this.ontologyGraph.get(nodeId);
                if (!edges) continue;

                for (const edge of edges) {
                    const weight = edge.weight / 65535;
                    const degree = this.inDegrees.get(edge.target) || 1;
                    const inhibition = 1 / (1 + Math.log10(degree));
                    const energy = score * weight * 0.95 * inhibition;

                    if (energy < 0.05) continue;

                    const current = ontologyExpanded.get(edge.target) || 0;
                    ontologyExpanded.set(edge.target, Math.max(current, energy));
                }
            }

            // 能量归一化
            let totalEnergy = 0;
            for (const e of ontologyExpanded.values()) totalEnergy += e;
            if (totalEnergy > 10) {
                const factor = 10 / totalEnergy;
                for (const [k, v] of ontologyExpanded) {
                    ontologyExpanded.set(k, v * factor);
                }
            }

            // 记忆库扩散
            const finalScores = new Map(ontologyExpanded);
            const decay = 0.85;

            const seeds = Array.from(ontologyExpanded.entries())
                .sort((a, b) => b[1] - a[1])
                .slice(0, 5000);

            for (const [nodeId, score] of seeds) {
                const edges = this.memoryGraph.get(nodeId);
                if (!edges) continue;

                for (const edge of edges) {
                    const weight = edge.weight / 65535;
                    const degree = this.inDegrees.get(edge.target) || 1;
                    const inhibition = 1 / (1 + Math.log10(degree));
                    const energy = score * weight * decay * inhibition;

                    if (energy < 0.01) continue;

                    const current = finalScores.get(edge.target) || 0;
                    finalScores.set(edge.target, current + energy);
                }
            }

            // 筛选事件节点并排序
            let results = Array.from(finalScores.entries())
                .filter(([id]) => {
                    const node = this.nodes.get(id);
                    return node && node.type === 'event';
                })
                .sort((a, b) => b[1] - a[1]);

            // SimHash 细化（前50个），传递维度权重
            for (let i = 0; i < Math.min(50, results.length); i++) {
                const [id, score] = results[i];
                const node = this.nodes.get(id);
                if (!node) continue;

                // 使用原始查询计算指纹
                const queryFp = SimHash.computeForQuery(enhancedQuery.originalQuery || '');
                let boost = 0;

                // 语义共振
                const semanticSim = SimHash.similarity(queryFp, node.fingerprint, SimHash.MASK_SEMANTIC);
                boost += semanticSim * 0.6;

                // 时空共振（根据维度权重调整）
                const temporalWeight = dimensionWeights.temporal || 0;
                if ((queryFp & SimHash.MASK_SPATIO_TEMPORAL) !== 0n || temporalWeight > 0.3) {
                    const temporalSim = SimHash.similarity(queryFp, node.fingerprint, SimHash.MASK_SPATIO_TEMPORAL);
                    const temporalBoost = temporalWeight > 0.5 ? 0.7 : 0.5;
                    boost += temporalSim * temporalBoost;
                }

                // 情感共鸣（根据维度权重调整）
                const emotionalWeight = dimensionWeights.emotional || 0;
                if ((queryFp & SimHash.MASK_AFFECTIVE) !== 0n || emotionalWeight > 0.3) {
                    const qEmo = (queryFp & SimHash.MASK_AFFECTIVE) >> 48n;
                    const nEmo = (node.fingerprint & SimHash.MASK_AFFECTIVE) >> 48n;
                    if ((qEmo & nEmo) !== 0n) {
                        const emotionalBoost = emotionalWeight > 0.5 ? 0.8 : 0.6;
                        boost += emotionalBoost;
                    }
                }

                // 类型对齐（根据角色维度权重调整）
                const characterWeight = dimensionWeights.character || 0;
                if ((queryFp & SimHash.MASK_TYPE) !== 0n || characterWeight > 0.3) {
                    const typeSim = SimHash.similarity(queryFp, node.fingerprint, SimHash.MASK_TYPE);
                    const typeBoost = characterWeight > 0.5 ? 1.0 : 0.8;
                    boost += typeSim * typeBoost;
                }

                // 艾宾浩斯衰减
                const currentTime = Date.now() / 1000;
                const tau = 31536000;
                if (node.timestamp > 0 && node.timestamp < currentTime) {
                    const deltaT = currentTime - node.timestamp;
                    const decayFactor = Math.max(0.8, Math.exp(-deltaT / tau));
                    results[i][1] = score * decayFactor + boost;
                } else {
                    results[i][1] = score + boost;
                }
            }

            // 重新排序并截断
            results.sort((a, b) => b[1] - a[1]);
            results = results.slice(0, topK);

            const elapsed = performance.now() - startTime;

            return {
                success: true,
                results: results.map(([id, score]) => {
                    const node = this.nodes.get(id);
                    return {
                        nodeId: id,
                        score,
                        content: node?.content || '',
                        timestamp: node?.timestamp || 0,
                        originalEntry: node?.originalEntry || null
                    };
                }),
                stats: {
                    retrieveTimeMs: elapsed,
                    activatedKeywords: matchCount,
                    totalResults: results.length,
                    termsUsed: terms.length
                }
            };
        }

        /**
         * 多词检索 - 对每个检索词执行 AC 自动机匹配并累加能量
         * @param {Array<QueryTerm>} terms - 检索词列表
         * @returns {Object} { activated: Map<nodeId, energy>, matchCount: number }
         * 
         * Requirements: 3.2, 3.3, 3.4
         */
        multiTermRetrieve(terms) {
            const activated = new Map(); // nodeId -> 累加能量
            let matchCount = 0;

            for (const queryTerm of terms) {
                const term = queryTerm.term;
                const weight = queryTerm.weight ?? 1.0;

                // 对每个检索词执行 AC 自动机匹配
                const matches = this.acMatcher.search(term);
                matchCount += matches.length;

                // 累加命中条目的能量值（加权累加）
                for (const match of matches) {
                    const nodeId = match.id;
                    const current = activated.get(nodeId) || 0;
                    // 能量累加而非覆盖 (Requirement 3.3)
                    // 根据检索词权重调整能量贡献 (Requirement 3.4)
                    activated.set(nodeId, current + weight);
                }
            }

            return { activated, matchCount };
        }

        /**
         * 应用维度权重增强 - 根据维度权重调整索引检索权重
         * @param {Map<number, number>} activated - 已激活节点的能量映射
         * @param {Object<string, number>} dimensionWeights - 维度权重
         * 
         * Requirements: 4.1, 4.2, 4.3, 4.4
         */
        applyDimensionBoost(activated, dimensionWeights) {
            if (!dimensionWeights || Object.keys(dimensionWeights).length === 0) {
                return;
            }

            const temporalWeight = dimensionWeights.temporal || 0;
            const spatialWeight = dimensionWeights.spatial || 0;
            const emotionalWeight = dimensionWeights.emotional || 0;
            const characterWeight = dimensionWeights.character || 0;

            // Requirement 4.1: 时间维度较高时增强时空索引检索权重
            if (temporalWeight > 0.3 || spatialWeight > 0.3) {
                const stBoost = Math.max(temporalWeight, spatialWeight);
                for (const [stHash, nodeIds] of this.spatioTemporalIndex) {
                    for (const nodeId of nodeIds) {
                        const current = activated.get(nodeId) || 0;
                        // 时空索引命中的节点获得额外能量加成
                        const boost = current > 0 ? stBoost * 0.4 : stBoost * 0.2;
                        activated.set(nodeId, current + boost);
                    }
                }
            }

            // Requirement 4.2: 情感维度较高时增强情感索引检索权重
            if (emotionalWeight > 0.3) {
                for (const [emotionKey, nodeIds] of this.affectiveIndex) {
                    for (const nodeId of nodeIds) {
                        const current = activated.get(nodeId) || 0;
                        // 情感索引命中的节点获得额外能量加成
                        const boost = current > 0 ? emotionalWeight * 0.5 : emotionalWeight * 0.25;
                        activated.set(nodeId, current + boost);
                    }
                }
            }

            // Requirement 4.3: 角色维度较高时优先匹配人物相关条目
            if (characterWeight > 0.3) {
                for (const [nodeId, node] of this.nodes) {
                    if (node.type !== 'event') continue;
                    
                    // 检查节点指纹的类型区是否为人物类型
                    const typeVal = Number((node.fingerprint & SimHash.MASK_TYPE) >> 56n);
                    if (typeVal === SimHash.TYPE_PERSON) {
                        const current = activated.get(nodeId) || 0;
                        const boost = current > 0 ? characterWeight * 0.4 : characterWeight * 0.2;
                        activated.set(nodeId, current + boost);
                    }
                }
            }
        }

        // 清空引擎
        clear() {
            this.nodes.clear();
            this.memoryGraph.clear();
            this.ontologyGraph.clear();
            this.keywordToNode.clear();
            this.inDegrees.clear();
            this.spatioTemporalIndex.clear();
            this.affectiveIndex.clear();
            this.acMatcher = null;
            this.compiled = false;
        }

        // 获取统计信息
        getStats() {
            return {
                totalNodes: this.nodes.size,
                eventNodes: Array.from(this.nodes.values()).filter(n => n.type === 'event').length,
                featureNodes: Array.from(this.nodes.values()).filter(n => n.type === 'feature').length,
                memoryEdges: Array.from(this.memoryGraph.values()).reduce((sum, e) => sum + e.length, 0),
                ontologyEdges: Array.from(this.ontologyGraph.values()).reduce((sum, e) => sum + e.length, 0),
                compiled: this.compiled
            };
        }
    }

    // ============================================================================
    // 4. 导出
    // ============================================================================

    WBAP.PedsaEngine = PedsaEngine;
    WBAP.SimHash = SimHash;
    WBAP.AhoCorasick = AhoCorasick;

    Logger.log?.(TAG, '模块已加载');
})();
