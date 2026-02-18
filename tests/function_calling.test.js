/**
 * Function Calling 模块测试
 * 测试 PEDSA 工具定义和工具执行的正确性
 * 
 * **Feature: pedsa-ai-tool**
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import * as fc from 'fast-check';

// ============================================================================
// Mock WBAP namespace and function calling module
// ============================================================================

/**
 * 创建模拟的 PEDSA-JS 引擎
 */
function createMockPedsaEngine(options = {}) {
    const { shouldFail = false, results = [] } = options;
    
    return class MockPedsaEngine {
        constructor() {
            this.events = new Map();
            this.features = new Map();
            this.edges = [];
            this.compiled = false;
            this.featureIdCounter = 1000000;
        }

        addEvent(id, content, metadata = {}) {
            this.events.set(id, { id, content, ...metadata });
        }

        getOrCreateFeature(keyword) {
            if (!this.features.has(keyword)) {
                this.features.set(keyword, this.featureIdCounter++);
            }
            return this.features.get(keyword);
        }

        addEdge(source, target, weight) {
            this.edges.push({ source, target, weight });
        }

        compile() {
            if (shouldFail) {
                throw new Error('Mock compile failure');
            }
            this.compiled = true;
        }

        retrieve(query, options = {}) {
            if (shouldFail) {
                throw new Error('Mock retrieve failure');
            }
            const topK = options.topK || 10;
            // Return mock results based on events
            const mockResults = results.length > 0 ? results : Array.from(this.events.values())
                .slice(0, topK)
                .map((event, index) => ({
                    nodeId: event.id,
                    score: 1 - (index * 0.1),
                    content: event.content,
                    originalEntry: event.originalEntry
                }));
            return {
                success: true,
                results: mockResults,
                stats: { retrieveTimeMs: 5 }
            };
        }
    };
}

/**
 * 创建模拟的 PEDSA-WASM 适配器
 */
function createMockPedsaWasmAdapter(options = {}) {
    const { isAvailable = true, shouldFail = false, results = [] } = options;
    
    return {
        isAvailable,
        _synced: false,
        
        convertEntriesToPedsaFormat(entries, bookName) {
            return entries.map(e => ({
                uid: e.uid,
                key: e.key,
                comment: e.comment,
                content: e.content
            }));
        },
        
        async sync(worldbooks, ontology) {
            if (shouldFail) {
                return { success: false, reason: 'Mock sync failure' };
            }
            this._synced = true;
            return { success: true };
        },
        
        async retrieve(query, options = {}) {
            if (shouldFail) {
                return { success: false, reason: 'Mock retrieve failure', results: [] };
            }
            if (!this._synced) {
                return { success: false, reason: 'not_synced', results: [] };
            }
            return {
                success: true,
                results: results.length > 0 ? results : [
                    { node_id: 1, score: 0.95, content: 'Mock WASM result' }
                ]
            };
        }
    };
}

function createFunctionCallingModule(mockWBAP = {}) {
    const TAG = '[FunctionCalling]';
    const Logger = mockWBAP.Logger || { log: () => {}, warn: () => {}, error: () => {} };
    const WBAP = mockWBAP;

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

    // Helper functions for extraction
    function extractTimestamp(entry) {
        const text = `${entry.comment || ''} ${entry.content || ''}`;
        const match = text.match(/(\d{4})年(\d{1,2})月(\d{1,2})日/);
        if (match) {
            const [, year, month, day] = match;
            return new Date(parseInt(year), parseInt(month) - 1, parseInt(day)).getTime() / 1000;
        }
        return 0;
    }

    function extractLocation(entry) {
        const text = `${entry.comment || ''} ${entry.content || ''}`;
        const locations = ['上海', '深圳', '北京', '杭州', '广州', '成都', '武汉', '南京'];
        for (const loc of locations) {
            if (text.includes(loc)) return loc;
        }
        return '';
    }

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

    function extractKeywords(entry) {
        const keywords = [];
        if (entry.key) {
            const keyStr = Array.isArray(entry.key) ? entry.key.join(',') : entry.key;
            keywords.push(...keyStr.split(/[,，、\s]+/).filter(k => k.length >= 2));
        }
        if (entry.comment) {
            const chineseWords = entry.comment.match(/[\u4e00-\u9fa5]{2,4}/g) || [];
            keywords.push(...chineseWords);
        }
        return [...new Set(keywords)].slice(0, 10);
    }

    async function pedsaJsRetrieve(query, entries, topK) {
        if (!WBAP.PedsaEngine) {
            return { success: false, error: 'PEDSA-JS engine not available' };
        }

        try {
            const engine = new WBAP.PedsaEngine();

            for (let i = 0; i < entries.length; i++) {
                const entry = entries[i];
                const content = `${entry.comment || ''} ${entry.key || ''} ${entry.content || ''}`;
                engine.addEvent(entry.uid || i, content, {
                    timestamp: extractTimestamp(entry),
                    location: extractLocation(entry),
                    emotions: extractEmotions(entry),
                    originalEntry: entry
                });

                const keywords = extractKeywords(entry);
                for (const keyword of keywords) {
                    const featureId = engine.getOrCreateFeature(keyword);
                    engine.addEdge(featureId, entry.uid || i, 0.8);
                }
            }

            engine.compile();
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

    async function executePedsaRetrieve(toolCall, worldbookEntries) {
        const args = toolCall?.arguments || toolCall || {};
        const { query, top_k = 10 } = args;

        // Helper function to check for empty or whitespace-only strings (including Unicode whitespace)
        function isEmptyOrWhitespace(str) {
            if (!str || typeof str !== 'string') {
                return true;
            }
            // Match all Unicode whitespace characters
            const whitespaceRegex = /^[\s\u00A0\u2000-\u200B\u202F\u205F\u3000\uFEFF]*$/;
            return whitespaceRegex.test(str);
        }

        // Validate query parameter: reject empty or whitespace-only strings (including Unicode whitespace)
        if (isEmptyOrWhitespace(query)) {
            Logger.warn?.(TAG, '无效查询：空或纯空白字符串');
            return { success: false, error: 'Invalid query: empty or whitespace-only' };
        }

        // Check worldbook entries
        if (!worldbookEntries || !Array.isArray(worldbookEntries) || worldbookEntries.length === 0) {
            Logger.warn?.(TAG, '无可用的世界书条目');
            return { success: false, error: 'No worldbook entries available' };
        }

        // Try PEDSA-JS engine first (primary)
        if (WBAP.PedsaEngine) {
            try {
                Logger.log?.(TAG, `使用 PEDSA-JS 执行检索: "${query.slice(0, 50)}..."`);
                const result = await pedsaJsRetrieve(query, worldbookEntries, top_k);
                if (result.success) {
                    return result;
                }
                Logger.warn?.(TAG, 'PEDSA-JS 检索失败，尝试 WASM 回退');
            } catch (e) {
                Logger.warn?.(TAG, 'PEDSA-JS 检索异常:', e.message);
            }
        }

        // Try PEDSA-WASM engine (fallback)
        if (WBAP.PedsaWasmAdapter?.isAvailable) {
            try {
                Logger.log?.(TAG, `使用 PEDSA-WASM 执行检索: "${query.slice(0, 50)}..."`);
                
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

        // Both engines unavailable
        Logger.warn?.(TAG, 'PEDSA 引擎不可用');
        return { success: false, error: 'PEDSA engine unavailable' };
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
     * 解析 AI API 响应，提取内容和工具调用
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
     */
    function getApiConfig(agentConfig) {
        let apiConfig = null;
        if (agentConfig?.endpointId) {
            const endpoints = WBAP.getGlobalPools?.()?.selectiveMode?.apiEndpoints || [];
            apiConfig = endpoints.find(ep => ep.id === agentConfig.endpointId);
        }
        if (!apiConfig) {
            const endpoints = WBAP.getGlobalPools?.()?.selectiveMode?.apiEndpoints || [];
            apiConfig = endpoints.find(ep => ep.enabled !== false);
        }
        if (!apiConfig) return null;
        return {
            apiUrl: apiConfig.apiUrl || apiConfig.url,
            apiKey: apiConfig.apiKey || apiConfig.key,
            model: apiConfig.model
        };
    }

    /**
     * 调用 AI API（支持工具/函数调用）
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

        if (tools && Array.isArray(tools) && tools.length > 0) {
            payload.tools = tools;
            payload.tool_choice = options.tool_choice || 'auto';
        }

        const timeoutMs = (options.timeout || 60) * 1000;

        Logger.log?.(TAG, `Calling AI: model=${model}, messages=${messages.length}, tools=${tools?.length || 0}`);

        // Use WBAP._fetchFn for testability, fallback to global fetch
        const fetchFn = WBAP._fetchFn || globalThis.fetch;

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

        try {
            const response = await fetchFn(resolved.apiUrl, {
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
     */
    async function callAgentWithTools(agentType, agentConfig, userInput, context, worldbookContent, fcConfig) {
        const maxRounds = fcConfig?.maxRounds || 3;
        const maxResultLength = fcConfig?.maxResultLength || 4000;
        const tools = [getPedsaToolDefinition()];

        const systemPrompt = agentConfig?.systemPrompt || getDefaultPrompt(agentType);
        const messages = [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: buildUserPrompt(userInput, context) }
        ];

        let round = 0;
        while (round < maxRounds) {
            round++;
            Logger.log?.(TAG, `Agent ${agentType} round ${round}/${maxRounds}`);

            let response;
            try {
                response = await callAIWithTools(agentConfig, messages, tools);
            } catch (e) {
                Logger.error?.(TAG, `Agent ${agentType} API call failed at round ${round}:`, e.message);
                return { type: agentType, result: null, rounds: round, error: e.message };
            }

            const toolCalls = response.tool_calls;
            if (!toolCalls || toolCalls.length === 0) {
                Logger.log?.(TAG, `Agent ${agentType} completed in ${round} round(s) (no tool calls)`);
                return { type: agentType, result: response.content, rounds: round };
            }

            messages.push({ role: 'assistant', content: response.content || '', tool_calls: toolCalls });

            for (const toolCall of toolCalls) {
                let formatted;
                try {
                    const result = await executePedsaRetrieve(toolCall, worldbookContent);
                    formatted = result.success
                        ? formatToolResults(result.results, worldbookContent, maxResultLength)
                        : `Error: ${result.error}`;
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

        Logger.log?.(TAG, `Agent ${agentType} max rounds (${maxRounds}) reached, forcing final response`);
        try {
            const finalResponse = await callAIWithTools(agentConfig, messages, [], { tool_choice: 'none' });
            return { type: agentType, result: finalResponse.content, rounds: round };
        } catch (e) {
            Logger.error?.(TAG, `Agent ${agentType} final response failed:`, e.message);
            return { type: agentType, result: null, rounds: round, error: e.message };
        }
    }

    return {
        TAG,
        getPedsaToolDefinition,
        executePedsaRetrieve,
        formatToolResults,
        callAIWithTools,
        parseAIResponse,
        getApiConfig,
        callAgentWithTools,
        getDefaultPrompt,
        buildUserPrompt
    };
}

// ============================================================================
// OpenAI Tool Schema Validator
// ============================================================================

/**
 * Validates that a tool definition conforms to OpenAI function calling schema
 * @param {Object} tool - The tool definition to validate
 * @returns {{ valid: boolean, errors: string[] }}
 */
function validateOpenAIToolSchema(tool) {
    const errors = [];

    // Top-level type must be "function"
    if (tool.type !== "function") {
        errors.push(`Expected type "function", got "${tool.type}"`);
    }

    // Must have function object
    if (!tool.function || typeof tool.function !== 'object') {
        errors.push('Missing or invalid "function" object');
        return { valid: false, errors };
    }

    const fn = tool.function;

    // Function must have name (string)
    if (typeof fn.name !== 'string' || fn.name.length === 0) {
        errors.push('Function must have a non-empty "name" string');
    }

    // Function must have description (string)
    if (typeof fn.description !== 'string' || fn.description.length === 0) {
        errors.push('Function must have a non-empty "description" string');
    }

    // Function must have parameters object
    if (!fn.parameters || typeof fn.parameters !== 'object') {
        errors.push('Function must have a "parameters" object');
        return { valid: false, errors };
    }

    const params = fn.parameters;

    // Parameters must have type "object"
    if (params.type !== "object") {
        errors.push(`Parameters type must be "object", got "${params.type}"`);
    }

    // Parameters must have properties object
    if (!params.properties || typeof params.properties !== 'object') {
        errors.push('Parameters must have a "properties" object');
    }

    // Required must be an array if present
    if (params.required !== undefined && !Array.isArray(params.required)) {
        errors.push('"required" must be an array');
    }

    // Validate each property
    if (params.properties) {
        for (const [propName, propDef] of Object.entries(params.properties)) {
            if (!propDef || typeof propDef !== 'object') {
                errors.push(`Property "${propName}" must be an object`);
                continue;
            }
            if (typeof propDef.type !== 'string') {
                errors.push(`Property "${propName}" must have a "type" string`);
            }
        }
    }

    return { valid: errors.length === 0, errors };
}

// ============================================================================
// Property Tests
// ============================================================================

describe('Function Calling Property Tests', () => {
    let FunctionCalling;

    beforeEach(() => {
        FunctionCalling = createFunctionCallingModule();
    });

    /**
     * **Feature: pedsa-ai-tool, Property 1: Tool Definition Schema Validity**
     * 
     * *For any* tool definition returned by `getPedsaToolDefinition()`, 
     * serializing to JSON and validating against the OpenAI tools schema 
     * SHALL produce a valid result.
     * 
     * **Validates: Requirements 1.4, 1.5**
     */
    it('Property 1: Tool Definition Schema Validity', () => {
        fc.assert(
            fc.property(
                fc.constant(null), // We test the actual implementation
                () => {
                    const toolDef = FunctionCalling.getPedsaToolDefinition();
                    
                    // Serialize to JSON and parse back (validates JSON compatibility)
                    const serialized = JSON.stringify(toolDef);
                    expect(typeof serialized).toBe('string');
                    expect(serialized.length).toBeGreaterThan(0);
                    
                    const parsed = JSON.parse(serialized);
                    
                    // Validate against OpenAI schema
                    const validation = validateOpenAIToolSchema(parsed);
                    expect(validation.valid).toBe(true);
                    if (!validation.valid) {
                        console.error('Schema validation errors:', validation.errors);
                    }
                    
                    // Verify structure is preserved after serialization
                    expect(parsed.type).toBe(toolDef.type);
                    expect(parsed.function.name).toBe(toolDef.function.name);
                    expect(parsed.function.description).toBe(toolDef.function.description);
                    expect(parsed.function.parameters).toEqual(toolDef.function.parameters);
                }
            ),
            { numRuns: 100 }
        );
    });

    /**
     * **Feature: pedsa-ai-tool, Property 4: Result Formatting Contains Required Fields**
     * 
     * *For any* non-empty set of PEDSA results with corresponding worldbook entries,
     * the formatted output SHALL contain the entry comment/title, keywords, 
     * content snippet, and relevance score for each result.
     * 
     * **Validates: Requirements 6.1, 6.2, 6.3, 6.4**
     */
    it('Property 4: Result Formatting Contains Required Fields', () => {
        // Generator for worldbook entries
        const entryArbitrary = fc.record({
            uid: fc.integer({ min: 1, max: 10000 }),
            key: fc.oneof(
                fc.string({ minLength: 1, maxLength: 50 }),
                fc.array(fc.string({ minLength: 1, maxLength: 20 }), { minLength: 1, maxLength: 5 })
            ),
            comment: fc.string({ minLength: 1, maxLength: 100 }),
            content: fc.string({ minLength: 1, maxLength: 1000 })
        });

        // Generator for PEDSA results (matching entry uids)
        const resultArbitrary = (entries) => {
            if (entries.length === 0) {
                return fc.constant([]);
            }
            const uids = entries.map(e => e.uid);
            return fc.array(
                fc.record({
                    nodeId: fc.constantFrom(...uids),
                    score: fc.float({ min: 0, max: 1, noNaN: true })
                }),
                { minLength: 1, maxLength: Math.min(entries.length, 10) }
            );
        };

        fc.assert(
            fc.property(
                fc.array(entryArbitrary, { minLength: 1, maxLength: 20 }),
                (entries) => {
                    // Ensure unique uids
                    const uniqueEntries = [];
                    const seenUids = new Set();
                    for (const entry of entries) {
                        if (!seenUids.has(entry.uid)) {
                            seenUids.add(entry.uid);
                            uniqueEntries.push(entry);
                        }
                    }
                    
                    if (uniqueEntries.length === 0) {
                        return true; // Skip if no unique entries
                    }

                    // Generate results for these entries
                    const results = uniqueEntries.slice(0, Math.min(5, uniqueEntries.length)).map((entry, idx) => ({
                        nodeId: entry.uid,
                        score: 1 - (idx * 0.1)
                    }));

                    const output = FunctionCalling.formatToolResults(results, uniqueEntries);

                    // Verify output is a non-empty string
                    expect(typeof output).toBe('string');
                    expect(output.length).toBeGreaterThan(0);

                    // Verify header is present
                    expect(output).toContain('Found');
                    expect(output).toContain('relevant entries');

                    // For each result, verify required fields are present
                    for (const result of results) {
                        const entry = uniqueEntries.find(e => e.uid === result.nodeId);
                        if (!entry) continue;

                        // Requirement 6.1: Entry comment/title must be present
                        // The comment is wrapped in 【】brackets
                        const commentOrKey = entry.comment || (Array.isArray(entry.key) ? entry.key[0] : entry.key) || '';
                        if (commentOrKey) {
                            expect(output).toContain(`【${commentOrKey}】`);
                        }

                        // Requirement 6.2: Keywords must be present
                        expect(output).toContain('Keywords:');

                        // Requirement 6.3: Content snippet must be present (first 500 chars)
                        const snippet = entry.content.slice(0, 500);
                        if (snippet) {
                            expect(output).toContain(snippet);
                        }

                        // Requirement 6.4: Relevance score must be present
                        const scoreStr = result.score.toFixed(2);
                        expect(output).toContain(`score: ${scoreStr}`);
                    }

                    return true;
                }
            ),
            { numRuns: 100 }
        );
    });

    /**
     * **Feature: pedsa-ai-tool, Property 14: Result Length Bounded**
     * 
     * *For any* set of PEDSA results, the formatted output length SHALL not 
     * exceed the configured maxResultLength.
     * 
     * **Validates: Requirements 6.6**
     */
    it('Property 14: Result Length Bounded', () => {
        // Generator for worldbook entries with varying content sizes
        const entryArbitrary = fc.record({
            uid: fc.integer({ min: 1, max: 100000 }),
            key: fc.oneof(
                fc.string({ minLength: 1, maxLength: 100 }),
                fc.array(fc.string({ minLength: 1, maxLength: 30 }), { minLength: 1, maxLength: 10 })
            ),
            comment: fc.string({ minLength: 0, maxLength: 200 }),
            // Generate content of varying sizes, including very large content
            content: fc.string({ minLength: 0, maxLength: 2000 })
        });

        // Generator for maxLength values (various realistic limits)
        const maxLengthArbitrary = fc.integer({ min: 50, max: 10000 });

        fc.assert(
            fc.property(
                fc.array(entryArbitrary, { minLength: 1, maxLength: 50 }),
                maxLengthArbitrary,
                (entries, maxLength) => {
                    // Ensure unique uids
                    const uniqueEntries = [];
                    const seenUids = new Set();
                    for (const entry of entries) {
                        if (!seenUids.has(entry.uid)) {
                            seenUids.add(entry.uid);
                            uniqueEntries.push(entry);
                        }
                    }

                    if (uniqueEntries.length === 0) {
                        return true; // Skip if no unique entries
                    }

                    // Generate results for all unique entries
                    const results = uniqueEntries.map((entry, idx) => ({
                        nodeId: entry.uid,
                        score: Math.max(0, 1 - (idx * 0.01))
                    }));

                    // Format results with the generated maxLength
                    const output = FunctionCalling.formatToolResults(results, uniqueEntries, maxLength);

                    // Property: output length must NEVER exceed maxLength
                    expect(output.length).toBeLessThanOrEqual(maxLength);

                    return true;
                }
            ),
            { numRuns: 100 }
        );
    });

    /**
     * **Feature: pedsa-ai-tool, Property 5: Whitespace Query Rejection**
     * 
     * *For any* query string composed entirely of whitespace characters 
     * (including empty string), the tool executor SHALL return an error 
     * result with an appropriate message.
     * 
     * **Validates: Requirements 2.5**
     */
    it('Property 5: Whitespace Query Rejection', async () => {
        const sampleEntries = [
            { uid: 1, key: '角色,主角', comment: '主角信息', content: '这是主角的详细描述。' },
            { uid: 2, key: '地点,城市', comment: '城市信息', content: '上海是一个繁华的城市。' }
        ];

        // Generator for whitespace-only strings
        const whitespaceArbitrary = fc.oneof(
            // Empty string
            fc.constant(''),
            // Single whitespace characters
            fc.constantFrom(' ', '\t', '\n', '\r', '\f', '\v'),
            // Multiple spaces using array and join
            fc.array(
                fc.constantFrom(' ', '\t', '\n', '\r', '\f', '\v'),
                { minLength: 1, maxLength: 50 }
            ).map(arr => arr.join('')),
            // Unicode whitespace characters
            fc.constantFrom(
                '\u00A0',  // Non-breaking space
                '\u2000',  // En quad
                '\u2001',  // Em quad
                '\u2002',  // En space
                '\u2003',  // Em space
                '\u2004',  // Three-per-em space
                '\u2005',  // Four-per-em space
                '\u2006',  // Six-per-em space
                '\u2007',  // Figure space
                '\u2008',  // Punctuation space
                '\u2009',  // Thin space
                '\u200A',  // Hair space
                '\u200B',  // Zero-width space
                '\u202F',  // Narrow no-break space
                '\u205F',  // Medium mathematical space
                '\u3000',  // Ideographic space
                '\uFEFF'   // Zero-width no-break space (BOM)
            ),
            // Mixed whitespace combinations
            fc.array(
                fc.constantFrom(' ', '\t', '\n', '\r', '\f', '\v', '\u00A0', '\u2003', '\u3000'),
                { minLength: 1, maxLength: 20 }
            ).map(arr => arr.join(''))
        );

        await fc.assert(
            fc.asyncProperty(
                whitespaceArbitrary,
                async (whitespaceQuery) => {
                    const result = await FunctionCalling.executePedsaRetrieve(
                        { arguments: { query: whitespaceQuery } },
                        sampleEntries
                    );
                    
                    // All whitespace queries must be rejected
                    expect(result.success).toBe(false);
                    expect(result.error).toBe('Invalid query: empty or whitespace-only');
                }
            ),
            { numRuns: 100 }
        );
    });

    /**
     * **Feature: pedsa-ai-tool, Property 12: API Parameters Preserved**
     *
     * *For any* API request, adding tool definitions SHALL not remove or modify
     * existing parameters (model, temperature, max_tokens, messages).
     *
     * **Validates: Requirements 5.3**
     */
    it('Property 12: API Parameters Preserved', async () => {
        // Generators for random API parameters
        const modelArbitrary = fc.array(
            fc.constantFrom(...'abcdefghijklmnopqrstuvwxyz0123456789-_.'.split('')),
            { minLength: 1, maxLength: 30 }
        ).map(arr => arr.join(''));
        const temperatureArbitrary = fc.double({ min: 0, max: 2, noNaN: true, noDefaultInfinity: true });
        const maxTokensArbitrary = fc.integer({ min: 1, max: 16000 });
        const messageArbitrary = fc.record({
            role: fc.constantFrom('system', 'user', 'assistant'),
            content: fc.string({ minLength: 1, maxLength: 200 })
        });
        const messagesArbitrary = fc.array(messageArbitrary, { minLength: 1, maxLength: 10 });

        await fc.assert(
            fc.asyncProperty(
                modelArbitrary,
                temperatureArbitrary,
                maxTokensArbitrary,
                messagesArbitrary,
                async (model, temperature, maxTokens, messages) => {
                    let capturedPayload = null;
                    const mockFetch = async (url, options) => {
                        capturedPayload = JSON.parse(options.body);
                        return {
                            ok: true,
                            json: async () => ({ choices: [{ message: { content: 'ok' } }] })
                        };
                    };

                    const mockWBAP = {
                        Logger: { log: () => {}, warn: () => {}, error: () => {} },
                        getGlobalPools: () => ({
                            selectiveMode: {
                                apiEndpoints: [{
                                    id: 'ep1',
                                    apiUrl: 'https://api.example.com/v1/chat/completions',
                                    apiKey: 'test-key',
                                    model: 'fallback-model',
                                    enabled: true
                                }]
                            }
                        }),
                        _fetchFn: mockFetch
                    };

                    const FC = createFunctionCallingModule(mockWBAP);
                    const tools = [FC.getPedsaToolDefinition()];

                    await FC.callAIWithTools(
                        { model },
                        messages,
                        tools,
                        { temperature, max_tokens: maxTokens }
                    );

                    // Property: all original parameters must be preserved
                    expect(capturedPayload.model).toBe(model);
                    expect(capturedPayload.messages).toEqual(messages);
                    expect(capturedPayload.temperature).toBe(temperature);
                    expect(capturedPayload.max_tokens).toBe(maxTokens);
                    // Tools must also be present
                    expect(capturedPayload.tools).toEqual(tools);
                }
            ),
            { numRuns: 100 }
        );
    });

    /**
     * **Feature: pedsa-ai-tool, Property 8: Loop Terminates at Max Rounds**
     *
     * *For any* conversation that reaches the configured maxRounds limit,
     * the loop SHALL terminate regardless of whether the AI continues to
     * request tool calls.
     *
     * **Validates: Requirements 3.5**
     */
    it('Property 8: Loop Terminates at Max Rounds', async () => {
        await fc.assert(
            fc.asyncProperty(
                // maxRounds between 1 and 10
                fc.integer({ min: 1, max: 10 }),
                // agentType
                fc.constantFrom('archivist', 'historian', 'status_reader'),
                async (maxRounds, agentType) => {
                    let callCount = 0;

                    // Mock fetch: always return tool_calls for the first maxRounds calls,
                    // then return plain content for the forced final call
                    const mockFetch = async (url, options) => {
                        callCount++;
                        const body = JSON.parse(options.body);

                        // After maxRounds, the code calls with tool_choice: "none" (or empty tools)
                        // to force a final text response
                        const isForced = !body.tools || body.tools.length === 0;

                        if (isForced) {
                            return {
                                ok: true,
                                json: async () => ({
                                    choices: [{
                                        message: { content: 'Final answer after max rounds' }
                                    }]
                                })
                            };
                        }

                        // Otherwise, always return a tool call to keep the loop going
                        return {
                            ok: true,
                            json: async () => ({
                                choices: [{
                                    message: {
                                        content: '',
                                        tool_calls: [{
                                            id: `call_${callCount}`,
                                            function: {
                                                name: 'pedsa_retrieve',
                                                arguments: '{"query":"round query"}'
                                            }
                                        }]
                                    }
                                }]
                            })
                        };
                    };

                    const mockWBAP = {
                        Logger: { log: () => {}, warn: () => {}, error: () => {} },
                        getGlobalPools: () => ({
                            selectiveMode: {
                                apiEndpoints: [{
                                    id: 'ep1',
                                    apiUrl: 'https://api.example.com/v1/chat/completions',
                                    apiKey: 'test-key',
                                    model: 'test-model',
                                    enabled: true
                                }]
                            }
                        }),
                        _fetchFn: mockFetch,
                        // No PEDSA engines — executePedsaRetrieve will return error,
                        // but the loop still processes the tool result as an error string
                    };

                    const FC = createFunctionCallingModule(mockWBAP);

                    const worldbookEntries = [
                        { uid: 1, key: 'test', comment: 'Test', content: 'Test content' }
                    ];

                    callCount = 0;
                    const result = await FC.callAgentWithTools(
                        agentType,
                        { model: 'test-model' },
                        'test input',
                        'test context',
                        worldbookEntries,
                        { maxRounds }
                    );

                    // Property: rounds must equal maxRounds (loop exhausted all rounds)
                    expect(result.rounds).toBe(maxRounds);

                    // Property: the loop must have terminated (we got a result back)
                    expect(result.type).toBe(agentType);

                    // Property: total API calls = maxRounds (tool-call rounds) + 1 (forced final)
                    expect(callCount).toBe(maxRounds + 1);
                }
            ),
            { numRuns: 100 }
        );
    });

    /**
     * **Feature: pedsa-ai-tool, Property 9: All Agents Receive Tools When FC Enabled**
     *
     * *For any* agent type (archivist, historian, status_reader) with function calling
     * enabled, the API request SHALL include the pedsa_retrieve tool definition.
     *
     * **Validates: Requirements 4.1, 4.2, 4.3**
     */
    it('Property 9: All Agents Receive Tools When FC Enabled', async () => {
        await fc.assert(
            fc.asyncProperty(
                // Any of the three agent types
                fc.constantFrom('archivist', 'historian', 'status_reader'),
                // Random maxRounds
                fc.integer({ min: 1, max: 5 }),
                // Random maxResultLength
                fc.integer({ min: 500, max: 8000 }),
                async (agentType, maxRounds, maxResultLength) => {
                    const capturedPayloads = [];

                    // Mock fetch: capture every request payload, return no tool_calls
                    // so the loop terminates after one round
                    const mockFetch = async (url, options) => {
                        capturedPayloads.push(JSON.parse(options.body));
                        return {
                            ok: true,
                            json: async () => ({
                                choices: [{
                                    message: { content: `Response from ${agentType}` }
                                }]
                            })
                        };
                    };

                    const mockWBAP = {
                        Logger: { log: () => {}, warn: () => {}, error: () => {} },
                        getGlobalPools: () => ({
                            selectiveMode: {
                                apiEndpoints: [{
                                    id: 'ep1',
                                    apiUrl: 'https://api.example.com/v1/chat/completions',
                                    apiKey: 'test-key',
                                    model: 'test-model',
                                    enabled: true
                                }]
                            }
                        }),
                        _fetchFn: mockFetch
                    };

                    const FC = createFunctionCallingModule(mockWBAP);
                    const expectedToolDef = FC.getPedsaToolDefinition();

                    const worldbookEntries = [
                        { uid: 1, key: 'test', comment: 'Test', content: 'Test content' }
                    ];

                    await FC.callAgentWithTools(
                        agentType,
                        { model: 'test-model' },
                        'test input',
                        'test context',
                        worldbookEntries,
                        { maxRounds, maxResultLength }
                    );

                    // At least one API call must have been made
                    expect(capturedPayloads.length).toBeGreaterThanOrEqual(1);

                    // The first API call must include the tools array with pedsa_retrieve
                    const firstPayload = capturedPayloads[0];
                    expect(firstPayload.tools).toBeDefined();
                    expect(Array.isArray(firstPayload.tools)).toBe(true);
                    expect(firstPayload.tools.length).toBe(1);
                    expect(firstPayload.tools[0]).toEqual(expectedToolDef);

                    // tool_choice must be "auto"
                    expect(firstPayload.tool_choice).toBe('auto');
                }
            ),
            { numRuns: 100 }
        );
    });
});

// ============================================================================
// Unit Tests
// ============================================================================

describe('Function Calling Unit Tests', () => {
    let FunctionCalling;

    beforeEach(() => {
        FunctionCalling = createFunctionCallingModule();
    });

    describe('getPedsaToolDefinition', () => {
        /**
         * Test that tool definition has correct top-level structure
         */
        it('should return tool definition with type "function"', () => {
            const toolDef = FunctionCalling.getPedsaToolDefinition();
            expect(toolDef.type).toBe('function');
        });

        /**
         * Test that function name is "pedsa_retrieve"
         */
        it('should have function name "pedsa_retrieve"', () => {
            const toolDef = FunctionCalling.getPedsaToolDefinition();
            expect(toolDef.function.name).toBe('pedsa_retrieve');
        });

        /**
         * Test that function has a description
         */
        it('should have a non-empty description', () => {
            const toolDef = FunctionCalling.getPedsaToolDefinition();
            expect(typeof toolDef.function.description).toBe('string');
            expect(toolDef.function.description.length).toBeGreaterThan(0);
        });

        /**
         * Test that parameters object has correct structure
         */
        it('should have parameters with type "object"', () => {
            const toolDef = FunctionCalling.getPedsaToolDefinition();
            expect(toolDef.function.parameters.type).toBe('object');
        });

        /**
         * Test that query parameter is defined correctly
         */
        it('should have query parameter of type string', () => {
            const toolDef = FunctionCalling.getPedsaToolDefinition();
            const queryParam = toolDef.function.parameters.properties.query;
            
            expect(queryParam).toBeDefined();
            expect(queryParam.type).toBe('string');
            expect(typeof queryParam.description).toBe('string');
        });

        /**
         * Test that top_k parameter is defined correctly with default
         */
        it('should have top_k parameter of type integer with default 10', () => {
            const toolDef = FunctionCalling.getPedsaToolDefinition();
            const topKParam = toolDef.function.parameters.properties.top_k;
            
            expect(topKParam).toBeDefined();
            expect(topKParam.type).toBe('integer');
            expect(topKParam.default).toBe(10);
            expect(typeof topKParam.description).toBe('string');
        });

        /**
         * Test that query is in required array
         */
        it('should have query as required parameter', () => {
            const toolDef = FunctionCalling.getPedsaToolDefinition();
            expect(toolDef.function.parameters.required).toContain('query');
        });

        /**
         * Test that top_k is NOT in required array (it's optional)
         */
        it('should not have top_k as required parameter', () => {
            const toolDef = FunctionCalling.getPedsaToolDefinition();
            expect(toolDef.function.parameters.required).not.toContain('top_k');
        });

        /**
         * Test that tool definition can be serialized to valid JSON
         */
        it('should serialize to valid JSON', () => {
            const toolDef = FunctionCalling.getPedsaToolDefinition();
            
            expect(() => {
                const json = JSON.stringify(toolDef);
                JSON.parse(json);
            }).not.toThrow();
        });

        /**
         * Test complete OpenAI schema compliance
         */
        it('should conform to OpenAI function calling schema', () => {
            const toolDef = FunctionCalling.getPedsaToolDefinition();
            const validation = validateOpenAIToolSchema(toolDef);
            
            expect(validation.valid).toBe(true);
            expect(validation.errors).toHaveLength(0);
        });
    });
});

// ============================================================================
// executePedsaRetrieve Unit Tests
// ============================================================================

describe('executePedsaRetrieve Unit Tests', () => {
    const sampleEntries = [
        { uid: 1, key: '角色,主角', comment: '主角信息', content: '这是主角的详细描述，他在上海工作。' },
        { uid: 2, key: '地点,城市', comment: '城市信息', content: '上海是一个繁华的城市。' },
        { uid: 3, key: '事件,历史', comment: '历史事件', content: '2024年1月15日发生了重要事件。' }
    ];

    describe('Query Validation', () => {
        /**
         * Test that empty string query is rejected
         */
        it('should reject empty string query', async () => {
            const FunctionCalling = createFunctionCallingModule({});
            const result = await FunctionCalling.executePedsaRetrieve(
                { arguments: { query: '' } },
                sampleEntries
            );
            
            expect(result.success).toBe(false);
            expect(result.error).toBe('Invalid query: empty or whitespace-only');
        });

        /**
         * Test that whitespace-only query is rejected
         */
        it('should reject whitespace-only query', async () => {
            const FunctionCalling = createFunctionCallingModule({});
            const result = await FunctionCalling.executePedsaRetrieve(
                { arguments: { query: '   \t\n  ' } },
                sampleEntries
            );
            
            expect(result.success).toBe(false);
            expect(result.error).toBe('Invalid query: empty or whitespace-only');
        });

        /**
         * Test that null query is rejected
         */
        it('should reject null query', async () => {
            const FunctionCalling = createFunctionCallingModule({});
            const result = await FunctionCalling.executePedsaRetrieve(
                { arguments: { query: null } },
                sampleEntries
            );
            
            expect(result.success).toBe(false);
            expect(result.error).toBe('Invalid query: empty or whitespace-only');
        });

        /**
         * Test that undefined query is rejected
         */
        it('should reject undefined query', async () => {
            const FunctionCalling = createFunctionCallingModule({});
            const result = await FunctionCalling.executePedsaRetrieve(
                { arguments: {} },
                sampleEntries
            );
            
            expect(result.success).toBe(false);
            expect(result.error).toBe('Invalid query: empty or whitespace-only');
        });

        /**
         * Test that non-string query is rejected
         */
        it('should reject non-string query', async () => {
            const FunctionCalling = createFunctionCallingModule({});
            const result = await FunctionCalling.executePedsaRetrieve(
                { arguments: { query: 12345 } },
                sampleEntries
            );
            
            expect(result.success).toBe(false);
            expect(result.error).toBe('Invalid query: empty or whitespace-only');
        });
    });

    describe('Worldbook Entries Validation', () => {
        /**
         * Test that empty entries array is rejected
         */
        it('should reject empty worldbook entries', async () => {
            const FunctionCalling = createFunctionCallingModule({
                PedsaEngine: createMockPedsaEngine()
            });
            const result = await FunctionCalling.executePedsaRetrieve(
                { arguments: { query: 'test query' } },
                []
            );
            
            expect(result.success).toBe(false);
            expect(result.error).toBe('No worldbook entries available');
        });

        /**
         * Test that null entries is rejected
         */
        it('should reject null worldbook entries', async () => {
            const FunctionCalling = createFunctionCallingModule({
                PedsaEngine: createMockPedsaEngine()
            });
            const result = await FunctionCalling.executePedsaRetrieve(
                { arguments: { query: 'test query' } },
                null
            );
            
            expect(result.success).toBe(false);
            expect(result.error).toBe('No worldbook entries available');
        });

        /**
         * Test that undefined entries is rejected
         */
        it('should reject undefined worldbook entries', async () => {
            const FunctionCalling = createFunctionCallingModule({
                PedsaEngine: createMockPedsaEngine()
            });
            const result = await FunctionCalling.executePedsaRetrieve(
                { arguments: { query: 'test query' } },
                undefined
            );
            
            expect(result.success).toBe(false);
            expect(result.error).toBe('No worldbook entries available');
        });
    });

    describe('PEDSA-JS Engine Routing', () => {
        /**
         * Test that PEDSA-JS is used when available
         */
        it('should use PEDSA-JS when available', async () => {
            const MockEngine = createMockPedsaEngine();
            const FunctionCalling = createFunctionCallingModule({
                PedsaEngine: MockEngine
            });
            
            const result = await FunctionCalling.executePedsaRetrieve(
                { arguments: { query: '主角信息' } },
                sampleEntries
            );
            
            expect(result.success).toBe(true);
            expect(result.results).toBeDefined();
            expect(Array.isArray(result.results)).toBe(true);
        });

        /**
         * Test that valid query with entries returns results
         */
        it('should return results for valid query', async () => {
            const MockEngine = createMockPedsaEngine();
            const FunctionCalling = createFunctionCallingModule({
                PedsaEngine: MockEngine
            });
            
            const result = await FunctionCalling.executePedsaRetrieve(
                { arguments: { query: '上海城市' } },
                sampleEntries
            );
            
            expect(result.success).toBe(true);
            expect(result.results.length).toBeGreaterThan(0);
        });
    });

    describe('PEDSA-WASM Fallback', () => {
        /**
         * Test that PEDSA-WASM is used when PEDSA-JS is unavailable
         * **Validates: Requirements 2.2**
         */
        it('should fallback to PEDSA-WASM when PEDSA-JS unavailable', async () => {
            const mockWasmAdapter = createMockPedsaWasmAdapter();
            const FunctionCalling = createFunctionCallingModule({
                PedsaWasmAdapter: mockWasmAdapter
            });
            
            const result = await FunctionCalling.executePedsaRetrieve(
                { arguments: { query: '测试查询' } },
                sampleEntries
            );
            
            expect(result.success).toBe(true);
            expect(result.results).toBeDefined();
        });

        /**
         * Test that PEDSA-WASM syncs data before retrieval
         */
        it('should sync data to PEDSA-WASM before retrieval', async () => {
            const mockWasmAdapter = createMockPedsaWasmAdapter();
            expect(mockWasmAdapter._synced).toBe(false);
            
            const FunctionCalling = createFunctionCallingModule({
                PedsaWasmAdapter: mockWasmAdapter
            });
            
            await FunctionCalling.executePedsaRetrieve(
                { arguments: { query: '测试查询' } },
                sampleEntries
            );
            
            expect(mockWasmAdapter._synced).toBe(true);
        });

        /**
         * Test fallback when PEDSA-JS fails
         * **Validates: Requirements 2.2**
         */
        it('should fallback to PEDSA-WASM when PEDSA-JS fails', async () => {
            const FailingEngine = createMockPedsaEngine({ shouldFail: true });
            const mockWasmAdapter = createMockPedsaWasmAdapter();
            
            const FunctionCalling = createFunctionCallingModule({
                PedsaEngine: FailingEngine,
                PedsaWasmAdapter: mockWasmAdapter
            });
            
            const result = await FunctionCalling.executePedsaRetrieve(
                { arguments: { query: '测试查询' } },
                sampleEntries
            );
            
            expect(result.success).toBe(true);
            expect(mockWasmAdapter._synced).toBe(true);
        });

        /**
         * Test that PEDSA-JS is prioritized over PEDSA-WASM when both are available
         * **Validates: Requirements 2.2**
         */
        it('should use PEDSA-JS over PEDSA-WASM when both available', async () => {
            const MockEngine = createMockPedsaEngine({
                results: [{ nodeId: 100, score: 0.99, content: 'JS result' }]
            });
            const mockWasmAdapter = createMockPedsaWasmAdapter({
                results: [{ node_id: 200, score: 0.88, content: 'WASM result' }]
            });
            
            const FunctionCalling = createFunctionCallingModule({
                PedsaEngine: MockEngine,
                PedsaWasmAdapter: mockWasmAdapter
            });
            
            const result = await FunctionCalling.executePedsaRetrieve(
                { arguments: { query: '测试查询' } },
                sampleEntries
            );
            
            expect(result.success).toBe(true);
            // WASM should NOT be synced since JS succeeded
            expect(mockWasmAdapter._synced).toBe(false);
            // Results should come from JS engine (nodeId format, not node_id)
            expect(result.results[0].nodeId).toBe(100);
        });

        /**
         * Test that WASM is used only after JS fails (not just unavailable)
         * **Validates: Requirements 2.2**
         */
        it('should use WASM after JS retrieval returns failure', async () => {
            // Create a JS engine that compiles but returns empty/failed results
            const FailingRetrieveEngine = createMockPedsaEngine({ shouldFail: true });
            const mockWasmAdapter = createMockPedsaWasmAdapter({
                results: [{ node_id: 300, score: 0.77, content: 'WASM fallback result' }]
            });
            
            const FunctionCalling = createFunctionCallingModule({
                PedsaEngine: FailingRetrieveEngine,
                PedsaWasmAdapter: mockWasmAdapter
            });
            
            const result = await FunctionCalling.executePedsaRetrieve(
                { arguments: { query: '测试查询' } },
                sampleEntries
            );
            
            expect(result.success).toBe(true);
            // WASM should be synced since JS failed
            expect(mockWasmAdapter._synced).toBe(true);
            // Results should come from WASM (node_id format)
            expect(result.results[0].node_id).toBe(300);
        });
    });

    describe('Engine Unavailability', () => {
        /**
         * Test error when both engines are unavailable
         */
        it('should return error when both engines unavailable', async () => {
            const FunctionCalling = createFunctionCallingModule({});
            
            const result = await FunctionCalling.executePedsaRetrieve(
                { arguments: { query: '测试查询' } },
                sampleEntries
            );
            
            expect(result.success).toBe(false);
            expect(result.error).toBe('PEDSA engine unavailable');
        });

        /**
         * Test error when WASM adapter is not available
         */
        it('should return error when WASM adapter isAvailable is false', async () => {
            const mockWasmAdapter = createMockPedsaWasmAdapter({ isAvailable: false });
            const FunctionCalling = createFunctionCallingModule({
                PedsaWasmAdapter: mockWasmAdapter
            });
            
            const result = await FunctionCalling.executePedsaRetrieve(
                { arguments: { query: '测试查询' } },
                sampleEntries
            );
            
            expect(result.success).toBe(false);
            expect(result.error).toBe('PEDSA engine unavailable');
        });
    });

    describe('Tool Call Format Handling', () => {
        /**
         * Test handling of toolCall with arguments property
         */
        it('should handle toolCall with arguments property', async () => {
            const MockEngine = createMockPedsaEngine();
            const FunctionCalling = createFunctionCallingModule({
                PedsaEngine: MockEngine
            });
            
            const result = await FunctionCalling.executePedsaRetrieve(
                { arguments: { query: '测试', top_k: 5 } },
                sampleEntries
            );
            
            expect(result.success).toBe(true);
        });

        /**
         * Test handling of direct arguments object
         */
        it('should handle direct arguments object', async () => {
            const MockEngine = createMockPedsaEngine();
            const FunctionCalling = createFunctionCallingModule({
                PedsaEngine: MockEngine
            });
            
            const result = await FunctionCalling.executePedsaRetrieve(
                { query: '测试', top_k: 5 },
                sampleEntries
            );
            
            expect(result.success).toBe(true);
        });

        /**
         * Test default top_k value
         */
        it('should use default top_k of 10 when not specified', async () => {
            const MockEngine = createMockPedsaEngine();
            const FunctionCalling = createFunctionCallingModule({
                PedsaEngine: MockEngine
            });
            
            const result = await FunctionCalling.executePedsaRetrieve(
                { arguments: { query: '测试' } },
                sampleEntries
            );
            
            expect(result.success).toBe(true);
        });
    });
});

// ============================================================================
// formatToolResults Unit Tests
// ============================================================================

describe('formatToolResults Unit Tests', () => {
    let FunctionCalling;

    beforeEach(() => {
        FunctionCalling = createFunctionCallingModule();
    });

    const sampleEntries = [
        { uid: 1, key: '角色,主角', comment: '主角信息', content: '这是主角的详细描述，他在上海工作。' },
        { uid: 2, key: '地点,城市', comment: '城市信息', content: '上海是一个繁华的城市。' },
        { uid: 3, key: '事件,历史', comment: '历史事件', content: '2024年1月15日发生了重要事件。' }
    ];

    describe('Empty Results Handling', () => {
        /**
         * Test that empty results array returns appropriate message
         * **Validates: Requirements 6.5**
         */
        it('should return "No matching entries found" for empty results', () => {
            const result = FunctionCalling.formatToolResults([], sampleEntries);
            expect(result).toBe('No matching entries found for this query.');
        });

        /**
         * Test that null results returns appropriate message
         * **Validates: Requirements 6.5**
         */
        it('should return "No matching entries found" for null results', () => {
            const result = FunctionCalling.formatToolResults(null, sampleEntries);
            expect(result).toBe('No matching entries found for this query.');
        });

        /**
         * Test that undefined results returns appropriate message
         * **Validates: Requirements 6.5**
         */
        it('should return "No matching entries found" for undefined results', () => {
            const result = FunctionCalling.formatToolResults(undefined, sampleEntries);
            expect(result).toBe('No matching entries found for this query.');
        });
    });

    describe('Result Formatting', () => {
        /**
         * Test that formatted output includes entry comment/title
         * **Validates: Requirements 6.1**
         */
        it('should include entry comment in formatted output', () => {
            const results = [{ nodeId: 1, score: 0.95 }];
            const output = FunctionCalling.formatToolResults(results, sampleEntries);
            
            expect(output).toContain('主角信息');
        });

        /**
         * Test that formatted output includes entry keywords
         * **Validates: Requirements 6.2**
         */
        it('should include entry keywords in formatted output', () => {
            const results = [{ nodeId: 1, score: 0.95 }];
            const output = FunctionCalling.formatToolResults(results, sampleEntries);
            
            expect(output).toContain('Keywords:');
            expect(output).toContain('角色,主角');
        });

        /**
         * Test that formatted output includes content snippet
         * **Validates: Requirements 6.3**
         */
        it('should include content snippet in formatted output', () => {
            const results = [{ nodeId: 1, score: 0.95 }];
            const output = FunctionCalling.formatToolResults(results, sampleEntries);
            
            expect(output).toContain('这是主角的详细描述');
        });

        /**
         * Test that formatted output includes relevance score
         * **Validates: Requirements 6.4**
         */
        it('should include relevance score in formatted output', () => {
            const results = [{ nodeId: 1, score: 0.95 }];
            const output = FunctionCalling.formatToolResults(results, sampleEntries);
            
            expect(output).toContain('score: 0.95');
        });

        /**
         * Test that score is formatted to 2 decimal places
         */
        it('should format score to 2 decimal places', () => {
            const results = [{ nodeId: 1, score: 0.9567 }];
            const output = FunctionCalling.formatToolResults(results, sampleEntries);
            
            expect(output).toContain('score: 0.96');
        });

        /**
         * Test that multiple results are formatted correctly
         */
        it('should format multiple results correctly', () => {
            const results = [
                { nodeId: 1, score: 0.95 },
                { nodeId: 2, score: 0.85 }
            ];
            const output = FunctionCalling.formatToolResults(results, sampleEntries);
            
            expect(output).toContain('Found 2 relevant entries');
            expect(output).toContain('主角信息');
            expect(output).toContain('城市信息');
        });
    });

    describe('Content Truncation', () => {
        /**
         * Test that long content is truncated to 500 characters
         */
        it('should truncate content longer than 500 characters', () => {
            const longContent = 'A'.repeat(600);
            const entriesWithLongContent = [
                { uid: 1, key: 'test', comment: 'Test Entry', content: longContent }
            ];
            const results = [{ nodeId: 1, score: 0.9 }];
            
            const output = FunctionCalling.formatToolResults(results, entriesWithLongContent);
            
            // Should contain truncation indicator
            expect(output).toContain('...');
            // Should not contain full content
            expect(output).not.toContain(longContent);
        });

        /**
         * Test that short content is not truncated
         */
        it('should not truncate content shorter than 500 characters', () => {
            const shortContent = 'Short content';
            const entriesWithShortContent = [
                { uid: 1, key: 'test', comment: 'Test Entry', content: shortContent }
            ];
            const results = [{ nodeId: 1, score: 0.9 }];
            
            const output = FunctionCalling.formatToolResults(results, entriesWithShortContent);
            
            expect(output).toContain(shortContent);
            // Should not have truncation indicator after the content
            const contentIndex = output.indexOf(shortContent);
            const afterContent = output.slice(contentIndex + shortContent.length, contentIndex + shortContent.length + 5);
            expect(afterContent).not.toBe('...\n\n');
        });
    });

    describe('MaxLength Enforcement', () => {
        /**
         * Test that output respects maxLength parameter
         * **Validates: Requirements 6.6**
         */
        it('should truncate results when exceeding maxLength', () => {
            const results = [
                { nodeId: 1, score: 0.95 },
                { nodeId: 2, score: 0.85 },
                { nodeId: 3, score: 0.75 }
            ];
            
            // Use a very small maxLength to force truncation (header alone is ~30 chars)
            const output = FunctionCalling.formatToolResults(results, sampleEntries, 100);
            
            // Output must not exceed maxLength
            expect(output.length).toBeLessThanOrEqual(100);
        });

        /**
         * Test that default maxLength is 4000
         */
        it('should use default maxLength of 4000', () => {
            const results = [{ nodeId: 1, score: 0.95 }];
            const output = FunctionCalling.formatToolResults(results, sampleEntries);
            
            // With default maxLength, single result should not be truncated
            expect(output).not.toContain('more results truncated');
        });
    });

    describe('Node ID Format Handling', () => {
        /**
         * Test that nodeId format (PEDSA-JS) is handled correctly
         */
        it('should handle nodeId format from PEDSA-JS', () => {
            const results = [{ nodeId: 1, score: 0.95 }];
            const output = FunctionCalling.formatToolResults(results, sampleEntries);
            
            expect(output).toContain('主角信息');
        });

        /**
         * Test that node_id format (PEDSA-WASM) is handled correctly
         */
        it('should handle node_id format from PEDSA-WASM', () => {
            const results = [{ node_id: 1, score: 0.95 }];
            const output = FunctionCalling.formatToolResults(results, sampleEntries);
            
            expect(output).toContain('主角信息');
        });
    });

    describe('Missing Entry Handling', () => {
        /**
         * Test handling when entry is not found in entries map
         */
        it('should handle results with no matching entry', () => {
            const results = [{ nodeId: 999, score: 0.95, content: 'Fallback content' }];
            const output = FunctionCalling.formatToolResults(results, sampleEntries);
            
            // Should use fallback content from result
            expect(output).toContain('Fallback content');
            expect(output).toContain('Entry 999');
        });

        /**
         * Test handling when entries array is empty
         */
        it('should handle empty entries array', () => {
            const results = [{ nodeId: 1, score: 0.95, content: 'Result content' }];
            const output = FunctionCalling.formatToolResults(results, []);
            
            expect(output).toContain('Result content');
        });

        /**
         * Test handling when entries is null
         */
        it('should handle null entries', () => {
            const results = [{ nodeId: 1, score: 0.95, content: 'Result content' }];
            const output = FunctionCalling.formatToolResults(results, null);
            
            expect(output).toContain('Result content');
        });
    });

    describe('Array Key Handling', () => {
        /**
         * Test that array keys are joined correctly
         */
        it('should join array keys with comma', () => {
            const entriesWithArrayKey = [
                { uid: 1, key: ['角色', '主角', '英雄'], comment: 'Test', content: 'Content' }
            ];
            const results = [{ nodeId: 1, score: 0.9 }];
            
            const output = FunctionCalling.formatToolResults(results, entriesWithArrayKey);
            
            expect(output).toContain('角色, 主角, 英雄');
        });
    });
});


// ============================================================================
// parseAIResponse Unit Tests
// ============================================================================

describe('parseAIResponse Unit Tests', () => {
    let FunctionCalling;

    beforeEach(() => {
        FunctionCalling = createFunctionCallingModule();
    });

    describe('Normal Response Parsing', () => {
        /**
         * Test parsing a normal text response
         * **Validates: Requirements 5.4**
         */
        it('should parse response with content and no tool_calls', () => {
            const data = {
                choices: [{
                    message: {
                        content: 'This is the AI response.',
                        tool_calls: undefined
                    }
                }]
            };

            const result = FunctionCalling.parseAIResponse(data);

            expect(result.content).toBe('This is the AI response.');
            expect(result.tool_calls).toBeNull();
        });

        /**
         * Test parsing response with tool_calls
         * **Validates: Requirements 5.4**
         */
        it('should parse response with tool_calls', () => {
            const data = {
                choices: [{
                    message: {
                        content: '',
                        tool_calls: [{
                            id: 'call_123',
                            function: {
                                name: 'pedsa_retrieve',
                                arguments: '{"query":"test query","top_k":5}'
                            }
                        }]
                    }
                }]
            };

            const result = FunctionCalling.parseAIResponse(data);

            expect(result.content).toBe('');
            expect(result.tool_calls).not.toBeNull();
            expect(result.tool_calls).toHaveLength(1);
            expect(result.tool_calls[0].id).toBe('call_123');
            expect(result.tool_calls[0].name).toBe('pedsa_retrieve');
            expect(result.tool_calls[0].arguments.query).toBe('test query');
            expect(result.tool_calls[0].arguments.top_k).toBe(5);
        });

        /**
         * Test parsing response with multiple tool_calls
         */
        it('should parse response with multiple tool_calls', () => {
            const data = {
                choices: [{
                    message: {
                        content: '',
                        tool_calls: [
                            {
                                id: 'call_1',
                                function: {
                                    name: 'pedsa_retrieve',
                                    arguments: '{"query":"first query"}'
                                }
                            },
                            {
                                id: 'call_2',
                                function: {
                                    name: 'pedsa_retrieve',
                                    arguments: '{"query":"second query"}'
                                }
                            }
                        ]
                    }
                }]
            };

            const result = FunctionCalling.parseAIResponse(data);

            expect(result.tool_calls).toHaveLength(2);
            expect(result.tool_calls[0].arguments.query).toBe('first query');
            expect(result.tool_calls[1].arguments.query).toBe('second query');
        });
    });

    describe('Malformed Response Handling', () => {
        /**
         * Test handling of empty/null data
         * **Validates: Requirements 5.5**
         */
        it('should handle null data gracefully', () => {
            const result = FunctionCalling.parseAIResponse(null);
            expect(result.content).toBe('');
            expect(result.tool_calls).toBeNull();
        });

        /**
         * Test handling of missing choices
         * **Validates: Requirements 5.5**
         */
        it('should handle missing choices gracefully', () => {
            const result = FunctionCalling.parseAIResponse({});
            expect(result.content).toBe('');
            expect(result.tool_calls).toBeNull();
        });

        /**
         * Test handling of empty choices array
         * **Validates: Requirements 5.5**
         */
        it('should handle empty choices array gracefully', () => {
            const result = FunctionCalling.parseAIResponse({ choices: [] });
            expect(result.content).toBe('');
            expect(result.tool_calls).toBeNull();
        });

        /**
         * Test handling of missing message in choice
         * **Validates: Requirements 5.5**
         */
        it('should handle missing message in choice', () => {
            const result = FunctionCalling.parseAIResponse({ choices: [{}] });
            expect(result.content).toBe('');
            expect(result.tool_calls).toBeNull();
        });

        /**
         * Test handling of malformed tool call arguments (invalid JSON)
         * **Validates: Requirements 5.5**
         */
        it('should handle malformed tool call arguments', () => {
            const data = {
                choices: [{
                    message: {
                        content: '',
                        tool_calls: [{
                            id: 'call_bad',
                            function: {
                                name: 'pedsa_retrieve',
                                arguments: 'not valid json {'
                            }
                        }]
                    }
                }]
            };

            const result = FunctionCalling.parseAIResponse(data);

            expect(result.tool_calls).toHaveLength(1);
            expect(result.tool_calls[0].id).toBe('call_bad');
            expect(result.tool_calls[0].name).toBe('pedsa_retrieve');
            // Arguments should be empty object on parse failure
            expect(result.tool_calls[0].arguments).toEqual({});
        });

        /**
         * Test handling of tool_calls that are already objects (not JSON strings)
         */
        it('should handle tool call arguments that are already objects', () => {
            const data = {
                choices: [{
                    message: {
                        content: '',
                        tool_calls: [{
                            id: 'call_obj',
                            function: {
                                name: 'pedsa_retrieve',
                                arguments: { query: 'already parsed' }
                            }
                        }]
                    }
                }]
            };

            const result = FunctionCalling.parseAIResponse(data);

            expect(result.tool_calls[0].arguments.query).toBe('already parsed');
        });

        /**
         * Test handling of empty tool_calls array
         */
        it('should treat empty tool_calls array as no tool calls', () => {
            const data = {
                choices: [{
                    message: {
                        content: 'Final answer',
                        tool_calls: []
                    }
                }]
            };

            const result = FunctionCalling.parseAIResponse(data);

            expect(result.content).toBe('Final answer');
            expect(result.tool_calls).toBeNull();
        });
    });
});

// ============================================================================
// callAIWithTools Unit Tests
// ============================================================================

describe('callAIWithTools Unit Tests', () => {
    /**
     * Helper: create a mock WBAP with API endpoints and a mock fetch
     */
    function createMockWBAPWithFetch(fetchFn, endpoints = null) {
        const defaultEndpoints = endpoints || [{
            id: 'ep1',
            apiUrl: 'https://api.example.com/v1/chat/completions',
            apiKey: 'test-key-123',
            model: 'gpt-4',
            enabled: true
        }];

        return {
            Logger: { log: () => {}, warn: () => {}, error: () => {} },
            getGlobalPools: () => ({
                selectiveMode: {
                    apiEndpoints: defaultEndpoints
                }
            }),
            _fetchFn: fetchFn
        };
    }

    /**
     * Helper: create a mock fetch that returns a given response
     */
    function createMockFetch(responseData, statusCode = 200) {
        return async (url, options) => ({
            ok: statusCode >= 200 && statusCode < 300,
            status: statusCode,
            statusText: statusCode === 200 ? 'OK' : 'Error',
            json: async () => responseData,
            text: async () => JSON.stringify(responseData)
        });
    }

    describe('Payload Construction', () => {
        /**
         * Test that payload includes model, messages, temperature, max_tokens
         * **Validates: Requirements 5.1, 5.3**
         */
        it('should build payload with correct base parameters', async () => {
            let capturedPayload = null;
            const mockFetch = async (url, options) => {
                capturedPayload = JSON.parse(options.body);
                return {
                    ok: true,
                    json: async () => ({ choices: [{ message: { content: 'ok' } }] })
                };
            };

            const mockWBAP = createMockWBAPWithFetch(mockFetch);
            const FC = createFunctionCallingModule(mockWBAP);

            const messages = [
                { role: 'system', content: 'You are helpful.' },
                { role: 'user', content: 'Hello' }
            ];

            await FC.callAIWithTools({ model: 'gpt-4' }, messages, []);

            expect(capturedPayload.model).toBe('gpt-4');
            expect(capturedPayload.messages).toEqual(messages);
            expect(capturedPayload.temperature).toBe(0.3);
            expect(capturedPayload.max_tokens).toBe(1000);
        });

        /**
         * Test that tools and tool_choice are added when tools provided
         * **Validates: Requirements 5.1, 5.2**
         */
        it('should include tools and tool_choice when tools provided', async () => {
            let capturedPayload = null;
            const mockFetch = async (url, options) => {
                capturedPayload = JSON.parse(options.body);
                return {
                    ok: true,
                    json: async () => ({ choices: [{ message: { content: 'ok' } }] })
                };
            };

            const mockWBAP = createMockWBAPWithFetch(mockFetch);
            const FC = createFunctionCallingModule(mockWBAP);

            const tools = [FC.getPedsaToolDefinition()];
            await FC.callAIWithTools({ model: 'gpt-4' }, [], tools);

            expect(capturedPayload.tools).toEqual(tools);
            expect(capturedPayload.tool_choice).toBe('auto');
        });

        /**
         * Test that tools/tool_choice are NOT added when tools array is empty
         * **Validates: Requirements 5.1**
         */
        it('should not include tools when tools array is empty', async () => {
            let capturedPayload = null;
            const mockFetch = async (url, options) => {
                capturedPayload = JSON.parse(options.body);
                return {
                    ok: true,
                    json: async () => ({ choices: [{ message: { content: 'ok' } }] })
                };
            };

            const mockWBAP = createMockWBAPWithFetch(mockFetch);
            const FC = createFunctionCallingModule(mockWBAP);

            await FC.callAIWithTools({ model: 'gpt-4' }, [], []);

            expect(capturedPayload.tools).toBeUndefined();
            expect(capturedPayload.tool_choice).toBeUndefined();
        });

        /**
         * Test that custom tool_choice is respected
         */
        it('should use custom tool_choice from options', async () => {
            let capturedPayload = null;
            const mockFetch = async (url, options) => {
                capturedPayload = JSON.parse(options.body);
                return {
                    ok: true,
                    json: async () => ({ choices: [{ message: { content: 'ok' } }] })
                };
            };

            const mockWBAP = createMockWBAPWithFetch(mockFetch);
            const FC = createFunctionCallingModule(mockWBAP);

            const tools = [FC.getPedsaToolDefinition()];
            await FC.callAIWithTools({ model: 'gpt-4' }, [], tools, { tool_choice: 'none' });

            expect(capturedPayload.tool_choice).toBe('none');
        });

        /**
         * Test that existing parameters are preserved when adding tools
         * **Validates: Requirements 5.3**
         */
        it('should preserve all base parameters when tools are added', async () => {
            let capturedPayload = null;
            const mockFetch = async (url, options) => {
                capturedPayload = JSON.parse(options.body);
                return {
                    ok: true,
                    json: async () => ({ choices: [{ message: { content: 'ok' } }] })
                };
            };

            const mockWBAP = createMockWBAPWithFetch(mockFetch);
            const FC = createFunctionCallingModule(mockWBAP);

            const messages = [{ role: 'user', content: 'test' }];
            const tools = [FC.getPedsaToolDefinition()];

            await FC.callAIWithTools(
                { model: 'gpt-4' },
                messages,
                tools,
                { temperature: 0.7, max_tokens: 2000 }
            );

            // Base parameters preserved
            expect(capturedPayload.model).toBe('gpt-4');
            expect(capturedPayload.messages).toEqual(messages);
            expect(capturedPayload.temperature).toBe(0.7);
            expect(capturedPayload.max_tokens).toBe(2000);
            // Tools added
            expect(capturedPayload.tools).toEqual(tools);
        });
    });

    describe('Response Handling', () => {
        /**
         * Test that response is parsed correctly
         * **Validates: Requirements 5.4**
         */
        it('should return parsed response with content', async () => {
            const mockFetch = createMockFetch({
                choices: [{ message: { content: 'AI response text' } }]
            });

            const mockWBAP = createMockWBAPWithFetch(mockFetch);
            const FC = createFunctionCallingModule(mockWBAP);

            const result = await FC.callAIWithTools({ model: 'gpt-4' }, [], []);

            expect(result.content).toBe('AI response text');
            expect(result.tool_calls).toBeNull();
        });

        /**
         * Test that tool_calls in response are parsed
         * **Validates: Requirements 5.4**
         */
        it('should return parsed tool_calls from response', async () => {
            const mockFetch = createMockFetch({
                choices: [{
                    message: {
                        content: '',
                        tool_calls: [{
                            id: 'call_abc',
                            function: {
                                name: 'pedsa_retrieve',
                                arguments: '{"query":"search term"}'
                            }
                        }]
                    }
                }]
            });

            const mockWBAP = createMockWBAPWithFetch(mockFetch);
            const FC = createFunctionCallingModule(mockWBAP);

            const result = await FC.callAIWithTools({ model: 'gpt-4' }, [], [FC.getPedsaToolDefinition()]);

            expect(result.tool_calls).toHaveLength(1);
            expect(result.tool_calls[0].name).toBe('pedsa_retrieve');
            expect(result.tool_calls[0].arguments.query).toBe('search term');
        });
    });

    describe('Error Handling', () => {
        /**
         * Test error when no API endpoint available
         */
        it('should throw when no API endpoint available', async () => {
            const mockWBAP = {
                Logger: { log: () => {}, warn: () => {}, error: () => {} },
                getGlobalPools: () => ({ selectiveMode: { apiEndpoints: [] } })
            };
            const FC = createFunctionCallingModule(mockWBAP);

            await expect(
                FC.callAIWithTools({ model: 'gpt-4' }, [], [])
            ).rejects.toThrow('No API endpoint available');
        });

        /**
         * Test error when API returns non-OK status
         */
        it('should throw on non-OK API response', async () => {
            const mockFetch = createMockFetch({ error: 'bad request' }, 400);
            const mockWBAP = createMockWBAPWithFetch(mockFetch);
            const FC = createFunctionCallingModule(mockWBAP);

            await expect(
                FC.callAIWithTools({ model: 'gpt-4' }, [], [])
            ).rejects.toThrow('API request failed');
        });
    });

    describe('API Config Resolution', () => {
        /**
         * Test that model from agentConfig takes priority
         */
        it('should use model from agentConfig over endpoint model', async () => {
            let capturedPayload = null;
            const mockFetch = async (url, options) => {
                capturedPayload = JSON.parse(options.body);
                return {
                    ok: true,
                    json: async () => ({ choices: [{ message: { content: 'ok' } }] })
                };
            };

            const mockWBAP = createMockWBAPWithFetch(mockFetch, [{
                id: 'ep1',
                apiUrl: 'https://api.example.com/v1/chat/completions',
                apiKey: 'key',
                model: 'endpoint-model',
                enabled: true
            }]);
            const FC = createFunctionCallingModule(mockWBAP);

            await FC.callAIWithTools({ model: 'agent-model' }, [], []);

            expect(capturedPayload.model).toBe('agent-model');
        });

        /**
         * Test that endpoint model is used when agentConfig has no model
         */
        it('should fall back to endpoint model when agentConfig has no model', async () => {
            let capturedPayload = null;
            const mockFetch = async (url, options) => {
                capturedPayload = JSON.parse(options.body);
                return {
                    ok: true,
                    json: async () => ({ choices: [{ message: { content: 'ok' } }] })
                };
            };

            const mockWBAP = createMockWBAPWithFetch(mockFetch, [{
                id: 'ep1',
                apiUrl: 'https://api.example.com/v1/chat/completions',
                apiKey: 'key',
                model: 'endpoint-model',
                enabled: true
            }]);
            const FC = createFunctionCallingModule(mockWBAP);

            await FC.callAIWithTools({}, [], []);

            expect(capturedPayload.model).toBe('endpoint-model');
        });

        /**
         * Test that correct API URL and key are used
         */
        it('should send request to correct API URL with auth header', async () => {
            let capturedUrl = null;
            let capturedHeaders = null;
            const mockFetch = async (url, options) => {
                capturedUrl = url;
                capturedHeaders = options.headers;
                return {
                    ok: true,
                    json: async () => ({ choices: [{ message: { content: 'ok' } }] })
                };
            };

            const mockWBAP = createMockWBAPWithFetch(mockFetch, [{
                id: 'ep1',
                apiUrl: 'https://my-api.com/v1/chat/completions',
                apiKey: 'sk-secret',
                model: 'gpt-4',
                enabled: true
            }]);
            const FC = createFunctionCallingModule(mockWBAP);

            await FC.callAIWithTools({ model: 'gpt-4' }, [], []);

            expect(capturedUrl).toBe('https://my-api.com/v1/chat/completions');
            expect(capturedHeaders['Authorization']).toBe('Bearer sk-secret');
        });
    });
});


// ============================================================================
// callAgentWithTools (Conversation Loop) Unit Tests
// ============================================================================

describe('callAgentWithTools Conversation Loop Unit Tests', () => {
    /**
     * Helper: create a mock WBAP with API endpoints and a mock fetch
     */
    function createMockWBAPWithFetch(fetchFn) {
        return {
            Logger: { log: () => {}, warn: () => {}, error: () => {} },
            getGlobalPools: () => ({
                selectiveMode: {
                    apiEndpoints: [{
                        id: 'ep1',
                        apiUrl: 'https://api.example.com/v1/chat/completions',
                        apiKey: 'test-key',
                        model: 'test-model',
                        enabled: true
                    }]
                }
            }),
            _fetchFn: fetchFn
        };
    }

    const sampleEntries = [
        { uid: 1, key: '角色,主角', comment: '主角信息', content: '这是主角的详细描述。' },
        { uid: 2, key: '地点,城市', comment: '城市信息', content: '上海是一个繁华的城市。' }
    ];

    describe('Single Round - No Tool Calls', () => {
        /**
         * Test that when AI responds without tool_calls, the loop terminates
         * immediately and returns the content as the final answer.
         * **Validates: Requirements 3.4**
         */
        it('should return final answer when AI responds without tool_calls', async () => {
            let callCount = 0;
            const mockFetch = async (url, options) => {
                callCount++;
                return {
                    ok: true,
                    json: async () => ({
                        choices: [{
                            message: { content: 'Here is my analysis of the worldbook.' }
                        }]
                    })
                };
            };

            const mockWBAP = createMockWBAPWithFetch(mockFetch);
            const FC = createFunctionCallingModule(mockWBAP);

            const result = await FC.callAgentWithTools(
                'archivist',
                { model: 'test-model' },
                'Tell me about the protagonist',
                'Some context',
                sampleEntries,
                { maxRounds: 3 }
            );

            expect(result.type).toBe('archivist');
            expect(result.result).toBe('Here is my analysis of the worldbook.');
            expect(result.rounds).toBe(1);
            // Only one API call should have been made
            expect(callCount).toBe(1);
        });

        /**
         * Test that the result includes the correct agent type
         * **Validates: Requirements 3.4**
         */
        it('should preserve agent type in result for all agent types', async () => {
            const mockFetch = async () => ({
                ok: true,
                json: async () => ({
                    choices: [{ message: { content: 'Done.' } }]
                })
            });

            const mockWBAP = createMockWBAPWithFetch(mockFetch);
            const FC = createFunctionCallingModule(mockWBAP);

            for (const agentType of ['archivist', 'historian', 'status_reader']) {
                const result = await FC.callAgentWithTools(
                    agentType,
                    { model: 'test-model' },
                    'query',
                    '',
                    sampleEntries,
                    { maxRounds: 3 }
                );
                expect(result.type).toBe(agentType);
            }
        });
    });

    describe('Multi-Round with Tool Calls', () => {
        /**
         * Test that when AI issues a tool_call, the tool is executed and the
         * result is appended to the conversation before re-invoking the AI.
         * **Validates: Requirements 3.2, 3.3**
         */
        it('should execute tool call and re-invoke AI with results', async () => {
            let callCount = 0;
            const capturedBodies = [];

            const mockFetch = async (url, options) => {
                callCount++;
                capturedBodies.push(JSON.parse(options.body));

                if (callCount === 1) {
                    // First call: AI requests a tool call
                    return {
                        ok: true,
                        json: async () => ({
                            choices: [{
                                message: {
                                    content: '',
                                    tool_calls: [{
                                        id: 'call_1',
                                        function: {
                                            name: 'pedsa_retrieve',
                                            arguments: '{"query":"protagonist info"}'
                                        }
                                    }]
                                }
                            }]
                        })
                    };
                }

                // Second call: AI returns final answer
                return {
                    ok: true,
                    json: async () => ({
                        choices: [{
                            message: { content: 'Based on the retrieval results, the protagonist works in Shanghai.' }
                        }]
                    })
                };
            };

            const mockWBAP = createMockWBAPWithFetch(mockFetch);
            // Add a PEDSA engine so tool execution succeeds
            mockWBAP.PedsaEngine = createMockPedsaEngine();
            const FC = createFunctionCallingModule(mockWBAP);

            const result = await FC.callAgentWithTools(
                'archivist',
                { model: 'test-model' },
                'Tell me about the protagonist',
                '',
                sampleEntries,
                { maxRounds: 5 }
            );

            // Should have completed in 2 rounds
            expect(result.rounds).toBe(2);
            expect(result.result).toBe('Based on the retrieval results, the protagonist works in Shanghai.');
            expect(callCount).toBe(2);

            // Second API call should include assistant message with tool_calls
            // and a tool result message
            const secondCallMessages = capturedBodies[1].messages;
            const assistantMsg = secondCallMessages.find(m => m.role === 'assistant' && m.tool_calls);
            expect(assistantMsg).toBeDefined();
            expect(assistantMsg.tool_calls[0].id).toBe('call_1');

            const toolMsg = secondCallMessages.find(m => m.role === 'tool');
            expect(toolMsg).toBeDefined();
            expect(toolMsg.tool_call_id).toBe('call_1');
            expect(typeof toolMsg.content).toBe('string');
        });

        /**
         * Test multi-round: AI makes two sequential tool calls across rounds
         * **Validates: Requirements 3.2, 3.3**
         */
        it('should handle multiple rounds of tool calls', async () => {
            let callCount = 0;

            const mockFetch = async (url, options) => {
                callCount++;

                if (callCount <= 2) {
                    // Rounds 1 and 2: AI requests tool calls
                    return {
                        ok: true,
                        json: async () => ({
                            choices: [{
                                message: {
                                    content: '',
                                    tool_calls: [{
                                        id: `call_${callCount}`,
                                        function: {
                                            name: 'pedsa_retrieve',
                                            arguments: `{"query":"round ${callCount} query"}`
                                        }
                                    }]
                                }
                            }]
                        })
                    };
                }

                // Round 3: AI returns final answer
                return {
                    ok: true,
                    json: async () => ({
                        choices: [{
                            message: { content: 'Final answer after 2 tool calls.' }
                        }]
                    })
                };
            };

            const mockWBAP = createMockWBAPWithFetch(mockFetch);
            mockWBAP.PedsaEngine = createMockPedsaEngine();
            const FC = createFunctionCallingModule(mockWBAP);

            const result = await FC.callAgentWithTools(
                'historian',
                { model: 'test-model' },
                'Timeline of events',
                '',
                sampleEntries,
                { maxRounds: 5 }
            );

            expect(result.rounds).toBe(3);
            expect(result.result).toBe('Final answer after 2 tool calls.');
            expect(callCount).toBe(3);
        });

        /**
         * Test that tool execution errors are passed back as error strings
         * **Validates: Requirements 3.2, 3.3**
         */
        it('should pass tool execution errors as content to AI', async () => {
            let callCount = 0;
            const capturedBodies = [];

            const mockFetch = async (url, options) => {
                callCount++;
                capturedBodies.push(JSON.parse(options.body));

                if (callCount === 1) {
                    return {
                        ok: true,
                        json: async () => ({
                            choices: [{
                                message: {
                                    content: '',
                                    tool_calls: [{
                                        id: 'call_err',
                                        function: {
                                            name: 'pedsa_retrieve',
                                            arguments: '{"query":"test"}'
                                        }
                                    }]
                                }
                            }]
                        })
                    };
                }

                return {
                    ok: true,
                    json: async () => ({
                        choices: [{ message: { content: 'Handled the error.' } }]
                    })
                };
            };

            // No PEDSA engines — tool execution will return error
            const mockWBAP = createMockWBAPWithFetch(mockFetch);
            const FC = createFunctionCallingModule(mockWBAP);

            const result = await FC.callAgentWithTools(
                'archivist',
                { model: 'test-model' },
                'query',
                '',
                sampleEntries,
                { maxRounds: 3 }
            );

            expect(result.result).toBe('Handled the error.');

            // The tool message in the second call should contain the error
            const secondCallMessages = capturedBodies[1].messages;
            const toolMsg = secondCallMessages.find(m => m.role === 'tool');
            expect(toolMsg.content).toContain('Error:');
        });
    });

    describe('Max Rounds Enforcement', () => {
        /**
         * Test that the loop terminates at maxRounds even if AI keeps
         * requesting tool calls, and forces a final response.
         * **Validates: Requirements 3.5**
         */
        it('should force final response when maxRounds is reached', async () => {
            let callCount = 0;

            const mockFetch = async (url, options) => {
                callCount++;
                const body = JSON.parse(options.body);
                const hasTools = body.tools && body.tools.length > 0;

                if (!hasTools) {
                    // Forced final call (no tools)
                    return {
                        ok: true,
                        json: async () => ({
                            choices: [{ message: { content: 'Forced final answer.' } }]
                        })
                    };
                }

                // Always return tool calls to exhaust rounds
                return {
                    ok: true,
                    json: async () => ({
                        choices: [{
                            message: {
                                content: '',
                                tool_calls: [{
                                    id: `call_${callCount}`,
                                    function: {
                                        name: 'pedsa_retrieve',
                                        arguments: '{"query":"keep going"}'
                                    }
                                }]
                            }
                        }]
                    })
                };
            };

            const mockWBAP = createMockWBAPWithFetch(mockFetch);
            const FC = createFunctionCallingModule(mockWBAP);

            const result = await FC.callAgentWithTools(
                'status_reader',
                { model: 'test-model' },
                'query',
                '',
                sampleEntries,
                { maxRounds: 2 }
            );

            // Should have used exactly maxRounds
            expect(result.rounds).toBe(2);
            expect(result.result).toBe('Forced final answer.');
            // maxRounds tool-call rounds + 1 forced final = 3 total API calls
            expect(callCount).toBe(3);
        });

        /**
         * Test that maxRounds=1 allows only one tool-call round
         * **Validates: Requirements 3.5**
         */
        it('should enforce maxRounds=1 correctly', async () => {
            let callCount = 0;

            const mockFetch = async (url, options) => {
                callCount++;
                const body = JSON.parse(options.body);
                const hasTools = body.tools && body.tools.length > 0;

                if (!hasTools) {
                    return {
                        ok: true,
                        json: async () => ({
                            choices: [{ message: { content: 'Done after 1 round.' } }]
                        })
                    };
                }

                return {
                    ok: true,
                    json: async () => ({
                        choices: [{
                            message: {
                                content: '',
                                tool_calls: [{
                                    id: `call_${callCount}`,
                                    function: {
                                        name: 'pedsa_retrieve',
                                        arguments: '{"query":"test"}'
                                    }
                                }]
                            }
                        }]
                    })
                };
            };

            const mockWBAP = createMockWBAPWithFetch(mockFetch);
            const FC = createFunctionCallingModule(mockWBAP);

            const result = await FC.callAgentWithTools(
                'archivist',
                { model: 'test-model' },
                'query',
                '',
                sampleEntries,
                { maxRounds: 1 }
            );

            expect(result.rounds).toBe(1);
            expect(result.result).toBe('Done after 1 round.');
            // 1 tool-call round + 1 forced final = 2 API calls
            expect(callCount).toBe(2);
        });

        /**
         * Test that default maxRounds is 3 when not specified
         * **Validates: Requirements 3.5**
         */
        it('should default to maxRounds=3 when not specified', async () => {
            let callCount = 0;

            const mockFetch = async (url, options) => {
                callCount++;
                const body = JSON.parse(options.body);
                const hasTools = body.tools && body.tools.length > 0;

                if (!hasTools) {
                    return {
                        ok: true,
                        json: async () => ({
                            choices: [{ message: { content: 'Final.' } }]
                        })
                    };
                }

                return {
                    ok: true,
                    json: async () => ({
                        choices: [{
                            message: {
                                content: '',
                                tool_calls: [{
                                    id: `call_${callCount}`,
                                    function: {
                                        name: 'pedsa_retrieve',
                                        arguments: '{"query":"test"}'
                                    }
                                }]
                            }
                        }]
                    })
                };
            };

            const mockWBAP = createMockWBAPWithFetch(mockFetch);
            const FC = createFunctionCallingModule(mockWBAP);

            const result = await FC.callAgentWithTools(
                'archivist',
                { model: 'test-model' },
                'query',
                '',
                sampleEntries,
                {} // empty config — should default to maxRounds=3
            );

            expect(result.rounds).toBe(3);
            // 3 tool-call rounds + 1 forced final = 4 API calls
            expect(callCount).toBe(4);
        });
    });
});


// ============================================================================
// FC Mode Routing Unit Tests (Task 8.4)
// Tests that callAgent in SuperMemory correctly routes to FC mode or legacy mode
// **Validates: Requirements 4.4, 4.5**
// ============================================================================

describe('FC Mode Routing Unit Tests', () => {
    /**
     * Creates a mock SuperMemory.callAgent that mirrors the routing logic
     * from super_memory.js, allowing us to test FC vs legacy routing.
     */
    function createCallAgentWithRouting(options = {}) {
        const {
            fcEnabled = false,
            fcAgents = {},
            maxRounds = 3,
            maxResultLength = 4000,
            hasFunctionCallingModule = true,
            callAgentWithToolsResult = null,
            callAgentWithToolsShouldThrow = false,
            legacyCallAIResult = 'Legacy response',
            legacyCallAIShouldThrow = false,
        } = options;

        const calls = {
            callAgentWithTools: [],
            callAI: [],
        };

        // Mock getFunctionCallingConfig
        function getFunctionCallingConfig() {
            return {
                enabled: fcEnabled,
                maxRounds,
                maxResultLength,
                agents: fcAgents,
            };
        }

        // Mock WBAP.FunctionCalling.callAgentWithTools
        const mockCallAgentWithTools = async (agentType, agentConfig, userInput, context, worldbookContent, fcConfig) => {
            calls.callAgentWithTools.push({ agentType, agentConfig, userInput, context, worldbookContent, fcConfig });
            if (callAgentWithToolsShouldThrow) {
                throw new Error('FC mode failed');
            }
            return callAgentWithToolsResult || { type: agentType, result: 'FC response', rounds: 1 };
        };

        // Mock WBAP.callAI (legacy path)
        const mockCallAI = async (model, userPrompt, systemPrompt, apiOptions) => {
            calls.callAI.push({ model, userPrompt, systemPrompt, apiOptions });
            if (legacyCallAIShouldThrow) {
                throw new Error('Legacy API failed');
            }
            return legacyCallAIResult;
        };

        // Replicate the callAgent routing logic from super_memory.js
        async function callAgent(agentType, agentConfig, userInput, context, worldbookContent, graphResult = null) {
            if (!agentConfig) {
                return { type: agentType, result: null, error: 'No config' };
            }

            // ===== Function Calling mode routing =====
            const fcConfig = getFunctionCallingConfig();
            const FunctionCalling = hasFunctionCallingModule ? { callAgentWithTools: mockCallAgentWithTools } : null;

            if (fcConfig.enabled && FunctionCalling?.callAgentWithTools) {
                const agentFcOverride = fcConfig.agents?.[agentType];
                const agentFcEnabled = agentFcOverride?.enabled !== false;

                if (agentFcEnabled) {
                    try {
                        return await FunctionCalling.callAgentWithTools(
                            agentType,
                            agentConfig,
                            userInput,
                            context,
                            worldbookContent,
                            fcConfig
                        );
                    } catch (e) {
                        // Fall back to legacy mode
                    }
                }
            }

            // ===== Legacy mode =====
            try {
                const response = await mockCallAI(
                    agentConfig.model || 'default-model',
                    userInput,
                    agentConfig.systemPrompt || '',
                    {}
                );
                return {
                    type: agentType,
                    result: typeof response === 'string' ? response : (response?.content || ''),
                    error: null
                };
            } catch (e) {
                return { type: agentType, result: null, error: e.message };
            }
        }

        return { callAgent, calls };
    }

    const sampleEntries = [
        { uid: 1, key: 'test', comment: 'Test', content: 'Test content' }
    ];

    describe('FC Enabled Routes to callAgentWithTools', () => {
        /**
         * Test that when FC is globally enabled, callAgent routes to callAgentWithTools
         * **Validates: Requirements 4.4**
         */
        it('should route to callAgentWithTools when FC is enabled', async () => {
            const { callAgent, calls } = createCallAgentWithRouting({
                fcEnabled: true,
            });

            const result = await callAgent(
                'archivist',
                { model: 'test-model' },
                'test input',
                'context',
                sampleEntries
            );

            expect(result.result).toBe('FC response');
            expect(calls.callAgentWithTools).toHaveLength(1);
            expect(calls.callAI).toHaveLength(0);
        });

        /**
         * Test that callAgentWithTools receives correct parameters
         * **Validates: Requirements 4.4**
         */
        it('should pass correct parameters to callAgentWithTools', async () => {
            const { callAgent, calls } = createCallAgentWithRouting({
                fcEnabled: true,
                maxRounds: 5,
                maxResultLength: 8000,
            });

            await callAgent(
                'historian',
                { model: 'gpt-4', systemPrompt: 'You are a historian.' },
                'timeline query',
                'some context',
                sampleEntries
            );

            const call = calls.callAgentWithTools[0];
            expect(call.agentType).toBe('historian');
            expect(call.agentConfig.model).toBe('gpt-4');
            expect(call.userInput).toBe('timeline query');
            expect(call.context).toBe('some context');
            expect(call.worldbookContent).toBe(sampleEntries);
            expect(call.fcConfig.maxRounds).toBe(5);
            expect(call.fcConfig.maxResultLength).toBe(8000);
        });

        /**
         * Test that all three agent types route to FC when enabled
         * **Validates: Requirements 4.1, 4.2, 4.3, 4.4**
         */
        it('should route all agent types to FC mode when enabled', async () => {
            for (const agentType of ['archivist', 'historian', 'status_reader']) {
                const { callAgent, calls } = createCallAgentWithRouting({
                    fcEnabled: true,
                });

                const result = await callAgent(
                    agentType,
                    { model: 'test-model' },
                    'query',
                    '',
                    sampleEntries
                );

                expect(result.result).toBe('FC response');
                expect(calls.callAgentWithTools).toHaveLength(1);
                expect(calls.callAI).toHaveLength(0);
            }
        });
    });

    describe('FC Disabled Uses Legacy callAgent', () => {
        /**
         * Test that when FC is disabled, callAgent uses legacy WBAP.callAI path
         * **Validates: Requirements 4.5**
         */
        it('should use legacy path when FC is disabled', async () => {
            const { callAgent, calls } = createCallAgentWithRouting({
                fcEnabled: false,
            });

            const result = await callAgent(
                'archivist',
                { model: 'test-model' },
                'test input',
                'context',
                sampleEntries
            );

            expect(result.result).toBe('Legacy response');
            expect(calls.callAgentWithTools).toHaveLength(0);
            expect(calls.callAI).toHaveLength(1);
        });

        /**
         * Test that legacy path is used when FunctionCalling module is not loaded
         * **Validates: Requirements 4.5**
         */
        it('should use legacy path when FunctionCalling module is unavailable', async () => {
            const { callAgent, calls } = createCallAgentWithRouting({
                fcEnabled: true,
                hasFunctionCallingModule: false,
            });

            const result = await callAgent(
                'archivist',
                { model: 'test-model' },
                'test input',
                'context',
                sampleEntries
            );

            expect(result.result).toBe('Legacy response');
            expect(calls.callAgentWithTools).toHaveLength(0);
            expect(calls.callAI).toHaveLength(1);
        });

        /**
         * Test fallback to legacy when FC mode throws an error
         * **Validates: Requirements 4.4, 4.5**
         */
        it('should fall back to legacy path when FC mode throws', async () => {
            const { callAgent, calls } = createCallAgentWithRouting({
                fcEnabled: true,
                callAgentWithToolsShouldThrow: true,
            });

            const result = await callAgent(
                'archivist',
                { model: 'test-model' },
                'test input',
                'context',
                sampleEntries
            );

            expect(result.result).toBe('Legacy response');
            expect(calls.callAgentWithTools).toHaveLength(1);
            expect(calls.callAI).toHaveLength(1);
        });

        /**
         * Test per-agent FC disable override
         * **Validates: Requirements 4.4, 4.5**
         */
        it('should use legacy path when agent-specific FC is disabled', async () => {
            const { callAgent, calls } = createCallAgentWithRouting({
                fcEnabled: true,
                fcAgents: { archivist: { enabled: false } },
            });

            const result = await callAgent(
                'archivist',
                { model: 'test-model' },
                'test input',
                'context',
                sampleEntries
            );

            expect(result.result).toBe('Legacy response');
            expect(calls.callAgentWithTools).toHaveLength(0);
            expect(calls.callAI).toHaveLength(1);
        });

        /**
         * Test that other agents still use FC when only one agent is disabled
         * **Validates: Requirements 4.4, 4.5**
         */
        it('should route non-disabled agents to FC while disabled agent uses legacy', async () => {
            // archivist disabled, historian should still use FC
            const { callAgent: callAgentArchivist, calls: callsArchivist } = createCallAgentWithRouting({
                fcEnabled: true,
                fcAgents: { archivist: { enabled: false } },
            });

            await callAgentArchivist('archivist', { model: 'test-model' }, 'query', '', sampleEntries);
            expect(callsArchivist.callAgentWithTools).toHaveLength(0);
            expect(callsArchivist.callAI).toHaveLength(1);

            const { callAgent: callAgentHistorian, calls: callsHistorian } = createCallAgentWithRouting({
                fcEnabled: true,
                fcAgents: { archivist: { enabled: false } },
            });

            await callAgentHistorian('historian', { model: 'test-model' }, 'query', '', sampleEntries);
            expect(callsHistorian.callAgentWithTools).toHaveLength(1);
            expect(callsHistorian.callAI).toHaveLength(0);
        });
    });

    describe('Edge Cases', () => {
        /**
         * Test that null agentConfig returns early without routing
         */
        it('should return error for null agentConfig without routing', async () => {
            const { callAgent, calls } = createCallAgentWithRouting({
                fcEnabled: true,
            });

            const result = await callAgent('archivist', null, 'query', '', sampleEntries);

            expect(result.error).toBe('No config');
            expect(calls.callAgentWithTools).toHaveLength(0);
            expect(calls.callAI).toHaveLength(0);
        });
    });
});
