// modules/prompt_manager.js

(function () {
    'use strict';

    window.WBAP = window.WBAP || {};
    const Logger = WBAP.Logger;

    let basePrompts = [];
    let userPrompts = [];

    // 解析默认提示词文件路径，避免路径编码差异导致 404
    function getDefaultPromptUrl() {
        // index.js 会写入 MODULE_BASE_PATH，优先使用它
        let moduleBase = window.WBAP?.MODULE_BASE_PATH;
        // 回退机制：如果还未定义，使用推测的路径
        if (!moduleBase) {
            moduleBase = '/scripts/extensions/third-party/writer%20brianer/modules/';
        }
        const normalized = moduleBase.endsWith('/') ? moduleBase : `${moduleBase}/`;
        // 将末尾的 modules/ 替换为 prompts/default.json
        return normalized.replace(/modules\/?$/i, 'prompts/default.json');
    }

    // 从服务器加载基础提示词文件
    async function loadBasePrompts() {
        try {
            // 注意：SillyTavern 的 extensions API 不提供列出文件功能。
            // 我们假设一个默认文件名，或者未来通过配置指定。
            const url = getDefaultPromptUrl();
            const response = await fetch(url);
            if (response.ok) {
                const data = await response.json();
                basePrompts = Array.isArray(data) ? data : [data];
                Logger.log(`成功加载 ${basePrompts.length} 个基础提示词。`);
            } else {
                Logger.warn(`未找到默认提示词文件 (${url})，将只使用用户自定义提示词。`);
                basePrompts = [];
            }
        } catch (e) {
            Logger.error('加载基础提示词失败:', e);
            basePrompts = [];
        }
    }

    // 从主配置加载用户自定义的提示词
    function loadUserPrompts() {
        const pools = WBAP.getGlobalPools ? WBAP.getGlobalPools() : (WBAP.mainConfig?.globalPools || {});
        const promptPool = pools?.prompts?.main;
        if (Array.isArray(promptPool)) {
            userPrompts = promptPool;
        } else {
            userPrompts = [];
        }

    }

    // 合并基础和用户提示词
    function getCombinedPrompts() {
        // 每次都从当前角色的配置读取，确保角色切换后能获取正确的提示词
        loadUserPrompts();
        // 使用 Map 来合并，用户自定义的同名提示词会覆盖基础提示词
        const promptMap = new Map();
        basePrompts.forEach(p => promptMap.set(p.name, p));
        userPrompts.forEach(p => promptMap.set(p.name, p));
        return Array.from(promptMap.values());
    }

    // 保存用户提示词（只保存用户修改或创建的）
    function saveUserPrompts() {
        const pools = WBAP.getGlobalPools ? WBAP.getGlobalPools() : (WBAP.mainConfig?.globalPools || {});
        if (!pools.prompts) pools.prompts = {};
        pools.prompts.main = userPrompts;
        WBAP.saveConfig();
    }

    function addOrUpdatePrompt(promptData) {
        loadUserPrompts();
        const index = userPrompts.findIndex(p => p.name === promptData.name);
        if (index > -1) {
            userPrompts[index] = promptData; // 更新
        } else {
            userPrompts.push(promptData); // 新增
        }
        saveUserPrompts();
    }

    function deletePrompt(promptName) {
        loadUserPrompts();
        userPrompts = userPrompts.filter(p => p.name !== promptName);
        saveUserPrompts();
    }

    async function initialize() {
        await loadBasePrompts();
        loadUserPrompts();
    }

    // 暴露接口
    window.WBAP.PromptManager = {
        initialize,
        getCombinedPrompts,
        addOrUpdatePrompt,
        deletePrompt
    };

})();
