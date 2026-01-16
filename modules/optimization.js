// modules/optimization.js

(function () {
    'use strict';

    window.WBAP = window.WBAP || {};
    const Logger = WBAP.Logger;

    let panelOverlay = null;
    let chatArea = null;
    let inputField = null;
    let sendBtn = null;
    let closeBtn = null;
    let previewBtn = null;

    // Toolbar elements
    let wbPill = null;
    let apiPill = null;
    let modelPill = null;
    let floatingBtn = null;

    // State
    const state = {
        selectedEndpointId: null,
        selectedModel: '',
        activeWorldBooks: new Set(), // Set<string>
        selectedEntries: new Map(),  // Map<string, Set<string>> (BookName -> Set<EntryUid>)
        bookEntryCache: new Map(),   // Map<string, Object> (BookName -> BookData)
        currentContext: [],
        initialResult: '',
        sourceContext: '',
        sourceUserInput: '',
        isFetchingModels: false
    };

    const PANEL_CONTEXT_LIMIT = 10;
    const OPT_PLACEHOLDERS = {
        worldbook: '{worldbook_content}',
        userInput: '{user_input}',
        previousResults: '{previous_results}',
        context: '{context}',
        panelContext: '{panel_context}',
        originalUserInput: '{original_user_input}'
    };

    function buildPanelContext(items, maxItems = PANEL_CONTEXT_LIMIT) {
        if (!Array.isArray(items) || items.length === 0) return '';
        const sliced = items.slice(-maxItems);
        return sliced.map((item) => {
            const role = item.role || 'user';
            const content = String(item.content || '').trim();
            if (!content) return '';
            return `${role}: ${content}`;
        }).filter(Boolean).join('\n');
    }

    function replacePlaceholder(text, token, value) {
        if (!text || !token) return text;
        return text.split(token).join(value ?? '');
    }

    function buildOptimizationSystemPrompt(customPrompt, defaultPrompt, data) {
        const trimmedCustom = (customPrompt || '').trim();
        const usingCustom = trimmedCustom.length > 0;
        let prompt = usingCustom ? trimmedCustom : defaultPrompt;

        const values = {
            [OPT_PLACEHOLDERS.worldbook]: data.worldbookContent || '',
            [OPT_PLACEHOLDERS.userInput]: data.userInput || '',
            [OPT_PLACEHOLDERS.previousResults]: data.initialResult || '',
            [OPT_PLACEHOLDERS.context]: data.sourceContext || '',
            [OPT_PLACEHOLDERS.panelContext]: data.panelContext || '',
            [OPT_PLACEHOLDERS.originalUserInput]: data.originalUserInput || ''
        };

        const placeholderUsed = {};
        if (usingCustom) {
            Object.keys(values).forEach((token) => {
                const hasToken = prompt.includes(token);
                placeholderUsed[token] = hasToken;
                if (hasToken) {
                    prompt = replacePlaceholder(prompt, token, values[token]);
                }
            });
        }

        const extraBlocks = [];
        const addBlock = (label, content) => {
            if (!content) return;
            extraBlocks.push(`${label}:\n${content}`);
        };

        if (usingCustom) {
            if (!placeholderUsed[OPT_PLACEHOLDERS.worldbook]) {
                addBlock('Worldbook', data.worldbookContent);
            }
            if (!placeholderUsed[OPT_PLACEHOLDERS.userInput]) {
                addBlock('User input', data.userInput);
            }
        }

        if (!usingCustom || !placeholderUsed[OPT_PLACEHOLDERS.previousResults]) {
            addBlock('Previous result', data.initialResult);
        }
        if (!usingCustom || !placeholderUsed[OPT_PLACEHOLDERS.context]) {
            addBlock('Recent chat context', data.sourceContext);
        }
        if (!usingCustom || !placeholderUsed[OPT_PLACEHOLDERS.panelContext]) {
            addBlock('Panel conversation', data.panelContext);
        }
        if ((!usingCustom || !placeholderUsed[OPT_PLACEHOLDERS.originalUserInput])
            && data.originalUserInput
            && data.originalUserInput !== data.userInput) {
            addBlock('Original user input', data.originalUserInput);
        }

        if (extraBlocks.length > 0) {
            prompt += `\n\n---\n${extraBlocks.join('\n\n')}`;
        }

        return prompt;
    }

    function initialize() {
        if (panelOverlay) return; // Already initialized

        // Inject HTML
        const template = WBAP.UI_TEMPLATES.OPTIMIZATION_PANEL_HTML;
        if (!template) {
            Logger.error('Optimization Panel Template not found.');
            return;
        }

        const div = document.createElement('div');
        div.innerHTML = template.trim();
        panelOverlay = div.firstChild;
        document.body.appendChild(panelOverlay);

        // Bind Elements
        chatArea = panelOverlay.querySelector('#wbap-opt-chat-area');
        inputField = panelOverlay.querySelector('#wbap-opt-input');
        sendBtn = panelOverlay.querySelector('#wbap-opt-send-btn');
        closeBtn = panelOverlay.querySelector('#wbap-opt-close-btn');
        previewBtn = panelOverlay.querySelector('#wbap-opt-preview-btn');

        wbPill = panelOverlay.querySelector('#wbap-opt-worldbook-pill');
        apiPill = panelOverlay.querySelector('#wbap-opt-api-pill');
        modelPill = panelOverlay.querySelector('#wbap-opt-model-pill');

        // Bind Events
        closeBtn.addEventListener('click', closePanel);
        sendBtn.addEventListener('click', handleSend);
        previewBtn.addEventListener('click', showPreview);

        wbPill.addEventListener('click', (e) => handleWorldBookClick(e));
        apiPill.addEventListener('click', (e) => handleApiClick(e));
        modelPill.addEventListener('click', (e) => handleModelClick(e));

        inputField.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSend();
            }
        });

        // Close popover when clicking globally
        document.addEventListener('click', (e) => {
            if (e.target.closest('.wbap-popover')) return;
            // logic handled in createPopover triggers
        });

        Logger.log('Optimization module initialized.');

        // Prepare floating button container (visibility controlled separately)
        ensureFloatingButton();
    }

    function openPanel(processedResult, contextData) {
        if (!panelOverlay) initialize();

        // Reset state
        state.currentContext = [];
        state.initialResult = processedResult || '';
        state.selectedEndpointId = null; // Default to first/system
        state.selectedModel = '';
        state.activeWorldBooks.clear();
        state.selectedEntries.clear();
        state.sourceContext = '';
        state.sourceUserInput = '';

        chatArea.innerHTML = '';
        inputField.value = '';

        const payload = contextData || {};
        state.sourceContext = payload.context || '';
        state.sourceUserInput = payload.userInput || '';

        if (Array.isArray(payload.worldBooks)) {
            payload.worldBooks.forEach((name) => {
                if (name) state.activeWorldBooks.add(name);
            });
        }
        if (payload.selectedEntries && typeof payload.selectedEntries === 'object') {
            Object.entries(payload.selectedEntries).forEach(([bookName, entries]) => {
                const ids = Array.isArray(entries) ? entries.filter(Boolean) : [];
                if (ids.length === 0) return;
                state.selectedEntries.set(bookName, new Set(ids));
                state.activeWorldBooks.add(bookName);
            });
        }

        // Sync initial state from config if needed
        const config = WBAP.CharacterManager ? WBAP.CharacterManager.getCurrentCharacterConfig() : {};
        const optimizationApiConfig = config.optimizationApiConfig || {};
        if (optimizationApiConfig.useIndependentProfile) {
            state.selectedEndpointId = null;
            state.selectedModel = optimizationApiConfig.model || '';
        } else {
            const eps = config.selectiveMode?.apiEndpoints || [];
            const preferredId = optimizationApiConfig.selectedEndpointId;
            const defaultEp = (preferredId
                ? eps.find(e => e.id === preferredId && e.enabled !== false)
                : null) || eps.find(e => e.enabled !== false);
            if (defaultEp) {
                state.selectedEndpointId = defaultEp.id;
                state.selectedModel = defaultEp.model;
            }
        }

        updatePillUI();

        // Show panel
        panelOverlay.classList.remove('wbap-hidden');
        setTimeout(() => panelOverlay.classList.add('open'), 10);

        addMessage('assistant', `你好！我是你的剧情优化助手。已为您生成了初步方案，点击右上角的预览图标即可查看全文。`);
    }

    /* ==========================================================================
       Floating Button (Global Shortcut)
       ========================================================================== */

    function ensureFloatingButton() {
        if (floatingBtn) return floatingBtn;
        const btn = document.createElement('div');
        btn.id = 'wbap-opt-fab';
        btn.className = 'wbap-opt-fab';
        btn.title = '打开剧情优化面板';
        btn.setAttribute('aria-label', '打开剧情优化面板');
        btn.addEventListener('click', () => {
            const cfg = WBAP.CharacterManager ? WBAP.CharacterManager.getCurrentCharacterConfig() : null;
            if (!cfg || cfg.enablePlotOptimization !== true) {
                Logger.warn('剧情优化未启用，悬浮球点击已忽略。');
                return;
            }
            // 空上下文启动，方便随时手动输入
            openPanel('', { userInput: '', context: '', worldBooks: [] });
        });
        document.body.appendChild(btn);
        floatingBtn = btn;
        return btn;
    }

    function updateFloatingButtonVisibility() {
        const cfg = WBAP.CharacterManager ? WBAP.CharacterManager.getCurrentCharacterConfig() : null;
        const enabled = !!(cfg && cfg.enablePlotOptimization === true && cfg.enablePlotOptimizationFloatButton === true);
        const btn = ensureFloatingButton();
        btn.style.display = enabled ? 'flex' : 'none';
    }

    function closePanel() {
        if (!panelOverlay) return;
        panelOverlay.classList.remove('open');
        closeCurrentPopover();
    }

    /* ==========================================================================
       UI Updates
       ========================================================================== */

    function updatePillUI() {
        if (!apiPill || !modelPill || !wbPill) return;

        const config = WBAP.CharacterManager ? WBAP.CharacterManager.getCurrentCharacterConfig() : {};
        const optimizationApiConfig = config.optimizationApiConfig || {};
        const useIndependent = optimizationApiConfig.useIndependentProfile === true;
        const endpoints = config.selectiveMode?.apiEndpoints || [];
        const currentEp = endpoints.find(e => e.id === state.selectedEndpointId);

        // API Pill
        if (useIndependent) {
            apiPill.innerHTML = `<i class="fa-solid fa-cloud"></i> Independent`;
        } else if (currentEp) {
            apiPill.innerHTML = `<i class="fa-solid fa-cloud"></i> ${currentEp.name}`;
        } else {
            apiPill.innerHTML = `<i class="fa-solid fa-cloud"></i> API`;
        }

        // Model Pill
        const modelName = state.selectedModel
            || (useIndependent ? optimizationApiConfig.model : currentEp?.model)
            || 'Model';
        // Truncate if too long?
        modelPill.innerHTML = `<i class="fa-solid fa-microchip"></i> ${modelName.length > 12 ? modelName.substring(0, 10) + '...' : modelName}`;

        // Worldbook Pill
        const count = state.activeWorldBooks.size;
        wbPill.innerHTML = `<i class="fa-solid fa-book"></i> 世界书${count > 0 ? ` (${count})` : ''}`;
    }

    /* ==========================================================================
       Popover Logic (reworked: modal-style on mobile, anchored on desktop)
       ========================================================================== */

    let currentPopover = null;
    let currentPopoverBackdrop = null;

    function closeCurrentPopover() {
        if (currentPopover) {
            currentPopover.remove();
            currentPopover = null;
        }
        if (currentPopoverBackdrop) {
            currentPopoverBackdrop.remove();
            currentPopoverBackdrop = null;
        }
    }

    function createPopover(targetElement, contentFunc) {
        closeCurrentPopover(); // Only one popover at a time

        const isMobile = window.innerWidth <= 768;

        // Backdrop: semi-opaque on mobile, transparent on desktop
        const backdrop = document.createElement('div');
        backdrop.className = 'wbap-popover-backdrop';
        backdrop.style.position = 'fixed';
        backdrop.style.inset = '0';
        backdrop.style.background = isMobile ? 'rgba(0,0,0,0.35)' : 'transparent';
        backdrop.style.zIndex = '2147483644';
        backdrop.addEventListener('click', closeCurrentPopover, { passive: true });
        document.body.appendChild(backdrop);
        currentPopoverBackdrop = backdrop;

        // Popover container
        const popover = document.createElement('div');
        popover.className = 'wbap-popover';
        popover.setAttribute('role', 'dialog');
        popover.setAttribute('aria-modal', 'true');
        popover.style.zIndex = '2147483645';

        // Positioning
        if (isMobile) {
            popover.classList.add('wbap-mobile-bottom-sheet');
        } else {
            const rect = targetElement.getBoundingClientRect();
            popover.style.position = 'fixed';
            popover.style.left = `${rect.left}px`;
            popover.style.bottom = `${window.innerHeight - rect.top + 8}px`; // 8px gap
            popover.style.width = '260px';
            popover.style.maxHeight = '340px';
        }

        // Shell with header + body
        popover.innerHTML = `
            <div class="wbap-popover-header">
                <div class="wbap-popover-title"></div>
                <button class="wbap-popover-close" aria-label="关闭">
                    <i class="fa-solid fa-xmark"></i>
                </button>
            </div>
            <div class="wbap-popover-content">
                <div style="padding:10px;text-align:center;"><i class="fa-solid fa-spinner fa-spin"></i></div>
            </div>
        `;

        // Block propagation inside so backdrop clicks don't fire
        const stopInside = (event) => event.stopPropagation();
        ['click', 'pointerdown', 'pointerup', 'touchstart', 'touchend', 'mousedown'].forEach(evt => {
            popover.addEventListener(evt, stopInside);
        });

        // Close button
        const closeBtn = popover.querySelector('.wbap-popover-close');
        closeBtn.addEventListener('click', (ev) => {
            ev.stopPropagation();
            closeCurrentPopover();
        });

        document.body.appendChild(popover);
        currentPopover = popover;

        // Render content into the existing content area and optionally set title
        const setTitle = (text) => {
            const titleEl = popover.querySelector('.wbap-popover-title');
            if (titleEl) titleEl.textContent = text || '';
        };
        contentFunc(popover, setTitle);
    }

    /* ==========================================================================
       Handlers
       ========================================================================== */

    function handleApiClick(e) {
        e.stopPropagation();
        e.preventDefault();
        const config = WBAP.CharacterManager.getCurrentCharacterConfig();
        const optimizationApiConfig = config.optimizationApiConfig || {};
        if (optimizationApiConfig.useIndependentProfile === true) {
            createPopover(apiPill, (popover, setTitle) => {
                setTitle('API');
                popover.innerHTML = `
                    <div class="wbap-popover-header">
                        <div class="wbap-popover-title">API</div>
                        <button class="wbap-popover-close" aria-label="关闭"><i class="fa-solid fa-xmark"></i></button>
                    </div>
                    <div class="wbap-popover-content" style="padding:8px;color:#888;">Independent profile enabled in settings.</div>
                `;
                popover.querySelector('.wbap-popover-close').addEventListener('click', closeCurrentPopover);
            }, e);
            return;
        }

        createPopover(apiPill, (popover, setTitle) => {
            setTitle('选择 API 实例');
            const endpoints = config.selectiveMode?.apiEndpoints || [];

            let html = `
                <div class="wbap-popover-content">
            `;

            if (endpoints.length === 0) {
                html += `<div style="padding:8px;color:#888;">无可用配置</div>`;
            } else {
                endpoints.forEach(ep => {
                    const isActive = ep.id === state.selectedEndpointId;
                    html += `
                        <div class="wbap-opt-popover-item ${isActive ? 'active' : ''}" 
                             style="padding:8px;cursor:pointer;border-bottom:1px solid #333;${isActive ? 'color:var(--wbap-primary);' : ''}"
                             data-id="${ep.id}">
                             <div style="font-weight:600;">${ep.name}</div>
                             <div style="font-size:11px;color:#666;">${ep.model || 'Unknown Model'}</div>
                        </div>
                    `;
                });
            }
            html += `</div>`;
            popover.innerHTML = html;

            // Bind clicks
            popover.querySelectorAll('.wbap-opt-popover-item').forEach(el => {
                el.addEventListener('click', () => {
                    const epId = el.dataset.id;
                    const ep = endpoints.find(e => e.id === epId);
                    if (ep) {
                        state.selectedEndpointId = ep.id;
                        state.selectedModel = ep.model; // Auto-switch model to endpoint default
                        updatePillUI();
                        closeCurrentPopover();
                    }
                });
            });
        });
    }

    function handleModelClick(e) {
        e.stopPropagation();
        e.preventDefault();
        createPopover(modelPill, (popover, setTitle) => {
            setTitle('模型配置');
            popover.innerHTML = `
                <div class="wbap-popover-content" style="padding:10px; display:flex; flex-direction:column; gap:8px;">
                    <input type="text" id="wbap-opt-model-input" value="${state.selectedModel}" 
                           class="wbap-opt-input" style="height:32px;padding:4px 8px;" placeholder="输入模型名称...">
                    <button id="wbap-opt-fetch-models" class="wbap-btn wbap-btn-xs">
                        <i class="fa-solid fa-sync"></i> 获取模型列表
                    </button>
                    <div id="wbap-opt-model-list" style="max-height:150px;overflow-y:auto;border:1px solid #333;border-radius:4px;margin-top:4px;">
                        <!-- List goes here -->
                    </div>
                </div>
            `;

            const input = popover.querySelector('#wbap-opt-model-input');
            const list = popover.querySelector('#wbap-opt-model-list');
            const btn = popover.querySelector('#wbap-opt-fetch-models');

            // Apply on input change
            input.addEventListener('input', () => {
                state.selectedModel = input.value;
                updatePillUI();
            });

            // Handle fetch
            btn.addEventListener('click', async () => {
                btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i>';

                // Need current endpoint secrets
                const config = WBAP.CharacterManager.getCurrentCharacterConfig();
                const optimizationApiConfig = config.optimizationApiConfig || {};
                const useIndependent = optimizationApiConfig.useIndependentProfile === true;
                let apiUrl = '';
                let apiKey = '';

                if (useIndependent) {
                    apiUrl = optimizationApiConfig.apiUrl || '';
                    apiKey = optimizationApiConfig.apiKey || '';
                } else {
                    const endpoints = config.selectiveMode?.apiEndpoints || [];
                    const ep = endpoints.find(e => e.id === state.selectedEndpointId)
                        || endpoints.find(e => e.enabled !== false);
                    if (!ep) {
                        list.innerHTML = `<div style="padding:4px;color:red;">请先选择 API 实例</div>`;
                        btn.innerHTML = `<i class="fa-solid fa-sync"></i> 获取模型列表`;
                        return;
                    }
                    apiUrl = ep.apiUrl || ep.url;
                    apiKey = ep.apiKey || ep.key;
                }

                try {
                    const res = await WBAP.fetchEndpointModels({ apiUrl, apiKey });

                    if (res.success && res.models) {
                        list.innerHTML = res.models.map(m => `
                            <div class="wbap-model-item" style="padding:4px 8px;cursor:pointer;font-size:12px;border-bottom:1px solid #333;">${m}</div>
                        `).join('');

                        list.querySelectorAll('.wbap-model-item').forEach(i => {
                            i.addEventListener('click', () => {
                                state.selectedModel = i.textContent;
                                input.value = state.selectedModel;
                                updatePillUI();
                            });
                        });
                    } else {
                        list.innerHTML = `<div style="padding:4px;color:red;">${res.message || '获取失败'}</div>`;
                    }
                } catch (err) {
                    list.innerHTML = `<div style="padding:4px;color:red;">${err.message}</div>`;
                }

                btn.innerHTML = `<i class="fa-solid fa-sync"></i> 获取模型列表`;
            });
        });
    }

    function handleWorldBookClick(e) {
        e.stopPropagation();
        e.preventDefault();
        createPopover(wbPill, async (popover, setTitle) => {
            renderWorldBookMainView(popover, setTitle);
        });
    }

    async function renderWorldBookMainView(popover, setTitle) {
        if (setTitle) setTitle(`注入世界书 (${state.activeWorldBooks.size})`);
        popover.querySelector('.wbap-popover-content').innerHTML = `<div style="padding:10px;text-align:center;"><i class="fa-solid fa-spinner fa-spin"></i> 加载中...</div>`;

        try {
            const books = await WBAP.getAllWorldBookNames();

            let html = `
                <div class="wbap-popover-content">
            `;

            if (!books || books.length === 0) {
                html += `<div style="padding:8px;color:#888;">无可用世界书</div>`;
            } else {
                books.forEach(book => {
                    const isChecked = state.activeWorldBooks.has(book);
                    // Check if we have specific entries selected
                    const entrySet = state.selectedEntries.get(book);
                    const hasSpecific = entrySet && entrySet.size > 0;
                    const statusText = hasSpecific ? `<span style="font-size:10px;color:var(--wbap-primary);">(${entrySet.size}条)</span>` : '';

                    html += `
                        <div style="display:flex;align-items:center;padding:8px;border-bottom:1px solid rgba(255,255,255,0.1);justify-content:space-between;">
                            <label style="display:flex;align-items:center;cursor:pointer;flex:1;">
                                <input type="checkbox" value="${book}" ${isChecked ? 'checked' : ''} style="margin-right:8px;">
                                <span style="font-size:13px;">${book} ${statusText}</span>
                            </label>
                            <button class="wbap-btn wbap-btn-icon-xs wbap-opt-entry-settings" data-book="${book}" title="选择条目" style="padding:4px 8px;">
                                <i class="fa-solid fa-chevron-right"></i>
                            </button>
                        </div>
                    `;
                });
            }
            html += `</div>`;
            popover.querySelector('.wbap-popover-content').innerHTML = html;

            // Bind logic
            popover.querySelectorAll('input[type="checkbox"]').forEach(cb => {
                cb.addEventListener('change', (ev) => {
                    if (ev.target.checked) {
                        state.activeWorldBooks.add(ev.target.value);
                    } else {
                        state.activeWorldBooks.delete(ev.target.value);
                    }
                    updatePillUI();
                    renderWorldBookMainView(popover, setTitle); // Re-render to update header count and visual state
                });
            });

            // Bind entry settings
            popover.querySelectorAll('.wbap-opt-entry-settings').forEach(btn => {
                btn.addEventListener('click', (ev) => {
                    ev.stopPropagation(); // prevent closing
                    const bookName = btn.dataset.book;
                    // Auto-enable book if clicking settings? maybe not required but helpful
                    if (!state.activeWorldBooks.has(bookName)) {
                        state.activeWorldBooks.add(bookName);
                        updatePillUI();
                    }
                    renderWorldBookEntryView(popover, bookName, setTitle);
                });
            });

        } catch (err) {
            popover.querySelector('.wbap-popover-content').innerHTML = `<div style="padding:10px;color:red;">加载失败: ${err.message}</div>`;
        }
    }

    async function renderWorldBookEntryView(popover, bookName, setTitle) {
        if (setTitle) setTitle(bookName);
        popover.querySelector('.wbap-popover-content').innerHTML = `<div style="padding:10px;text-align:center;"><i class="fa-solid fa-spinner fa-spin"></i> 加载条目...</div>`;

        try {
            // Load book data
            let bookData = state.bookEntryCache.get(bookName);
            if (!bookData) {
                bookData = await WBAP.loadWorldBookEntriesByName(bookName);
                if (bookData) {
                    state.bookEntryCache.set(bookName, bookData);
                }
            }

            if (!bookData || !bookData.entries) {
                const div = document.createElement('div'); // Define div here
                div.innerHTML = `<div style="padding:10px;color:red;">无法加载条目</div>`;
                popover.appendChild(div); // Append to popover
                return;
            }

            const entries = Object.values(bookData.entries).filter(e => e && e.disable !== true);
            let currentSelected = state.selectedEntries.get(bookName);
            if (!currentSelected) {
                currentSelected = new Set();
                state.selectedEntries.set(bookName, currentSelected);
            }

            let html = `
                <div class="wbap-popover-content" style="max-height:240px;overflow-y:auto;padding:0;">
                    <div class="wbap-popover-subheader" style="display:flex;align-items:center;gap:8px;padding:8px 10px;">
                        <button id="wbap-opt-back-btn" class="wbap-btn wbap-btn-icon-xs"><i class="fa-solid fa-arrow-left"></i></button>
                        <button id="wbap-opt-sel-all" class="wbap-btn wbap-btn-xs">全选</button>
                        <button id="wbap-opt-sel-none" class="wbap-btn wbap-btn-xs">清空</button>
                        <span style="flex:1;text-align:right;color:#888;font-size:12px;">${currentSelected.size > 0 ? `已选 ${currentSelected.size}` : '默认全部'}</span>
                    </div>
                    <div class="wbap-popover-list" style="max-height:200px;overflow-y:auto;">
            `;

            if (entries.length === 0) {
                html += `<div style="padding:8px;color:#888;">无可用条目</div>`;
            } else {
                // Re-process to array with UIDs
                const entryList = Object.entries(bookData.entries)
                    .filter(([, e]) => e && e.disable !== true)
                    .map(([uid, e]) => ({ uid, ...e }));

                entryList.forEach(entry => {
                    const isChecked = currentSelected.has(entry.uid);
                    html += `
                        <label style="display:flex;align-items:center;padding:6px 8px;border-bottom:1px solid rgba(255,255,255,0.05);cursor:pointer;">
                            <input type="checkbox" value="${entry.uid}" ${isChecked ? 'checked' : ''} style="margin-right:8px;">
                            <span style="font-size:12px;">${entry.comment || entry.uid}</span>
                        </label>
                    `;
                });
            }
            html += `</div></div>`;

            popover.querySelector('.wbap-popover-content').innerHTML = html;

            // Bind Back Button
            popover.querySelector('#wbap-opt-back-btn').addEventListener('click', () => {
                renderWorldBookMainView(popover, setTitle);
            });

            // Helpers
            const updateSet = () => {
                state.selectedEntries.set(bookName, currentSelected);
                // Update the summary text
                const summary = popover.querySelector('.wbap-popover-subheader span');
                if (summary) summary.textContent = currentSelected.size > 0 ? `已选 ${currentSelected.size}` : '默认全部';
            };

            // Select All
            popover.querySelector('#wbap-opt-sel-all').addEventListener('click', () => {
                const entryList = Object.entries(bookData.entries).filter(([, e]) => e && e.disable !== true);
                entryList.forEach(([uid]) => currentSelected.add(uid));
                popover.querySelectorAll('input[type="checkbox"]').forEach(cb => cb.checked = true);
                updateSet();
            });

            // Select None
            popover.querySelector('#wbap-opt-sel-none').addEventListener('click', () => {
                currentSelected.clear();
                popover.querySelectorAll('input[type="checkbox"]').forEach(cb => cb.checked = false);
                updateSet();
            });

            // Individual Checks
            popover.querySelectorAll('input[type="checkbox"]').forEach(cb => {
                cb.addEventListener('change', (ev) => {
                    const uid = ev.target.value;
                    if (ev.target.checked) {
                        currentSelected.add(uid);
                    } else {
                        currentSelected.delete(uid);
                    }
                    updateSet();
                });
            });

        } catch (err) {
            const div = document.createElement('div');
            div.innerHTML = `<div style="padding:10px;color:red;">加载条目失败: ${err.message}</div>`;
            popover.appendChild(div);
        }
    }

    /* ==========================================================================
       Message Logic
       ========================================================================== */

    function addMessage(role, content) {
        const row = document.createElement('div');
        row.className = `wbap-opt-bubble-row ${role}`;

        if (role === 'assistant') {
            const avatar = document.createElement('div');
            avatar.className = 'wbap-opt-avatar';
            avatar.innerHTML = '<i class="fa-solid fa-robot"></i>';
            row.appendChild(avatar);
        }

        const bubble = document.createElement('div');
        bubble.className = `wbap-opt-bubble ${role}`;
        bubble.innerHTML = content.replace(/\n/g, '<br>');

        row.appendChild(bubble);
        chatArea.appendChild(row);
        chatArea.scrollTop = chatArea.scrollHeight;
    }

    async function handleSend() {
        const text = inputField.value.trim();
        if (!text) return;

        // Visual feedback immediately
        addMessage('user', text);
        inputField.value = '';

        setLoading(true);

        try {
            // 1. Prepare Config from State
            const config = WBAP.CharacterManager.getCurrentCharacterConfig();
            const optimizationApiConfig = config.optimizationApiConfig || {};
            const useIndependent = optimizationApiConfig.useIndependentProfile === true;
            const endpoints = config.selectiveMode?.apiEndpoints || [];

            let endpoint = null;
            if (!useIndependent) {
                // Resolve endpoint
                endpoint = endpoints.find(e => e.id === state.selectedEndpointId);
                if (!endpoint && optimizationApiConfig.selectedEndpointId) {
                    endpoint = endpoints.find(e => e.id === optimizationApiConfig.selectedEndpointId);
                }
                if (!endpoint) {
                    // Fallback: try to find any enabled endpoint
                    endpoint = endpoints.find(e => e.enabled !== false);
                    if (endpoint) {
                        state.selectedEndpointId = endpoint.id;
                        state.selectedModel = endpoint.model;
                        updatePillUI(); // Refresh UI to show fallback
                    }
                }

                if (!endpoint) {
                    throw new Error("No available API endpoint. Please add or enable one in settings.");
                }
            }

            // 2. Prepare API Config
            const apiConfig = useIndependent
                ? {
                    apiUrl: optimizationApiConfig.apiUrl || '',
                    apiKey: optimizationApiConfig.apiKey || '',
                    model: state.selectedModel || optimizationApiConfig.model || '',
                    maxTokens: Math.max(optimizationApiConfig.maxTokens || 2000, 2000),
                    temperature: Number.isFinite(optimizationApiConfig.temperature)
                        ? optimizationApiConfig.temperature
                        : 0.7
                }
                : {
                    ...endpoint,
                    apiUrl: endpoint.apiUrl || endpoint.url,
                    apiKey: endpoint.apiKey || endpoint.key,
                    model: state.selectedModel || endpoint.model,
                    // Use higher tokens for optimization usually, or endpoint default
                    maxTokens: Math.max(endpoint.maxTokens || 2000, 2000),
                    temperature: endpoint.temperature || 0.7
                };

            if (!apiConfig.apiUrl || !apiConfig.apiKey) {
                if (useIndependent) {
                    throw new Error('Optimization API configuration is incomplete (missing URL or key).');
                }
                throw new Error(`API endpoint "${endpoint.name}" is incomplete (missing URL or key)`);
            }

            // 3. Prepare Context & Worldbook Content
            // Fetch Worldbook Content
            let worldbookContent = "";
            if (state.activeWorldBooks.size > 0) {
                const bookNames = Array.from(state.activeWorldBooks);

                // Use cached if available, or load
                // We should ensure we have the data.
                // Promise.all might be redundant if we cached in UI, but good for safety.
                const loadedBooks = await Promise.all(bookNames.map(async name => {
                    if (state.bookEntryCache.has(name)) return state.bookEntryCache.get(name);
                    const b = await WBAP.loadWorldBookEntriesByName(name);
                    if (b) state.bookEntryCache.set(name, b);
                    return b;
                }));

                loadedBooks.forEach((book, idx) => {
                    if (book && book.entries) {
                        const name = bookNames[idx];
                        const selectedSet = state.selectedEntries.get(name);

                        // If set exists and has items, usage is restricted. 
                        // If set is empty or undefined, use ALL items (default).
                        const useAll = !selectedSet || selectedSet.size === 0;

                        let entryCount = 0;
                        let bookText = "";

                        Object.entries(book.entries).forEach(([uid, entry]) => {
                            if (entry && entry.disable !== true) {
                                // Filter Logic
                                if (useAll || selectedSet.has(uid)) {
                                    bookText += `[${entry.comment || 'Entry'}]
${entry.content}

`;
                                    entryCount++;
                                }
                            }
                        });

                        if (entryCount > 0) {
                            worldbookContent += `
--- Worldbook: ${name} (${entryCount} entries) ---
${bookText}`;
                        }
                    }
                });
            }

            // 4. Construct Prompt
            // Use a hardcoded system prompt for optimization if none config'd, or reuse generic one
            const panelContext = buildPanelContext(state.currentContext);
            const defaultPrompt = `你是一个专业的剧情优化与扩写助手。
你的任务是根据用户的指令，对剧情进行优化、润色或续写。
请仔细阅读以下参考资料（世界书/设定）：
${worldbookContent}

用户指令：${text}

请直接输出优化后的结果（如有需要可简要说明思路，但重点是正文）。`;

            const systemPrompt = buildOptimizationSystemPrompt(
                config.optimizationSystemPrompt,
                defaultPrompt,
                {
                    worldbookContent,
                    userInput: text,
                    originalUserInput: state.sourceUserInput,
                    initialResult: state.initialResult,
                    sourceContext: state.sourceContext,
                    panelContext
                }
            );

            // 5. Call API
            // Note: WBAP.callAI is likely wrapper around generic fetch or ST API
            // If WBAP.callAI supports signal, we can pass it.
            const response = await WBAP.callAI(
                apiConfig.model,
                text, // user prompt
                systemPrompt,
                apiConfig
            );

            // 6. Handle Response
            const replyContent = response || "(API returned empty content)";
            addMessage('assistant', replyContent);
            state.currentContext.push({ role: 'user', content: text });
            state.currentContext.push({ role: 'assistant', content: replyContent });

            // Optionally update initialResult if this was a refinement of the whole thing? 
            // Or just treat as conversation. 
            // If user asked to "Rewrite everything", maybe we update preview?
            // For now, simpler is safer: just chat.

        } catch (e) {
            Logger.error("Optimization Chat Error", e);
            addMessage('assistant', `Error: ${e.message}`);
        } finally {
            setLoading(false);
        }
    }


    function setLoading(isLoading) {
        if (isLoading) {
            sendBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i>';
            sendBtn.disabled = true;
        } else {
            sendBtn.innerHTML = '<i class="fa-solid fa-paper-plane"></i>';
            sendBtn.disabled = false;
        }
    }

    function showPreview() {
        // Create or show a full-screen modal with the content
        // We can reuse a simple full-screen div approach for maximum "glass" effect
        let previewOverlay = document.getElementById('wbap-opt-preview-overlay');

        if (!previewOverlay) {
            previewOverlay = document.createElement('div');
            previewOverlay.id = 'wbap-opt-preview-overlay';
            previewOverlay.className = 'wbap-inner-overlay'; // Defined in style.css step 111 (line 1841)
            // Add content structure
            previewOverlay.innerHTML = `
                <div style="display:flex;flex-direction:column;height:100%;padding:20px;">
                    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:15px; border-bottom:1px solid rgba(255,255,255,0.1); padding-bottom:10px;">
                        <h3 style="margin:0;color:var(--wbap-primary);">全文预览</h3>
                        <div>
                             <button id="wbap-opt-preview-copy" class="wbap-btn wbap-btn-xs"><i class="fa-solid fa-copy"></i> 复制</button>
                             <button id="wbap-opt-preview-close" class="wbap-btn wbap-btn-xs wbap-btn-danger"><i class="fa-solid fa-times"></i> 关闭</button>
                        </div>
                    </div>
                    <textarea class="wbap-textarea-full" readonly style="flex:1;background:rgba(0,0,0,0.2);border-radius:8px;padding:15px;"></textarea>
                </div>
            `;
            panelOverlay.appendChild(previewOverlay);

            // Bind internal close
            previewOverlay.querySelector('#wbap-opt-preview-close').addEventListener('click', () => {
                previewOverlay.classList.remove('open');
            });

            // Bind copy
            previewOverlay.querySelector('#wbap-opt-preview-copy').addEventListener('click', () => {
                const ta = previewOverlay.querySelector('textarea');
                ta.select();
                document.execCommand('copy');
                // Could act toaster here
                const btn = previewOverlay.querySelector('#wbap-opt-preview-copy');
                const originalHtml = btn.innerHTML;
                btn.innerHTML = '<i class="fa-solid fa-check"></i> 已复制';
                setTimeout(() => btn.innerHTML = originalHtml, 1500);
            });
        }

        // Update content
        const textarea = previewOverlay.querySelector('textarea');
        textarea.value = state.initialResult || "（暂无生成内容）";

        // Show
        previewOverlay.classList.add('open');
    }

    // Expose API
    window.WBAP.Optimization = {
        initialize,
        openPanel,
        closePanel,
        updateFloatingButtonVisibility
    };

    // Sync floating button on load
    setTimeout(() => {
        try {
            updateFloatingButtonVisibility();
        } catch (e) {
            Logger.error('Failed to sync floating button', e);
        }
    }, 0);

})();
