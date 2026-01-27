// modules/config.js

(function () {
    'use strict';

    window.WBAP = window.WBAP || {};
    const Logger = WBAP.Logger;

    const EXTENSION_NAME = 'worldbook_ai_processor';
    const MEMORY_CONFIG_VERSION = 2;

    function generateEndpointId() {
        return `ep_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
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
            model: "",
            selectedPresetId: "memory-default",
            presets: [{
                id: "memory-default",
                name: "记忆管理",
                description: "记忆模块默认提示词",
                systemPrompt: "",
                userPrompt: "",
                variables: { sulv1: "0.6", sulv2: "8", sulv3: "6", sulv4: "" }
            }],
            selectedTableBooks: [],
            selectedSummaryBooks: [],
            tableCategoryEndpoints: {},
            summaryEndpoints: {},
            apiEndpoints: [{
                id: "mem_ep_default",
                name: "记忆API-1",
                apiUrl: "",
                apiKey: "",
                model: "",
                maxTokens: 2000,
                temperature: 0.7,
                topP: 1,
                presencePenalty: 0,
                frequencyPenalty: 0,
                timeout: 60
            }]
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

    // 单角色配置默认值（自选模式）
    function createDefaultCharacterConfig() {
        return {
            enabled: true,
            prompts: [],
            selectedPromptIndex: 0,
            secondaryPrompt: {
                enabled: false,
                selectedPromptIndex: 0,
                boundEndpointIds: []
            },
            selectiveMode: {
                apiEndpoints: [
                    {
                        id: generateEndpointId(),
                        name: '默认API-1',
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
                        dedupe: true,
                        worldBooks: [],
                        assignedEntriesMap: {}
                    }
                ]
            },
            contextRounds: 5,
            enableChunking: false,
            skipProcessedMessages: true,
            mergeWorldBooks: true,
            useSelectedWorldBooks: true,
            analysisExcludeTags: '',  // 分析排除标签（逗号分隔）
            tagExtractionName: '',   // 标签提取名称（用于背景资料约束）
            showProgressPanel: true,
            enablePlotOptimization: false,
            enablePlotOptimizationFloatButton: false,
            optimizationSystemPrompt: '',
            aggregatorMode: createDefaultAggregatorConfig(),
            memoryModule: createDefaultMemoryConfig(),
            // 剧情优化面板独立配置
            optimizationApiConfig: {
                useIndependentProfile: false,
                selectedEndpointId: null,
                apiUrl: '',
                apiKey: '',
                model: '',
                maxTokens: 4000,
                temperature: 0.7,
                timeout: 60,
                maxRetries: 2,
                retryDelayMs: 800,
                enableStreaming: true
            },
            // 三级剧情优化配置
            optimizationLevel3: {
                enabled: false,
                promptTemplate: '',
                systemPrompt: '',
                autoConfirm: false,
                promptPresets: [createDefaultOptimizationPromptPreset()],
                selectedPromptIndex: 0
            },
            tiangang: {
                enabled: false,
                prompts: [createDefaultTiangangPromptPreset()],
                selectedPromptIndex: 0,
                contextRounds: 5,
                apiConfig: {
                    apiUrl: '',
                    apiKey: '',
                    model: '',
                    maxTokens: 2000,
                    temperature: 0.7,
                    timeout: 60,
                    maxRetries: 1,
                    retryDelayMs: 800
                },
                worldBooks: [],
                assignedEntriesMap: {}
            },
            superConcurrency: {
                mode: 'basic',
                reviewRounds: 1,
                showPanel: true,
                prompts: [createDefaultCabinetPromptPreset()],
                selectedPromptIndex: 0
            }
        };
    }

    // 总配置（包含所有角色配置）
    function createDefaultMainConfig() {
        return {
            characterConfigs: {
                'default': createDefaultCharacterConfig()
            },
            globalSettings: {
                maxConcurrent: 0,
                timeout: 0,
                enableSuperConcurrency: false  // 超级并发（内阁讨论模式）
            }
        };
    }

    function normalizeEndpoints(cfg) {
        const endpoints = cfg?.selectiveMode?.apiEndpoints;
        if (!Array.isArray(endpoints)) return;

        const seenIds = new Set();
        endpoints.forEach(ep => {
            if (!ep.apiUrl && ep.url) ep.apiUrl = ep.url;
            if (!ep.apiKey && ep.key) ep.apiKey = ep.key;
            if (ep.timeout == null) ep.timeout = 0;
            if (ep.topP == null) ep.topP = 1;
            if (ep.presencePenalty == null) ep.presencePenalty = 0;
            if (ep.frequencyPenalty == null) ep.frequencyPenalty = 0;
            if (ep.maxRetries == null) ep.maxRetries = 1;
            if (ep.retryDelayMs == null) ep.retryDelayMs = 800;
            if (!Array.isArray(ep.worldBooks)) {
                const wb = ep.worldBook || '';
                ep.worldBooks = wb ? [wb] : [];
            }
            if (!ep.assignedEntriesMap) {
                ep.assignedEntriesMap = {};
                if (ep.worldBooks.length && Array.isArray(ep.assignedEntries)) {
                    ep.assignedEntriesMap[ep.worldBooks[0]] = ep.assignedEntries;
                }
            }
            if (ep.enabled === undefined) ep.enabled = true;
            if (ep.dedupe === undefined) ep.dedupe = true;
            if (!ep.id || seenIds.has(ep.id)) {
                ep.id = generateEndpointId();
            }
            seenIds.add(ep.id);
            delete ep.worldBook;
            delete ep.assignedEntries;
            delete ep.url;
            delete ep.key;
        });
    }

    let mainConfig = null;

    function migrateConfig(mainConfig) {
        let migrated = false;
        if (!mainConfig.characterConfigs) return false;

        for (const charId in mainConfig.characterConfigs) {
            const charConfig = mainConfig.characterConfigs[charId];
            if (charConfig.originalMode || charConfig.processingMode) {
                migrated = true;
                charConfig.prompts = charConfig.originalMode?.prompts || [];
                charConfig.selectedPromptIndex = charConfig.originalMode?.selectedPromptIndex || 0;
                delete charConfig.originalMode;
                delete charConfig.processingMode;
                delete charConfig.selectedWorldBook;
            }
            if (charConfig.enabled === undefined) {
                charConfig.enabled = true;
                migrated = true;
            }
            if (!charConfig.selectiveMode) {
                charConfig.selectiveMode = JSON.parse(JSON.stringify(createDefaultCharacterConfig().selectiveMode));
                migrated = true;
            }
            if (charConfig.contextRounds == null) {
                charConfig.contextRounds = 5;
                migrated = true;
            }
            if (charConfig.skipProcessedMessages == null) {
                charConfig.skipProcessedMessages = true;
                migrated = true;
            }
            if (charConfig.mergeWorldBooks == null) {
                charConfig.mergeWorldBooks = true;
                migrated = true;
            }
            if (charConfig.useSelectedWorldBooks == null) {
                charConfig.useSelectedWorldBooks = true;
                migrated = true;
            }
            if (charConfig.tagExtractionName == null) {
                charConfig.tagExtractionName = '';
                migrated = true;
            }
            normalizeEndpoints(charConfig);
            if (charConfig.enableChunking === undefined) charConfig.enableChunking = false;
            if (!charConfig.aggregatorMode) {
                charConfig.aggregatorMode = createDefaultAggregatorConfig();
                migrated = true;
            } else if (charConfig.aggregatorMode.allowDuplicate == null) {
                charConfig.aggregatorMode.allowDuplicate = false;
                migrated = true;
            }
            if (!charConfig.memoryModule || charConfig.memoryModule.version !== MEMORY_CONFIG_VERSION) {
                charConfig.memoryModule = createDefaultMemoryConfig();
                migrated = true;
            }
            if (!charConfig.secondaryPrompt) {
                charConfig.secondaryPrompt = JSON.parse(JSON.stringify(createDefaultCharacterConfig().secondaryPrompt));
            }
            if (charConfig.enablePlotOptimizationFloatButton === undefined) {
                charConfig.enablePlotOptimizationFloatButton = false;
                migrated = true;
            }
            if (!charConfig.optimizationApiConfig) {
                charConfig.optimizationApiConfig = {
                    useIndependentProfile: false,
                    selectedEndpointId: null,
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
                migrated = true;
            } else {
                const optCfg = charConfig.optimizationApiConfig;
                if (!Number.isFinite(optCfg.timeout)) {
                    optCfg.timeout = 60;
                    migrated = true;
                }
                if (!Number.isInteger(optCfg.maxRetries)) {
                    optCfg.maxRetries = 2;
                    migrated = true;
                }
                if (!Number.isFinite(optCfg.retryDelayMs)) {
                    optCfg.retryDelayMs = 800;
                    migrated = true;
                }
                if (optCfg.enableStreaming === undefined) {
                    optCfg.enableStreaming = true;
                    migrated = true;
                }
            }
            // 三级优化配置迁移
            if (!charConfig.optimizationLevel3) {
                charConfig.optimizationLevel3 = {
                    enabled: false,
                    promptTemplate: '',
                    systemPrompt: '',
                    autoConfirm: false,
                    promptPresets: [createDefaultOptimizationPromptPreset()],
                    selectedPromptIndex: 0
                };
                migrated = true;
            } else {
                const level3Cfg = charConfig.optimizationLevel3;
                if (!Array.isArray(level3Cfg.promptPresets) || level3Cfg.promptPresets.length === 0) {
                    const baseSystem = level3Cfg.systemPrompt || charConfig.optimizationSystemPrompt || DEFAULT_OPT_SYSTEM_PROMPT;
                    const baseTemplate = level3Cfg.promptTemplate || DEFAULT_OPT_PROMPT_TEMPLATE;
                    level3Cfg.promptPresets = [{
                        name: '默认优化提示词',
                        description: '保持人设与世界观一致的剧情润色',
                        systemPrompt: baseSystem,
                        promptTemplate: baseTemplate
                    }];
                    level3Cfg.selectedPromptIndex = 0;
                    migrated = true;
                }
                if (level3Cfg.selectedPromptIndex == null) {
                    level3Cfg.selectedPromptIndex = 0;
                    migrated = true;
                }
            }
            if (!charConfig.superConcurrency) {
                charConfig.superConcurrency = {
                    mode: 'basic',
                    reviewRounds: 1,
                    showPanel: true,
                    prompts: [createDefaultCabinetPromptPreset()],
                    selectedPromptIndex: 0
                };
                migrated = true;
            } else {
                const superCfg = charConfig.superConcurrency;
                if (!Array.isArray(superCfg.prompts) || superCfg.prompts.length === 0) {
                    superCfg.prompts = [createDefaultCabinetPromptPreset()];
                    superCfg.selectedPromptIndex = 0;
                    migrated = true;
                }
                superCfg.prompts.forEach(p => {
                    if (!p.mainPrompt && p.promptTemplate) {
                        p.mainPrompt = p.promptTemplate;
                        delete p.promptTemplate;
                        migrated = true;
                    }
                });
                if (superCfg.selectedPromptIndex == null) {
                    superCfg.selectedPromptIndex = 0;
                    migrated = true;
                }
                if (!superCfg.mode) superCfg.mode = 'basic';
                if (!Number.isFinite(superCfg.reviewRounds) || superCfg.reviewRounds < 1) {
                    superCfg.reviewRounds = 1;
                }
                if (superCfg.showPanel === undefined) superCfg.showPanel = true;
            }
            if (!charConfig.tiangang) {
                charConfig.tiangang = {
                    enabled: false,
                    prompts: [createDefaultTiangangPromptPreset()],
                    selectedPromptIndex: 0,
                    contextRounds: charConfig.contextRounds ?? 5,
                    apiConfig: {
                        apiUrl: '',
                        apiKey: '',
                        model: '',
                        maxTokens: 2000,
                        temperature: 0.7,
                        timeout: 60,
                        maxRetries: 2,
                        retryDelayMs: 800,
                        enableStreaming: true
                    },
                    worldBooks: [],
                    assignedEntriesMap: {}
                };
                migrated = true;
            } else {
                const tgCfg = charConfig.tiangang;
                if (!Array.isArray(tgCfg.prompts) || tgCfg.prompts.length === 0) {
                    tgCfg.prompts = [createDefaultTiangangPromptPreset()];
                    tgCfg.selectedPromptIndex = 0;
                    migrated = true;
                }
                if (tgCfg.selectedPromptIndex == null) {
                    tgCfg.selectedPromptIndex = 0;
                    migrated = true;
                }
                if (!tgCfg.apiConfig) {
                    tgCfg.apiConfig = {
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
                    migrated = true;
                } else {
                    if (!Number.isInteger(tgCfg.apiConfig.maxRetries)) {
                        tgCfg.apiConfig.maxRetries = 2;
                        migrated = true;
                    }
                    if (!Number.isFinite(tgCfg.apiConfig.retryDelayMs)) {
                        tgCfg.apiConfig.retryDelayMs = 800;
                        migrated = true;
                    }
                    if (tgCfg.apiConfig.enableStreaming === undefined) {
                        tgCfg.apiConfig.enableStreaming = true;
                        migrated = true;
                    }
                }
                if (!Array.isArray(tgCfg.worldBooks)) {
                    tgCfg.worldBooks = [];
                    migrated = true;
                }
                if (!tgCfg.assignedEntriesMap) {
                    tgCfg.assignedEntriesMap = {};
                    migrated = true;
                }
                if (tgCfg.contextRounds == null) {
                    tgCfg.contextRounds = charConfig.contextRounds ?? 5;
                    migrated = true;
                }
            }
        }
        return migrated;
    }

    function ensureSuperConcurrencyConfig(config) {
        if (!config.superConcurrency) {
            config.superConcurrency = {
                mode: 'basic',
                reviewRounds: 1,
                showPanel: true,
                prompts: [createDefaultCabinetPromptPreset()],
                selectedPromptIndex: 0
            };
        }
        const superCfg = config.superConcurrency;
        if (!Array.isArray(superCfg.prompts) || superCfg.prompts.length === 0) {
            superCfg.prompts = [createDefaultCabinetPromptPreset()];
            superCfg.selectedPromptIndex = 0;
        }
        superCfg.prompts.forEach(p => {
            if (!p.mainPrompt && p.promptTemplate) {
                p.mainPrompt = p.promptTemplate;
                delete p.promptTemplate;
            }
        });
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

                if (migrateConfig(mainConfig)) {
                    Logger.log('配置已从旧版本迁移并保存');
                    saveConfig();
                }

            } else {
                mainConfig = createDefaultMainConfig();
                Logger.log('使用默认的主配置');
                normalizeEndpoints(mainConfig.characterConfigs?.default);
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
    window.WBAP.createDefaultCabinetPromptPreset = createDefaultCabinetPromptPreset;
    window.WBAP.createDefaultTiangangPromptPreset = createDefaultTiangangPromptPreset;
    window.WBAP.createDefaultMemoryConfig = createDefaultMemoryConfig;
    window.WBAP.ensureSuperConcurrencyConfig = ensureSuperConcurrencyConfig;

})();
