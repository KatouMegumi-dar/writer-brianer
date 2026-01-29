// modules/config.js

(function () {
    'use strict';

    window.WBAP = window.WBAP || {};
    const Logger = WBAP.Logger;

    const EXTENSION_NAME = 'worldbook_ai_processor';
    const MEMORY_CONFIG_VERSION = 2;

    function generateEndpointId(prefix = 'ep') {
        return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    }

    function createDefaultAggregatorConfig() {
        return {
            enabled: false,
            endpointId: '',
            promptIndex: 0,
            allowDuplicate: false
        };
    }

    function createDefaultMemoryConfig() {
        return {
            version: MEMORY_CONFIG_VERSION,
            enabled: false,
            selectedPresetId: "memory-default",
            selectedTableBooks: [],
            selectedSummaryBooks: [],
            tableCategoryEndpoints: {},
            summaryEndpoints: {}
        };
    }

    function createDefaultSelectiveEndpoint() {
        return {
            id: generateEndpointId(),
            name: '默认API-1',
            apiChannel: 'direct',
            apiProvider: 'openai',
            apiUrl: '',
            apiKey: '',
            model: '',
            maxTokens: 2000,
            temperature: 0.7,
            topP: 1,
            presencePenalty: 0,
            frequencyPenalty: 0,
            maxRetries: 1,
            retryDelayMs: 800,
            timeout: 60,
            enabled: true,
            dedupe: true
        };
    }

    function createDefaultOptimizationApiProfile() {
        return {
            apiUrl: '',
            apiKey: '',
            model: '',
            maxTokens: 4000,
            temperature: 0.7,
            timeout: 60,
            maxRetries: 2,
            retryDelayMs: 800,
            enableStreaming: true
        };
    }

    function createDefaultTiangangApiProfile() {
        return {
            apiUrl: '',
            apiKey: '',
            model: '',
            maxTokens: 2000,
            temperature: 0.7,
            timeout: 60,
            maxRetries: 2,
            retryDelayMs: 800,
            enableStreaming: true
        };
    }

    function createDefaultMemoryEndpoint() {
        return {
            id: generateEndpointId('mem_ep'),
            name: '记忆API-1',
            apiChannel: 'direct',
            apiProvider: 'openai',
            apiUrl: '',
            apiKey: '',
            model: '',
            maxTokens: 2000,
            temperature: 0.7,
            topP: 1,
            presencePenalty: 0,
            frequencyPenalty: 0,
            timeout: 60
        };
    }

    const DEFAULT_OPT_SYSTEM_PROMPT = [
        '你是一名剧情优化助手，负责在保留人设和世界书设定的前提下，润色和改写剧情片段。',
        '请保持语气一致，补足氛围描写，强化场景细节，避免违背角色底线。',
        '输出一段可直接替换原文的精炼文本，避免解释过程。'
    ].join('\n');
    const DEFAULT_TIANGANG_SYSTEM_PROMPT = [
        '\u4f60\u662f\u201c\u5929\u7eb2\u201d\uff0c\u8d1f\u8d23\u5728\u4e0d\u6539\u53d8\u4e16\u754c\u4e66\u4e0e\u5df2\u6709\u4e8b\u5b9e\u7684\u524d\u63d0\u4e0b\uff0c\u7ed9\u51fa\u5267\u60c5\u8d70\u5411\u4e0e\u60c5\u8282\u6307\u5bfc\u3002',
        '\u8f93\u51fa\u8981\u4fdd\u6301\u5ba2\u89c2\uff0c\u4e0d\u6dfb\u52a0\u672a\u7ecf\u786e\u8ba4\u7684\u65b0\u8bbe\u5b9a\u3002',
        '\u4f18\u5148\u4fdd\u8bc1\u903b\u8f91\u4e00\u81f4\u3001\u8282\u594f\u6e05\u6670\u3001\u4eba\u7269\u884c\u4e3a\u5408\u7406\u3002'
    ].join('\n');
    const DEFAULT_TIANGANG_PROMPT_TEMPLATE = [
        'USER_INPUT:',
        '{user_input}',
        '',
        'CONTEXT:',
        '{context}',
        '',
        'WORLDBOOK_CONTENT:',
        '{worldbook_content}',
        '',
        'PREVIOUS_RESULTS:',
        '{previous_results}',
        '',
        'Please output the final guidance content only.'
    ].join('\n');
    const DEFAULT_OPT_PROMPT_TEMPLATE = '请优化以下剧情内容，保持人设和世界观一致：\n\n{input}';

    const DEFAULT_CABINET_SYSTEM_PROMPT = [
        '你是“笔者之脑·内阁模式”的{role_name}。',
        '角色类型：{role_type}。端点：{endpoint_name}。模型：{model_name}。',
        '请基于世界书与用户指令完成分析；其他大学士的发言会出现在 {previous_results} 中（可能为空）。',
        '若你是宰相，请综合所有大学士的要点并输出最终结论；若你是大学士，请给出清晰独立的分析。'
    ].join('\n');
    const DEFAULT_CABINET_PROMPT_TEMPLATE = [
        '世界书内容：',
        '{worldbook_content}',
        '',
        '对话上下文：',
        '{context}',
        '',
        '用户指令：',
        '{user_input}',
        '',
        '其他大学士发言/互评（可为空）：',
        '{previous_results}',
        '',
        '当前轮次：{review_round}'
    ].join('\n');

    function createDefaultOptimizationPromptPreset() {
        return {
            name: '默认优化提示词',
            description: '保持人设与世界观一致的剧情润色',
            systemPrompt: DEFAULT_OPT_SYSTEM_PROMPT,
            promptTemplate: DEFAULT_OPT_PROMPT_TEMPLATE
        };
    }

    function createDefaultCabinetPromptPreset() {
        return {
            name: '默认内阁提示词',
            description: '大学士并行出稿，宰相汇总定稿',
            systemPrompt: DEFAULT_CABINET_SYSTEM_PROMPT,
            mainPrompt: DEFAULT_CABINET_PROMPT_TEMPLATE,
            finalSystemDirective: '',
            variables: { sulv1: '', sulv2: '', sulv3: '', sulv4: '' }
        };
    }

    function createDefaultTiangangPromptPreset() {
        return {
            name: '\u5929\u7eb2\u9ed8\u8ba4\u63d0\u793a\u8bcd',
            description: '\u5267\u60c5\u6307\u5bfc\u4e0e\u8d70\u5411\u7ed9\u5efa\u8bae',
            systemPrompt: DEFAULT_TIANGANG_SYSTEM_PROMPT,
            mainPrompt: DEFAULT_TIANGANG_PROMPT_TEMPLATE,
            finalSystemDirective: '',
            variables: { sulv1: '', sulv2: '', sulv3: '', sulv4: '' }
        };
    }

    function createDefaultGlobalPools() {
        return {
            selectiveMode: {
                apiEndpoints: [createDefaultSelectiveEndpoint()]
            },
            optimization: {
                apiConfig: createDefaultOptimizationApiProfile()
            },
            tiangang: {
                apiConfig: createDefaultTiangangApiProfile()
            },
            memory: {
                apiEndpoints: [createDefaultMemoryEndpoint()],
                presets: []
            },
            prompts: {
                main: [],
                optimizationLevel3: [createDefaultOptimizationPromptPreset()],
                tiangang: [createDefaultTiangangPromptPreset()],
                cabinet: [createDefaultCabinetPromptPreset()],
                memory: []
            }
        };
    }

    // 单角色配置默认值（自选模式）
    function createDefaultCharacterConfig() {
        return {
            enabled: true,
            selectedPromptIndex: 0,
            promptBindings: {},
            secondaryPrompt: {
                enabled: false,
                selectedPromptIndex: 0,
                boundEndpointIds: []
            },
            selectiveMode: {
                endpointBindings: {}
            },
            contextRounds: 5,
            enableChunking: false,
            skipProcessedMessages: true,
            mergeWorldBooks: true,
            useSelectedWorldBooks: true,
            analysisExcludeTags: '',
            tagExtractionName: '',
            showProgressPanel: true,
            showFloatButton: true,
            enablePlotOptimization: false,
            enablePlotOptimizationFloatButton: false,
            optimizationSystemPrompt: '',
            aggregatorMode: createDefaultAggregatorConfig(),
            memoryModule: createDefaultMemoryConfig(),
            optimizationApiConfig: {
                useIndependentProfile: false,
                selectedEndpointId: null
            },
            optimizationLevel3: {
                enabled: false,
                autoConfirm: false,
                selectedPromptIndex: 0
            },
            tiangang: {
                enabled: false,
                selectedPromptIndex: 0,
                contextRounds: 5,
                worldBooks: [],
                assignedEntriesMap: {}
            },
            superConcurrency: {
                mode: 'basic',
                reviewRounds: 1,
                showPanel: true,
                selectedPromptIndex: 0
            }
        };
    }
    function createDefaultMainConfig() {
        return {
            characterConfigs: {
                'default': createDefaultCharacterConfig()
            },
            globalSettings: {
                maxConcurrent: 0,
                timeout: 0,
                enableSuperConcurrency: false
            },
            globalPools: createDefaultGlobalPools()
        };
    }

    function normalizeEndpoints(endpoints) {
        if (!Array.isArray(endpoints)) return;

        const seenIds = new Set();
        endpoints.forEach(ep => {
            if (!ep.apiUrl && ep.url) ep.apiUrl = ep.url;
            if (!ep.apiKey && ep.key) ep.apiKey = ep.key;
            if (!ep.apiChannel) ep.apiChannel = 'direct';
            if (!ep.apiProvider) ep.apiProvider = 'openai';
            if (ep.timeout == null) ep.timeout = 0;
            if (ep.topP == null) ep.topP = 1;
            if (ep.presencePenalty == null) ep.presencePenalty = 0;
            if (ep.frequencyPenalty == null) ep.frequencyPenalty = 0;
            if (ep.maxRetries == null) ep.maxRetries = 1;
            if (ep.retryDelayMs == null) ep.retryDelayMs = 800;
            if (ep.enabled === undefined) ep.enabled = true;
            if (ep.dedupe === undefined) ep.dedupe = true;
            if (!ep.id || seenIds.has(ep.id)) {
                ep.id = generateEndpointId();
            }
            seenIds.add(ep.id);
            delete ep.worldBooks;
            delete ep.assignedEntriesMap;
            delete ep.worldBook;
            delete ep.assignedEntries;
            delete ep.url;
            delete ep.key;
        });
    }

    function normalizeMemoryEndpoints(endpoints) {
        if (!Array.isArray(endpoints)) return;
        const seenIds = new Set();
        endpoints.forEach(ep => {
            if (!ep.apiUrl && ep.url) ep.apiUrl = ep.url;
            if (!ep.apiKey && ep.key) ep.apiKey = ep.key;
            if (!ep.apiChannel) ep.apiChannel = 'direct';
            if (!ep.apiProvider) ep.apiProvider = 'openai';
            if (ep.timeout == null) ep.timeout = 60;
            if (ep.topP == null) ep.topP = 1;
            if (ep.presencePenalty == null) ep.presencePenalty = 0;
            if (ep.frequencyPenalty == null) ep.frequencyPenalty = 0;
            if (!ep.id || seenIds.has(ep.id)) {
                ep.id = generateEndpointId('mem_ep');
            }
            seenIds.add(ep.id);
            delete ep.url;
            delete ep.key;
        });
    }

    function ensureGlobalPools(cfg) {
        if (!cfg.globalPools) {
            cfg.globalPools = createDefaultGlobalPools();
        }
        const pools = cfg.globalPools;
        if (!pools.selectiveMode) pools.selectiveMode = {};
        if (!Array.isArray(pools.selectiveMode.apiEndpoints)) {
            pools.selectiveMode.apiEndpoints = [];
        }
        if (!pools.optimization) pools.optimization = {};
        if (!pools.optimization.apiConfig) {
            pools.optimization.apiConfig = createDefaultOptimizationApiProfile();
        }
        if (!pools.tiangang) pools.tiangang = {};
        if (!pools.tiangang.apiConfig) {
            pools.tiangang.apiConfig = createDefaultTiangangApiProfile();
        }
        if (!pools.memory) pools.memory = {};
        if (!Array.isArray(pools.memory.apiEndpoints) || pools.memory.apiEndpoints.length === 0) {
            pools.memory.apiEndpoints = [createDefaultMemoryEndpoint()];
        }
        if (!Array.isArray(pools.memory.presets)) pools.memory.presets = [];
        if (!pools.prompts) pools.prompts = {};
        if (!Array.isArray(pools.prompts.main)) pools.prompts.main = [];
        if (!Array.isArray(pools.prompts.optimizationLevel3) || pools.prompts.optimizationLevel3.length === 0) {
            pools.prompts.optimizationLevel3 = [createDefaultOptimizationPromptPreset()];
        }
        if (!Array.isArray(pools.prompts.tiangang) || pools.prompts.tiangang.length === 0) {
            pools.prompts.tiangang = [createDefaultTiangangPromptPreset()];
        }
        if (!Array.isArray(pools.prompts.cabinet) || pools.prompts.cabinet.length === 0) {
            pools.prompts.cabinet = [createDefaultCabinetPromptPreset()];
        }
        if (!Array.isArray(pools.prompts.memory)) pools.prompts.memory = [];

        normalizeEndpoints(pools.selectiveMode.apiEndpoints);
        normalizeMemoryEndpoints(pools.memory.apiEndpoints);
        return pools;
    }

    function getGlobalPools() {
        if (!mainConfig) {
            const fallback = createDefaultMainConfig();
            ensureGlobalPools(fallback);
            return fallback.globalPools;
        }
        return ensureGlobalPools(mainConfig);
    }

    let mainConfig = null;

    function migrateConfig(mainConfig) {
        let migrated = false;
        if (!mainConfig.characterConfigs) return false;

        const pools = ensureGlobalPools(mainConfig);
        const globalSelectiveEndpoints = pools.selectiveMode.apiEndpoints;
        const globalMemoryEndpoints = pools.memory.apiEndpoints;
        const globalMainPrompts = pools.prompts.main;
        const globalOptPrompts = pools.prompts.optimizationLevel3;
        const globalTgPrompts = pools.prompts.tiangang;
        const globalCabinetPrompts = pools.prompts.cabinet;
        const globalMemoryPresets = pools.memory.presets;

        const endpointSignature = (ep) => JSON.stringify([
            ep.name || '',
            ep.apiChannel || 'direct',
            ep.apiProvider || 'openai',
            ep.apiUrl || '',
            ep.apiKey || '',
            ep.model || '',
            ep.maxTokens ?? '',
            ep.temperature ?? '',
            ep.topP ?? '',
            ep.presencePenalty ?? '',
            ep.frequencyPenalty ?? '',
            ep.maxRetries ?? '',
            ep.retryDelayMs ?? '',
            ep.timeout ?? '',
            ep.enabled === false ? 0 : 1,
            ep.dedupe === false ? 0 : 1
        ]);

        const memoryEndpointSignature = (ep) => JSON.stringify([
            ep.name || '',
            ep.apiChannel || 'direct',
            ep.apiProvider || 'openai',
            ep.apiUrl || '',
            ep.apiKey || '',
            ep.model || '',
            ep.maxTokens ?? '',
            ep.temperature ?? '',
            ep.topP ?? '',
            ep.presencePenalty ?? '',
            ep.frequencyPenalty ?? '',
            ep.timeout ?? ''
        ]);

        function promptSignature(p) {
            if (!p) return '';
            return JSON.stringify({
                name: p.name || '',
                description: p.description || '',
                version: p.version || '',
                systemPrompt: p.systemPrompt || '',
                mainPrompt: p.mainPrompt || p.promptTemplate || '',
                promptTemplate: p.promptTemplate || '',
                finalSystemDirective: p.finalSystemDirective || '',
                variables: p.variables || {}
            });
        }

        function mergePromptPool(pool, prompts, charId) {
            const nameMap = new Map();
            if (!Array.isArray(prompts)) return nameMap;
            prompts.forEach(p => {
                if (!p || !p.name) return;
                const cloned = JSON.parse(JSON.stringify(p));
                if (!cloned.mainPrompt && cloned.promptTemplate) {
                    cloned.mainPrompt = cloned.promptTemplate;
                    delete cloned.promptTemplate;
                }
                const existing = pool.find(item => item.name === cloned.name);
                if (!existing) {
                    pool.push(cloned);
                    nameMap.set(p.name, cloned.name);
                    return;
                }
                if (promptSignature(existing) === promptSignature(cloned)) {
                    nameMap.set(p.name, existing.name);
                    return;
                }
                let baseName = `${cloned.name} (${charId})`;
                let newName = baseName;
                let index = 2;
                while (pool.find(item => item.name === newName)) {
                    newName = `${baseName}-${index++}`;
                }
                cloned.name = newName;
                pool.push(cloned);
                nameMap.set(p.name, newName);
            });
            return nameMap;
        }

        function extractEndpointBinding(ep) {
            const worldBooks = Array.isArray(ep.worldBooks)
                ? ep.worldBooks.slice()
                : (ep.worldBook ? [ep.worldBook] : []);
            const map = {};
            if (ep.assignedEntriesMap && typeof ep.assignedEntriesMap === 'object') {
                Object.assign(map, ep.assignedEntriesMap);
            }
            if (worldBooks.length && Array.isArray(ep.assignedEntries)) {
                map[worldBooks[0]] = ep.assignedEntries.slice();
            }
            return {
                worldBooks: Array.from(new Set(worldBooks.filter(Boolean))),
                assignedEntriesMap: map
            };
        }

        function mergeBinding(target, source) {
            if (!target) return source;
            const mergedBooks = new Set([...(target.worldBooks || []), ...(source.worldBooks || [])]);
            const mergedMap = { ...(target.assignedEntriesMap || {}) };
            Object.entries(source.assignedEntriesMap || {}).forEach(([k, v]) => {
                mergedMap[k] = v;
            });
            return { worldBooks: Array.from(mergedBooks), assignedEntriesMap: mergedMap };
        }

        function addSelectiveEndpoint(ep) {
            if (!ep) return { id: null, changed: false };
            const copy = { ...ep };
            normalizeEndpoints([copy]);
            const sig = endpointSignature(copy);
            const existing = globalSelectiveEndpoints.find(item => endpointSignature(item) === sig);
            if (existing) {
                return { id: existing.id, changed: existing.id !== ep.id };
            }
            let newId = copy.id;
            if (!newId || globalSelectiveEndpoints.some(item => item.id === newId)) {
                newId = generateEndpointId();
            }
            copy.id = newId;
            globalSelectiveEndpoints.push(copy);
            return { id: newId, changed: newId !== ep.id };
        }

        function addMemoryEndpoint(ep) {
            if (!ep) return { id: null, changed: false };
            const copy = { ...ep };
            normalizeMemoryEndpoints([copy]);
            const sig = memoryEndpointSignature(copy);
            const existing = globalMemoryEndpoints.find(item => memoryEndpointSignature(item) === sig);
            if (existing) {
                return { id: existing.id, changed: existing.id !== ep.id };
            }
            let newId = copy.id;
            if (!newId || globalMemoryEndpoints.some(item => item.id === newId)) {
                newId = generateEndpointId('mem_ep');
            }
            copy.id = newId;
            globalMemoryEndpoints.push(copy);
            return { id: newId, changed: newId !== ep.id };
        }

        function replaceIdInList(list, oldId, newId) {
            if (!Array.isArray(list)) return list;
            return list.map(id => (id === oldId ? newId : id));
        }

        function remapEndpointIdInConfig(cfg, oldId, newId) {
            if (!oldId || oldId === newId) return;
            if (cfg.promptBindings) {
                Object.keys(cfg.promptBindings).forEach(key => {
                    cfg.promptBindings[key] = replaceIdInList(cfg.promptBindings[key], oldId, newId);
                });
            }
            if (cfg.secondaryPrompt?.boundEndpointIds) {
                cfg.secondaryPrompt.boundEndpointIds = replaceIdInList(cfg.secondaryPrompt.boundEndpointIds, oldId, newId);
            }
            if (cfg.aggregatorMode?.endpointId === oldId) {
                cfg.aggregatorMode.endpointId = newId;
            }
            if (cfg.optimizationApiConfig?.selectedEndpointId === oldId) {
                cfg.optimizationApiConfig.selectedEndpointId = newId;
            }
            if (cfg.selectiveMode?.endpointBindings?.[oldId]) {
                cfg.selectiveMode.endpointBindings[newId] = cfg.selectiveMode.endpointBindings[oldId];
                delete cfg.selectiveMode.endpointBindings[oldId];
            }
        }

        function remapMemoryEndpointId(mem, oldId, newId) {
            if (!mem) return;
            if (mem.summaryEndpoints) {
                Object.keys(mem.summaryEndpoints).forEach(name => {
                    if (mem.summaryEndpoints[name] === oldId) mem.summaryEndpoints[name] = newId;
                });
            }
            if (mem.tableCategoryEndpoints) {
                Object.keys(mem.tableCategoryEndpoints).forEach(book => {
                    const categories = mem.tableCategoryEndpoints[book];
                    if (!categories) return;
                    Object.keys(categories).forEach(cat => {
                        if (categories[cat] === oldId) categories[cat] = newId;
                    });
                });
            }
        }

        function isApiProfileEmpty(profile) {
            return !profile || (!profile.apiUrl && !profile.apiKey && !profile.model);
        }

        function pickApiProfile(src, fallback) {
            return {
                apiUrl: src.apiUrl || '',
                apiKey: src.apiKey || '',
                model: src.model || '',
                maxTokens: Number.isFinite(src.maxTokens) ? src.maxTokens : fallback.maxTokens,
                temperature: Number.isFinite(src.temperature) ? src.temperature : fallback.temperature,
                timeout: Number.isFinite(src.timeout) ? src.timeout : fallback.timeout,
                maxRetries: Number.isInteger(src.maxRetries) ? src.maxRetries : fallback.maxRetries,
                retryDelayMs: Number.isFinite(src.retryDelayMs) ? src.retryDelayMs : fallback.retryDelayMs,
                enableStreaming: src.enableStreaming !== undefined ? src.enableStreaming : fallback.enableStreaming
            };
        }

        function memoryPresetSignature(p) {
            if (!p) return '';
            return JSON.stringify({
                id: p.id || '',
                name: p.name || '',
                description: p.description || '',
                systemPrompt: p.systemPrompt || '',
                userPrompt: p.userPrompt || '',
                variables: p.variables || {}
            });
        }

        function addMemoryPreset(preset, charId) {
            if (!preset || !preset.id) return { id: null, newId: null };
            const existing = globalMemoryPresets.find(p => p.id === preset.id);
            if (!existing) {
                globalMemoryPresets.push(JSON.parse(JSON.stringify(preset)));
                return { id: preset.id, newId: preset.id };
            }
            if (memoryPresetSignature(existing) === memoryPresetSignature(preset)) {
                return { id: preset.id, newId: preset.id };
            }
            let baseId = `${preset.id}-${charId}`;
            let newId = baseId;
            let idx = 2;
            while (globalMemoryPresets.find(p => p.id === newId)) {
                newId = `${baseId}-${idx++}`;
            }
            const cloned = JSON.parse(JSON.stringify(preset));
            cloned.id = newId;
            globalMemoryPresets.push(cloned);
            return { id: preset.id, newId };
        }

        for (const charId in mainConfig.characterConfigs) {
            const cfg = mainConfig.characterConfigs[charId] || {};
            mainConfig.characterConfigs[charId] = cfg;

            if (cfg.originalMode || cfg.processingMode) {
                migrated = true;
                cfg.prompts = cfg.originalMode?.prompts || [];
                cfg.selectedPromptIndex = cfg.originalMode?.selectedPromptIndex || 0;
                delete cfg.originalMode;
                delete cfg.processingMode;
                delete cfg.selectedWorldBook;
            }

            if (cfg.enabled === undefined) {
                cfg.enabled = true;
                migrated = true;
            }
            if (cfg.selectedPromptIndex == null) {
                cfg.selectedPromptIndex = 0;
                migrated = true;
            }
            if (!cfg.promptBindings) {
                cfg.promptBindings = {};
                migrated = true;
            }
            if (!cfg.secondaryPrompt) {
                cfg.secondaryPrompt = JSON.parse(JSON.stringify(createDefaultCharacterConfig().secondaryPrompt));
                migrated = true;
            } else {
                if (cfg.secondaryPrompt.enabled == null) cfg.secondaryPrompt.enabled = false;
                if (cfg.secondaryPrompt.selectedPromptIndex == null) cfg.secondaryPrompt.selectedPromptIndex = 0;
                if (!Array.isArray(cfg.secondaryPrompt.boundEndpointIds)) cfg.secondaryPrompt.boundEndpointIds = [];
            }
            if (!cfg.selectiveMode) {
                cfg.selectiveMode = { endpointBindings: {} };
                migrated = true;
            }
            if (!cfg.selectiveMode.endpointBindings) {
                cfg.selectiveMode.endpointBindings = {};
                migrated = true;
            }

            if (cfg.contextRounds == null) {
                cfg.contextRounds = 5;
                migrated = true;
            }
            if (cfg.enableChunking === undefined) {
                cfg.enableChunking = false;
                migrated = true;
            }
            if (cfg.skipProcessedMessages == null) {
                cfg.skipProcessedMessages = true;
                migrated = true;
            }
            if (cfg.mergeWorldBooks == null) {
                cfg.mergeWorldBooks = true;
                migrated = true;
            }
            if (cfg.useSelectedWorldBooks == null) {
                cfg.useSelectedWorldBooks = true;
                migrated = true;
            }
            if (cfg.analysisExcludeTags == null) {
                cfg.analysisExcludeTags = '';
                migrated = true;
            }
            if (cfg.tagExtractionName == null) {
                cfg.tagExtractionName = '';
                migrated = true;
            }
            if (cfg.showProgressPanel == null) {
                cfg.showProgressPanel = true;
                migrated = true;
            }
            if (cfg.enablePlotOptimization === undefined) {
                cfg.enablePlotOptimization = false;
                migrated = true;
            }
            if (cfg.enablePlotOptimizationFloatButton === undefined) {
                cfg.enablePlotOptimizationFloatButton = false;
                migrated = true;
            }
            if (!cfg.aggregatorMode) {
                cfg.aggregatorMode = createDefaultAggregatorConfig();
                migrated = true;
            } else if (cfg.aggregatorMode.allowDuplicate == null) {
                cfg.aggregatorMode.allowDuplicate = false;
                migrated = true;
            }

            if (!cfg.memoryModule || cfg.memoryModule.version !== MEMORY_CONFIG_VERSION) {
                cfg.memoryModule = createDefaultMemoryConfig();
                migrated = true;
            }
            const mem = cfg.memoryModule;
            mem.version = MEMORY_CONFIG_VERSION;
            if (!Array.isArray(mem.selectedTableBooks)) mem.selectedTableBooks = [];
            if (!Array.isArray(mem.selectedSummaryBooks)) mem.selectedSummaryBooks = [];
            if (!mem.tableCategoryEndpoints) mem.tableCategoryEndpoints = {};
            if (!mem.summaryEndpoints) mem.summaryEndpoints = {};
            if (!mem.selectedPresetId) mem.selectedPresetId = 'memory-default';

            if (Array.isArray(mem.presets) && mem.presets.length) {
                mem.presets.forEach(p => {
                    const result = addMemoryPreset(p, charId);
                    if (mem.selectedPresetId === result.id && result.newId) {
                        mem.selectedPresetId = result.newId;
                    }
                });
                delete mem.presets;
                migrated = true;
            }

            if (Array.isArray(mem.apiEndpoints) && mem.apiEndpoints.length) {
                mem.apiEndpoints.forEach(ep => {
                    const result = addMemoryEndpoint(ep);
                    if (result.changed && ep.id) {
                        remapMemoryEndpointId(mem, ep.id, result.id);
                    }
                });
                delete mem.apiEndpoints;
                migrated = true;
            }

            if (Array.isArray(cfg.prompts) && cfg.prompts.length) {
                cfg.prompts.forEach(p => {
                    if (!p || !p.name) return;
                    const bound = Array.isArray(p.boundEndpointIds) ? p.boundEndpointIds.filter(Boolean) : [];
                    if (bound.length) {
                        const existing = Array.isArray(cfg.promptBindings[p.name]) ? cfg.promptBindings[p.name] : [];
                        cfg.promptBindings[p.name] = Array.from(new Set([...existing, ...bound]));
                    }
                    delete p.boundEndpointIds;
                });
                const nameMap = mergePromptPool(globalMainPrompts, cfg.prompts, charId);
                const selectedPrompt = cfg.prompts[cfg.selectedPromptIndex];
                if (selectedPrompt?.name) {
                    const mapped = nameMap.get(selectedPrompt.name) || selectedPrompt.name;
                    const newIndex = globalMainPrompts.findIndex(p => p.name === mapped);
                    if (newIndex >= 0) cfg.selectedPromptIndex = newIndex;
                }
                delete cfg.prompts;
                migrated = true;
            }

            if (Array.isArray(cfg.selectiveMode.apiEndpoints)) {
                cfg.selectiveMode.apiEndpoints.forEach(ep => {
                    const binding = extractEndpointBinding(ep);
                    const result = addSelectiveEndpoint(ep);
                    if (binding.worldBooks.length || Object.keys(binding.assignedEntriesMap).length) {
                        const existing = cfg.selectiveMode.endpointBindings[result.id];
                        cfg.selectiveMode.endpointBindings[result.id] = mergeBinding(existing, binding);
                    }
                    if (result.changed && ep.id) {
                        remapEndpointIdInConfig(cfg, ep.id, result.id);
                    }
                });
                delete cfg.selectiveMode.apiEndpoints;
                migrated = true;
            }

            const optCfg = cfg.optimizationApiConfig || {};
            if (!isApiProfileEmpty(optCfg) && isApiProfileEmpty(pools.optimization.apiConfig)) {
                pools.optimization.apiConfig = pickApiProfile(optCfg, createDefaultOptimizationApiProfile());
                migrated = true;
            }
            cfg.optimizationApiConfig = {
                useIndependentProfile: optCfg.useIndependentProfile === true,
                selectedEndpointId: optCfg.selectedEndpointId ?? null
            };

            let level3Cfg = cfg.optimizationLevel3 || {};
            let level3Presets = Array.isArray(level3Cfg.promptPresets) ? level3Cfg.promptPresets : [];
            if (!level3Presets.length && (level3Cfg.systemPrompt || level3Cfg.promptTemplate || cfg.optimizationSystemPrompt)) {
                const preset = createDefaultOptimizationPromptPreset();
                preset.systemPrompt = level3Cfg.systemPrompt || cfg.optimizationSystemPrompt || preset.systemPrompt;
                preset.promptTemplate = level3Cfg.promptTemplate || preset.promptTemplate;
                level3Presets = [preset];
            }
            if (level3Presets.length) {
                const selected = level3Presets[level3Cfg.selectedPromptIndex ?? 0] || level3Presets[0];
                const nameMap = mergePromptPool(globalOptPrompts, level3Presets, charId);
                const mapped = selected?.name ? (nameMap.get(selected.name) || selected.name) : null;
                if (mapped) {
                    const newIdx = globalOptPrompts.findIndex(p => p.name === mapped);
                    if (newIdx >= 0) level3Cfg.selectedPromptIndex = newIdx;
                }
                delete level3Cfg.promptPresets;
                delete level3Cfg.promptTemplate;
                delete level3Cfg.systemPrompt;
                migrated = true;
            }
            if (level3Cfg.selectedPromptIndex == null) level3Cfg.selectedPromptIndex = 0;
            if (level3Cfg.enabled == null) level3Cfg.enabled = false;
            if (level3Cfg.autoConfirm == null) level3Cfg.autoConfirm = false;
            cfg.optimizationLevel3 = {
                enabled: level3Cfg.enabled,
                autoConfirm: level3Cfg.autoConfirm,
                selectedPromptIndex: level3Cfg.selectedPromptIndex
            };

            let tgCfg = cfg.tiangang || {};
            let tgPrompts = Array.isArray(tgCfg.prompts) ? tgCfg.prompts : [];
            if (tgPrompts.length) {
                const selected = tgPrompts[tgCfg.selectedPromptIndex ?? 0] || tgPrompts[0];
                const nameMap = mergePromptPool(globalTgPrompts, tgPrompts, charId);
                const mapped = selected?.name ? (nameMap.get(selected.name) || selected.name) : null;
                if (mapped) {
                    const newIdx = globalTgPrompts.findIndex(p => p.name === mapped);
                    if (newIdx >= 0) tgCfg.selectedPromptIndex = newIdx;
                }
                delete tgCfg.prompts;
                migrated = true;
            }
            if (tgCfg.apiConfig && isApiProfileEmpty(pools.tiangang.apiConfig)) {
                pools.tiangang.apiConfig = pickApiProfile(tgCfg.apiConfig, createDefaultTiangangApiProfile());
                delete tgCfg.apiConfig;
                migrated = true;
            }
            if (!Array.isArray(tgCfg.worldBooks)) tgCfg.worldBooks = [];
            if (!tgCfg.assignedEntriesMap) tgCfg.assignedEntriesMap = {};
            if (tgCfg.selectedPromptIndex == null) tgCfg.selectedPromptIndex = 0;
            if (tgCfg.enabled == null) tgCfg.enabled = false;
            if (tgCfg.contextRounds == null) tgCfg.contextRounds = cfg.contextRounds ?? 5;
            cfg.tiangang = tgCfg;

            let superCfg = cfg.superConcurrency || {};
            let cabPrompts = Array.isArray(superCfg.prompts) ? superCfg.prompts : [];
            if (cabPrompts.length) {
                const selected = cabPrompts[superCfg.selectedPromptIndex ?? 0] || cabPrompts[0];
                const nameMap = mergePromptPool(globalCabinetPrompts, cabPrompts, charId);
                const mapped = selected?.name ? (nameMap.get(selected.name) || selected.name) : null;
                if (mapped) {
                    const newIdx = globalCabinetPrompts.findIndex(p => p.name === mapped);
                    if (newIdx >= 0) superCfg.selectedPromptIndex = newIdx;
                }
                delete superCfg.prompts;
                migrated = true;
            }
            if (superCfg.selectedPromptIndex == null) superCfg.selectedPromptIndex = 0;
            if (!superCfg.mode) superCfg.mode = 'basic';
            if (!Number.isFinite(superCfg.reviewRounds) || superCfg.reviewRounds < 1) {
                superCfg.reviewRounds = 1;
            }
            if (superCfg.showPanel === undefined) superCfg.showPanel = true;
            cfg.superConcurrency = superCfg;
        }

        normalizeEndpoints(globalSelectiveEndpoints);
        normalizeMemoryEndpoints(globalMemoryEndpoints);

        return migrated;
    }

    function ensureSuperConcurrencyConfig(config) {
        if (!config.superConcurrency) {
            config.superConcurrency = {
                mode: 'basic',
                reviewRounds: 1,
                showPanel: true,
                selectedPromptIndex: 0
            };
        }
        const superCfg = config.superConcurrency;
        if (superCfg.selectedPromptIndex == null) {
            superCfg.selectedPromptIndex = 0;
        }
        if (!superCfg.mode) superCfg.mode = 'basic';
        if (!Number.isFinite(superCfg.reviewRounds) || superCfg.reviewRounds < 1) {
            superCfg.reviewRounds = 1;
        }
        if (superCfg.showPanel === undefined) superCfg.showPanel = true;
        return superCfg;
    }

    function loadConfig() {
        try {
            let loadedConfig = null;
            if (typeof SillyTavern !== 'undefined' && SillyTavern.getContext) {
                const { extensionSettings } = SillyTavern.getContext();
                if (extensionSettings && extensionSettings[EXTENSION_NAME]) {
                    loadedConfig = extensionSettings[EXTENSION_NAME];
                    Logger.log('主配置已从 SillyTavern 读取');
                }
            }

            if (loadedConfig && loadedConfig.characterConfigs) {
                mainConfig = loadedConfig;
                if (!mainConfig.globalSettings) {
                    mainConfig.globalSettings = createDefaultMainConfig().globalSettings;
                }

                ensureGlobalPools(mainConfig);

                if (migrateConfig(mainConfig)) {
                    Logger.log('配置已从旧版本迁移并保存');
                    saveConfig();
                }

            } else {
                mainConfig = createDefaultMainConfig();
                ensureGlobalPools(mainConfig);
                Logger.log('使用默认的主配置');
                            }

            window.WBAP.mainConfig = mainConfig;
            window.WBAP.DEFAULT_CONFIG = createDefaultCharacterConfig();
            window.WBAP.createDefaultCharacterConfig = createDefaultCharacterConfig;
            WBAP.CharacterManager.initialize();

        } catch (e) {
            Logger.error('加载主配置失败', e);
            mainConfig = createDefaultMainConfig();
            window.WBAP.mainConfig = mainConfig;
            window.WBAP.DEFAULT_CONFIG = createDefaultCharacterConfig();
            window.WBAP.createDefaultCharacterConfig = createDefaultCharacterConfig;
            WBAP.CharacterManager.initialize();
        }
    }

    function saveConfig() {
        try {
            if (typeof SillyTavern !== 'undefined' && SillyTavern.getContext) {
                const { extensionSettings, saveSettingsDebounced } = SillyTavern.getContext();
                if (extensionSettings) {
                    extensionSettings[EXTENSION_NAME] = window.WBAP.mainConfig;
                    if (typeof saveSettingsDebounced === 'function') {
                        saveSettingsDebounced();
                    }
                }
            }
        } catch (e) {
            Logger.error('保存主配置失败', e);
        }
    }

    window.WBAP.loadConfig = loadConfig;
    window.WBAP.saveConfig = saveConfig;
    window.WBAP.EXTENSION_NAME = EXTENSION_NAME;
    window.WBAP.DEFAULT_OPT_SYSTEM_PROMPT = DEFAULT_OPT_SYSTEM_PROMPT;
    window.WBAP.DEFAULT_OPT_PROMPT_TEMPLATE = DEFAULT_OPT_PROMPT_TEMPLATE;
    window.WBAP.createDefaultOptimizationPromptPreset = createDefaultOptimizationPromptPreset;
    window.WBAP.createDefaultOptimizationApiProfile = createDefaultOptimizationApiProfile;
    window.WBAP.createDefaultCabinetPromptPreset = createDefaultCabinetPromptPreset;
    window.WBAP.createDefaultTiangangPromptPreset = createDefaultTiangangPromptPreset;
    window.WBAP.createDefaultTiangangApiProfile = createDefaultTiangangApiProfile;
    window.WBAP.createDefaultMemoryConfig = createDefaultMemoryConfig;
    window.WBAP.createDefaultMemoryEndpoint = createDefaultMemoryEndpoint;
    window.WBAP.ensureGlobalPools = ensureGlobalPools;
    window.WBAP.getGlobalPools = getGlobalPools;
    window.WBAP.ensureSuperConcurrencyConfig = ensureSuperConcurrencyConfig;

})();
