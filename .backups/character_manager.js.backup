// modules/character_manager.js

(function() {
    'use strict';

    window.WBAP = window.WBAP || {};
    const Logger = WBAP.Logger;

    let currentCharacterId = null;
    let transientConfig = null;

    function normalizeCharacterKey(id) {
        if (id === null || id === undefined) return null;
        return String(id);
    }

    function migrateCharacterConfigKey(targetId, legacyId, legacyAvatar) {
        const key = normalizeCharacterKey(targetId);
        if (!key) return;
        const mainConfig = WBAP.mainConfig;
        if (!mainConfig?.characterConfigs) return;
        if (mainConfig.characterConfigs[key]) return;

        const legacyKey = normalizeCharacterKey(legacyId);
        let legacy = legacyKey ? mainConfig.characterConfigs[legacyKey] : null;
        if (!legacy && legacyAvatar) legacy = mainConfig.characterConfigs[legacyAvatar];
        if (!legacy) return;

        mainConfig.characterConfigs[key] = legacy;
        if (legacyKey && mainConfig.characterConfigs[legacyKey]) delete mainConfig.characterConfigs[legacyKey];
        if (legacyAvatar && mainConfig.characterConfigs[legacyAvatar]) delete mainConfig.characterConfigs[legacyAvatar];
        if (typeof WBAP.saveConfig === 'function') {
            WBAP.saveConfig();
        }
        Logger.log(`已迁移角色配置键: ${legacyKey || legacyAvatar} -> ${key}`);
    }

    function resolveCurrentCharacterId() {
        try {
            const context = SillyTavern.getContext();
            const character = context?.character;
            const rawId = (context && context.characterId !== undefined && context.characterId !== null)
                ? context.characterId
                : (character?.id ?? null);
            const id = normalizeCharacterKey(rawId);
            if (id) migrateCharacterConfigKey(id, character?.id, character?.avatar_file_name || null);
            return id;
        } catch (e) {
            return null;
        }
    }

    function createTransientConfig() {
        if (transientConfig) return transientConfig;
        const createDefault = WBAP.createDefaultCharacterConfig;
        transientConfig = (typeof createDefault === 'function')
            ? createDefault()
            : JSON.parse(JSON.stringify(WBAP.DEFAULT_CONFIG || {}));
        return transientConfig;
    }

    // 获取当前角色的配置
    function getCurrentCharacterConfig() {
        const mainConfig = WBAP.mainConfig;
        // 在插件完全加载前，如果被调用，提供一个临时的空配置以避免崩溃
        if (!mainConfig) {
            Logger.warn('getCurrentCharacterConfig 在 mainConfig 初始化前被调用。');
            return createTransientConfig();
        }

        if (!mainConfig.characterConfigs) {
            mainConfig.characterConfigs = {};
        }

        if (!currentCharacterId) {
            currentCharacterId = resolveCurrentCharacterId();
        }
        if (!currentCharacterId) {
            if (!transientConfig && window.WBAP?.config) {
                transientConfig = window.WBAP.config;
            }
            return createTransientConfig();
        }

        if (!mainConfig.characterConfigs[currentCharacterId]) {
            Logger.log(`为角色${currentCharacterId} 创建新的默认配置。`);
            const createDefault = WBAP.createDefaultCharacterConfig;
            mainConfig.characterConfigs[currentCharacterId] = createDefault
                ? createDefault()
                : JSON.parse(JSON.stringify(WBAP.DEFAULT_CONFIG));
        }
        
        // 始终返回当前角色的配置
        return mainConfig.characterConfigs[currentCharacterId];
    }

    // 切换角色时调用的函数
    function switchCharacter(characterId) {
        if (characterId === null || characterId === undefined || characterId === '') {
            Logger.log('Switching to home: using transient config');
            currentCharacterId = null;
            window.WBAP.config = createTransientConfig();
            if (window.WBAP.UI) {
                if (typeof window.WBAP.UI.loadSettingsToUI === 'function') {
                    WBAP.UI.loadSettingsToUI();
                }
                if (typeof window.WBAP.UI.refreshPromptList === 'function') {
                    WBAP.UI.refreshPromptList();
                }
                if (typeof window.WBAP.UI.renderApiEndpoints === 'function') {
                    WBAP.UI.renderApiEndpoints();
                }
            }
            return;
        }

        if (currentCharacterId === characterId) return; // 角色未改变

        Logger.log(`切换到角色 ${characterId}`);
        currentCharacterId = characterId;

        // 更新全局的活动配置对象
        window.WBAP.config = getCurrentCharacterConfig();

        // 重新加载提示词（因为角色切换了）
        if (window.WBAP.PromptManager && typeof window.WBAP.PromptManager.loadUserPrompts === 'function') {
            // 注意：loadUserPrompts 不是公开接口，我们需要通过重新初始化或直接访问内部逻辑
            // 但更好的方式是让 PromptManager 在每次调用时都从当前配置读取
            // 暂时先刷新 UI，UI 会触发 PromptManager 的读取
        }

        // 通知UI刷新
        if (window.WBAP.UI) {
            if (typeof window.WBAP.UI.loadSettingsToUI === 'function') {
                WBAP.UI.loadSettingsToUI();
            }
            if (typeof window.WBAP.UI.refreshPromptList === 'function') {
                WBAP.UI.refreshPromptList();
            }
            if (typeof window.WBAP.UI.renderApiEndpoints === 'function') {
                WBAP.UI.renderApiEndpoints();
            }
        }
    }

    // 初始化，监听角色加载事件
    function initialize() {
        if (typeof SillyTavern !== 'undefined' && SillyTavern.getContext) {
            const context = SillyTavern.getContext();
            let eventListenerAttached = false;

            // 方案A: 监听角色加载事件 (最佳)
            if (context.eventSource && context.event_types?.CHARACTER_LOADED) {
                context.eventSource.on(context.event_types.CHARACTER_LOADED, (character) => {
                    const ctx = SillyTavern.getContext?.();
                    const rawId = (ctx && ctx.characterId !== undefined && ctx.characterId !== null)
                        ? ctx.characterId
                        : (character?.id ?? null);
                    const id = normalizeCharacterKey(rawId);
                    if (id) migrateCharacterConfigKey(id, character?.id, character?.avatar_file_name || null);
                    switchCharacter(id);
                });
                Logger.log('已成功监听角色加载事件(CHARACTER_LOADED)。');
                eventListenerAttached = true;
            }

            // 方案B: 监听聊天切换事件 (备用)
         if (context.eventSource && context.event_types?.CHAT_CHANGED) {
                 context.eventSource.on(context.event_types.CHAT_CHANGED, () => {
                    setTimeout(() => { // 延迟一点以确保上下文已更新
                        try {
                            const freshContext = SillyTavern.getContext();
                            const rawId = (freshContext && freshContext.characterId !== undefined && freshContext.characterId !== null)
                                ? freshContext.characterId
                                : (freshContext.character?.id ?? null);
                            const id = normalizeCharacterKey(rawId);
                            if (id) migrateCharacterConfigKey(id, freshContext.character?.id, freshContext.character?.avatar_file_name || null);
                            switchCharacter(id);
                        } catch(e) {
                            Logger.error("在 CHAT_CHANGED 事件处理中发生错误", e);
                        }
                    }, 100);
                });
                Logger.log('已成功监听聊天切换事件(CHAT_CHANGED) 作为备用触发器。');
                eventListenerAttached = true;
            }

            // 方案C: 轮询 (最终后备)
            if (!eventListenerAttached) {
                Logger.warn('无法监听任何相关的切换事件，将启用轮询模式检测角色变更。');
                let lastChar = null;
                setInterval(() => {
                    try {
                        const ctx = SillyTavern.getContext();
                        const rawId = (ctx && ctx.characterId !== undefined && ctx.characterId !== null)
                            ? ctx.characterId
                            : (ctx?.character?.id ?? null);
                        const current = normalizeCharacterKey(rawId);
                        if (current) migrateCharacterConfigKey(current, ctx?.character?.id, ctx?.character?.avatar_file_name || null);
                        if (current !== lastChar) {
                            lastChar = current;
                            switchCharacter(current);
                        }
                    } catch (e) {
                        // ignore
                    }
                }, 1500); // 1.5s 轮询
            }
        } else {
            Logger.warn('SillyTavern 上下文不可用，无法实现角色配置绑定。');
        }
        
        // 初始化时，立即设置一次当前角色的配置
        window.WBAP.config = getCurrentCharacterConfig();
    }

    // 暴露接口
    window.WBAP.CharacterManager = {
        initialize,
        getCurrentCharacterConfig,
        switchCharacter
    };

})();
