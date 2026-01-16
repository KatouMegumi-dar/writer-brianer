// modules/config.js

(function () {
    'use strict';

    window.WBAP = window.WBAP || {};
    const Logger = WBAP.Logger;

    const EXTENSION_NAME = 'worldbook_ai_processor';

    function generateEndpointId() {
        return `ep_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    }

    function createDefaultAggregatorConfig() {
        return {
            enabled: false,
            endpointId: '',
            promptIndex: 0
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
                        worldBooks: [],
                        assignedEntriesMap: {}
                    }
                ]
            },
            contextRounds: 5,
            enableChunking: false,
            skipProcessedMessages: true,
            showProgressPanel: true,
            enablePlotOptimization: false,
            enablePlotOptimizationFloatButton: false,
            optimizationSystemPrompt: '',
            aggregatorMode: createDefaultAggregatorConfig(),
            // 剧情优化面板独立配置
            optimizationApiConfig: {
                useIndependentProfile: false,
                selectedEndpointId: null,
                apiUrl: '',
                apiKey: '',
                model: '',
                maxTokens: 4000,
                temperature: 0.7
            },
            // 三级剧情优化配置
            optimizationLevel3: {
                enabled: false,
                promptTemplate: '',
                systemPrompt: '',
                autoConfirm: false
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
                timeout: 0
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
            normalizeEndpoints(charConfig);
            if (charConfig.enableChunking === undefined) charConfig.enableChunking = false;
            if (!charConfig.aggregatorMode) charConfig.aggregatorMode = createDefaultAggregatorConfig();
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
                    apiUrl: '', apiKey: '', model: '', maxTokens: 4000, temperature: 0.7
                };
                migrated = true;
            }
            // 三级优化配置迁移
            if (!charConfig.optimizationLevel3) {
                charConfig.optimizationLevel3 = {
                    enabled: false,
                    promptTemplate: '',
                    systemPrompt: '',
                    autoConfirm: false
                };
                migrated = true;
            }
        }
        return migrated;
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

})();
