// modules/ui_logic.js

(function () {
    'use strict';

    // 确保全局命名空间存在
    window.WBAP = window.WBAP || {};
    const Logger = WBAP.Logger;

    let panelElement = null;
    let settingsElement = null;

    function syncMobileRootFix() {
        try {
            const anyOverlayOpen = !!document.querySelector('.wbap-panel.open, .wbap-settings.open, .wbap-modal.open, #wbap-entry-modal.open');
            const shouldLockMobileRoot = window.innerWidth <= 900 && anyOverlayOpen;
            document.body.classList.toggle('wbap-mobile-root-fix', shouldLockMobileRoot);
            document.documentElement.classList.toggle('wbap-mobile-root-fix', shouldLockMobileRoot);
            document.body.classList.toggle('wbap-overlay-open', anyOverlayOpen);
            document.documentElement.classList.toggle('wbap-overlay-open', anyOverlayOpen);
        } catch (e) {
            // non-critical
        }
    }

    function injectUI() {
        try {
            Logger.log('开始注入 UI');

            if (document.getElementById('wbap-panel')) {
                Logger.log('UI 已存在，跳过注入');
                return;
            }

            // 注入悬浮按钮
            const floatBtn = document.createElement('button');
            floatBtn.id = 'wbap-float-btn';
            floatBtn.className = 'wbap-fab'; // 使用CSS类
            floatBtn.innerHTML = '<i class="fa-solid fa-cat"></i>';
            floatBtn.title = '笔者之脑';
            document.body.appendChild(floatBtn);

            // 恢复位置
            const savedPosition = localStorage.getItem('wbap_float_ball_position');
            if (savedPosition) {
                try {
                    const pos = JSON.parse(savedPosition);
                    floatBtn.style.top = pos.top;
                    floatBtn.style.left = pos.left;
                } catch (e) {
                    // fallback 如解析失败, CSS会处理默认位置
                    floatBtn.style.top = '';
                    floatBtn.style.left = '';
                }
            }

            // Make the button draggable using the generic utility
            const onClick = () => {
                if (panelElement) {
                    // RESET TRAP: Force clear settings mode to prevent UI lockup
                    document.body.classList.remove('wbap-mobile-settings-mode');
                    document.documentElement.classList.remove('wbap-mobile-settings-mode');
                    if (settingsElement) settingsElement.classList.remove('open');

                    panelElement.classList.toggle('open');
                    syncMobileRootFix();
                }
            };
            const onDragEnd = (pos) => {
                localStorage.setItem('wbap_float_ball_position', JSON.stringify(pos));
            };

            WBAP.makeDraggable(floatBtn, onClick, onDragEnd);
            Logger.log('悬浮按钮已注入');

            // 注入模板
            const templates = WBAP.UI_TEMPLATES;
            const panelDiv = document.createElement('div');
            panelDiv.innerHTML = templates.PANEL_HTML;
            document.body.appendChild(panelDiv.firstElementChild);
            panelElement = document.getElementById('wbap-panel');

            const settingsDiv = document.createElement('div');
            settingsDiv.innerHTML = templates.SETTINGS_HTML;
            document.body.appendChild(settingsDiv.firstElementChild);
            settingsElement = document.getElementById('wbap-settings');
            if (settingsElement) {
                Logger.log('设置元素 #wbap-settings 已成功注入和获取。');
            } else {
                Logger.error('错误：无法获取 #wbap-settings 元素。');
            }

            const editorDiv = document.createElement('div');
            editorDiv.innerHTML = templates.PROMPT_EDITOR_HTML;
            const shouldLockMobileRoot = window.innerWidth <= 900 && anyOverlayOpen;
            document.body.classList.toggle('wbap-mobile-root-fix', shouldLockMobileRoot);
            document.documentElement.classList.toggle('wbap-mobile-root-fix', shouldLockMobileRoot);
            document.body.classList.toggle('wbap-overlay-open', anyOverlayOpen);
            document.documentElement.classList.toggle('wbap-overlay-open', anyOverlayOpen);
        } catch (e) {
            // non-critical
        }
    }

    function injectUI() {
        try {
            Logger.log('开始注入 UI');

            if (document.getElementById('wbap-panel')) {
                Logger.log('UI 已存在，跳过注入');
                return;
            }

            // 注入悬浮按钮
            const floatBtn = document.createElement('button');
            floatBtn.id = 'wbap-float-btn';
            floatBtn.className = 'wbap-fab'; // 使用CSS类
            floatBtn.innerHTML = '<i class="fa-solid fa-cat"></i>';
            floatBtn.title = '笔者之脑';
            document.body.appendChild(floatBtn);

            // 恢复位置
            const savedPosition = localStorage.getItem('wbap_float_ball_position');
            if (savedPosition) {
                try {
                    const pos = JSON.parse(savedPosition);
                    floatBtn.style.top = pos.top;
                    floatBtn.style.left = pos.left;
                } catch (e) {
                    // fallback 如解析失败, CSS会处理默认位置
                    floatBtn.style.top = '';
                    floatBtn.style.left = '';
                }
            }

            // Make the button draggable using the generic utility
            const onClick = () => {
                if (panelElement) {
                    // RESET TRAP: Force clear settings mode to prevent UI lockup
                    document.body.classList.remove('wbap-mobile-settings-mode');
                    document.documentElement.classList.remove('wbap-mobile-settings-mode');
                    if (settingsElement) settingsElement.classList.remove('open');

                    panelElement.classList.toggle('open');
                    syncMobileRootFix();
                }
            };
            const onDragEnd = (pos) => {
                localStorage.setItem('wbap_float_ball_position', JSON.stringify(pos));
            };

            WBAP.makeDraggable(floatBtn, onClick, onDragEnd);
            Logger.log('悬浮按钮已注入');

            // 注入模板
            const templates = WBAP.UI_TEMPLATES;
            const panelDiv = document.createElement('div');
            panelDiv.innerHTML = templates.PANEL_HTML;
            document.body.appendChild(panelDiv.firstElementChild);
            panelElement = document.getElementById('wbap-panel');

            const settingsDiv = document.createElement('div');
            settingsDiv.innerHTML = templates.SETTINGS_HTML;
            document.body.appendChild(settingsDiv.firstElementChild);
            settingsElement = document.getElementById('wbap-settings');
            if (settingsElement) {
                Logger.log('设置元素 #wbap-settings 已成功注入和获取。');
            } else {
                Logger.error('错误：无法获取 #wbap-settings 元素。');
            }

            const editorDiv = document.createElement('div');
            editorDiv.innerHTML = templates.PROMPT_EDITOR_HTML;
            document.body.appendChild(editorDiv.firstElementChild);

            const pickerDiv = document.createElement('div');
            pickerDiv.innerHTML = templates.PROMPT_PICKER_HTML;
            document.body.appendChild(pickerDiv.firstElementChild);

            const endpointEditorDiv = document.createElement('div');
            endpointEditorDiv.innerHTML = templates.API_ENDPOINT_EDITOR_HTML;
            document.body.appendChild(endpointEditorDiv.firstElementChild);

            const progressDiv = document.createElement('div');
            progressDiv.innerHTML = templates.PROGRESS_PANEL_HTML;
            document.body.appendChild(progressDiv.firstElementChild);

            // 绑定事件并刷新
            bindPanelEvents();
            bindSettingsEvents();
            bindEditorEvents();
            bindEndpointEditorEvents();
            bindProgressPanelEvents();
            refreshPromptList();
            loadSettingsToUI();
            renderApiEndpoints();

            syncMobileRootFix();
            Logger.log('UI 注入成功');
        } catch (e) {
            Logger.error('UI 注入失败:', e);
        }
    }


    function bindPanelEvents() {
        document.getElementById('wbap-close-btn')?.addEventListener('click', () => {
            if (panelElement) panelElement.classList.remove('open');
            syncMobileRootFix();
        });

        document.getElementById('wbap-settings-btn')?.addEventListener('click', () => {
            // Close main panel when opening settings (standard behavior)
            if (panelElement) panelElement.classList.remove('open');
            if (settingsElement) settingsElement.classList.add('open');
            syncMobileRootFix();
        });

        const promptSelect = document.getElementById('wbap-prompt-preset-select');
        promptSelect?.addEventListener('change', () => {
            const currentConfig = WBAP.CharacterManager ? WBAP.CharacterManager.getCurrentCharacterConfig() : WBAP.config;
            const newIndex = parseInt(promptSelect.value);
            currentConfig.selectedPromptIndex = newIndex;
            // 同步更新全局 config
            if (WBAP.config !== currentConfig) {
                WBAP.config.selectedPromptIndex = newIndex;
            }
            WBAP.saveConfig();
            refreshPromptList();
        });

        document.getElementById('wbap-prompt-new-btn')?.addEventListener('click', () => window.wbapEditPrompt(-1));
        document.getElementById('wbap-prompt-edit-btn')?.addEventListener('click', () => {
            const currentConfig = WBAP.CharacterManager ? WBAP.CharacterManager.getCurrentCharacterConfig() : WBAP.config;
            window.wbapEditPrompt(currentConfig.selectedPromptIndex);
        });
        document.getElementById('wbap-prompt-delete-btn')?.addEventListener('click', () => {
            const currentConfig = WBAP.CharacterManager ? WBAP.CharacterManager.getCurrentCharacterConfig() : WBAP.config;
            window.wbapDeletePrompt(currentConfig.selectedPromptIndex);
        });
        document.getElementById('wbap-prompt-export-btn')?.addEventListener('click', () => exportCurrentPrompt());

        // 副提示词事件
        const secondarySelect = document.getElementById('wbap-secondary-preset-select');
        secondarySelect?.addEventListener('change', () => {
            const cfg = WBAP.CharacterManager ? WBAP.CharacterManager.getCurrentCharacterConfig() : WBAP.config;
            if (!cfg.secondaryPrompt) cfg.secondaryPrompt = { enabled: false, selectedPromptIndex: 0, boundEndpointIds: [] };
            cfg.secondaryPrompt.selectedPromptIndex = parseInt(secondarySelect.value) || 0;
            if (WBAP.config !== cfg) {
                WBAP.config.secondaryPrompt = cfg.secondaryPrompt;
            }
            WBAP.saveConfig();
            refreshSecondaryPromptUI();
        });
        document.getElementById('wbap-secondary-enabled')?.addEventListener('change', (e) => {
            const cfg = WBAP.CharacterManager ? WBAP.CharacterManager.getCurrentCharacterConfig() : WBAP.config;
            if (!cfg.secondaryPrompt) cfg.secondaryPrompt = { enabled: false, selectedPromptIndex: 0, boundEndpointIds: [] };
            cfg.secondaryPrompt.enabled = e.target.checked;
            if (WBAP.config !== cfg) {
                WBAP.config.secondaryPrompt = cfg.secondaryPrompt;
            }
            WBAP.saveConfig();
            refreshSecondaryPromptUI();
        });
        const secondaryBindBtn = document.getElementById('wbap-secondary-bind-btn');
        const secondaryList = document.getElementById('wbap-secondary-binding-list');
        secondaryBindBtn?.addEventListener('click', () => {
            if (!secondaryList) return;
            const hidden = secondaryList.style.display === 'none' || secondaryList.style.display === '';
            secondaryList.style.display = hidden ? 'block' : 'none';
        });
        secondaryList?.addEventListener('change', () => {
            const selected = getSecondaryBindingSelection();
            updateSecondaryBindingSummary(selected);
            const cfg = WBAP.CharacterManager ? WBAP.CharacterManager.getCurrentCharacterConfig() : WBAP.config;
            if (!cfg.secondaryPrompt) cfg.secondaryPrompt = { enabled: false, selectedPromptIndex: 0, boundEndpointIds: [] };
            cfg.secondaryPrompt.boundEndpointIds = selected;
            if (WBAP.config !== cfg) {
                WBAP.config.secondaryPrompt = cfg.secondaryPrompt;
            }
            WBAP.saveConfig();
        });

        // 主提示词绑定入口（面板）
        const mainBindingBtn = document.getElementById('wbap-prompt-bind-apis-btn');
        const mainBindingList = document.getElementById('wbap-prompt-binding-list');
        if (mainBindingBtn && mainBindingList) {
            mainBindingBtn.addEventListener('click', () => {
                const hidden = mainBindingList.style.display === 'none' || mainBindingList.style.display === '';
                mainBindingList.style.display = hidden ? 'block' : 'none';
            });
            mainBindingList.addEventListener('change', () => {
                const selected = getPromptBindingSelection();
                updatePromptBindingTags(selected);
                const cfg = WBAP.CharacterManager ? WBAP.CharacterManager.getCurrentCharacterConfig() : WBAP.config;
                const prompts = WBAP.PromptManager.getCombinedPrompts();
                const currentPrompt = prompts[cfg.selectedPromptIndex || 0];
                if (currentPrompt) {
                    WBAP.PromptManager.addOrUpdatePrompt({ ...currentPrompt, boundEndpointIds: selected });
                    WBAP.saveConfig();
                    refreshPromptList();
                }
            });
        }

        // 代理 API 列表点击（移动端更友好）
        document.getElementById('wbap-api-endpoint-list')?.addEventListener('click', (e) => {
            if (e.target.closest('.wbap-api-endpoint-header label')) return;
            if (e.target.closest('button, input, select, textarea, .wbap-btn')) return;
            const item = e.target.closest('.wbap-api-endpoint-item');
            if (item && item.dataset.id) {
                window.wbapEditEndpoint(item.dataset.id);
            }
        });

        document.getElementById('wbap-save-variables-btn')?.addEventListener('click', (e) => {
            WBAP.saveConfig();
            const btn = e.currentTarget;
            btn.textContent = '已应用!';
            setTimeout(() => {
                btn.textContent = '应用变量';
            }, 1500);
        });

        const importBtn = document.getElementById('wbap-import-prompt-btn');
        const fileInput = document.getElementById('wbap-prompt-file-input');
        if (importBtn && fileInput) {
            importBtn.addEventListener('click', () => fileInput.click());
            fileInput.addEventListener('change', async (e) => {
                const file = e.target.files[0];
                if (file) {
                    try {
                        const content = await file.text();
                        const prompt = JSON.parse(content);
                        const currentConfig = WBAP.CharacterManager ? WBAP.CharacterManager.getCurrentCharacterConfig() : WBAP.config;
                        WBAP.PromptManager.addOrUpdatePrompt(prompt);
                        const combinedPrompts = WBAP.PromptManager.getCombinedPrompts();
                        let newIndex = combinedPrompts.findIndex(p => p.name === prompt.name);
                        if (newIndex < 0) newIndex = Math.max(0, combinedPrompts.length - 1);
                        currentConfig.selectedPromptIndex = newIndex;
                        // 同步更新全局 config
                        if (WBAP.config !== currentConfig) {
                            WBAP.config.selectedPromptIndex = currentConfig.selectedPromptIndex;
                        }
                        // 确保总局提示词索引仍在有效范围内
                        if (currentConfig.aggregatorMode) {
                            const maxIndex = Math.max(0, combinedPrompts.length - 1);
                            currentConfig.aggregatorMode.promptIndex = Math.min(currentConfig.aggregatorMode.promptIndex ?? 0, maxIndex);
                        }
                        WBAP.saveConfig();
                        refreshPromptList();
                        renderAggregatorControls();
                        Logger.log('提示词导入成功:', prompt.name);
                    } catch (err) {
                        Logger.error('导入提示词失败:', err);
                        alert('导入失败: ' + err.message);
                    }
                }
                fileInput.value = '';
            });
        }

        // 提示词选择弹窗
        const promptPickerModal = document.getElementById('wbap-prompt-picker-modal');
        const promptPickerList = document.getElementById('wbap-prompt-picker-list');
        const openPromptPicker = () => {
            if (!promptPickerModal || !promptPickerList) return;
            const prompts = WBAP.PromptManager.getCombinedPrompts();
            const currentConfig = WBAP.CharacterManager ? WBAP.CharacterManager.getCurrentCharacterConfig() : WBAP.config;
            const selected = currentConfig.selectedPromptIndex || 0;
            if (!prompts.length) {
                promptPickerList.innerHTML = '<div class="wbap-empty-state"><p>暂无预设，请先新建或导入</p></div>';
            } else {
                promptPickerList.innerHTML = prompts.map((p, idx) => `
                    <label class="wbap-prompt-picker-item">
                        <input type="radio" name="wbap-prompt-picker" value="${idx}" ${idx === selected ? 'checked' : ''}>
                        <div class="wbap-prompt-picker-text">
                            <div class="title">${p.name || '未命名预设'}</div>
                            <div class="desc">${p.description || ''}</div>
                        </div>
                    </label>
                `).join('');
            }
            promptPickerModal.classList.add('open');
            syncMobileRootFix();
        };
        const closePromptPicker = () => {
            if (promptPickerModal) promptPickerModal.classList.remove('open');
            syncMobileRootFix();
        };

        document.getElementById('wbap-open-prompt-picker')?.addEventListener('click', openPromptPicker);
        document.getElementById('wbap-prompt-picker-close')?.addEventListener('click', closePromptPicker);
        document.getElementById('wbap-prompt-picker-cancel')?.addEventListener('click', closePromptPicker);
        document.getElementById('wbap-prompt-picker-apply')?.addEventListener('click', () => {
            if (!promptPickerList) return;
            const checked = promptPickerList.querySelector('input[name=\"wbap-prompt-picker\"]:checked');
            if (checked) {
                const newIndex = parseInt(checked.value);
                const currentConfig = WBAP.CharacterManager ? WBAP.CharacterManager.getCurrentCharacterConfig() : WBAP.config;
                currentConfig.selectedPromptIndex = newIndex;
                if (WBAP.config !== currentConfig) {
                    WBAP.config.selectedPromptIndex = newIndex;
                }
                WBAP.saveConfig();
                refreshPromptList();
            }
            closePromptPicker();
        });
    }

    function bindSettingsEvents() {
        document.getElementById('wbap-settings-close')?.addEventListener('click', () => {
            if (settingsElement) settingsElement.classList.remove('open');
            document.body.classList.remove('wbap-mobile-settings-mode');
            document.documentElement.classList.remove('wbap-mobile-settings-mode');
            if (panelElement) panelElement.classList.add('open');
            syncMobileRootFix();
        });

        document.getElementById('wbap-add-api-btn')?.addEventListener('click', () => {
            const config = WBAP.CharacterManager.getCurrentCharacterConfig();
            if (!config.selectiveMode.apiEndpoints) {
                config.selectiveMode.apiEndpoints = [];
            }
            config.selectiveMode.apiEndpoints.push({
                id: `ep_${Date.now()}`,
                name: `新增API-${config.selectiveMode.apiEndpoints.length + 1}`,
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
            });
            renderApiEndpoints();
            refreshSecondaryPromptUI();
        });

        document.getElementById('wbap-agg-enabled')?.addEventListener('change', (e) => {
            const config = WBAP.CharacterManager.getCurrentCharacterConfig();
            if (!config.aggregatorMode) config.aggregatorMode = { enabled: false, endpointId: '', promptIndex: 0 };
            config.aggregatorMode.enabled = e.target.checked;
        });
        document.getElementById('wbap-agg-endpoint')?.addEventListener('change', (e) => {
            const config = WBAP.CharacterManager.getCurrentCharacterConfig();
            if (!config.aggregatorMode) config.aggregatorMode = { enabled: false, endpointId: '', promptIndex: 0 };
            config.aggregatorMode.endpointId = e.target.value;
        });
        document.getElementById('wbap-agg-prompt')?.addEventListener('change', (e) => {
            const config = WBAP.CharacterManager.getCurrentCharacterConfig();
            if (!config.aggregatorMode) config.aggregatorMode = { enabled: false, endpointId: '', promptIndex: 0 };
            config.aggregatorMode.promptIndex = parseInt(e.target.value, 10) || 0;
        });

        document.getElementById('wbap-optimization-use-independent')?.addEventListener('change', (e) => {
            toggleOptimizationApiBlocks(e.target.checked === true);
        });

        document.getElementById('wbap-optimization-fetch-models')?.addEventListener('click', async (e) => {
            const btn = e.currentTarget;
            btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i>';
            btn.disabled = true;

            const tempConfig = {
                apiUrl: document.getElementById('wbap-optimization-api-url')?.value || '',
                apiKey: document.getElementById('wbap-optimization-api-key')?.value || ''
            };
            const currentModel = document.getElementById('wbap-optimization-model')?.value || '';
            const result = await WBAP.fetchEndpointModels(tempConfig);
            if (result.success) {
                populateOptimizationModelSelect(result.models, currentModel);
            } else {
                alert(`获取模型失败: ${result.message}`);
            }

            btn.innerHTML = '获取模型';
            btn.disabled = false;
        });

        document.getElementById('wbap-save-settings')?.addEventListener('click', () => {
            const config = WBAP.CharacterManager.getCurrentCharacterConfig();

            config.enabled = document.getElementById('wbap-enabled').checked;
            const contextRoundsVal = parseInt(document.getElementById('wbap-context-rounds').value, 10);
            config.contextRounds = Number.isFinite(contextRoundsVal) ? contextRoundsVal : 5;

            config.enableChunking = document.getElementById('wbap-enable-chunking').checked;
            config.skipProcessedMessages = document.getElementById('wbap-skip-processed').checked;
            if (!config.aggregatorMode) {
                config.aggregatorMode = { enabled: false, endpointId: '', promptIndex: 0 };
            }
            const aggEnabledEl = document.getElementById('wbap-agg-enabled');
            const aggEndpointEl = document.getElementById('wbap-agg-endpoint');
            const aggPromptEl = document.getElementById('wbap-agg-prompt');
            if (aggEnabledEl) config.aggregatorMode.enabled = aggEnabledEl.checked;
            if (aggEndpointEl) config.aggregatorMode.endpointId = aggEndpointEl.value;
            if (aggPromptEl) config.aggregatorMode.promptIndex = parseInt(aggPromptEl.value, 10) || 0;



            // 全局设置
            const globalSettings = WBAP.mainConfig.globalSettings || {};
            globalSettings.maxConcurrent = parseInt(document.getElementById('wbap-global-max-concurrent')?.value) || 0;
            globalSettings.timeout = parseInt(document.getElementById('wbap-global-timeout')?.value) || 0;
            WBAP.mainConfig.globalSettings = globalSettings;

            config.showProgressPanel = document.getElementById('wbap-settings-progress-panel')?.checked !== false;
            config.enablePlotOptimization = document.getElementById('wbap-settings-plot-optimization')?.checked === true;
            config.enablePlotOptimizationFloatButton = document.getElementById('wbap-settings-plot-optimization-fab')?.checked === true;
            config.optimizationSystemPrompt = document.getElementById('wbap-settings-optimization-prompt')?.value || '';
            const optimizationApiConfig = ensureOptimizationApiConfig(config);
            optimizationApiConfig.useIndependentProfile = document.getElementById('wbap-optimization-use-independent')?.checked === true;
            optimizationApiConfig.selectedEndpointId = document.getElementById('wbap-optimization-endpoint-select')?.value || null;
            optimizationApiConfig.apiUrl = document.getElementById('wbap-optimization-api-url')?.value || '';
            optimizationApiConfig.apiKey = document.getElementById('wbap-optimization-api-key')?.value || '';
            optimizationApiConfig.model = document.getElementById('wbap-optimization-model')?.value || '';
            const optMaxTokens = parseInt(document.getElementById('wbap-optimization-max-tokens')?.value, 10);
            optimizationApiConfig.maxTokens = Number.isFinite(optMaxTokens) && optMaxTokens > 0 ? optMaxTokens : 4000;
            const optTemp = parseFloat(document.getElementById('wbap-optimization-temperature')?.value);
            optimizationApiConfig.temperature = Number.isFinite(optTemp) ? optTemp : 0.7;

            WBAP.saveConfig();
            if (WBAP.Optimization && WBAP.Optimization.updateFloatingButtonVisibility) {
                WBAP.Optimization.updateFloatingButtonVisibility();
            }
            if (settingsElement) settingsElement.classList.remove('open');
            if (panelElement) panelElement.classList.add('open');
            syncMobileRootFix();
            Logger.log('设置已保存到当前角色', config);
        });

        document.getElementById('wbap-export-config')?.addEventListener('click', () => {
            const config = WBAP.CharacterManager.getCurrentCharacterConfig();
            const dataStr = JSON.stringify(config, null, 2);
            const blob = new Blob([dataStr], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = 'worldbook_ai_processor_char_config.json';
            a.click();
            URL.revokeObjectURL(url);
        });

        const importBtn = document.getElementById('wbap-import-config');
        const fileInput = document.getElementById('wbap-config-file-input');
        importBtn?.addEventListener('click', () => fileInput.click());
        fileInput?.addEventListener('change', async (e) => {
            const file = e.target.files[0];
            if (file) {
                try {
                    const content = await file.text();
                    const importedConf = JSON.parse(content);
                    const currentConfig = WBAP.CharacterManager.getCurrentCharacterConfig();
                    const defaultConf = WBAP.createDefaultCharacterConfig ? WBAP.createDefaultCharacterConfig() : WBAP.DEFAULT_CONFIG;

                    // 清空当前配置并用导入的配置进行深度合并
                    Object.keys(currentConfig).forEach(key => delete currentConfig[key]);
                    Object.assign(currentConfig, {
                        ...defaultConf,
                        ...importedConf,
                        selectiveMode: {
                            ...defaultConf.selectiveMode,
                            ...(importedConf.selectiveMode || {})
                        },
                    });
                    // 兼容旧字段 url/key -> apiUrl/apiKey
                    (currentConfig.selectiveMode.apiEndpoints || []).forEach(ep => {
                        normalizeEndpointStructure(ep);
                        if (ep.timeout == null) ep.timeout = 60;
                    });

                    WBAP.saveConfig();
                    loadSettingsToUI();
                    refreshPromptList();
                    Logger.log('配置已成功导入到当前角色');
                } catch (err) {
                    Logger.error('导入配置失败:', err);
                    alert('导入失败: ' + err.message);
                }
            }
            fileInput.value = '';
        });

        document.getElementById('wbap-context-rounds')?.addEventListener('input', (e) => {
            const valueEl = document.getElementById('wbap-context-rounds-value');
            if (valueEl) valueEl.textContent = e.target.value;
        });

        document.getElementById('wbap-reset-config')?.addEventListener('click', () => {
            if (confirm('确定要重置当前角色的所有配置吗？')) {
                const config = WBAP.CharacterManager.getCurrentCharacterConfig();
                // 清空并恢复默认值
                Object.keys(config).forEach(key => delete config[key]);
                const defaultConf = WBAP.createDefaultCharacterConfig ? WBAP.createDefaultCharacterConfig() : WBAP.DEFAULT_CONFIG;
                Object.assign(config, JSON.parse(JSON.stringify(defaultConf)));

                WBAP.saveConfig();
                loadSettingsToUI();
                refreshPromptList();
                Logger.log('当前角色的配置已重置');
            }
        });
    }

    function ensureOptimizationApiConfig(config) {
        if (!config.optimizationApiConfig) {
            config.optimizationApiConfig = {
                useIndependentProfile: false,
                selectedEndpointId: null,
                apiUrl: '',
                apiKey: '',
                model: '',
                maxTokens: 4000,
                temperature: 0.7
            };
        }
        return config.optimizationApiConfig;
    }

    function toggleOptimizationApiBlocks(useIndependent) {
        const independentBlock = document.getElementById('wbap-optimization-independent-block');
        const endpointBlock = document.getElementById('wbap-optimization-endpoint-block');
        if (independentBlock) independentBlock.classList.toggle('wbap-hidden', !useIndependent);
        if (endpointBlock) endpointBlock.classList.toggle('wbap-hidden', useIndependent);
    }

    function renderOptimizationEndpointOptions(selectedId = null) {
        const selectEl = document.getElementById('wbap-optimization-endpoint-select');
        if (!selectEl) return;
        const config = WBAP.CharacterManager.getCurrentCharacterConfig();
        const endpoints = config?.selectiveMode?.apiEndpoints || [];
        const enabledEndpoints = endpoints.filter(ep => ep && ep.enabled !== false);

        selectEl.innerHTML = '';
        if (enabledEndpoints.length === 0) {
            const opt = document.createElement('option');
            opt.value = '';
            opt.textContent = '暂无可用 API';
            selectEl.appendChild(opt);
            selectEl.disabled = true;
            return;
        }

        enabledEndpoints.forEach(ep => {
            const opt = document.createElement('option');
            opt.value = ep.id;
            const modelLabel = ep.model ? ` (${ep.model})` : '';
            opt.textContent = `${ep.name}${modelLabel}`;
            selectEl.appendChild(opt);
        });
        selectEl.disabled = false;
        if (selectedId && enabledEndpoints.some(ep => ep.id === selectedId)) {
            selectEl.value = selectedId;
        } else {
            selectEl.selectedIndex = 0;
        }
    }

    function populateOptimizationModelSelect(models = [], currentModel = '') {
        const modelSelect = document.getElementById('wbap-optimization-model');
        if (!modelSelect) return;
        const list = Array.isArray(models) ? models : [];
        modelSelect.innerHTML = '';

        if (list.length > 0) {
            list.forEach(model => {
                const option = document.createElement('option');
                option.value = model;
                option.textContent = model;
                if (model === currentModel) option.selected = true;
                modelSelect.appendChild(option);
            });
            if (!modelSelect.value && currentModel) {
                const option = document.createElement('option');
                option.value = currentModel;
                option.textContent = currentModel;
                option.selected = true;
                modelSelect.appendChild(option);
            }
            if (!modelSelect.value && modelSelect.options.length > 0) {
                modelSelect.selectedIndex = 0;
            }
            return;
        }

        if (currentModel) {
            const option = document.createElement('option');
            option.value = currentModel;
            option.textContent = currentModel;
            option.selected = true;
            modelSelect.appendChild(option);
        } else {
            modelSelect.innerHTML = '<option value="" disabled selected>请先获取模型</option>';
        }
    }

    function loadSettingsToUI() {
        const config = WBAP.CharacterManager.getCurrentCharacterConfig();
        if (!config) return;
        if (!config.aggregatorMode) {
            config.aggregatorMode = { enabled: false, endpointId: '', promptIndex: 0 };
        }

        document.getElementById('wbap-enabled').checked = config.enabled !== false;

        const global = WBAP.mainConfig.globalSettings || {};
        const maxConcEl = document.getElementById('wbap-global-max-concurrent');
        const timeoutEl = document.getElementById('wbap-global-timeout');
        if (maxConcEl) maxConcEl.value = global.maxConcurrent ?? 0;
        if (timeoutEl) timeoutEl.value = global.timeout ?? 0;

        const contextRoundsEl = document.getElementById('wbap-context-rounds');
        const contextRoundsValue = document.getElementById('wbap-context-rounds-value');
        if (contextRoundsEl && contextRoundsValue) {
            const safeRounds = Number.isFinite(config.contextRounds) ? config.contextRounds : 5;
            contextRoundsEl.value = safeRounds;
            contextRoundsValue.textContent = safeRounds;
        }

        const chunkingEl = document.getElementById('wbap-enable-chunking');
        if (chunkingEl) {
            chunkingEl.checked = config.enableChunking === true;
        }

        const skipProcessedEl = document.getElementById('wbap-skip-processed');
        if (skipProcessedEl) {
            skipProcessedEl.checked = config.skipProcessedMessages !== false;
        }

        const showProgressPanelEl = document.getElementById('wbap-settings-progress-panel');
        if (showProgressPanelEl) {
            showProgressPanelEl.checked = config.showProgressPanel !== false;
        }

        const optimizationEl = document.getElementById('wbap-settings-plot-optimization');
        if (optimizationEl) {
            optimizationEl.checked = config.enablePlotOptimization === true;
        }
        const optimizationFabEl = document.getElementById('wbap-settings-plot-optimization-fab');
        if (optimizationFabEl) {
            optimizationFabEl.checked = config.enablePlotOptimizationFloatButton === true;
        }

        const optimizationPromptEl = document.getElementById('wbap-settings-optimization-prompt');
        if (optimizationPromptEl) {
            optimizationPromptEl.value = config.optimizationSystemPrompt || '';
        }
        const optimizationApiConfig = ensureOptimizationApiConfig(config);
        const optimizationUseEl = document.getElementById('wbap-optimization-use-independent');
        if (optimizationUseEl) {
            optimizationUseEl.checked = optimizationApiConfig.useIndependentProfile === true;
        }
        toggleOptimizationApiBlocks(optimizationApiConfig.useIndependentProfile === true);
        renderOptimizationEndpointOptions(optimizationApiConfig.selectedEndpointId);
        const optimizationUrlEl = document.getElementById('wbap-optimization-api-url');
        if (optimizationUrlEl) optimizationUrlEl.value = optimizationApiConfig.apiUrl || '';
        const optimizationKeyEl = document.getElementById('wbap-optimization-api-key');
        if (optimizationKeyEl) optimizationKeyEl.value = optimizationApiConfig.apiKey || '';
        const optimizationMaxTokensEl = document.getElementById('wbap-optimization-max-tokens');
        if (optimizationMaxTokensEl) optimizationMaxTokensEl.value = optimizationApiConfig.maxTokens || 4000;
        const optimizationTempEl = document.getElementById('wbap-optimization-temperature');
        if (optimizationTempEl) optimizationTempEl.value = optimizationApiConfig.temperature ?? 0.7;
        populateOptimizationModelSelect([], optimizationApiConfig.model || '');

        renderApiEndpoints();
        renderAggregatorControls();
        refreshPromptList();
        refreshSecondaryPromptUI();
    }

    function renderApiEndpoints() {
        const listContainer = document.getElementById('wbap-api-endpoint-list');
        if (!listContainer) return;

        const config = WBAP.CharacterManager.getCurrentCharacterConfig();
        const endpoints = config?.selectiveMode?.apiEndpoints || [];
        renderOptimizationEndpointOptions(config?.optimizationApiConfig?.selectedEndpointId || null);

        if (endpoints.length === 0) {
            listContainer.innerHTML = '<div class="wbap-empty-state"><p>没有API实例。请点击上方按钮添加一个。</p></div>';
            return;
        }

        listContainer.innerHTML = endpoints.map((ep) => `
            <div class="wbap-api-endpoint-item" data-id="${ep.id}">
                <div class="wbap-api-endpoint-header">
                    <label style="display:flex; gap:8px; align-items:center;">
                        <input type="checkbox" class="wbap-endpoint-enabled" data-id="${ep.id}" ${ep.enabled === false ? '' : 'checked'}>
                        <span>${ep.name}（${(Object.values(ep.assignedEntriesMap || {}).reduce((sum, arr) => sum + (arr?.length || 0), 0) || ep.assignedEntries?.length || 0)} 条，${(Array.isArray(ep.worldBooks) ? ep.worldBooks : (ep.worldBook ? [ep.worldBook] : ['未选择'])).join(', ')}）</span>
                    </label>
                    <div>
                        <button class="wbap-btn wbap-btn-icon wbap-btn-xs" onclick="window.wbapEditEndpoint('${ep.id}')" title="编辑API实例">
                            <i class="fa-solid fa-pencil"></i>
                        </button>
                        <button class="wbap-btn wbap-btn-icon wbap-btn-danger wbap-btn-xs" onclick="window.wbapDeleteEndpoint('${ep.id}')" title="删除">
                            <i class="fa-solid fa-trash"></i>
                        </button>
                    </div>
                </div>
            </div>
        `).join('');

        // 勾选状态变更
        listContainer.querySelectorAll('.wbap-endpoint-enabled').forEach(cb => {
            cb.addEventListener('change', (e) => {
                const id = e.currentTarget.dataset.id;
                const target = endpoints.find(item => item.id === id);
                if (target) {
                    target.enabled = e.currentTarget.checked;
                    WBAP.saveConfig();
                }
            });
        });

        renderAggregatorControls();
        refreshPromptList();
    }

    function renderAggregatorControls() {
        const cfg = WBAP.CharacterManager.getCurrentCharacterConfig();
        if (!cfg.aggregatorMode) {
            cfg.aggregatorMode = { enabled: false, endpointId: '', promptIndex: 0 };
        }

        const enabledEl = document.getElementById('wbap-agg-enabled');
        const endpointEl = document.getElementById('wbap-agg-endpoint');
        const promptEl = document.getElementById('wbap-agg-prompt');
        if (!enabledEl || !endpointEl || !promptEl) return;

        enabledEl.checked = cfg.aggregatorMode.enabled === true;

        const endpoints = cfg?.selectiveMode?.apiEndpoints || [];
        endpointEl.innerHTML = '';
        if (endpoints.length === 0) {
            endpointEl.innerHTML = '<option value=\"\">请先新增 API 实例</option>';
            endpointEl.disabled = true;
        } else {
            endpointEl.disabled = false;
            endpoints.forEach(ep => {
                const opt = document.createElement('option');
                opt.value = ep.id;
                opt.textContent = ep.name || ep.id;
                endpointEl.appendChild(opt);
            });
            endpointEl.value = cfg.aggregatorMode.endpointId || '';
        }

        const prompts = WBAP.PromptManager.getCombinedPrompts();
        promptEl.innerHTML = '';
        if (prompts.length === 0) {
            promptEl.innerHTML = '<option value=\"0\">暂无提示词</option>';
            promptEl.disabled = true;
        } else {
            promptEl.disabled = false;
            prompts.forEach((p, idx) => {
                const opt = document.createElement('option');
                opt.value = idx;
                opt.textContent = p.name || `预设${idx + 1}`;
                promptEl.appendChild(opt);
            });
            let idx = cfg.aggregatorMode.promptIndex || 0;
            if (idx >= prompts.length) idx = prompts.length - 1;
            promptEl.value = idx;
            cfg.aggregatorMode.promptIndex = idx;
        }
    }


    function refreshPromptList() {
        const selectEl = document.getElementById('wbap-prompt-preset-select');
        const descriptionArea = document.getElementById('wbap-prompt-description-area');
        const editBtn = document.getElementById('wbap-prompt-edit-btn');
        const exportBtn = document.getElementById('wbap-prompt-export-btn');
        const deleteBtn = document.getElementById('wbap-prompt-delete-btn');
        const bindingSummary = document.getElementById('wbap-prompt-binding-summary');
        const secondarySelect = document.getElementById('wbap-secondary-preset-select');
        const secondaryDesc = document.getElementById('wbap-secondary-description-area');
        if (!selectEl || !descriptionArea) return;

        // 确保从当前角色的配置读取
        const currentConfig = WBAP.CharacterManager ? WBAP.CharacterManager.getCurrentCharacterConfig() : WBAP.config;
        const prompts = WBAP.PromptManager.getCombinedPrompts();
        let selectedIndex = currentConfig.selectedPromptIndex || 0;
        const hasPrompts = prompts.length > 0;

        selectEl.disabled = !hasPrompts;
        editBtn.disabled = !hasPrompts;
        exportBtn.disabled = !hasPrompts;
        deleteBtn.disabled = !hasPrompts;
        if (secondarySelect) secondarySelect.disabled = !hasPrompts;

        if (!hasPrompts) {
            selectEl.innerHTML = '<option>无可用预设</option>';
            descriptionArea.textContent = '请新建或导入一个提示词预设。';
            if (bindingSummary) bindingSummary.textContent = '';
            if (secondarySelect) secondarySelect.innerHTML = '<option>无可用预设</option>';
            if (secondaryDesc) secondaryDesc.textContent = '请新建或导入一个提示词预设。';
            return;
        }

        if (selectedIndex >= prompts.length) {
            selectedIndex = prompts.length - 1;
            currentConfig.selectedPromptIndex = selectedIndex;
            // 同步更新全局 config
            if (WBAP.config !== currentConfig) {
                WBAP.config.selectedPromptIndex = selectedIndex;
            }
            WBAP.saveConfig();
        }

        selectEl.innerHTML = prompts.map((p, index) => `<option value="${index}">${p.name || `未命名预设 ${index + 1}`}</option>`).join('');
        selectEl.value = selectedIndex;
        descriptionArea.textContent = prompts[selectedIndex].description || '此预设没有描述。';
        if (bindingSummary) {
            const boundIds = Array.isArray(prompts[selectedIndex].boundEndpointIds) ? prompts[selectedIndex].boundEndpointIds.filter(Boolean) : [];
            const endpoints = currentConfig?.selectiveMode?.apiEndpoints || [];
            const nameMap = new Map(endpoints.map(ep => [ep.id, ep.name || ep.id]));
            if (boundIds.length === 0) {
                bindingSummary.textContent = '未绑定 API（将使用所有已配置实例）。';
            } else {
                const names = boundIds.map(id => nameMap.get(id) || id);
                bindingSummary.textContent = `已绑定 ${boundIds.length} 个 API：${names.join(', ')}`;
            }
        }
        const boundIdsMain = Array.isArray(prompts[selectedIndex].boundEndpointIds) ? prompts[selectedIndex].boundEndpointIds.filter(Boolean) : [];
        renderPromptBindingList(boundIdsMain);
        updatePromptBindingTags(boundIdsMain);
        refreshPromptVariables();

        // 副提示词下拉
        if (secondarySelect) {
            let secondaryIndex = currentConfig?.secondaryPrompt?.selectedPromptIndex ?? 0;
            if (secondaryIndex >= prompts.length) {
                secondaryIndex = prompts.length - 1;
                if (!currentConfig.secondaryPrompt) currentConfig.secondaryPrompt = { enabled: false, selectedPromptIndex: 0, boundEndpointIds: [] };
                currentConfig.secondaryPrompt.selectedPromptIndex = secondaryIndex;
                if (WBAP.config !== currentConfig) {
                    WBAP.config.secondaryPrompt = currentConfig.secondaryPrompt;
                }
                WBAP.saveConfig();
            }
            secondarySelect.innerHTML = prompts.map((p, index) => `<option value="${index}">${p.name || `未命名预设 ${index + 1}`}</option>`).join('');
            secondarySelect.value = secondaryIndex;
            if (secondaryDesc) {
                secondaryDesc.textContent = prompts[secondaryIndex]?.description || '此预设没有描述。';
            }
            refreshSecondaryPromptUI();
        }

        // 保证总局下拉实时同步最新提示词列表（含导入）
        renderAggregatorControls();
    }

    function refreshPromptVariables() {
        const container = document.getElementById('wbap-prompt-variables-container');
        if (!container) return;
        container.innerHTML = '';

        // 确保从当前角色的配置读取（角色切换后 WBAP.config 应该已经指向新角色的配置）
        const currentConfig = WBAP.CharacterManager ? WBAP.CharacterManager.getCurrentCharacterConfig() : WBAP.config;
        const combinedPrompts = WBAP.PromptManager.getCombinedPrompts();
        const selectedIndex = currentConfig.selectedPromptIndex ?? 0;
        const prompt = combinedPrompts?.[selectedIndex];
        if (!prompt || !prompt.name) return;
        const promptName = prompt.name;
        const variables = prompt.variables || {};

        const updateVariable = (key, value) => {
            const latestPrompts = WBAP.PromptManager.getCombinedPrompts();
            const latestPrompt = latestPrompts.find(p => p.name === promptName);
            if (!latestPrompt) return;
            const nextPrompt = {
                ...latestPrompt,
                variables: {
                    ...(latestPrompt.variables || {}),
                    [key]: value
                }
            };
            WBAP.PromptManager.addOrUpdatePrompt(nextPrompt);
            Logger.log(`变量 ${key} 已保存到角色配置: ${value}`);
        };

        for (let i = 1; i <= 4; i++) {
            const key = `sulv${i}`;
            const value = variables[key] || '';
            const item = document.createElement('div');
            item.className = 'wbap-variable-item';
            item.innerHTML = `<label for="wbap-var-${key}">${key}</label><input type="text" id="wbap-var-${key}" value="${value}" placeholder="变量 ${key} 的值">`;
            const inputEl = item.querySelector('input');
            inputEl.addEventListener('input', (e) => {
                updateVariable(key, e.target.value);
            });
            container.appendChild(item);
        }
    }

    function refreshSecondaryPromptUI() {
        const cfg = WBAP.CharacterManager ? WBAP.CharacterManager.getCurrentCharacterConfig() : WBAP.config;
        const prompts = WBAP.PromptManager.getCombinedPrompts();
        const secondarySelect = document.getElementById('wbap-secondary-preset-select');
        const secondaryDesc = document.getElementById('wbap-secondary-description-area');
        const secondaryEnabled = document.getElementById('wbap-secondary-enabled');
        const bindingList = document.getElementById('wbap-secondary-binding-list');
        if (!secondarySelect || !secondaryDesc || !secondaryEnabled) return;

        const hasPrompts = prompts.length > 0;
        secondarySelect.disabled = !hasPrompts;
        if (!hasPrompts) {
            secondaryDesc.textContent = '请新建或导入一个提示词预设。';
            updateSecondaryBindingSummary([]);
            if (bindingList) bindingList.innerHTML = '<small class="wbap-text-muted">暂无已配置的 API 实例。</small>';
            return;
        }

        if (!cfg.secondaryPrompt) {
            cfg.secondaryPrompt = { enabled: false, selectedPromptIndex: 0, boundEndpointIds: [] };
        }

        secondaryEnabled.checked = cfg.secondaryPrompt.enabled === true;

        let idx = cfg.secondaryPrompt.selectedPromptIndex ?? 0;
        if (idx >= prompts.length) {
            idx = prompts.length - 1;
            cfg.secondaryPrompt.selectedPromptIndex = idx;
            if (WBAP.config !== cfg) {
                WBAP.config.secondaryPrompt = cfg.secondaryPrompt;
            }
            WBAP.saveConfig();
        }
        secondarySelect.value = idx;
        secondaryDesc.textContent = prompts[idx]?.description || '此预设没有描述。';

        const boundIds = Array.isArray(cfg.secondaryPrompt.boundEndpointIds) ? cfg.secondaryPrompt.boundEndpointIds : [];
        renderSecondaryBindingList(boundIds);
        updateSecondaryBindingSummary(boundIds);
    }

    function updatePromptBindingTags(selectedIds = [], endpoints = null) {
        const tagsEl = document.getElementById('wbap-prompt-bound-apis');
        if (!tagsEl) return;
        const eps = endpoints || (WBAP.CharacterManager.getCurrentCharacterConfig()?.selectiveMode?.apiEndpoints || []);
        if (!selectedIds || selectedIds.length === 0) {
            tagsEl.innerHTML = '<small class="wbap-text-muted">未绑定（默认使用全部）</small>';
            return;
        }
        const map = new Map(eps.map(ep => [ep.id, ep.name || ep.id]));
        tagsEl.innerHTML = selectedIds.map(id => {
            const name = map.get(id) || id;
            return `<span class="wbap-tag" style="background: var(--wbap-bg-secondary, #2a2a3a); padding: 4px 8px; border-radius: 12px; display: inline-flex; align-items: center;">${name}</span>`;
        }).join('');
    }

    function updateSecondaryBindingSummary(selectedIds = []) {
        const summaryEl = document.getElementById('wbap-secondary-binding-summary');
        if (!summaryEl) return;
        const currentConfig = WBAP.CharacterManager.getCurrentCharacterConfig();
        const endpoints = currentConfig?.selectiveMode?.apiEndpoints || [];
        const map = new Map(endpoints.map(ep => [ep.id, ep.name || ep.id]));
        if (!selectedIds || selectedIds.length === 0) {
            summaryEl.textContent = '未绑定 API（将使用所有已配置实例）。';
            return;
        }
        const names = selectedIds.map(id => map.get(id) || id);
        summaryEl.textContent = `已绑定 ${selectedIds.length} 个 API：${names.join(', ')}`;
    }

    function renderSecondaryBindingList(selectedIds = []) {
        const listEl = document.getElementById('wbap-secondary-binding-list');
        if (!listEl) return;
        const currentConfig = WBAP.CharacterManager.getCurrentCharacterConfig();
        const endpoints = currentConfig?.selectiveMode?.apiEndpoints || [];
        const selected = new Set(selectedIds);
        if (endpoints.length === 0) {
            listEl.innerHTML = '<small class="wbap-text-muted">暂无已配置的 API 实例。</small>';
        } else {
            listEl.innerHTML = endpoints.map(ep => {
                const checked = selected.has(ep.id) ? 'checked' : '';
                return `<label style="display: flex; align-items: center; gap: 6px; margin-bottom: 6px;"><input type="checkbox" value="${ep.id}" ${checked}> <span>${ep.name || ep.id}</span></label>`;
            }).join('');
        }
    }

    function getSecondaryBindingSelection() {
        return Array.from(document.querySelectorAll('#wbap-secondary-binding-list input[type="checkbox"]:checked')).map(cb => cb.value);
    }

    function renderPromptBindingList(selectedIds = []) {
        const listEl = document.getElementById('wbap-prompt-binding-list');
        if (!listEl) return;
        const currentConfig = WBAP.CharacterManager.getCurrentCharacterConfig();
        const endpoints = currentConfig?.selectiveMode?.apiEndpoints || [];
        const selected = new Set(selectedIds);
        if (endpoints.length === 0) {
            listEl.innerHTML = '<small class="wbap-text-muted">暂无已配置的 API 实例。</small>';
        } else {
            listEl.innerHTML = endpoints.map(ep => {
                const checked = selected.has(ep.id) ? 'checked' : '';
                return `<label style="display: flex; align-items: center; gap: 6px; margin-bottom: 6px;"><input type="checkbox" value="${ep.id}" ${checked}> <span>${ep.name || ep.id}</span></label>`;
            }).join('');
        }
        listEl.style.display = 'none';
        updatePromptBindingTags(selectedIds, endpoints);
    }

    function getPromptBindingSelection() {
        return Array.from(document.querySelectorAll('#wbap-prompt-binding-list input[type="checkbox"]:checked')).map(cb => cb.value);
    }

    function bindEditorEvents() {
        document.getElementById('wbap-prompt-editor-close')?.addEventListener('click', closePromptEditor);
        document.getElementById('wbap-prompt-editor-cancel')?.addEventListener('click', closePromptEditor);
        document.getElementById('wbap-prompt-editor-save')?.addEventListener('click', savePrompt);

        // 占位符按钮点击插入
        const placeholderButtons = document.querySelectorAll('.wbap-placeholder-btn');
        placeholderButtons.forEach(btn => {
            btn.addEventListener('click', (e) => {
                const placeholder = e.target.dataset.placeholder;
                const activeElement = document.activeElement;
                if (activeElement && (activeElement.id === 'wbap-prompt-edit-system' || activeElement.id === 'wbap-prompt-edit-main' || activeElement.id === 'wbap-prompt-edit-final-directive')) {
                    const start = activeElement.selectionStart;
                    const end = activeElement.selectionEnd;
                    const text = activeElement.value;
                    activeElement.value = text.substring(0, start) + placeholder + text.substring(end);
                    activeElement.selectionStart = activeElement.selectionEnd = start + placeholder.length;
                    activeElement.focus();
                    updateCharCounts();
                    updatePreview();
                }
            });
        });

        // 字符计数
        const finalDirectiveTextarea = document.getElementById('wbap-prompt-edit-final-directive');
        const systemTextarea = document.getElementById('wbap-prompt-edit-system');
        const mainTextarea = document.getElementById('wbap-prompt-edit-main');

        if (finalDirectiveTextarea) {
            finalDirectiveTextarea.addEventListener('input', () => {
                updateCharCounts();
                updatePreview();
            });
        }
        if (systemTextarea) {
            systemTextarea.addEventListener('input', () => {
                updateCharCounts();
                updatePreview();
            });
        }
        if (mainTextarea) {
            mainTextarea.addEventListener('input', () => {
                updateCharCounts();
                updatePreview();
            });
        }

        // 预览按钮
        document.getElementById('wbap-prompt-preview-btn')?.addEventListener('click', updatePreview);

        // 变量输入框变化时更新预览
        ['wbap-edit-var-sulv1', 'wbap-edit-var-sulv2', 'wbap-edit-var-sulv3', 'wbap-edit-var-sulv4'].forEach(id => {
            document.getElementById(id)?.addEventListener('input', updatePreview);
        });

    }

    function closePromptEditor() {
        document.getElementById('wbap-prompt-editor-modal')?.classList.remove('open');
        syncMobileRootFix();
    }

    function updateCharCounts() {
        const finalDirectiveTextarea = document.getElementById('wbap-prompt-edit-final-directive');
        const systemTextarea = document.getElementById('wbap-prompt-edit-system');
        const mainTextarea = document.getElementById('wbap-prompt-edit-main');
        const finalDirectiveCount = document.getElementById('wbap-final-directive-char-count');
        const systemCount = document.getElementById('wbap-system-char-count');
        const mainCount = document.getElementById('wbap-main-char-count');

        if (finalDirectiveTextarea && finalDirectiveCount) {
            finalDirectiveCount.textContent = `${finalDirectiveTextarea.value.length} 字符`;
        }
        if (systemTextarea && systemCount) {
            systemCount.textContent = `${systemTextarea.value.length} 字符`;
        }
        if (mainTextarea && mainCount) {
            mainCount.textContent = `${mainTextarea.value.length} 字符`;
        }
    }

    function updatePreview() {
        const previewEl = document.getElementById('wbap-prompt-preview');
        if (!previewEl) return;

        const finalDirective = document.getElementById('wbap-prompt-edit-final-directive')?.value || '';
        const systemPrompt = document.getElementById('wbap-prompt-edit-system')?.value || '';
        const mainPrompt = document.getElementById('wbap-prompt-edit-main')?.value || '';
        const var1 = document.getElementById('wbap-edit-var-sulv1')?.value || '';
        const var2 = document.getElementById('wbap-edit-var-sulv2')?.value || '';
        const var3 = document.getElementById('wbap-edit-var-sulv3')?.value || '';
        const var4 = document.getElementById('wbap-edit-var-sulv4')?.value || '';

        const replacePlaceholders = (text) => text
            .replace(/{worldbook_content}/g, '[世界书内容示例...]')
            .replace(/{context}/g, '[对话上下文示例...]')
            .replace(/{user_input}/g, '[用户输入示例...]')
            .replace(/{previous_results}/g, '[一次处理结果示例...]')
            .replace(/{sulv1}/g, var1 || '[sulv1]')
            .replace(/{sulv2}/g, var2 || '[sulv2]')
            .replace(/{sulv3}/g, var3 || '[sulv3]')
            .replace(/{sulv4}/g, var4 || '[sulv4]');

        let previewFinalDirective = replacePlaceholders(finalDirective);
        let previewSystem = replacePlaceholders(systemPrompt);
        let previewMain = replacePlaceholders(mainPrompt);

        const finalSystemPreview = (previewFinalDirective ? previewFinalDirective + '\n' : '') + previewSystem;

        previewEl.innerHTML = `<strong style="color: var(--wbap-primary);">Final System Prompt (pre-pended):</strong>\n${previewFinalDirective || '(空)'}\n\n<strong style="color: var(--wbap-primary);">System Prompt:</strong>\n${previewSystem || '(空)'}\n\n<strong style="color: var(--wbap-primary);">Main Prompt:</strong>\n${previewMain || '(空)'}`;
    }

    function savePrompt() {
        const index = parseInt(document.getElementById('wbap-prompt-edit-index').value);
        const name = document.getElementById('wbap-prompt-edit-name').value.trim();
        if (!name) {
            alert('模板名称不能为空。');
            return;
        }

        // 获取现有提示词以保留变量值
        const currentConfig = WBAP.CharacterManager.getCurrentCharacterConfig();
        const existingPrompts = currentConfig.prompts || [];
        const existingPrompt = index >= 0 && index < existingPrompts.length ? existingPrompts[index] : null;
        if (index >= 0 && existingPrompt?.name && existingPrompt.name !== name) {
            WBAP.PromptManager.deletePrompt(existingPrompt.name);
        }

        // 保留现有变量值，或使用编辑器中的默认值
        const existingVariables = existingPrompt?.variables || {};
        const newVariables = {
            sulv1: document.getElementById('wbap-edit-var-sulv1')?.value || existingVariables.sulv1 || '',
            sulv2: document.getElementById('wbap-edit-var-sulv2')?.value || existingVariables.sulv2 || '',
            sulv3: document.getElementById('wbap-edit-var-sulv3')?.value || existingVariables.sulv3 || '',
            sulv4: document.getElementById('wbap-edit-var-sulv4')?.value || existingVariables.sulv4 || '',
        };
        const boundEndpointIds = getPromptBindingSelection();

        const newPromptData = {
            name: name,
            version: document.getElementById('wbap-prompt-edit-version').value,
            description: document.getElementById('wbap-prompt-edit-description').value,
            finalSystemDirective: document.getElementById('wbap-prompt-edit-final-directive').value,
            systemPrompt: document.getElementById('wbap-prompt-edit-system').value,
            mainPrompt: document.getElementById('wbap-prompt-edit-main').value,
            variables: newVariables,
            boundEndpointIds: boundEndpointIds
        };

        WBAP.PromptManager.addOrUpdatePrompt(newPromptData);

        // 更新选中项
        const newPrompts = WBAP.PromptManager.getCombinedPrompts();
        const newIndex = newPrompts.findIndex(p => p.name === name);
        if (newIndex > -1) {
            currentConfig.selectedPromptIndex = newIndex;
            WBAP.saveConfig();
        }
        refreshPromptList();
        closePromptEditor();
    }

    function exportCurrentPrompt() {
        const currentConfig = WBAP.CharacterManager.getCurrentCharacterConfig();
        const prompts = WBAP.PromptManager.getCombinedPrompts();
        const selectedPromptIndex = currentConfig.selectedPromptIndex ?? 0;
        const prompt = prompts?.[selectedPromptIndex];
        if (!prompt) {
            alert('没有可导出的提示词。');
            return;
        }
        const dataStr = JSON.stringify(prompt, null, 2);
        const blob = new Blob([dataStr], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        const fileName = (prompt.name || 'prompt').replace(/[^a-z0-9]/gi, '_').toLowerCase();
        a.href = url;
        a.download = `${fileName}.json`;
        a.click();
        URL.revokeObjectURL(url);
    }

    // ========== Progress Panel Control ==========
    let progressTimer = null;
    let progressStartTime = 0;

    function showProgressPanel(message = '正在处理...') {
        const panel = document.getElementById('wbap-progress-panel');
        if (!panel) return;

        // Reset state
        const titleEl = document.getElementById('wbap-progress-title');
        const barEl = document.getElementById('wbap-progress-bar');
        const statusEl = document.getElementById('wbap-progress-status');
        const timerEl = document.getElementById('wbap-progress-timer');

        if (titleEl) titleEl.textContent = message;
        if (barEl) {
            barEl.style.width = '0%';
            barEl.classList.add('animated');
        }
        if (statusEl) statusEl.textContent = '0%';
        if (timerEl) timerEl.textContent = '00:00';

        panel.classList.add('open');

        // Start timer
        if (progressTimer) clearInterval(progressTimer);
        progressStartTime = Date.now();
        progressTimer = setInterval(() => {
            const elapsed = Date.now() - progressStartTime;
            const seconds = (elapsed / 1000).toFixed(1);
            if (timerEl) timerEl.textContent = `${seconds}s`;
        }, 100);
    }

    function updateProgressPanel(percent, statusText) {
        const bar = document.getElementById('wbap-progress-bar');
        const status = document.getElementById('wbap-progress-status');
        if (bar) {
            bar.style.width = `${Math.min(100, Math.max(0, percent))}%`;
            if (percent >= 100) bar.classList.remove('animated');
        }
        if (status && statusText) {
            status.textContent = statusText;
        }
    }

    function hideProgressPanel() {
        const panel = document.getElementById('wbap-progress-panel');
        if (panel) {
            panel.classList.remove('open');
        }
        if (progressTimer) {
            clearInterval(progressTimer);
            progressTimer = null;
        }
    }

    function makeElementDraggable(element, handle) {
        let pos1 = 0, pos2 = 0, pos3 = 0, pos4 = 0;
        const dragHandle = handle || element;
        dragHandle.style.cursor = 'move';

        dragHandle.onmousedown = dragMouseDown;
        dragHandle.ontouchstart = dragMouseDown;

        function dragMouseDown(e) {
            // Optional: ignore if clicking buttons/inputs
            if (['BUTTON', 'INPUT', 'TEXTAREA', 'SELECT'].includes(e.target.tagName)) return;

            e = e || window.event;
            // Get the mouse cursor position at startup:
            const clientX = e.touches ? e.touches[0].clientX : e.clientX;
            const clientY = e.touches ? e.touches[0].clientY : e.clientY;

            // On first drag, we need to convert CSS simplified positioning to absolute coordinates
            const rect = element.getBoundingClientRect();
            element.style.left = rect.left + 'px';
            element.style.top = rect.top + 'px';
            element.style.right = 'auto'; // Disable centering
            element.style.bottom = 'auto';
            element.style.margin = '0'; // Disable centering margins
            element.style.transform = 'none'; // Disable transform centering if any

            pos3 = clientX;
            pos4 = clientY;

            document.onmouseup = closeDragElement;
            document.onmousemove = elementDrag;
            document.ontouchend = closeDragElement;
            document.ontouchmove = elementDrag;
        }

        function elementDrag(e) {
            e = e || window.event;
            // Prevent default only if needed (e.g. scrolling on mobile while dragging)
            // e.preventDefault(); 

            const clientX = e.touches ? e.touches[0].clientX : e.clientX;
            const clientY = e.touches ? e.touches[0].clientY : e.clientY;

            // Calculate the new cursor position:
            pos1 = pos3 - clientX;
            pos2 = pos4 - clientY;
            pos3 = clientX;
            pos4 = clientY;

            // Set the element's new position:
            element.style.top = (element.offsetTop - pos2) + "px";
            element.style.left = (element.offsetLeft - pos1) + "px";
        }

        function closeDragElement() {
            // Stop moving when mouse button is released:
            document.onmouseup = null;
            document.onmousemove = null;
            document.ontouchend = null;
            document.ontouchmove = null;
        }
    }

    function makeElementResizable(element, handle) {
        let startX, startY, startWidth, startHeight;

        handle.onmousedown = initDrag;
        handle.ontouchstart = initDrag;

        function initDrag(e) {
            // Stop propagation to prevent dragging the panel when resizing
            e.stopPropagation();

            e = e || window.event;
            startX = e.touches ? e.touches[0].clientX : e.clientX;
            startY = e.touches ? e.touches[0].clientY : e.clientY;

            const rect = element.getBoundingClientRect();
            startWidth = rect.width;
            startHeight = rect.height;

            document.documentElement.addEventListener('mousemove', doDrag, false);
            document.documentElement.addEventListener('mouseup', stopDrag, false);
            document.documentElement.addEventListener('touchmove', doDrag, { passive: false });
            document.documentElement.addEventListener('touchend', stopDrag, false);
        }

        function doDrag(e) {
            e.preventDefault(); // Prevent scrolling
            e = e || window.event;
            const clientX = e.touches ? e.touches[0].clientX : e.clientX;
            const clientY = e.touches ? e.touches[0].clientY : e.clientY;

            const newWidth = startWidth + (clientX - startX);
            const newHeight = startHeight + (clientY - startY);

            // Apply new dimensions (CSS min-width/height will constrain this automatically if set)
            element.style.width = newWidth + 'px';
            element.style.height = newHeight + 'px';
            element.style.maxWidth = 'none'; // Allow growing beyond initial max-width
            element.style.maxHeight = 'none';
        }

        function stopDrag() {
            document.documentElement.removeEventListener('mousemove', doDrag, false);
            document.documentElement.removeEventListener('mouseup', stopDrag, false);
            document.documentElement.removeEventListener('touchmove', doDrag, false);
            document.documentElement.removeEventListener('touchend', stopDrag, false);
        }
    }

    function bindProgressPanelEvents() {
        const panel = document.getElementById('wbap-progress-panel');
        if (panel) {
            // Make the entire panel draggable
            makeElementDraggable(panel);

            // Make resizable
            const handle = document.getElementById('wbap-progress-resize-handle');
            if (handle) {
                makeElementResizable(panel, handle);
            }

            // Close button
            const closeBtn = document.getElementById('wbap-progress-close');
            if (closeBtn) {
                closeBtn.addEventListener('click', hideProgressPanel);
            }
        }
    }

    // Expose functions global
    window.WBAP.UI = {
        injectUI,
        renderApiEndpoints,
        loadSettingsToUI,
        refreshPromptList,
        refreshSecondaryPromptUI,
        showProgressPanel,
        updateProgressPanel,
        hideProgressPanel
    };
    window.WBAP.syncMobileRootFix = syncMobileRootFix;

    window.wbapEditPrompt = (index) => {
        const editorModal = document.getElementById('wbap-prompt-editor-modal');
        if (!editorModal) return;
        document.getElementById('wbap-prompt-edit-index').value = index;
        let boundIds = [];

        if (index === -1) {
            // 新建模式
            document.getElementById('wbap-prompt-edit-name').value = '';
            document.getElementById('wbap-prompt-edit-version').value = '';
            document.getElementById('wbap-prompt-edit-description').value = '';
            document.getElementById('wbap-prompt-edit-final-directive').value = '';
            document.getElementById('wbap-prompt-edit-system').value = '';
            document.getElementById('wbap-prompt-edit-main').value = '';
            document.getElementById('wbap-edit-var-sulv1').value = '';
            document.getElementById('wbap-edit-var-sulv2').value = '';
            document.getElementById('wbap-edit-var-sulv3').value = '';
            document.getElementById('wbap-edit-var-sulv4').value = '';
            editorModal.querySelector('h3').textContent = '新建提示词模板';
        } else {
            // 编辑模式
            const currentConfig = WBAP.CharacterManager.getCurrentCharacterConfig();
            const combined = WBAP.PromptManager.getCombinedPrompts();
            const selectedPrompt = combined?.[index];
            if (!selectedPrompt) return;
            const userPrompts = currentConfig.prompts || [];
            const userIndex = userPrompts.findIndex(p => p.name === selectedPrompt.name);
            const prompt = userIndex >= 0 ? userPrompts[userIndex] : selectedPrompt;
            // 使用用户提示词索引（若不存在则作为新建保存回用户列表）
            document.getElementById('wbap-prompt-edit-index').value = userIndex;
            if (!prompt) return;
            document.getElementById('wbap-prompt-edit-name').value = prompt.name || '';
            document.getElementById('wbap-prompt-edit-version').value = prompt.version || '';
            document.getElementById('wbap-prompt-edit-description').value = prompt.description || '';
            document.getElementById('wbap-prompt-edit-final-directive').value = prompt.finalSystemDirective || '';
            document.getElementById('wbap-prompt-edit-system').value = prompt.systemPrompt || '';
            document.getElementById('wbap-prompt-edit-main').value = prompt.mainPrompt || '';

            // 加载变量值（如果有）
            const vars = prompt.variables || {};
            document.getElementById('wbap-edit-var-sulv1').value = vars.sulv1 || '';
            document.getElementById('wbap-edit-var-sulv2').value = vars.sulv2 || '';
            document.getElementById('wbap-edit-var-sulv3').value = vars.sulv3 || '';
            document.getElementById('wbap-edit-var-sulv4').value = vars.sulv4 || '';
            boundIds = Array.isArray(prompt.boundEndpointIds) ? prompt.boundEndpointIds : [];

            editorModal.querySelector('h3').textContent = '编辑提示词模板';
        }

        renderPromptBindingList(boundIds);

        // 更新字符计数和预览
        updateCharCounts();
        updatePreview();

        editorModal.classList.add('open');
        syncMobileRootFix();

        // 聚焦到名称输入框
        setTimeout(() => {
            document.getElementById('wbap-prompt-edit-name')?.focus();
        }, 100);
    };
    window.wbapDeletePrompt = (index) => {
        const prompts = WBAP.PromptManager.getCombinedPrompts();
        const promptToDelete = prompts[index];
        if (!promptToDelete) return;

        if (confirm(`确定要删除提示词 "${promptToDelete.name}" 吗？`)) {
            WBAP.PromptManager.deletePrompt(promptToDelete.name);
            // After deleting, the selected index might be out of bounds.
            const currentConfig = WBAP.CharacterManager ? WBAP.CharacterManager.getCurrentCharacterConfig() : WBAP.config;
            const newPrompts = WBAP.PromptManager.getCombinedPrompts();
            if (currentConfig.selectedPromptIndex >= newPrompts.length) {
                currentConfig.selectedPromptIndex = Math.max(0, newPrompts.length - 1);
                // 同步更新全局 config
                if (WBAP.config !== currentConfig) {
                    WBAP.config.selectedPromptIndex = currentConfig.selectedPromptIndex;
                }
                WBAP.saveConfig();
            }
            refreshPromptList();
        }
    };

    window.wbapDeleteEndpoint = (id) => {
        const endpoints = WBAP.config.selectiveMode.apiEndpoints;
        const index = endpoints.findIndex(ep => ep.id === id);
        if (index > -1 && confirm('确定要删除这个API实例吗？')) {
            endpoints.splice(index, 1);
            WBAP.saveConfig();
            renderApiEndpoints();
        }
    };

    // ========== API 实例编辑辅助 ==========
    let currentEditingEndpoint = null;

    function normalizeEndpointStructure(endpoint) {
        if (!Array.isArray(endpoint.worldBooks)) {
            const wb = endpoint.worldBook || '';
            endpoint.worldBooks = wb ? [wb] : [];
        }
        if (endpoint.topP == null) endpoint.topP = 1;
        if (endpoint.presencePenalty == null) endpoint.presencePenalty = 0;
        if (endpoint.frequencyPenalty == null) endpoint.frequencyPenalty = 0;
        if (endpoint.maxRetries == null) endpoint.maxRetries = 1;
        if (endpoint.retryDelayMs == null) endpoint.retryDelayMs = 800;
        if (endpoint.enabled === undefined) {
            endpoint.enabled = true;
        }
        if (!endpoint.assignedEntriesMap) {
            endpoint.assignedEntriesMap = {};
            if (endpoint.worldBooks.length && Array.isArray(endpoint.assignedEntries)) {
                endpoint.assignedEntriesMap[endpoint.worldBooks[0]] = endpoint.assignedEntries;
            }
        }
        delete endpoint.worldBook;
        delete endpoint.assignedEntries;
    }

    function renderSelectedWorldbooks(endpoint) {
        const container = document.getElementById('wbap-endpoint-selected-worldbooks');
        if (!container) return;
        if (!endpoint.worldBooks || endpoint.worldBooks.length === 0) {
            container.innerHTML = '<small class="wbap-text-muted">尚未选择世界书</small>';
            return;
        }
        container.innerHTML = endpoint.worldBooks.map(name => `
            <span class="wbap-tag" style="background: var(--wbap-bg-secondary, #2a2a3a); padding: 4px 8px; border-radius: 12px; display: inline-flex; align-items: center; gap: 6px;">
                <span>${name}</span>
                <button type="button" data-remove-book="${name}" class="wbap-btn wbap-btn-xs wbap-btn-icon" style="padding: 0 6px;">&times;</button>
            </span>
        `).join('');
    }

    // Helpers to detect and normalize table-style worldbooks (UI layer)
    function uiIsTableWorldBook(book) {
        if (!book || !book.entries) return false;
        const entries = Object.values(book.entries).filter(e => e && e.disable !== true);
        if (entries.length === 0) return false;
        const comments = entries.map(e => e.comment || '');
        const indexCount = comments.filter(c => /Index\s+for\s+/i.test(c)).length;
        const detailPatternCount = comments.filter(c => /Detail:\s*.+?-/.test(c)).length;
        const columnCounts = {};
        comments.forEach((c, idx) => {
            const col = uiNormalizeColumnName(c, String(idx));
            columnCounts[col] = (columnCounts[col] || 0) + 1;
        });
        const repeatedColumns = Object.values(columnCounts).filter(n => n >= 2).length;
        if (indexCount >= 3) return true;
        if (detailPatternCount >= 5 && repeatedColumns >= 3) return true;
        return false;
    }

    function uiNormalizeColumnName(comment = '', fallbackId = '') {
        const trimmed = (comment || '').trim();
        const fallback = '未命名栏目';
        if (!trimmed) return fallback;
        const detailMatch = trimmed.match(/Detail:\s*([^-]+?)(\s*-\s*.*)?$/i);
        if (detailMatch) return detailMatch[1].trim() || fallback;
        const indexMatch = trimmed.match(/Index\s+for\s+(.+?)$/i);
        if (indexMatch) return indexMatch[1].trim() || fallback;
        const bracketMatch = trimmed.match(/【([^】]+)】/);
        if (bracketMatch) return bracketMatch[1].trim() || fallback;
        const parts = trimmed.split(/\s*-\s*/);
        if (parts.length > 1) return parts[0].trim() || fallback;
        return trimmed || fallbackId || fallback;
    }

    async function displayEntriesForBook(bookName, endpoint) {
        const entryList = document.getElementById('wbap-endpoint-edit-entry-list');
        if (!entryList) return;

        // Visually mark the selected book
        document.querySelectorAll('#wbap-endpoint-book-list-container .wbap-book-item').forEach(item => {
            item.classList.remove('active');
        });
        const bookItem = document.querySelector(`#wbap-endpoint-book-list-container .wbap-book-item[data-book-name="${bookName}"]`);
        if (bookItem) {
            bookItem.classList.add('active');
        }

        entryList.innerHTML = '<p class="wbap-text-muted" style="text-align: center;"><i class="fa-solid fa-spinner fa-spin"></i> 正在加载条目...</p>';

        const book = await WBAP.loadWorldBookEntriesByName(bookName);
        if (!book || !book.entries) {
            entryList.innerHTML = `<p style="color: var(--wbap-danger); text-align: center;">加载世界书 ${bookName} 失败</p>`;
            return;
        }

        const selected = new Set(endpoint.assignedEntriesMap?.[bookName] || []);
        const entries = Object.entries(book.entries).filter(([uid, entry]) => entry.disable !== true);

        if (entries.length === 0) {
            entryList.innerHTML = `<p class="wbap-text-muted" style="text-align: center; font-size: 12px;">此世界书没有启用的条目</p>`;
            return;
        }

        // Table-style worldbook: show one checkbox per column (栏目汇总)
        if (uiIsTableWorldBook(book)) {
            const selectedColumns = new Set();
            selected.forEach(id => {
                const entry = book.entries?.[id];
                if (entry) {
                    selectedColumns.add(uiNormalizeColumnName(entry.comment, id));
                }
            });
            const columnBest = new Map();
            entries.forEach(([uid, entry]) => {
                const colName = uiNormalizeColumnName(entry.comment, uid);
                const isIndex = /Index\s+for\s+/i.test(entry.comment || '');
                const len = (entry.content || '').length;
                const existing = columnBest.get(colName);
                if (!existing) {
                    columnBest.set(colName, { uid, isIndex, len });
                } else if (!existing.isIndex && isIndex) {
                    columnBest.set(colName, { uid, isIndex, len });
                } else if (existing.isIndex === isIndex && len > existing.len) {
                    columnBest.set(colName, { uid, isIndex, len });
                }
            });

            const items = Array.from(columnBest.entries()).map(([colName, info]) => {
                const uid = info.uid;
                const checked = selectedColumns.has(colName) ? 'checked' : '';
                const badge = info.isIndex ? '<span class="wbap-badge">Index</span>' : '';
                return `<label class="wbap-entry-item"><input type="checkbox" data-book="${bookName}" value="${uid}" ${checked}> ${colName} ${badge}</label>`;
            }).join('');
            entryList.innerHTML = items;
            return;
        }

        // Default: list all entries
        const items = entries.map(([uid, entry]) => {
            const title = entry.comment || `条目 ${uid.substring(0, 6)}`;
            const checked = selected.has(uid) ? 'checked' : '';
            return `<label class="wbap-entry-item"><input type="checkbox" data-book="${bookName}" value="${uid}" ${checked}> ${title}</label>`;
        }).join('');

        entryList.innerHTML = items;
    }

    // New function to render the list of worldbooks
    function renderWorldBookList(endpoint) {
        const bookListContainer = document.getElementById('wbap-endpoint-book-list-container');
        const entryListContainer = document.getElementById('wbap-endpoint-edit-entry-list');

        if (!bookListContainer || !entryListContainer) return;

        bookListContainer.innerHTML = ''; // Clear previous list
        entryListContainer.innerHTML = '<p class="wbap-text-muted" style="text-align: center; font-size: 12px;">请从左侧选择一本世界书</p>'; // Reset entry list

        if (!endpoint.worldBooks || endpoint.worldBooks.length === 0) {
            bookListContainer.innerHTML = '<p class="wbap-text-muted" style="padding: 8px; text-align: center; font-size: 12px;">请先添加世界书</p>';
            return;
        }

        endpoint.worldBooks.forEach(bookName => {
            const bookItem = document.createElement('div');
            bookItem.className = 'wbap-book-item';
            bookItem.textContent = bookName;
            bookItem.dataset.bookName = bookName;
            bookItem.addEventListener('click', () => displayEntriesForBook(bookName, endpoint));
            bookListContainer.appendChild(bookItem);
        });

        // Automatically select the first book
        if (endpoint.worldBooks.length > 0) {
            displayEntriesForBook(endpoint.worldBooks[0], endpoint);
        }
    }

    function bindEndpointEditorEvents() {
        document.getElementById('wbap-endpoint-editor-close').addEventListener('click', () => {
            document.getElementById('wbap-endpoint-editor-modal').classList.remove('open');
            syncMobileRootFix();
        });
        document.getElementById('wbap-endpoint-editor-save').addEventListener('click', saveEndpoint);

        // Test Connection button
        document.getElementById('wbap-endpoint-test-btn').addEventListener('click', async () => {
            const resultEl = document.getElementById('wbap-endpoint-test-result');
            resultEl.textContent = '测试中...';
            resultEl.style.color = 'inherit';

            const tempConfig = {
                apiUrl: document.getElementById('wbap-endpoint-edit-url').value,
                apiKey: document.getElementById('wbap-endpoint-edit-key').value,
                model: document.getElementById('wbap-endpoint-edit-model').value,
                maxTokens: parseInt(document.getElementById('wbap-endpoint-edit-max-tokens').value) || 2000,
                temperature: parseFloat(document.getElementById('wbap-endpoint-edit-temperature').value) || 0.7,
            };

            const result = await WBAP.testEndpointConnection(tempConfig);
            if (result.success) {
                resultEl.textContent = result.message;
                resultEl.style.color = 'var(--wbap-success, #28a745)';
            } else {
                resultEl.textContent = `失败: ${result.message}`;
                resultEl.style.color = 'var(--wbap-danger, #dc3545)';
            }
        });

        // Fetch Models button
        document.getElementById('wbap-endpoint-fetch-models-btn').addEventListener('click', async (e) => {
            const btn = e.currentTarget;
            btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i>';
            btn.disabled = true;

            const tempConfig = {
                apiUrl: document.getElementById('wbap-endpoint-edit-url').value,
                apiKey: document.getElementById('wbap-endpoint-edit-key').value,
            };

            const result = await WBAP.fetchEndpointModels(tempConfig);
            if (result.success) {
                const modelSelect = document.getElementById('wbap-endpoint-edit-model');

                if (modelSelect) {
                    const currentModel = modelSelect.value;
                    modelSelect.innerHTML = ''; // Clear existing options
                    result.models.forEach(model => {
                        const option = document.createElement('option');
                        option.value = model;
                        option.textContent = model;
                        if (model === currentModel) {
                            option.selected = true;
                        }
                        modelSelect.appendChild(option);
                    });
                    if (!modelSelect.value && result.models.length > 0) {
                        modelSelect.selectedIndex = 0;
                    }
                }
            } else {
                alert(`获取模型失败: ${result.message}`);
            }

            btn.innerHTML = '获取模型';
            btn.disabled = false;
        });

        document.getElementById('wbap-endpoint-entries-select-all')?.addEventListener('click', () => {
            const checkboxes = document.querySelectorAll('#wbap-endpoint-edit-entry-list input[type="checkbox"]');
            if (checkboxes.length === 0 || !currentEditingEndpoint) return;

            const bookName = checkboxes[0].dataset.book;
            const newIds = [];
            checkboxes.forEach(cb => {
                cb.checked = true;
                newIds.push(cb.value);
            });

            if (bookName) {
                if (!currentEditingEndpoint.assignedEntriesMap[bookName]) {
                    currentEditingEndpoint.assignedEntriesMap[bookName] = [];
                }
                // Add all new IDs to the set (handling potential duplicates if any, though map replace is safer)
                // Since we selected ALL visible entries for this book, and this list usually represents the *entire* list for this book,
                // we can just set the map to these IDs? 
                // Wait, renderWorldBookList filters entries? 
                // Step 346 shows it might filter by columns ("best version of each entry").
                // So we should probably merge with existing if the list is partial, or replace if it's full.
                // But checking line 1562 in Step 346, it iterates `columnBest.entries()`. It seems to show all unique UIDs for the book.
                // So replacing the list for this book with these IDs is correct.
                // BUT, to be safe against partial rendering (if any), let's use a Set merge.

                const currentIds = new Set(currentEditingEndpoint.assignedEntriesMap[bookName]);
                newIds.forEach(id => currentIds.add(id));
                currentEditingEndpoint.assignedEntriesMap[bookName] = Array.from(currentIds);
                Logger.log(`全选已应用: 世界书=${bookName}, 总计=${currentEditingEndpoint.assignedEntriesMap[bookName].length}条`);
            }
        });

        document.getElementById('wbap-endpoint-entries-clear')?.addEventListener('click', () => {
            const checkboxes = document.querySelectorAll('#wbap-endpoint-edit-entry-list input[type="checkbox"]');
            if (checkboxes.length === 0 || !currentEditingEndpoint) return;

            const bookName = checkboxes[0].dataset.book;
            const idsToRemove = new Set();
            checkboxes.forEach(cb => {
                cb.checked = false;
                idsToRemove.add(cb.value);
            });

            if (bookName && currentEditingEndpoint.assignedEntriesMap[bookName]) {
                currentEditingEndpoint.assignedEntriesMap[bookName] = currentEditingEndpoint.assignedEntriesMap[bookName].filter(id => !idsToRemove.has(id));
                Logger.log(`清空已应用: 世界书=${bookName}, 剩余=${currentEditingEndpoint.assignedEntriesMap[bookName].length}条`);
            }
        });

        // Temperature slider
        document.getElementById('wbap-endpoint-edit-temperature').addEventListener('input', (e) => {
            const valueEl = document.getElementById('wbap-endpoint-edit-temperature-value');
            if (valueEl) valueEl.textContent = e.target.value;
        });

        document.getElementById('wbap-endpoint-add-worldbook').addEventListener('click', () => {
            const select = document.getElementById('wbap-endpoint-edit-worldbook-select');
            if (!select || !currentEditingEndpoint) return;
            const bookName = select.value;
            if (!bookName) {
                alert('请先选择一个世界书');
                return;
            }
            if (!currentEditingEndpoint.worldBooks.includes(bookName)) {
                currentEditingEndpoint.worldBooks.push(bookName);
            }
            if (!currentEditingEndpoint.assignedEntriesMap[bookName]) {
                currentEditingEndpoint.assignedEntriesMap[bookName] = [];
            }
            renderSelectedWorldbooks(currentEditingEndpoint);
            renderWorldBookList(currentEditingEndpoint);
        });

        document.getElementById('wbap-endpoint-selected-worldbooks').addEventListener('click', (e) => {
            const btn = e.target.closest('[data-remove-book]');
            if (!btn || !currentEditingEndpoint) return;
            const bookName = btn.dataset.removeBook;
            currentEditingEndpoint.worldBooks = currentEditingEndpoint.worldBooks.filter(n => n !== bookName);
            delete currentEditingEndpoint.assignedEntriesMap[bookName];
            renderSelectedWorldbooks(currentEditingEndpoint);
            renderWorldBookList(currentEditingEndpoint);
        });

        document.getElementById('wbap-endpoint-edit-entry-list').addEventListener('change', (e) => {
            if (e.target.type === 'checkbox' && currentEditingEndpoint) {
                const bookName = e.target.dataset.book;
                const entryId = e.target.value;
                if (!bookName || !entryId) return;

                if (!currentEditingEndpoint.assignedEntriesMap[bookName]) {
                    currentEditingEndpoint.assignedEntriesMap[bookName] = [];
                }

                const selectedSet = new Set(currentEditingEndpoint.assignedEntriesMap[bookName]);
                if (e.target.checked) {
                    selectedSet.add(entryId);
                } else {
                    selectedSet.delete(entryId);
                }
                currentEditingEndpoint.assignedEntriesMap[bookName] = Array.from(selectedSet);
                Logger.log(`条目选择已更新: 世界书=${bookName}, 选中=${currentEditingEndpoint.assignedEntriesMap[bookName].length}条`);
            }
        });
    }

    window.wbapEditEndpoint = async (id) => {
        window.wbapCurrentEndpointId = id;
        const modal = document.getElementById('wbap-endpoint-editor-modal');
        if (!modal) return;

        // 确保结构存在
        if (!WBAP.config.selectiveMode) {
            WBAP.config.selectiveMode = { apiEndpoints: [] };
        }
        if (!Array.isArray(WBAP.config.selectiveMode.apiEndpoints)) {
            WBAP.config.selectiveMode.apiEndpoints = [];
        }

        let endpoint = WBAP.config.selectiveMode.apiEndpoints.find(ep => ep.id === id);
        if (!endpoint && WBAP.config.selectiveMode.apiEndpoints.length > 0) {
            // id 可能过期，回退到第一个
            endpoint = WBAP.config.selectiveMode.apiEndpoints[0];
        }
        if (!endpoint) {
            // Create default endpoint when list is empty
            endpoint = {
                id: `ep_${Date.now()}`,
                name: 'New API',
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
                timeout: WBAP.mainConfig?.globalSettings?.timeout || 60,
                enabled: true,
                worldBooks: [],
                assignedEntriesMap: {}
            };
            WBAP.config.selectiveMode.apiEndpoints.push(endpoint);
            WBAP.saveConfig();
        }
        normalizeEndpointStructure(endpoint);
        currentEditingEndpoint = endpoint;

        // 填充基础信息
        document.getElementById('wbap-endpoint-editor-title').textContent = `编辑 API: ${endpoint.name}`;
        document.getElementById('wbap-endpoint-edit-id').value = endpoint.id;
        document.getElementById('wbap-endpoint-edit-name').value = endpoint.name;
        const enabledInput = document.getElementById('wbap-endpoint-edit-enabled');
        if (enabledInput) {
            enabledInput.checked = endpoint.enabled !== false;
        }
        // 兼容旧字段 url/key
        document.getElementById('wbap-endpoint-edit-url').value = endpoint.apiUrl || endpoint.url || '';
        document.getElementById('wbap-endpoint-edit-key').value = endpoint.apiKey || endpoint.key || '';
        const modelSelect = document.getElementById('wbap-endpoint-edit-model');
        modelSelect.innerHTML = ''; // 清空旧选项
        if (endpoint.model) {
            const option = document.createElement('option');
            option.value = endpoint.model;
            option.textContent = endpoint.model;
            option.selected = true;
            modelSelect.appendChild(option);
        } else {
            modelSelect.innerHTML = '<option value="" disabled selected>请先获取模型</option>';
        }
        document.getElementById('wbap-endpoint-edit-max-tokens').value = endpoint.maxTokens || 2000;
        const tempSlider = document.getElementById('wbap-endpoint-edit-temperature');
        const tempValue = document.getElementById('wbap-endpoint-edit-temperature-value');
        if (tempSlider && tempValue) {
            tempSlider.value = endpoint.temperature || 0.7;
            tempValue.textContent = endpoint.temperature || 0.7;
        }
        const topPInput = document.getElementById('wbap-endpoint-edit-top-p');
        if (topPInput) topPInput.value = endpoint.topP ?? 1;
        const presenceInput = document.getElementById('wbap-endpoint-edit-presence-penalty');
        if (presenceInput) presenceInput.value = endpoint.presencePenalty ?? 0;
        const frequencyInput = document.getElementById('wbap-endpoint-edit-frequency-penalty');
        if (frequencyInput) frequencyInput.value = endpoint.frequencyPenalty ?? 0;
        const maxRetriesInput = document.getElementById('wbap-endpoint-edit-max-retries');
        if (maxRetriesInput) maxRetriesInput.value = endpoint.maxRetries ?? 1;
        const retryDelayInput = document.getElementById('wbap-endpoint-edit-retry-delay');
        if (retryDelayInput) retryDelayInput.value = endpoint.retryDelayMs ?? 800;
        const timeoutInput = document.getElementById('wbap-endpoint-edit-timeout');
        if (timeoutInput) {
            const globalTimeout = WBAP.mainConfig?.globalSettings?.timeout || 0;
            const timeoutVal = (endpoint.timeout !== undefined && endpoint.timeout !== null)
                ? endpoint.timeout
                : (globalTimeout || 60);
            timeoutInput.value = timeoutVal;
        }

        // 填充世界书下拉列表
        const worldbookSelect = document.getElementById('wbap-endpoint-edit-worldbook-select');
        worldbookSelect.innerHTML = '<option value="">-- 请选择 --</option>';
        const bookNames = await WBAP.getAllWorldBookNames();
        bookNames.forEach(name => {
            const option = document.createElement('option');
            option.value = name;
            option.textContent = name;
            worldbookSelect.appendChild(option);
        });

        renderSelectedWorldbooks(endpoint);
        renderWorldBookList(endpoint);

        modal.classList.add('open');
        syncMobileRootFix();
    };

    function saveEndpoint() {
        const id = document.getElementById('wbap-endpoint-edit-id').value;
        const endpoint = WBAP.config.selectiveMode.apiEndpoints.find(ep => ep.id === id);
        if (!endpoint) return;

        endpoint.name = document.getElementById('wbap-endpoint-edit-name').value;
        endpoint.apiUrl = document.getElementById('wbap-endpoint-edit-url').value;
        endpoint.apiKey = document.getElementById('wbap-endpoint-edit-key').value;
        endpoint.model = document.getElementById('wbap-endpoint-edit-model').value;
        endpoint.maxTokens = parseInt(document.getElementById('wbap-endpoint-edit-max-tokens').value) || 2000;
        endpoint.temperature = parseFloat(document.getElementById('wbap-endpoint-edit-temperature').value) || 0.7;
        endpoint.topP = parseFloat(document.getElementById('wbap-endpoint-edit-top-p').value);
        if (isNaN(endpoint.topP)) endpoint.topP = 1;
        endpoint.presencePenalty = parseFloat(document.getElementById('wbap-endpoint-edit-presence-penalty').value);
        if (isNaN(endpoint.presencePenalty)) endpoint.presencePenalty = 0;
        endpoint.frequencyPenalty = parseFloat(document.getElementById('wbap-endpoint-edit-frequency-penalty').value);
        if (isNaN(endpoint.frequencyPenalty)) endpoint.frequencyPenalty = 0;
        const timeoutVal = parseInt(document.getElementById('wbap-endpoint-edit-timeout').value, 10);
        endpoint.timeout = isNaN(timeoutVal) ? 0 : timeoutVal;
        endpoint.maxRetries = parseInt(document.getElementById('wbap-endpoint-edit-max-retries').value, 10);
        if (isNaN(endpoint.maxRetries)) endpoint.maxRetries = 1;
        endpoint.retryDelayMs = parseInt(document.getElementById('wbap-endpoint-edit-retry-delay').value, 10);
        if (isNaN(endpoint.retryDelayMs)) endpoint.retryDelayMs = 800;
        endpoint.enabled = document.getElementById('wbap-endpoint-edit-enabled')?.checked !== false;

        // The assignedEntriesMap is now updated live by a 'change' listener,
        // so we just need to ensure the worldBooks array is clean.
        endpoint.worldBooks = Array.isArray(endpoint.worldBooks) ? Array.from(new Set(endpoint.worldBooks)) : [];

        // Clean up old fields to avoid confusion
        delete endpoint.url;
        delete endpoint.key;
        delete endpoint.worldBook;
        delete endpoint.assignedEntries;

        WBAP.saveConfig();
        document.getElementById('wbap-endpoint-editor-modal').classList.remove('open');
        WBAP.UI.renderApiEndpoints(); // Refresh the list in the settings view
        syncMobileRootFix();
        Logger.log(`API instance "${endpoint.name}" saved`);
    }

    // 在脚本加载后立即尝试注入UI
    // injectUI();

    window.addEventListener('resize', syncMobileRootFix);

})();
