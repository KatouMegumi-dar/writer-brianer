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

    // 切换角色时调用的函数
    function switchCharacter(characterId) {
        // null 或 undefined 表示主页（无角色）
        const newCharacterId = characterId || null;

        // 如果角色未改变，直接返回
        if (currentCharacterId === newCharacterId) return;

        // 如果从角色卡返回主页，清空临时配置
        if (!newCharacterId && currentCharacterId) {
            clearTemporaryHomeConfig();
        }

        Logger.log(`切换到${!newCharacterId ? '主页（临时配置）' : '角色 ' + newCharacterId}`);
        currentCharacterId = newCharacterId;

        // 更新全局的活动配置对象
        window.WBAP.config = getCurrentCharacterConfig();

        // 只有角色卡才保存到localStorage
        try {
            if (newCharacterId) {
                localStorage.setItem('WBAP_current_character', newCharacterId);
            } else {
                localStorage.removeItem('WBAP_current_character');
            }
        } catch (e) {
            Logger.warn('无法更新localStorage', e);
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
            setInterval(() => {
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

    // 暴露接口
    window.WBAP.CharacterManager = {
        initialize,
        getCurrentCharacterConfig,
        switchCharacter,
        clearTemporaryHomeConfig,
        get currentCharacterId() {
            return currentCharacterId;
        },
        get isTemporaryConfig() {
            return !currentCharacterId;
        }
    };

})();
