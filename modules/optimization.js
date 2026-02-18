// modules/optimization.js
// 剧情优化交互面板与逻辑
(function () {
    'use strict';

    window.WBAP = window.WBAP || {};
    const Logger = WBAP.Logger || console;

    const INITIAL_AI_MESSAGE = '你好！我是你的剧情优化助手。已为您生成了初步方案，点击右上角的预览图标即可查看全文。';
    const DEFAULT_SYSTEM_PROMPT = WBAP.DEFAULT_OPT_SYSTEM_PROMPT || [
        '你是一名剧情优化助手，负责在保留人设和世界书设定的前提下，润色和改写剧情片段。',
        '请保持语气一致，补足氛围描写，强化场景细节，避免违背角色底线。',
        '输出一段可直接替换原文的精炼文本，避免解释过程。'
    ].join('\n');
    const DEFAULT_PROMPT_TEMPLATE = WBAP.DEFAULT_OPT_PROMPT_TEMPLATE || '请优化以下剧情内容，保持人设和世界观一致：\n\n{input}';
    const DEFAULT_PRESET_NAME = '默认优化提示词';
    const DEFAULT_PRESET_DESC = '保持人设与世界观一致的剧情润色';

    const state = {
        initialized: false,
        sending: false,
        messages: [],
        previewText: '',
        elements: {},
        worldSelection: {
            selected: new Set(),
            entriesByWorld: new Map(),
            cache: new Map(),
            activeWorld: null,
            worldList: []
        },
        // API实例和模型选择状态
        selectedEndpointId: null,
        selectedModel: null,
        availableModels: [],
        // 取消和重新生成
        abortController: null,
        // Level3 三级优化模式
        mode: 'manual',           // 'manual' | 'level3'
        level3Context: null,      // 三级优化上下文 { inputText, originalInput, worldbookContent }
        level3Resolve: null,      // Promise resolve 回调
        level3Reject: null        // Promise reject 回调
    };

    function getConfig() {
        if (WBAP.CharacterManager && typeof WBAP.CharacterManager.getCurrentCharacterConfig === 'function') {
            return WBAP.CharacterManager.getCurrentCharacterConfig() || {};
        }
        return WBAP.config || {};
    }

    function getGlobalPools() {
        return WBAP.getGlobalPools ? WBAP.getGlobalPools() : (WBAP.mainConfig?.globalPools || {});
    }

    function getGlobalEndpoints() {
        const pools = getGlobalPools();
        return Array.isArray(pools?.selectiveMode?.apiEndpoints) ? pools.selectiveMode.apiEndpoints : [];
    }

    function getOptimizationApiProfile() {
        const pools = getGlobalPools();
        if (!pools.optimization) pools.optimization = {};
        if (!pools.optimization.apiConfig) {
            pools.optimization.apiConfig = WBAP.createDefaultOptimizationApiProfile
                ? WBAP.createDefaultOptimizationApiProfile()
                : {};
        }
        return pools.optimization.apiConfig;
    }

    function getOptimizationPresets() {
        const pools = getGlobalPools();
        if (!pools.prompts) pools.prompts = {};
        if (!Array.isArray(pools.prompts.optimizationLevel3)) {
            pools.prompts.optimizationLevel3 = [];
        }
        if (pools.prompts.optimizationLevel3.length === 0) {
            pools.prompts.optimizationLevel3 = [getDefaultOptimizationPromptPreset()];
            WBAP.saveConfig?.();
        }
        return pools.prompts.optimizationLevel3;
    }

    function getDefaultOptimizationPromptPreset() {
        return {
            name: DEFAULT_PRESET_NAME,
            description: DEFAULT_PRESET_DESC,
            systemPrompt: DEFAULT_SYSTEM_PROMPT,
            promptTemplate: DEFAULT_PROMPT_TEMPLATE
        };
    }

    function ensureOptimizationPromptPresets(cfg) {
        if (!cfg.optimizationLevel3) {
            cfg.optimizationLevel3 = {
                enabled: false,
                autoConfirm: false,
                selectedPromptIndex: 0
            };
        }
        const level3Cfg = cfg.optimizationLevel3;
        if (level3Cfg.selectedPromptIndex == null) {
            level3Cfg.selectedPromptIndex = 0;
        }
        if (level3Cfg.autoConfirm == null) {
            level3Cfg.autoConfirm = false;
        }
        getOptimizationPresets();
        return level3Cfg;
    }

    function ensureOptimizationApiConfig(cfg) {
        if (!cfg.optimizationApiConfig) {
            cfg.optimizationApiConfig = { useIndependentProfile: false, selectedEndpointId: null };
        }
        if (cfg.optimizationApiConfig.useIndependentProfile == null) {
            cfg.optimizationApiConfig.useIndependentProfile = false;
        }
        if (cfg.optimizationApiConfig.selectedEndpointId === undefined) {
            cfg.optimizationApiConfig.selectedEndpointId = null;
        }
        return cfg.optimizationApiConfig;
    }

    function getSelectedOptimizationPromptPreset() {
        const cfg = getConfig();
        const level3Cfg = ensureOptimizationPromptPresets(cfg);
        const presets = getOptimizationPresets();
        let idx = level3Cfg.selectedPromptIndex || 0;
        if (idx < 0 || idx >= presets.length) idx = 0;
        const preset = presets[idx] || {};
        return {
            name: preset.name || DEFAULT_PRESET_NAME,
            description: preset.description || DEFAULT_PRESET_DESC,
            systemPrompt: (preset.systemPrompt || DEFAULT_SYSTEM_PROMPT).trim() || DEFAULT_SYSTEM_PROMPT,
            promptTemplate: preset.promptTemplate || DEFAULT_PROMPT_TEMPLATE
        };
    }

    function ensurePanelInjected() {
        if (state.elements.root) return;
        const tpl = WBAP.UI_TEMPLATES?.OPTIMIZATION_PANEL_HTML;
        if (!tpl) {
            Logger.warn('未找到优化面板模板');
            return;
        }
        const wrapper = document.createElement('div');
        wrapper.innerHTML = tpl.trim();
        const root = wrapper.firstElementChild;
        if (!root) return;
        document.body.appendChild(root);

        state.elements.root = root;
        state.elements.chat = root.querySelector('#wbap-opt-chat');
        state.elements.input = root.querySelector('#wbap-opt-input');
        state.elements.sendBtn = root.querySelector('#wbap-opt-send');
        state.elements.previewOverlay = root.querySelector('#wbap-opt-preview');
        state.elements.previewText = root.querySelector('#wbap-opt-preview-text');
        state.elements.previewToggle = root.querySelector('#wbap-opt-preview-toggle');
        state.elements.worldBtn = root.querySelector('#wbap-opt-world-btn');
        state.elements.worldLabel = root.querySelector('#wbap-opt-world-label');
        state.elements.promptLabel = root.querySelector('#wbap-opt-prompt-label');
        state.elements.promptBtn = root.querySelector('#wbap-opt-prompt-btn');
        state.elements.promptPop = root.querySelector('#wbap-opt-prompt-pop');
        state.elements.promptList = root.querySelector('#wbap-opt-prompt-list');
        state.elements.worldPop = root.querySelector('#wbap-opt-world-pop');
        state.elements.worldList = root.querySelector('#wbap-opt-world-list');
        state.elements.entryList = root.querySelector('#wbap-opt-entry-list');
        // API实例弹窗元素
        state.elements.endpointBtn = root.querySelector('#wbap-opt-endpoint-btn');
        state.elements.endpointLabel = root.querySelector('#wbap-opt-endpoint-label');
        state.elements.endpointPop = root.querySelector('#wbap-opt-endpoint-pop');
        state.elements.endpointList = root.querySelector('#wbap-opt-endpoint-list');
        // 模型弹窗元素
        state.elements.modelBtn = root.querySelector('#wbap-opt-model-btn');
        state.elements.modelLabel = root.querySelector('#wbap-opt-model-label');
        state.elements.modelPop = root.querySelector('#wbap-opt-model-pop');
        state.elements.modelList = root.querySelector('#wbap-opt-model-list');
        state.elements.modelRefresh = root.querySelector('#wbap-opt-model-refresh');
        // 操作按钮
        state.elements.regenBtn = root.querySelector('#wbap-opt-regen');
        state.elements.cancelBtn = root.querySelector('#wbap-opt-cancel');
        // Level3 模式按钮
        state.elements.confirmBtn = root.querySelector('#wbap-opt-confirm');
        state.elements.skipBtn = root.querySelector('#wbap-opt-skip');

        bindPanelEvents();
        resetChat();
    }

    function bindPanelEvents() {
        const { root, input, sendBtn, previewToggle, previewOverlay, worldBtn, modelRefresh, promptBtn } = state.elements;
        if (!root) return;

        root.querySelector('#wbap-opt-close')?.addEventListener('click', closePanel);
        previewToggle?.addEventListener('click', togglePreview);
        root.querySelector('#wbap-opt-preview-close')?.addEventListener('click', hidePreview);

        if (sendBtn) {
            sendBtn.addEventListener('click', () => handleSend());
        }
        if (input) {
            input.addEventListener('keydown', (e) => {
                if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
                    e.preventDefault();
                    handleSend();
                }
            });
            input.addEventListener('input', autoResizeInput);
        }

        // 世界书弹窗事件
        if (worldBtn) {
            worldBtn.addEventListener('click', toggleWorldPopover);
        }
        const worldPop = state.elements.worldPop;
        worldPop?.querySelector('#wbap-opt-world-close')?.addEventListener('click', hideWorldPopover);
        worldPop?.querySelector('#wbap-opt-world-refresh')?.addEventListener('click', () => loadWorldList(true));
        worldPop?.querySelector('#wbap-opt-world-apply')?.addEventListener('click', hideWorldPopover);
        worldPop?.querySelector('#wbap-opt-world-clear')?.addEventListener('click', clearWorldSelection);

        // 提示词弹窗事件
        if (promptBtn) {
            promptBtn.addEventListener('click', togglePromptPopover);
        }
        root.querySelector('#wbap-opt-prompt-close')?.addEventListener('click', hidePromptPopover);

        // API实例弹窗事件
        state.elements.endpointBtn?.addEventListener('click', toggleEndpointPopover);
        root.querySelector('#wbap-opt-endpoint-close')?.addEventListener('click', hideEndpointPopover);

        // 模型弹窗事件
        state.elements.modelBtn?.addEventListener('click', toggleModelPopover);
        root.querySelector('#wbap-opt-model-close')?.addEventListener('click', hideModelPopover);
        modelRefresh?.addEventListener('click', handleRefreshModelList);

        // 操作按钮事件
        state.elements.regenBtn?.addEventListener('click', handleRegenerate);
        state.elements.cancelBtn?.addEventListener('click', handleCancel);

        // Level3 模式按钮事件
        state.elements.confirmBtn?.addEventListener('click', confirmLevel3);
        state.elements.skipBtn?.addEventListener('click', skipLevel3);

        // 点击遮罩关闭预览
        previewOverlay?.addEventListener('click', (e) => {
            if (e.target === previewOverlay) hidePreview();
        });
    }

    function autoResizeInput() {
        const el = state.elements.input;
        if (!el) return;
        el.style.height = 'auto';
        el.style.height = Math.min(140, el.scrollHeight) + 'px';
    }

    function resetChat() {
        state.messages = [{ role: 'ai', content: INITIAL_AI_MESSAGE }];
        renderMessages();
    }

    function renderMessages() {
        const chat = state.elements.chat;
        if (!chat) return;
        chat.innerHTML = state.messages.map(renderBubble).join('');
        scrollChatToBottom();
        updatePreviewText();
    }

    function scrollChatToBottom() {
        const chat = state.elements.chat;
        if (!chat) return;
        chat.scrollTop = chat.scrollHeight;
    }

    function renderBubble(msg) {
        const roleClass = msg.role === 'user' ? 'user' : 'ai';
        return `
            <div class="wbap-opt-bubble ${roleClass}">
                <div class="wbap-opt-bubble-content">${escapeHtml(msg.content)}</div>
            </div>
        `;
    }

    function escapeHtml(str) {
        return String(str || '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;')
            .replace(/\n/g, '<br>');
    }

    function openPanel(prefillText = '') {
        ensurePanelInjected();
        const root = state.elements.root;
        if (!root) return;
        root.classList.add('open');
        root.classList.remove('wbap-hidden');
        loadWorldList(false);
        updateWorldLabel();
        updatePromptLabel();
        // 初始化API实例和模型状态
        renderEndpointList();
        loadCurrentEndpointModel();
        if (prefillText && state.elements.input) {
            state.elements.input.value = prefillText;
            autoResizeInput();
        }
        scrollChatToBottom();
    }

    function closePanel(options = {}) {
        const root = state.elements.root;
        if (!root) return;
        const { skipLevel3Cancel = false } = options;
        if (!skipLevel3Cancel && state.mode === 'level3' && state.level3Reject) {
            state.level3Reject(new Error('用户取消了三级优化'));
            resetLevel3State();
        }
        root.classList.remove('open');
        hidePreview();
    }

    function togglePreview() {
        const overlay = state.elements.previewOverlay;
        if (!overlay) return;
        overlay.classList.toggle('visible');
    }

    function hidePreview() {
        const overlay = state.elements.previewOverlay;
        if (!overlay) return;
        overlay.classList.remove('visible');
    }

    function updatePreviewText() {
        const lastAi = [...state.messages].reverse().find(m => m.role === 'ai');
        let content = lastAi?.content || '';

        // 如果是初始结果消息，去除前缀
        const prefix = '📋 **一级/二级处理结果：**\n\n';
        if (content.startsWith(prefix)) {
            content = content.substring(prefix.length);
        }

        state.previewText = content;
        if (state.elements.previewText) {
            state.elements.previewText.value = state.previewText;
        }
    }

    async function loadWorldList(forceRefresh = false) {
        if (!state.elements.worldList) return;
        if (!forceRefresh && state.worldSelection.worldList.length > 0) {
            renderWorldList();
            return;
        }
        try {
            const names = await WBAP.getAllWorldBookNames?.();
            if (Array.isArray(names)) {
                state.worldSelection.worldList = names;
                renderWorldList();
            } else {
                state.elements.worldList.innerHTML = '<div class="wbap-opt-empty">未能获取世界书列表</div>';
            }
        } catch (e) {
            Logger.warn('获取世界书列表失败', e);
            state.elements.worldList.innerHTML = '<div class="wbap-opt-empty">获取失败</div>';
        }
    }

    function renderWorldList() {
        const container = state.elements.worldList;
        if (!container) return;
        const names = state.worldSelection.worldList;
        if (!names || names.length === 0) {
            container.innerHTML = '<div class="wbap-opt-empty">暂无世界书</div>';
            return;
        }
        container.innerHTML = names.map(name => {
            const checked = state.worldSelection.selected.has(name) ? 'checked' : '';
            return `
                <label>
                    <input type="checkbox" data-world="${encodeURIComponent(name)}" ${checked}>
                    <span>${escapeHtml(name)}</span>
                </label>
            `;
        }).join('');
        container.querySelectorAll('input[type="checkbox"]').forEach(cb => {
            cb.addEventListener('change', (e) => {
                const world = decodeURIComponent(e.target.dataset.world);
                if (e.target.checked) {
                    state.worldSelection.selected.add(world);
                    state.worldSelection.activeWorld = world;
                    loadWorldEntries(world);
                } else {
                    state.worldSelection.selected.delete(world);
                    state.worldSelection.entriesByWorld.delete(world);
                    if (state.worldSelection.activeWorld === world) {
                        state.worldSelection.activeWorld = state.worldSelection.selected.values().next().value || null;
                        renderEntryList(state.worldSelection.activeWorld);
                    }
                }
                updateWorldLabel();
            });
        });
        const target = state.worldSelection.activeWorld || state.worldSelection.selected.values().next().value || null;
        if (target) {
            loadWorldEntries(target);
        } else {
            renderEntryList(null);
        }
    }

    async function ensureWorldEntries(worldName) {
        if (!worldName) return {};
        if (state.worldSelection.cache.has(worldName)) {
            return state.worldSelection.cache.get(worldName) || {};
        }
        try {
            const book = await WBAP.loadWorldBookEntriesByName?.(worldName);
            const entries = (book && book.entries) ? book.entries : {};
            state.worldSelection.cache.set(worldName, entries);
            return entries;
        } catch (e) {
            Logger.warn('获取世界书条目失败', e);
            state.worldSelection.cache.set(worldName, {});
            return {};
        }
    }

    async function loadWorldEntries(worldName) {
        if (!worldName) {
            renderEntryList(null);
            return;
        }
        await ensureWorldEntries(worldName);
        renderEntryList(worldName);
    }

    function renderEntryList(worldName) {
        const container = state.elements.entryList;
        if (!container) return;
        if (!worldName) {
            container.innerHTML = '<div class="wbap-opt-empty">请先选择世界书</div>';
            return;
        }
        const entries = state.worldSelection.cache.get(worldName) || {};
        const entryIds = Object.keys(entries).filter(id => entries[id] && entries[id].disable !== true);
        if (entryIds.length === 0) {
            container.innerHTML = '<div class="wbap-opt-empty">该世界书无可用条目</div>';
            return;
        }
        const selectedSet = state.worldSelection.entriesByWorld.get(worldName) || new Set();
        container.innerHTML = entryIds.map(id => {
            const entry = entries[id];
            const label = entry?.comment || id;
            const checked = selectedSet.has(id) ? 'checked' : '';
            return `
                <label>
                    <input type="checkbox" data-entry="${encodeURIComponent(id)}" ${checked}>
                    <span>${escapeHtml(label)}</span>
                </label>
            `;
        }).join('');
        container.querySelectorAll('input[type="checkbox"]').forEach(cb => {
            cb.addEventListener('change', (e) => {
                const entryId = decodeURIComponent(e.target.dataset.entry);
                let set = state.worldSelection.entriesByWorld.get(worldName);
                if (!set) {
                    set = new Set();
                    state.worldSelection.entriesByWorld.set(worldName, set);
                }
                if (e.target.checked) {
                    set.add(entryId);
                } else {
                    set.delete(entryId);
                }
            });
        });
    }

    function toggleWorldPopover() {
        const pop = state.elements.worldPop;
        if (!pop) return;
        const isOpen = !pop.classList.contains('wbap-hidden');
        if (isOpen) {
            hideWorldPopover();
        } else {
            hidePromptPopover();
            hideEndpointPopover();
            hideModelPopover();
            pop.classList.remove('wbap-hidden');
            loadWorldList(false);
        }
    }

    function hideWorldPopover() {
        const pop = state.elements.worldPop;
        if (pop) pop.classList.add('wbap-hidden');
    }

    function clearWorldSelection() {
        state.worldSelection.selected.clear();
        state.worldSelection.entriesByWorld.clear();
        state.worldSelection.activeWorld = null;
        renderWorldList();
        updateWorldLabel();
    }

    function updateWorldLabel() {
        const labelEl = state.elements.worldLabel;
        if (!labelEl) return;
        const count = state.worldSelection.selected.size;
        labelEl.textContent = count > 0 ? `世界书 (${count})` : '世界书';
    }

    function updatePromptLabel() {
        const labelEl = state.elements.promptLabel;
        if (!labelEl) return;
        const preset = getSelectedOptimizationPromptPreset();
        labelEl.textContent = preset?.name || '提示词';
    }

    function togglePromptPopover() {
        const pop = state.elements.promptPop;
        if (!pop) return;
        const isOpen = !pop.classList.contains('wbap-hidden');
        if (isOpen) {
            hidePromptPopover();
        } else {
            hideWorldPopover();
            hideEndpointPopover();
            hideModelPopover();
            pop.classList.remove('wbap-hidden');
            renderPromptList();
        }
    }

    function hidePromptPopover() {
        const pop = state.elements.promptPop;
        if (pop) pop.classList.add('wbap-hidden');
    }

    function renderPromptList() {
        const list = state.elements.promptList;
        if (!list) return;
        const cfg = getConfig();
        const level3Cfg = ensureOptimizationPromptPresets(cfg);
        const presets = getOptimizationPresets();
        let selectedIndex = level3Cfg.selectedPromptIndex || 0;
        if (selectedIndex >= presets.length) {
            selectedIndex = 0;
            level3Cfg.selectedPromptIndex = 0;
            WBAP.saveConfig?.();
        }

        if (presets.length === 0) {
            list.innerHTML = '<div class="wbap-opt-empty">暂无提示词预设</div>';
            return;
        }

        list.innerHTML = presets.map((preset, idx) => {
            const name = preset?.name || `预设${idx + 1}`;
            const selectedClass = idx === selectedIndex ? ' selected' : '';
            return `
                <div class="wbap-opt-radio-item${selectedClass}" data-idx="${idx}">
                    <span class="wbap-opt-radio-item-text">${escapeHtml(name)}</span>
                </div>
            `;
        }).join('');

        list.querySelectorAll('.wbap-opt-radio-item').forEach(item => {
            item.addEventListener('click', () => {
                const idx = parseInt(item.dataset.idx, 10);
                if (Number.isFinite(idx)) {
                    selectPromptPreset(idx);
                }
            });
        });
    }

    function selectPromptPreset(index) {
        const cfg = getConfig();
        const level3Cfg = ensureOptimizationPromptPresets(cfg);
        const presets = getOptimizationPresets();
        const preset = presets[index];
        if (!preset) return;

        level3Cfg.selectedPromptIndex = index;
        WBAP.saveConfig?.();
        updatePromptLabel();
        renderPromptList();
        WBAP.UI?.refreshOptimizationPromptList?.();
        hidePromptPopover();
    }

    // ==================== API实例弹窗逻辑 ====================
    function toggleEndpointPopover() {
        const pop = state.elements.endpointPop;
        if (!pop) return;
        const isOpen = !pop.classList.contains('wbap-hidden');
        if (isOpen) {
            hideEndpointPopover();
        } else {
            hideModelPopover(); // 关闭其他弹窗
            hideWorldPopover();
            hidePromptPopover();
            pop.classList.remove('wbap-hidden');
            renderEndpointList();
        }
    }

    function hideEndpointPopover() {
        const pop = state.elements.endpointPop;
        if (pop) pop.classList.add('wbap-hidden');
    }

    function renderEndpointList() {
        const list = state.elements.endpointList;
        if (!list) return;
        list.innerHTML = '';

        const cfg = getConfig();
        const optCfg = ensureOptimizationApiConfig(cfg);
        const apiProfile = getOptimizationApiProfile();

        // 独立API模式
        if (optCfg.useIndependentProfile) {
            const label = (apiProfile.apiUrl || apiProfile.url) ? '独立 API' : '独立 API（未配置）';
            list.innerHTML = `
                <div class="wbap-opt-radio-item selected" data-id="__independent__">
                    <span class="wbap-opt-radio-item-text">${escapeHtml(label)}</span>
                </div>
            `;
            state.selectedEndpointId = '__independent__';
            updateEndpointLabel();
            return;
        }

        // 获取可用端点
        const endpoints = getGlobalEndpoints().filter(ep => ep.enabled !== false);
        if (endpoints.length === 0) {
            list.innerHTML = '<div class="wbap-opt-empty">请先在设置中配置 API 实例</div>';
            state.selectedEndpointId = null;
            updateEndpointLabel();
            return;
        }

        // 确保有默认选中
        if (!state.selectedEndpointId || !endpoints.find(ep => ep.id === state.selectedEndpointId)) {
            state.selectedEndpointId = optCfg.selectedEndpointId || endpoints[0].id;
        }
        if (optCfg.selectedEndpointId !== state.selectedEndpointId) {
            optCfg.selectedEndpointId = state.selectedEndpointId;
            WBAP.saveConfig?.();
        }

        endpoints.forEach(ep => {
            const div = document.createElement('div');
            div.className = 'wbap-opt-radio-item' + (ep.id === state.selectedEndpointId ? ' selected' : '');
            div.dataset.id = ep.id;
            div.innerHTML = `<span class="wbap-opt-radio-item-text">${escapeHtml(ep.name || ep.id)}</span>`;
            div.addEventListener('click', () => selectEndpoint(ep.id));
            list.appendChild(div);
        });

        updateEndpointLabel();
    }

    function selectEndpoint(endpointId) {
        state.selectedEndpointId = endpointId;
        const cfg = getConfig();
        const optCfg = ensureOptimizationApiConfig(cfg);
        optCfg.selectedEndpointId = endpointId;
        WBAP.saveConfig?.();
        renderEndpointList();
        hideEndpointPopover();
        // 切换API后重新渲染模型列表
        loadCurrentEndpointModel();
        updateEndpointLabel();
    }

    function updateEndpointLabel() {
        const label = state.elements.endpointLabel;
        if (!label) return;

        const cfg = getConfig();
        const optCfg = ensureOptimizationApiConfig(cfg);
        const apiProfile = getOptimizationApiProfile();

        if (optCfg.useIndependentProfile) {
            label.textContent = (apiProfile.apiUrl || apiProfile.url) ? '独立 API' : 'API（未配置）';
            return;
        }

        const endpoints = getGlobalEndpoints().filter(ep => ep.enabled !== false);
        const target = endpoints.find(ep => ep.id === state.selectedEndpointId);
        label.textContent = target ? (target.name || target.id) : 'API 实例';
    }

    function loadCurrentEndpointModel() {
        const cfg = getConfig();
        const optCfg = ensureOptimizationApiConfig(cfg);

        if (optCfg.useIndependentProfile) {
            const apiProfile = getOptimizationApiProfile();
            state.selectedModel = apiProfile.model || '';
            state.availableModels = state.selectedModel ? [state.selectedModel] : [];
        } else {
            const endpoints = getGlobalEndpoints().filter(ep => ep.enabled !== false);
            const target = endpoints.find(ep => ep.id === (state.selectedEndpointId || optCfg.selectedEndpointId)) || endpoints[0];
            state.selectedEndpointId = target?.id || null;
            state.selectedModel = target?.model || '';
            state.availableModels = state.selectedModel ? [state.selectedModel] : [];
        }
        updateModelLabel();
    }

    // ==================== 模型弹窗逻辑 ====================
    function toggleModelPopover() {
        const pop = state.elements.modelPop;
        if (!pop) return;
        const isOpen = !pop.classList.contains('wbap-hidden');
        if (isOpen) {
            hideModelPopover();
        } else {
            hideEndpointPopover(); // 关闭其他弹窗
            hideWorldPopover();
            hidePromptPopover();
            pop.classList.remove('wbap-hidden');
            renderModelList();
        }
    }

    function hideModelPopover() {
        const pop = state.elements.modelPop;
        if (pop) pop.classList.add('wbap-hidden');
    }

    function renderModelList() {
        const list = state.elements.modelList;
        if (!list) return;
        list.innerHTML = '';

        const models = state.availableModels || [];
        if (models.length === 0) {
            list.innerHTML = '<div class="wbap-opt-empty">点击"刷新"获取可用模型</div>';
            return;
        }

        models.forEach(m => {
            const div = document.createElement('div');
            div.className = 'wbap-opt-radio-item' + (m === state.selectedModel ? ' selected' : '');
            div.dataset.model = m;
            div.innerHTML = `<span class="wbap-opt-radio-item-text">${escapeHtml(m)}</span>`;
            div.addEventListener('click', () => selectModel(m));
            list.appendChild(div);
        });
    }

    function selectModel(modelName) {
        state.selectedModel = modelName;
        renderModelList();
        hideModelPopover();
        updateModelLabel();
    }

    function updateModelLabel() {
        const label = state.elements.modelLabel;
        if (!label) return;
        label.textContent = state.selectedModel || '模型';
    }

    async function handleRefreshModelList() {
        const btn = state.elements.modelRefresh;
        if (btn) {
            btn.disabled = true;
            btn.textContent = '刷新中...';
        }
        try {
            const cfg = getConfig();
            const optCfg = ensureOptimizationApiConfig(cfg);
            let apiUrl = '';
            let apiKey = '';

            if (optCfg.useIndependentProfile) {
                const apiProfile = getOptimizationApiProfile();
                apiUrl = apiProfile.apiUrl || apiProfile.url || '';
                apiKey = apiProfile.apiKey || apiProfile.key || '';
            } else {
                const endpoints = getGlobalEndpoints().filter(ep => ep.enabled !== false);
                const target = endpoints.find(ep => ep.id === (state.selectedEndpointId || optCfg.selectedEndpointId)) || endpoints[0];
                apiUrl = target?.apiUrl || target?.url || '';
                apiKey = target?.apiKey || target?.key || '';
            }

            if (!apiUrl) throw new Error('请先配置 API URL');

            const result = await WBAP.fetchEndpointModels({ apiUrl, apiKey });
            if (result.success) {
                state.availableModels = result.models || [];
                // 如果当前选中的模型不在新列表中，选择第一个
                if (state.availableModels.length > 0) {
                    if (!state.availableModels.includes(state.selectedModel)) {
                        state.selectedModel = state.availableModels[0];
                    }
                }
                renderModelList();
                updateModelLabel();
            } else {
                throw new Error(result.message || '获取模型失败');
            }
        } catch (e) {
            Logger.warn('刷新模型失败', e);
            alert(`获取模型失败：${e.message || e}`);
        } finally {
            if (btn) {
                btn.disabled = false;
                btn.textContent = '刷新';
            }
        }
    }


    async function handleSend(textOverride = null) {
        if (state.sending) return;
        const input = state.elements.input;
        if (!input) return;
        const hasOverride = typeof textOverride === 'string';
        const userText = hasOverride ? textOverride : input.value.trim();
        if (!userText) return;

        // 保存最后一次输入用于重新生成

        if (!hasOverride) {
            appendMessage('user', userText);
            input.value = '';
            autoResizeInput();
        }

        let streamIndex = null;
        let receivedToken = false;
        let rafId = null;
        const scheduleRender = () => {
            if (typeof requestAnimationFrame !== 'function') {
                renderMessages();
                return;
            }
            if (rafId) return;
            rafId = requestAnimationFrame(() => {
                rafId = null;
                renderMessages();
            });
        };

        try {
            state.sending = true;
            setSending(true);

            const { apiConfig, model } = resolveApiConfig();
            if (!model) throw new Error('请先为优化选择模型');

            const worldbookContent = await buildSelectedWorldbookContent();

            const preset = getSelectedOptimizationPromptPreset();
            const systemPrompt = (preset.systemPrompt || '').trim() || DEFAULT_SYSTEM_PROMPT;
            const prompt = buildOptimizationPrompt(userText, worldbookContent, preset.promptTemplate);

            appendMessage('ai', '');
            streamIndex = state.messages.length - 1;

            state.abortController = new AbortController();
            const result = await WBAP.callAI(model, prompt, systemPrompt, {
                ...apiConfig,
                signal: state.abortController.signal,
                onToken: (chunk) => {
                    if (!chunk || streamIndex == null) return;
                    const target = state.messages[streamIndex];
                    if (!target) return;
                    receivedToken = true;
                    target.content += chunk;
                    scheduleRender();
                }
            });

            if (streamIndex != null && state.messages[streamIndex]) {
                const fallback = state.messages[streamIndex].content || '???????';
                const finalText = typeof result === 'string' ? result : '';
                const normalized = receivedToken ? finalText : finalText.trim();
                state.messages[streamIndex].content = normalized || fallback;
            }
            renderMessages();
        } catch (err) {
            if (err.name === 'AbortError' || err.message?.includes('abort')) {
                const message = '⚠️ 生成已取消';
                if (streamIndex != null && state.messages[streamIndex]) {
                    const target = state.messages[streamIndex];
                    target.content = target.content ? `${target.content}\n\n${message}` : message;
                    renderMessages();
                } else {
                    appendMessage('ai', message);
                }
            } else {
                Logger.error('剧情优化失败', err);
                const message = `⚠️ 优化失败：${err.message || err}`;
                if (streamIndex != null && state.messages[streamIndex]) {
                    const target = state.messages[streamIndex];
                    target.content = target.content ? `${target.content}\n\n${message}` : message;
                    renderMessages();
                } else {
                    appendMessage('ai', message);
                }
            }
        } finally {
            state.sending = false;
            state.abortController = null;
            setSending(false);
        }
    }

    function handleRegenerate() {
        if (state.sending) return;
        // 找到最后一条用户消息
        const lastUserMsg = [...state.messages].reverse().find(m => m.role === 'user');
        if (!lastUserMsg) {
            alert('没有可重新生成的消息');
            return;
        }
        // 移除最后一条AI回复（如果有）
        if (state.messages.length > 0 && state.messages[state.messages.length - 1].role === 'ai') {
            state.messages.pop();
            renderMessages();
        }
        // 使用最后一条用户输入重新生成
        handleSend(lastUserMsg.content);
    }

    function handleCancel() {
        if (!state.sending || !state.abortController) return;
        state.abortController.abort();
    }

    function setSending(loading) {
        const { sendBtn, cancelBtn, regenBtn } = state.elements;
        if (loading) {
            sendBtn?.classList.add('loading');
            if (sendBtn) sendBtn.disabled = true;
            // 显示取消按钮，隐藏重新生成按钮
            cancelBtn?.classList.remove('wbap-hidden');
            regenBtn?.classList.add('wbap-hidden');
        } else {
            sendBtn?.classList.remove('loading');
            if (sendBtn) sendBtn.disabled = false;
            // 隐藏取消按钮，显示重新生成按钮
            cancelBtn?.classList.add('wbap-hidden');
            regenBtn?.classList.remove('wbap-hidden');
        }
    }

    function appendMessage(role, content) {
        state.messages.push({ role, content });
        renderMessages();
    }

    function replaceToken(text, token, value) {
        return String(text || '').split(token).join(value ?? '');
    }

    function buildOptimizationPrompt(userText, worldbookContent, promptTemplate = '') {
        const history = state.messages
            .slice(-6)
            .map(m => `${m.role === 'user' ? '用户' : '助手'}：${m.content}`)
            .join('\n');
        const hasHistory = !!history;
        const hasWorldbook = !!worldbookContent;
        const template = (promptTemplate || '').trim();

        if (template) {
            const includesHistory = template.includes('{history}');
            const includesInput = template.includes('{input}');
            const includesWorldbook = template.includes('{worldbook}');
            let output = template;
            output = replaceToken(output, '{history}', history || '');
            output = replaceToken(output, '{input}', userText);
            output = replaceToken(output, '{worldbook}', worldbookContent || '');

            if (!includesHistory && hasHistory) {
                output = ['【已知对话】', history, '', output].join('\n');
            }
            if (!includesInput) {
                output += `\n\n${userText}`;
            }
            if (!includesWorldbook && hasWorldbook) {
                output += `\n\n【世界书摘录】\n${worldbookContent}`;
            }
            return output;
        }

        const worldPart = hasWorldbook ? `\n【世界书摘录】\n${worldbookContent}` : '';
        return [
            '【已知对话】',
            history || '（无历史）',
            '',
            '【用户新需求】',
            userText,
            worldPart,
            '',
            '请生成改写后的剧情片段，长度适中，语气保持一致，可直接替换原文。'
        ].join('\n');
    }

    async function buildSelectedWorldbookContent() {
        if (state.worldSelection.selected.size === 0) return '';
        const worlds = Array.from(state.worldSelection.selected);
        const entrySets = await Promise.all(worlds.map(async world => ({
            world,
            entries: await ensureWorldEntries(world)
        })));

        const blocks = entrySets.map(({ world, entries }) => {
            const selectedEntries = state.worldSelection.entriesByWorld.get(world);
            const enabledEntries = Object.entries(entries || {}).filter(([, e]) => e && e.disable !== true);
            const filtered = (selectedEntries && selectedEntries.size > 0)
                ? enabledEntries.filter(([id]) => selectedEntries.has(id))
                : enabledEntries;
            if (filtered.length === 0) return '';
            const block = filtered.map(([id, entry]) => `[${entry.comment || id}]\n${entry.content || ''}`).join('\n\n');
            return `【${world}】\n${block}`;
        }).filter(Boolean);

        return blocks.join('\n\n').trim();
    }

    function resolveApiConfig() {
        const cfg = getConfig();
        const optCfg = ensureOptimizationApiConfig(cfg);
        if (optCfg.useIndependentProfile) {
            const apiProfile = getOptimizationApiProfile();
            const apiConfig = {
                apiConfig: {
                    apiUrl: apiProfile.apiUrl || apiProfile.url || '',
                    apiKey: apiProfile.apiKey || apiProfile.key || '',
                    model: apiProfile.model,
                    maxTokens: apiProfile.maxTokens || 4000,
                    temperature: apiProfile.temperature ?? 0.7,
                    timeout: apiProfile.timeout || 60,
                    maxRetries: Number.isInteger(apiProfile.maxRetries) ? Math.max(0, apiProfile.maxRetries) : 2,
                    retryDelayMs: Number.isFinite(apiProfile.retryDelayMs) ? apiProfile.retryDelayMs : 800,
                    enableStreaming: apiProfile.enableStreaming !== false,
                    priority: 'high'
                },
                model: state.selectedModel || apiProfile.model
            };
            if (apiConfig.apiConfig.apiUrl && WBAP.setupPreconnect) {
                WBAP.setupPreconnect([{ apiUrl: apiConfig.apiConfig.apiUrl }]);
            }
            return apiConfig;
        }

        const endpoints = getGlobalEndpoints().filter(ep => ep.enabled !== false);
        if (endpoints.length === 0) {
            throw new Error('请先配置并启用 API 实例');
        }
        const target = endpoints.find(ep => ep.id === (state.selectedEndpointId || optCfg.selectedEndpointId)) || endpoints[0];
        state.selectedEndpointId = target?.id || null;
        const model = state.selectedModel || target.model;
        const resolved = {
            apiConfig: {
                ...target,
                maxRetries: Number.isInteger(target.maxRetries) ? Math.max(0, target.maxRetries) : 2,
                retryDelayMs: Number.isFinite(target.retryDelayMs) ? target.retryDelayMs : 800,
                enableStreaming: target.enableStreaming !== false,
                priority: target.priority || 'high'
            },
            model
        };
        if (resolved.apiConfig.apiUrl && WBAP.setupPreconnect) {
            WBAP.setupPreconnect([{ apiUrl: resolved.apiConfig.apiUrl }]);
        }
        return resolved;
    }

    function ensureFloatingButton() {
        if (state.elements.fab) return;

        const btn = document.createElement('button');
        btn.id = 'wbap-opt-fab';
        btn.className = 'wbap-opt-fab';
        btn.title = '剧情优化';
        btn.innerHTML = '<i class="fa-solid fa-wand-magic-sparkles"></i>';
        document.body.appendChild(btn);

        const restorePosition = () => {
            const saved = localStorage.getItem('wbap_opt_fab_position');
            if (saved) {
                try {
                    const pos = JSON.parse(saved);
                    btn.style.top = pos.top;
                    btn.style.left = pos.left;
                    btn.style.right = 'auto';
                    btn.style.bottom = 'auto';
                } catch (e) {
                    // ignore and keep default CSS bottom/right
                }
            }
            clampFabToViewport(btn);
        };

        const onClick = () => openPanel();
        const onDragEnd = (pos) => {
            localStorage.setItem('wbap_opt_fab_position', JSON.stringify(pos));
            clampFabToViewport(btn);
        };

        WBAP.makeDraggable(btn, onClick, onDragEnd);
        restorePosition();
        window.addEventListener('resize', () => clampFabToViewport(btn));
        state.elements.fab = btn;
    }

    function clampFabToViewport(el) {
        if (!el) return;
        const rect = el.getBoundingClientRect();
        const margin = 14;
        const top = Math.max(margin, Math.min(rect.top, window.innerHeight - rect.height - margin));
        const left = Math.max(margin, Math.min(rect.left, window.innerWidth - rect.width - margin));
        el.style.top = `${top}px`;
        el.style.left = `${left}px`;
        el.style.right = 'auto';
        el.style.bottom = 'auto';
    }

    // 钳制主插件悬浮球，防止移动端存储位置跑出视口
    function clampMainFab() {
        const mainFab = document.getElementById('wbap-float-btn');
        if (!mainFab) {
            return false;
        }
        clampFabToViewport(mainFab);
        window.addEventListener('resize', () => clampFabToViewport(mainFab));
        return true;
    }

    function configReady() {
        return !!(WBAP.mainConfig && WBAP.mainConfig.characterConfigs);
    }

    function updateFloatingButtonVisibility(retry = true, attempt = 0) {
        if (!configReady()) {
            if (retry && attempt < 20) {
                setTimeout(() => updateFloatingButtonVisibility(true, attempt + 1), 400);
            }
            return;
        }
        const cfg = getConfig();
        const enabled = cfg.enablePlotOptimization === true && cfg.enablePlotOptimizationFloatButton === true;
        if (enabled) {
            ensurePanelInjected();
            ensureFloatingButton();
            if (state.elements.fab) state.elements.fab.classList.remove('wbap-hidden');
        } else if (state.elements.fab) {
            state.elements.fab.classList.add('wbap-hidden');
        }
    }

    // ==================== 三级优化模式 ====================

    /**
     * 三级优化入口 - 被 processing.js 调用
     * @param {string} inputText - 一级/二级处理后的结果
     * @param {object} context - 上下文信息
     * @returns {Promise<string>} - 优化后的结果
     */
    async function processLevel3(inputText, context = {}) {
        const cfg = getConfig();
        const level3Cfg = cfg.optimizationLevel3 || {};

        // 如果未启用或自动确认模式，直接处理
        if (level3Cfg.autoConfirm) {
            return await autoProcessLevel3(inputText, context);
        }

        // 返回 Promise，等待用户确认
        return new Promise((resolve, reject) => {
            state.mode = 'level3';
            state.level3Context = { inputText, ...context };
            state.level3Resolve = resolve;
            state.level3Reject = reject;

            // 重置并打开面板
            ensurePanelInjected();

            // 先显示之前模型返回的结果，让用户查看
            state.messages = [
                { role: 'ai', content: '📋 **一级/二级处理结果：**\n\n' + inputText },
                { role: 'system', content: '💡 您可以直接点击 **"确认并发送"** 使用以上结果，或在输入框中输入修改要求进行进一步优化。' }
            ];
            renderMessages();
            openPanelForLevel3();

            // 不再自动触发优化，等待用户操作
        });
    }

    /**
     * 自动处理三级优化（无需用户确认）
     */
    async function autoProcessLevel3(inputText, context) {
        const { apiConfig, model } = resolveApiConfig();

        if (!model) {
            Logger.warn('三级优化：未配置模型，跳过优化');
            return inputText;
        }

        const preset = getSelectedOptimizationPromptPreset();
        const systemPrompt = preset.systemPrompt || DEFAULT_SYSTEM_PROMPT;
        const promptTemplate = preset.promptTemplate || DEFAULT_PROMPT_TEMPLATE;
        const prompt = promptTemplate.replace('{input}', inputText).replace('{worldbook}', context.worldbookContent || '');

        try {
            const result = await WBAP.callAI(model, prompt, systemPrompt, apiConfig);
            return result?.trim() || inputText;
        } catch (err) {
            Logger.error('三级自动优化失败', err);
            return inputText;
        }
    }

    /**
     * 打开面板用于三级优化
     */
    function openPanelForLevel3() {
        // 隐藏进度面板，避免与三级优化面板重叠
        const keepProgressPanel = state.level3Context?.keepProgressPanel === true;
        if (!keepProgressPanel && WBAP.UI?.hideProgressPanel) {
            WBAP.UI.hideProgressPanel();
        }

        const root = state.elements.root;
        if (!root) return;
        root.classList.add('open', 'level3-mode');
        root.classList.remove('wbap-hidden');
        renderEndpointList();
        loadCurrentEndpointModel();
        updatePromptLabel();
        scrollChatToBottom();
        updateLevel3Buttons();
    }

    /**
     * 更新 level3 模式特有按钮的显示
     */
    function updateLevel3Buttons() {
        const root = state.elements.root;
        if (!root) return;
        const level3Actions = root.querySelector('.wbap-opt-level3-actions');
        if (state.mode === 'level3') {
            level3Actions?.classList.remove('wbap-hidden');
        } else {
            level3Actions?.classList.add('wbap-hidden');
        }
    }

    /**
     * 确认并发送到 ST
     */
    function confirmLevel3() {
        if (state.mode !== 'level3' || !state.level3Resolve) return;

        // 如果用户进行了优化操作（有超过2条消息，初始时只有2条提示消息）
        // 则获取最后一条 AI 回复作为优化结果
        // 否则直接使用原始的处理结果
        let finalResult = state.level3Context?.inputText || '';

        if (state.messages.length > 2) {
            // 找到最后一条 AI 回复（跳过初始的提示消息）
            const lastAi = [...state.messages].reverse().find(m => m.role === 'ai');
            const content = lastAi?.content || '';

            // 过滤掉以 ⚠️ 或 💡 或 📋 开头的系统消息
            if (content && !content.startsWith('⚠️') && !content.startsWith('💡') && !content.startsWith('📋')) {
                finalResult = content;
            }
        }

        state.level3Resolve(finalResult);
        resetLevel3State();
        closePanel();
    }

    /**
     * 跳过优化，使用原始结果
     */
    function skipLevel3() {
        if (state.mode !== 'level3' || !state.level3Resolve) return;

        const originalResult = state.level3Context?.inputText || '';
        state.level3Resolve(originalResult);
        resetLevel3State();
        closePanel();
    }

    /**
     * 取消三级优化
     */
    function cancelLevel3() {
        if (state.mode !== 'level3' || !state.level3Reject) return;

        state.level3Reject(new Error('用户取消了三级优化'));
        resetLevel3State();
        closePanel({ skipLevel3Cancel: true });
    }

    /**
     * 重置 level3 状态
     */
    function resetLevel3State() {
        state.mode = 'manual';
        state.level3Context = null;
        state.level3Resolve = null;
        state.level3Reject = null;
        const root = state.elements.root;
        if (root) root.classList.remove('level3-mode');
        updateLevel3Buttons();
    }

    function initialize() {
        if (state.initialized) return;
        state.initialized = true;
        ensurePanelInjected();
        updateFloatingButtonVisibility(true, 0);
        // 若主悬浮球已存在，立即钳制；否则稍后重试几次
        let tries = 0;
        const tryClamp = () => {
            if (clampMainFab()) return;
            if (tries < 5) {
                tries++;
                setTimeout(tryClamp, 500);
            }
        };
        tryClamp();
    }

    // ==================== 三级优化提示词编辑面板 ====================

    let level3EditorInjected = false;

    function ensureLevel3EditorInjected() {
        // 始终检查 DOM 元素是否存在，防止因页面刷新或重新渲染导致的元素丢失
        const existingEditor = document.getElementById('wbap-level3-prompt-editor');
        if (existingEditor) {
            level3EditorInjected = true;
            return;
        }

        // 如果元素不存在，重置标志位并重新注入
        level3EditorInjected = false;

        const tpl = WBAP.UI_TEMPLATES?.LEVEL3_PROMPT_EDITOR_HTML;
        if (!tpl) {
            console.error('[WriterBrianer] Error: LEVEL3_PROMPT_EDITOR_HTML template not found.');
            return;
        }

        const container = document.createElement('div');
        container.innerHTML = tpl;
        document.body.appendChild(container.firstElementChild);
        level3EditorInjected = true;

        // 绑定事件
        const editor = document.getElementById('wbap-level3-prompt-editor');
        if (!editor) return;

        editor.querySelector('#wbap-level3-editor-close')?.addEventListener('click', closeLevel3Editor);
        editor.querySelector('.wbap-level3-editor-overlay')?.addEventListener('click', closeLevel3Editor);
        editor.querySelector('#wbap-level3-reset')?.addEventListener('click', resetLevel3Prompts); // 注意：这里原代码是 resetLevel3Prompts 而非 saveLevel3Prompts，需确认
        editor.querySelector('#wbap-level3-save')?.addEventListener('click', saveLevel3Prompts);
    }

    function openLevel3Editor() {
        ensureLevel3EditorInjected();
        const editor = document.getElementById('wbap-level3-prompt-editor');
        if (!editor) return;

        // 加载当前配置
        const cfg = getConfig();
        const level3Cfg = ensureOptimizationPromptPresets(cfg);
        const presets = getOptimizationPresets();
        let idx = level3Cfg.selectedPromptIndex || 0;
        if (idx < 0 || idx >= presets.length) {
            idx = 0;
            level3Cfg.selectedPromptIndex = 0;
            WBAP.saveConfig?.();
        }
        const preset = presets[idx] || getDefaultOptimizationPromptPreset();

        const nameEl = editor.querySelector('#wbap-level3-prompt-name');
        const descEl = editor.querySelector('#wbap-level3-prompt-desc');
        const systemPromptEl = editor.querySelector('#wbap-level3-system-prompt');
        const templateEl = editor.querySelector('#wbap-level3-prompt-template');

        if (nameEl) {
            nameEl.value = preset.name || DEFAULT_PRESET_NAME;
        }
        if (descEl) {
            descEl.value = preset.description || '';
        }
        if (systemPromptEl) {
            systemPromptEl.value = preset.systemPrompt || '';
        }
        if (templateEl) {
            templateEl.value = preset.promptTemplate || '';
        }

        editor.classList.remove('wbap-hidden');
    }

    function closeLevel3Editor() {
        const editor = document.getElementById('wbap-level3-prompt-editor');
        if (editor) editor.classList.add('wbap-hidden');
    }

    function saveLevel3Prompts() {
        const cfg = getConfig();
        const level3Cfg = ensureOptimizationPromptPresets(cfg);

        const nameEl = document.getElementById('wbap-level3-prompt-name');
        const descEl = document.getElementById('wbap-level3-prompt-desc');
        const systemPromptEl = document.getElementById('wbap-level3-system-prompt');
        const templateEl = document.getElementById('wbap-level3-prompt-template');

        const presets = getOptimizationPresets();
        let idx = level3Cfg.selectedPromptIndex || 0;
        if (idx < 0 || idx >= presets.length) idx = 0;
        const updated = {
            name: (nameEl?.value || '').trim() || DEFAULT_PRESET_NAME,
            description: (descEl?.value || '').trim(),
            systemPrompt: systemPromptEl?.value || '',
            promptTemplate: templateEl?.value || ''
        };
        presets[idx] = { ...presets[idx], ...updated };
        level3Cfg.selectedPromptIndex = idx;

        WBAP.saveConfig?.();
        closeLevel3Editor();
        WBAP.UI?.refreshOptimizationPromptList?.();
        updatePromptLabel();

        // 简单提示
        Logger.log('三级优化提示词已保存');
    }

    function resetLevel3Prompts() {
        const defaultPreset = getDefaultOptimizationPromptPreset();
        const nameEl = document.getElementById('wbap-level3-prompt-name');
        const descEl = document.getElementById('wbap-level3-prompt-desc');
        const systemPromptEl = document.getElementById('wbap-level3-system-prompt');
        const templateEl = document.getElementById('wbap-level3-prompt-template');

        if (nameEl) {
            nameEl.value = defaultPreset.name || DEFAULT_PRESET_NAME;
        }
        if (descEl) {
            descEl.value = defaultPreset.description || '';
        }
        if (systemPromptEl) {
            systemPromptEl.value = defaultPreset.systemPrompt || DEFAULT_SYSTEM_PROMPT;
        }
        if (templateEl) {
            templateEl.value = defaultPreset.promptTemplate || DEFAULT_PROMPT_TEMPLATE;
        }
    }

    // Expose API
    window.WBAP.Optimization = {
        initialize,
        openPanel,
        closePanel,
        updateFloatingButtonVisibility,
        updatePromptLabel,
        resetChat,
        // 三级优化 API
        processLevel3,
        confirmLevel3,
        skipLevel3,
        cancelLevel3,
        // 提示词编辑器 API
        openLevel3Editor,
        closeLevel3Editor,
        getDefaultOptimizationPromptPreset,
        getSelectedOptimizationPromptPreset
    };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initialize);
    } else {
        initialize();
    }
})();
