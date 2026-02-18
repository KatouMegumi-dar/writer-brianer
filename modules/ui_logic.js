// modules/ui_logic.js

(function () {
    'use strict';

    // 确保全局命名空间存在
    window.WBAP = window.WBAP || {};
    const Logger = WBAP.Logger;

    // ========== 全局API端点访问辅助函数 ==========
    // API端点存储在 globalPools.selectiveMode.apiEndpoints 中（全局共享）
    // 而不是 characterConfig.selectiveMode.apiEndpoints（已废弃）
    function getGlobalSelectiveEndpoints() {
        const pools = WBAP.getGlobalPools ? WBAP.getGlobalPools() : (WBAP.mainConfig?.globalPools || {});
        if (!pools.selectiveMode) {
            pools.selectiveMode = { apiEndpoints: [] };
        }
        if (!Array.isArray(pools.selectiveMode.apiEndpoints)) {
            pools.selectiveMode.apiEndpoints = [];
        }
        return pools.selectiveMode.apiEndpoints;
    }

    // ========== 端点世界书绑定辅助函数 ==========
    // 世界书绑定存储在 characterConfig.selectiveMode.endpointBindings[endpointId] 中
    // 结构: { worldBooks: string[], assignedEntriesMap: { [bookName]: string[] } }
    function getEndpointBinding(endpointId) {
        const config = WBAP.CharacterManager.getCurrentCharacterConfig();
        if (!config) {
            Logger.warn(`[自选模式] 无法获取角色配置，端点 ${endpointId} 的绑定将为空`);
            return { worldBooks: [], assignedEntriesMap: {} };
        }

        if (!config.selectiveMode) {
            Logger.log(`[自选模式] 角色配置中没有 selectiveMode，初始化中...`);
            config.selectiveMode = { endpointBindings: {} };
        }
        if (!config.selectiveMode.endpointBindings) {
            config.selectiveMode.endpointBindings = {};
        }

        const binding = config.selectiveMode.endpointBindings[endpointId];
        if (!binding) {
            Logger.log(`[自选模式] 端点 ${endpointId} 没有保存的世界书绑定`);
            return { worldBooks: [], assignedEntriesMap: {} };
        }

        Logger.log(`[自选模式] 从配置加载端点 ${endpointId} 的绑定:`, {
            worldBooks: binding.worldBooks?.length || 0,
            entriesCount: Object.keys(binding.assignedEntriesMap || {}).length
        });

        return {
            worldBooks: Array.isArray(binding.worldBooks) ? binding.worldBooks : [],
            assignedEntriesMap: binding.assignedEntriesMap || {}
        };
    }

    function setEndpointBinding(endpointId, worldBooks, assignedEntriesMap) {
        const config = WBAP.CharacterManager.getCurrentCharacterConfig();
        if (!config.selectiveMode) {
            config.selectiveMode = { endpointBindings: {} };
        }
        if (!config.selectiveMode.endpointBindings) {
            config.selectiveMode.endpointBindings = {};
        }
        config.selectiveMode.endpointBindings[endpointId] = {
            worldBooks: Array.isArray(worldBooks) ? worldBooks : [],
            assignedEntriesMap: assignedEntriesMap || {}
        };
    }

    // 当前编辑的世界书绑定（临时存储，保存时写入角色配置）
    let currentEditingBinding = { worldBooks: [], assignedEntriesMap: {} };

    let panelElement = null;
    let settingsElement = null;
    let tiagangElement = null;
    const tiagangWorldbookCache = new Map();
    const respOptWorldbookCache = new Map();
    let tiagangActiveWorldbook = null;
    let respOptActiveWorldbook = null;

    // 清理世界书缓存（角色切换时调用）
    function clearWorldbookCaches() {
        tiagangWorldbookCache.clear();
        respOptWorldbookCache.clear();
        tiagangActiveWorldbook = null;
        respOptActiveWorldbook = null;
        Logger.log('[UI] 已清理世界书缓存');
    }

    function ensureProgressPanel(templates) {
        const existing = document.getElementById('wbap-progress-panel');
        if (existing) {
            const hasBar = existing.querySelector('#wbap-progress-bar');
            const hasStatus = existing.querySelector('#wbap-progress-status');
            const hasTimer = existing.querySelector('#wbap-progress-timer');
            if (hasBar && hasStatus && hasTimer) {
                return { element: existing, created: false };
            }
            const wrapper = document.createElement('div');
            wrapper.innerHTML = templates.PROGRESS_PANEL_HTML;
            const fresh = wrapper.firstElementChild;
            existing.replaceWith(fresh);
            return { element: fresh, created: true };
        }

        const wrapper = document.createElement('div');
        wrapper.innerHTML = templates.PROGRESS_PANEL_HTML;
        document.body.appendChild(wrapper.firstElementChild);
        return { element: document.getElementById('wbap-progress-panel'), created: true };
    }

    function ensureFloatButton() {
        if (document.getElementById('wbap-float-btn')) {
            updateFloatButtonVisibility();
            return;
        }

        const floatBtn = document.createElement('button');
        floatBtn.id = 'wbap-float-btn';
        floatBtn.className = 'wbap-fab'; // 使用CSS类
        floatBtn.innerHTML = '<i class="fa-solid fa-cat"></i>';
        floatBtn.title = '笔者之脑';
        document.body.appendChild(floatBtn);

        const savedPosition = localStorage.getItem('wbap_float_ball_position');
        if (savedPosition) {
            try {
                const pos = JSON.parse(savedPosition);
                floatBtn.style.top = pos.top;
                floatBtn.style.left = pos.left;
            } catch (e) {
                floatBtn.style.top = '';
                floatBtn.style.left = '';
            }
        }

        const onClick = () => {
            if (panelElement) {
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
        updateFloatButtonVisibility();
        Logger.log('悬浮按钮已注入');
    }

    // 根据配置更新悬浮球显示状态
    function updateFloatButtonVisibility() {
        const floatBtn = document.getElementById('wbap-float-btn');
        if (!floatBtn) return;

        const globalSettings = WBAP.mainConfig?.globalSettings || {};
        const config = WBAP.CharacterManager?.getCurrentCharacterConfig?.() || {};
        // 优先使用全局设置
        const shouldShow = globalSettings.showFloatButton !== undefined
            ? globalSettings.showFloatButton
            : (config.showFloatButton !== false);
        floatBtn.style.display = shouldShow ? '' : 'none';
    }

    // 在 SillyTavern 扩展菜单中添加按钮
    function ensureExtensionsMenuButton() {
        if (document.getElementById('wbap-extensions-menu-btn')) return;

        const extensionsMenu = document.getElementById('extensionsMenu');
        if (!extensionsMenu) {
            Logger.log('扩展菜单未找到，稍后重试');
            setTimeout(ensureExtensionsMenuButton, 1000);
            return;
        }

        // 创建菜单项容器
        const container = document.createElement('div');
        container.id = 'wbap_wand_container';
        container.className = 'extension_container';

        // 创建按钮
        const buttonHtml = `
            <div id="wbap-extensions-menu-btn" class="list-group-item flex-container flexGap5 interactable">
                <div class="fa-solid fa-cat extensionsMenuExtensionButton"></div>
                <span>笔者之脑</span>
            </div>
        `;
        container.innerHTML = buttonHtml;
        extensionsMenu.appendChild(container);

        // 绑定点击事件
        document.getElementById('wbap-extensions-menu-btn')?.addEventListener('click', () => {
            if (panelElement) {
                document.body.classList.remove('wbap-mobile-settings-mode');
                document.documentElement.classList.remove('wbap-mobile-settings-mode');
                if (settingsElement) settingsElement.classList.remove('open');

                panelElement.classList.toggle('open');
                syncMobileRootFix();
            }
            // 关闭扩展菜单
            const extensionsMenuEl = document.getElementById('extensionsMenu');
            if (extensionsMenuEl) {
                extensionsMenuEl.style.display = 'none';
            }
        });

        Logger.log('扩展菜单按钮已注入');
    }

    function ensureExtensionsMenuAssistantButton() {
        if (document.getElementById('wbap-resp-opt-assistant-menu-btn')) return;

        const extensionsMenu = document.getElementById('extensionsMenu');
        if (!extensionsMenu) {
            setTimeout(ensureExtensionsMenuAssistantButton, 1000);
            return;
        }

        const container = document.createElement('div');
        container.id = 'wbap_resp_opt_assistant_container';
        container.className = 'extension_container';

        const buttonHtml = `
            <div id="wbap-resp-opt-assistant-menu-btn" class="list-group-item flex-container flexGap5 interactable">
                <div class="fa-solid fa-wand-magic-sparkles extensionsMenuExtensionButton"></div>
                <span>正文优化助手</span>
            </div>
        `;
        container.innerHTML = buttonHtml;
        extensionsMenu.appendChild(container);

        // 绑定点击事件
        document.getElementById('wbap-resp-opt-assistant-menu-btn')?.addEventListener('click', () => {
            if (WBAP.ResponseOptimizer?.openAssistantPanel) {
                WBAP.ResponseOptimizer.openAssistantPanel();
            }
            // 关闭扩展菜单
            const extensionsMenuEl = document.getElementById('extensionsMenu');
            if (extensionsMenuEl) extensionsMenuEl.style.display = 'none';
        });

        Logger.log('正文优化助手菜单按钮已注入');
    }

    function syncMobileRootFix() {
        try {
            // 检查所有可能打开的插件面板、设置和模态框
            const anyOverlayOpen = !!document.querySelector(
                '.wbap-panel.open, ' +
                '.wbap-settings.open, ' +
                '.wbap-modal.open, ' +
                '#wbap-entry-modal.open, ' +
                '#wbap-prompt-editor-modal.open, ' +
                '#wbap-endpoint-editor-modal.open, ' +
                '#wbap-prompt-picker-modal.open, ' +
                '#wbap-memory-modal.open, ' +
                '#wbap-memory-api-modal.open, ' +
                '#wbap-memory-prompt-editor.open, ' +
                '.wbap-opt-preview-overlay.visible, ' +
                '.wbap-inner-overlay.open, ' +
                '.wbap-level3-editor-overlay.open'
            );
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

            const templates = WBAP.UI_TEMPLATES;
            if (!templates) {
                Logger.error('UI 模板不可用，无法注入。');
                return;
            }

            if (document.getElementById('wbap-panel')) {
                panelElement = document.getElementById('wbap-panel');
                settingsElement = document.getElementById('wbap-settings');
                tiagangElement = document.getElementById('wbap-tiagang-settings');
                ensureFloatButton();
                ensureExtensionsMenuButton();
                ensureExtensionsMenuAssistantButton();

                const progress = ensureProgressPanel(templates);
                bindProgressPanelEvents();

                Logger.log('UI 已存在，已补齐缺失组件');
                return;
            }

            // 注入悬浮按钮
            ensureFloatButton();

            // 注入扩展菜单按钮
            ensureExtensionsMenuButton();

            // 注入正文优化助手菜单按钮
            ensureExtensionsMenuAssistantButton();

            // 注入模板
            const panelDiv = document.createElement('div');
            panelDiv.innerHTML = templates.PANEL_HTML;
            document.body.appendChild(panelDiv.firstElementChild);
            panelElement = document.getElementById('wbap-panel');

            const settingsDiv = document.createElement('div');
            settingsDiv.innerHTML = templates.SETTINGS_HTML;
            document.body.appendChild(settingsDiv.firstElementChild);
            settingsElement = document.getElementById('wbap-settings');
            const tiagangDiv = document.createElement('div');
            tiagangDiv.innerHTML = templates.TIANGANG_SETTINGS_HTML;
            document.body.appendChild(tiagangDiv.firstElementChild);
            tiagangElement = document.getElementById('wbap-tiagang-settings');

            // 注入正文优化设置面板
            if (templates.RESPONSE_OPT_SETTINGS_HTML) {
                const respOptDiv = document.createElement('div');
                respOptDiv.innerHTML = templates.RESPONSE_OPT_SETTINGS_HTML;
                document.body.appendChild(respOptDiv.firstElementChild);
            }

            if (templates.SUPER_MEMORY_SETTINGS_HTML) {
                const smSettingsDiv = document.createElement('div');
                smSettingsDiv.innerHTML = templates.SUPER_MEMORY_SETTINGS_HTML;
                document.body.appendChild(smSettingsDiv.firstElementChild);
            }

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

            // 注入正文优化提示词编辑器
            if (templates.RESPONSE_OPT_PROMPT_EDITOR_HTML) {
                const respOptEditorDiv = document.createElement('div');
                respOptEditorDiv.innerHTML = templates.RESPONSE_OPT_PROMPT_EDITOR_HTML;
                document.body.appendChild(respOptEditorDiv.firstElementChild);
            }

            ensureProgressPanel(templates);

            // 绑定事件并刷新
            bindPanelEvents();
            bindSettingsEvents();
            bindTiagangEvents();
            bindResponseOptimizerPanelEvents();
            bindMemorySection();
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

        document.getElementById('wbap-tiagang-btn')?.addEventListener('click', () => {
            if (panelElement) panelElement.classList.remove('open');
            if (settingsElement) settingsElement.classList.remove('open');
            if (tiagangElement) {
                loadTiagangSettingsToUI();
                tiagangElement.classList.add('open');
            }
            syncMobileRootFix();
        });

        document.getElementById('wbap-memory-open-btn')?.addEventListener('click', () => {
            if (WBAP.MemoryModule?.openMemoryModal) {
                WBAP.MemoryModule.openMemoryModal();
            }
        });

        // 正文优化按钮（顶部图标按钮）
        document.getElementById('wbap-resp-opt-btn')?.addEventListener('click', () => {
            if (panelElement) panelElement.classList.remove('open');
            const respOptPanel = document.getElementById('wbap-resp-opt-settings');
            if (respOptPanel) {
                loadResponseOptimizerSettingsToUI();
                respOptPanel.classList.add('open');
            }
            syncMobileRootFix();
        });

        // 正文优化配置按钮（面板内的配置按钮）
        document.getElementById('wbap-resp-opt-open-btn')?.addEventListener('click', () => {
            if (panelElement) panelElement.classList.remove('open');
            const respOptPanel = document.getElementById('wbap-resp-opt-settings');
            if (respOptPanel) {
                loadResponseOptimizerSettingsToUI();
                respOptPanel.classList.add('open');
            }
            syncMobileRootFix();
        });

        // 初始化记忆状态徽章
        updateMemoryStatus();

        // 初始化正文优化状态徽章
        updateResponseOptimizerStatus();

        // 初始化超级记忆 UI
        initSuperMemoryUI();

        // 表格展示按钮（顶部图标按钮）
        document.getElementById('wbap-table-display-btn')?.addEventListener('click', () => {
            if (WBAP.TableDisplay && typeof WBAP.TableDisplay.openSettings === 'function') {
                if (panelElement) panelElement.classList.remove('open');
                WBAP.TableDisplay.openSettings();
            }
            syncMobileRootFix();
        });

        // 表格展示配置按钮（面板内的配置按钮）
        document.getElementById('wbap-table-display-open-btn')?.addEventListener('click', () => {
            if (WBAP.TableDisplay && typeof WBAP.TableDisplay.openSettings === 'function') {
                if (panelElement) panelElement.classList.remove('open');
                WBAP.TableDisplay.openSettings();
            }
            syncMobileRootFix();
        });

        // 表格展示启用/禁用开关
        document.getElementById('wbap-table-display-enabled')?.addEventListener('change', (e) => {
            if (WBAP.TableDisplay && typeof WBAP.TableDisplay.setEnabled === 'function') {
                WBAP.TableDisplay.setEnabled(e.target.checked);
                updateTableDisplayStatus();
                // 刷新表格总览
                if (WBAP.TableDisplay.renderTableOverview) {
                    WBAP.TableDisplay.renderTableOverview();
                }
            }
        });

        // 初始化表格展示状态徽章
        updateTableDisplayStatus();

        // 表格模块已废除
        // const tableEnabledCheckbox = document.getElementById('wbap-table-enabled');
        // tableEnabledCheckbox?.addEventListener('change', (e) => {
        //     const config = WBAP.CharacterManager?.getCurrentCharacterConfig?.() || WBAP.config;
        //     if (!config.tableModule) config.tableModule = { enabled: false };
        //     config.tableModule.enabled = e.target.checked;
        //     WBAP.saveConfig();
        //     updateTableModuleStatus();
        // });

        // 表格管理配置按钮（已废除）
        // document.getElementById('wbap-table-open-btn')?.addEventListener('click', () => {
        //     if (WBAP.TableUI?.openModal) {
        //         WBAP.TableUI.openModal();
        //     }
        // });

        // 初始化表格模块状态（已废除）
        // updateTableModuleStatus();

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
                // 更新绑定标签和摘要（不重新渲染列表，避免列表收起）
                updatePromptBindingTags(selected);
                updatePromptBindingSummary(selected);
                const cfg = WBAP.CharacterManager ? WBAP.CharacterManager.getCurrentCharacterConfig() : WBAP.config;
                const prompts = WBAP.PromptManager.getCombinedPrompts();
                const currentPrompt = prompts[cfg.selectedPromptIndex || 0];
                if (currentPrompt) {
                    WBAP.PromptManager.addOrUpdatePrompt({ ...currentPrompt, boundEndpointIds: selected });
                    WBAP.saveConfig();
                    // 注意：不再调用 refreshPromptList()，避免列表自动收起
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
            const endpoints = getGlobalSelectiveEndpoints();
            endpoints.push({
                id: `ep_${Date.now()}`,
                name: `新增API-${endpoints.length + 1}`,
                apiChannel: 'direct',
                apiProvider: 'openai',
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
                dedupe: true
            });
            WBAP.saveConfig();
            renderApiEndpoints();
            refreshSecondaryPromptUI();
        });

        document.getElementById('wbap-agg-enabled')?.addEventListener('change', (e) => {
            const config = WBAP.CharacterManager.getCurrentCharacterConfig();
            if (!config.aggregatorMode) config.aggregatorMode = { enabled: false, endpointId: '', promptIndex: 0, allowDuplicate: false };
            config.aggregatorMode.enabled = e.target.checked;
        });
        document.getElementById('wbap-agg-endpoint')?.addEventListener('change', (e) => {
            const config = WBAP.CharacterManager.getCurrentCharacterConfig();
            if (!config.aggregatorMode) config.aggregatorMode = { enabled: false, endpointId: '', promptIndex: 0, allowDuplicate: false };
            config.aggregatorMode.endpointId = e.target.value;
        });
        document.getElementById('wbap-agg-prompt')?.addEventListener('change', (e) => {
            const config = WBAP.CharacterManager.getCurrentCharacterConfig();
            if (!config.aggregatorMode) config.aggregatorMode = { enabled: false, endpointId: '', promptIndex: 0, allowDuplicate: false };
            config.aggregatorMode.promptIndex = parseInt(e.target.value, 10) || 0;
        });
        document.getElementById('wbap-agg-allow-duplicate')?.addEventListener('change', (e) => {
            const config = WBAP.CharacterManager.getCurrentCharacterConfig();
            if (!config.aggregatorMode) config.aggregatorMode = { enabled: false, endpointId: '', promptIndex: 0, allowDuplicate: false };
            config.aggregatorMode.allowDuplicate = e.target.checked === true;
        });

        const superEnabledEl = document.getElementById('wbap-super-concurrency');
        superEnabledEl?.addEventListener('change', (e) => {
            const globalSettings = WBAP.mainConfig.globalSettings || {};
            globalSettings.enableSuperConcurrency = e.target.checked === true;
            WBAP.mainConfig.globalSettings = globalSettings;
            toggleSuperConcurrencySection(globalSettings.enableSuperConcurrency === true);
        });
        const superModeEl = document.getElementById('wbap-super-concurrency-mode');
        superModeEl?.addEventListener('change', (e) => {
            const config = WBAP.CharacterManager.getCurrentCharacterConfig();
            const superCfg = ensureSuperConcurrencyConfig(config);
            superCfg.mode = e.target.value || 'basic';
            toggleSuperConcurrencyMode(superCfg.mode);
        });
        const superRoundsEl = document.getElementById('wbap-super-concurrency-rounds');
        superRoundsEl?.addEventListener('change', (e) => {
            const config = WBAP.CharacterManager.getCurrentCharacterConfig();
            const superCfg = ensureSuperConcurrencyConfig(config);
            const value = parseInt(e.target.value, 10);
            superCfg.reviewRounds = Number.isFinite(value) && value > 0 ? value : 1;
        });
        const superShowPanelEl = document.getElementById('wbap-super-concurrency-show-panel');
        superShowPanelEl?.addEventListener('change', (e) => {
            const config = WBAP.CharacterManager.getCurrentCharacterConfig();
            const superCfg = ensureSuperConcurrencyConfig(config);
            superCfg.showPanel = e.target.checked === true;
            if (!superCfg.showPanel) {
                WBAP.CabinetUI?.close?.();
            }
        });
        document.getElementById('wbap-open-cabinet-panel')?.addEventListener('click', () => {
            WBAP.CabinetUI?.open?.();
        });
        const cabinetPromptSelect = document.getElementById('wbap-cabinet-prompt-select');
        cabinetPromptSelect?.addEventListener('change', (e) => {
            const config = WBAP.CharacterManager.getCurrentCharacterConfig();
            const superCfg = ensureSuperConcurrencyConfig(config);
            superCfg.selectedPromptIndex = parseInt(e.target.value, 10) || 0;
            WBAP.saveConfig();
            refreshCabinetPromptList();
        });
        document.getElementById('wbap-cabinet-prompt-new-btn')?.addEventListener('click', () => openCabinetPromptEditor(-1));
        document.getElementById('wbap-cabinet-prompt-edit-btn')?.addEventListener('click', () => {
            const config = WBAP.CharacterManager.getCurrentCharacterConfig();
            const superCfg = ensureSuperConcurrencyConfig(config);
            openCabinetPromptEditor(superCfg.selectedPromptIndex || 0);
        });
        document.getElementById('wbap-cabinet-prompt-delete-btn')?.addEventListener('click', () => deleteCabinetPrompt());
        document.getElementById('wbap-cabinet-prompt-export-btn')?.addEventListener('click', () => exportCabinetPrompt());
        const cabinetImportBtn = document.getElementById('wbap-cabinet-prompt-import-btn');
        const cabinetFileInput = document.getElementById('wbap-cabinet-prompt-file-input');
        if (cabinetImportBtn && cabinetFileInput) {
            cabinetImportBtn.addEventListener('click', () => cabinetFileInput.click());
            cabinetFileInput.addEventListener('change', async (e) => {
                const file = e.target.files[0];
                if (file) {
                    try {
                        const content = await file.text();
                        const prompt = JSON.parse(content);
                        importCabinetPrompt(prompt);
                    } catch (err) {
                        Logger.error('导入内阁提示词失败:', err);
                        alert('导入失败: ' + err.message);
                    } finally {
                        cabinetFileInput.value = '';
                    }
                }
            });
        }
        document.getElementById('wbap-cabinet-save-variables-btn')?.addEventListener('click', (e) => {
            WBAP.saveConfig();
            const btn = e.currentTarget;
            btn.textContent = '已应用';
            setTimeout(() => {
                btn.textContent = '应用变量';
            }, 1500);
        });

        const optimizationCheckbox = document.getElementById('wbap-settings-plot-optimization');
        optimizationCheckbox?.addEventListener('change', (e) => {
            setOptimizationSectionState(e.target.checked === true);
        });

        // 三级优化开关
        document.getElementById('wbap-settings-level3-enabled')?.addEventListener('change', (e) => {
            const config = WBAP.CharacterManager.getCurrentCharacterConfig();
            const level3Cfg = ensureOptimizationPromptConfig(config);
            level3Cfg.enabled = e.target.checked;
        });

        const optPromptSelect = document.getElementById('wbap-opt-prompt-select');
        optPromptSelect?.addEventListener('change', (e) => {
            const config = WBAP.CharacterManager.getCurrentCharacterConfig();
            const level3Cfg = ensureOptimizationPromptConfig(config);
            const idx = parseInt(e.target.value, 10) || 0;
            level3Cfg.selectedPromptIndex = idx;
            const preset = level3Cfg.promptPresets?.[idx];
            if (preset) {
                level3Cfg.systemPrompt = preset.systemPrompt || '';
                level3Cfg.promptTemplate = preset.promptTemplate || '';
                config.optimizationSystemPrompt = preset.systemPrompt || '';
            }
            WBAP.saveConfig();
            refreshOptimizationPromptList();
        });

        document.getElementById('wbap-opt-prompt-new-btn')?.addEventListener('click', () => {
            const config = WBAP.CharacterManager.getCurrentCharacterConfig();
            const level3Cfg = ensureOptimizationPromptConfig(config);
            const basePreset = WBAP.Optimization?.getDefaultOptimizationPromptPreset?.() || {
                name: '优化提示词',
                description: '',
                systemPrompt: WBAP.DEFAULT_OPT_SYSTEM_PROMPT || '',
                promptTemplate: WBAP.DEFAULT_OPT_PROMPT_TEMPLATE || ''
            };
            const nextIndex = level3Cfg.promptPresets.length + 1;
            const newPreset = {
                ...basePreset,
                name: `${basePreset.name || '优化提示词'} ${nextIndex}`
            };
            level3Cfg.promptPresets.push(newPreset);
            level3Cfg.selectedPromptIndex = level3Cfg.promptPresets.length - 1;
            level3Cfg.systemPrompt = newPreset.systemPrompt || '';
            level3Cfg.promptTemplate = newPreset.promptTemplate || '';
            config.optimizationSystemPrompt = newPreset.systemPrompt || '';
            WBAP.saveConfig();
            refreshOptimizationPromptList();
            WBAP.Optimization?.openLevel3Editor?.();
        });

        document.getElementById('wbap-opt-prompt-edit-btn')?.addEventListener('click', () => {
            WBAP.Optimization?.openLevel3Editor?.();
        });

        document.getElementById('wbap-opt-prompt-delete-btn')?.addEventListener('click', () => {
            const config = WBAP.CharacterManager.getCurrentCharacterConfig();
            const level3Cfg = ensureOptimizationPromptConfig(config);
            const presets = level3Cfg.promptPresets || [];
            if (presets.length <= 1) {
                alert('至少保留一个提示词预设');
                return;
            }
            const idx = level3Cfg.selectedPromptIndex || 0;
            const target = presets[idx];
            if (!confirm(`确定删除预设「${target?.name || '未命名'}」？`)) return;
            presets.splice(idx, 1);
            level3Cfg.selectedPromptIndex = Math.max(0, Math.min(idx, presets.length - 1));
            const nextPreset = presets[level3Cfg.selectedPromptIndex];
            if (nextPreset) {
                level3Cfg.systemPrompt = nextPreset.systemPrompt || '';
                level3Cfg.promptTemplate = nextPreset.promptTemplate || '';
                config.optimizationSystemPrompt = nextPreset.systemPrompt || '';
            }
            WBAP.saveConfig();
            refreshOptimizationPromptList();
        });

        const optPromptImportBtn = document.getElementById('wbap-opt-prompt-import-btn');
        const optPromptFileInput = document.getElementById('wbap-opt-prompt-file-input');
        if (optPromptImportBtn && optPromptFileInput) {
            optPromptImportBtn.addEventListener('click', () => optPromptFileInput.click());
            optPromptFileInput.addEventListener('change', async (e) => {
                const file = e.target.files[0];
                if (!file) return;
                try {
                    const content = await file.text();
                    const parsed = JSON.parse(content);
                    const preset = {
                        name: parsed.name || '导入提示词',
                        description: parsed.description || '',
                        systemPrompt: parsed.systemPrompt || '',
                        promptTemplate: parsed.promptTemplate || ''
                    };
                    if (!preset.systemPrompt && !preset.promptTemplate) {
                        throw new Error('提示词内容为空');
                    }
                    const config = WBAP.CharacterManager.getCurrentCharacterConfig();
                    const level3Cfg = ensureOptimizationPromptConfig(config);
                    level3Cfg.promptPresets.push(preset);
                    level3Cfg.selectedPromptIndex = level3Cfg.promptPresets.length - 1;
                    level3Cfg.systemPrompt = preset.systemPrompt || '';
                    level3Cfg.promptTemplate = preset.promptTemplate || '';
                    config.optimizationSystemPrompt = preset.systemPrompt || '';
                    WBAP.saveConfig();
                    refreshOptimizationPromptList();
                } catch (err) {
                    Logger.error('导入剧情优化提示词失败:', err);
                    alert('导入失败: ' + err.message);
                } finally {
                    optPromptFileInput.value = '';
                }
            });
        }

        document.getElementById('wbap-opt-prompt-export-btn')?.addEventListener('click', () => {
            const config = WBAP.CharacterManager.getCurrentCharacterConfig();
            const level3Cfg = ensureOptimizationPromptConfig(config);
            const presets = level3Cfg.promptPresets || [];
            const idx = level3Cfg.selectedPromptIndex || 0;
            const preset = presets[idx];
            if (!preset) return;
            const safeName = (preset.name || 'optimization_prompt').replace(/[\\/:*?"<>|]/g, '_');
            const dataStr = JSON.stringify(preset, null, 2);
            const blob = new Blob([dataStr], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `${safeName}.json`;
            a.click();
            URL.revokeObjectURL(url);
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

            // 【独立开关制度】移除总开关，各模块独立控制
            config.showProgressPanel = document.getElementById('wbap-settings-progress-panel')?.checked !== false;
            config.showFloatButton = document.getElementById('wbap-settings-float-button')?.checked !== false;

            // 全局设置只保留并发和超时配置
            const globalSettings = WBAP.mainConfig.globalSettings || {};
            globalSettings.maxConcurrent = parseInt(document.getElementById('wbap-global-max-concurrent')?.value) || 0;
            globalSettings.timeout = parseInt(document.getElementById('wbap-global-timeout')?.value) || 0;
            globalSettings.enableSuperConcurrency = document.getElementById('wbap-super-concurrency')?.checked === true;
            WBAP.mainConfig.globalSettings = globalSettings;

            const contextRoundsVal = parseInt(document.getElementById('wbap-context-rounds').value, 10);
            config.contextRounds = Number.isFinite(contextRoundsVal) ? contextRoundsVal : 5;

            config.enableChunking = document.getElementById('wbap-enable-chunking').checked;
            config.skipProcessedMessages = document.getElementById('wbap-skip-processed').checked;
            const tagNameInput = document.getElementById('wbap-tag-extraction-name');
            config.tagExtractionName = (tagNameInput?.value || '').trim();
            const mergeWorldbooksEl = document.getElementById('wbap-merge-worldbooks');
            const useSelectedWorldbooksEl = document.getElementById('wbap-use-selected-worldbooks');
            if (mergeWorldbooksEl) config.mergeWorldBooks = mergeWorldbooksEl.checked === true;
            if (useSelectedWorldbooksEl) config.useSelectedWorldBooks = useSelectedWorldbooksEl.checked === true;
            if (!config.aggregatorMode) {
                config.aggregatorMode = { enabled: false, endpointId: '', promptIndex: 0, allowDuplicate: false };
            }
            const aggEnabledEl = document.getElementById('wbap-agg-enabled');
            const aggEndpointEl = document.getElementById('wbap-agg-endpoint');
            const aggPromptEl = document.getElementById('wbap-agg-prompt');
            const aggAllowDuplicateEl = document.getElementById('wbap-agg-allow-duplicate');
            if (aggEnabledEl) config.aggregatorMode.enabled = aggEnabledEl.checked;
            if (aggEndpointEl) config.aggregatorMode.endpointId = aggEndpointEl.value;
            if (aggPromptEl) config.aggregatorMode.promptIndex = parseInt(aggPromptEl.value, 10) || 0;
            if (aggAllowDuplicateEl) config.aggregatorMode.allowDuplicate = aggAllowDuplicateEl.checked === true;

            // 自选模式开关
            if (!config.selectiveMode) config.selectiveMode = { enabled: false, endpointBindings: {} };
            config.selectiveMode.enabled = document.getElementById('wbap-selective-mode-enabled')?.checked === true;

            updateFloatButtonVisibility();
            config.enablePlotOptimization = document.getElementById('wbap-settings-plot-optimization')?.checked === true;
            config.enablePlotOptimizationFloatButton = document.getElementById('wbap-settings-plot-optimization-fab')?.checked === true;
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
            const optTimeout = parseInt(document.getElementById('wbap-optimization-timeout')?.value, 10);
            optimizationApiConfig.timeout = Number.isFinite(optTimeout) && optTimeout > 0 ? optTimeout : 60;
            const optRetries = parseInt(document.getElementById('wbap-optimization-max-retries')?.value, 10);
            optimizationApiConfig.maxRetries = Number.isFinite(optRetries) && optRetries >= 0 ? optRetries : 2;
            const optRetryDelay = parseInt(document.getElementById('wbap-optimization-retry-delay')?.value, 10);
            optimizationApiConfig.retryDelayMs = Number.isFinite(optRetryDelay) && optRetryDelay > 0 ? optRetryDelay : 800;
            optimizationApiConfig.enableStreaming = document.getElementById('wbap-optimization-streaming')?.checked !== false;

            const superCfg = ensureSuperConcurrencyConfig(config);
            superCfg.mode = document.getElementById('wbap-super-concurrency-mode')?.value || 'basic';
            const reviewRounds = parseInt(document.getElementById('wbap-super-concurrency-rounds')?.value, 10);
            superCfg.reviewRounds = Number.isFinite(reviewRounds) && reviewRounds > 0 ? reviewRounds : 1;
            superCfg.showPanel = document.getElementById('wbap-super-concurrency-show-panel')?.checked !== false;

            WBAP.saveConfig();
            if (WBAP.Optimization && WBAP.Optimization.updateFloatingButtonVisibility) {
                WBAP.Optimization.updateFloatingButtonVisibility();
            }
            if (optimizationApiConfig.useIndependentProfile && optimizationApiConfig.apiUrl && WBAP.setupPreconnect) {
                WBAP.setupPreconnect([{ apiUrl: optimizationApiConfig.apiUrl }]);
            }

            // 保存正文优化设置（不显示单独的提示，因为会有统一的保存提示）
            saveResponseOptimizerSettings(false);

            if (settingsElement) settingsElement.classList.remove('open');
            if (panelElement) panelElement.classList.add('open');
            syncMobileRootFix();
            Logger.log('设置已保存到当前角色', config);
            if (window.toastr) {
                toastr.success('设置已保存', '笔者之脑');
            }
        });

        document.getElementById('wbap-export-config')?.addEventListener('click', async () => {
            if (WBAP.PersistentStorage && WBAP.mainConfig) {
                await WBAP.PersistentStorage.exportConfig(WBAP.mainConfig);
            } else {
                // 降级：如果持久化模块不可用，使用旧方式
                const config = WBAP.mainConfig || WBAP.CharacterManager.getCurrentCharacterConfig();
                const dataStr = JSON.stringify(config, null, 2);
                const blob = new Blob([dataStr], { type: 'application/json' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = 'writer-brianer-config.json';
                a.click();
                URL.revokeObjectURL(url);
            }
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

                    // 如果导入的配置中有旧格式的 apiEndpoints，迁移到全局池
                    if (Array.isArray(importedConf.selectiveMode?.apiEndpoints)) {
                        const globalEndpoints = getGlobalSelectiveEndpoints();
                        importedConf.selectiveMode.apiEndpoints.forEach(ep => {
                            normalizeEndpointStructure(ep);
                            if (ep.timeout == null) ep.timeout = 60;
                            // 检查是否已存在相同ID的端点
                            const existingIndex = globalEndpoints.findIndex(e => e.id === ep.id);
                            if (existingIndex === -1) {
                                globalEndpoints.push(ep);
                            }
                        });
                        // 删除旧格式字段
                        delete importedConf.selectiveMode.apiEndpoints;
                    }

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

    function bindTiagangEvents() {
        document.getElementById('wbap-tiagang-close')?.addEventListener('click', () => {
            if (tiagangElement) tiagangElement.classList.remove('open');
            // 返回主面板而不是退出插件
            const mainPanel = document.getElementById('wbap-panel');
            if (mainPanel && !mainPanel.classList.contains('open')) {
                mainPanel.classList.add('open');
            }
            syncMobileRootFix();
        });

        const promptSelect = document.getElementById('wbap-tiagang-prompt-select');
        promptSelect?.addEventListener('change', (e) => {
            const config = WBAP.CharacterManager.getCurrentCharacterConfig();
            const tgCfg = ensureTiagangConfig(config);
            tgCfg.selectedPromptIndex = parseInt(e.target.value, 10) || 0;
            WBAP.saveConfig();
            refreshTiagangPromptList();
        });

        document.getElementById('wbap-tiagang-prompt-new-btn')?.addEventListener('click', () => openTiagangPromptEditor(-1));
        document.getElementById('wbap-tiagang-prompt-edit-btn')?.addEventListener('click', () => {
            const config = WBAP.CharacterManager.getCurrentCharacterConfig();
            const tgCfg = ensureTiagangConfig(config);
            openTiagangPromptEditor(tgCfg.selectedPromptIndex || 0);
        });
        document.getElementById('wbap-tiagang-prompt-delete-btn')?.addEventListener('click', () => deleteTiagangPrompt());
        document.getElementById('wbap-tiagang-prompt-export-btn')?.addEventListener('click', () => exportTiagangPrompt());

        const importBtn = document.getElementById('wbap-tiagang-prompt-import-btn');
        const fileInput = document.getElementById('wbap-tiagang-prompt-file-input');
        if (importBtn && fileInput) {
            importBtn.addEventListener('click', () => fileInput.click());
            fileInput.addEventListener('change', async (e) => {
                const file = e.target.files[0];
                if (file) {
                    try {
                        const content = await file.text();
                        const prompt = JSON.parse(content);
                        importTiagangPrompt(prompt);
                    } catch (err) {
                        Logger.error('Import tiangang prompt failed', err);
                        alert('\u5bfc\u5165\u5931\u8d25: ' + (err.message || err));
                    } finally {
                        fileInput.value = '';
                    }
                }
            });
        }

        document.getElementById('wbap-tiagang-save-variables-btn')?.addEventListener('click', (e) => {
            WBAP.saveConfig();
            const btn = e.currentTarget;
            btn.textContent = '\u5df2\u5e94\u7528';
            setTimeout(() => {
                btn.textContent = '\u5e94\u7528\u53d8\u91cf';
            }, 1500);
        });

        document.getElementById('wbap-tiagang-save')?.addEventListener('click', () => saveTiagangSettings());

        // 天纲接入渠道切换事件
        document.getElementById('wbap-tiagang-channel')?.addEventListener('change', (e) => {
            const isBackend = e.target.value === 'st-backend';
            const backendFields = document.querySelectorAll('.wbap-tiagang-backend-only');
            backendFields.forEach(field => {
                field.style.display = isBackend ? '' : 'none';
            });
        });

        document.getElementById('wbap-tiagang-context-rounds')?.addEventListener('input', (e) => {
            const valueEl = document.getElementById('wbap-tiagang-context-rounds-value');
            if (valueEl) valueEl.textContent = e.target.value;
        });

        document.getElementById('wbap-tiagang-fetch-models')?.addEventListener('click', async (e) => {
            const btn = e.currentTarget;
            if (btn) {
                btn.disabled = true;
                btn.textContent = '\u83b7\u53d6\u4e2d...';
            }
            try {
                const apiUrl = document.getElementById('wbap-tiagang-api-url')?.value || '';
                const apiKey = document.getElementById('wbap-tiagang-api-key')?.value || '';
                if (!apiUrl) throw new Error('\u8bf7\u5148\u914d\u7f6e API URL');
                const result = await WBAP.fetchEndpointModels({ apiUrl, apiKey });
                if (result.success) {
                    populateTiagangModelSelect(result.models || [], document.getElementById('wbap-tiagang-model')?.value || '');
                } else {
                    throw new Error(result.message || '\u83b7\u53d6\u6a21\u578b\u5931\u8d25');
                }
            } catch (err) {
                Logger.warn('Fetch tiangang models failed', err);
                alert(`\u83b7\u53d6\u6a21\u578b\u5931\u8d25\uff1a${err.message || err}`);
            } finally {
                if (btn) {
                    btn.disabled = false;
                    btn.textContent = '\u83b7\u53d6\u6a21\u578b';
                }
            }
        });

        document.getElementById('wbap-tiagang-worldbook-add')?.addEventListener('click', () => {
            const select = document.getElementById('wbap-tiagang-worldbook-select');
            const name = select?.value || '';
            if (!name) return;
            addTiagangWorldbook(name);
        });

        document.getElementById('wbap-tiagang-selected-worldbooks')?.addEventListener('click', (e) => {
            const btn = e.target.closest('[data-remove-book]');
            if (!btn) return;
            removeTiagangWorldbook(btn.dataset.removeBook);
        });

        document.getElementById('wbap-tiagang-book-list-container')?.addEventListener('click', (e) => {
            const item = e.target.closest('.wbap-book-item');
            if (!item) return;
            tiagangActiveWorldbook = item.dataset.bookName;
            const config = WBAP.CharacterManager.getCurrentCharacterConfig();
            const tgCfg = ensureTiagangConfig(config);
            renderTiagangWorldbookList(tgCfg);
            renderTiagangEntryList(tiagangActiveWorldbook);
        });

        document.getElementById('wbap-tiagang-entries-select-all')?.addEventListener('click', () => setTiagangEntrySelection(true));
        document.getElementById('wbap-tiagang-entries-clear')?.addEventListener('click', () => setTiagangEntrySelection(false));
    }

    // ==================== 正文优化设置面板事件绑定 ====================

    function ensureResponseOptimizerConfig(config) {
        if (!config.responseOptimizer) {
            config.responseOptimizer = {
                enabled: false,
                autoIntercept: true,
                manualTrigger: true,
                streamingMode: 'wait',
                selectedPromptIndex: 0,
                showProgress: true,
                minContentLength: 50,
                excludePatterns: [],
                preserveFormatting: true,
                worldBooks: [],
                assignedEntriesMap: {},
                targetTag: ''
            };
        }
        if (!Array.isArray(config.responseOptimizer.worldBooks)) {
            config.responseOptimizer.worldBooks = [];
        }
        if (!config.responseOptimizer.assignedEntriesMap || typeof config.responseOptimizer.assignedEntriesMap !== 'object') {
            config.responseOptimizer.assignedEntriesMap = {};
        }
        return config.responseOptimizer;
    }

    function getResponseOptimizerEditableConfig() {
        let config = WBAP.CharacterManager?.getCurrentCharacterConfig?.() || WBAP.config || {};
        if (WBAP.CharacterManager?.isTemporaryConfig && WBAP.mainConfig?.characterConfigs?.default) {
            config = WBAP.mainConfig.characterConfigs.default;
        }
        return config;
    }

    function getResponseOptimizerApiConfig() {
        const pools = WBAP.getGlobalPools ? WBAP.getGlobalPools() : (WBAP.mainConfig?.globalPools || {});
        if (!pools.responseOptimizer) pools.responseOptimizer = {};
        if (!pools.responseOptimizer.apiConfig) {
            pools.responseOptimizer.apiConfig = WBAP.createDefaultResponseOptimizerApiProfile
                ? WBAP.createDefaultResponseOptimizerApiProfile()
                : { apiChannel: 'direct', apiUrl: '', apiKey: '', model: '', maxTokens: 4000, temperature: 0.7, timeout: 60, maxRetries: 2, retryDelayMs: 800, enableStreaming: true };
        }
        return pools.responseOptimizer.apiConfig;
    }

    function getResponseOptimizerPromptPresets() {
        const pools = WBAP.getGlobalPools ? WBAP.getGlobalPools() : (WBAP.mainConfig?.globalPools || {});
        if (!pools.prompts) pools.prompts = {};
        if (!Array.isArray(pools.prompts.responseOptimizer) || pools.prompts.responseOptimizer.length === 0) {
            pools.prompts.responseOptimizer = [WBAP.createDefaultResponseOptimizerPromptPreset ? WBAP.createDefaultResponseOptimizerPromptPreset() : {
                name: '默认正文优化提示词',
                description: '提升文本质量，保持原意和风格',
                systemPrompt: '',
                promptTemplate: '请优化以下内容：\n\n{content}'
            }];
        }
        return pools.prompts.responseOptimizer;
    }

    function loadResponseOptimizerSettingsToUI() {
        // 获取当前角色配置
        let config = WBAP.CharacterManager?.getCurrentCharacterConfig?.() || WBAP.config || {};

        // 【关键修复】如果是临时配置（主页），优先从默认配置加载
        // 这样刷新后能正确显示之前保存的设置
        if (WBAP.CharacterManager?.isTemporaryConfig && WBAP.mainConfig?.characterConfigs?.default) {
            config = WBAP.mainConfig.characterConfigs.default;
            Logger.log('[正文优化] 主页模式，从默认配置加载设置');
        }

        const respOptCfg = ensureResponseOptimizerConfig(config);
        const apiConfig = getResponseOptimizerApiConfig();

        // 基本开关
        const enabledEl = document.getElementById('wbap-resp-opt-enabled');
        if (enabledEl) enabledEl.checked = respOptCfg.enabled || false;

        const autoInterceptEl = document.getElementById('wbap-resp-opt-auto-intercept');
        if (autoInterceptEl) autoInterceptEl.checked = respOptCfg.autoIntercept !== false;

        const manualTriggerEl = document.getElementById('wbap-resp-opt-manual-trigger');
        if (manualTriggerEl) manualTriggerEl.checked = respOptCfg.manualTrigger !== false;

        const showFabEl = document.getElementById('wbap-resp-opt-show-fab');
        if (showFabEl) showFabEl.checked = respOptCfg.showFab !== false;

        const streamingModeEl = document.getElementById('wbap-resp-opt-streaming-mode');
        if (streamingModeEl) streamingModeEl.value = respOptCfg.streamingMode || 'wait';

        const minLengthEl = document.getElementById('wbap-resp-opt-min-length');
        if (minLengthEl) minLengthEl.value = respOptCfg.minContentLength || 50;

        const targetTagEl = document.getElementById('wbap-resp-opt-target-tag');
        if (targetTagEl) targetTagEl.value = respOptCfg.targetTag || '';

        // 世界书参考
        const wbSelect = document.getElementById('wbap-resp-opt-worldbook-select');
        if (wbSelect && WBAP.getAllWorldBookNames) {
            wbSelect.innerHTML = '<option value="">-- 选择世界书 --</option>';
            WBAP.getAllWorldBookNames().then(names => {
                (names || []).forEach(name => {
                    const opt = document.createElement('option');
                    opt.value = name;
                    opt.textContent = name;
                    wbSelect.appendChild(opt);
                });
            });
        }
        renderResponseOptimizerWorldbookUI();

        // API 配置
        const channelEl = document.getElementById('wbap-resp-opt-channel');
        if (channelEl) channelEl.value = apiConfig.apiChannel || 'direct';

        const apiUrlEl = document.getElementById('wbap-resp-opt-api-url');
        if (apiUrlEl) apiUrlEl.value = apiConfig.apiUrl || '';

        const apiKeyEl = document.getElementById('wbap-resp-opt-api-key');
        if (apiKeyEl) apiKeyEl.value = apiConfig.apiKey || '';

        const modelEl = document.getElementById('wbap-resp-opt-model');
        if (modelEl) {
            modelEl.innerHTML = '';
            if (apiConfig.model) {
                const opt = document.createElement('option');
                opt.value = apiConfig.model;
                opt.textContent = apiConfig.model;
                modelEl.appendChild(opt);
            }
        }

        const maxTokensEl = document.getElementById('wbap-resp-opt-max-tokens');
        if (maxTokensEl) maxTokensEl.value = apiConfig.maxTokens || 4000;

        const temperatureEl = document.getElementById('wbap-resp-opt-temperature');
        if (temperatureEl) temperatureEl.value = apiConfig.temperature ?? 0.7;

        const timeoutEl = document.getElementById('wbap-resp-opt-timeout');
        if (timeoutEl) timeoutEl.value = apiConfig.timeout || 60;

        const maxRetriesEl = document.getElementById('wbap-resp-opt-max-retries');
        if (maxRetriesEl) maxRetriesEl.value = apiConfig.maxRetries ?? 2;

        const retryDelayEl = document.getElementById('wbap-resp-opt-retry-delay');
        if (retryDelayEl) retryDelayEl.value = apiConfig.retryDelayMs || 800;

        const streamingEl = document.getElementById('wbap-resp-opt-streaming');
        if (streamingEl) streamingEl.checked = apiConfig.enableStreaming !== false;

        // 刷新提示词列表
        refreshResponseOptimizerPromptList();
    }

    function refreshResponseOptimizerPromptList() {
        const select = document.getElementById('wbap-resp-opt-prompt-select');
        const descEl = document.getElementById('wbap-resp-opt-prompt-desc');
        if (!select) return;

        const presets = getResponseOptimizerPromptPresets();
        const config = WBAP.CharacterManager?.getCurrentCharacterConfig?.() || WBAP.config || {};
        const respOptCfg = ensureResponseOptimizerConfig(config);
        const selectedIdx = respOptCfg.selectedPromptIndex || 0;

        select.innerHTML = '';
        presets.forEach((preset, idx) => {
            const opt = document.createElement('option');
            opt.value = idx;
            opt.textContent = preset.name || `提示词 ${idx + 1}`;
            if (idx === selectedIdx) opt.selected = true;
            select.appendChild(opt);
        });

        if (descEl && presets[selectedIdx]) {
            descEl.textContent = presets[selectedIdx].description || '';
        }
    }

    function saveResponseOptimizerSettings(showToast = true) {
        // 获取当前角色配置（用于UI显示）
        const config = WBAP.CharacterManager?.getCurrentCharacterConfig?.() || WBAP.config || {};
        const respOptCfg = ensureResponseOptimizerConfig(config);
        const apiConfig = getResponseOptimizerApiConfig();

        // 读取UI值
        const enabled = document.getElementById('wbap-resp-opt-enabled')?.checked || false;
        const autoIntercept = document.getElementById('wbap-resp-opt-auto-intercept')?.checked !== false;
        const manualTrigger = document.getElementById('wbap-resp-opt-manual-trigger')?.checked !== false;
        const showFab = document.getElementById('wbap-resp-opt-show-fab')?.checked !== false;
        const streamingMode = document.getElementById('wbap-resp-opt-streaming-mode')?.value || 'wait';
        const minContentLength = parseInt(document.getElementById('wbap-resp-opt-min-length')?.value, 10) || 50;
        const targetTag = (document.getElementById('wbap-resp-opt-target-tag')?.value || '').trim();

        // 保存基本开关到当前配置
        respOptCfg.enabled = enabled;
        respOptCfg.autoIntercept = autoIntercept;
        respOptCfg.manualTrigger = manualTrigger;
        respOptCfg.showFab = showFab;
        respOptCfg.streamingMode = streamingMode;
        respOptCfg.minContentLength = minContentLength;
        respOptCfg.targetTag = targetTag;

        // 【关键修复】如果当前是临时配置（主页），也同步保存到默认配置
        // 这样刷新后默认配置会生效
        if (WBAP.CharacterManager?.isTemporaryConfig && WBAP.mainConfig?.characterConfigs?.default) {
            const defaultConfig = WBAP.mainConfig.characterConfigs.default;
            const defaultRespOptCfg = ensureResponseOptimizerConfig(defaultConfig);
            defaultRespOptCfg.enabled = enabled;
            defaultRespOptCfg.autoIntercept = autoIntercept;
            defaultRespOptCfg.manualTrigger = manualTrigger;
            defaultRespOptCfg.showFab = showFab;
            defaultRespOptCfg.streamingMode = streamingMode;
            defaultRespOptCfg.minContentLength = minContentLength;
            defaultRespOptCfg.targetTag = targetTag;
            defaultRespOptCfg.worldBooks = Array.isArray(respOptCfg.worldBooks) ? [...respOptCfg.worldBooks] : [];
            defaultRespOptCfg.assignedEntriesMap = respOptCfg.assignedEntriesMap
                ? JSON.parse(JSON.stringify(respOptCfg.assignedEntriesMap))
                : {};
            Logger.log('[正文优化] 已同步保存到默认配置');
        }

        // 保存 API 配置（API配置是全局的，保存在 globalPools 中）
        apiConfig.apiChannel = document.getElementById('wbap-resp-opt-channel')?.value || 'direct';
        apiConfig.apiUrl = document.getElementById('wbap-resp-opt-api-url')?.value || '';
        apiConfig.apiKey = document.getElementById('wbap-resp-opt-api-key')?.value || '';
        apiConfig.model = document.getElementById('wbap-resp-opt-model')?.value || '';
        apiConfig.maxTokens = parseInt(document.getElementById('wbap-resp-opt-max-tokens')?.value, 10) || 4000;
        apiConfig.temperature = parseFloat(document.getElementById('wbap-resp-opt-temperature')?.value) || 0.7;
        apiConfig.timeout = parseInt(document.getElementById('wbap-resp-opt-timeout')?.value, 10) || 60;
        apiConfig.maxRetries = parseInt(document.getElementById('wbap-resp-opt-max-retries')?.value, 10) || 2;
        apiConfig.retryDelayMs = parseInt(document.getElementById('wbap-resp-opt-retry-delay')?.value, 10) || 800;
        apiConfig.enableStreaming = document.getElementById('wbap-resp-opt-streaming')?.checked !== false;

        WBAP.saveConfig();

        // 刷新消息按钮
        if (WBAP.ResponseOptimizer?.refreshMessageButtons) {
            WBAP.ResponseOptimizer.refreshMessageButtons();
        }

        // 更新悬浮球可见性
        if (WBAP.ResponseOptimizer?.updateFloatingButtonVisibility) {
            WBAP.ResponseOptimizer.updateFloatingButtonVisibility();
        }

        // 更新状态徽章
        updateResponseOptimizerStatus();

        Logger.log('[正文优化] 设置已保存');
        if (showToast && window.toastr) {
            toastr.success('正文优化设置已保存', '笔者之脑');
        }
    }

    // 表格模块已废除
    // function updateTableModuleStatus() {
    //     const config = WBAP.CharacterManager?.getCurrentCharacterConfig?.() || WBAP.config;
    //     const enabled = config.tableModule?.enabled === true;
    //
    //     // 更新开关状态
    //     const toggle = document.getElementById('wbap-table-enabled');
    //     if (toggle) toggle.checked = enabled;
    //
    //     // 更新状态徽章
    //     const badge = document.getElementById('wbap-table-status');
    //     if (badge) {
    //         badge.textContent = enabled ? '就绪' : '未启用';
    //         badge.className = enabled ? 'wbap-badge' : 'wbap-badge inactive';
    //         badge.style.background = enabled ? 'rgba(167, 139, 250, 0.15)' : 'rgba(255, 255, 255, 0.05)';
    //         badge.style.color = enabled ? '#a78bfa' : '#888';
    //     }
    //
    //     // 更新按钮状态
    //     const btn = document.getElementById('wbap-table-open-btn');
    //     if (btn) {
    //         btn.disabled = !enabled && false; // 暂时允许配置，即使未启用
    //         btn.style.opacity = enabled ? '1' : '0.7';
    //     }
    //
    //     // 隐藏/显示表格管理面板
    //     const section = document.getElementById('wbap-table-section');
    //     if (section) {
    //         // 始终显示 section，通过内部开关控制功能
    //         section.style.display = '';
    //     }
    // }

    function populateResponseOptimizerModelSelect(models, currentModel) {
        const select = document.getElementById('wbap-resp-opt-model');
        if (!select) return;
        select.innerHTML = '';
        models.forEach(m => {
            const opt = document.createElement('option');
            opt.value = m.id || m;
            opt.textContent = m.id || m;
            if ((m.id || m) === currentModel) opt.selected = true;
            select.appendChild(opt);
        });
        if (currentModel && !models.find(m => (m.id || m) === currentModel)) {
            const opt = document.createElement('option');
            opt.value = currentModel;
            opt.textContent = currentModel;
            opt.selected = true;
            select.appendChild(opt);
        }
    }

    function openResponseOptimizerPromptEditor(index) {
        const presets = getResponseOptimizerPromptPresets();
        const isNew = index < 0 || index >= presets.length;
        const preset = isNew ? { name: '', description: '', systemPrompt: '', promptTemplate: '', variables: {} } : { ...presets[index] };

        // 使用专用的正文优化提示词编辑器
        const modal = document.getElementById('wbap-resp-opt-prompt-editor');
        if (!modal) {
            Logger.warn('[正文优化] 提示词编辑器未找到');
            return;
        }

        // 存储当前编辑的索引
        modal.dataset.editIndex = isNew ? '-1' : String(index);

        // 填充表单
        const nameEl = document.getElementById('wbap-resp-opt-prompt-name');
        const descEl = document.getElementById('wbap-resp-opt-prompt-desc-edit');
        const systemEl = document.getElementById('wbap-resp-opt-system-prompt');
        const templateEl = document.getElementById('wbap-resp-opt-prompt-template');
        const sulv1El = document.getElementById('wbap-resp-opt-var-sulv1');
        const sulv2El = document.getElementById('wbap-resp-opt-var-sulv2');
        const sulv3El = document.getElementById('wbap-resp-opt-var-sulv3');
        const sulv4El = document.getElementById('wbap-resp-opt-var-sulv4');

        if (nameEl) nameEl.value = preset.name || '';
        if (descEl) descEl.value = preset.description || '';
        if (systemEl) systemEl.value = preset.systemPrompt || '';
        if (templateEl) templateEl.value = preset.promptTemplate || '';

        const vars = preset.variables || {};
        if (sulv1El) sulv1El.value = vars.sulv1 || '';
        if (sulv2El) sulv2El.value = vars.sulv2 || '';
        if (sulv3El) sulv3El.value = vars.sulv3 || '';
        if (sulv4El) sulv4El.value = vars.sulv4 || '';

        // 更新标题
        const titleEl = modal.querySelector('.wbap-level3-editor-title');
        if (titleEl) {
            titleEl.textContent = isNew ? '新建正文优化提示词' : '编辑正文优化提示词';
        }

        // 显示编辑器
        modal.classList.remove('wbap-hidden');
        syncMobileRootFix();
    }

    function saveResponseOptimizerPromptFromEditor() {
        const modal = document.getElementById('wbap-resp-opt-prompt-editor');
        if (!modal) return;

        const index = parseInt(modal.dataset.editIndex || '-1', 10);
        const name = document.getElementById('wbap-resp-opt-prompt-name')?.value?.trim();
        if (!name) {
            alert('模板名称不能为空。');
            return;
        }

        const presets = getResponseOptimizerPromptPresets();
        const isNew = index < 0 || index >= presets.length;

        const newPreset = {
            name: name,
            description: document.getElementById('wbap-resp-opt-prompt-desc-edit')?.value || '',
            systemPrompt: document.getElementById('wbap-resp-opt-system-prompt')?.value || '',
            promptTemplate: document.getElementById('wbap-resp-opt-prompt-template')?.value || '',
            variables: {
                sulv1: document.getElementById('wbap-resp-opt-var-sulv1')?.value || '',
                sulv2: document.getElementById('wbap-resp-opt-var-sulv2')?.value || '',
                sulv3: document.getElementById('wbap-resp-opt-var-sulv3')?.value || '',
                sulv4: document.getElementById('wbap-resp-opt-var-sulv4')?.value || ''
            }
        };

        if (isNew) {
            presets.push(newPreset);
        } else {
            presets[index] = newPreset;
        }

        // 更新选中索引
        const config = WBAP.CharacterManager?.getCurrentCharacterConfig?.() || WBAP.config || {};
        const respOptCfg = ensureResponseOptimizerConfig(config);
        if (isNew) {
            respOptCfg.selectedPromptIndex = presets.length - 1;
        }

        WBAP.saveConfig();
        refreshResponseOptimizerPromptList();

        // 关闭编辑器
        modal.classList.add('wbap-hidden');
        syncMobileRootFix();

        Logger.log('[正文优化] 提示词已保存');
        if (window.toastr) {
            toastr.success('提示词已保存', '笔者之脑');
        }
    }

    // 保留旧函数以兼容通用编辑器的保存逻辑
    function saveResponseOptimizerPrompt() {
        const index = parseInt(document.getElementById('wbap-prompt-edit-index')?.value, 10);
        const name = document.getElementById('wbap-prompt-edit-name')?.value?.trim();
        if (!name) {
            alert('模板名称不能为空。');
            return;
        }

        const presets = getResponseOptimizerPromptPresets();
        const isNew = index < 0 || index >= presets.length;

        const newPreset = {
            name: name,
            description: document.getElementById('wbap-prompt-edit-description')?.value || '',
            systemPrompt: document.getElementById('wbap-prompt-edit-system')?.value || '',
            promptTemplate: document.getElementById('wbap-prompt-edit-main')?.value || '',
            variables: {
                sulv1: document.getElementById('wbap-edit-var-sulv1')?.value || '',
                sulv2: document.getElementById('wbap-edit-var-sulv2')?.value || '',
                sulv3: document.getElementById('wbap-edit-var-sulv3')?.value || '',
                sulv4: document.getElementById('wbap-edit-var-sulv4')?.value || ''
            }
        };

        if (isNew) {
            presets.push(newPreset);
        } else {
            presets[index] = newPreset;
        }

        // 更新选中索引
        const config = WBAP.CharacterManager?.getCurrentCharacterConfig?.() || WBAP.config || {};
        const respOptCfg = ensureResponseOptimizerConfig(config);
        if (isNew) {
            respOptCfg.selectedPromptIndex = presets.length - 1;
        }

        WBAP.saveConfig();
        refreshResponseOptimizerPromptList();
        closePromptEditor();

        Logger.log('[正文优化] 提示词已保存');
        if (window.toastr) {
            toastr.success('提示词已保存', '笔者之脑');
        }
    }

    function deleteResponseOptimizerPrompt() {
        const presets = getResponseOptimizerPromptPresets();
        const config = WBAP.CharacterManager?.getCurrentCharacterConfig?.() || WBAP.config || {};
        const respOptCfg = ensureResponseOptimizerConfig(config);
        const idx = respOptCfg.selectedPromptIndex || 0;

        if (presets.length <= 1) {
            alert('至少保留一个提示词预设');
            return;
        }
        if (!confirm(`确定删除提示词 "${presets[idx]?.name || ''}"？`)) return;

        presets.splice(idx, 1);
        respOptCfg.selectedPromptIndex = Math.min(idx, presets.length - 1);
        WBAP.saveConfig();
        refreshResponseOptimizerPromptList();
    }

    function exportResponseOptimizerPrompt() {
        const presets = getResponseOptimizerPromptPresets();
        const config = WBAP.CharacterManager?.getCurrentCharacterConfig?.() || WBAP.config || {};
        const respOptCfg = ensureResponseOptimizerConfig(config);
        const idx = respOptCfg.selectedPromptIndex || 0;
        const preset = presets[idx];
        if (!preset) return;

        const blob = new Blob([JSON.stringify(preset, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `resp_opt_prompt_${preset.name || 'preset'}.json`;
        a.click();
        URL.revokeObjectURL(url);
    }

    function importResponseOptimizerPrompt(promptData) {
        if (!promptData || typeof promptData !== 'object') {
            alert('无效的提示词数据');
            return;
        }
        const presets = getResponseOptimizerPromptPresets();
        presets.push({
            name: promptData.name || '导入的提示词',
            description: promptData.description || '',
            systemPrompt: promptData.systemPrompt || '',
            promptTemplate: promptData.promptTemplate || '',
            variables: promptData.variables || {}
        });
        WBAP.saveConfig();
        refreshResponseOptimizerPromptList();
        Logger.log('[正文优化] 提示词已导入');
        if (window.toastr) {
            toastr.success('提示词已导入', '笔者之脑');
        }
    }

    function bindResponseOptimizerPanelEvents() {
        const getEditableConfig = () => {
            let cfg = WBAP.CharacterManager?.getCurrentCharacterConfig?.() || WBAP.config || {};
            if (WBAP.CharacterManager?.isTemporaryConfig && WBAP.mainConfig?.characterConfigs?.default) {
                cfg = WBAP.mainConfig.characterConfigs.default;
            }
            return cfg;
        };

        // 关闭按钮
        document.getElementById('wbap-resp-opt-close')?.addEventListener('click', () => {
            const panel = document.getElementById('wbap-resp-opt-settings');
            if (panel) panel.classList.remove('open');
            // 返回主面板而不是退出插件
            const mainPanel = document.getElementById('wbap-panel');
            if (mainPanel && !mainPanel.classList.contains('open')) {
                mainPanel.classList.add('open');
            }
            syncMobileRootFix();
        });

        // 提示词选择
        const promptSelect = document.getElementById('wbap-resp-opt-prompt-select');
        promptSelect?.addEventListener('change', (e) => {
            const config = getEditableConfig();
            const respOptCfg = ensureResponseOptimizerConfig(config);
            respOptCfg.selectedPromptIndex = parseInt(e.target.value, 10) || 0;
            WBAP.saveConfig();
            refreshResponseOptimizerPromptList();
        });

        // 提示词操作按钮
        document.getElementById('wbap-resp-opt-prompt-new-btn')?.addEventListener('click', () => openResponseOptimizerPromptEditor(-1));
        document.getElementById('wbap-resp-opt-prompt-edit-btn')?.addEventListener('click', () => {
            const config = getEditableConfig();
            const respOptCfg = ensureResponseOptimizerConfig(config);
            openResponseOptimizerPromptEditor(respOptCfg.selectedPromptIndex || 0);
        });
        document.getElementById('wbap-resp-opt-prompt-delete-btn')?.addEventListener('click', () => deleteResponseOptimizerPrompt());
        document.getElementById('wbap-resp-opt-prompt-export-btn')?.addEventListener('click', () => exportResponseOptimizerPrompt());

        // 导入按钮
        const importBtn = document.getElementById('wbap-resp-opt-prompt-import-btn');
        const fileInput = document.getElementById('wbap-resp-opt-prompt-file-input');
        if (importBtn && fileInput) {
            importBtn.addEventListener('click', () => fileInput.click());
            fileInput.addEventListener('change', async (e) => {
                const file = e.target.files[0];
                if (file) {
                    try {
                        const content = await file.text();
                        const prompt = JSON.parse(content);
                        importResponseOptimizerPrompt(prompt);
                    } catch (err) {
                        Logger.error('Import response optimizer prompt failed', err);
                        alert('导入失败: ' + (err.message || err));
                    } finally {
                        fileInput.value = '';
                    }
                }
            });
        }

        // 获取模型按钮
        document.getElementById('wbap-resp-opt-fetch-models')?.addEventListener('click', async (e) => {
            const btn = e.currentTarget;
            if (btn) {
                btn.disabled = true;
                btn.textContent = '获取中...';
            }
            try {
                const apiUrl = document.getElementById('wbap-resp-opt-api-url')?.value || '';
                const apiKey = document.getElementById('wbap-resp-opt-api-key')?.value || '';
                if (!apiUrl) throw new Error('请先配置 API URL');
                const result = await WBAP.fetchEndpointModels({ apiUrl, apiKey });
                if (result.success) {
                    populateResponseOptimizerModelSelect(result.models || [], document.getElementById('wbap-resp-opt-model')?.value || '');
                } else {
                    throw new Error(result.message || '获取模型失败');
                }
            } catch (err) {
                Logger.warn('Fetch response optimizer models failed', err);
                alert(`获取模型失败：${err.message || err}`);
            } finally {
                if (btn) {
                    btn.disabled = false;
                    btn.textContent = '获取模型';
                }
            }
        });

        // 保存按钮
        document.getElementById('wbap-resp-opt-save')?.addEventListener('click', () => saveResponseOptimizerSettings());

        // 世界书选择
        document.getElementById('wbap-resp-opt-worldbook-add')?.addEventListener('click', () => {
            const select = document.getElementById('wbap-resp-opt-worldbook-select');
            const name = select?.value || '';
            addResponseOptimizerWorldbook(name);
        });

        document.getElementById('wbap-resp-opt-selected-worldbooks')?.addEventListener('click', (e) => {
            const btn = e.target.closest('button[data-remove-book]');
            if (!btn) return;
            const book = btn.dataset.removeBook;
            removeResponseOptimizerWorldbook(book);
        });

        // 左侧世界书列表点击
        document.getElementById('wbap-resp-opt-book-list-container')?.addEventListener('click', (e) => {
            const item = e.target.closest('.wbap-book-item');
            if (!item) return;
            respOptActiveWorldbook = item.dataset.bookName;
            renderResponseOptimizerWorldbookUI();
        });

        // 条目选择
        document.getElementById('wbap-resp-opt-entries-select-all')?.addEventListener('click', () => setResponseOptimizerEntrySelection(true));
        document.getElementById('wbap-resp-opt-entries-clear')?.addEventListener('click', () => setResponseOptimizerEntrySelection(false));

        // 正文优化提示词编辑器事件绑定
        document.getElementById('wbap-resp-opt-editor-close')?.addEventListener('click', () => {
            const modal = document.getElementById('wbap-resp-opt-prompt-editor');
            if (modal) modal.classList.add('wbap-hidden');
            syncMobileRootFix();
        });
        document.getElementById('wbap-resp-opt-editor-save')?.addEventListener('click', () => saveResponseOptimizerPromptFromEditor());
        document.getElementById('wbap-resp-opt-editor-reset')?.addEventListener('click', () => {
            if (confirm('确定要恢复默认值吗？')) {
                const nameEl = document.getElementById('wbap-resp-opt-prompt-name');
                const descEl = document.getElementById('wbap-resp-opt-prompt-desc-edit');
                const systemEl = document.getElementById('wbap-resp-opt-system-prompt');
                const templateEl = document.getElementById('wbap-resp-opt-prompt-template');
                if (nameEl) nameEl.value = '默认正文优化提示词';
                if (descEl) descEl.value = '提升文本质量，保持原意和风格';
                if (systemEl) systemEl.value = WBAP.DEFAULT_RESPONSE_OPT_SYSTEM_PROMPT || '你是一名专业的文本优化助手。';
                if (templateEl) templateEl.value = WBAP.DEFAULT_RESPONSE_OPT_PROMPT_TEMPLATE || '请优化以下正文内容：\n\n{content}';
            }
        });
        // 点击遮罩层关闭编辑器
        document.querySelector('#wbap-resp-opt-prompt-editor .wbap-level3-editor-overlay')?.addEventListener('click', () => {
            const modal = document.getElementById('wbap-resp-opt-prompt-editor');
            if (modal) modal.classList.add('wbap-hidden');
            syncMobileRootFix();
        });

        // 加载设置到 UI
        loadResponseOptimizerSettingsToUI();
    }

    function renderResponseOptimizerSelectedWorldbooks(respOptCfg) {
        const container = document.getElementById('wbap-resp-opt-selected-worldbooks');
        if (!container) return;
        const books = Array.isArray(respOptCfg?.worldBooks) ? respOptCfg.worldBooks : [];
        if (books.length === 0) {
            container.innerHTML = '<small class="wbap-text-muted">尚未选择世界书</small>';
            return;
        }
        container.innerHTML = books.map(name => `
            <span class="wbap-tag" style="background: var(--wbap-bg-secondary, #2a2a3a); padding: 4px 8px; border-radius: 12px; display: inline-flex; align-items: center; gap: 6px;">
                <span>${name}</span>
                <button type="button" data-remove-book="${name}" class="wbap-btn wbap-btn-xs wbap-btn-icon" style="padding: 0 6px;">&times;</button>
            </span>
        `).join('');
    }

    function renderResponseOptimizerWorldbookList(respOptCfg) {
        const container = document.getElementById('wbap-resp-opt-book-list-container');
        if (!container) return;
        const names = Array.isArray(respOptCfg.worldBooks) ? respOptCfg.worldBooks : [];
        if (names.length === 0) {
            container.innerHTML = '<p class="wbap-text-muted" style="padding: 8px; text-align: center; font-size: 12px;">请先添加世界书</p>';
            return;
        }
        container.innerHTML = names.map(name => `
            <div class="wbap-book-item${name === respOptActiveWorldbook ? ' active' : ''}" data-book-name="${name}">
                ${name}
            </div>
        `).join('');
    }

    async function renderResponseOptimizerEntryList(bookName) {
        const entryList = document.getElementById('wbap-resp-opt-entry-list');
        if (!entryList) return;
        if (!bookName) {
            entryList.innerHTML = '<p class="wbap-text-muted" style="text-align: center; font-size: 12px;">请从左侧选择一本世界书</p>';
            return;
        }

        entryList.innerHTML = '<p class="wbap-text-muted" style="text-align: center;"><i class="fa-solid fa-spinner fa-spin"></i> 正在加载条目...</p>';
        let entries = respOptWorldbookCache.get(bookName);
        if (!entries) {
            const book = await WBAP.loadWorldBookEntriesByName?.(bookName);
            entries = book?.entries || null;
            respOptWorldbookCache.set(bookName, entries);
        }
        if (!entries) {
            entryList.innerHTML = `<p style="color: var(--wbap-danger); text-align: center;">加载世界书${bookName} 失败</p>`;
            return;
        }

        const enabledEntries = Object.entries(entries).filter(([, entry]) => entry && entry.disable !== true);
        if (enabledEntries.length === 0) {
            entryList.innerHTML = '<p class="wbap-text-muted" style="text-align: center; font-size: 12px;">该世界书无可用条目</p>';
            return;
        }

        const config = getResponseOptimizerEditableConfig();
        const respOptCfg = ensureResponseOptimizerConfig(config);
        const selected = new Set(respOptCfg.assignedEntriesMap?.[bookName] || []);

        const isTable = tiagangDetectTableWorldBook(entries);

        if (isTable) {
            const groups = tiagangGroupEntriesByCategory(entries);
            entryList.innerHTML = '';
            groups.forEach((uids, cat) => {
                const allSelected = uids.every(id => selected.has(String(id)));
                const label = document.createElement('label');
                const cb = document.createElement('input');
                cb.type = 'checkbox';
                cb.dataset.ids = uids.join(',');
                cb.dataset.category = cat;
                cb.checked = allSelected;
                const span = document.createElement('span');

                let displayText = `${cat}（${uids.length} 条）`;
                if (cat === '大总结' || cat === '小总结') {
                    let minFloor = Infinity;
                    let maxFloor = -Infinity;
                    uids.forEach(uid => {
                        const entry = entries[uid];
                        const text = (entry?.comment || '').trim() || uid;
                        const match = text.match(/^(\d+)-(\d+)楼/);
                        if (match) {
                            const start = parseInt(match[1]);
                            const end = parseInt(match[2]);
                            minFloor = Math.min(minFloor, start);
                            maxFloor = Math.max(maxFloor, end);
                        }
                    });
                    if (minFloor !== Infinity) {
                        displayText = `${cat}：${minFloor}-${maxFloor}楼`;
                    }
                }

                span.textContent = displayText;
                label.appendChild(cb);
                label.appendChild(span);
                entryList.appendChild(label);

                cb.addEventListener('change', () => {
                    const next = new Set(respOptCfg.assignedEntriesMap?.[bookName] || []);
                    uids.forEach(id => {
                        if (cb.checked) { next.add(id); } else { next.delete(id); }
                    });
                    respOptCfg.assignedEntriesMap[bookName] = Array.from(next);
                    WBAP.saveConfig();
                });
            });
        } else {
            entryList.innerHTML = enabledEntries.map(([uid, entry]) => {
                const label = entry?.comment || uid;
                const checked = selected.has(uid) ? 'checked' : '';
                return `
                    <label>
                        <input type="checkbox" data-entry="${encodeURIComponent(uid)}" ${checked}>
                        <span>${label}</span>
                    </label>
                `;
            }).join('');

            entryList.querySelectorAll('input[type="checkbox"]').forEach(cb => {
                cb.addEventListener('change', (e) => {
                    const entryId = decodeURIComponent(e.target.dataset.entry);
                    const next = new Set(respOptCfg.assignedEntriesMap?.[bookName] || []);
                    if (e.target.checked) {
                        next.add(entryId);
                    } else {
                        next.delete(entryId);
                    }
                    respOptCfg.assignedEntriesMap[bookName] = Array.from(next);
                    WBAP.saveConfig();
                });
            });
        }
    }

    function renderResponseOptimizerWorldbookUI() {
        const config = getResponseOptimizerEditableConfig();
        if (!config) return;
        const respOptCfg = ensureResponseOptimizerConfig(config);
        if (!respOptActiveWorldbook || !respOptCfg.worldBooks.includes(respOptActiveWorldbook)) {
            respOptActiveWorldbook = respOptCfg.worldBooks[0] || null;
        }
        renderResponseOptimizerSelectedWorldbooks(respOptCfg);
        renderResponseOptimizerWorldbookList(respOptCfg);
        renderResponseOptimizerEntryList(respOptActiveWorldbook);
    }

    function addResponseOptimizerWorldbook(bookName) {
        if (!bookName) return;
        const config = getResponseOptimizerEditableConfig();
        if (!config) return;
        const respOptCfg = ensureResponseOptimizerConfig(config);
        if (!respOptCfg.worldBooks.includes(bookName)) {
            respOptCfg.worldBooks.push(bookName);
        }
        if (!respOptCfg.assignedEntriesMap[bookName]) {
            respOptCfg.assignedEntriesMap[bookName] = [];
        }
        respOptActiveWorldbook = bookName;
        WBAP.saveConfig();
        renderResponseOptimizerWorldbookUI();
    }

    function removeResponseOptimizerWorldbook(bookName) {
        if (!bookName) return;
        const config = getResponseOptimizerEditableConfig();
        if (!config) return;
        const respOptCfg = ensureResponseOptimizerConfig(config);
        respOptCfg.worldBooks = (respOptCfg.worldBooks || []).filter(name => name !== bookName);
        if (respOptCfg.assignedEntriesMap) {
            delete respOptCfg.assignedEntriesMap[bookName];
        }
        respOptWorldbookCache.delete(bookName);
        if (respOptActiveWorldbook === bookName) {
            respOptActiveWorldbook = respOptCfg.worldBooks[0] || null;
        }
        WBAP.saveConfig();
        renderResponseOptimizerWorldbookUI();
    }

    function setResponseOptimizerEntrySelection(selectAll) {
        if (!respOptActiveWorldbook) return;
        const entryList = document.getElementById('wbap-resp-opt-entry-list');
        if (!entryList) return;
        const checkboxes = entryList.querySelectorAll('input[type="checkbox"]');
        const ids = [];
        checkboxes.forEach(cb => {
            cb.checked = !!selectAll;
            if (selectAll) {
                if (cb.dataset.ids) {
                    ids.push(...cb.dataset.ids.split(',').filter(Boolean));
                } else if (cb.dataset.entry) {
                    ids.push(decodeURIComponent(cb.dataset.entry));
                }
            }
        });
        const config = getResponseOptimizerEditableConfig();
        if (!config) return;
        const respOptCfg = ensureResponseOptimizerConfig(config);
        respOptCfg.assignedEntriesMap[respOptActiveWorldbook] = selectAll ? ids : [];
        WBAP.saveConfig();
    }

    function renderResponseOptimizerWorldbooks(respOptCfg) {
        const container = document.getElementById('wbap-resp-opt-selected-worldbooks');
        if (!container) return;
        const books = Array.isArray(respOptCfg?.worldBooks) ? respOptCfg.worldBooks : [];
        const map = respOptCfg?.assignedEntriesMap || {};
        container.innerHTML = books.map(name => {
            const selectedCount = Array.isArray(map?.[name]) ? map[name].length : 0;
            const countLabel = selectedCount > 0 ? ` <small class="wbap-text-muted">(${selectedCount})</small>` : '';
            return `
                <span class="wbap-tag wbap-worldbook-tag" style="background: var(--wbap-bg-secondary, #2a2a3a); padding: 6px 10px; border-radius: 12px; display: inline-flex; align-items: center; gap: 6px; max-width: 100%; word-break: break-word;">
                    <span style="flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis;">${name}${countLabel}</span>
                    <button type="button" data-edit-entries="${name}" class="wbap-btn wbap-btn-xs wbap-btn-icon" title="选择条目" style="padding: 0 6px; flex-shrink: 0;"><i class="fa-solid fa-list-check"></i></button>
                    <button type="button" data-remove-book="${name}" class="wbap-btn wbap-btn-xs wbap-btn-icon" title="移除世界书" style="padding: 0 6px; flex-shrink: 0;">&times;</button>
                </span>
            `;
        }).join('');
        if (books.length === 0) {
            container.innerHTML = '<span class="wbap-text-muted" style="font-size: 12px;">未选择</span>';
        }
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
                temperature: 0.7,
                timeout: 60,
                maxRetries: 2,
                retryDelayMs: 800,
                enableStreaming: true
            };
        }
        return config.optimizationApiConfig;
    }

    function ensureOptimizationPromptConfig(config) {
        if (!config.optimizationLevel3) {
            config.optimizationLevel3 = { enabled: false, promptTemplate: '', systemPrompt: '', autoConfirm: false };
        }
        if (!Array.isArray(config.optimizationLevel3.promptPresets) || config.optimizationLevel3.promptPresets.length === 0) {
            const fallbackPreset = WBAP.Optimization?.getDefaultOptimizationPromptPreset?.() || {
                name: '默认优化提示词',
                description: '保持人设与世界观一致的剧情润色',
                systemPrompt: WBAP.DEFAULT_OPT_SYSTEM_PROMPT || '',
                promptTemplate: WBAP.DEFAULT_OPT_PROMPT_TEMPLATE || ''
            };
            config.optimizationLevel3.promptPresets = [fallbackPreset];
            config.optimizationLevel3.selectedPromptIndex = 0;
        }
        if (config.optimizationLevel3.selectedPromptIndex == null) {
            config.optimizationLevel3.selectedPromptIndex = 0;
        }
        return config.optimizationLevel3;
    }

    function ensureSuperConcurrencyConfig(config) {
        if (WBAP.ensureSuperConcurrencyConfig) {
            return WBAP.ensureSuperConcurrencyConfig(config);
        }
        if (!config.superConcurrency) {
            config.superConcurrency = {
                mode: 'basic',
                reviewRounds: 1,
                showPanel: true,
                prompts: [WBAP.createDefaultCabinetPromptPreset ? WBAP.createDefaultCabinetPromptPreset() : {}],
                selectedPromptIndex: 0
            };
        }
        return config.superConcurrency;
    }

    // 获取/初始化全局天纲配置（仅用于 API/启用开关，全局共享）
    function getGlobalTiangangConfig() {
        const pools = WBAP.getGlobalPools ? WBAP.getGlobalPools() : (WBAP.mainConfig?.globalPools || {});
        if (!pools.tiangang) pools.tiangang = {};
        if (!pools.tiangang.apiConfig) {
            pools.tiangang.apiConfig = WBAP.createDefaultTiangangApiProfile
                ? WBAP.createDefaultTiangangApiProfile()
                : {
                    apiUrl: '',
                    apiKey: '',
                    model: '',
                    maxTokens: 2000,
                    temperature: 0.7,
                    timeout: 60,
                    maxRetries: 1,
                    retryDelayMs: 800,
                    enableStreaming: true
                };
        }
        if (pools.tiangang.enabled === undefined) pools.tiangang.enabled = false;
        return pools.tiangang;
    }

    function ensureTiagangConfig(config) {
        if (!config.tiangang) {
            config.tiangang = {
                // 启用状态、API 配置、提示词改为全局管理，此处仅保留兼容字段
                enabled: false,
                selectedPromptIndex: 0,
                contextRounds: config.contextRounds ?? 5,
                apiConfig: {}, // 兼容旧数据，占位但不再使用
                worldBooks: [],
                assignedEntriesMap: {}
            };
        }
        const tgCfg = config.tiangang;
        // 不再在角色级别维护 prompts 数组，全部从全局池读取
        if (tgCfg.selectedPromptIndex == null) tgCfg.selectedPromptIndex = 0;
        // apiConfig 不再在角色级别存储，保留旧字段避免报错
        if (!tgCfg.apiConfig) tgCfg.apiConfig = {};
        if (!Array.isArray(tgCfg.worldBooks)) tgCfg.worldBooks = [];
        if (!tgCfg.assignedEntriesMap) tgCfg.assignedEntriesMap = {};
        if (tgCfg.contextRounds == null) tgCfg.contextRounds = config.contextRounds ?? 5;
        return tgCfg;
    }

    function toggleSuperConcurrencySection(enabled) {
        const body = document.getElementById('wbap-super-concurrency-body');
        if (body) body.classList.toggle('wbap-hidden', !enabled);
    }

    function toggleSuperConcurrencyMode(mode) {
        const roundsRow = document.getElementById('wbap-super-concurrency-rounds-row');
        if (!roundsRow) return;
        roundsRow.classList.toggle('wbap-hidden', mode !== 'advanced');
    }

    function refreshCabinetPromptList() {
        const config = WBAP.CharacterManager ? WBAP.CharacterManager.getCurrentCharacterConfig() : WBAP.config;
        if (!config) return;
        const superCfg = ensureSuperConcurrencyConfig(config);
        const prompts = Array.isArray(superCfg.prompts) ? superCfg.prompts : [];
        const selectEl = document.getElementById('wbap-cabinet-prompt-select');
        const descriptionEl = document.getElementById('wbap-cabinet-prompt-description');
        if (!selectEl || !descriptionEl) return;

        if (prompts.length === 0) {
            selectEl.innerHTML = '<option value="0">无提示词</option>';
            descriptionEl.textContent = '请新建或导入一个内阁提示词。';
            refreshCabinetPromptVariables();
            return;
        }

        let idx = superCfg.selectedPromptIndex ?? 0;
        if (idx < 0 || idx >= prompts.length) {
            idx = Math.max(0, prompts.length - 1);
            superCfg.selectedPromptIndex = idx;
            WBAP.saveConfig();
        }

        selectEl.innerHTML = prompts.map((p, index) => `<option value="${index}">${p.name || `未命名预设${index + 1}`}</option>`).join('');
        selectEl.value = idx;
        descriptionEl.textContent = prompts[idx]?.description || '此预设没有描述。';
        refreshCabinetPromptVariables();
    }

    function refreshCabinetPromptVariables() {
        const container = document.getElementById('wbap-cabinet-variables-container');
        if (!container) return;
        container.innerHTML = '';

        const config = WBAP.CharacterManager ? WBAP.CharacterManager.getCurrentCharacterConfig() : WBAP.config;
        if (!config) return;
        const superCfg = ensureSuperConcurrencyConfig(config);
        const prompts = Array.isArray(superCfg.prompts) ? superCfg.prompts : [];
        const idx = superCfg.selectedPromptIndex ?? 0;
        const prompt = prompts[idx];
        if (!prompt) return;

        const variables = prompt.variables || {};
        const updateVariable = (key, value) => {
            const latest = superCfg.prompts?.[idx];
            if (!latest) return;
            latest.variables = { ...(latest.variables || {}), [key]: value };
            WBAP.saveConfig();
            Logger.log(`内阁变量 ${key} 已保存: ${value}`);
        };

        for (let i = 1; i <= 4; i++) {
            const key = `sulv${i}`;
            const value = variables[key] || '';
            const item = document.createElement('div');
            item.className = 'wbap-variable-item';
            item.innerHTML = `<label for="wbap-cabinet-var-${key}">${key}</label><input type="text" id="wbap-cabinet-var-${key}" value="${value}" placeholder="变量 ${key} 的值">`;
            const inputEl = item.querySelector('input');
            inputEl.addEventListener('input', (e) => updateVariable(key, e.target.value));
            container.appendChild(item);
        }
    }

    function refreshTiagangPromptList() {
        const config = WBAP.CharacterManager ? WBAP.CharacterManager.getCurrentCharacterConfig() : WBAP.config;
        if (!config) return;
        const tgCfg = ensureTiagangConfig(config);

        // 修复：从全局池读取提示词
        const pools = WBAP.getGlobalPools();
        const prompts = Array.isArray(pools.prompts?.tiangang) ? pools.prompts.tiangang : [];

        const selectEl = document.getElementById('wbap-tiagang-prompt-select');
        const descriptionEl = document.getElementById('wbap-tiagang-prompt-description');
        if (!selectEl || !descriptionEl) return;

        if (prompts.length === 0) {
            selectEl.innerHTML = '<option value="0">\u65e0\u63d0\u793a\u8bcd</option>';
            descriptionEl.textContent = '\u8bf7\u65b0\u5efa\u6216\u5bfc\u5165\u4e00\u4e2a\u5929\u7eb2\u63d0\u793a\u8bcd\u3002';
            refreshTiagangPromptVariables();
            return;
        }

        let idx = tgCfg.selectedPromptIndex ?? 0;
        if (idx < 0 || idx >= prompts.length) {
            idx = Math.max(0, prompts.length - 1);
            tgCfg.selectedPromptIndex = idx;
            WBAP.saveConfig();
        }

        selectEl.innerHTML = prompts.map((p, index) => `<option value="${index}">${p.name || `\u672a\u547d\u540d\u9884\u8bbe ${index + 1}`}</option>`).join('');
        selectEl.value = idx;
        descriptionEl.textContent = prompts[idx]?.description || '\u6b64\u9884\u8bbe\u6ca1\u6709\u63cf\u8ff0\u3002';
        refreshTiagangPromptVariables();
    }

    function refreshTiagangPromptVariables() {
        const container = document.getElementById('wbap-tiagang-variables-container');
        if (!container) return;
        container.innerHTML = '';

        const config = WBAP.CharacterManager ? WBAP.CharacterManager.getCurrentCharacterConfig() : WBAP.config;
        if (!config) return;
        const tgCfg = ensureTiagangConfig(config);

        // 修复：从全局池读取提示词
        const pools = WBAP.getGlobalPools();
        const prompts = Array.isArray(pools.prompts?.tiangang) ? pools.prompts.tiangang : [];

        const idx = tgCfg.selectedPromptIndex ?? 0;
        const prompt = prompts[idx];
        if (!prompt) return;

        const variables = prompt.variables || {};
        const updateVariable = (key, value) => {
            const latest = prompts[idx];
            if (!latest) return;
            latest.variables = { ...(latest.variables || {}), [key]: value };
            WBAP.saveConfig();
        };

        for (let i = 1; i <= 4; i++) {
            const key = `sulv${i}`;
            const value = variables[key] || '';
            const item = document.createElement('div');
            item.className = 'wbap-variable-item';
            item.innerHTML = `<label for="wbap-tiagang-var-${key}">${key}</label><input type="text" id="wbap-tiagang-var-${key}" value="${value}" placeholder="\u53d8\u91cf ${key} \u7684\u503c">`;
            const inputEl = item.querySelector('input');
            inputEl.addEventListener('input', (e) => updateVariable(key, e.target.value));
            container.appendChild(item);
        }
    }

    function toggleOptimizationApiBlocks(useIndependent) {
        const independentBlock = document.getElementById('wbap-optimization-independent-block');
        const endpointBlock = document.getElementById('wbap-optimization-endpoint-block');
        if (independentBlock) independentBlock.classList.toggle('wbap-hidden', !useIndependent);
        if (endpointBlock) endpointBlock.classList.toggle('wbap-hidden', useIndependent);
    }

    function setOptimizationSectionState(enabled) {
        const section = document.getElementById('wbap-optimization-section');
        const content = document.getElementById('wbap-optimization-content');
        if (section) section.classList.toggle('expanded', !!enabled);
        if (content) {
            content.classList.toggle('wbap-hidden', !enabled);
            content.classList.toggle('wbap-disabled', !enabled);
        }
    }

    function renderOptimizationEndpointOptions(selectedId = null) {
        const selectEl = document.getElementById('wbap-optimization-endpoint-select');
        if (!selectEl) return;
        const endpoints = getGlobalSelectiveEndpoints();
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

    function populateTiagangModelSelect(models = [], currentModel = '') {
        const modelSelect = document.getElementById('wbap-tiagang-model');
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
            modelSelect.innerHTML = '<option value="" disabled selected>\u8bf7\u5148\u83b7\u53d6\u6a21\u578b</option>';
        }
    }

    async function populateTiagangWorldbookSelect() {
        const select = document.getElementById('wbap-tiagang-worldbook-select');
        if (!select) return;
        select.innerHTML = '<option value="">-- \u8bf7\u9009\u62e9 --</option>';
        try {
            const names = await WBAP.getAllWorldBookNames?.();
            if (Array.isArray(names)) {
                names.forEach(name => {
                    const option = document.createElement('option');
                    option.value = name;
                    option.textContent = name;
                    select.appendChild(option);
                });
            }
        } catch (err) {
            Logger.warn('Failed to load worldbook list for tiangang', err);
        }
    }

    function renderTiagangSelectedWorldbooks(tgCfg) {
        const container = document.getElementById('wbap-tiagang-selected-worldbooks');
        if (!container) return;
        if (!tgCfg.worldBooks || tgCfg.worldBooks.length === 0) {
            container.innerHTML = '<small class="wbap-text-muted">\u5c1a\u672a\u9009\u62e9\u4e16\u754c\u4e66</small>';
            return;
        }
        container.innerHTML = tgCfg.worldBooks.map(name => `
            <span class="wbap-tag" style="background: var(--wbap-bg-secondary, #2a2a3a); padding: 4px 8px; border-radius: 12px; display: inline-flex; align-items: center; gap: 6px;">
                <span>${name}</span>
                <button type="button" data-remove-book="${name}" class="wbap-btn wbap-btn-xs wbap-btn-icon" style="padding: 0 6px;">&times;</button>
            </span>
        `).join('');
    }

    function renderTiagangWorldbookList(tgCfg) {
        const container = document.getElementById('wbap-tiagang-book-list-container');
        if (!container) return;
        const names = Array.isArray(tgCfg.worldBooks) ? tgCfg.worldBooks : [];
        if (names.length === 0) {
            container.innerHTML = '<p class="wbap-text-muted" style="padding: 8px; text-align: center; font-size: 12px;">\u8bf7\u5148\u6dfb\u52a0\u4e16\u754c\u4e66</p>';
            return;
        }
        container.innerHTML = names.map(name => `
            <div class="wbap-book-item${name === tiagangActiveWorldbook ? ' active' : ''}" data-book-name="${name}">
                ${name}
            </div>
        `).join('');
    }

    // --- 表格世界书栏目化辅助函数 ---
    function tiagangDetectTableWorldBook(entries) {
        if (!entries) return false;
        const items = Object.entries(entries).map(([uid, e]) => ({
            comment: (e?.comment || '').trim(),
            uid: uid
        }));

        // 检查是否是插件生成的总结书（检查comment或uid）
        const hasSummaryEntries = items.some(item =>
            item.comment.endsWith('楼小总结') ||
            item.comment.endsWith('楼大总结') ||
            item.uid.endsWith('楼小总结') ||
            item.uid.endsWith('楼大总结')
        );
        if (hasSummaryEntries) return true;

        // 检查是否是 Amily 表格书
        const comments = items.map(item => item.comment);
        const indexCount = comments.filter(c => /\bIndex\s+for\s+/i.test(c)).length;
        const detailCount = comments.filter(c => /Detail:\s*[^-]+\s*-/i.test(c)).length;
        if (indexCount >= 3) return true;
        if (detailCount >= 5) return true;
        return false;
    }

    function tiagangGetCategoryFromComment(comment = '', uid = '') {
        // 识别插件生成的总结书条目 - 优先检查comment，如果为空则检查uid
        const text = (comment || '').trim() || uid;

        if (text.endsWith('楼小总结')) {
            return '小总结';
        }
        if (text.endsWith('楼大总结')) {
            return '大总结';
        }

        // 原有逻辑
        const idx = text.match(/Index\s+for\s+(.+)/i);
        if (idx) return idx[1].trim();
        const det = text.match(/Detail:\s*([^-]+)\s*-/i);
        if (det) return det[1].trim();
        const bracket = text.match(/\u3010([^\u3011]+)\u3011/);
        if (bracket) return bracket[1].trim();
        const parts = text.trim().split(/\s*-\s*/);
        if (parts.length > 1) return parts[0].trim();
        return '\u672a\u5206\u7c7b';
    }

    function tiagangGroupEntriesByCategory(entries) {
        const groups = new Map();
        Object.entries(entries || {}).forEach(([uid, entry]) => {
            if (entry?.disable === true) return;
            const cat = tiagangGetCategoryFromComment(entry?.comment || '', uid);
            if (!groups.has(cat)) groups.set(cat, []);
            groups.get(cat).push(uid);
        });
        return groups;
    }
    // --- END 表格世界书栏目化辅助函数 ---

    async function renderTiagangEntryList(bookName) {
        const entryList = document.getElementById('wbap-tiagang-entry-list');
        if (!entryList) return;
        if (!bookName) {
            entryList.innerHTML = '<p class="wbap-text-muted" style="text-align: center; font-size: 12px;">\u8bf7\u4ece\u5de6\u4fa7\u9009\u62e9\u4e00\u672c\u4e16\u754c\u4e66</p>';
            return;
        }

        entryList.innerHTML = '<p class="wbap-text-muted" style="text-align: center;"><i class="fa-solid fa-spinner fa-spin"></i> \u6b63\u5728\u52a0\u8f7d\u6761\u76ee...</p>';
        let entries = tiagangWorldbookCache.get(bookName);
        if (!entries) {
            const book = await WBAP.loadWorldBookEntriesByName(bookName);
            entries = book?.entries || null;
            tiagangWorldbookCache.set(bookName, entries);
        }
        if (!entries) {
            entryList.innerHTML = `<p style="color: var(--wbap-danger); text-align: center;">\u52a0\u8f7d\u4e16\u754c\u4e66 ${bookName} \u5931\u8d25</p>`;
            return;
        }

        const enabledEntries = Object.entries(entries).filter(([, entry]) => entry && entry.disable !== true);
        if (enabledEntries.length === 0) {
            entryList.innerHTML = '<p class="wbap-text-muted" style="text-align: center; font-size: 12px;">\u8be5\u4e16\u754c\u4e66\u65e0\u53ef\u7528\u6761\u76ee</p>';
            return;
        }

        const config = WBAP.CharacterManager ? WBAP.CharacterManager.getCurrentCharacterConfig() : WBAP.config;
        const tgCfg = ensureTiagangConfig(config);
        const selected = new Set(tgCfg.assignedEntriesMap?.[bookName] || []);

        const isTable = tiagangDetectTableWorldBook(entries);

        if (isTable) {
            const groups = tiagangGroupEntriesByCategory(entries);
            entryList.innerHTML = '';
            groups.forEach((uids, cat) => {
                const allSelected = uids.every(id => selected.has(String(id)));
                const label = document.createElement('label');
                const cb = document.createElement('input');
                cb.type = 'checkbox';
                cb.dataset.ids = uids.join(',');
                cb.dataset.category = cat;
                cb.checked = allSelected;
                const span = document.createElement('span');

                // 对于插件总结书，计算并显示楼层范围
                let displayText = `${cat}\uff08${uids.length} \u6761\uff09`;
                if (cat === '大总结' || cat === '小总结') {
                    let minFloor = Infinity;
                    let maxFloor = -Infinity;
                    uids.forEach(uid => {
                        const entry = entries[uid];
                        // 优先使用comment，如果为空则使用uid
                        const text = (entry?.comment || '').trim() || uid;
                        const match = text.match(/^(\d+)-(\d+)楼/);
                        if (match) {
                            const start = parseInt(match[1]);
                            const end = parseInt(match[2]);
                            minFloor = Math.min(minFloor, start);
                            maxFloor = Math.max(maxFloor, end);
                        }
                    });
                    if (minFloor !== Infinity) {
                        displayText = `${cat}\uff1a${minFloor}-${maxFloor}楼`;
                    }
                }

                span.textContent = displayText;
                label.appendChild(cb);
                label.appendChild(span);
                entryList.appendChild(label);

                cb.addEventListener('change', () => {
                    const next = new Set(tgCfg.assignedEntriesMap?.[bookName] || []);
                    uids.forEach(id => {
                        if (cb.checked) { next.add(id); } else { next.delete(id); }
                    });
                    tgCfg.assignedEntriesMap[bookName] = Array.from(next);
                    WBAP.saveConfig();
                });
            });
        } else {
            entryList.innerHTML = enabledEntries.map(([uid, entry]) => {
                const label = entry?.comment || uid;
                const checked = selected.has(uid) ? 'checked' : '';
                return `
                    <label>
                        <input type="checkbox" data-entry="${encodeURIComponent(uid)}" ${checked}>
                        <span>${label}</span>
                    </label>
                `;
            }).join('');

            entryList.querySelectorAll('input[type="checkbox"]').forEach(cb => {
                cb.addEventListener('change', (e) => {
                    const entryId = decodeURIComponent(e.target.dataset.entry);
                    const next = new Set(tgCfg.assignedEntriesMap?.[bookName] || []);
                    if (e.target.checked) {
                        next.add(entryId);
                    } else {
                        next.delete(entryId);
                    }
                    tgCfg.assignedEntriesMap[bookName] = Array.from(next);
                    WBAP.saveConfig();
                });
            });
        }
    }

    function renderTiagangWorldbookUI() {
        const config = WBAP.CharacterManager ? WBAP.CharacterManager.getCurrentCharacterConfig() : WBAP.config;
        if (!config) return;
        const tgCfg = ensureTiagangConfig(config);
        if (!tiagangActiveWorldbook || !tgCfg.worldBooks.includes(tiagangActiveWorldbook)) {
            tiagangActiveWorldbook = tgCfg.worldBooks[0] || null;
        }
        renderTiagangSelectedWorldbooks(tgCfg);
        renderTiagangWorldbookList(tgCfg);
        renderTiagangEntryList(tiagangActiveWorldbook);
    }

    function addTiagangWorldbook(bookName) {
        if (!bookName) return;
        const config = WBAP.CharacterManager ? WBAP.CharacterManager.getCurrentCharacterConfig() : WBAP.config;
        if (!config) return;
        const tgCfg = ensureTiagangConfig(config);
        if (!tgCfg.worldBooks.includes(bookName)) {
            tgCfg.worldBooks.push(bookName);
        }
        tiagangActiveWorldbook = bookName;
        WBAP.saveConfig();
        renderTiagangWorldbookUI();
    }

    function removeTiagangWorldbook(bookName) {
        if (!bookName) return;
        const config = WBAP.CharacterManager ? WBAP.CharacterManager.getCurrentCharacterConfig() : WBAP.config;
        if (!config) return;
        const tgCfg = ensureTiagangConfig(config);
        tgCfg.worldBooks = (tgCfg.worldBooks || []).filter(name => name !== bookName);
        if (tgCfg.assignedEntriesMap) {
            delete tgCfg.assignedEntriesMap[bookName];
        }
        if (tiagangActiveWorldbook === bookName) {
            tiagangActiveWorldbook = tgCfg.worldBooks[0] || null;
        }
        WBAP.saveConfig();
        renderTiagangWorldbookUI();
    }

    function setTiagangEntrySelection(selectAll) {
        if (!tiagangActiveWorldbook) return;
        const entryList = document.getElementById('wbap-tiagang-entry-list');
        if (!entryList) return;
        const checkboxes = entryList.querySelectorAll('input[type="checkbox"]');
        const ids = [];
        checkboxes.forEach(cb => {
            cb.checked = !!selectAll;
            if (selectAll) {
                if (cb.dataset.ids) {
                    ids.push(...cb.dataset.ids.split(',').filter(Boolean));
                } else if (cb.dataset.entry) {
                    ids.push(decodeURIComponent(cb.dataset.entry));
                }
            }
        });
        const config = WBAP.CharacterManager ? WBAP.CharacterManager.getCurrentCharacterConfig() : WBAP.config;
        if (!config) return;
        const tgCfg = ensureTiagangConfig(config);
        tgCfg.assignedEntriesMap[tiagangActiveWorldbook] = selectAll ? ids : [];
        WBAP.saveConfig();
    }

    function loadTiagangSettingsToUI() {
        const config = WBAP.CharacterManager ? WBAP.CharacterManager.getCurrentCharacterConfig() : WBAP.config;
        if (!config) return;
        const tgCfg = ensureTiagangConfig(config);
        const globalTg = getGlobalTiangangConfig();

        // 【修复】天纲开关完全独立于角色配置，只读写角色配置
        const enabledEl = document.getElementById('wbap-tiagang-enabled');
        if (enabledEl) {
            enabledEl.checked = tgCfg.enabled === true;
        }

        const roundsEl = document.getElementById('wbap-tiagang-context-rounds');
        const roundsValEl = document.getElementById('wbap-tiagang-context-rounds-value');
        if (roundsEl && roundsValEl) {
            const safeRounds = Number.isFinite(tgCfg.contextRounds) ? tgCfg.contextRounds : 5;
            roundsEl.value = safeRounds;
            roundsValEl.textContent = safeRounds;
        }

        const apiCfg = globalTg.apiConfig || {};
        const channelEl = document.getElementById('wbap-tiagang-channel');
        const providerEl = document.getElementById('wbap-tiagang-provider');
        const apiUrlEl = document.getElementById('wbap-tiagang-api-url');
        const apiKeyEl = document.getElementById('wbap-tiagang-api-key');
        const maxTokensEl = document.getElementById('wbap-tiagang-max-tokens');
        const tempEl = document.getElementById('wbap-tiagang-temperature');
        const timeoutEl = document.getElementById('wbap-tiagang-timeout');
        const maxRetriesEl = document.getElementById('wbap-tiagang-max-retries');
        const retryDelayEl = document.getElementById('wbap-tiagang-retry-delay');
        const streamingEl = document.getElementById('wbap-tiagang-streaming');
        if (channelEl) channelEl.value = apiCfg.apiChannel || 'direct';
        if (providerEl) providerEl.value = apiCfg.apiProvider || 'openai';

        // 根据接入渠道显示/隐藏后端类型字段
        const isBackend = (apiCfg.apiChannel || 'direct') === 'st-backend';
        const backendFields = document.querySelectorAll('.wbap-tiagang-backend-only');
        backendFields.forEach(field => {
            field.style.display = isBackend ? '' : 'none';
        });

        if (apiUrlEl) apiUrlEl.value = apiCfg.apiUrl || '';
        if (apiKeyEl) apiKeyEl.value = apiCfg.apiKey || '';
        if (maxTokensEl) maxTokensEl.value = apiCfg.maxTokens || 2000;
        if (tempEl) tempEl.value = apiCfg.temperature ?? 0.7;
        if (timeoutEl) timeoutEl.value = apiCfg.timeout ?? 60;
        if (maxRetriesEl) maxRetriesEl.value = Number.isFinite(apiCfg.maxRetries) ? apiCfg.maxRetries : 2;
        if (retryDelayEl) retryDelayEl.value = Number.isFinite(apiCfg.retryDelayMs) ? apiCfg.retryDelayMs : 800;
        if (streamingEl) streamingEl.checked = apiCfg.enableStreaming !== false;
        populateTiagangModelSelect([], apiCfg.model || '');

        populateTiagangWorldbookSelect();
        refreshTiagangPromptList();
        renderTiagangWorldbookUI();
    }

    function saveTiagangSettings() {
        const config = WBAP.CharacterManager ? WBAP.CharacterManager.getCurrentCharacterConfig() : WBAP.config;
        if (!config) return;
        const tgCfg = ensureTiagangConfig(config);
        const globalTg = getGlobalTiangangConfig();

        // 【修复】天纲开关完全独立于角色配置，只写入角色配置
        const enabledEl = document.getElementById('wbap-tiagang-enabled');
        if (enabledEl) {
            tgCfg.enabled = enabledEl.checked === true;
        }

        const roundsVal = parseInt(document.getElementById('wbap-tiagang-context-rounds')?.value, 10);
        tgCfg.contextRounds = Number.isFinite(roundsVal) ? roundsVal : (tgCfg.contextRounds ?? 5);

        const apiCfg = globalTg.apiConfig || {};
        apiCfg.apiChannel = document.getElementById('wbap-tiagang-channel')?.value || 'direct';
        apiCfg.apiProvider = document.getElementById('wbap-tiagang-provider')?.value || 'openai';
        apiCfg.apiUrl = document.getElementById('wbap-tiagang-api-url')?.value || '';
        apiCfg.apiKey = document.getElementById('wbap-tiagang-api-key')?.value || '';
        apiCfg.model = document.getElementById('wbap-tiagang-model')?.value || '';
        const maxTokensVal = parseInt(document.getElementById('wbap-tiagang-max-tokens')?.value, 10);
        apiCfg.maxTokens = Number.isFinite(maxTokensVal) && maxTokensVal > 0 ? maxTokensVal : 2000;
        const tempVal = parseFloat(document.getElementById('wbap-tiagang-temperature')?.value);
        apiCfg.temperature = Number.isFinite(tempVal) ? tempVal : 0.7;
        const timeoutVal = parseInt(document.getElementById('wbap-tiagang-timeout')?.value, 10);
        apiCfg.timeout = Number.isFinite(timeoutVal) && timeoutVal > 0 ? timeoutVal : 60;
        const retriesVal = parseInt(document.getElementById('wbap-tiagang-max-retries')?.value, 10);
        apiCfg.maxRetries = Number.isFinite(retriesVal) && retriesVal >= 0 ? retriesVal : 2;
        const retryDelayVal = parseInt(document.getElementById('wbap-tiagang-retry-delay')?.value, 10);
        apiCfg.retryDelayMs = Number.isFinite(retryDelayVal) && retryDelayVal > 0 ? retryDelayVal : 800;
        apiCfg.enableStreaming = document.getElementById('wbap-tiagang-streaming')?.checked !== false;
        globalTg.apiConfig = apiCfg;

        if (apiCfg.apiUrl && WBAP.setupPreconnect) {
            WBAP.setupPreconnect([{ apiUrl: apiCfg.apiUrl }]);
        }

        WBAP.saveConfig();

        const btn = document.getElementById('wbap-tiagang-save');
        if (btn) {
            const original = btn.innerHTML;
            btn.innerHTML = '<i class="fa-solid fa-check"></i> \u5df2\u4fdd\u5b58';
            setTimeout(() => {
                btn.innerHTML = original;
            }, 1500);
        }
    }

    function loadSettingsToUI() {
        // 【修复】角色切换时清理世界书缓存，避免显示旧数据
        clearWorldbookCaches();

        const config = WBAP.CharacterManager.getCurrentCharacterConfig();
        if (!config) return;
        if (!config.aggregatorMode) {
            config.aggregatorMode = { enabled: false, endpointId: '', promptIndex: 0, allowDuplicate: false };
        } else if (config.aggregatorMode.allowDuplicate == null) {
            config.aggregatorMode.allowDuplicate = false;
        }

        const global = WBAP.mainConfig.globalSettings || {};

        // 【独立开关制度】移除总开关加载，各模块独立控制

        const maxConcEl = document.getElementById('wbap-global-max-concurrent');
        const timeoutEl = document.getElementById('wbap-global-timeout');
        if (maxConcEl) maxConcEl.value = global.maxConcurrent ?? 0;
        if (timeoutEl) timeoutEl.value = global.timeout ?? 0;
        const superConcEl = document.getElementById('wbap-super-concurrency');
        if (superConcEl) {
            superConcEl.checked = global.enableSuperConcurrency === true;
            toggleSuperConcurrencySection(superConcEl.checked);
        }

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
        const tagNameEl = document.getElementById('wbap-tag-extraction-name');
        if (tagNameEl) {
            tagNameEl.value = config.tagExtractionName || '';
        }
        const mergeWorldbooksEl = document.getElementById('wbap-merge-worldbooks');
        if (mergeWorldbooksEl) {
            mergeWorldbooksEl.checked = config.mergeWorldBooks !== false;
        }
        const useSelectedWorldbooksEl = document.getElementById('wbap-use-selected-worldbooks');
        if (useSelectedWorldbooksEl) {
            useSelectedWorldbooksEl.checked = config.useSelectedWorldBooks !== false;
        }

        const superCfg = ensureSuperConcurrencyConfig(config);
        const superModeEl = document.getElementById('wbap-super-concurrency-mode');
        if (superModeEl) {
            superModeEl.value = superCfg.mode || 'basic';
            toggleSuperConcurrencyMode(superModeEl.value);
        }
        const superRoundsEl = document.getElementById('wbap-super-concurrency-rounds');
        if (superRoundsEl) {
            superRoundsEl.value = superCfg.reviewRounds || 1;
        }
        const superShowPanelEl = document.getElementById('wbap-super-concurrency-show-panel');
        if (superShowPanelEl) {
            superShowPanelEl.checked = superCfg.showPanel !== false;
        }

        // 【改回角色卡绑定】从角色配置加载进度面板和悬浮按钮开关
        const showProgressPanelEl = document.getElementById('wbap-settings-progress-panel');
        if (showProgressPanelEl) {
            showProgressPanelEl.checked = config.showProgressPanel !== false;
        }

        const showFloatButtonEl = document.getElementById('wbap-settings-float-button');
        if (showFloatButtonEl) {
            showFloatButtonEl.checked = config.showFloatButton !== false;
        }

        const optimizationEl = document.getElementById('wbap-settings-plot-optimization');
        if (optimizationEl) {
            optimizationEl.checked = config.enablePlotOptimization === true;
        }
        const optimizationFabEl = document.getElementById('wbap-settings-plot-optimization-fab');
        if (optimizationFabEl) {
            optimizationFabEl.checked = config.enablePlotOptimizationFloatButton === true;
        }

        // 三级优化开关
        const level3EnabledEl = document.getElementById('wbap-settings-level3-enabled');
        if (level3EnabledEl) {
            level3EnabledEl.checked = config.optimizationLevel3?.enabled === true;
        }

        // 根据启用状态展开/折叠设置区域
        setOptimizationSectionState(config.enablePlotOptimization === true);

        refreshOptimizationPromptList();
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
        const optimizationTimeoutEl = document.getElementById('wbap-optimization-timeout');
        if (optimizationTimeoutEl) optimizationTimeoutEl.value = optimizationApiConfig.timeout ?? 60;
        const optimizationRetriesEl = document.getElementById('wbap-optimization-max-retries');
        if (optimizationRetriesEl) optimizationRetriesEl.value = Number.isFinite(optimizationApiConfig.maxRetries) ? optimizationApiConfig.maxRetries : 2;
        const optimizationRetryDelayEl = document.getElementById('wbap-optimization-retry-delay');
        if (optimizationRetryDelayEl) optimizationRetryDelayEl.value = Number.isFinite(optimizationApiConfig.retryDelayMs) ? optimizationApiConfig.retryDelayMs : 800;
        const optimizationStreamingEl = document.getElementById('wbap-optimization-streaming');
        if (optimizationStreamingEl) optimizationStreamingEl.checked = optimizationApiConfig.enableStreaming !== false;
        populateOptimizationModelSelect([], optimizationApiConfig.model || '');

        renderApiEndpoints();
        renderAggregatorControls();

        // 自选模式开关
        const selectiveModeEnabledEl = document.getElementById('wbap-selective-mode-enabled');
        if (selectiveModeEnabledEl) {
            selectiveModeEnabledEl.checked = config.selectiveMode?.enabled === true;
        }

        refreshPromptList();
        refreshSecondaryPromptUI();
        refreshCabinetPromptList();
        loadTiagangSettingsToUI();
        if (WBAP.Optimization && typeof WBAP.Optimization.updateFloatingButtonVisibility === 'function') {
            WBAP.Optimization.updateFloatingButtonVisibility();
        }

        // 正文优化设置加载
        loadResponseOptimizerSettingsToUI();
    }

    function renderApiEndpoints() {
        const listContainer = document.getElementById('wbap-api-endpoint-list');
        if (!listContainer) return;

        const config = WBAP.CharacterManager.getCurrentCharacterConfig();
        const endpoints = getGlobalSelectiveEndpoints();
        const bindings = config?.selectiveMode?.endpointBindings || {};
        renderOptimizationEndpointOptions(config?.optimizationApiConfig?.selectedEndpointId || null);

        if (endpoints.length === 0) {
            listContainer.innerHTML = '<div class="wbap-empty-state"><p>没有API实例。请点击上方按钮添加一个。</p></div>';
            return;
        }

        listContainer.innerHTML = endpoints.map((ep) => {
            const binding = bindings[ep.id] || {};
            const worldBooks = Array.isArray(binding.worldBooks) ? binding.worldBooks : [];
            const entriesMap = binding.assignedEntriesMap || {};
            const entryCount = Object.values(entriesMap).reduce((sum, arr) => sum + (arr?.length || 0), 0);
            const worldBookDisplay = worldBooks.length > 0 ? worldBooks.join(', ') : '未选择';
            return `
            <div class="wbap-api-endpoint-item" data-id="${ep.id}">
                <div class="wbap-api-endpoint-header">
                    <label style="display:flex; gap:8px; align-items:center;">
                        <input type="checkbox" class="wbap-endpoint-enabled" data-id="${ep.id}" ${ep.enabled === false ? '' : 'checked'}>
                        <span>${ep.name}（${entryCount} 条，${worldBookDisplay}）</span>
                    </label>
                    <div>
                        <button class="wbap-btn wbap-btn-icon wbap-btn-danger wbap-btn-xs" onclick="window.wbapDeleteEndpoint('${ep.id}')" title="删除">
                            <i class="fa-solid fa-trash"></i>
                        </button>
                        <button class="wbap-btn wbap-btn-icon wbap-btn-xs" onclick="window.wbapEditEndpoint('${ep.id}')" title="编辑API实例">
                            <i class="fa-solid fa-pencil"></i>
                        </button>
                    </div>
                </div>
            </div>
        `}).join('');

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
            cfg.aggregatorMode = { enabled: false, endpointId: '', promptIndex: 0, allowDuplicate: false };
        } else if (cfg.aggregatorMode.allowDuplicate == null) {
            cfg.aggregatorMode.allowDuplicate = false;
        }

        const enabledEl = document.getElementById('wbap-agg-enabled');
        const endpointEl = document.getElementById('wbap-agg-endpoint');
        const promptEl = document.getElementById('wbap-agg-prompt');
        const allowDuplicateEl = document.getElementById('wbap-agg-allow-duplicate');
        if (!enabledEl || !endpointEl || !promptEl) return;

        enabledEl.checked = cfg.aggregatorMode.enabled === true;
        if (allowDuplicateEl) {
            allowDuplicateEl.checked = cfg.aggregatorMode.allowDuplicate === true;
        }

        const endpoints = getGlobalSelectiveEndpoints();
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

    function refreshOptimizationPromptList() {
        const selectEl = document.getElementById('wbap-opt-prompt-select');
        const descEl = document.getElementById('wbap-opt-prompt-desc');
        const editBtn = document.getElementById('wbap-opt-prompt-edit-btn');
        const exportBtn = document.getElementById('wbap-opt-prompt-export-btn');
        const deleteBtn = document.getElementById('wbap-opt-prompt-delete-btn');
        if (!selectEl || !descEl) return;

        const config = WBAP.CharacterManager ? WBAP.CharacterManager.getCurrentCharacterConfig() : WBAP.config;
        const level3Cfg = ensureOptimizationPromptConfig(config);
        const presets = level3Cfg.promptPresets || [];
        const hasPresets = presets.length > 0;

        selectEl.disabled = !hasPresets;
        if (editBtn) editBtn.disabled = !hasPresets;
        if (exportBtn) exportBtn.disabled = !hasPresets;
        if (deleteBtn) deleteBtn.disabled = !hasPresets;

        if (!hasPresets) {
            selectEl.innerHTML = '<option>无可用预设</option>';
            descEl.textContent = '请新建或导入一个提示词预设。';
            return;
        }

        let idx = level3Cfg.selectedPromptIndex || 0;
        if (idx >= presets.length) {
            idx = presets.length - 1;
            level3Cfg.selectedPromptIndex = idx;
            WBAP.saveConfig();
        }

        selectEl.innerHTML = presets.map((p, index) => `<option value="${index}">${p.name || `未命名预设 ${index + 1}`}</option>`).join('');
        selectEl.value = idx;
        descEl.textContent = presets[idx]?.description || '此预设没有描述。';
        WBAP.Optimization?.updatePromptLabel?.();
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
            const endpoints = getGlobalSelectiveEndpoints();
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
        const eps = endpoints || getGlobalSelectiveEndpoints();
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
        const endpoints = getGlobalSelectiveEndpoints();
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
        const endpoints = getGlobalSelectiveEndpoints();
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
        const endpoints = getGlobalSelectiveEndpoints();
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

    function updatePromptBindingSummary(selectedIds = []) {
        const bindingSummary = document.getElementById('wbap-prompt-binding-summary');
        if (!bindingSummary) return;
        const endpoints = getGlobalSelectiveEndpoints();
        const nameMap = new Map(endpoints.map(ep => [ep.id, ep.name || ep.id]));
        if (selectedIds.length === 0) {
            bindingSummary.textContent = '未绑定 API（将使用所有已配置实例）。';
        } else {
            const names = selectedIds.map(id => nameMap.get(id) || id);
            bindingSummary.textContent = `已绑定 ${selectedIds.length} 个 API：${names.join(', ')}`;
        }
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

    // 记忆模块状态刷新（首页卡片）
    function updateMemoryStatus() {
        const memStatus = document.getElementById('wbap-memory-status');
        if (memStatus) {
            const cfg = WBAP.CharacterManager?.getCurrentCharacterConfig?.() || WBAP.config;
            const enabled = cfg?.memoryModule?.enabled === true;
            memStatus.textContent = enabled ? '已启用' : '未启用';
            memStatus.classList.toggle('wbap-badge-success', enabled);
            memStatus.classList.add('wbap-badge');
        }
    }

    // 正文优化模块状态刷新（首页卡片）
    function updateResponseOptimizerStatus() {
        const statusEl = document.getElementById('wbap-resp-opt-status');
        if (statusEl) {
            const cfg = WBAP.CharacterManager?.getCurrentCharacterConfig?.() || WBAP.config;
            const respOptCfg = cfg?.responseOptimizer || {};
            const enabled = respOptCfg.enabled === true;
            statusEl.textContent = enabled ? '已启用' : '未启用';
            statusEl.classList.toggle('wbap-badge-success', enabled);
            statusEl.classList.add('wbap-badge');
        }
    }

    // 表格展示模块状态刷新（首页卡片）
    function updateTableDisplayStatus() {
        const statusEl = document.getElementById('wbap-table-display-status');
        if (statusEl) {
            const enabled = WBAP.TableDisplay && typeof WBAP.TableDisplay.isEnabled === 'function'
                ? WBAP.TableDisplay.isEnabled()
                : false;
            statusEl.textContent = enabled ? '已启用' : '未启用';
            statusEl.classList.toggle('wbap-badge-success', enabled);
            statusEl.classList.add('wbap-badge');
        }
        // 同步复选框状态
        const checkbox = document.getElementById('wbap-table-display-enabled');
        if (checkbox) {
            const enabled = WBAP.TableDisplay && typeof WBAP.TableDisplay.isEnabled === 'function'
                ? WBAP.TableDisplay.isEnabled()
                : false;
            checkbox.checked = enabled;
        }
        // 刷新表格总览
        if (WBAP.TableDisplay && typeof WBAP.TableDisplay.renderTableOverview === 'function') {
            WBAP.TableDisplay.renderTableOverview();
        }
    }

    function bindMemorySection() {
        const btn = document.getElementById('wbap-memory-open-btn');
        if (btn) {
            btn.onclick = () => {
                if (WBAP.MemoryModule?.openMemoryModal) {
                    WBAP.MemoryModule.openMemoryModal();
                }
            };
        }
        // 初始化状态
        updateMemoryStatus();
    }

    function closePromptEditor() {
        const modal = document.getElementById('wbap-prompt-editor-modal');
        if (modal) {
            modal.classList.remove('open');
            delete modal.dataset.scope;
        }
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
            .replace(/{role_name}/g, '[角色称号示例]')
            .replace(/{role_type}/g, '[角色类型示例]')
            .replace(/{endpoint_name}/g, '[端点名称示例]')
            .replace(/{model_name}/g, '[模型名称示例]')
            .replace(/{review_round}/g, '[轮次]')
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
        const editorModal = document.getElementById('wbap-prompt-editor-modal');
        const scope = editorModal?.dataset.scope || 'main';
        if (scope === 'cabinet') {
            saveCabinetPrompt();
            return;
        }
        if (scope === 'tiagang') {
            saveTiagangPrompt();
            return;
        }
        if (scope === 'responseOptimizer') {
            saveResponseOptimizerPrompt();
            return;
        }

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

    function saveCabinetPrompt() {
        const index = parseInt(document.getElementById('wbap-prompt-edit-index').value, 10);
        const name = document.getElementById('wbap-prompt-edit-name').value.trim();
        if (!name) {
            alert('模板名称不能为空。');
            return;
        }

        const config = WBAP.CharacterManager.getCurrentCharacterConfig();
        const superCfg = ensureSuperConcurrencyConfig(config);
        const prompts = Array.isArray(superCfg.prompts) ? superCfg.prompts : [];

        const newPromptData = {
            name: name,
            version: document.getElementById('wbap-prompt-edit-version').value,
            description: document.getElementById('wbap-prompt-edit-description').value,
            finalSystemDirective: document.getElementById('wbap-prompt-edit-final-directive').value,
            systemPrompt: document.getElementById('wbap-prompt-edit-system').value,
            mainPrompt: document.getElementById('wbap-prompt-edit-main').value,
            variables: {
                sulv1: document.getElementById('wbap-edit-var-sulv1')?.value || '',
                sulv2: document.getElementById('wbap-edit-var-sulv2')?.value || '',
                sulv3: document.getElementById('wbap-edit-var-sulv3')?.value || '',
                sulv4: document.getElementById('wbap-edit-var-sulv4')?.value || ''
            }
        };

        let targetIndex = index;
        const existingByName = prompts.findIndex(p => p.name === name);
        if (index >= 0 && index < prompts.length) {
            prompts[index] = newPromptData;
            if (existingByName >= 0 && existingByName !== index) {
                prompts.splice(existingByName, 1);
                if (existingByName < index) targetIndex = index - 1;
            }
        } else if (existingByName >= 0) {
            prompts[existingByName] = newPromptData;
            targetIndex = existingByName;
        } else {
            prompts.push(newPromptData);
            targetIndex = prompts.length - 1;
        }

        superCfg.selectedPromptIndex = targetIndex;
        superCfg.prompts = prompts;
        WBAP.saveConfig();
        refreshCabinetPromptList();
        closePromptEditor();
    }

    function deleteCabinetPrompt() {
        const config = WBAP.CharacterManager.getCurrentCharacterConfig();
        const superCfg = ensureSuperConcurrencyConfig(config);
        const prompts = Array.isArray(superCfg.prompts) ? superCfg.prompts : [];
        if (prompts.length <= 1) {
            alert('至少保留一个内阁提示词预设。');
            return;
        }
        const idx = superCfg.selectedPromptIndex || 0;
        const target = prompts[idx];
        if (!confirm(`确定删除预设「${target?.name || '未命名'}」？`)) return;
        prompts.splice(idx, 1);
        superCfg.selectedPromptIndex = Math.max(0, Math.min(idx, prompts.length - 1));
        superCfg.prompts = prompts;
        WBAP.saveConfig();
        refreshCabinetPromptList();
    }

    function exportCabinetPrompt() {
        const config = WBAP.CharacterManager.getCurrentCharacterConfig();
        const superCfg = ensureSuperConcurrencyConfig(config);
        const prompts = Array.isArray(superCfg.prompts) ? superCfg.prompts : [];
        const idx = superCfg.selectedPromptIndex || 0;
        const prompt = prompts[idx];
        if (!prompt) {
            alert('没有可导出的内阁提示词。');
            return;
        }
        const safeName = (prompt.name || 'cabinet_prompt').replace(/[\\/:*?"<>|]/g, '_');
        const dataStr = JSON.stringify(prompt, null, 2);
        const blob = new Blob([dataStr], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${safeName}.json`;
        a.click();
        URL.revokeObjectURL(url);
    }

    function importCabinetPrompt(prompt) {
        if (!prompt || typeof prompt !== 'object') {
            throw new Error('提示词内容无效。');
        }
        const parsed = {
            name: prompt.name || '导入内阁提示词',
            version: prompt.version || '',
            description: prompt.description || '',
            finalSystemDirective: prompt.finalSystemDirective || '',
            systemPrompt: prompt.systemPrompt || '',
            mainPrompt: prompt.mainPrompt || prompt.promptTemplate || ''
        };
        if (!parsed.systemPrompt && !parsed.mainPrompt) {
            throw new Error('提示词内容为空。');
        }
        parsed.variables = prompt.variables || { sulv1: '', sulv2: '', sulv3: '', sulv4: '' };

        const config = WBAP.CharacterManager.getCurrentCharacterConfig();
        const superCfg = ensureSuperConcurrencyConfig(config);
        const prompts = Array.isArray(superCfg.prompts) ? superCfg.prompts : [];
        prompts.push(parsed);
        superCfg.prompts = prompts;
        superCfg.selectedPromptIndex = prompts.length - 1;
        WBAP.saveConfig();
        refreshCabinetPromptList();
    }

    function saveTiagangPrompt() {
        const index = parseInt(document.getElementById('wbap-prompt-edit-index').value, 10);
        const name = document.getElementById('wbap-prompt-edit-name').value.trim();
        if (!name) {
            alert('\u6a21\u677f\u540d\u79f0\u4e0d\u80fd\u4e3a\u7a7a\u3002');
            return;
        }

        const config = WBAP.CharacterManager.getCurrentCharacterConfig();
        const tgCfg = ensureTiagangConfig(config);

        // 修复：从全局池读取和保存提示词
        const pools = WBAP.getGlobalPools();
        if (!pools.prompts) pools.prompts = {};
        if (!Array.isArray(pools.prompts.tiangang)) {
            pools.prompts.tiangang = [];
        }
        const prompts = pools.prompts.tiangang;

        const newPromptData = {
            name: name,
            version: document.getElementById('wbap-prompt-edit-version').value,
            description: document.getElementById('wbap-prompt-edit-description').value,
            finalSystemDirective: document.getElementById('wbap-prompt-edit-final-directive').value,
            systemPrompt: document.getElementById('wbap-prompt-edit-system').value,
            mainPrompt: document.getElementById('wbap-prompt-edit-main').value,
            variables: {
                sulv1: document.getElementById('wbap-edit-var-sulv1')?.value || '',
                sulv2: document.getElementById('wbap-edit-var-sulv2')?.value || '',
                sulv3: document.getElementById('wbap-edit-var-sulv3')?.value || '',
                sulv4: document.getElementById('wbap-edit-var-sulv4')?.value || ''
            }
        };

        let targetIndex = index;
        const existingByName = prompts.findIndex(p => p.name === name);
        if (index >= 0 && index < prompts.length) {
            prompts[index] = newPromptData;
            if (existingByName >= 0 && existingByName !== index) {
                prompts.splice(existingByName, 1);
                if (existingByName < index) targetIndex = index - 1;
            }
        } else if (existingByName >= 0) {
            prompts[existingByName] = newPromptData;
            targetIndex = existingByName;
        } else {
            prompts.push(newPromptData);
            targetIndex = prompts.length - 1;
        }

        tgCfg.selectedPromptIndex = targetIndex;
        WBAP.saveConfig();
        refreshTiagangPromptList();
        closePromptEditor();
    }

    function deleteTiagangPrompt() {
        const config = WBAP.CharacterManager.getCurrentCharacterConfig();
        const tgCfg = ensureTiagangConfig(config);

        // 修复：从全局池读取和删除提示词
        const pools = WBAP.getGlobalPools();
        const prompts = Array.isArray(pools.prompts?.tiangang) ? pools.prompts.tiangang : [];

        if (prompts.length <= 1) {
            alert('\u81f3\u5c11\u4fdd\u7559\u4e00\u4e2a\u5929\u7eb2\u63d0\u793a\u8bcd\u9884\u8bbe\u3002');
            return;
        }
        const idx = tgCfg.selectedPromptIndex || 0;
        const target = prompts[idx];
        if (!confirm(`\u786e\u5b9a\u5220\u9664\u9884\u8bbe\u300c${target?.name || '\u672a\u547d\u540d'}\u300d\u5417\uff1f`)) return;
        prompts.splice(idx, 1);
        tgCfg.selectedPromptIndex = Math.max(0, Math.min(idx, prompts.length - 1));
        WBAP.saveConfig();
        refreshTiagangPromptList();
    }

    function exportTiagangPrompt() {
        const config = WBAP.CharacterManager.getCurrentCharacterConfig();
        const tgCfg = ensureTiagangConfig(config);

        // 修复：从全局池读取提示词
        const pools = WBAP.getGlobalPools();
        const prompts = Array.isArray(pools.prompts?.tiangang) ? pools.prompts.tiangang : [];

        const idx = tgCfg.selectedPromptIndex ?? 0;
        const prompt = prompts[idx];
        if (!prompt) {
            alert('\u6ca1\u6709\u53ef\u5bfc\u51fa\u7684\u5929\u7eb2\u63d0\u793a\u8bcd\u3002');
            return;
        }
        const safeName = (prompt.name || 'tiangang_prompt').replace(/[\\/:*?\"<>|]/g, '_');
        const dataStr = JSON.stringify(prompt, null, 2);
        const blob = new Blob([dataStr], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${safeName}.json`;
        a.click();
        URL.revokeObjectURL(url);
    }

    function importTiagangPrompt(prompt) {
        if (!prompt || typeof prompt !== 'object') {
            throw new Error('\u63d0\u793a\u8bcd\u5185\u5bb9\u65e0\u6548\u3002');
        }
        const parsed = {
            name: prompt.name || '\u5bfc\u5165\u5929\u7eb2\u63d0\u793a\u8bcd',
            version: prompt.version || '',
            description: prompt.description || '',
            finalSystemDirective: prompt.finalSystemDirective || '',
            systemPrompt: prompt.systemPrompt || '',
            mainPrompt: prompt.mainPrompt || prompt.promptTemplate || ''
        };
        if (!parsed.systemPrompt && !parsed.mainPrompt) {
            throw new Error('\u63d0\u793a\u8bcd\u5185\u5bb9\u4e3a\u7a7a\u3002');
        }
        parsed.variables = prompt.variables || { sulv1: '', sulv2: '', sulv3: '', sulv4: '' };

        // 修复：存储到全局提示词池而不是角色配置
        const pools = WBAP.getGlobalPools();
        if (!pools.prompts) pools.prompts = {};
        if (!Array.isArray(pools.prompts.tiangang)) {
            pools.prompts.tiangang = [];
        }

        // 检查是否已存在同名提示词
        const existingIndex = pools.prompts.tiangang.findIndex(p => p.name === parsed.name);
        if (existingIndex >= 0) {
            // 如果存在同名，询问是否覆盖
            if (confirm(`已存在名为"${parsed.name}"的天纲提示词，是否覆盖？`)) {
                pools.prompts.tiangang[existingIndex] = parsed;
            } else {
                // 不覆盖则添加序号
                let newName = parsed.name;
                let counter = 2;
                while (pools.prompts.tiangang.some(p => p.name === newName)) {
                    newName = `${parsed.name} (${counter})`;
                    counter++;
                }
                parsed.name = newName;
                pools.prompts.tiangang.push(parsed);
            }
        } else {
            pools.prompts.tiangang.push(parsed);
        }

        // 更新角色配置的选中索引
        const config = WBAP.CharacterManager.getCurrentCharacterConfig();
        const tgCfg = ensureTiagangConfig(config);
        const newIndex = pools.prompts.tiangang.findIndex(p => p.name === parsed.name);
        if (newIndex >= 0) {
            tgCfg.selectedPromptIndex = newIndex;
        }

        WBAP.saveConfig();
        refreshTiagangPromptList();
        Logger.log(`天纲提示词"${parsed.name}"已成功导入到全局池`);
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
    let progressTasks = new Map(); // 存储所有任务 { id: { name, status, progress, startTime, timerInterval, completed } }
    let totalTaskCount = 0; // 总任务数
    let cancelAllCallbacks = []; // 取消全部任务的回调数组（支持多个模块）
    let cancelTaskCallbacks = new Map(); // 单个任务取消回调 { taskId: callback }

    function setCancelAllCallback(callback) {
        if (callback && typeof callback === 'function') {
            // 添加到回调数组，而不是覆盖
            cancelAllCallbacks.push(callback);
        }
    }

    function clearCancelAllCallbacks() {
        cancelAllCallbacks = [];
    }

    function setCancelTaskCallback(taskId, callback) {
        if (callback) {
            cancelTaskCallbacks.set(taskId, callback);
        } else {
            cancelTaskCallbacks.delete(taskId);
        }
    }

    function triggerCancelAll() {
        if (cancelAllCallbacks.length > 0) {
            // 调用所有注册的取消回调
            cancelAllCallbacks.forEach(callback => {
                if (typeof callback === 'function') {
                    try {
                        callback();
                    } catch (e) {
                        console.error('[进度面板] 取消回调执行失败:', e);
                    }
                }
            });
            // 更新 UI 状态
            const statusEl = document.getElementById('wbap-progress-status');
            if (statusEl) statusEl.textContent = '正在取消...';
        }
    }

    function triggerCancelTask(taskId) {
        const callback = cancelTaskCallbacks.get(taskId);
        if (callback && typeof callback === 'function') {
            callback(taskId);
            // 更新任务 UI
            updateProgressTask(taskId, '取消中...', progressTasks.get(taskId)?.progress || 0);
        }
    }

    function isProgressPanelOpen() {
        const panel = document.getElementById('wbap-progress-panel');
        return panel && panel.classList.contains('open');
    }

    function addToTotalTaskCount(count) {
        if (count <= 0) return;
        totalTaskCount += count;
        const taskCountEl = document.getElementById('wbap-progress-task-count');
        if (taskCountEl) {
            let completedCount = 0;
            progressTasks.forEach(task => {
                if (task.completed) completedCount++;
            });
            taskCountEl.textContent = `${completedCount}/${totalTaskCount}`;
        }
    }

    function showProgressPanel(message = '正在处理...', taskCount = 0) {
        const panel = document.getElementById('wbap-progress-panel');
        if (!panel) return;
        bindProgressPanelEvents();

        // 重置状态
        const titleEl = document.getElementById('wbap-progress-title');
        const barEl = document.getElementById('wbap-progress-bar');
        const statusEl = document.getElementById('wbap-progress-status');
        const percentEl = document.getElementById('wbap-progress-percent');
        const timerEl = document.getElementById('wbap-progress-timer');
        const tasksEl = document.getElementById('wbap-progress-tasks');
        const taskCountEl = document.getElementById('wbap-progress-task-count');

        if (titleEl) titleEl.textContent = message;
        if (barEl) {
            barEl.style.width = '0%';
            barEl.classList.add('animated');
            barEl.classList.remove('completed'); // 重置完成状态
        }
        if (statusEl) statusEl.textContent = '准备中...';
        if (percentEl) percentEl.textContent = '0%';
        if (timerEl) timerEl.textContent = '0.000s';
        if (tasksEl) tasksEl.innerHTML = '';
        if (taskCountEl) taskCountEl.textContent = `0/${taskCount}`;

        // 清空任务列表和回调
        progressTasks.forEach(task => {
            if (task.timerInterval) clearInterval(task.timerInterval);
        });
        progressTasks.clear();
        cancelTaskCallbacks.clear();
        cancelAllCallbacks = []; // 清空所有取消回调，准备接收新的回调
        totalTaskCount = taskCount;

        panel.classList.add('open');

        // 启动主计时器（毫秒精度，~60fps）
        if (progressTimer) clearInterval(progressTimer);
        progressStartTime = Date.now();
        progressTimer = setInterval(() => {
            const elapsed = Date.now() - progressStartTime;
            const seconds = (elapsed / 1000).toFixed(3);
            if (timerEl) timerEl.textContent = `${seconds}s`;
        }, 16);
    }

    function updateProgressPanel(percent, statusText) {
        const bar = document.getElementById('wbap-progress-bar');
        const statusEl = document.getElementById('wbap-progress-status');
        const percentEl = document.getElementById('wbap-progress-percent');

        if (bar) {
            bar.style.width = `${Math.min(100, Math.max(0, percent))}%`;
            if (percent >= 100) {
                bar.classList.remove('animated');
                bar.classList.add('completed');
            }
        }
        if (percentEl) {
            percentEl.textContent = `${Math.round(percent)}%`;
        }
        if (statusEl && statusText) {
            statusEl.textContent = statusText;
        }
    }

    function updateTaskCount() {
        const taskCountEl = document.getElementById('wbap-progress-task-count');
        if (!taskCountEl) return;

        let completedCount = 0;
        progressTasks.forEach(task => {
            if (task.completed) completedCount++;
        });
        taskCountEl.textContent = `${completedCount}/${totalTaskCount || progressTasks.size}`;

        // 自动更新总进度条
        if (totalTaskCount > 0) {
            const overallPercent = (completedCount / totalTaskCount) * 100;
            updateProgressPanel(overallPercent, completedCount >= totalTaskCount ? '全部完成' : `已完成 ${completedCount}/${totalTaskCount}`);
        }
    }

    function addProgressTask(taskId, taskName, initialStatus = '等待中...') {
        const tasksEl = document.getElementById('wbap-progress-tasks');
        if (!tasksEl) return;

        // 创建任务卡片
        const taskCard = document.createElement('div');
        taskCard.className = 'wbap-progress-task-card';
        taskCard.id = `wbap-task-${taskId}`;
        taskCard.innerHTML = `
            <div class="wbap-task-header">
                <span class="wbap-task-name" title="${taskName}">${taskName}</span>
                <div class="wbap-task-actions">
                    <button class="wbap-task-cancel-btn" id="wbap-task-cancel-${taskId}" title="取消此任务">
                        <i class="fa-solid fa-xmark"></i>
                    </button>
                    <span class="wbap-task-timer" id="wbap-task-timer-${taskId}">0.000s</span>
                </div>
            </div>
            <div class="wbap-task-bar-container">
                <div class="wbap-task-bar" id="wbap-task-bar-${taskId}">
                    <div class="wbap-task-glow"></div>
                    <div class="wbap-task-shimmer"></div>
                </div>
            </div>
            <div class="wbap-task-footer">
                <span class="wbap-task-status" id="wbap-task-status-${taskId}">${initialStatus}</span>
                <span class="wbap-task-percent" id="wbap-task-percent-${taskId}">0%</span>
            </div>
        `;
        tasksEl.appendChild(taskCard);

        // 绑定单个任务取消按钮
        const cancelBtn = document.getElementById(`wbap-task-cancel-${taskId}`);
        if (cancelBtn) {
            cancelBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                triggerCancelTask(taskId);
            });
        }

        // 启动任务计时器（毫秒精度）
        const taskStartTime = Date.now();
        const timerInterval = setInterval(() => {
            const timerEl = document.getElementById(`wbap-task-timer-${taskId}`);
            if (timerEl) {
                const elapsed = Date.now() - taskStartTime;
                timerEl.textContent = `${(elapsed / 1000).toFixed(3)}s`;
            }
        }, 16);

        // 存储任务信息
        progressTasks.set(taskId, {
            name: taskName,
            status: initialStatus,
            progress: 0,
            startTime: taskStartTime,
            timerInterval: timerInterval,
            completed: false
        });

        // 更新任务计数
        updateTaskCount();

        // 滚动到最新任务
        tasksEl.scrollTop = tasksEl.scrollHeight;
    }

    function updateProgressTask(taskId, status, progress) {
        const task = progressTasks.get(taskId);
        if (!task) return;

        const barEl = document.getElementById(`wbap-task-bar-${taskId}`);
        const statusEl = document.getElementById(`wbap-task-status-${taskId}`);
        const percentEl = document.getElementById(`wbap-task-percent-${taskId}`);
        const cardEl = document.getElementById(`wbap-task-${taskId}`);

        if (barEl) {
            barEl.style.width = `${Math.min(100, Math.max(0, progress))}%`;
            if (progress >= 100) {
                barEl.classList.add('completed');
            }
        }
        if (statusEl && status) {
            statusEl.textContent = status;
        }
        if (percentEl) {
            percentEl.textContent = `${Math.round(progress)}%`;
        }

        // 任务完成处理
        if (cardEl && progress >= 100 && !task.completed) {
            cardEl.classList.add('completed');
            task.completed = true;
            // 停止该任务的计时器
            if (task.timerInterval) {
                clearInterval(task.timerInterval);
                task.timerInterval = null;
            }
            // 隐藏取消按钮
            const cancelBtn = document.getElementById(`wbap-task-cancel-${taskId}`);
            if (cancelBtn) cancelBtn.style.display = 'none';
            // 清理取消回调
            cancelTaskCallbacks.delete(taskId);
            // 更新任务计数
            updateTaskCount();
        }

        // 更新任务状态
        task.status = status || task.status;
        task.progress = progress;
    }

    function removeProgressTask(taskId) {
        const task = progressTasks.get(taskId);
        if (task && task.timerInterval) {
            clearInterval(task.timerInterval);
        }
        progressTasks.delete(taskId);
        cancelTaskCallbacks.delete(taskId); // 清理取消回调

        const cardEl = document.getElementById(`wbap-task-${taskId}`);
        if (cardEl) {
            cardEl.classList.add('removing');
            setTimeout(() => cardEl.remove(), 300);
        }

        // 更新任务计数
        updateTaskCount();
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
        // 清理所有任务计时器
        progressTasks.forEach(task => {
            if (task.timerInterval) clearInterval(task.timerInterval);
        });
        progressTasks.clear();
        cancelTaskCallbacks.clear();
        cancelAllCallbacks = []; // 清空所有取消回调
        totalTaskCount = 0;
    }


    function makeElementDraggable(element, handle) {
        const dragHandle = handle || element;
        const margin = 8;
        let pointerId = null;
        let startX = 0;
        let startY = 0;
        let startLeft = 0;
        let startTop = 0;
        let panelWidth = 0;
        let panelHeight = 0;
        let rafId = null;
        let pending = null;

        dragHandle.style.cursor = 'move';
        dragHandle.style.touchAction = 'none';

        const applyPosition = () => {
            if (!pending) return;
            element.style.left = `${pending.left}px`;
            element.style.top = `${pending.top}px`;
            element.style.right = 'auto';
            element.style.bottom = 'auto';
            element.style.margin = '0';
            pending = null;
            rafId = null;
        };

        const onPointerDown = (e) => {
            if (pointerId !== null) return;
            if (e.button !== undefined && e.button !== 0) return;
            if (e.target.closest?.('button, input, textarea, select, a')) return;
            if (['BUTTON', 'INPUT', 'TEXTAREA', 'SELECT', 'A'].includes(e.target.tagName)) return;

            const rect = element.getBoundingClientRect();
            element.style.left = `${rect.left}px`;
            element.style.top = `${rect.top}px`;
            element.style.right = 'auto';
            element.style.bottom = 'auto';
            element.style.margin = '0';

            startX = e.clientX;
            startY = e.clientY;
            startLeft = rect.left;
            startTop = rect.top;
            panelWidth = rect.width;
            panelHeight = rect.height;
            pointerId = e.pointerId;

            element.classList.add('wbap-progress-dragging');
            dragHandle.setPointerCapture?.(pointerId);
            e.preventDefault();
        };

        const onPointerMove = (e) => {
            if (pointerId === null || e.pointerId !== pointerId) return;
            const dx = e.clientX - startX;
            const dy = e.clientY - startY;
            const maxLeft = Math.max(margin, window.innerWidth - panelWidth - margin);
            const maxTop = Math.max(margin, window.innerHeight - panelHeight - margin);
            const nextLeft = Math.min(maxLeft, Math.max(margin, startLeft + dx));
            const nextTop = Math.min(maxTop, Math.max(margin, startTop + dy));

            pending = { left: nextLeft, top: nextTop };
            if (!rafId) {
                rafId = requestAnimationFrame(applyPosition);
            }
            e.preventDefault();
        };

        const onPointerUp = (e) => {
            if (pointerId === null || e.pointerId !== pointerId) return;
            pointerId = null;
            element.classList.remove('wbap-progress-dragging');
            if (rafId) {
                cancelAnimationFrame(rafId);
                rafId = null;
            }
            applyPosition();
            dragHandle.releasePointerCapture?.(e.pointerId);
        };

        dragHandle.addEventListener('pointerdown', onPointerDown);
        dragHandle.addEventListener('pointermove', onPointerMove);
        dragHandle.addEventListener('pointerup', onPointerUp);
        dragHandle.addEventListener('pointercancel', onPointerUp);
    }

    function makeElementResizable(element, handle, direction = 'se') {
        if (!handle) return;

        // 响应式边距和尺寸限制
        const isMobile = window.innerWidth <= 767;
        const margin = isMobile ? 10 : 8;
        const minWidth = isMobile ? 280 : 280;
        const minHeight = isMobile ? 180 : 220;

        // 移动端的最大尺寸限制
        const getMaxDimensions = () => {
            const vw = window.innerWidth;
            const vh = window.innerHeight;

            if (isMobile) {
                // 移动端：宽度最大为屏幕宽度减去边距，高度最大为60vh
                return {
                    maxWidth: vw - (margin * 2),
                    maxHeight: Math.min(vh * 0.6, vh - 100) // 60vh 或者屏幕高度减去100px
                };
            } else {
                // 桌面端：更宽松的限制
                return {
                    maxWidth: vw - (margin * 2),
                    maxHeight: vh * 0.8 // 80vh
                };
            }
        };

        let pointerId = null;
        let startX = 0;
        let startY = 0;
        let startWidth = 0;
        let startHeight = 0;
        let startLeft = 0;
        let startTop = 0;
        let rafId = null;
        let pending = null;

        handle.style.touchAction = 'none';

        const applySize = () => {
            if (!pending) return;
            element.style.width = `${pending.width}px`;
            element.style.height = `${pending.height}px`;
            if (pending.left !== undefined) element.style.left = `${pending.left}px`;
            if (pending.top !== undefined) element.style.top = `${pending.top}px`;
            element.style.maxWidth = 'none';
            element.style.maxHeight = 'none';
            pending = null;
            rafId = null;
        };

        const onPointerDown = (e) => {
            if (pointerId !== null) return;
            if (e.button !== undefined && e.button !== 0) return;
            e.stopPropagation();

            const rect = element.getBoundingClientRect();
            element.style.left = `${rect.left}px`;
            element.style.top = `${rect.top}px`;
            element.style.right = 'auto';
            element.style.bottom = 'auto';
            element.style.margin = '0';

            startX = e.clientX;
            startY = e.clientY;
            startWidth = rect.width;
            startHeight = rect.height;
            startLeft = rect.left;
            startTop = rect.top;
            pointerId = e.pointerId;

            element.classList.add('wbap-progress-resizing');
            handle.setPointerCapture?.(pointerId);
            e.preventDefault();
        };

        const onPointerMove = (e) => {
            if (pointerId === null || e.pointerId !== pointerId) return;
            const dx = e.clientX - startX;
            const dy = e.clientY - startY;

            let nextWidth, nextHeight, nextLeft, nextTop;
            const { maxWidth: absoluteMaxWidth, maxHeight: absoluteMaxHeight } = getMaxDimensions();

            // 根据方向计算新的尺寸和位置
            if (direction === 'se') {
                // 右下角：增加宽高
                const maxWidth = Math.min(
                    absoluteMaxWidth,
                    Math.max(minWidth, window.innerWidth - startLeft - margin)
                );
                const maxHeight = Math.min(
                    absoluteMaxHeight,
                    Math.max(minHeight, window.innerHeight - startTop - margin)
                );
                nextWidth = Math.min(maxWidth, Math.max(minWidth, startWidth + dx));
                nextHeight = Math.min(maxHeight, Math.max(minHeight, startHeight + dy));
                nextLeft = startLeft;
                nextTop = startTop;
            } else if (direction === 'sw') {
                // 左下角：左边界移动，宽度反向变化
                const maxWidth = Math.min(
                    absoluteMaxWidth,
                    Math.max(minWidth, startLeft + startWidth - margin)
                );
                const maxHeight = Math.min(
                    absoluteMaxHeight,
                    Math.max(minHeight, window.innerHeight - startTop - margin)
                );
                nextWidth = Math.min(maxWidth, Math.max(minWidth, startWidth - dx));
                nextHeight = Math.min(maxHeight, Math.max(minHeight, startHeight + dy));
                nextLeft = startLeft + startWidth - nextWidth;
                nextTop = startTop;
            } else if (direction === 'ne') {
                // 右上角：上边界移动，高度反向变化
                const maxWidth = Math.min(
                    absoluteMaxWidth,
                    Math.max(minWidth, window.innerWidth - startLeft - margin)
                );
                const maxHeight = Math.min(
                    absoluteMaxHeight,
                    Math.max(minHeight, startTop + startHeight - margin)
                );
                nextWidth = Math.min(maxWidth, Math.max(minWidth, startWidth + dx));
                nextHeight = Math.min(maxHeight, Math.max(minHeight, startHeight - dy));
                nextLeft = startLeft;
                nextTop = startTop + startHeight - nextHeight;
            } else if (direction === 'nw') {
                // 左上角：左边界和上边界都移动
                const maxWidth = Math.min(
                    absoluteMaxWidth,
                    Math.max(minWidth, startLeft + startWidth - margin)
                );
                const maxHeight = Math.min(
                    absoluteMaxHeight,
                    Math.max(minHeight, startTop + startHeight - margin)
                );
                nextWidth = Math.min(maxWidth, Math.max(minWidth, startWidth - dx));
                nextHeight = Math.min(maxHeight, Math.max(minHeight, startHeight - dy));
                nextLeft = startLeft + startWidth - nextWidth;
                nextTop = startTop + startHeight - nextHeight;
            }

            pending = { width: nextWidth, height: nextHeight, left: nextLeft, top: nextTop };
            if (!rafId) {
                rafId = requestAnimationFrame(applySize);
            }
            e.preventDefault();
        };

        const onPointerUp = (e) => {
            if (pointerId === null || e.pointerId !== pointerId) return;
            pointerId = null;
            element.classList.remove('wbap-progress-resizing');
            if (rafId) {
                cancelAnimationFrame(rafId);
                rafId = null;
            }
            applySize();
            handle.releasePointerCapture?.(e.pointerId);
        };

        handle.addEventListener('pointerdown', onPointerDown);
        handle.addEventListener('pointermove', onPointerMove);
        handle.addEventListener('pointerup', onPointerUp);
        handle.addEventListener('pointercancel', onPointerUp);
    }

    function bindProgressPanelEvents() {
        const panel = document.getElementById('wbap-progress-panel');
        if (panel) {
            if (panel.getAttribute('data-wbap-bound') === 'true') return;
            // Make the entire panel draggable
            const dragHandle = panel.querySelector('.wbap-progress-header');
            makeElementDraggable(panel, dragHandle || panel);

            // Make resizable from all four corners
            const resizeHandles = panel.querySelectorAll('.wbap-resize-handle');
            resizeHandles.forEach(handle => {
                const direction = handle.dataset.direction || 'se';
                makeElementResizable(panel, handle, direction);
            });

            // Close button
            const closeBtn = document.getElementById('wbap-progress-close');
            if (closeBtn) {
                closeBtn.addEventListener('click', hideProgressPanel);
            }

            // Cancel all button
            const cancelAllBtn = document.getElementById('wbap-progress-cancel-all');
            if (cancelAllBtn) {
                cancelAllBtn.addEventListener('click', triggerCancelAll);
            }

            panel.setAttribute('data-wbap-bound', 'true');
        }
    }

    // Expose functions global
    window.WBAP.UI = {
        injectUI,
        renderApiEndpoints,
        loadSettingsToUI,
        refreshPromptList,
        refreshOptimizationPromptList,
        refreshSecondaryPromptUI,
        refreshTiagangPromptList,
        updateMemoryStatus,
        isProgressPanelOpen,
        addToTotalTaskCount,
        showProgressPanel,
        updateProgressPanel,
        hideProgressPanel,
        addProgressTask,
        updateProgressTask,
        removeProgressTask,
        setCancelAllCallback,
        clearCancelAllCallbacks,
        setCancelTaskCallback,
        getWorldBookDisplayName,
        openApiEndpointEditor: (presetValue, onSave) => {
            const modal = document.getElementById('wbap-endpoint-editor-modal');
            if (!modal) return;
            const nameInput = document.getElementById('wbap-endpoint-edit-name');
            const urlInput = document.getElementById('wbap-endpoint-edit-url');
            const keyInput = document.getElementById('wbap-endpoint-edit-key');
            const modelInput = document.getElementById('wbap-endpoint-edit-model');
            const maxTokensInput = document.getElementById('wbap-endpoint-edit-max-tokens');
            const tempInput = document.getElementById('wbap-endpoint-edit-temperature');
            if (nameInput) nameInput.value = presetValue || '';
            if (urlInput) urlInput.value = '';
            if (keyInput) keyInput.value = '';
            if (modelInput) modelInput.value = '';
            if (maxTokensInput) maxTokensInput.value = '2000';
            if (tempInput) tempInput.value = '0.7';
            modal.classList.add('open');
            syncMobileRootFix();
            const saveBtn = document.getElementById('wbap-endpoint-editor-save');
            const originalSave = saveBtn.onclick;
            saveBtn.onclick = () => {
                const endpointId = nameInput?.value?.trim() || presetValue || '';
                if (typeof onSave === 'function') onSave(endpointId);
                modal.classList.remove('open');
                syncMobileRootFix();
                saveBtn.onclick = originalSave;
            };
        }
    };
    // root alias for other modules
    window.WBAP.openApiEndpointEditor = window.WBAP.UI.openApiEndpointEditor;
    window.WBAP.syncMobileRootFix = syncMobileRootFix;

    function openCabinetPromptEditor(index) {
        const editorModal = document.getElementById('wbap-prompt-editor-modal');
        if (!editorModal) return;
        editorModal.dataset.scope = 'cabinet';
        document.getElementById('wbap-prompt-edit-index').value = index;

        const config = WBAP.CharacterManager.getCurrentCharacterConfig();
        const superCfg = ensureSuperConcurrencyConfig(config);
        const prompts = Array.isArray(superCfg.prompts) ? superCfg.prompts : [];
        const prompt = index >= 0 ? prompts[index] : null;

        if (index === -1 || !prompt) {
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
            editorModal.querySelector('h3').textContent = '新建内阁提示词';
        } else {
            document.getElementById('wbap-prompt-edit-name').value = prompt.name || '';
            document.getElementById('wbap-prompt-edit-version').value = prompt.version || '';
            document.getElementById('wbap-prompt-edit-description').value = prompt.description || '';
            document.getElementById('wbap-prompt-edit-final-directive').value = prompt.finalSystemDirective || '';
            document.getElementById('wbap-prompt-edit-system').value = prompt.systemPrompt || '';
            document.getElementById('wbap-prompt-edit-main').value = prompt.mainPrompt || prompt.promptTemplate || '';
            const vars = prompt.variables || {};
            document.getElementById('wbap-edit-var-sulv1').value = vars.sulv1 || '';
            document.getElementById('wbap-edit-var-sulv2').value = vars.sulv2 || '';
            document.getElementById('wbap-edit-var-sulv3').value = vars.sulv3 || '';
            document.getElementById('wbap-edit-var-sulv4').value = vars.sulv4 || '';
            editorModal.querySelector('h3').textContent = '编辑内阁提示词';
        }

        updateCharCounts();
        updatePreview();
        editorModal.classList.add('open');
        syncMobileRootFix();
        setTimeout(() => {
            document.getElementById('wbap-prompt-edit-name')?.focus();
        }, 100);
    }

    function openTiagangPromptEditor(index) {
        const editorModal = document.getElementById('wbap-prompt-editor-modal');
        if (!editorModal) return;
        editorModal.dataset.scope = 'tiagang';
        document.getElementById('wbap-prompt-edit-index').value = index;

        const config = WBAP.CharacterManager.getCurrentCharacterConfig();
        const tgCfg = ensureTiagangConfig(config);

        // 修复：从全局池读取提示词
        const pools = WBAP.getGlobalPools();
        const prompts = Array.isArray(pools.prompts?.tiangang) ? pools.prompts.tiangang : [];

        const prompt = index >= 0 ? prompts[index] : null;

        if (index === -1 || !prompt) {
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
            editorModal.querySelector('h3').textContent = '\u65b0\u5efa\u5929\u7eb2\u63d0\u793a\u8bcd';
        } else {
            document.getElementById('wbap-prompt-edit-name').value = prompt.name || '';
            document.getElementById('wbap-prompt-edit-version').value = prompt.version || '';
            document.getElementById('wbap-prompt-edit-description').value = prompt.description || '';
            document.getElementById('wbap-prompt-edit-final-directive').value = prompt.finalSystemDirective || '';
            document.getElementById('wbap-prompt-edit-system').value = prompt.systemPrompt || '';
            document.getElementById('wbap-prompt-edit-main').value = prompt.mainPrompt || prompt.promptTemplate || '';
            const vars = prompt.variables || {};
            document.getElementById('wbap-edit-var-sulv1').value = vars.sulv1 || '';
            document.getElementById('wbap-edit-var-sulv2').value = vars.sulv2 || '';
            document.getElementById('wbap-edit-var-sulv3').value = vars.sulv3 || '';
            document.getElementById('wbap-edit-var-sulv4').value = vars.sulv4 || '';
            editorModal.querySelector('h3').textContent = '\u7f16\u8f91\u5929\u7eb2\u63d0\u793a\u8bcd';
        }

        updateCharCounts();
        updatePreview();
        editorModal.classList.add('open');
        syncMobileRootFix();
        setTimeout(() => {
            document.getElementById('wbap-prompt-edit-name')?.focus();
        }, 100);
    }

    window.wbapEditPrompt = (index) => {
        const editorModal = document.getElementById('wbap-prompt-editor-modal');
        if (!editorModal) return;
        editorModal.dataset.scope = 'main';
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
        const endpoints = getGlobalSelectiveEndpoints();
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
        if (endpoint.dedupe === undefined) {
            endpoint.dedupe = true;
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

    function renderSelectedWorldbooks() {
        const container = document.getElementById('wbap-endpoint-selected-worldbooks');
        if (!container) {
            Logger.warn('[自选模式] 找不到世界书显示容器 #wbap-endpoint-selected-worldbooks');
            return;
        }

        // 确保 currentEditingBinding 已初始化
        if (!currentEditingBinding) {
            Logger.warn('[自选模式] currentEditingBinding 未初始化');
            container.innerHTML = '<small class="wbap-text-muted">配置加载中...</small>';
            return;
        }

        // 确保 worldBooks 是数组
        if (!Array.isArray(currentEditingBinding.worldBooks)) {
            Logger.warn('[自选模式] currentEditingBinding.worldBooks 不是数组:', currentEditingBinding.worldBooks);
            currentEditingBinding.worldBooks = [];
        }

        Logger.log(`[自选模式] 渲染已选择的世界书: ${currentEditingBinding.worldBooks.length} 本`, currentEditingBinding.worldBooks);

        if (currentEditingBinding.worldBooks.length === 0) {
            container.innerHTML = '<small class="wbap-text-muted">尚未选择世界书</small>';
            return;
        }

        container.innerHTML = currentEditingBinding.worldBooks.map(name => `
            <span class="wbap-tag" style="background: var(--wbap-bg-secondary, #2a2a3a); padding: 4px 8px; border-radius: 12px; display: inline-flex; align-items: center; gap: 6px;">
                <span>${name}</span>
                <button type="button" data-remove-book="${name}" class="wbap-btn wbap-btn-xs wbap-btn-icon" style="padding: 0 6px;">&times;</button>
            </span>
        `).join('');
    }

    // 将世界书名称转换为友好的显示名（去掉路径，保留文件名主体）
    function getWorldBookDisplayName(bookName) {
        if (!bookName) return '';
        // 去掉路径分隔符后的文件名
        const base = bookName.replace(/\\/g, '/').split('/').pop() || bookName;
        // 去掉常见扩展名
        return base.replace(/\.(json|lorebook)$/i, '');
    }

    // Helpers to detect and normalize table-style worldbooks (UI layer)
    function uiIsTableWorldBook(book) {
        if (!book || !book.entries) return false;
        const entries = Object.values(book.entries).filter(e => e && e.disable !== true);
        if (entries.length === 0) return false;
        const comments = entries.map(e => e.comment || '');

        // 检查是否是插件生成的总结书
        const hasSummaryEntries = comments.some(c => c.endsWith('楼小总结') || c.endsWith('楼大总结'));
        if (hasSummaryEntries) return true;

        // 检查是否是 Amily 表格书
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

        // 识别插件生成的总结书条目
        if (trimmed.endsWith('楼小总结')) {
            return '小总结';
        }
        if (trimmed.endsWith('楼大总结')) {
            return '大总结';
        }

        // 原有逻辑
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

    async function displayEntriesForBook(bookName) {
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

        const selected = new Set(currentEditingBinding.assignedEntriesMap?.[bookName] || []);
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

            // 先计算插件总结书的楼层范围
            const summaryRanges = { '大总结': { min: Infinity, max: -Infinity }, '小总结': { min: Infinity, max: -Infinity } };
            entries.forEach(([uid, entry]) => {
                const colName = uiNormalizeColumnName(entry.comment, uid);
                if (colName === '大总结' || colName === '小总结') {
                    const comment = entry.comment || '';
                    const match = comment.match(/^(\d+)-(\d+)楼/);
                    if (match) {
                        const start = parseInt(match[1]);
                        const end = parseInt(match[2]);
                        summaryRanges[colName].min = Math.min(summaryRanges[colName].min, start);
                        summaryRanges[colName].max = Math.max(summaryRanges[colName].max, end);
                    }
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

                // 对于插件总结书，显示计算好的楼层范围
                let displayName = colName;
                if (colName === '大总结' || colName === '小总结') {
                    const range = summaryRanges[colName];
                    if (range.min !== Infinity) {
                        displayName = `${colName}\uff1a${range.min}-${range.max}楼`;
                    }
                }

                return `<label class="wbap-entry-item"><input type="checkbox" data-book="${bookName}" value="${uid}" ${checked}> ${displayName} ${badge}</label>`;
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
    function renderWorldBookList() {
        const bookListContainer = document.getElementById('wbap-endpoint-book-list-container');
        const entryListContainer = document.getElementById('wbap-endpoint-edit-entry-list');

        if (!bookListContainer || !entryListContainer) {
            Logger.warn('[自选模式] 找不到世界书列表容器');
            return;
        }

        bookListContainer.innerHTML = ''; // Clear previous list
        entryListContainer.innerHTML = '<p class="wbap-text-muted" style="text-align: center; font-size: 12px;">请从左侧选择一本世界书</p>'; // Reset entry list

        // 确保 currentEditingBinding 已初始化
        if (!currentEditingBinding) {
            Logger.warn('[自选模式] currentEditingBinding 未初始化');
            bookListContainer.innerHTML = '<p class="wbap-text-muted" style="padding: 8px; text-align: center; font-size: 12px;">配置加载中...</p>';
            return;
        }

        // 确保 worldBooks 是数组
        if (!Array.isArray(currentEditingBinding.worldBooks)) {
            Logger.warn('[自选模式] currentEditingBinding.worldBooks 不是数组');
            currentEditingBinding.worldBooks = [];
        }

        if (currentEditingBinding.worldBooks.length === 0) {
            bookListContainer.innerHTML = '<p class="wbap-text-muted" style="padding: 8px; text-align: center; font-size: 12px;">请先添加世界书</p>';
            return;
        }

        Logger.log(`[自选模式] 渲染世界书列表: ${currentEditingBinding.worldBooks.length} 本`);

        currentEditingBinding.worldBooks.forEach(bookName => {
            const bookItem = document.createElement('div');
            bookItem.className = 'wbap-book-item';
            bookItem.textContent = bookName;
            bookItem.dataset.bookName = bookName;
            bookItem.addEventListener('click', () => displayEntriesForBook(bookName));
            bookListContainer.appendChild(bookItem);
        });

        // Automatically select the first book
        if (currentEditingBinding.worldBooks.length > 0) {
            displayEntriesForBook(currentEditingBinding.worldBooks[0]);
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
            if (checkboxes.length === 0) return;

            const bookName = checkboxes[0].dataset.book;
            const newIds = [];
            checkboxes.forEach(cb => {
                cb.checked = true;
                newIds.push(cb.value);
            });

            if (bookName) {
                if (!currentEditingBinding.assignedEntriesMap[bookName]) {
                    currentEditingBinding.assignedEntriesMap[bookName] = [];
                }
                const currentIds = new Set(currentEditingBinding.assignedEntriesMap[bookName]);
                newIds.forEach(id => currentIds.add(id));
                currentEditingBinding.assignedEntriesMap[bookName] = Array.from(currentIds);
                Logger.log(`全选已应用: 世界书=${bookName}, 总计=${currentEditingBinding.assignedEntriesMap[bookName].length}条`);
            }
        });

        document.getElementById('wbap-endpoint-entries-clear')?.addEventListener('click', () => {
            const checkboxes = document.querySelectorAll('#wbap-endpoint-edit-entry-list input[type="checkbox"]');
            if (checkboxes.length === 0) return;

            const bookName = checkboxes[0].dataset.book;
            const idsToRemove = new Set();
            checkboxes.forEach(cb => {
                cb.checked = false;
                idsToRemove.add(cb.value);
            });

            if (bookName && currentEditingBinding.assignedEntriesMap[bookName]) {
                currentEditingBinding.assignedEntriesMap[bookName] = currentEditingBinding.assignedEntriesMap[bookName].filter(id => !idsToRemove.has(id));
                Logger.log(`清空已应用: 世界书=${bookName}, 剩余=${currentEditingBinding.assignedEntriesMap[bookName].length}条`);
            }
        });

        // Temperature slider
        document.getElementById('wbap-endpoint-edit-temperature').addEventListener('input', (e) => {
            const valueEl = document.getElementById('wbap-endpoint-edit-temperature-value');
            if (valueEl) valueEl.textContent = e.target.value;
        });

        document.getElementById('wbap-endpoint-add-worldbook').addEventListener('click', () => {
            const select = document.getElementById('wbap-endpoint-edit-worldbook-select');
            if (!select) return;
            const bookName = select.value;
            if (!bookName) {
                alert('请先选择一个世界书');
                return;
            }
            if (!currentEditingBinding.worldBooks.includes(bookName)) {
                currentEditingBinding.worldBooks.push(bookName);
            }
            if (!currentEditingBinding.assignedEntriesMap[bookName]) {
                currentEditingBinding.assignedEntriesMap[bookName] = [];
            }
            renderSelectedWorldbooks();
            renderWorldBookList();
        });

        document.getElementById('wbap-endpoint-selected-worldbooks').addEventListener('click', (e) => {
            const btn = e.target.closest('[data-remove-book]');
            if (!btn) return;
            const bookName = btn.dataset.removeBook;
            currentEditingBinding.worldBooks = currentEditingBinding.worldBooks.filter(n => n !== bookName);
            delete currentEditingBinding.assignedEntriesMap[bookName];
            renderSelectedWorldbooks();
            renderWorldBookList();
        });

        document.getElementById('wbap-endpoint-edit-entry-list').addEventListener('change', (e) => {
            if (e.target.type === 'checkbox') {
                const bookName = e.target.dataset.book;
                const entryId = e.target.value;
                if (!bookName || !entryId) return;

                if (!currentEditingBinding.assignedEntriesMap[bookName]) {
                    currentEditingBinding.assignedEntriesMap[bookName] = [];
                }

                const selectedSet = new Set(currentEditingBinding.assignedEntriesMap[bookName]);
                if (e.target.checked) {
                    selectedSet.add(entryId);
                } else {
                    selectedSet.delete(entryId);
                }
                currentEditingBinding.assignedEntriesMap[bookName] = Array.from(selectedSet);
                Logger.log(`条目选择已更新: 世界书=${bookName}, 选中=${currentEditingBinding.assignedEntriesMap[bookName].length}条`);
            }
        });
    }

    window.wbapEditEndpoint = async (id) => {
        window.wbapCurrentEndpointId = id;
        const modal = document.getElementById('wbap-endpoint-editor-modal');
        if (!modal) return;

        // 从全局池获取端点
        const endpoints = getGlobalSelectiveEndpoints();

        let endpoint = endpoints.find(ep => ep.id === id);
        if (!endpoint && endpoints.length > 0) {
            // id 可能过期，回退到第一个
            endpoint = endpoints[0];
        }
        if (!endpoint) {
            // Create default endpoint when list is empty
            endpoint = {
                id: `ep_${Date.now()}`,
                name: 'New API',
                apiChannel: 'direct',
                apiProvider: 'openai',
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
                dedupe: true
            };
            endpoints.push(endpoint);
            WBAP.saveConfig();
        }
        currentEditingEndpoint = endpoint;

        // 从角色配置加载世界书绑定
        // 确保角色配置已完全加载
        const config = WBAP.CharacterManager?.getCurrentCharacterConfig?.();
        if (!config) {
            Logger.warn('[自选模式] 角色配置尚未加载，等待初始化...');
            // 等待配置加载
            await new Promise(resolve => setTimeout(resolve, 100));
        }

        const binding = getEndpointBinding(endpoint.id);
        currentEditingBinding = {
            worldBooks: Array.isArray(binding.worldBooks) ? [...binding.worldBooks] : [],
            assignedEntriesMap: binding.assignedEntriesMap ? JSON.parse(JSON.stringify(binding.assignedEntriesMap)) : {}
        };

        Logger.log(`[自选模式] 加载端点 ${endpoint.id} 的世界书绑定:`, {
            worldBooks: currentEditingBinding.worldBooks,
            entriesCount: Object.keys(currentEditingBinding.assignedEntriesMap).length
        });

        // 填充基础信息
        document.getElementById('wbap-endpoint-editor-title').textContent = `编辑 API: ${endpoint.name}`;
        document.getElementById('wbap-endpoint-edit-id').value = endpoint.id;
        document.getElementById('wbap-endpoint-edit-name').value = endpoint.name;
        const enabledInput = document.getElementById('wbap-endpoint-edit-enabled');
        if (enabledInput) {
            enabledInput.checked = endpoint.enabled !== false;
        }
        const dedupeInput = document.getElementById('wbap-endpoint-edit-dedupe');
        if (dedupeInput) {
            dedupeInput.checked = endpoint.dedupe !== false;
        }

        // 加载 API 接入渠道
        const channelSelect = document.getElementById('wbap-endpoint-edit-channel');
        if (channelSelect) {
            channelSelect.value = endpoint.apiChannel || 'direct';
        }

        // 加载后端类型
        const providerInput = document.getElementById('wbap-endpoint-edit-provider');
        if (providerInput) {
            providerInput.value = endpoint.apiProvider || 'openai';
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

        renderSelectedWorldbooks();
        renderWorldBookList();

        modal.classList.add('open');
        syncMobileRootFix();

        // 延迟再次刷新，确保配置完全加载
        setTimeout(() => {
            Logger.log('[自选模式] 延迟刷新世界书显示');
            renderSelectedWorldbooks();
            renderWorldBookList();
        }, 200);
    };

    function saveEndpoint() {
        const id = document.getElementById('wbap-endpoint-edit-id').value;
        const endpoints = getGlobalSelectiveEndpoints();
        const endpoint = endpoints.find(ep => ep.id === id);
        if (!endpoint) return;

        endpoint.name = document.getElementById('wbap-endpoint-edit-name').value;
        endpoint.apiChannel = document.getElementById('wbap-endpoint-edit-channel')?.value || 'direct';
        endpoint.apiProvider = document.getElementById('wbap-endpoint-edit-provider')?.value || 'openai';
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
        endpoint.dedupe = document.getElementById('wbap-endpoint-edit-dedupe')?.checked !== false;

        // Clean up old fields from endpoint (these are now stored in character config bindings)
        delete endpoint.url;
        delete endpoint.key;
        delete endpoint.worldBook;
        delete endpoint.assignedEntries;
        delete endpoint.worldBooks;
        delete endpoint.assignedEntriesMap;

        // 保存世界书绑定到角色配置
        setEndpointBinding(id, currentEditingBinding.worldBooks, currentEditingBinding.assignedEntriesMap);

        WBAP.saveConfig();
        document.getElementById('wbap-endpoint-editor-modal').classList.remove('open');
        WBAP.UI.renderApiEndpoints(); // Refresh the list in the settings view
        syncMobileRootFix();
        Logger.log(`API instance "${endpoint.name}" saved with ${currentEditingBinding.worldBooks.length} worldbooks`);
    }

    // 在脚本加载后立即尝试注入UI
    // injectUI();

    window.addEventListener('resize', syncMobileRootFix);

    // ==================== 超级记忆 UI 逻辑 ====================
    function initSuperMemoryUI() {
        const toggle = document.getElementById('wbap_supermemory_toggle');
        const btn = document.getElementById('wbap_view_graph_btn');
        // const desc = document.getElementById('wbap_supermemory_desc'); // Assuming we want to toggle description too? Template didn't have id on desc div but we can add or ignore

        if (toggle) {
            const enabled = WBAP.config?.superMemory?.enabled || false;
            toggle.checked = enabled;
            if (btn) btn.style.display = enabled ? 'inline-block' : 'none'; // Template has it inline-blockish usually?
            // if (desc) desc.style.display = enabled ? 'block' : 'none';

            toggle.addEventListener('change', (e) => {
                if (!WBAP.config) WBAP.config = {};
                if (!WBAP.config.superMemory) WBAP.config.superMemory = {};
                WBAP.config.superMemory.enabled = e.target.checked;
                WBAP.saveConfig();

                if (btn) {
                    if (e.target.checked) $(btn).fadeIn(200);
                    else $(btn).hide();
                }

                if (window.toastr && e.target.checked) toastr.success('超级记忆模块已启用');
            });
        }

        if (btn) {
            btn.addEventListener('click', async () => {
                if (!WBAP.GraphEngine || !WBAP.GraphView) {
                    if (window.toastr) toastr.error('组件未就绪');
                    return;
                }

                // Close panel to show fullscreen graph
                const panel = document.getElementById('wbap-panel');
                if (panel) panel.classList.remove('open');

                // Get data from selected worldbooks in Super Memory config
                const selectedBooks = WBAP.config?.superMemory?.selectedWorldBooks || [];

                if (selectedBooks.length === 0) {
                    if (window.toastr) toastr.warning('请先在超级记忆配置中选择要索引的世界书');
                    return;
                }

                if (window.toastr) toastr.info(`正在加载 ${selectedBooks.length} 本世界书...`);

                let allEntries = [];
                for (const bookName of selectedBooks) {
                    try {
                        const book = await WBAP.loadWorldBookEntriesByName(bookName);
                        if (book && book.entries) {
                            const entries = Object.values(book.entries).filter(e => e && e.disable !== true);
                            allEntries = allEntries.concat(entries);
                        }
                    } catch (e) {
                        Logger.warn(`加载世界书 ${bookName} 失败:`, e);
                    }
                }

                if (allEntries.length === 0) {
                    if (window.toastr) toastr.warning('选中的世界书没有可用条目');
                    return;
                }

                if (window.toastr) toastr.info(`正在解析 ${allEntries.length} 个节点...`);

                // Async execution
                try {
                    const graphData = await WBAP.GraphEngine.build(allEntries);
                    if (window.toastr) toastr.success(`图谱构建完成：${graphData.stats.nodeCount} 节点，${graphData.stats.linkCount} 链接`);
                    WBAP.GraphView.show(graphData.nodes, graphData.links, graphData.stats);
                } catch (e) {
                    console.error(e);
                    if (window.toastr) toastr.error('图谱构建失败: ' + e.message);
                }
            });
        }

        // 配置按钮
        const configBtn = document.getElementById('wbap_supermemory_config_btn');
        if (configBtn) {
            configBtn.addEventListener('click', () => {
                const settingsElement = document.getElementById('wbap-supermemory-settings');
                if (settingsElement) {
                    // Close main panel
                    document.getElementById('wbap-panel')?.classList.remove('open');
                    loadSuperMemorySettings();
                    settingsElement.classList.add('open');
                    syncMobileRootFix();
                    // 启动延迟 ping
                    startPedsaPing();
                } else {
                    // Should exist if template updated, but check just in case
                    Logger.warn('Super Memory settings panel not found in DOM');
                }
            });
        }

        // Settings panel close
        document.getElementById('wbap-supermemory-close')?.addEventListener('click', () => {
            document.getElementById('wbap-supermemory-settings')?.classList.remove('open');
            // 停止延迟 ping
            stopPedsaPing();
            // 返回主面板而不是退出插件
            const mainPanel = document.getElementById('wbap-panel');
            if (mainPanel && !mainPanel.classList.contains('open')) {
                mainPanel.classList.add('open');
            }
            syncMobileRootFix();
        });

        // Save button
        document.getElementById('wbap-supermemory-save')?.addEventListener('click', saveSuperMemorySettings);

        // 初始化图谱配置事件
        initGraphConfigEvents();

        // 初始化 PEDSA 配置事件
        initPedsaConfigEvents();

        // Tab switching (支持新旧两种class名)
        const tabs = document.querySelectorAll('#wbap-supermemory-settings .wbap-agent-tab, #wbap-supermemory-settings .wbap-tab-item');
        tabs.forEach(tab => {
            tab.addEventListener('click', () => {
                tabs.forEach(t => {
                    t.classList.remove('active');
                });
                tab.classList.add('active');
                currentSuperMemoryTab = tab.dataset.tab;
                renderSuperMemoryAgentConfig(currentSuperMemoryTab);
            });
        });

        // Add Worldbook
        document.getElementById('wbap-supermemory-worldbook-add')?.addEventListener('click', () => {
            const select = document.getElementById('wbap-supermemory-worldbook-select');
            const val = select.value;
            if (!val) return;
            const config = WBAP.config.superMemory || {};
            if (!config.selectedWorldBooks) config.selectedWorldBooks = [];
            if (!config.selectedWorldBooks.includes(val)) {
                config.selectedWorldBooks.push(val);
                WBAP.saveConfig();
                renderSuperMemoryWorldbooks();
            }
        });

        // Remove Worldbook (Event delegation)
        document.getElementById('wbap-supermemory-selected-worldbooks')?.addEventListener('click', (e) => {
            const btn = e.target.closest('[data-remove-book]');
            if (!btn) return;
            const bookName = btn.dataset.removeBook;
            const config = WBAP.config.superMemory || {};
            if (config.selectedWorldBooks) {
                config.selectedWorldBooks = config.selectedWorldBooks.filter(b => b !== bookName);
                WBAP.saveConfig();
                renderSuperMemoryWorldbooks();
            }
        });

        // Agent inputs change listener to temp store
        const agentInputs = ['wbap-agent-endpoint-select', 'wbap-agent-api-url', 'wbap-agent-api-key', 'wbap-agent-model', 'wbap-agent-system-prompt'];
        agentInputs.forEach(id => {
            document.getElementById(id)?.addEventListener('change', (e) => {
                cacheSuperMemoryAgentConfig(currentSuperMemoryTab);
            });
            document.getElementById(id)?.addEventListener('input', (e) => {
                // cache on input too for safer switching
                // cacheSuperMemoryAgentConfig(currentSuperMemoryTab); // optimize: maybe only on blur or tab switch
            });
        });

        // Agent fetch models button
        document.getElementById('wbap-agent-fetch-models')?.addEventListener('click', async (e) => {
            const btn = e.currentTarget;
            btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i>';
            btn.disabled = true;

            // 优先使用独立 API 配置，否则从选中的 endpoint 获取
            let apiUrl = document.getElementById('wbap-agent-api-url')?.value || '';
            let apiKey = document.getElementById('wbap-agent-api-key')?.value || '';

            if (!apiUrl || !apiKey) {
                const epId = document.getElementById('wbap-agent-endpoint-select')?.value;
                if (epId) {
                    const endpoints = getGlobalSelectiveEndpoints();
                    const ep = endpoints.find(e => e.id === epId);
                    if (ep) {
                        apiUrl = apiUrl || ep.apiUrl || ep.url || '';
                        apiKey = apiKey || ep.apiKey || ep.key || '';
                    }
                }
            }

            const currentModel = document.getElementById('wbap-agent-model')?.value || '';
            const result = await WBAP.fetchEndpointModels({ apiUrl, apiKey });
            if (result.success) {
                populateAgentModelSelect(result.models, currentModel);
            } else {
                alert(`获取模型失败: ${result.message}`);
            }

            btn.innerHTML = '<i class="fa-solid fa-download"></i> 获取模型';
            btn.disabled = false;
        });

        // Graph fetch models button
        document.getElementById('wbap-graph-fetch-models')?.addEventListener('click', async (e) => {
            const btn = e.currentTarget;
            btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i>';
            btn.disabled = true;

            let apiUrl = document.getElementById('wbap-graph-api-url')?.value || '';
            let apiKey = document.getElementById('wbap-graph-api-key')?.value || '';

            if (!apiUrl || !apiKey) {
                const epId = document.getElementById('wbap-graph-update-endpoint')?.value;
                if (epId) {
                    const endpoints = getGlobalSelectiveEndpoints();
                    const ep = endpoints.find(e => e.id === epId);
                    if (ep) {
                        apiUrl = apiUrl || ep.apiUrl || ep.url || '';
                        apiKey = apiKey || ep.apiKey || ep.key || '';
                    }
                }
            }

            const currentModel = document.getElementById('wbap-graph-update-model')?.value || '';
            const result = await WBAP.fetchEndpointModels({ apiUrl, apiKey });
            if (result.success) {
                populateGraphModelSelect(result.models, currentModel);
            } else {
                alert(`获取模型失败: ${result.message}`);
            }

            btn.innerHTML = '<i class="fa-solid fa-download"></i> 获取模型';
            btn.disabled = false;
        });
    }

    let currentSuperMemoryTab = 'archivist';

    function populateAgentModelSelect(models = [], currentModel = '') {
        const modelSelect = document.getElementById('wbap-agent-model');
        if (!modelSelect) return;
        const list = Array.isArray(models) ? models : [];
        modelSelect.innerHTML = '<option value="">留空使用实例默认模型</option>';

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
        } else if (currentModel) {
            const option = document.createElement('option');
            option.value = currentModel;
            option.textContent = currentModel;
            option.selected = true;
            modelSelect.appendChild(option);
        }
    }

    function populateGraphModelSelect(models = [], currentModel = '') {
        const modelSelect = document.getElementById('wbap-graph-update-model');
        if (!modelSelect) return;
        const list = Array.isArray(models) ? models : [];
        modelSelect.innerHTML = '<option value="">留空使用默认</option>';

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
        } else if (currentModel) {
            const option = document.createElement('option');
            option.value = currentModel;
            option.textContent = currentModel;
            option.selected = true;
            modelSelect.appendChild(option);
        }
    }

    function loadSuperMemorySettings() {
        if (!WBAP.config) WBAP.config = {};
        if (!WBAP.config.superMemory) WBAP.config.superMemory = {
            enabled: false,
            selectedWorldBooks: [],
            agents: {
                archivist: {},
                historian: {},
                status_reader: {}
            },
            // 图谱配置默认值
            useGraphRetrieval: true,
            useLLMGraphUpdate: true,
            graphUpdateEndpointId: '',
            graphUpdateModel: '',
            graphEnergyThreshold: 0.1,
            // 图谱维护写入世界书（持久化，默认关闭）
            graphWriteToWorldbook: {
                enabled: false,
                targetBook: '',
                maxEntries: 3
            }
        };
        // Ensure defaults
        const config = WBAP.config.superMemory;
        if (!config.selectedWorldBooks) config.selectedWorldBooks = [];
        if (!config.agents) config.agents = { archivist: {}, historian: {}, status_reader: {} };
        // 图谱配置默认值
        if (config.useGraphRetrieval === undefined) config.useGraphRetrieval = true;
        if (config.useLLMGraphUpdate === undefined) config.useLLMGraphUpdate = true;
        if (config.graphEnergyThreshold === undefined) config.graphEnergyThreshold = 0.1;
        if (!config.graphWriteToWorldbook) config.graphWriteToWorldbook = { enabled: false, targetBook: '', maxEntries: 3 };
        if (config.graphWriteToWorldbook.enabled === undefined) config.graphWriteToWorldbook.enabled = false;
        if (config.graphWriteToWorldbook.targetBook === undefined) config.graphWriteToWorldbook.targetBook = '';
        if (config.graphWriteToWorldbook.maxEntries === undefined) config.graphWriteToWorldbook.maxEntries = 3;

        // Load Worldbook list
        const wbSelect = document.getElementById('wbap-supermemory-worldbook-select');
        wbSelect.innerHTML = '<option value="">-- 选择世界书 --</option>';
        WBAP.getAllWorldBookNames().then(names => {
            names.forEach(name => {
                const opt = document.createElement('option');
                opt.value = name;
                opt.textContent = name;
                wbSelect.appendChild(opt);
            });
        });

        renderSuperMemoryWorldbooks();

        // Load Agents
        renderSuperMemoryAgentConfig(currentSuperMemoryTab);

        // 加载图谱配置
        loadGraphSettings();

        // 加载 PEDSA 配置
        loadPedsaSettings();

        // 加载 Function Calling 配置
        loadFunctionCallingSettings();
        initFunctionCallingEvents();
    }

    function renderSuperMemoryWorldbooks() {
        const container = document.getElementById('wbap-supermemory-selected-worldbooks');
        const books = WBAP.config.superMemory?.selectedWorldBooks || [];
        container.innerHTML = books.map(name => `
            <span class="wbap-tag wbap-worldbook-tag" style="background: var(--wbap-bg-secondary, #2a2a3a); padding: 6px 10px; border-radius: 12px; display: inline-flex; align-items: center; gap: 6px; max-width: 100%; word-break: break-word;">
                <span style="flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis;">${name}</span>
                <button type="button" data-remove-book="${name}" class="wbap-btn wbap-btn-xs wbap-btn-icon" style="padding: 0 6px; flex-shrink: 0;">&times;</button>
            </span>
        `).join('');
    }

    function renderSuperMemoryAgentConfig(agentKey) {
        const config = WBAP.config.superMemory?.agents?.[agentKey] || {};

        // Load endpoints
        const endpoints = getGlobalSelectiveEndpoints();
        const epSelect = document.getElementById('wbap-agent-endpoint-select');
        epSelect.innerHTML = '<option value="">-- 使用独立配置或默认 --</option>';
        endpoints.forEach(ep => {
            const opt = document.createElement('option');
            opt.value = ep.id;
            opt.textContent = ep.name;
            if (ep.id === config.endpointId) opt.selected = true;
            epSelect.appendChild(opt);
        });

        // 独立 API 配置
        const apiUrlEl = document.getElementById('wbap-agent-api-url');
        if (apiUrlEl) apiUrlEl.value = config.apiUrl || '';

        const apiKeyEl = document.getElementById('wbap-agent-api-key');
        if (apiKeyEl) apiKeyEl.value = config.apiKey || '';

        // 模型下拉框
        const modelSelect = document.getElementById('wbap-agent-model');
        if (modelSelect) {
            modelSelect.innerHTML = '<option value="">留空使用实例默认模型</option>';
            if (config.model) {
                const opt = document.createElement('option');
                opt.value = config.model;
                opt.textContent = config.model;
                opt.selected = true;
                modelSelect.appendChild(opt);
            }
        }

        document.getElementById('wbap-agent-system-prompt').value = config.systemPrompt || getDefaultAgentPrompt(agentKey);
    }

    function cacheSuperMemoryAgentConfig(agentKey) {
        if (!WBAP.config?.superMemory?.agents) return;
        const agentConfig = WBAP.config.superMemory.agents[agentKey] || {};

        agentConfig.endpointId = document.getElementById('wbap-agent-endpoint-select').value;
        agentConfig.apiUrl = (document.getElementById('wbap-agent-api-url')?.value || '').trim();
        agentConfig.apiKey = (document.getElementById('wbap-agent-api-key')?.value || '').trim();
        agentConfig.model = document.getElementById('wbap-agent-model')?.value || '';
        agentConfig.systemPrompt = document.getElementById('wbap-agent-system-prompt').value;

        WBAP.config.superMemory.agents[agentKey] = agentConfig;
    }

    function saveSuperMemorySettings() {
        // Save current tab first
        cacheSuperMemoryAgentConfig(currentSuperMemoryTab);
        // 保存图谱配置
        saveGraphSettings();
        // 保存 PEDSA 配置
        savePedsaSettings();
        // 保存 Function Calling 配置
        saveFunctionCallingSettings();
        WBAP.saveConfig();

        const btn = document.getElementById('wbap-supermemory-save');
        const originalHtml = btn.innerHTML;
        btn.innerHTML = '<i class="fa-solid fa-check"></i> 已保存';
        setTimeout(() => btn.innerHTML = originalHtml, 1500);
    }

    // ==================== 图谱配置函数 ====================

    function loadGraphSettings() {
        const config = WBAP.config.superMemory || {};

        // 加载复选框状态
        const graphRetrievalEl = document.getElementById('wbap-graph-retrieval-enabled');
        if (graphRetrievalEl) graphRetrievalEl.checked = config.useGraphRetrieval !== false;

        const llmUpdateEl = document.getElementById('wbap-graph-llm-update-enabled');
        if (llmUpdateEl) llmUpdateEl.checked = config.useLLMGraphUpdate !== false;

        // 加载“写入世界书”配置
        if (!config.graphWriteToWorldbook) config.graphWriteToWorldbook = { enabled: false, targetBook: '', maxEntries: 3 };
        const writeEnabledEl = document.getElementById('wbap-graph-write-worldbook-enabled');
        if (writeEnabledEl) writeEnabledEl.checked = config.graphWriteToWorldbook.enabled === true;

        const targetEl = document.getElementById('wbap-graph-write-worldbook-target');
        if (targetEl && WBAP.getAllWorldBookNames) {
            targetEl.innerHTML = '<option value="">-- 不写入 --</option>';
            WBAP.getAllWorldBookNames().then(names => {
                names.forEach(name => {
                    const opt = document.createElement('option');
                    opt.value = name;
                    opt.textContent = name;
                    if (name === config.graphWriteToWorldbook.targetBook) opt.selected = true;
                    targetEl.appendChild(opt);
                });
            }).catch(() => { });
        }

        const maxEl = document.getElementById('wbap-graph-write-worldbook-max');
        if (maxEl) maxEl.value = config.graphWriteToWorldbook.maxEntries ?? 3;

        // 加载 API 选择
        const endpoints = getGlobalSelectiveEndpoints();
        const epSelect = document.getElementById('wbap-graph-update-endpoint');
        if (epSelect) {
            epSelect.innerHTML = '<option value="">-- 使用默认 API --</option>';
            endpoints.forEach(ep => {
                const opt = document.createElement('option');
                opt.value = ep.id;
                opt.textContent = ep.name;
                if (ep.id === config.graphUpdateEndpointId) opt.selected = true;
                epSelect.appendChild(opt);
            });
        }

        // 加载模型
        const modelEl = document.getElementById('wbap-graph-update-model');
        if (modelEl) {
            modelEl.innerHTML = '<option value="">留空使用默认</option>';
            if (config.graphUpdateModel) {
                const opt = document.createElement('option');
                opt.value = config.graphUpdateModel;
                opt.textContent = config.graphUpdateModel;
                opt.selected = true;
                modelEl.appendChild(opt);
            }
        }

        // 加载独立 API 配置
        const graphApiUrlEl = document.getElementById('wbap-graph-api-url');
        if (graphApiUrlEl) graphApiUrlEl.value = config.graphApiUrl || '';

        const graphApiKeyEl = document.getElementById('wbap-graph-api-key');
        if (graphApiKeyEl) graphApiKeyEl.value = config.graphApiKey || '';

        // 加载能量阈值
        const thresholdEl = document.getElementById('wbap-graph-energy-threshold');
        if (thresholdEl) thresholdEl.value = config.graphEnergyThreshold || 0.1;

        // 更新图谱统计
        updateGraphStats();
    }

    function saveGraphSettings() {
        const config = WBAP.config.superMemory;
        if (!config) return;

        const graphRetrievalEl = document.getElementById('wbap-graph-retrieval-enabled');
        if (graphRetrievalEl) config.useGraphRetrieval = graphRetrievalEl.checked;

        const llmUpdateEl = document.getElementById('wbap-graph-llm-update-enabled');
        if (llmUpdateEl) config.useLLMGraphUpdate = llmUpdateEl.checked;

        // 保存“写入世界书”配置
        if (!config.graphWriteToWorldbook) config.graphWriteToWorldbook = { enabled: false, targetBook: '', maxEntries: 3 };
        const writeEnabledEl = document.getElementById('wbap-graph-write-worldbook-enabled');
        if (writeEnabledEl) config.graphWriteToWorldbook.enabled = writeEnabledEl.checked;

        const targetEl = document.getElementById('wbap-graph-write-worldbook-target');
        if (targetEl) config.graphWriteToWorldbook.targetBook = targetEl.value || '';

        const maxEl = document.getElementById('wbap-graph-write-worldbook-max');
        if (maxEl) {
            const val = parseInt(maxEl.value, 10);
            config.graphWriteToWorldbook.maxEntries = Number.isFinite(val) ? Math.max(0, Math.min(10, val)) : 3;
        }

        const epSelect = document.getElementById('wbap-graph-update-endpoint');
        if (epSelect) config.graphUpdateEndpointId = epSelect.value;

        const modelEl = document.getElementById('wbap-graph-update-model');
        if (modelEl) config.graphUpdateModel = modelEl.value;

        // 保存独立 API 配置
        const graphApiUrlEl = document.getElementById('wbap-graph-api-url');
        if (graphApiUrlEl) config.graphApiUrl = graphApiUrlEl.value.trim();

        const graphApiKeyEl = document.getElementById('wbap-graph-api-key');
        if (graphApiKeyEl) config.graphApiKey = graphApiKeyEl.value.trim();

        const thresholdEl = document.getElementById('wbap-graph-energy-threshold');
        if (thresholdEl) config.graphEnergyThreshold = parseFloat(thresholdEl.value) || 0.1;
    }

    function updateGraphStats() {
        const statsEl = document.getElementById('wbap-graph-stats');
        if (!statsEl) return;

        if (WBAP.MultiDimGraph) {
            const stats = WBAP.MultiDimGraph.getDynamicStats?.() || {};
            if (stats.totalNodes > 0) {
                statsEl.style.display = 'block';
                statsEl.innerHTML = `
                    📊 图谱状态: ${stats.totalNodes} 节点 | ${stats.totalEdges} 边<br>
                    🔄 动态数据: ${stats.dynamicNodes} 节点 | ${stats.dynamicEdges} 边
                `;
            } else {
                statsEl.style.display = 'block';
                statsEl.innerHTML = '📊 图谱未构建（首次检索时自动构建）';
            }
        } else {
            statsEl.style.display = 'block';
            statsEl.innerHTML = '⚠️ 多维图谱模块未加载';
        }
    }

    function initGraphConfigEvents() {
        // 查看图谱按钮
        document.getElementById('wbap-graph-view-btn')?.addEventListener('click', () => {
            if (WBAP.MultiDimGraph && WBAP.GraphView) {
                const nodes = Array.from(WBAP.MultiDimGraph.nodes?.values() || []);
                const edges = WBAP.MultiDimGraph.edges || [];
                if (nodes.length > 0) {
                    document.getElementById('wbap-supermemory-settings')?.classList.remove('open');
                    WBAP.GraphView.show(nodes, edges, { nodeCount: nodes.length, linkCount: edges.length });
                } else {
                    alert('图谱为空，请先启用超级记忆并进行一次对话');
                }
            } else {
                alert('图谱模块未加载');
            }
        });

        // 清除动态数据按钮
        document.getElementById('wbap-graph-clear-dynamic-btn')?.addEventListener('click', () => {
            if (WBAP.MultiDimGraph) {
                WBAP.MultiDimGraph.clearDynamicData?.();
                updateGraphStats();
                alert('动态数据已清除');
            }
        });

        // 手动维护按钮
        document.getElementById('wbap-graph-manual-update-btn')?.addEventListener('click', async () => {
            if (!WBAP.MultiDimGraph) {
                alert('图谱模块未加载');
                return;
            }

            // 获取最近对话上下文
            const context = WBAP.getRecentContext?.(WBAP.getCurrentChatContext?.(), 5) || '';
            if (!context || context.length < 50) {
                alert('对话上下文不足，请先进行一些对话');
                return;
            }

            const btn = document.getElementById('wbap-graph-manual-update-btn');
            const originalText = btn.innerHTML;
            btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> 维护中...';
            btn.disabled = true;

            try {
                const result = await WBAP.MultiDimGraph.incrementalUpdate(context);
                if (result.success) {
                    alert(`图谱维护完成！\n新增节点: ${result.nodes || 0}\n新增边: ${result.edges || 0}\n状态变更: ${result.states || 0}`);
                    updateGraphStats();
                } else {
                    alert('维护失败: ' + (result.reason || '未知错误'));
                }
            } catch (e) {
                alert('维护出错: ' + e.message);
            } finally {
                btn.innerHTML = originalText;
                btn.disabled = false;
            }
        });
    }

    // ==================== 结束图谱配置函数 ====================

    // ==================== PEDSA 配置函数 ====================

    function initPedsaConfigEvents() {
        Logger.log('[PEDSA UI] 初始化 PEDSA 配置事件...');

        // 一阶段 PEDSA-JS 开关
        const pedsaJsToggle = document.getElementById('wbap-pedsa-js-enabled');
        Logger.log('[PEDSA UI] 一阶段开关元素:', pedsaJsToggle ? '找到' : '未找到');
        if (pedsaJsToggle) {
            pedsaJsToggle.addEventListener('change', (e) => {
                Logger.log('[PEDSA UI] 一阶段开关变更:', e.target.checked);
                if (!WBAP.config.superMemory) WBAP.config.superMemory = {};
                WBAP.config.superMemory.usePedsaJsRetrieval = e.target.checked;
                updatePedsaJsStats();
            });
        }

        // 二阶段 PEDSA-Rust 开关
        const pedsaRustToggle = document.getElementById('wbap-pedsa-rust-enabled');
        Logger.log('[PEDSA UI] 二阶段开关元素:', pedsaRustToggle ? '找到' : '未找到');
        if (pedsaRustToggle) {
            pedsaRustToggle.addEventListener('change', (e) => {
                Logger.log('[PEDSA UI] 二阶段开关变更:', e.target.checked);
                const configPanel = document.getElementById('wbap-pedsa-rust-config');
                if (configPanel) {
                    configPanel.style.display = e.target.checked ? 'block' : 'none';
                }
                if (!WBAP.config.superMemory) WBAP.config.superMemory = {};
                WBAP.config.superMemory.usePedsaRetrieval = e.target.checked;
            });
        }

        // 二阶段解锁按钮
        const unlockBtn = document.getElementById('wbap-pedsa-rust-unlock');
        Logger.log('[PEDSA UI] 解锁按钮元素:', unlockBtn ? '找到' : '未找到');
        unlockBtn?.addEventListener('click', async () => {
            Logger.log('[PEDSA UI] 解锁按钮点击');
            const passwordInput = document.getElementById('wbap-pedsa-rust-password');
            const password = passwordInput?.value || '';

            if (!password) {
                alert('请输入密码');
                return;
            }

            // 简单的密码验证（实际可以更复杂）
            const correctPassword = 'pedsa2024'; // 可以改成配置项
            if (password === correctPassword) {
                if (!WBAP.config.superMemory) WBAP.config.superMemory = {};
                WBAP.config.superMemory.pedsaRustUnlocked = true;
                alert('二阶段已解锁！请确保 PEDSA Rust 服务正在运行。');
                updatePedsaRustStatus();
            } else {
                alert('密码错误');
            }
        });

        // 刷新状态按钮
        const refreshBtn = document.getElementById('wbap-pedsa-refresh-stats');
        Logger.log('[PEDSA UI] 刷新按钮元素:', refreshBtn ? '找到' : '未找到');
        refreshBtn?.addEventListener('click', () => {
            Logger.log('[PEDSA UI] 刷新按钮点击');
            updatePedsaJsStats();
            updatePedsaRustStatus();
        });

        // 清除缓存按钮
        const clearBtn = document.getElementById('wbap-pedsa-clear-cache');
        Logger.log('[PEDSA UI] 清除缓存按钮元素:', clearBtn ? '找到' : '未找到');
        clearBtn?.addEventListener('click', () => {
            Logger.log('[PEDSA UI] 清除缓存按钮点击');
            if (WBAP.SuperMemory?.clearPedsaJsCache) {
                WBAP.SuperMemory.clearPedsaJsCache();
            }
            if (WBAP.PedsaWasmAdapter) {
                WBAP.PedsaWasmAdapter.invalidateCache();
            }
            updatePedsaJsStats();
            alert('PEDSA 缓存已清除');
        });

        Logger.log('[PEDSA UI] PEDSA 配置事件初始化完成');
    }

    function loadPedsaSettings() {
        const config = WBAP.config?.superMemory || {};

        // 一阶段开关
        const pedsaJsToggle = document.getElementById('wbap-pedsa-js-enabled');
        if (pedsaJsToggle) {
            pedsaJsToggle.checked = config.usePedsaJsRetrieval !== false;
        }

        // 二阶段开关
        const pedsaRustToggle = document.getElementById('wbap-pedsa-rust-enabled');
        if (pedsaRustToggle) {
            pedsaRustToggle.checked = config.usePedsaRetrieval === true;
            const configPanel = document.getElementById('wbap-pedsa-rust-config');
            if (configPanel) {
                configPanel.style.display = config.usePedsaRetrieval ? 'block' : 'none';
            }
        }

        // 更新状态显示
        updatePedsaJsStats();
        updatePedsaRustStatus();
    }

    function savePedsaSettings() {
        const config = WBAP.config.superMemory;
        if (!config) return;

        const pedsaJsToggle = document.getElementById('wbap-pedsa-js-enabled');
        if (pedsaJsToggle) config.usePedsaJsRetrieval = pedsaJsToggle.checked;

        const pedsaRustToggle = document.getElementById('wbap-pedsa-rust-enabled');
        if (pedsaRustToggle) config.usePedsaRetrieval = pedsaRustToggle.checked;
    }

    // ==================== Function Calling 配置函数 ====================

    function loadFunctionCallingSettings() {
        const config = WBAP.config?.superMemory || {};
        const fc = config.functionCalling || {};

        const enabledEl = document.getElementById('wbap-fc-enabled');
        if (enabledEl) {
            enabledEl.checked = fc.enabled === true;
            const configPanel = document.getElementById('wbap-fc-config-panel');
            if (configPanel) configPanel.style.display = fc.enabled ? 'block' : 'none';
        }

        const maxRoundsEl = document.getElementById('wbap-fc-max-rounds');
        if (maxRoundsEl) maxRoundsEl.value = fc.maxRounds ?? 3;

        const maxResultLengthEl = document.getElementById('wbap-fc-max-result-length');
        if (maxResultLengthEl) maxResultLengthEl.value = fc.maxResultLength ?? 4000;

        // 按代理开关
        const agents = fc.agents || {};
        ['archivist', 'historian', 'status_reader'].forEach(agentType => {
            const el = document.getElementById(`wbap-fc-agent-${agentType}`);
            if (el) {
                const agentCfg = agents[agentType];
                el.checked = agentCfg?.enabled !== false;
            }
        });
    }

    function saveFunctionCallingSettings() {
        const config = WBAP.config.superMemory;
        if (!config) return;

        if (!config.functionCalling) config.functionCalling = {};
        const fc = config.functionCalling;

        const enabledEl = document.getElementById('wbap-fc-enabled');
        if (enabledEl) fc.enabled = enabledEl.checked;

        const maxRoundsEl = document.getElementById('wbap-fc-max-rounds');
        if (maxRoundsEl) fc.maxRounds = Math.max(1, Math.min(10, parseInt(maxRoundsEl.value) || 3));

        const maxResultLengthEl = document.getElementById('wbap-fc-max-result-length');
        if (maxResultLengthEl) fc.maxResultLength = Math.max(500, Math.min(16000, parseInt(maxResultLengthEl.value) || 4000));

        if (!fc.agents) fc.agents = {};
        ['archivist', 'historian', 'status_reader'].forEach(agentType => {
            const el = document.getElementById(`wbap-fc-agent-${agentType}`);
            if (el) {
                if (!fc.agents[agentType]) fc.agents[agentType] = {};
                fc.agents[agentType].enabled = el.checked;
            }
        });
    }

    function initFunctionCallingEvents() {
        const enabledEl = document.getElementById('wbap-fc-enabled');
        if (enabledEl) {
            enabledEl.addEventListener('change', () => {
                const configPanel = document.getElementById('wbap-fc-config-panel');
                if (configPanel) configPanel.style.display = enabledEl.checked ? 'block' : 'none';
            });
        }
    }

    // ==================== PEDSA 延迟 Ping ====================

    let _pedsaPingInterval = null;
    const PING_INTERVAL_MS = 3000; // 每 3 秒 ping 一次

    /**
     * 对 PEDSA-JS 引擎执行 ping 并更新延迟显示
     */
    function pingPedsaJs() {
        const el = document.getElementById('wbap-pedsa-js-latency');
        if (!el) return;

        const engine = WBAP.SuperMemory?.getPedsaJsStats ? (() => {
            // 引擎已初始化且有节点才 ping
            const stats = WBAP.SuperMemory.getPedsaJsStats();
            if (!stats || !stats.totalNodes) return null;
            return true;
        })() : null;

        if (!engine) {
            el.textContent = '-';
            el.className = 'wbap-stat-value wbap-latency-value';
            return;
        }

        // 通过 pedsaJsRetrieval 的 lastRetrieveTime 做一次微型检索来测延迟
        // 直接用内部引擎的 retrieve
        try {
            const start = performance.now();
            // 访问内部缓存的引擎实例做最小检索
            const internalEngine = WBAP.SuperMemory?._getPedsaJsEngine?.();
            if (internalEngine && internalEngine.retrieve) {
                internalEngine.retrieve('_', { topK: 1 });
                const latency = performance.now() - start;
                applyLatencyDisplay(el, latency);
            } else {
                el.textContent = '-';
                el.className = 'wbap-stat-value wbap-latency-value';
            }
        } catch (e) {
            el.textContent = '错误';
            el.className = 'wbap-stat-value wbap-latency-value wbap-latency-bad';
        }
    }

    /**
     * 对 PEDSA-WASM 引擎执行 ping 并更新延迟显示
     */
    async function pingPedsaWasm() {
        const el = document.getElementById('wbap-pedsa-wasm-latency');
        if (!el) return;

        if (!WBAP.PedsaWasmAdapter?.isAvailable) {
            el.textContent = '-';
            el.className = 'wbap-stat-value wbap-latency-value';
            return;
        }

        const result = await WBAP.PedsaWasmAdapter.ping();
        if (result.ok) {
            applyLatencyDisplay(el, result.latency);
        } else {
            el.textContent = '-';
            el.className = 'wbap-stat-value wbap-latency-value';
        }
    }

    /**
     * 根据延迟值设置显示文本和颜色
     */
    function applyLatencyDisplay(el, latency) {
        const ms = latency.toFixed(1);
        el.textContent = `${ms}ms`;
        if (latency < 5) {
            el.className = 'wbap-stat-value wbap-latency-value wbap-latency-good';
        } else if (latency < 20) {
            el.className = 'wbap-stat-value wbap-latency-value wbap-latency-ok';
        } else {
            el.className = 'wbap-stat-value wbap-latency-value wbap-latency-bad';
        }
    }

    /**
     * 启动延迟 ping 循环
     */
    function startPedsaPing() {
        stopPedsaPing();
        // 立即执行一次
        pingPedsaJs();
        pingPedsaWasm();
        _pedsaPingInterval = setInterval(() => {
            pingPedsaJs();
            pingPedsaWasm();
        }, PING_INTERVAL_MS);
    }

    /**
     * 停止延迟 ping 循环
     */
    function stopPedsaPing() {
        if (_pedsaPingInterval) {
            clearInterval(_pedsaPingInterval);
            _pedsaPingInterval = null;
        }
    }

    function updatePedsaJsStats() {
        const statsPanel = document.getElementById('wbap-pedsa-js-stats');
        const statusEl = document.getElementById('wbap-pedsa-js-status');
        const nodesEl = document.getElementById('wbap-pedsa-js-nodes');
        const timeEl = document.getElementById('wbap-pedsa-js-time');

        if (!statsPanel) return;

        // 检查 PEDSA-JS 引擎是否可用
        if (WBAP.PedsaEngine) {
            statsPanel.style.display = 'block';

            // 获取统计信息
            const stats = WBAP.SuperMemory?.getPedsaJsStats?.();
            if (stats) {
                statusEl.textContent = '已初始化';
                statusEl.style.color = '#88ffcc';
                nodesEl.textContent = `${stats.totalNodes || 0} (特征: ${stats.featureNodes || 0}, 事件: ${stats.eventNodes || 0})`;
                timeEl.textContent = stats.lastRetrieveTime ? `${stats.lastRetrieveTime.toFixed(2)}ms` : '-';
            } else {
                statusEl.textContent = '待初始化';
                statusEl.style.color = '#ffcc88';
                nodesEl.textContent = '-';
                timeEl.textContent = '-';
            }
        } else {
            statsPanel.style.display = 'block';
            statusEl.textContent = '模块未加载';
            statusEl.style.color = '#ff8888';
            nodesEl.textContent = '-';
            timeEl.textContent = '-';
        }
    }

    async function updatePedsaRustStatus() {
        const statusEl = document.getElementById('wbap-pedsa-rust-service-status');
        if (!statusEl) return;

        // 检查 WASM 适配器状态
        const adapter = WBAP.PedsaWasmAdapter;
        if (adapter) {
            if (adapter.isAvailable && adapter._engine) {
                statusEl.textContent = 'WASM 已就绪';
                statusEl.style.color = '#88ffcc';
            } else if (adapter.isAvailable) {
                statusEl.textContent = 'WASM 已加载';
                statusEl.style.color = '#88ffcc';
            } else if (adapter._wasmModule) {
                // 模块已导入但引擎创建失败
                statusEl.textContent = '引擎异常';
                statusEl.style.color = '#ff8888';
            } else {
                // 适配器对象存在但 WASM 模块尚未加载（init 未调用或加载失败）
                statusEl.textContent = 'WASM 待加载';
                statusEl.style.color = '#ffcc88';
            }
        } else {
            // 适配器脚本尚未执行 — 可能还在加载队列中
            statusEl.textContent = '适配器未就绪';
            statusEl.style.color = '#ffcc88';
        }
    }

    // ==================== 结束 PEDSA 配置函数 ====================

    function getDefaultAgentPrompt(agentKey) {
        const defaults = {
            archivist: "你是一名档案管理员。请根据用户的查询，在世界书内容中检索最相关的条目，并简要概括关键信息。输出应客观、准确。",
            historian: "你是一名历史学家。请分析上下文中的时间线索，梳理相关事件的发展脉络。重点关注事件的因果关系和时间顺序。",
            status_reader: "你是一名状态监测员。请从文本中提取角色的当前状态（物理、心理、装备等）以及环境状态变化。以列表形式输出。"
        };
        return defaults[agentKey] || "";
    }

})();
