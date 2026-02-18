/**
 * Function Calling 模块
 * 为 Super Memory 提供 AI 函数调用支持
 * 使 AI 代理能够自主调用 PEDSA 检索引擎
 */
(function () {
    'use strict';

    window.WBAP = window.WBAP || {};
    const Logger = WBAP.Logger || console;
    const TAG = '[FunctionCalling]';

    /**
     * 检查字符串是否为空或仅包含空白字符（包括所有 Unicode 空白字符）
     * @param {string} str - 要检查的字符串
     * @returns {boolean} - 如果字符串为空或仅包含空白字符则返回 true
     */
    function isEmptyOrWhitespace(str) {
        if (!str || typeof str !== 'string') {
            return true;
        }
        // 使用正则表达式匹配所有 Unicode 空白字符
        // \s 匹配基本空白字符
        // 额外匹配 Unicode 空白字符：
        // \u00A0 - 不间断空格
        // \u2000-\u200A - 各种宽度空格
        // \u200B - 零宽空格
        // \u202F - 窄不间断空格
        // \u205F - 中等数学空格
        // \u3000 - 全角空格
        // \uFEFF - 零宽不间断空格 (BOM)
        const whitespaceRegex = /^[\s\u00A0\u2000-\u200B\u202F\u205F\u3000\uFEFF]*$/;
        return whitespaceRegex.test(str);
    }

    /**
     * 获取 PEDSA 检索工具定义
     * 返回 OpenAI 兼容的工具定义对象
     * @returns {Object} OpenAI-compatible tool definition
     */
    function getPedsaToolDefinition() {
        return {
            type: "function",
            function: {
                name: "pedsa_retrieve",
                description: "Search the worldbook knowledge base using semantic retrieval. Use this to find relevant character information, events, locations, or lore entries.",
                parameters: {
                    type: "object",
                    properties: {
                        query: {
                            type: "string",
                            description: "The search query to find relevant worldbook entries"
                        },
                        top_k: {
                            type: "integer",
                            description: "Maximum number of results to return (default: 10)",
                            default: 10
                        }
                    },
                    required: ["query"]
                }
            }
        };
    }

    /**
     * 获取图谱检索工具定义
     * 返回 OpenAI 兼容的工具定义对象
     * @returns {Object} OpenAI-compatible tool definition
     */
    function getGraphToolDefinition() {
        return {
            type: "function",
            function: {
                name: "graph_retrieve",
                description: "Search the knowledge graph built from dialogue context. Returns entities, relationships, and state information accumulated from conversations.",
                parameters: {
                    type: "object",
                    properties: {
                        query: {
                            type: "string",
                            description: "The search query to find relevant entities and relationships in the knowledge graph"
                        },
                        top_k: {
                            type: "integer",
                            description: "Maximum number of results to return (default: 10)",
                            default: 10
                        }
                    },
                    required: ["query"]
                }
            }
        };
    }

    /**
     * 执行 PEDSA 检索工具调用
     * @param {Object} toolCall - 解析后的工具调用对象
     * @param {string} toolCall.name - 工具名称
     * @param {Object} toolCall.arguments - 工具参数
     * @param {string} toolCall.arguments.query - 搜索查询
     * @param {number} [toolCall.arguments.top_k=10] - 返回结果数量
     * @param {Array} worldbookEntries - 可用的世界书条目
     * @returns {Promise<Object>} - 执行结果 { success: boolean, results?: Array, error?: string }
     */
    async function executePedsaRetrieve(toolCall, worldbookEntries) {
        const args = toolCall?.arguments || toolCall || {};
        const { query, top_k = 10 } = args;

        // 验证查询参数：拒绝空或纯空白字符串（包括所有 Unicode 空白字符）
        if (isEmptyOrWhitespace(query)) {
            Logger.warn?.(TAG, '无效查询：空或纯空白字符串');
            return { success: false, error: 'Invalid query: empty or whitespace-only' };
        }

        // 检查世界书条目
        if (!worldbookEntries || !Array.isArray(worldbookEntries) || worldbookEntries.length === 0) {
            Logger.warn?.(TAG, '无可用的世界书条目');
            return { success: false, error: 'No worldbook entries available' };
        }

        // 尝试使用 PEDSA-JS 引擎（一阶段，优先）
        if (WBAP.PedsaEngine) {
            try {
                Logger.log?.(TAG, `使用 PEDSA-JS 执行检索: "${query.slice(0, 50)}..."`);
                const result = await pedsaJsRetrieve(query, worldbookEntries, top_k);
                if (result.success) {
                    return result;
                }
                // PEDSA-JS 失败，尝试 WASM 回退
                Logger.warn?.(TAG, 'PEDSA-JS 检索失败，尝试 WASM 回退');
            } catch (e) {
                Logger.warn?.(TAG, 'PEDSA-JS 检索异常:', e.message);
            }
        }

        // 尝试使用 PEDSA-WASM 引擎（二阶段，回退）
        if (WBAP.PedsaWasmAdapter?.isAvailable) {
            try {
                Logger.log?.(TAG, `使用 PEDSA-WASM 执行检索: "${query.slice(0, 50)}..."`);
                
                // 确保 WASM 引擎已同步数据
                if (!WBAP.PedsaWasmAdapter._synced) {
                    Logger.log?.(TAG, '同步世界书数据到 PEDSA-WASM...');
                    const worldbooks = [{
                        name: 'default',
                        entries: WBAP.PedsaWasmAdapter.convertEntriesToPedsaFormat(worldbookEntries, 'default')
                    }];
                    await WBAP.PedsaWasmAdapter.sync(worldbooks, []);
                }

                const wasmResult = await WBAP.PedsaWasmAdapter.retrieve(query, { top_k });
                if (wasmResult.success) {
                    return {
                        success: true,
                        results: wasmResult.results
                    };
                }
                Logger.warn?.(TAG, 'PEDSA-WASM 检索失败:', wasmResult.reason);
            } catch (e) {
                Logger.warn?.(TAG, 'PEDSA-WASM 检索异常:', e.message);
            }
        }

        // 两个引擎都不可用
        Logger.warn?.(TAG, 'PEDSA 引擎不可用');
        return { success: false, error: 'PEDSA engine unavailable' };
    }

    /**
     * 执行图谱检索工具调用
     * @param {Object} toolCall - 解析后的工具调用对象
     * @param {Object} toolCall.arguments - 工具参数
     * @param {string} toolCall.arguments.query - 搜索查询
     * @param {number} [toolCall.arguments.top_k=10] - 返回结果数量
     * @returns {Promise<Object>} - 执行结果 { success: boolean, results?: Array, message?: string, error?: string }
     */
    async function executeGraphRetrieve(toolCall) {
        const args = toolCall?.arguments || toolCall || {};
        const { query, top_k = 10 } = args;

        if (isEmptyOrWhitespace(query)) {
            return { success: false, error: 'Invalid query: empty or whitespace-only' };
        }

        if (!WBAP.MultiDimGraph || WBAP.MultiDimGraph.nodes.size === 0) {
            return { success: true, results: [], message: 'Knowledge graph is empty. It will be populated as the conversation progresses.' };
        }

        try {
            const result = await WBAP.MultiDimGraph.smartRetrieve(query, '', { topK: top_k });
            const nodes = result?.nodes || (Array.isArray(result) ? result : []);
            return { success: true, results: nodes };
        } catch (e) {
            return { success: false, error: e.message };
        }
    }

    /**
     * 使用 PEDSA-JS 引擎执行检索
     * @param {string} query - 搜索查询
     * @param {Array} entries - 世界书条目
     * @param {number} topK - 返回结果数量
     * @returns {Promise<Object>} - 检索结果
     */
    async function pedsaJsRetrieve(query, entries, topK) {
        if (!WBAP.PedsaEngine) {
            return { success: false, error: 'PEDSA-JS engine not available' };
        }

        try {
            // 创建临时引擎实例
            const engine = new WBAP.PedsaEngine();

            // 添加所有条目作为事件节点
            for (let i = 0; i < entries.length; i++) {
                const entry = entries[i];
                const content = `${entry.comment || ''} ${entry.key || ''} ${entry.content || ''}`;
                engine.addEvent(entry.uid || i, content, {
                    timestamp: extractTimestamp(entry),
                    location: extractLocation(entry),
                    emotions: extractEmotions(entry),
                    originalEntry: entry
                });

                // 提取关键词作为特征节点并建立边
                const keywords = extractKeywords(entry);
                for (const keyword of keywords) {
                    const featureId = engine.getOrCreateFeature(keyword);
                    engine.addEdge(featureId, entry.uid || i, 0.8);
                }
            }

            // 编译引擎
            engine.compile();

            // 执行检索
            const result = engine.retrieve(query, { topK });

            return {
                success: true,
                results: result.results || []
            };
        } catch (e) {
            Logger.warn?.(TAG, 'PEDSA-JS 检索内部错误:', e.message);
            return { success: false, error: e.message };
        }
    }

    /**
     * 从条目中提取时间戳
     */
    function extractTimestamp(entry) {
        const text = `${entry.comment || ''} ${entry.content || ''}`;
        const match = text.match(/(\d{4})年(\d{1,2})月(\d{1,2})日/);
        if (match) {
            const [, year, month, day] = match;
            return new Date(parseInt(year), parseInt(month) - 1, parseInt(day)).getTime() / 1000;
        }
        return 0;
    }

    /**
     * 从条目中提取地点
     */
    function extractLocation(entry) {
        const text = `${entry.comment || ''} ${entry.content || ''}`;
        const locations = ['上海', '深圳', '北京', '杭州', '广州', '成都', '武汉', '南京'];
        for (const loc of locations) {
            if (text.includes(loc)) return loc;
        }
        return '';
    }

    /**
     * 从条目中提取情感
     */
    function extractEmotions(entry) {
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
    }

    /**
     * 从条目中提取关键词
     */
    function extractKeywords(entry) {
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
    }

    /**
     * 格式化 PEDSA 检索结果供 AI 消费
     * @param {Array} results - PEDSA 检索结果数组
     * @param {Array} entries - 原始世界书条目（用于内容查找）
     * @param {number} [maxLength=4000] - 最大总长度
     * @returns {string} - 格式化的结果字符串
     */
    function formatToolResults(results, entries, maxLength = 4000) {
        // 处理空结果情况
        if (!results || results.length === 0) {
            return 'No matching entries found for this query.';
        }

        // 创建条目映射以便快速查找
        const entryMap = new Map();
        if (entries && Array.isArray(entries)) {
            for (const entry of entries) {
                // 支持 uid 和 node_id 两种格式
                if (entry.uid !== undefined) {
                    entryMap.set(entry.uid, entry);
                }
            }
        }

        const header = `Found ${results.length} relevant entries:\n\n`;
        // 如果 header 本身就超出 maxLength，直接截断返回
        if (header.length >= maxLength) {
            return header.slice(0, maxLength);
        }

        let output = header;
        let currentLength = output.length;

        for (let i = 0; i < results.length; i++) {
            const result = results[i];
            // 支持 nodeId 和 node_id 两种格式（PEDSA-JS 使用 nodeId，PEDSA-WASM 使用 node_id）
            const nodeId = result.nodeId !== undefined ? result.nodeId : result.node_id;
            const entry = entryMap.get(nodeId);

            // 如果找不到对应条目，尝试使用结果中的内容
            let comment = '';
            let key = '';
            let content = '';

            if (entry) {
                comment = entry.comment || entry.key || '';
                key = Array.isArray(entry.key) ? entry.key.join(', ') : (entry.key || '');
                content = entry.content || '';
            } else {
                // 使用结果中的内容作为后备
                comment = result.comment || result.key || `Entry ${nodeId}`;
                key = result.key || '';
                content = result.content || '';
            }

            // 截取内容片段（前500字符）
            const snippet = content.slice(0, 500);
            const truncatedIndicator = content.length > 500 ? '...' : '';

            // 获取分数，确保格式正确
            const score = typeof result.score === 'number' ? result.score.toFixed(2) : '0.00';

            // 格式化单个结果
            const formatted = `【${comment}】(score: ${score})\n` +
                            `Keywords: ${key}\n` +
                            `${snippet}${truncatedIndicator}\n\n`;

            // 检查是否会超出最大长度（预留截断消息的空间）
            const remaining = results.length - i;
            const truncationMsg = `... (${remaining} more results truncated)`;
            if (currentLength + formatted.length > maxLength) {
                // 只有在还有剩余结果时才添加截断消息，且不能超出 maxLength
                if (currentLength + truncationMsg.length <= maxLength) {
                    output += truncationMsg;
                }
                break;
            }

            output += formatted;
            currentLength += formatted.length;
        }

        // 最终安全截断，确保绝不超出 maxLength
        if (output.length > maxLength) {
            output = output.slice(0, maxLength);
        }

        return output;
    }

    /**
     * 格式化图谱检索结果供 AI 消费
     * @param {Array} results - 图谱节点数组
     * @param {number} [maxLength=4000] - 最大总长度
     * @returns {string} - 格式化的结果字符串
     */
    function formatGraphResults(results, maxLength = 4000) {
        if (!results || results.length === 0) {
            return 'Knowledge graph is empty or no matching entities found.';
        }

        const header = `Found ${results.length} relevant entities in knowledge graph:\n\n`;
        let output = header;

        for (let i = 0; i < results.length; i++) {
            const node = results[i];
            const entry = `【${node.label}】(type: ${node.type || 'unknown'}, energy: ${((node.energy || 0) * 100).toFixed(0)}%)\n` +
                (node.content ? `${node.content.slice(0, 300)}${node.content.length > 300 ? '...' : ''}\n` : '') +
                (node.emotionalState ? `Emotional: ${node.emotionalState}\n` : '') +
                (node.spatialInfo ? `Location: ${node.spatialInfo.join(', ')}\n` : '') +
                (node.stateHistory?.length ? `Recent changes: ${node.stateHistory.slice(-2).map(s => `${s.attribute}: ${s.oldValue} → ${s.newValue}`).join('; ')}\n` : '') +
                '\n';

            if (output.length + entry.length > maxLength) {
                output += `... (${results.length - i} more entities truncated)`;
                break;
            }
            output += entry;
        }

        if (output.length > maxLength) {
            output = output.slice(0, maxLength);
        }

        return output;
    }

    /**
     * 解析 AI API 响应，提取内容和工具调用
     * @param {Object} data - 原始 API 响应数据
     * @returns {Object} - 解析后的响应 { content: string, tool_calls: Array|null }
     */
    function parseAIResponse(data) {
        const choice = data?.choices?.[0];
        if (!choice) {
            Logger.warn?.(TAG, 'Unexpected response format: no choices');
            return { content: '', tool_calls: null };
        }

        const message = choice.message;
        if (!message) {
            Logger.warn?.(TAG, 'Unexpected response format: no message in choice');
            return { content: '', tool_calls: null };
        }

        let toolCalls = null;
        if (message.tool_calls && Array.isArray(message.tool_calls) && message.tool_calls.length > 0) {
            toolCalls = [];
            for (const tc of message.tool_calls) {
                try {
                    const parsedArgs = typeof tc.function?.arguments === 'string'
                        ? JSON.parse(tc.function.arguments)
                        : (tc.function?.arguments || {});
                    toolCalls.push({
                        id: tc.id,
                        name: tc.function?.name || '',
                        arguments: parsedArgs
                    });
                } catch (e) {
                    Logger.warn?.(TAG, 'Failed to parse tool call arguments:', tc.function?.arguments);
                    toolCalls.push({
                        id: tc.id,
                        name: tc.function?.name || '',
                        arguments: {}
                    });
                }
            }
        }

        return {
            content: message.content || '',
            tool_calls: toolCalls
        };
    }

    /**
     * 从 agentConfig 解析 API 连接配置
     * 优先使用 agent 独立 API 配置（apiUrl + apiKey），否则回退到 endpoint 或默认
     * @param {Object} agentConfig - Agent 配置对象
     * @returns {Object|null} - API 配置 { apiUrl, apiKey, model }
     */
    function getApiConfig(agentConfig) {
        // 优先使用 agent 独立 API 配置
        if (agentConfig?.apiUrl && agentConfig?.apiKey) {
            return {
                apiUrl: agentConfig.apiUrl,
                apiKey: agentConfig.apiKey,
                model: agentConfig.model || null
            };
        }

        // 回退：尝试通过 endpointId 查找
        let apiConfig = null;
        if (agentConfig?.endpointId) {
            const endpoints = WBAP.getGlobalPools?.()?.selectiveMode?.apiEndpoints || [];
            apiConfig = endpoints.find(ep => ep.id === agentConfig.endpointId);
        }

        // 回退到第一个可用端点
        if (!apiConfig) {
            const endpoints = WBAP.getGlobalPools?.()?.selectiveMode?.apiEndpoints || [];
            apiConfig = endpoints.find(ep => ep.enabled !== false);
        }

        if (!apiConfig) return null;

        return {
            apiUrl: apiConfig.apiUrl || apiConfig.url,
            apiKey: apiConfig.apiKey || apiConfig.key,
            model: agentConfig?.model || apiConfig.model
        };
    }

    /**
     * 调用 AI API（支持工具/函数调用）
     * 构建包含 tools 和 tool_choice 的 OpenAI 兼容请求
     * @param {Object} agentConfig - Agent 配置（含 model、endpointId 等）
     * @param {Array} messages - 对话消息数组
     * @param {Array} tools - 工具定义数组
     * @param {Object} [options={}] - 额外选项 { tool_choice, temperature, max_tokens, timeout }
     * @returns {Promise<Object>} - 解析后的 AI 响应 { content, tool_calls }
     */
    async function callAIWithTools(agentConfig, messages, tools, options = {}) {
        const resolved = getApiConfig(agentConfig);
        if (!resolved) {
            throw new Error('No API endpoint available');
        }

        const model = agentConfig?.model || resolved.model;
        if (!model) {
            throw new Error('No model specified');
        }

        const payload = {
            model: model,
            messages: messages,
            temperature: options.temperature ?? 0.3,
            max_tokens: options.max_tokens ?? 1000
        };

        // 仅在有工具时添加 tools 和 tool_choice
        if (tools && Array.isArray(tools) && tools.length > 0) {
            payload.tools = tools;
            payload.tool_choice = options.tool_choice || 'auto';
        }

        const timeoutMs = (options.timeout || 60) * 1000;

        Logger.log?.(TAG, `Calling AI: model=${model}, messages=${messages.length}, tools=${tools?.length || 0}`);

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

        try {
            const response = await fetch(resolved.apiUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${resolved.apiKey}`
                },
                body: JSON.stringify(payload),
                signal: controller.signal
            });

            clearTimeout(timeoutId);

            if (!response.ok) {
                const errorText = await response.text().catch(() => '');
                throw new Error(`API request failed: ${response.status} ${response.statusText} ${errorText}`);
            }

            const data = await response.json();
            return parseAIResponse(data);
        } catch (e) {
            clearTimeout(timeoutId);
            if (e.name === 'AbortError') {
                throw new Error(`API request timed out after ${timeoutMs / 1000}s`);
            }
            throw e;
        }
    }

    /**
     * 获取默认 Agent 系统提示词
     * @param {string} agentType - Agent 类型 (archivist, historian, status_reader)
     * @returns {string} - 默认系统提示词
     */
    function getDefaultPrompt(agentType) {
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
    }

    /**
     * 构建用户提示词
     * @param {string} userInput - 用户输入
     * @param {string} context - 对话上下文
     * @returns {string} - 构建后的用户提示词
     */
    function buildUserPrompt(userInput, context) {
        return `## 用户查询
${userInput}

## 对话上下文
${context || '(无)'}

## 你的任务
使用 graph_retrieve 工具搜索对话中积累的知识图谱，使用 pedsa_retrieve 工具搜索世界书知识库，然后基于检索结果进行分析和总结。`;
    }

    /**
     * 执行带函数调用支持的 Agent 对话
     * 支持多轮工具调用循环，直到 AI 返回最终文本响应或达到最大轮次
     *
     * @param {string} agentType - Agent 类型 (archivist, historian, status_reader)
     * @param {Object} agentConfig - Agent 配置（含 model、endpointId、systemPrompt 等）
     * @param {string} userInput - 用户查询
     * @param {string} context - 对话上下文
     * @param {Array} worldbookContent - 世界书条目数组
     * @param {Object} fcConfig - 函数调用配置 { maxRounds, maxResultLength }
     * @returns {Promise<Object>} - { type, result, rounds, error? }
     */
    async function callAgentWithTools(agentType, agentConfig, userInput, context, worldbookContent, fcConfig) {
        const maxRounds = fcConfig?.maxRounds || 3;
        const maxResultLength = fcConfig?.maxResultLength || 4000;
        const tools = [getPedsaToolDefinition(), getGraphToolDefinition()];

        // Build initial messages
        const systemPrompt = agentConfig?.systemPrompt || getDefaultPrompt(agentType);
        const messages = [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: buildUserPrompt(userInput, context) }
        ];

        let round = 0;
        while (round < maxRounds) {
            round++;
            Logger.log?.(TAG, `Agent ${agentType} round ${round}/${maxRounds}`);

            // Call AI with tools
            let response;
            try {
                response = await callAIWithTools(agentConfig, messages, tools);
            } catch (e) {
                Logger.error?.(TAG, `Agent ${agentType} API call failed at round ${round}:`, e.message);
                return { type: agentType, result: null, rounds: round, error: e.message };
            }

            // Check for tool calls
            const toolCalls = response.tool_calls;
            if (!toolCalls || toolCalls.length === 0) {
                // No tool calls — this is the final response
                Logger.log?.(TAG, `Agent ${agentType} completed in ${round} round(s) (no tool calls)`);
                return { type: agentType, result: response.content, rounds: round };
            }

            // Append assistant message with tool_calls
            messages.push({ role: 'assistant', content: response.content || '', tool_calls: toolCalls });

            // Execute each tool call and append results
            for (const toolCall of toolCalls) {
                let formatted;
                try {
                    if (toolCall.name === 'graph_retrieve') {
                        const result = await executeGraphRetrieve(toolCall);
                        formatted = result.success
                            ? formatGraphResults(result.results, maxResultLength)
                            : `Error: ${result.error}`;
                    } else if (toolCall.name === 'pedsa_retrieve') {
                        const result = await executePedsaRetrieve(toolCall, worldbookContent);
                        formatted = result.success
                            ? formatToolResults(result.results, worldbookContent, maxResultLength)
                            : `Error: ${result.error}`;
                    } else {
                        formatted = `Error: Unknown tool "${toolCall.name}"`;
                    }
                } catch (e) {
                    Logger.warn?.(TAG, `Tool execution failed for call ${toolCall.id}:`, e.message);
                    formatted = `Error: Tool execution failed - ${e.message}`;
                }

                messages.push({
                    role: 'tool',
                    tool_call_id: toolCall.id,
                    content: formatted
                });
            }
        }

        // Max rounds reached — force final response without tools
        Logger.log?.(TAG, `Agent ${agentType} max rounds (${maxRounds}) reached, forcing final response`);
        try {
            const finalResponse = await callAIWithTools(agentConfig, messages, [], { tool_choice: 'none' });
            return { type: agentType, result: finalResponse.content, rounds: round };
        } catch (e) {
            Logger.error?.(TAG, `Agent ${agentType} final response failed:`, e.message);
            return { type: agentType, result: null, rounds: round, error: e.message };
        }
    }

    // 导出到 WBAP 命名空间
    WBAP.FunctionCalling = {
        TAG,
        getPedsaToolDefinition,
        getGraphToolDefinition,
        executePedsaRetrieve,
        executeGraphRetrieve,
        formatToolResults,
        formatGraphResults,
        callAIWithTools,
        parseAIResponse,
        getApiConfig,
        callAgentWithTools,
        getDefaultPrompt,
        buildUserPrompt
    };

    Logger.log?.(TAG, '模块已加载');
})();
