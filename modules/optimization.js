// modules/optimization.js
// 剧情优化交互面板与逻辑
(function () {
    'use strict';

    window.WBAP = window.WBAP || {};
    const Logger = WBAP.Logger || console;

    const INITIAL_AI_MESSAGE = '你好！我是你的剧情优化助手。已为您生成了初步方案，点击右上角的预览图标即可查看全文。';
    const DEFAULT_SYSTEM_PROMPT = [
        '你是一名剧情优化助手，负责在保留人设和世界书设定的前提下，润色和改写剧情片段。',
        '请保持语气一致，补足氛围描写，强化场景细节，避免违背角色底线。',
        '输出一段可直接替换原文的精炼文本，避免解释过程。'
    ].join('\n');

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
        }
    };

    function getConfig() {
        if (WBAP.CharacterManager && typeof WBAP.CharacterManager.getCurrentCharacterConfig === 'function') {
            return WBAP.CharacterManager.getCurrentCharacterConfig() || {};
        }
        return WBAP.config || {};
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
        state.elements.worldPop = root.querySelector('#wbap-opt-world-pop');
        state.elements.worldList = root.querySelector('#wbap-opt-world-list');
        state.elements.entryList = root.querySelector('#wbap-opt-entry-list');
        state.elements.endpointSelect = root.querySelector('#wbap-opt-endpoint-select');
        state.elements.modelSelect = root.querySelector('#wbap-opt-model-select');
        state.elements.modelRefresh = root.querySelector('#wbap-opt-model-refresh');

        bindPanelEvents();
        resetChat();
    }

    function bindPanelEvents() {
        const { root, input, sendBtn, previewToggle, previewOverlay, worldBtn, modelRefresh } = state.elements;
        if (!root) return;

        root.querySelector('#wbap-opt-close')?.addEventListener('click', closePanel);
        previewToggle?.addEventListener('click', togglePreview);
        root.querySelector('#wbap-opt-preview-close')?.addEventListener('click', hidePreview);

        if (sendBtn) {
            sendBtn.addEventListener('click', handleSend);
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

        state.elements.endpointSelect?.addEventListener('change', () => refreshModelOptions());
        modelRefresh?.addEventListener('click', refreshModelList);
        if (worldBtn) {
            worldBtn.addEventListener('click', toggleWorldPopover);
        }
        const pop = state.elements.worldPop;
        pop?.querySelector('#wbap-opt-world-close')?.addEventListener('click', hideWorldPopover);
        pop?.querySelector('#wbap-opt-world-refresh')?.addEventListener('click', () => loadWorldList(true));
        pop?.querySelector('#wbap-opt-world-apply')?.addEventListener('click', hideWorldPopover);
        pop?.querySelector('#wbap-opt-world-clear')?.addEventListener('click', clearWorldSelection);

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
        refreshEndpointOptions();
        refreshModelOptions();
        if (prefillText && state.elements.input) {
            state.elements.input.value = prefillText;
            autoResizeInput();
        }
        scrollChatToBottom();
    }

    function closePanel() {
        const root = state.elements.root;
        if (!root) return;
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
        state.previewText = lastAi?.content || '';
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

    async function loadWorldEntries(worldName) {
        if (!worldName) {
            renderEntryList(null);
            return;
        }
        if (state.worldSelection.cache.has(worldName)) {
            renderEntryList(worldName);
            return;
        }
        try {
            const book = await WBAP.loadWorldBookEntriesByName?.(worldName);
            if (book && book.entries) {
                state.worldSelection.cache.set(worldName, book.entries);
            } else {
                state.worldSelection.cache.set(worldName, {});
            }
        } catch (e) {
            Logger.warn('获取世界书条目失败', e);
            state.worldSelection.cache.set(worldName, {});
        }
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

    function refreshEndpointOptions() {
        const select = state.elements.endpointSelect;
        if (!select) return;
        const cfg = getConfig();
        const optCfg = cfg.optimizationApiConfig || {};
        select.innerHTML = '';

        if (optCfg.useIndependentProfile) {
            const label = optCfg.apiUrl ? '独立 API' : '独立 API（未配置）';
            select.innerHTML = `<option value="__independent__">${label}</option>`;
            select.disabled = true;
            return;
        }

        const endpoints = (cfg.selectiveMode?.apiEndpoints || []).filter(ep => ep.enabled !== false);
        if (endpoints.length === 0) {
            select.innerHTML = '<option value="">请先配置 API</option>';
            select.disabled = true;
            return;
        }
        select.disabled = false;
        endpoints.forEach(ep => {
            const opt = document.createElement('option');
            opt.value = ep.id;
            opt.textContent = ep.name || ep.id;
            select.appendChild(opt);
        });
        const fallback = optCfg.selectedEndpointId || endpoints[0].id;
        select.value = fallback;
    }

    function refreshModelOptions() {
        const modelSelect = state.elements.modelSelect;
        if (!modelSelect) return;
        const cfg = getConfig();
        const optCfg = cfg.optimizationApiConfig || {};
        const useIndependent = optCfg.useIndependentProfile === true;
        const selectedEpId = state.elements.endpointSelect?.value;

        modelSelect.innerHTML = '';

        if (useIndependent) {
            const model = optCfg.model || '';
            modelSelect.appendChild(createModelOption(model || '', model || '未配置模型'));
            modelSelect.disabled = false;
            modelSelect.value = model;
            return;
        }

        const endpoints = (cfg.selectiveMode?.apiEndpoints || []).filter(ep => ep.enabled !== false);
        const target = endpoints.find(ep => ep.id === selectedEpId) || endpoints[0];
        const modelName = target?.model || optCfg.model || '';
        if (target) {
            modelSelect.appendChild(createModelOption(modelName, modelName || '未配置模型'));
            modelSelect.disabled = false;
            modelSelect.value = modelName;
        } else {
            modelSelect.appendChild(createModelOption('', '请先选择 API'));
            modelSelect.disabled = true;
        }
    }

    async function refreshModelList() {
        const btn = state.elements.modelRefresh;
        if (btn) {
            btn.disabled = true;
            btn.textContent = '刷新中...';
        }
        try {
            const cfg = getConfig();
            const optCfg = cfg.optimizationApiConfig || {};
            let apiUrl = '';
            let apiKey = '';
            if (optCfg.useIndependentProfile) {
                apiUrl = optCfg.apiUrl || '';
                apiKey = optCfg.apiKey || '';
            } else {
                const endpoints = (cfg.selectiveMode?.apiEndpoints || []).filter(ep => ep.enabled !== false);
                const target = endpoints.find(ep => ep.id === state.elements.endpointSelect?.value) || endpoints[0];
                apiUrl = target?.apiUrl || target?.url || '';
                apiKey = target?.apiKey || target?.key || '';
            }
            if (!apiUrl) throw new Error('请先配置 API URL');
            const result = await WBAP.fetchEndpointModels({ apiUrl, apiKey });
            if (result.success) {
                populateModelSelect(result.models || [], state.elements.modelSelect?.value || '');
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

    function populateModelSelect(models = [], currentModel = '') {
        const select = state.elements.modelSelect;
        if (!select) return;
        select.innerHTML = '';
        if (!models.length && currentModel) {
            select.appendChild(createModelOption(currentModel, currentModel));
            select.value = currentModel;
            return;
        }
        if (!models.length) {
            select.appendChild(createModelOption('', '未获取到模型'));
            select.disabled = true;
            return;
        }
        select.disabled = false;
        models.forEach(m => select.appendChild(createModelOption(m, m)));
        if (currentModel && models.includes(currentModel)) {
            select.value = currentModel;
        } else {
            select.selectedIndex = 0;
        }
    }

    function createModelOption(value, label) {
        const opt = document.createElement('option');
        opt.value = value || '';
        opt.textContent = label || value || '';
        return opt;
    }

    async function handleSend() {
        if (state.sending) return;
        const input = state.elements.input;
        if (!input) return;
        const userText = input.value.trim();
        if (!userText) return;

        appendMessage('user', userText);
        input.value = '';
        autoResizeInput();

        try {
            state.sending = true;
            setSending(true);
            const { apiConfig, model } = resolveApiConfig();
            if (!model) throw new Error('请先为优化选择模型');

            const worldbookContent = await buildSelectedWorldbookContent();

            const systemPrompt = (getConfig().optimizationSystemPrompt || '').trim() || DEFAULT_SYSTEM_PROMPT;
            const prompt = buildOptimizationPrompt(userText, worldbookContent);
            const result = await WBAP.callAI(model, prompt, systemPrompt, apiConfig);
            appendMessage('ai', result?.trim() || '（未返回内容）');
        } catch (err) {
            Logger.error('剧情优化失败', err);
            appendMessage('ai', `⚠️ 优化失败：${err.message || err}`);
        } finally {
            state.sending = false;
            setSending(false);
        }
    }

    function setSending(loading) {
        const btn = state.elements.sendBtn;
        if (!btn) return;
        if (loading) {
            btn.classList.add('loading');
            btn.disabled = true;
        } else {
            btn.classList.remove('loading');
            btn.disabled = false;
        }
    }

    function appendMessage(role, content) {
        state.messages.push({ role, content });
        renderMessages();
    }

    function buildOptimizationPrompt(userText, worldbookContent) {
        const history = state.messages
            .slice(-6)
            .map(m => `${m.role === 'user' ? '用户' : '助手'}：${m.content}`)
            .join('\n');
        const worldPart = worldbookContent ? `\n【世界书摘录】\n${worldbookContent}` : '';
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
        let combined = '';
        for (const world of state.worldSelection.selected) {
            const book = await WBAP.loadWorldBookEntriesByName?.(world);
            if (!book || !book.entries) continue;
            const selectedEntries = state.worldSelection.entriesByWorld.get(world);
            const entries = Object.entries(book.entries).filter(([, e]) => e && e.disable !== true);
            const filtered = (selectedEntries && selectedEntries.size > 0)
                ? entries.filter(([id]) => selectedEntries.has(id))
                : entries;
            if (filtered.length === 0) continue;
            const block = filtered.map(([id, entry]) => `[${entry.comment || id}]\n${entry.content || ''}`).join('\n\n');
            combined += `【${world}】\n${block}\n\n`;
        }
        return combined.trim();
    }

    function resolveApiConfig() {
        const cfg = getConfig();
        const optCfg = cfg.optimizationApiConfig || {};
        if (optCfg.useIndependentProfile) {
            return {
                apiConfig: {
                    apiUrl: optCfg.apiUrl,
                    apiKey: optCfg.apiKey,
                    model: optCfg.model,
                    maxTokens: optCfg.maxTokens || 4000,
                    temperature: optCfg.temperature ?? 0.7,
                    timeout: optCfg.timeout || 60
                },
                model: optCfg.model
            };
        }

        const endpoints = (cfg.selectiveMode?.apiEndpoints || []).filter(ep => ep.enabled !== false);
        if (endpoints.length === 0) {
            throw new Error('请先配置并启用 API 实例');
        }
        const selectedId = state.elements.endpointSelect?.value;
        const target = endpoints.find(ep => ep.id === selectedId) || endpoints[0];
        const model = state.elements.modelSelect?.value || target.model;
        return { apiConfig: target, model };
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

    // Expose API
    window.WBAP.Optimization = {
        initialize,
        openPanel,
        closePanel,
        updateFloatingButtonVisibility,
        resetChat
    };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initialize);
    } else {
        initialize();
    }
})();
