// modules/character_manager.js

(function () {
    'use strict';

    window.WBAP = window.WBAP || {};
    const Logger = WBAP.Logger;

    let currentCharacterId = null;

    function normalizeCharacterKey(id) {
        if (id === null || id === undefined) return null;
        return String(id);
    }

    function extractCharacterIdFromContext(context) {
        if (!context) return null;

        // 最优先：ST 提供的 characterId（数字或字符串）
        if (context.characterId !== undefined && context.characterId !== null) {
            return normalizeCharacterKey(context.characterId);
        }

        const character = context.character;
        if (!character) return null;

        // 次优先：avatar文件名（全局唯一）
        if (character.avatar) {
            return normalizeCharacterKey(character.avatar);
        }

        // 最后：character.name（可能不唯一，但总比 null 好）
        if (character.name) {
            return normalizeCharacterKey(character.name);
        }

        return null;
    }

    // 增强的角色配置查找函数
    function findCharacterConfig(targetId) {
        const mainConfig = WBAP.mainConfig;
        if (!mainConfig?.characterConfigs) return null;

        // 1. 精确匹配
        if (mainConfig.characterConfigs[targetId]) {
            return { key: targetId, config: mainConfig.characterConfigs[targetId] };
        }

        // 2. 尝试数字/字符串转换
        const numId = Number(targetId);
        if (!isNaN(numId) && mainConfig.characterConfigs[numId]) {
            return { key: numId, config: mainConfig.characterConfigs[numId] };
        }
        const strId = String(targetId);
        if (mainConfig.characterConfigs[strId]) {
            return { key: strId, config: mainConfig.characterConfigs[strId] };
        }

        // 3. 尝试通过avatar匹配
        try {
            const context = SillyTavern.getContext();
            const avatar = context?.character?.avatar_file_name;
            if (avatar && mainConfig.characterConfigs[avatar]) {
                return { key: avatar, config: mainConfig.characterConfigs[avatar] };
            }
        } catch (e) {
            // ignore
        }

        // 4. 尝试模糊匹配（去除特殊字符）
        const normalized = String(targetId).replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
        if (normalized) {
            for (const [key, config] of Object.entries(mainConfig.characterConfigs)) {
                const keyNormalized = String(key).replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
                if (keyNormalized === normalized) {
                    return { key, config };
                }
            }
        }

        return null;
    }

    function migrateCharacterConfigKey(targetId, legacyId, legacyAvatar) {
        const key = normalizeCharacterKey(targetId);
        if (!key) return;

        const mainConfig = WBAP.mainConfig;
        if (!mainConfig?.characterConfigs) return;

        // 如果目标键已存在，不迁移
        if (mainConfig.characterConfigs[key]) return;

        // 尝试找到旧配置（使用增强的查找函数）
        const found = findCharacterConfig(legacyId) || findCharacterConfig(legacyAvatar);
        if (!found) return;

        // 迁移配置
        mainConfig.characterConfigs[key] = found.config;

        // 不立即删除旧配置，保留作为备份
        // 可以在下次启动时清理（通过版本号标记）

        if (typeof WBAP.saveConfig === 'function') {
            WBAP.saveConfig();
        }
        Logger.log(`已迁移角色配置: ${found.key} -> ${key}`);
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

    // 主页临时配置（不保存到磁盘）
    let temporaryHomeConfig = null;

    // 创建或获取主页临时配置
    function getTemporaryHomeConfig() {
        if (!temporaryHomeConfig) {
            const createDefault = WBAP.createDefaultCharacterConfig;
            temporaryHomeConfig = createDefault
                ? createDefault()
                : JSON.parse(JSON.stringify(WBAP.DEFAULT_CONFIG || {}));
            Logger.log('[CharacterManager] 创建主页临时配置');
        }
        return temporaryHomeConfig;
    }

    // 清空主页临时配置
    function clearTemporaryHomeConfig() {
        temporaryHomeConfig = null;
        Logger.log('[CharacterManager] 主页临时配置已清空');
    }

    // 获取当前角色的配置
    function getCurrentCharacterConfig() {
        const mainConfig = WBAP.mainConfig;

        // 在插件完全加载前，如果被调用，返回默认配置
        if (!mainConfig) {
            Logger.warn('getCurrentCharacterConfig 在 mainConfig 初始化前被调用。');
            const createDefault = WBAP.createDefaultCharacterConfig;
            return createDefault ? createDefault() : JSON.parse(JSON.stringify(WBAP.DEFAULT_CONFIG || {}));
        }

        if (!mainConfig.characterConfigs) {
            mainConfig.characterConfigs = {};
        }

        if (!currentCharacterId) {
            currentCharacterId = resolveCurrentCharacterId();
        }

        // 如果没有角色ID，使用临时配置（主页）
        if (!currentCharacterId) {
            return getTemporaryHomeConfig();
        }

        const key = currentCharacterId;

        if (!mainConfig.characterConfigs[key]) {
            Logger.log(`为角色 ${key} 创建新的默认配置。`);
            const createDefault = WBAP.createDefaultCharacterConfig;
            mainConfig.characterConfigs[key] = createDefault
                ? createDefault()
                : JSON.parse(JSON.stringify(WBAP.DEFAULT_CONFIG));

            // 立即保存新创建的配置
            if (typeof WBAP.saveConfig === 'function') {
                WBAP.saveConfig();
            }
        }

        // 返回角色专属配置
        return mainConfig.characterConfigs[key];
    }

    // ── 安全配置修改接口 ──

    /**
     * 安全地修改当前角色配置的某个字段。
     * 所有UI代码应使用此函数代替直接写 WBAP.config.xxx = yyy。
     *
     * @param {string} path - 点分隔的配置路径，如 'superMemory.enabled'
     * @param {*} value - 要设置的值
     * @param {boolean} [save=true] - 是否立即保存
     */
    function setConfigValue(path, value, save = true) {
        const config = getCurrentCharacterConfig();
        if (!config) {
            Logger.warn('[CharacterManager] setConfigValue: 无法获取当前配置');
            return;
        }

        const parts = path.split('.');
        let target = config;
        for (let i = 0; i < parts.length - 1; i++) {
            if (!target[parts[i]] || typeof target[parts[i]] !== 'object') {
                target[parts[i]] = {};
            }
            target = target[parts[i]];
        }
        target[parts[parts.length - 1]] = value;

        // 同步 WBAP.config 引用（保持向后兼容）
        window.WBAP.config = config;

        if (save && typeof WBAP.saveConfig === 'function') {
            WBAP.saveConfig();
        }
    }

    /**
     * 获取当前角色配置的某个字段值。
     * @param {string} path - 点分隔的配置路径
     * @param {*} [defaultValue] - 默认值
     */
    function getConfigValue(path, defaultValue = undefined) {
        const config = getCurrentCharacterConfig();
        if (!config) return defaultValue;

        const parts = path.split('.');
        let target = config;
        for (const part of parts) {
            if (target === null || target === undefined || typeof target !== 'object') {
                return defaultValue;
            }
            target = target[part];
        }
        return target !== undefined ? target : defaultValue;
    }


    // 切换互斥锁和代数追踪
    let isSwitching = false;
    let switchGeneration = 0;
    let switchDebounceTimer = null;

    // 切换角色时调用的函数
    function switchCharacter(characterId) {
        // null 或 undefined 表示主页（无角色）
        const newCharacterId = characterId || null;

        // 如果角色未改变，直接返回
        if (currentCharacterId === newCharacterId) return;

        // 如果正在切换中，记录警告但仍然执行（以最新的为准）
        if (isSwitching) {
            Logger.warn(`[CharacterManager] 切换冲突: 正在切换中又收到新请求 ${newCharacterId}`);
        }

        isSwitching = true;
        switchGeneration++;
        const thisGeneration = switchGeneration;

        try {
            // 如果从角色卡返回主页，清空临时配置
            if (!newCharacterId && currentCharacterId) {
                clearTemporaryHomeConfig();
            }

            const prevId = currentCharacterId;
            Logger.log(`[CharacterManager] 切换: ${prevId || '主页'} -> ${newCharacterId || '主页'}`);
            currentCharacterId = newCharacterId;

            // 更新全局的活动配置对象
            const newConfig = getCurrentCharacterConfig();
            window.WBAP.config = newConfig;

            // 只有角色卡才保存到localStorage
            try {
                if (newCharacterId) {
                    localStorage.setItem('WBAP_current_character', newCharacterId);
                } else {
                    localStorage.removeItem('WBAP_current_character');
                }
            } catch (e) {
                Logger.warn('[CharacterManager] 无法更新localStorage', e);
            }

            // 重置 SuperMemory 图谱加载标记（切换角色后需要重新加载）
            if (WBAP.SuperMemory) {
                WBAP.SuperMemory._graphLoaded = false;
            }

            // 检查是否被更新的切换覆盖
            if (thisGeneration !== switchGeneration) {
                Logger.log('[CharacterManager] 切换已被更新的请求覆盖，跳过UI刷新');
                return;
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
        } finally {
            isSwitching = false;
        }
    }

    // 【BUG修复】保存轮询 interval ID，以便清理
    let characterPollingIntervalId = null;

    // 初始化，监听角色加载事件
    function initialize() {
        // 【BUG修复】先清理之前的轮询，防止重复初始化
        if (characterPollingIntervalId) {
            clearInterval(characterPollingIntervalId);
            characterPollingIntervalId = null;
        }

        if (typeof SillyTavern !== 'undefined' && SillyTavern.getContext) {
            const context = SillyTavern.getContext();
            let lastCharacterId = null;

            // 统一的切换处理函数
            const handleCharacterSwitch = () => {
                try {
                    const context = SillyTavern.getContext();
                    const rawId = (context && context.characterId !== undefined && context.characterId !== null)
                        ? context.characterId
                        : (context?.character?.id ?? null);
                    const id = normalizeCharacterKey(rawId);

                    // 只在ID真正变化时才切换
                    if (id !== lastCharacterId) {
                        Logger.log(`检测到角色变化: ${lastCharacterId || 'null'} -> ${id || 'null'}`);
                        lastCharacterId = id;

                        if (id) {
                            migrateCharacterConfigKey(id, context?.character?.id, context?.character?.avatar_file_name);
                        }

                        switchCharacter(id);
                    }
                } catch (e) {
                    Logger.error('处理角色切换时出错', e);
                }
            };

            // 方案A: CHARACTER_LOADED事件
            if (context.eventSource && context.event_types?.CHARACTER_LOADED) {
                context.eventSource.on(context.event_types.CHARACTER_LOADED, () => {
                    handleCharacterSwitch();
                });
                Logger.log('已监听CHARACTER_LOADED事件');
            }

            // 方案B: CHAT_CHANGED事件
            if (context.eventSource && context.event_types?.CHAT_CHANGED) {
                context.eventSource.on(context.event_types.CHAT_CHANGED, () => {
                    handleCharacterSwitch();
                });
                Logger.log('已监听CHAT_CHANGED事件');
            }

            // 方案C: 轮询（始终启用，作为兜底）
            // 【BUG修复】保存 interval ID
            characterPollingIntervalId = setInterval(() => {
                // 如果事件监听正常工作，轮询不会触发切换（因为ID未变化）
                // 如果事件失效，轮询会接管
                handleCharacterSwitch();
            }, 1000); // 1秒轮询
            Logger.log('已启动角色切换轮询检测（1秒间隔）');

            // 初始化时立即执行一次
            handleCharacterSwitch();

        } else {
            Logger.warn('SillyTavern 上下文不可用，无法实现角色配置绑定。');
        }

        // 初始化时，立即设置一次当前角色的配置
        window.WBAP.config = getCurrentCharacterConfig();
    }

    // 【BUG修复】清理函数
    function cleanup() {
        if (characterPollingIntervalId) {
            clearInterval(characterPollingIntervalId);
            characterPollingIntervalId = null;
            Logger.log('[CharacterManager] 轮询 interval 已清除');
        }
        if (switchDebounceTimer) {
            clearTimeout(switchDebounceTimer);
            switchDebounceTimer = null;
        }
        Logger.log('[CharacterManager] 已清理');
    }

    // 暴露接口
    window.WBAP.CharacterManager = {
        initialize,
        cleanup,
        getCurrentCharacterConfig,
        switchCharacter,
        clearTemporaryHomeConfig,
        setConfigValue,
        getConfigValue,
        extractCharacterIdFromContext,
        get currentCharacterId() {
            return currentCharacterId;
        },
        get isTemporaryConfig() {
            return !currentCharacterId;
        }
    };

})();
