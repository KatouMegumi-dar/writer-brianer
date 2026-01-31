// modules/ui_logic.js



(function () {

    'use strict';



    // 莽隆庐盲驴聺氓聟篓氓卤聙氓聭陆氓聬聧莽漏潞茅聴麓氓颅聵氓聹篓

    window.WBAP = window.WBAP || {};

    const Logger = WBAP.Logger;



    let panelElement = null;

    let settingsElement = null;

    let tiagangElement = null;

    const tiagangWorldbookCache = new Map();

    let tiagangActiveWorldbook = null;



    function getGlobalPools() {

        return WBAP.getGlobalPools ? WBAP.getGlobalPools() : (WBAP.mainConfig?.globalPools || {});

    }



    function getGlobalEndpoints() {

        const pools = getGlobalPools();

        return Array.isArray(pools?.selectiveMode?.apiEndpoints) ? pools.selectiveMode.apiEndpoints : [];

    }



    function getPromptBindingIds(config, promptName) {

        if (!promptName) return [];

        const bindings = config?.promptBindings || {};

        const ids = bindings[promptName];

        return Array.isArray(ids) ? ids : [];

    }



    function setPromptBindingIds(config, promptName, ids) {

        if (!promptName) return;

        if (!config.promptBindings) config.promptBindings = {};

        config.promptBindings[promptName] = Array.isArray(ids) ? ids : [];

    }



    function getEndpointBinding(config, endpointId) {

        const bindings = config?.selectiveMode?.endpointBindings || {};

        const binding = bindings[endpointId] || {};

        return {

            worldBooks: Array.isArray(binding.worldBooks) ? binding.worldBooks : [],

            assignedEntriesMap: binding.assignedEntriesMap || {}

        };

    }



    function ensureEndpointBinding(config, endpointId) {

        if (!config.selectiveMode) config.selectiveMode = { endpointBindings: {} };

        if (!config.selectiveMode.endpointBindings) config.selectiveMode.endpointBindings = {};

        const existing = config.selectiveMode.endpointBindings[endpointId];

        if (existing) {

            if (!Array.isArray(existing.worldBooks)) existing.worldBooks = [];

            if (!existing.assignedEntriesMap) existing.assignedEntriesMap = {};

            return existing;

        }

        const binding = { worldBooks: [], assignedEntriesMap: {} };

        config.selectiveMode.endpointBindings[endpointId] = binding;

        return binding;

    }





    function ensureOptimizationApiConfig(config) {
        if (!config.optimizationApiConfig) {
            config.optimizationApiConfig = { useIndependentProfile: false, selectedEndpointId: null };
        }
        if (config.optimizationApiConfig.useIndependentProfile == null) {
            config.optimizationApiConfig.useIndependentProfile = false;
        }
        if (config.optimizationApiConfig.selectedEndpointId === undefined) {
            config.optimizationApiConfig.selectedEndpointId = null;
        }
        return config.optimizationApiConfig;
    }

    function ensureOptimizationPromptConfig(config) {
        const pools = getGlobalPools();
        if (!pools.prompts) pools.prompts = {};
        if (!Array.isArray(pools.prompts.optimizationLevel3) || pools.prompts.optimizationLevel3.length === 0) {
            const fallbackPreset = WBAP.Optimization?.getDefaultOptimizationPromptPreset?.() || {
                name: 'Default optimization preset',
                description: 'Keep character and worldbook consistency',
                systemPrompt: WBAP.DEFAULT_OPT_SYSTEM_PROMPT || '',
                promptTemplate: WBAP.DEFAULT_OPT_PROMPT_TEMPLATE || ''
            };
            pools.prompts.optimizationLevel3 = [fallbackPreset];
        }
        if (!config.optimizationLevel3) {
            config.optimizationLevel3 = { enabled: false, autoConfirm: false, selectedPromptIndex: 0 };
        }
        if (config.optimizationLevel3.selectedPromptIndex == null) {
            config.optimizationLevel3.selectedPromptIndex = 0;
        }
        if (config.optimizationLevel3.selectedPromptIndex >= pools.prompts.optimizationLevel3.length) {
            config.optimizationLevel3.selectedPromptIndex = Math.max(0, pools.prompts.optimizationLevel3.length - 1);
        }
        if (config.optimizationLevel3.autoConfirm == null) {
            config.optimizationLevel3.autoConfirm = false;
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
                selectedPromptIndex: 0
            };
        }
        const superCfg = config.superConcurrency;
        if (superCfg.selectedPromptIndex == null) superCfg.selectedPromptIndex = 0;
        if (!superCfg.mode) superCfg.mode = 'basic';
        if (!Number.isFinite(superCfg.reviewRounds) || superCfg.reviewRounds < 1) superCfg.reviewRounds = 1;
        if (superCfg.showPanel === undefined) superCfg.showPanel = true;
        return superCfg;
    }

    function ensureTiagangConfig(config) {
        const pools = getGlobalPools();
        if (!pools.prompts) pools.prompts = {};
        if (!Array.isArray(pools.prompts.tiangang) || pools.prompts.tiangang.length === 0) {
            const fallbackPreset = WBAP.createDefaultTiangangPromptPreset
                ? WBAP.createDefaultTiangangPromptPreset()
                : {
                    name: 'Tiangang Prompt',
                    description: 'Plot guidance prompt',
                    systemPrompt: '',
                    mainPrompt: '',
                    finalSystemDirective: '',
                    variables: { sulv1: '', sulv2: '', sulv3: '', sulv4: '' }
                };
            pools.prompts.tiangang = [fallbackPreset];
        }
        if (!config.tiangang) {
            config.tiangang = {
                enabled: false,
                selectedPromptIndex: 0,
                contextRounds: config.contextRounds ?? 5,
                worldBooks: [],
                assignedEntriesMap: {}
            };
        }
        const tgCfg = config.tiangang;
        if (tgCfg.selectedPromptIndex == null) tgCfg.selectedPromptIndex = 0;
        if (tgCfg.selectedPromptIndex >= pools.prompts.tiangang.length) {
            tgCfg.selectedPromptIndex = Math.max(0, pools.prompts.tiangang.length - 1);
        }
        if (!Array.isArray(tgCfg.worldBooks)) tgCfg.worldBooks = [];
        if (!tgCfg.assignedEntriesMap) tgCfg.assignedEntriesMap = {};
        if (tgCfg.contextRounds == null) tgCfg.contextRounds = config.contextRounds ?? 5;
        return tgCfg;
    }

    function renderOptimizationEndpointOptions(selectedId = null) {
        const selectEl = document.getElementById('wbap-optimization-endpoint-select');
        if (!selectEl) return;
        const endpoints = getGlobalEndpoints().filter(ep => ep && ep.enabled !== false);

        selectEl.innerHTML = '';
        if (endpoints.length === 0) {
            const opt = document.createElement('option');
            opt.value = '';
            opt.textContent = 'No available API';
            selectEl.appendChild(opt);
            selectEl.disabled = true;
            return;
        }

        endpoints.forEach(ep => {
            const opt = document.createElement('option');
            opt.value = ep.id;
            const modelLabel = ep.model ? ` (${ep.model})` : '';
            opt.textContent = `${ep.name || ep.id}${modelLabel}`;
            selectEl.appendChild(opt);
        });
        selectEl.disabled = false;
        const chosen = (selectedId && endpoints.some(ep => ep.id === selectedId)) ? selectedId : endpoints[0].id;
        selectEl.value = chosen;
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
            modelSelect.innerHTML = '<option value="" disabled selected>Please fetch models first</option>';
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
            modelSelect.innerHTML = '<option value="" disabled selected>Please fetch models first</option>';
        }
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
        const pools = getGlobalPools();
        if (!pools.prompts) pools.prompts = {};
        if (!Array.isArray(pools.prompts.cabinet)) pools.prompts.cabinet = [];
        const prompts = pools.prompts.cabinet;
        const selectEl = document.getElementById('wbap-cabinet-prompt-select');
        const descriptionEl = document.getElementById('wbap-cabinet-prompt-description');
        if (!selectEl || !descriptionEl) return;

        if (prompts.length === 0) {
            selectEl.innerHTML = '<option value="0">No prompts</option>';
            descriptionEl.textContent = '';
            refreshCabinetPromptVariables();
            return;
        }

        let idx = superCfg.selectedPromptIndex ?? 0;
        if (idx < 0 || idx >= prompts.length) {
            idx = Math.max(0, prompts.length - 1);
            superCfg.selectedPromptIndex = idx;
            WBAP.saveConfig();
        }

        selectEl.innerHTML = prompts.map((p, index) => `<option value="${index}">${p.name || `Preset ${index + 1}`}</option>`).join('');
        selectEl.value = idx;
        descriptionEl.textContent = prompts[idx]?.description || '';
        refreshCabinetPromptVariables();
    }

    function refreshCabinetPromptVariables() {
        const container = document.getElementById('wbap-cabinet-variables-container');
        if (!container) return;
        container.innerHTML = '';

        const config = WBAP.CharacterManager ? WBAP.CharacterManager.getCurrentCharacterConfig() : WBAP.config;
        if (!config) return;
        const superCfg = ensureSuperConcurrencyConfig(config);
        const pools = getGlobalPools();
        const prompts = pools.prompts?.cabinet || [];
        const prompt = prompts[superCfg.selectedPromptIndex ?? 0];
        if (!prompt) return;

        const variables = prompt.variables || {};
        const updateVariable = (key, value) => {
            prompt.variables = { ...(prompt.variables || {}), [key]: value };
            WBAP.saveConfig();
        };

        for (let i = 1; i <= 4; i++) {
            const key = `sulv${i}`;
            const value = variables[key] || '';
            const item = document.createElement('div');
            item.className = 'wbap-variable-item';
            item.innerHTML = `<label for="wbap-cabinet-var-${key}">${key}</label><input type="text" id="wbap-cabinet-var-${key}" value="${value}" placeholder="${key}">`;
            const inputEl = item.querySelector('input');
            inputEl.addEventListener('input', (e) => updateVariable(key, e.target.value));
            container.appendChild(item);
        }
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

        if (document.getElementById('wbap-float-btn')) return;



        const floatBtn = document.createElement('button');

        floatBtn.id = 'wbap-float-btn';

        floatBtn.className = 'wbap-fab'; // 盲陆驴莽聰篓CSS莽卤?
        floatBtn.innerHTML = '<i class="fa-solid fa-cat"></i>';

        floatBtn.title = '悬浮入口';

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

        // 防止历史位置存储把按钮放出视口，首次及窗口变化时钳制位置
        const clampMainFabPosition = () => {
            const rect = floatBtn.getBoundingClientRect();
            const margin = 12;
            const top = Math.max(margin, Math.min(rect.top, window.innerHeight - rect.height - margin));
            const left = Math.max(margin, Math.min(rect.left, window.innerWidth - rect.width - margin));
            floatBtn.style.top = `${top}px`;
            floatBtn.style.left = `${left}px`;
            floatBtn.style.right = 'auto';
            floatBtn.style.bottom = 'auto';
        };
        requestAnimationFrame(clampMainFabPosition);
        window.addEventListener('resize', clampMainFabPosition);



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

        Logger.log('悬浮按钮已注入');

    }



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

            Logger.log('氓录聙氓搂聥忙鲁篓氓聟?UI');



            const templates = WBAP.UI_TEMPLATES;

            if (!templates) {

                Logger.error('UI 忙篓隆忙聺驴盲赂聧氓聫炉莽聰篓茂录聦忙聴聽忙鲁聲忙鲁篓氓聟楼茫聙?');

                return;

            }



            if (document.getElementById('wbap-panel')) {

                panelElement = document.getElementById('wbap-panel');

                settingsElement = document.getElementById('wbap-settings');

                tiagangElement = document.getElementById('wbap-tiagang-settings');

                ensureFloatButton();



                const progress = ensureProgressPanel(templates);

                bindProgressPanelEvents();



                Logger.log('UI 氓路虏氓颅聵氓聹篓茂录聦氓路虏猫隆楼茅陆聬莽录潞氓陇卤莽禄聞盲禄?');

                return;

            }



            // 忙鲁篓氓聟楼忙聜卢忙碌庐忙聦聣茅聮庐

            ensureFloatButton();



            // 忙鲁篓氓聟楼忙篓隆忙聺驴

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

            if (settingsElement) {

                Logger.log('猫庐戮莽陆庐氓聟聝莽麓聽 #wbap-settings 氓路虏忙聢聬氓聤聼忙鲁篓氓聟楼氓聮聦猫聨路氓聫聳茫聙?');

            } else {

                Logger.error('茅聰聶猫炉炉茂录職忙聴聽忙鲁聲猫聨路氓聫?#wbap-settings 氓聟聝莽麓聽茫聙?');

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



            ensureProgressPanel(templates);



            // 莽禄聭氓庐職盲潞聥盲禄露氓鹿露氓聢路忙聳?
            bindPanelEvents();

            bindSettingsEvents();

            bindTiagangEvents();

            bindMemorySection();

            bindEditorEvents();

            bindEndpointEditorEvents();

            bindProgressPanelEvents();

            refreshPromptList();

            loadSettingsToUI();

            renderApiEndpoints();



            syncMobileRootFix();

            Logger.log('UI 忙鲁篓氓聟楼忙聢聬氓聤聼');

        } catch (e) {

            Logger.error('UI 忙鲁篓氓聟楼氓陇卤猫麓楼:', e);

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



        // 氓聢聺氓搂聥氓聦聳猫庐掳氓驴聠莽聤露忙聙聛氓戮陆莽芦?
        const memStatus = document.getElementById('wbap-memory-status');

        if (memStatus) {

            const cfg = WBAP.CharacterManager?.getCurrentCharacterConfig?.() || WBAP.config;

            const enabled = cfg?.memoryModule?.enabled === true;

            memStatus.textContent = enabled ? '已启用' : '未启用';

            memStatus.classList.toggle('wbap-badge-success', enabled);

            memStatus.classList.add('wbap-badge');

        }



        const promptSelect = document.getElementById('wbap-prompt-preset-select');

        promptSelect?.addEventListener('change', () => {

            const currentConfig = WBAP.CharacterManager ? WBAP.CharacterManager.getCurrentCharacterConfig() : WBAP.config;

            const newIndex = parseInt(promptSelect.value);

            currentConfig.selectedPromptIndex = newIndex;

            // 氓聬聦忙颅楼忙聸麓忙聳掳氓聟篓氓卤聙 config

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



        // 氓聣炉忙聫聬莽陇潞猫炉聧盲潞聥盲禄露

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



        // 盲赂禄忙聫聬莽陇潞猫炉聧莽禄聭氓庐職氓聟楼氓聫拢茂录聢茅聺垄忙聺驴茂录聣

        const mainBindingBtn = document.getElementById('wbap-prompt-bind-apis-btn');

        const mainBindingList = document.getElementById('wbap-prompt-binding-list');

        if (mainBindingBtn && mainBindingList) {

            mainBindingBtn.addEventListener('click', () => {

                const hidden = mainBindingList.style.display === 'none' || mainBindingList.style.display === '';

                mainBindingList.style.display = hidden ? 'block' : 'none';

            });

            mainBindingList.addEventListener('change', () => {

                const selected = getPromptBindingSelection();

                // 忙聸麓忙聳掳莽禄聭氓庐職忙聽聡莽颅戮氓聮聦忙聭聵猫娄聛茂录聢盲赂聧茅聡聧忙聳掳忙赂虏忙聼聯氓聢聴猫隆篓茂录聦茅聛驴氓聟聧氓聢聴猫隆篓忙聰露猫碌路茂录?
                updatePromptBindingTags(selected);

                updatePromptBindingSummary(selected);

                const cfg = WBAP.CharacterManager ? WBAP.CharacterManager.getCurrentCharacterConfig() : WBAP.config;

                const prompts = WBAP.PromptManager.getCombinedPrompts();

                const currentPrompt = prompts[cfg.selectedPromptIndex || 0];

                if (currentPrompt?.name) {

                    setPromptBindingIds(cfg, currentPrompt.name, selected);

                    WBAP.saveConfig();

                    // ??????? refreshPromptList()?????????

                }

            });

        }



        // 盲禄拢莽聬聠 API 氓聢聴猫隆篓莽聜鹿氓聡禄茂录聢莽搂禄氓聤篓莽芦炉忙聸麓氓聫聥氓楼陆茂录聣

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

            btn.textContent = '氓路虏氓潞聰莽聰?';

            setTimeout(() => {

                btn.textContent = '氓潞聰莽聰篓氓聫聵茅聡聫';

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

                        // 氓聬聦忙颅楼忙聸麓忙聳掳氓聟篓氓卤聙 config

                        if (WBAP.config !== currentConfig) {

                            WBAP.config.selectedPromptIndex = currentConfig.selectedPromptIndex;

                        }

                        // 莽隆庐盲驴聺忙聙禄氓卤聙忙聫聬莽陇潞猫炉聧莽麓垄氓录聲盲禄聧氓聹篓忙聹聣忙聲聢猫聦聝氓聸麓氓聠聟

                        if (currentConfig.aggregatorMode) {

                            const maxIndex = Math.max(0, combinedPrompts.length - 1);

                            currentConfig.aggregatorMode.promptIndex = Math.min(currentConfig.aggregatorMode.promptIndex ?? 0, maxIndex);

                        }

                        WBAP.saveConfig();

                        refreshPromptList();

                        renderAggregatorControls();

                        Logger.log('忙聫聬莽陇潞猫炉聧氓炉录氓聟楼忙聢聬氓聤?', prompt.name);

                    } catch (err) {

                        Logger.error('氓炉录氓聟楼忙聫聬莽陇潞猫炉聧氓陇卤猫麓?', err);

                        alert('氓炉录氓聟楼氓陇卤猫麓楼: ' + err.message);

                    }

                }

                fileInput.value = '';

            });

        }



        // 忙聫聬莽陇潞猫炉聧茅聙聣忙聥漏氓录鹿莽陋聴

        const promptPickerModal = document.getElementById('wbap-prompt-picker-modal');

        const promptPickerList = document.getElementById('wbap-prompt-picker-list');

        const openPromptPicker = () => {

            if (!promptPickerModal || !promptPickerList) return;

            const prompts = WBAP.PromptManager.getCombinedPrompts();

            const currentConfig = WBAP.CharacterManager ? WBAP.CharacterManager.getCurrentCharacterConfig() : WBAP.config;

            const selected = currentConfig.selectedPromptIndex || 0;

            if (!prompts.length) {

                promptPickerList.innerHTML = '<div class="wbap-empty-state"><p>忙職聜忙聴聽茅垄聞猫庐戮茂录聦猫炉路氓聟聢忙聳掳氓禄潞忙聢聳氓炉录氓聟楼</p></div>';

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

            const pools = getGlobalPools();

            if (!pools.selectiveMode) pools.selectiveMode = { apiEndpoints: [] };

            if (!Array.isArray(pools.selectiveMode.apiEndpoints)) pools.selectiveMode.apiEndpoints = [];

            const endpoints = pools.selectiveMode.apiEndpoints;

            endpoints.push({

                id: `ep_${Date.now()}`,

                name: `忙聳掳氓垄聻API-${endpoints.length + 1}`,

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

                        Logger.error('氓炉录氓聟楼氓聠聟茅聵聛忙聫聬莽陇潞猫炉聧氓陇卤猫麓?', err);

                        alert('氓炉录氓聟楼氓陇卤猫麓楼: ' + err.message);

                    } finally {

                        cabinetFileInput.value = '';

                    }

                }

            });

        }

        document.getElementById('wbap-cabinet-save-variables-btn')?.addEventListener('click', (e) => {

            WBAP.saveConfig();

            const btn = e.currentTarget;

            btn.textContent = '氓路虏氓潞聰莽聰?';

            setTimeout(() => {

                btn.textContent = '氓潞聰莽聰篓氓聫聵茅聡聫';

            }, 1500);

        });



        const optimizationCheckbox = document.getElementById('wbap-settings-plot-optimization');

        optimizationCheckbox?.addEventListener('change', (e) => {

            setOptimizationSectionState(e.target.checked === true);

        });



        // 盲赂聣莽潞搂盲录聵氓聦聳氓录聙氓聟?
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

            const pools = getGlobalPools();

            const presets = pools.prompts?.optimizationLevel3 || [];

            const preset = presets[idx];

            WBAP.saveConfig();

            refreshOptimizationPromptList();

        });



        document.getElementById('wbap-opt-prompt-new-btn')?.addEventListener('click', () => {

            const config = WBAP.CharacterManager.getCurrentCharacterConfig();

            const level3Cfg = ensureOptimizationPromptConfig(config);

            const pools = getGlobalPools();

            const presets = pools.prompts?.optimizationLevel3 || [];

            const basePreset = WBAP.Optimization?.getDefaultOptimizationPromptPreset?.() || {

                name: '?????',

                description: '',

                systemPrompt: WBAP.DEFAULT_OPT_SYSTEM_PROMPT || '',

                promptTemplate: WBAP.DEFAULT_OPT_PROMPT_TEMPLATE || ''

            };

            const nextIndex = presets.length + 1;

            const newPreset = {

                ...basePreset,

                name: `${basePreset.name || '?????'} ${nextIndex}`

            };

            presets.push(newPreset);

            level3Cfg.selectedPromptIndex = presets.length - 1;

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

            const pools = getGlobalPools();

            const presets = pools.prompts?.optimizationLevel3 || [];

            if (presets.length <= 1) {

                alert('???????????');

                return;

            }

            const idx = level3Cfg.selectedPromptIndex || 0;

            const target = presets[idx];

        if (!confirm(`确定删除预设「${target?.name || "未命名"}」？`)) return;

            presets.splice(idx, 1);

            level3Cfg.selectedPromptIndex = Math.max(0, Math.min(idx, presets.length - 1));

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

                        throw new Error('忙聫聬莽陇潞猫炉聧氓聠聟氓庐鹿盲赂潞莽漏?');

                    }

                    const config = WBAP.CharacterManager.getCurrentCharacterConfig();

                    const level3Cfg = ensureOptimizationPromptConfig(config);

                    const pools = getGlobalPools();

                    const presets = pools.prompts?.optimizationLevel3 || [];

                    presets.push(preset);

                    level3Cfg.selectedPromptIndex = presets.length - 1;

                    WBAP.saveConfig();

                    refreshOptimizationPromptList();

                } catch (err) {

                    Logger.error('氓炉录氓聟楼氓聣搂忙聝聟盲录聵氓聦聳忙聫聬莽陇潞猫炉聧氓陇卤猫麓?', err);

                    alert('氓炉录氓聟楼氓陇卤猫麓楼: ' + err.message);

                } finally {

                    optPromptFileInput.value = '';

                }

            });

        }



        document.getElementById('wbap-opt-prompt-export-btn')?.addEventListener('click', () => {

            const config = WBAP.CharacterManager.getCurrentCharacterConfig();

            const level3Cfg = ensureOptimizationPromptConfig(config);

            const pools = getGlobalPools();

            const presets = pools.prompts?.optimizationLevel3 || [];

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

                alert(`猫聨路氓聫聳忙篓隆氓聻聥氓陇卤猫麓楼: ${result.message}`);

            }



            btn.innerHTML = '猫聨路氓聫聳忙篓隆氓聻聥';

            btn.disabled = false;

        });



        document.getElementById('wbap-save-settings')?.addEventListener('click', () => {
            const config = WBAP.CharacterManager.getCurrentCharacterConfig();

            config.enabled = document.getElementById('wbap-enabled').checked;
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

            // Global settings
            const globalSettings = WBAP.mainConfig.globalSettings || {};
            globalSettings.maxConcurrent = parseInt(document.getElementById('wbap-global-max-concurrent')?.value) || 0;
            globalSettings.timeout = parseInt(document.getElementById('wbap-global-timeout')?.value) || 0;
            globalSettings.enableSuperConcurrency = document.getElementById('wbap-super-concurrency')?.checked === true;
            WBAP.mainConfig.globalSettings = globalSettings;

            config.showProgressPanel = document.getElementById('wbap-settings-progress-panel')?.checked !== false;
            config.enablePlotOptimization = document.getElementById('wbap-settings-plot-optimization')?.checked === true;
            config.enablePlotOptimizationFloatButton = document.getElementById('wbap-settings-plot-optimization-fab')?.checked === true;

            const optimizationApiConfig = ensureOptimizationApiConfig(config);
            const pools = getGlobalPools();
            if (!pools.optimization) pools.optimization = {};
            if (!pools.optimization.apiConfig) pools.optimization.apiConfig = {};
            const optProfile = pools.optimization.apiConfig;

            optimizationApiConfig.useIndependentProfile = document.getElementById('wbap-optimization-use-independent')?.checked === true;
            optimizationApiConfig.selectedEndpointId = document.getElementById('wbap-optimization-endpoint-select')?.value || null;
            optProfile.apiUrl = document.getElementById('wbap-optimization-api-url')?.value || '';
            optProfile.apiKey = document.getElementById('wbap-optimization-api-key')?.value || '';
            optProfile.model = document.getElementById('wbap-optimization-model')?.value || '';
            const optMaxTokens = parseInt(document.getElementById('wbap-optimization-max-tokens')?.value, 10);
            optProfile.maxTokens = Number.isFinite(optMaxTokens) && optMaxTokens > 0 ? optMaxTokens : 4000;
            const optTemp = parseFloat(document.getElementById('wbap-optimization-temperature')?.value);
            optProfile.temperature = Number.isFinite(optTemp) ? optTemp : 0.7;
            const optTimeout = parseInt(document.getElementById('wbap-optimization-timeout')?.value, 10);
            optProfile.timeout = Number.isFinite(optTimeout) && optTimeout > 0 ? optTimeout : 60;
            const optRetries = parseInt(document.getElementById('wbap-optimization-max-retries')?.value, 10);
            optProfile.maxRetries = Number.isFinite(optRetries) && optRetries >= 0 ? optRetries : 2;
            const optRetryDelay = parseInt(document.getElementById('wbap-optimization-retry-delay')?.value, 10);
            optProfile.retryDelayMs = Number.isFinite(optRetryDelay) && optRetryDelay > 0 ? optRetryDelay : 800;
            optProfile.enableStreaming = document.getElementById('wbap-optimization-streaming')?.checked !== false;

            const superCfg = ensureSuperConcurrencyConfig(config);
            superCfg.mode = document.getElementById('wbap-super-concurrency-mode')?.value || 'basic';
            const reviewRounds = parseInt(document.getElementById('wbap-super-concurrency-rounds')?.value, 10);
            superCfg.reviewRounds = Number.isFinite(reviewRounds) && reviewRounds > 0 ? reviewRounds : 1;
            superCfg.showPanel = document.getElementById('wbap-super-concurrency-show-panel')?.checked !== false;

            WBAP.saveConfig();
            if (WBAP.Optimization && WBAP.Optimization.updateFloatingButtonVisibility) {
                WBAP.Optimization.updateFloatingButtonVisibility();
            }
            if (optimizationApiConfig.useIndependentProfile && optProfile.apiUrl && WBAP.setupPreconnect) {
                WBAP.setupPreconnect([{ apiUrl: optProfile.apiUrl }]);
            }
            if (settingsElement) settingsElement.classList.remove('open');
            if (panelElement) panelElement.classList.add('open');
            syncMobileRootFix();
            Logger.log('脡猫脰脙脪脩卤拢麓忙碌陆碌卤脟掳陆脟脡芦', config);
        });
    function loadSettingsToUI() {
        const config = WBAP.CharacterManager.getCurrentCharacterConfig();
        if (!config) return;
        if (!config.aggregatorMode) {
            config.aggregatorMode = { enabled: false, endpointId: '', promptIndex: 0, allowDuplicate: false };
        } else if (config.aggregatorMode.allowDuplicate == null) {
            config.aggregatorMode.allowDuplicate = false;
        }

        const enabledEl = document.getElementById('wbap-enabled');
        if (enabledEl) enabledEl.checked = config.enabled !== false;

        const global = WBAP.mainConfig.globalSettings || {};
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

        const level3EnabledEl = document.getElementById('wbap-settings-level3-enabled');
        if (level3EnabledEl) {
            level3EnabledEl.checked = config.optimizationLevel3?.enabled === true;
        }

        setOptimizationSectionState(config.enablePlotOptimization === true);

        refreshOptimizationPromptList();
        const optimizationApiConfig = ensureOptimizationApiConfig(config);
        const pools = getGlobalPools();
        if (!pools.optimization) pools.optimization = {};
        if (!pools.optimization.apiConfig) pools.optimization.apiConfig = {};
        const optProfile = pools.optimization.apiConfig;
        const optimizationUseEl = document.getElementById('wbap-optimization-use-independent');
        if (optimizationUseEl) {
            optimizationUseEl.checked = optimizationApiConfig.useIndependentProfile === true;
        }
        toggleOptimizationApiBlocks(optimizationApiConfig.useIndependentProfile === true);
        renderOptimizationEndpointOptions(optimizationApiConfig.selectedEndpointId);
        const optimizationUrlEl = document.getElementById('wbap-optimization-api-url');
        if (optimizationUrlEl) optimizationUrlEl.value = optProfile.apiUrl || '';
        const optimizationKeyEl = document.getElementById('wbap-optimization-api-key');
        if (optimizationKeyEl) optimizationKeyEl.value = optProfile.apiKey || '';
        const optimizationMaxTokensEl = document.getElementById('wbap-optimization-max-tokens');
        if (optimizationMaxTokensEl) optimizationMaxTokensEl.value = optProfile.maxTokens || 4000;
        const optimizationTempEl = document.getElementById('wbap-optimization-temperature');
        if (optimizationTempEl) optimizationTempEl.value = optProfile.temperature ?? 0.7;
        const optimizationTimeoutEl = document.getElementById('wbap-optimization-timeout');
        if (optimizationTimeoutEl) optimizationTimeoutEl.value = optProfile.timeout ?? 60;
        const optimizationRetriesEl = document.getElementById('wbap-optimization-max-retries');
        if (optimizationRetriesEl) optimizationRetriesEl.value = Number.isFinite(optProfile.maxRetries) ? optProfile.maxRetries : 2;
        const optimizationRetryDelayEl = document.getElementById('wbap-optimization-retry-delay');
        if (optimizationRetryDelayEl) optimizationRetryDelayEl.value = Number.isFinite(optProfile.retryDelayMs) ? optProfile.retryDelayMs : 800;
        const optimizationStreamingEl = document.getElementById('wbap-optimization-streaming');
        if (optimizationStreamingEl) optimizationStreamingEl.checked = optProfile.enableStreaming !== false;
        populateOptimizationModelSelect([], optProfile.model || '');

        renderApiEndpoints();
        renderAggregatorControls();
        refreshPromptList();
        refreshSecondaryPromptUI();
        refreshCabinetPromptList();
        loadTiagangSettingsToUI();
        if (WBAP.Optimization && typeof WBAP.Optimization.updateFloatingButtonVisibility === 'function') {
            WBAP.Optimization.updateFloatingButtonVisibility();
        }
    }
    function renderApiEndpoints() {

        const listContainer = document.getElementById('wbap-api-endpoint-list');

        if (!listContainer) return;



        const config = WBAP.CharacterManager.getCurrentCharacterConfig();

        const endpoints = getGlobalEndpoints();

        renderOptimizationEndpointOptions(config?.optimizationApiConfig?.selectedEndpointId || null);



        if (endpoints.length === 0) {

            listContainer.innerHTML = '<div class="wbap-empty-state"><p>??API???????????????</p></div>';

            return;

        }



        listContainer.innerHTML = endpoints.map((ep) => {

            const binding = getEndpointBinding(config, ep.id);

            const entryCount = Object.values(binding.assignedEntriesMap || {}).reduce((sum, arr) => sum + (arr?.length || 0), 0);

            const bookNames = (binding.worldBooks && binding.worldBooks.length) ? binding.worldBooks : ['???'];

            return `

            <div class="wbap-api-endpoint-item" data-id="${ep.id}">

                <div class="wbap-api-endpoint-header">

                    <label style="display:flex; gap:8px; align-items:center;">

                        <input type="checkbox" class="wbap-endpoint-enabled" data-id="${ep.id}" ${ep.enabled === false ? '' : 'checked'}>

                        <span>${ep.name}?${entryCount} ??${bookNames.join(', ')}?</span>

                    </label>

                    <div>

                        <button class="wbap-btn wbap-btn-icon wbap-btn-xs" onclick="window.wbapEditEndpoint('${ep.id}')" title="??API??">

                            <i class="fa-solid fa-pencil"></i>

                        </button>

                        <button class="wbap-btn wbap-btn-icon wbap-btn-danger wbap-btn-xs" onclick="window.wbapDeleteEndpoint('${ep.id}')" title="??">

                            <i class="fa-solid fa-trash"></i>

                        </button>

                    </div>

                </div>

            </div>

        `;

        }).join('');



        // ??????

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



        const endpoints = getGlobalEndpoints();

        endpointEl.innerHTML = '';

        if (endpoints.length === 0) {

            endpointEl.innerHTML = '<option value=\"\">猫炉路氓聟聢忙聳掳氓垄聻 API 氓庐聻盲戮聥</option>';

            endpointEl.disabled = true;

        } else {

            endpointEl.disabled = false;

            endpoints.forEach(ep => {

                const opt = document.createElement('option');

                opt.value = ep.id;

                opt.textContent = ep.name || ep.id;

                endpointEl.appendChild(opt);

            });

            if (!cfg.aggregatorMode.endpointId || !endpoints.find(ep => ep.id === cfg.aggregatorMode.endpointId)) {

                cfg.aggregatorMode.endpointId = endpoints[0].id;

            }

            endpointEl.value = cfg.aggregatorMode.endpointId || '';

        }



        const prompts = WBAP.PromptManager.getCombinedPrompts();

        promptEl.innerHTML = '';

        if (prompts.length === 0) {

            promptEl.innerHTML = '<option value=\"0\">忙職聜忙聴聽忙聫聬莽陇潞猫炉?/option>';

            promptEl.disabled = true;

        } else {

            promptEl.disabled = false;

            prompts.forEach((p, idx) => {

                const opt = document.createElement('option');

                opt.value = idx;

                opt.textContent = p.name || `茅垄聞猫庐戮${idx + 1}`;

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

        const pools = getGlobalPools();

        const presets = pools.prompts?.optimizationLevel3 || [];

        const hasPresets = presets.length > 0;



        selectEl.disabled = !hasPresets;

        if (editBtn) editBtn.disabled = !hasPresets;

        if (exportBtn) exportBtn.disabled = !hasPresets;

        if (deleteBtn) deleteBtn.disabled = !hasPresets;



        if (!hasPresets) {

            selectEl.innerHTML = '<option>忙聴聽氓聫炉莽聰篓茅垄聞猫庐?/option>';

            descEl.textContent = '猫炉路忙聳掳氓禄潞忙聢聳氓炉录氓聟楼盲赂聙盲赂陋忙聫聬莽陇潞猫炉聧茅垄聞猫庐戮茫聙?';

            return;

        }



        let idx = level3Cfg.selectedPromptIndex || 0;

        if (idx >= presets.length) {

            idx = presets.length - 1;

            level3Cfg.selectedPromptIndex = idx;

            WBAP.saveConfig();

        }



        selectEl.innerHTML = presets.map((p, index) => `<option value="${index}">${p.name || `忙聹陋氓聭陆氓聬聧茅垄聞猫庐?${index + 1}`}</option>`).join('');

        selectEl.value = idx;

        descEl.textContent = presets[idx]?.description || '忙颅陇茅垄聞猫庐戮忙虏隆忙聹聣忙聫聫猫驴掳茫聙?';

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



        // 莽隆庐盲驴聺盲禄聨氓陆聯氓聣聧猫搂聮猫聣虏莽職聞茅聟聧莽陆庐猫炉禄氓聫聳

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

            selectEl.innerHTML = '<option>忙聴聽氓聫炉莽聰篓茅垄聞猫庐?/option>';

            descriptionArea.textContent = '猫炉路忙聳掳氓禄潞忙聢聳氓炉录氓聟楼盲赂聙盲赂陋忙聫聬莽陇潞猫炉聧茅垄聞猫庐戮茫聙?';

            if (bindingSummary) bindingSummary.textContent = '';

            if (secondarySelect) secondarySelect.innerHTML = '<option>忙聴聽氓聫炉莽聰篓茅垄聞猫庐?/option>';

            if (secondaryDesc) secondaryDesc.textContent = '猫炉路忙聳掳氓禄潞忙聢聳氓炉录氓聟楼盲赂聙盲赂陋忙聫聬莽陇潞猫炉聧茅垄聞猫庐戮茫聙?';

            return;

        }



        if (selectedIndex >= prompts.length) {

            selectedIndex = prompts.length - 1;

            currentConfig.selectedPromptIndex = selectedIndex;

            // 氓聬聦忙颅楼忙聸麓忙聳掳氓聟篓氓卤聙 config

            if (WBAP.config !== currentConfig) {

                WBAP.config.selectedPromptIndex = selectedIndex;

            }

            WBAP.saveConfig();

        }



        selectEl.innerHTML = prompts.map((p, index) => `<option value="${index}">${p.name || `忙聹陋氓聭陆氓聬聧茅垄聞猫庐?${index + 1}`}</option>`).join('');

        selectEl.value = selectedIndex;

        descriptionArea.textContent = prompts[selectedIndex].description || '忙颅陇茅垄聞猫庐戮忙虏隆忙聹聣忙聫聫猫驴掳茫聙?';

        if (bindingSummary) {

            const boundIds = getPromptBindingIds(currentConfig, prompts[selectedIndex]?.name);

            const endpoints = getGlobalEndpoints();

            const nameMap = new Map(endpoints.map(ep => [ep.id, ep.name || ep.id]));

            if (boundIds.length === 0) {

                bindingSummary.textContent = '忙聹陋莽禄聭氓庐?API茂录聢氓掳聠盲陆驴莽聰篓忙聣聙忙聹聣氓路虏茅聟聧莽陆庐氓庐聻盲戮聥茂录聣茫聙?';

            } else {

                const names = boundIds.map(id => nameMap.get(id) || id);

                bindingSummary.textContent = `氓路虏莽禄聭氓庐?${boundIds.length} 盲赂?API茂录?{names.join(', ')}`;

            }

        }

        const boundIdsMain = getPromptBindingIds(currentConfig, prompts[selectedIndex]?.name);

        renderPromptBindingList(boundIdsMain);

        updatePromptBindingTags(boundIdsMain);

        refreshPromptVariables();



        // 氓聣炉忙聫聬莽陇潞猫炉聧盲赂聥忙聥聣

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

            secondarySelect.innerHTML = prompts.map((p, index) => `<option value="${index}">${p.name || `忙聹陋氓聭陆氓聬聧茅垄聞猫庐?${index + 1}`}</option>`).join('');

            secondarySelect.value = secondaryIndex;

            if (secondaryDesc) {

                secondaryDesc.textContent = prompts[secondaryIndex]?.description || '忙颅陇茅垄聞猫庐戮忙虏隆忙聹聣忙聫聫猫驴掳茫聙?';

            }

            refreshSecondaryPromptUI();

        }



        // 盲驴聺猫炉聛忙聙禄氓卤聙盲赂聥忙聥聣氓庐聻忙聴露氓聬聦忙颅楼忙聹聙忙聳掳忙聫聬莽陇潞猫炉聧氓聢聴猫隆篓茂录聢氓聬芦氓炉录氓聟楼茂录?
        renderAggregatorControls();

    }



    function refreshPromptVariables() {

        const container = document.getElementById('wbap-prompt-variables-container');

        if (!container) return;

        container.innerHTML = '';



        // 莽隆庐盲驴聺盲禄聨氓陆聯氓聣聧猫搂聮猫聣虏莽職聞茅聟聧莽陆庐猫炉禄氓聫聳茂录聢猫搂聮猫聣虏氓聢聡忙聧垄氓聬聨 WBAP.config 氓潞聰猫炉楼氓路虏莽禄聫忙聦聡氓聬聭忙聳掳猫搂聮猫聣虏莽職聞茅聟聧莽陆庐茂录?
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

            Logger.log(`氓聫聵茅聡聫 ${key} 氓路虏盲驴聺氓颅聵氓聢掳猫搂聮猫聣虏茅聟聧莽陆庐: ${value}`);

        };



        for (let i = 1; i <= 4; i++) {

            const key = `sulv${i}`;

            const value = variables[key] || '';

            const item = document.createElement('div');

            item.className = 'wbap-variable-item';

            item.innerHTML = `<label for="wbap-var-${key}">${key}</label><input type="text" id="wbap-var-${key}" value="${value}" placeholder="氓聫聵茅聡聫 ${key} 莽職聞氓聙?>`;

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

            secondaryDesc.textContent = '猫炉路忙聳掳氓禄潞忙聢聳氓炉录氓聟楼盲赂聙盲赂陋忙聫聬莽陇潞猫炉聧茅垄聞猫庐戮茫聙?';

            updateSecondaryBindingSummary([]);

            if (bindingList) bindingList.innerHTML = '<small class="wbap-text-muted">忙職聜忙聴聽氓路虏茅聟聧莽陆庐莽職聞 API 氓庐聻盲戮聥茫聙?/small>';

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

        secondaryDesc.textContent = prompts[idx]?.description || '忙颅陇茅垄聞猫庐戮忙虏隆忙聹聣忙聫聫猫驴掳茫聙?';



        const boundIds = Array.isArray(cfg.secondaryPrompt.boundEndpointIds) ? cfg.secondaryPrompt.boundEndpointIds : [];

        renderSecondaryBindingList(boundIds);

        updateSecondaryBindingSummary(boundIds);

    }



    function updatePromptBindingTags(selectedIds = [], endpoints = null) {

        const tagsEl = document.getElementById('wbap-prompt-bound-apis');

        if (!tagsEl) return;

        const eps = endpoints || getGlobalEndpoints();

        if (!selectedIds || selectedIds.length === 0) {

            tagsEl.innerHTML = '<small class="wbap-text-muted">忙聹陋莽禄聭氓庐職茂录聢茅禄聵猫庐陇盲陆驴莽聰篓氓聟篓茅聝篓茂录?/small>';

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

        const endpoints = getGlobalEndpoints();

        const map = new Map(endpoints.map(ep => [ep.id, ep.name || ep.id]));

        if (!selectedIds || selectedIds.length === 0) {

            summaryEl.textContent = '忙聹陋莽禄聭氓庐?API茂录聢氓掳聠盲陆驴莽聰篓忙聣聙忙聹聣氓路虏茅聟聧莽陆庐氓庐聻盲戮聥茂录聣茫聙?';

            return;

        }

        const names = selectedIds.map(id => map.get(id) || id);

        summaryEl.textContent = `氓路虏莽禄聭氓庐?${selectedIds.length} 盲赂?API茂录?{names.join(', ')}`;

    }



    function renderSecondaryBindingList(selectedIds = []) {

        const listEl = document.getElementById('wbap-secondary-binding-list');

        if (!listEl) return;

        const currentConfig = WBAP.CharacterManager.getCurrentCharacterConfig();

        const endpoints = getGlobalEndpoints();

        const selected = new Set(selectedIds);

        if (endpoints.length === 0) {

            listEl.innerHTML = '<small class="wbap-text-muted">忙職聜忙聴聽氓路虏茅聟聧莽陆庐莽職聞 API 氓庐聻盲戮聥茫聙?/small>';

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

        const endpoints = getGlobalEndpoints();

        const selected = new Set(selectedIds);

        if (endpoints.length === 0) {

            listEl.innerHTML = '<small class="wbap-text-muted">忙職聜忙聴聽氓路虏茅聟聧莽陆庐莽職聞 API 氓庐聻盲戮聥茫聙?/small>';

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

        const currentConfig = WBAP.CharacterManager ? WBAP.CharacterManager.getCurrentCharacterConfig() : WBAP.config;

        const endpoints = getGlobalEndpoints();

        const nameMap = new Map(endpoints.map(ep => [ep.id, ep.name || ep.id]));

        if (selectedIds.length === 0) {

            bindingSummary.textContent = '忙聹陋莽禄聭氓庐?API茂录聢氓掳聠盲陆驴莽聰篓忙聣聙忙聹聣氓路虏茅聟聧莽陆庐氓庐聻盲戮聥茂录聣茫聙?';

        } else {

            const names = selectedIds.map(id => nameMap.get(id) || id);

            bindingSummary.textContent = `氓路虏莽禄聭氓庐?${selectedIds.length} 盲赂?API茂录?{names.join(', ')}`;

        }

    }



    function bindEditorEvents() {

        document.getElementById('wbap-prompt-editor-close')?.addEventListener('click', closePromptEditor);

        document.getElementById('wbap-prompt-editor-cancel')?.addEventListener('click', closePromptEditor);

        document.getElementById('wbap-prompt-editor-save')?.addEventListener('click', savePrompt);



        // 氓聧聽盲陆聧莽卢娄忙聦聣茅聮庐莽聜鹿氓聡禄忙聫聮氓聟?
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



        // 氓颅聴莽卢娄猫庐隆忙聲掳

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



        // 茅垄聞猫搂聢忙聦聣茅聮庐

        document.getElementById('wbap-prompt-preview-btn')?.addEventListener('click', updatePreview);



        // 氓聫聵茅聡聫猫戮聯氓聟楼忙隆聠氓聫聵氓聦聳忙聴露忙聸麓忙聳掳茅垄聞猫搂聢

        ['wbap-edit-var-sulv1', 'wbap-edit-var-sulv2', 'wbap-edit-var-sulv3', 'wbap-edit-var-sulv4'].forEach(id => {

            document.getElementById(id)?.addEventListener('input', updatePreview);

        });



    }



    // 猫庐掳氓驴聠忙篓隆氓聺聴莽聤露忙聙聛氓聢路忙聳掳茂录聢茅娄聳茅隆碌氓聧隆莽聣聡茂录?
    function bindMemorySection() {

        const btn = document.getElementById('wbap-memory-open-btn');

        if (btn) {

            btn.onclick = () => {

                if (WBAP.MemoryModule?.openMemoryModal) {

                    WBAP.MemoryModule.openMemoryModal();

                }

            };

        }

        const memStatus = document.getElementById('wbap-memory-status');

        if (memStatus) {

            const cfg = WBAP.CharacterManager?.getCurrentCharacterConfig?.() || WBAP.config;

            const enabled = cfg?.memoryModule?.enabled === true;

            memStatus.textContent = enabled ? '已启用' : '未启用';

            memStatus.classList.toggle('wbap-badge-success', enabled);

            memStatus.classList.add('wbap-badge');

        }

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

            finalDirectiveCount.textContent = `${finalDirectiveTextarea.value.length} 氓颅聴莽卢娄`;

        }

        if (systemTextarea && systemCount) {

            systemCount.textContent = `${systemTextarea.value.length} 氓颅聴莽卢娄`;

        }

        if (mainTextarea && mainCount) {

            mainCount.textContent = `${mainTextarea.value.length} 氓颅聴莽卢娄`;

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

            .replace(/{worldbook_content}/g, '[盲赂聳莽聲聦盲鹿娄氓聠聟氓庐鹿莽陇潞盲戮?..]')

            .replace(/{context}/g, '[氓炉鹿猫炉聺盲赂聤盲赂聥忙聳聡莽陇潞盲戮?..]')

            .replace(/{user_input}/g, '[莽聰篓忙聢路猫戮聯氓聟楼莽陇潞盲戮聥...]')

            .replace(/{previous_results}/g, '[盲赂聙忙卢隆氓陇聞莽聬聠莽禄聯忙聻聹莽陇潞盲戮?..]')

            .replace(/{role_name}/g, '[猫搂聮猫聣虏莽搂掳氓聫路莽陇潞盲戮聥]')

            .replace(/{role_type}/g, '[猫搂聮猫聣虏莽卤禄氓聻聥莽陇潞盲戮聥]')

            .replace(/{endpoint_name}/g, '[莽芦炉莽聜鹿氓聬聧莽搂掳莽陇潞盲戮聥]')

            .replace(/{model_name}/g, '[忙篓隆氓聻聥氓聬聧莽搂掳莽陇潞盲戮聥]')

            .replace(/{review_round}/g, '[猫陆庐忙卢隆]')

            .replace(/{sulv1}/g, var1 || '[sulv1]')

            .replace(/{sulv2}/g, var2 || '[sulv2]')

            .replace(/{sulv3}/g, var3 || '[sulv3]')

            .replace(/{sulv4}/g, var4 || '[sulv4]');



        let previewFinalDirective = replacePlaceholders(finalDirective);

        let previewSystem = replacePlaceholders(systemPrompt);

        let previewMain = replacePlaceholders(mainPrompt);



        const finalSystemPreview = (previewFinalDirective ? previewFinalDirective + '\n' : '') + previewSystem;



        previewEl.innerHTML = `<strong style="color: var(--wbap-primary);">Final System Prompt (pre-pended):</strong>\n${previewFinalDirective || '(莽漏?'}\n\n<strong style="color: var(--wbap-primary);">System Prompt:</strong>\n${previewSystem || '(莽漏?'}\n\n<strong style="color: var(--wbap-primary);">Main Prompt:</strong>\n${previewMain || '(莽漏?'}`;

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



        const index = parseInt(document.getElementById('wbap-prompt-edit-index').value);

        const name = document.getElementById('wbap-prompt-edit-name').value.trim();

        if (!name) {

            alert('忙篓隆忙聺驴氓聬聧莽搂掳盲赂聧猫聝陆盲赂潞莽漏潞茫聙?');

            return;

        }



        // 猫聨路氓聫聳莽聨掳忙聹聣忙聫聬莽陇潞猫炉聧盲禄楼盲驴聺莽聲聶氓聫聵茅聡聫氓聙?
        const currentConfig = WBAP.CharacterManager.getCurrentCharacterConfig();

        const pools = getGlobalPools();

        const existingPrompts = pools?.prompts?.main || [];

        const existingPrompt = index >= 0 && index < existingPrompts.length ? existingPrompts[index] : null;

        if (index >= 0 && existingPrompt?.name && existingPrompt.name !== name) {

            WBAP.PromptManager.deletePrompt(existingPrompt.name);

            if (currentConfig.promptBindings?.[existingPrompt.name]) {

                currentConfig.promptBindings[name] = currentConfig.promptBindings[existingPrompt.name];

                delete currentConfig.promptBindings[existingPrompt.name];

            }

        }



        // 盲驴聺莽聲聶莽聨掳忙聹聣氓聫聵茅聡聫氓聙录茂录聦忙聢聳盲陆驴莽聰篓莽录聳猫戮聭氓聶篓盲赂颅莽職聞茅禄聵猫庐陇氓聙?
        const existingVariables = existingPrompt?.variables || {};

        const newVariables = {

            sulv1: document.getElementById('wbap-edit-var-sulv1')?.value || existingVariables.sulv1 || '',

            sulv2: document.getElementById('wbap-edit-var-sulv2')?.value || existingVariables.sulv2 || '',

            sulv3: document.getElementById('wbap-edit-var-sulv3')?.value || existingVariables.sulv3 || '',

            sulv4: document.getElementById('wbap-edit-var-sulv4')?.value || existingVariables.sulv4 || '',

        };

        const boundEndpointIds = getPromptBindingSelection();

        setPromptBindingIds(currentConfig, name, boundEndpointIds);



        const newPromptData = {

            name: name,

            version: document.getElementById('wbap-prompt-edit-version').value,

            description: document.getElementById('wbap-prompt-edit-description').value,

            finalSystemDirective: document.getElementById('wbap-prompt-edit-final-directive').value,

            systemPrompt: document.getElementById('wbap-prompt-edit-system').value,

            mainPrompt: document.getElementById('wbap-prompt-edit-main').value,

            variables: newVariables

        };



        WBAP.PromptManager.addOrUpdatePrompt(newPromptData);



        // 忙聸麓忙聳掳茅聙聣盲赂颅茅隆?
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

            alert('忙篓隆忙聺驴氓聬聧莽搂掳盲赂聧猫聝陆盲赂潞莽漏潞茫聙?');

            return;

        }



        const config = WBAP.CharacterManager.getCurrentCharacterConfig();

        const superCfg = ensureSuperConcurrencyConfig(config);

        const pools = getGlobalPools();

        if (!pools.prompts) pools.prompts = {};

        if (!Array.isArray(pools.prompts.cabinet)) pools.prompts.cabinet = [];

        const prompts = pools.prompts.cabinet;



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

        WBAP.saveConfig();

        refreshCabinetPromptList();

        closePromptEditor();

    }



    function deleteCabinetPrompt() {

        const config = WBAP.CharacterManager.getCurrentCharacterConfig();

        const superCfg = ensureSuperConcurrencyConfig(config);

        const pools = getGlobalPools();

        if (!pools.prompts) pools.prompts = {};

        if (!Array.isArray(pools.prompts.cabinet)) pools.prompts.cabinet = [];

        const prompts = pools.prompts.cabinet;

        if (prompts.length <= 1) {

            alert('猫聡鲁氓掳聭盲驴聺莽聲聶盲赂聙盲赂陋氓聠聟茅聵聛忙聫聬莽陇潞猫炉聧茅垄聞猫庐戮茫聙?');

            return;

        }

        const idx = superCfg.selectedPromptIndex || 0;

        const target = prompts[idx];

        if (!confirm(`确定删除预设「${target?.name || "未命名"}」？`)) return;

        prompts.splice(idx, 1);

        superCfg.selectedPromptIndex = Math.max(0, Math.min(idx, prompts.length - 1));

        WBAP.saveConfig();

        refreshCabinetPromptList();

    }



    function exportCabinetPrompt() {

        const config = WBAP.CharacterManager.getCurrentCharacterConfig();

        const superCfg = ensureSuperConcurrencyConfig(config);

        const pools = getGlobalPools();

        if (!pools.prompts) pools.prompts = {};

        if (!Array.isArray(pools.prompts.cabinet)) pools.prompts.cabinet = [];

        const prompts = pools.prompts.cabinet;

        const idx = superCfg.selectedPromptIndex || 0;

        const prompt = prompts[idx];

        if (!prompt) {

            alert('忙虏隆忙聹聣氓聫炉氓炉录氓聡潞莽職聞氓聠聟茅聵聛忙聫聬莽陇潞猫炉聧茫聙?');

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

            throw new Error('忙聫聬莽陇潞猫炉聧氓聠聟氓庐鹿忙聴聽忙聲聢茫聙?');

        }

        const parsed = {

            name: prompt.name || '导入提示词',

            version: prompt.version || '',

            description: prompt.description || '',

            finalSystemDirective: prompt.finalSystemDirective || '',

            systemPrompt: prompt.systemPrompt || '',

            mainPrompt: prompt.mainPrompt || prompt.promptTemplate || ''

        };

        if (!parsed.systemPrompt && !parsed.mainPrompt) {

            throw new Error('忙聫聬莽陇潞猫炉聧氓聠聟氓庐鹿盲赂潞莽漏潞茫聙?');

        }

        parsed.variables = prompt.variables || { sulv1: '', sulv2: '', sulv3: '', sulv4: '' };



        const config = WBAP.CharacterManager.getCurrentCharacterConfig();

        const superCfg = ensureSuperConcurrencyConfig(config);

        const pools = getGlobalPools();

        if (!pools.prompts) pools.prompts = {};

        if (!Array.isArray(pools.prompts.cabinet)) pools.prompts.cabinet = [];

        const prompts = pools.prompts.cabinet;

        prompts.push(parsed);

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

        const pools = getGlobalPools();

        if (!pools.prompts) pools.prompts = {};

        if (!Array.isArray(pools.prompts.tiangang)) pools.prompts.tiangang = [];

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

        const pools = getGlobalPools();

        if (!pools.prompts) pools.prompts = {};

        if (!Array.isArray(pools.prompts.tiangang)) pools.prompts.tiangang = [];

        const prompts = pools.prompts.tiangang;

        if (prompts.length <= 1) {

            alert('\u81f3\u5c11\u4fdd\u7559\u4e00\u4e2a\u5929\u7eb2\u63d0\u793a\u8bcd\u9884\u8bbe\u3002');

            return;

        }

        const idx = tgCfg.selectedPromptIndex || 0;

        const target = prompts[idx];

        if (!confirm(`确定删除预设「${target?.name || "未命名"}」？`)) return;

        prompts.splice(idx, 1);

        tgCfg.selectedPromptIndex = Math.max(0, Math.min(idx, prompts.length - 1));

        WBAP.saveConfig();

        refreshTiagangPromptList();

    }



    function exportTiagangPrompt() {

        const config = WBAP.CharacterManager.getCurrentCharacterConfig();

        const tgCfg = ensureTiagangConfig(config);

        const pools = getGlobalPools();

        if (!pools.prompts) pools.prompts = {};

        if (!Array.isArray(pools.prompts.tiangang)) pools.prompts.tiangang = [];

        const prompts = pools.prompts.tiangang;

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

            name: prompt.name || '导入提示词',

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



        const config = WBAP.CharacterManager.getCurrentCharacterConfig();

        const tgCfg = ensureTiagangConfig(config);

        const pools = getGlobalPools();

        if (!pools.prompts) pools.prompts = {};

        if (!Array.isArray(pools.prompts.tiangang)) pools.prompts.tiangang = [];

        const prompts = pools.prompts.tiangang;

        prompts.push(parsed);

        tgCfg.selectedPromptIndex = prompts.length - 1;

        WBAP.saveConfig();

        refreshTiagangPromptList();

    }



    function exportCurrentPrompt() {

        const currentConfig = WBAP.CharacterManager.getCurrentCharacterConfig();

        const prompts = WBAP.PromptManager.getCombinedPrompts();

        const selectedPromptIndex = currentConfig.selectedPromptIndex ?? 0;

        const prompt = prompts?.[selectedPromptIndex];

        if (!prompt) {

            alert('忙虏隆忙聹聣氓聫炉氓炉录氓聡潞莽職聞忙聫聬莽陇潞猫炉聧茫聙?');

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



    

    function refreshTiagangPromptList() {

        const config = WBAP.CharacterManager ? WBAP.CharacterManager.getCurrentCharacterConfig() : WBAP.config;

        if (!config) return;

        const tgCfg = ensureTiagangConfig(config);

        const pools = getGlobalPools();

        const prompts = pools.prompts?.tiangang || [];

        const selectEl = document.getElementById('wbap-tiagang-prompt-select');

        const descEl = document.getElementById('wbap-tiagang-prompt-description');

        const editBtn = document.getElementById('wbap-tiagang-prompt-edit-btn');

        const exportBtn = document.getElementById('wbap-tiagang-prompt-export-btn');

        const deleteBtn = document.getElementById('wbap-tiagang-prompt-delete-btn');

        if (!selectEl || !descEl) return;



        const hasPrompts = prompts.length > 0;

        selectEl.disabled = !hasPrompts;

        if (editBtn) editBtn.disabled = !hasPrompts;

        if (exportBtn) exportBtn.disabled = !hasPrompts;

        if (deleteBtn) deleteBtn.disabled = !hasPrompts;



        if (!hasPrompts) {

            selectEl.innerHTML = '<option>No presets</option>';

            descEl.textContent = 'No tiangang prompt preset.';

            refreshTiagangPromptVariables();

            return;

        }



        let idx = tgCfg.selectedPromptIndex ?? 0;

        if (idx < 0 || idx >= prompts.length) {

            idx = Math.max(0, prompts.length - 1);

            tgCfg.selectedPromptIndex = idx;

            WBAP.saveConfig();

        }



        selectEl.innerHTML = prompts.map((p, index) => `<option value="${index}">${p.name || `Preset ${index + 1}`}</option>`).join('');

        selectEl.value = idx;

        descEl.textContent = prompts[idx]?.description || '';

        refreshTiagangPromptVariables();

    }



    function refreshTiagangPromptVariables() {

        const container = document.getElementById('wbap-tiagang-variables-container');

        if (!container) return;

        container.innerHTML = '';



        const config = WBAP.CharacterManager ? WBAP.CharacterManager.getCurrentCharacterConfig() : WBAP.config;

        if (!config) return;

        const tgCfg = ensureTiagangConfig(config);

        const pools = getGlobalPools();

        const prompts = pools.prompts?.tiangang || [];

        const prompt = prompts[tgCfg.selectedPromptIndex ?? 0];

        if (!prompt) return;



        const variables = prompt.variables || {};

        const updateVariable = (key, value) => {

            prompt.variables = { ...(prompt.variables || {}), [key]: value };

            WBAP.saveConfig();

        };



        for (let i = 1; i <= 4; i++) {

            const key = `sulv${i}`;

            const value = variables[key] || '';

            const item = document.createElement('div');

            item.className = 'wbap-variable-item';

            item.innerHTML = `<label for="wbap-tiagang-var-${key}">${key}</label><input type="text" id="wbap-tiagang-var-${key}" value="${value}" placeholder="${key}">`;

            const inputEl = item.querySelector('input');

            inputEl.addEventListener('input', (e) => updateVariable(key, e.target.value));

            container.appendChild(item);

        }

    }



    function renderTiagangWorldbookList(tgCfg) {

        const tagContainer = document.getElementById('wbap-tiagang-selected-worldbooks');

        const listContainer = document.getElementById('wbap-tiagang-book-list-container');

        if (!tagContainer || !listContainer) return;



        const names = Array.isArray(tgCfg.worldBooks) ? tgCfg.worldBooks : [];

        if (names.length === 0) {

            tagContainer.innerHTML = '<small class="wbap-text-muted">No worldbooks selected.</small>';

            listContainer.innerHTML = '<p class="wbap-text-muted" style="padding: 8px; text-align: center; font-size: 12px;">Add a worldbook first.</p>';

            tiagangActiveWorldbook = null;

            renderTiagangEntryList(null);

            return;

        }



        tagContainer.innerHTML = names.map(name => `

            <span class="wbap-tag" style="background: var(--wbap-bg-secondary, #2a2a3a); padding: 4px 8px; border-radius: 12px; display: inline-flex; align-items: center; gap: 6px;">

                <span>${name}</span>

                <button type="button" data-remove-book="${name}" class="wbap-btn wbap-btn-xs wbap-btn-icon" style="padding: 0 6px;">&times;</button>

            </span>

        `).join('');



        listContainer.innerHTML = '';

        names.forEach(name => {

            const item = document.createElement('div');

            item.className = 'wbap-book-item';

            if (name === tiagangActiveWorldbook) item.classList.add('active');

            item.dataset.bookName = name;

            item.textContent = name;

            listContainer.appendChild(item);

        });



        if (!tiagangActiveWorldbook || !names.includes(tiagangActiveWorldbook)) {

            tiagangActiveWorldbook = names[0] || null;

        }

        if (tiagangActiveWorldbook) {

            renderTiagangEntryList(tiagangActiveWorldbook);

        }

    }



    async function renderTiagangEntryList(bookName) {

        const entryList = document.getElementById('wbap-tiagang-entry-list');

        if (!entryList) return;



        if (!bookName) {

            entryList.innerHTML = '<p class="wbap-text-muted" style="text-align: center; font-size: 12px;">Select a worldbook on the left.</p>';

            return;

        }



        entryList.innerHTML = '<p class="wbap-text-muted" style="text-align: center;"><i class="fa-solid fa-spinner fa-spin"></i> Loading...</p>';



        let book = tiagangWorldbookCache.get(bookName);

        if (!book) {

            book = await WBAP.loadWorldBookEntriesByName?.(bookName);

            if (book) tiagangWorldbookCache.set(bookName, book);

        }

        if (!book || !book.entries) {

            entryList.innerHTML = `<p style="color: var(--wbap-danger); text-align: center;">Failed to load worldbook: ${bookName}</p>`;

            return;

        }



        const config = WBAP.CharacterManager.getCurrentCharacterConfig();

        const tgCfg = ensureTiagangConfig(config);

        const selected = new Set(tgCfg.assignedEntriesMap?.[bookName] || []);

        const entries = Object.entries(book.entries).filter(([, entry]) => entry && entry.disable !== true);

        if (entries.length === 0) {

            entryList.innerHTML = '<p class="wbap-text-muted" style="text-align: center; font-size: 12px;">No enabled entries.</p>';

            return;

        }



        if (uiIsTableWorldBook(book)) {

            const selectedColumns = new Set();

            selected.forEach(id => {

                const entry = book.entries?.[id];

                if (entry) selectedColumns.add(uiNormalizeColumnName(entry.comment, id));

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



        const items = entries.map(([uid, entry]) => {

            const title = entry.comment || `Entry ${uid.substring(0, 6)}`;

            const checked = selected.has(uid) ? 'checked' : '';

            return `<label class="wbap-entry-item"><input type="checkbox" data-book="${bookName}" value="${uid}" ${checked}> ${title}</label>`;

        }).join('');

        entryList.innerHTML = items;

    }



    function addTiagangWorldbook(bookName) {

        if (!bookName) return;

        const config = WBAP.CharacterManager.getCurrentCharacterConfig();

        const tgCfg = ensureTiagangConfig(config);

        if (!tgCfg.worldBooks.includes(bookName)) {

            tgCfg.worldBooks.push(bookName);

        }

        if (!tgCfg.assignedEntriesMap[bookName]) tgCfg.assignedEntriesMap[bookName] = [];

        tiagangActiveWorldbook = bookName;

        WBAP.saveConfig();

        renderTiagangWorldbookList(tgCfg);

    }



    function removeTiagangWorldbook(bookName) {

        const config = WBAP.CharacterManager.getCurrentCharacterConfig();

        const tgCfg = ensureTiagangConfig(config);

        tgCfg.worldBooks = (tgCfg.worldBooks || []).filter(name => name !== bookName);

        if (tgCfg.assignedEntriesMap) delete tgCfg.assignedEntriesMap[bookName];

        if (!tgCfg.worldBooks.includes(tiagangActiveWorldbook)) {

            tiagangActiveWorldbook = tgCfg.worldBooks[0] || null;

        }

        WBAP.saveConfig();

        renderTiagangWorldbookList(tgCfg);

    }



    function setTiagangEntrySelection(selectAll) {

        const entryList = document.getElementById('wbap-tiagang-entry-list');

        if (!entryList || !tiagangActiveWorldbook) return;

        const checkboxes = entryList.querySelectorAll('input[type="checkbox"]');

        const ids = [];

        checkboxes.forEach(cb => {

            cb.checked = selectAll;

            if (selectAll) ids.push(cb.value);

        });

        const config = WBAP.CharacterManager.getCurrentCharacterConfig();

        const tgCfg = ensureTiagangConfig(config);

        tgCfg.assignedEntriesMap[tiagangActiveWorldbook] = selectAll ? ids : [];

        WBAP.saveConfig();

    }



    function loadTiagangSettingsToUI() {

        const config = WBAP.CharacterManager ? WBAP.CharacterManager.getCurrentCharacterConfig() : WBAP.config;

        if (!config) return;

        const tgCfg = ensureTiagangConfig(config);

        const pools = getGlobalPools();

        if (!pools.tiangang) pools.tiangang = {};

        if (!pools.tiangang.apiConfig) pools.tiangang.apiConfig = {};

        const apiCfg = pools.tiangang.apiConfig;



        const enabledEl = document.getElementById('wbap-tiagang-enabled');

        if (enabledEl) enabledEl.checked = tgCfg.enabled === true;



        refreshTiagangPromptList();



        const worldbookSelect = document.getElementById('wbap-tiagang-worldbook-select');

        if (worldbookSelect) {

            worldbookSelect.innerHTML = '<option value="">-- Select --</option>';

            WBAP.getAllWorldBookNames?.().then(names => {

                (names || []).forEach(name => {

                    const opt = document.createElement('option');

                    opt.value = name;

                    opt.textContent = name;

                    worldbookSelect.appendChild(opt);

                });

            });

        }



        const roundsEl = document.getElementById('wbap-tiagang-context-rounds');

        const roundsValueEl = document.getElementById('wbap-tiagang-context-rounds-value');

        if (roundsEl) {

            roundsEl.value = tgCfg.contextRounds ?? 5;

            if (roundsValueEl) roundsValueEl.textContent = roundsEl.value;

        }



        const apiUrlEl = document.getElementById('wbap-tiagang-api-url');

        if (apiUrlEl) apiUrlEl.value = apiCfg.apiUrl || '';

        const apiKeyEl = document.getElementById('wbap-tiagang-api-key');

        if (apiKeyEl) apiKeyEl.value = apiCfg.apiKey || '';

        const maxTokensEl = document.getElementById('wbap-tiagang-max-tokens');

        if (maxTokensEl) maxTokensEl.value = apiCfg.maxTokens || 2000;

        const tempEl = document.getElementById('wbap-tiagang-temperature');

        if (tempEl) tempEl.value = apiCfg.temperature ?? 0.7;

        const timeoutEl = document.getElementById('wbap-tiagang-timeout');

        if (timeoutEl) timeoutEl.value = apiCfg.timeout ?? 60;

        const retriesEl = document.getElementById('wbap-tiagang-max-retries');

        if (retriesEl) retriesEl.value = Number.isFinite(apiCfg.maxRetries) ? apiCfg.maxRetries : 2;

        const retryDelayEl = document.getElementById('wbap-tiagang-retry-delay');

        if (retryDelayEl) retryDelayEl.value = Number.isFinite(apiCfg.retryDelayMs) ? apiCfg.retryDelayMs : 800;

        const streamingEl = document.getElementById('wbap-tiagang-streaming');

        if (streamingEl) streamingEl.checked = apiCfg.enableStreaming !== false;

        populateTiagangModelSelect([], apiCfg.model || '');



        renderTiagangWorldbookList(tgCfg);

    }



    function saveTiagangSettings() {

        const config = WBAP.CharacterManager.getCurrentCharacterConfig();

        const tgCfg = ensureTiagangConfig(config);

        tgCfg.enabled = document.getElementById('wbap-tiagang-enabled')?.checked === true;

        const roundsVal = parseInt(document.getElementById('wbap-tiagang-context-rounds')?.value, 10);

        tgCfg.contextRounds = Number.isFinite(roundsVal) ? roundsVal : (config.contextRounds ?? 5);

        const promptSelect = document.getElementById('wbap-tiagang-prompt-select');

        if (promptSelect) tgCfg.selectedPromptIndex = parseInt(promptSelect.value, 10) || 0;



        const pools = getGlobalPools();

        if (!pools.tiangang) pools.tiangang = {};

        if (!pools.tiangang.apiConfig) pools.tiangang.apiConfig = {};

        const apiCfg = pools.tiangang.apiConfig;

        apiCfg.apiUrl = document.getElementById('wbap-tiagang-api-url')?.value || '';

        apiCfg.apiKey = document.getElementById('wbap-tiagang-api-key')?.value || '';

        apiCfg.model = document.getElementById('wbap-tiagang-model')?.value || '';

        apiCfg.maxTokens = parseInt(document.getElementById('wbap-tiagang-max-tokens')?.value, 10) || 2000;

        const tempVal = parseFloat(document.getElementById('wbap-tiagang-temperature')?.value);

        apiCfg.temperature = Number.isFinite(tempVal) ? tempVal : 0.7;

        const timeoutVal = parseInt(document.getElementById('wbap-tiagang-timeout')?.value, 10);

        apiCfg.timeout = Number.isFinite(timeoutVal) && timeoutVal > 0 ? timeoutVal : 60;

        const retriesVal = parseInt(document.getElementById('wbap-tiagang-max-retries')?.value, 10);

        apiCfg.maxRetries = Number.isFinite(retriesVal) && retriesVal >= 0 ? retriesVal : 2;

        const retryDelayVal = parseInt(document.getElementById('wbap-tiagang-retry-delay')?.value, 10);

        apiCfg.retryDelayMs = Number.isFinite(retryDelayVal) && retryDelayVal > 0 ? retryDelayVal : 800;

        apiCfg.enableStreaming = document.getElementById('wbap-tiagang-streaming')?.checked !== false;



        WBAP.saveConfig();

    }



    function bindTiagangEvents() {

        const panel = document.getElementById('wbap-tiagang-settings');

        if (!panel || panel.dataset.bound === '1') return;

        panel.dataset.bound = '1';



        document.getElementById('wbap-tiagang-close')?.addEventListener('click', () => {

            if (tiagangElement) tiagangElement.classList.remove('open');

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

                        Logger.error('Import tiagang prompt failed', err);

                        alert('Import failed: ' + (err.message || err));

                    } finally {

                        fileInput.value = '';

                    }

                }

            });

        }



        document.getElementById('wbap-tiagang-save-variables-btn')?.addEventListener('click', (e) => {

            WBAP.saveConfig();

            const btn = e.currentTarget;

            btn.textContent = 'Applied';

            setTimeout(() => {

                btn.textContent = 'Apply variables';

            }, 1500);

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

        });



        document.getElementById('wbap-tiagang-entries-select-all')?.addEventListener('click', () => setTiagangEntrySelection(true));

        document.getElementById('wbap-tiagang-entries-clear')?.addEventListener('click', () => setTiagangEntrySelection(false));



        document.getElementById('wbap-tiagang-entry-list')?.addEventListener('change', (e) => {

            if (e.target.type !== 'checkbox') return;

            const bookName = e.target.dataset.book;

            if (!bookName) return;

            const config = WBAP.CharacterManager.getCurrentCharacterConfig();

            const tgCfg = ensureTiagangConfig(config);

            if (!tgCfg.assignedEntriesMap[bookName]) tgCfg.assignedEntriesMap[bookName] = [];

            const selected = new Set(tgCfg.assignedEntriesMap[bookName]);

            if (e.target.checked) {

                selected.add(e.target.value);

            } else {

                selected.delete(e.target.value);

            }

            tgCfg.assignedEntriesMap[bookName] = Array.from(selected);

            WBAP.saveConfig();

        });



        document.getElementById('wbap-tiagang-context-rounds')?.addEventListener('input', (e) => {

            const valueEl = document.getElementById('wbap-tiagang-context-rounds-value');

            if (valueEl) valueEl.textContent = e.target.value;

        });



        document.getElementById('wbap-tiagang-fetch-models')?.addEventListener('click', async (e) => {

            const btn = e.currentTarget;

            btn.disabled = true;

            btn.textContent = 'Loading...';

            const apiUrl = document.getElementById('wbap-tiagang-api-url')?.value || '';

            const apiKey = document.getElementById('wbap-tiagang-api-key')?.value || '';

            const currentModel = document.getElementById('wbap-tiagang-model')?.value || '';

            try {

                const result = await WBAP.fetchEndpointModels({ apiUrl, apiKey });

                if (result.success) {

                    populateTiagangModelSelect(result.models, currentModel);

                } else {

                    throw new Error(result.message || 'Fetch models failed');

                }

            } catch (err) {

                Logger.warn('Fetch tiangang models failed', err);

                alert('Fetch models failed: ' + (err.message || err));

            } finally {

                btn.disabled = false;

                btn.textContent = 'Fetch Models';

            }

        });



        document.getElementById('wbap-tiagang-save')?.addEventListener('click', () => saveTiagangSettings());

    }



// ========== Progress Panel Control ==========

    let progressTimer = null;

    let progressStartTime = 0;

    let progressTasks = new Map(); // 氓颅聵氓聜篓忙聣聙忙聹聣盲禄禄氓聤?{ id: { name, status, progress, startTime, timerInterval, completed } }

    let totalTaskCount = 0; // 忙聙禄盲禄禄氓聤隆忙聲掳

    let cancelAllCallback = null; // 氓聫聳忙露聢氓聟篓茅聝篓盲禄禄氓聤隆莽職聞氓聸聻猫掳?
    let cancelTaskCallbacks = new Map(); // 氓聧聲盲赂陋盲禄禄氓聤隆氓聫聳忙露聢氓聸聻猫掳聝 { taskId: callback }



    function setCancelAllCallback(callback) {

        cancelAllCallback = callback;

    }



    function setCancelTaskCallback(taskId, callback) {

        if (callback) {

            cancelTaskCallbacks.set(taskId, callback);

        } else {

            cancelTaskCallbacks.delete(taskId);

        }

    }



    function triggerCancelAll() {

        if (cancelAllCallback && typeof cancelAllCallback === 'function') {

            cancelAllCallback();

            // 忙聸麓忙聳掳 UI 莽聤露忙聙?
            const statusEl = document.getElementById('wbap-progress-status');

            if (statusEl) statusEl.textContent = '忙颅拢氓聹篓氓聫聳忙露聢...';

        }

    }



    function triggerCancelTask(taskId) {

        const callback = cancelTaskCallbacks.get(taskId);

        if (callback && typeof callback === 'function') {

            callback(taskId);

            // 忙聸麓忙聳掳盲禄禄氓聤隆 UI

            updateProgressTask(taskId, '氓聫聳忙露聢盲赂?..', progressTasks.get(taskId)?.progress || 0);

        }

    }



    function showProgressPanel(message = '忙颅拢氓聹篓氓陇聞莽聬聠...', taskCount = 0) {

        const panel = document.getElementById('wbap-progress-panel');

        if (!panel) return;

        bindProgressPanelEvents();



        // 茅聡聧莽陆庐莽聤露忙聙?
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

            barEl.classList.remove('completed'); // 茅聡聧莽陆庐氓庐聦忙聢聬莽聤露忙聙?
        }

        if (statusEl) statusEl.textContent = '氓聡聠氓陇聡盲赂?..';

        if (percentEl) percentEl.textContent = '0%';

        if (timerEl) timerEl.textContent = '0.000s';

        if (tasksEl) tasksEl.innerHTML = '';

        if (taskCountEl) taskCountEl.textContent = `0/${taskCount}`;



        // 忙赂聟莽漏潞盲禄禄氓聤隆氓聢聴猫隆篓氓聮聦氓聸聻猫掳?
        progressTasks.forEach(task => {

            if (task.timerInterval) clearInterval(task.timerInterval);

        });

        progressTasks.clear();

        cancelTaskCallbacks.clear();

        totalTaskCount = taskCount;



        panel.classList.add('open');



        // 氓聬炉氓聤篓盲赂禄猫庐隆忙聴露氓聶篓茂录聢忙炉芦莽搂聮莽虏戮氓潞娄茂录聦~60fps茂录?
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



        // 猫聡陋氓聤篓忙聸麓忙聳掳忙聙禄猫驴聸氓潞娄忙聺隆

        if (totalTaskCount > 0) {

            const overallPercent = (completedCount / totalTaskCount) * 100;

            updateProgressPanel(overallPercent, completedCount >= totalTaskCount ? '氓聟篓茅聝篓氓庐聦忙聢聬' : `氓路虏氓庐聦忙聢?${completedCount}/${totalTaskCount}`);

        }

    }



    function addProgressTask(taskId, taskName, initialStatus = '莽颅聣氓戮聟盲赂?..') {

        const tasksEl = document.getElementById('wbap-progress-tasks');

        if (!tasksEl) return;



        // 氓聢聸氓禄潞盲禄禄氓聤隆氓聧隆莽聣聡

        const taskCard = document.createElement('div');

        taskCard.className = 'wbap-progress-task-card';

        taskCard.id = `wbap-task-${taskId}`;

        taskCard.innerHTML = `

            <div class="wbap-task-header">

                <span class="wbap-task-name" title="${taskName}">${taskName}</span>

                <div class="wbap-task-actions">

                    <button class="wbap-task-cancel-btn" id="wbap-task-cancel-${taskId}" title="氓聫聳忙露聢忙颅陇盲禄禄氓聤?>

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



        // 莽禄聭氓庐職氓聧聲盲赂陋盲禄禄氓聤隆氓聫聳忙露聢忙聦聣茅聮庐

        const cancelBtn = document.getElementById(`wbap-task-cancel-${taskId}`);

        if (cancelBtn) {

            cancelBtn.addEventListener('click', (e) => {

                e.stopPropagation();

                triggerCancelTask(taskId);

            });

        }



        // 氓聬炉氓聤篓盲禄禄氓聤隆猫庐隆忙聴露氓聶篓茂录聢忙炉芦莽搂聮莽虏戮氓潞娄茂录?
        const taskStartTime = Date.now();

        const timerInterval = setInterval(() => {

            const timerEl = document.getElementById(`wbap-task-timer-${taskId}`);

            if (timerEl) {

                const elapsed = Date.now() - taskStartTime;

                timerEl.textContent = `${(elapsed / 1000).toFixed(3)}s`;

            }

        }, 16);



        // 氓颅聵氓聜篓盲禄禄氓聤隆盲驴隆忙聛炉

        progressTasks.set(taskId, {

            name: taskName,

            status: initialStatus,

            progress: 0,

            startTime: taskStartTime,

            timerInterval: timerInterval,

            completed: false

        });



        // 忙聸麓忙聳掳盲禄禄氓聤隆猫庐隆忙聲掳

        updateTaskCount();



        // 忙禄職氓聤篓氓聢掳忙聹聙忙聳掳盲禄禄氓聤?
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



        // 盲禄禄氓聤隆氓庐聦忙聢聬氓陇聞莽聬聠

        if (cardEl && progress >= 100 && !task.completed) {

            cardEl.classList.add('completed');

            task.completed = true;

            // 氓聛聹忙颅垄猫炉楼盲禄禄氓聤隆莽職聞猫庐隆忙聴露氓聶?
            if (task.timerInterval) {

                clearInterval(task.timerInterval);

                task.timerInterval = null;

            }

            // 茅職聬猫聴聫氓聫聳忙露聢忙聦聣茅聮庐

            const cancelBtn = document.getElementById(`wbap-task-cancel-${taskId}`);

            if (cancelBtn) cancelBtn.style.display = 'none';

            // 忙赂聟莽聬聠氓聫聳忙露聢氓聸聻猫掳聝

            cancelTaskCallbacks.delete(taskId);

            // 忙聸麓忙聳掳盲禄禄氓聤隆猫庐隆忙聲掳

            updateTaskCount();

        }



        // 忙聸麓忙聳掳盲禄禄氓聤隆莽聤露忙聙?
        task.status = status || task.status;

        task.progress = progress;

    }



    function removeProgressTask(taskId) {

        const task = progressTasks.get(taskId);

        if (task && task.timerInterval) {

            clearInterval(task.timerInterval);

        }

        progressTasks.delete(taskId);

        cancelTaskCallbacks.delete(taskId); // 忙赂聟莽聬聠氓聫聳忙露聢氓聸聻猫掳聝



        const cardEl = document.getElementById(`wbap-task-${taskId}`);

        if (cardEl) {

            cardEl.classList.add('removing');

            setTimeout(() => cardEl.remove(), 300);

        }



        // 忙聸麓忙聳掳盲禄禄氓聤隆猫庐隆忙聲掳

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

        // 忙赂聟莽聬聠忙聣聙忙聹聣盲禄禄氓聤隆猫庐隆忙聴露氓聶篓

        progressTasks.forEach(task => {

            if (task.timerInterval) clearInterval(task.timerInterval);

        });

        progressTasks.clear();

        cancelTaskCallbacks.clear();

        cancelAllCallback = null;

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



    function makeElementResizable(element, handle) {

        if (!handle) return;

        const margin = 8;

        const minWidth = 280;

        const minHeight = 220;

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

            const maxWidth = Math.max(minWidth, window.innerWidth - startLeft - margin);

            const maxHeight = Math.max(minHeight, window.innerHeight - startTop - margin);

            const nextWidth = Math.min(maxWidth, Math.max(minWidth, startWidth + dx));

            const nextHeight = Math.min(maxHeight, Math.max(minHeight, startHeight + dy));



            pending = { width: nextWidth, height: nextHeight };

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

        showProgressPanel,

        updateProgressPanel,

        hideProgressPanel,

        addProgressTask,

        updateProgressTask,

        removeProgressTask,

        setCancelAllCallback,

        setCancelTaskCallback,

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

        const pools = getGlobalPools();

        if (!pools.prompts) pools.prompts = {};

        if (!Array.isArray(pools.prompts.cabinet)) pools.prompts.cabinet = [];

        const prompts = pools.prompts.cabinet;

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

            editorModal.querySelector('h3').textContent = '忙聳掳氓禄潞氓聠聟茅聵聛忙聫聬莽陇潞猫炉?';

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

            editorModal.querySelector('h3').textContent = '莽录聳猫戮聭氓聠聟茅聵聛忙聫聬莽陇潞猫炉?';

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

        const pools = getGlobalPools();

        if (!pools.prompts) pools.prompts = {};

        if (!Array.isArray(pools.prompts.tiangang)) pools.prompts.tiangang = [];

        const prompts = pools.prompts.tiangang;

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

            // 忙聳掳氓禄潞忙篓隆氓录聫

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

            editorModal.querySelector('h3').textContent = '忙聳掳氓禄潞忙聫聬莽陇潞猫炉聧忙篓隆忙聺?';

        } else {

            // 莽录聳猫戮聭忙篓隆氓录聫

            const currentConfig = WBAP.CharacterManager.getCurrentCharacterConfig();

            const combined = WBAP.PromptManager.getCombinedPrompts();

            const selectedPrompt = combined?.[index];

            if (!selectedPrompt) return;

            const pools = getGlobalPools();

            const userPrompts = pools?.prompts?.main || [];

            const userIndex = userPrompts.findIndex(p => p.name === selectedPrompt.name);

            const prompt = userIndex >= 0 ? userPrompts[userIndex] : selectedPrompt;

            // 盲陆驴莽聰篓莽聰篓忙聢路忙聫聬莽陇潞猫炉聧莽麓垄氓录聲茂录聢猫聥楼盲赂聧氓颅聵氓聹篓氓聢聶盲陆聹盲赂潞忙聳掳氓禄潞盲驴聺氓颅聵氓聸聻莽聰篓忙聢路氓聢聴猫隆篓茂录?
            document.getElementById('wbap-prompt-edit-index').value = userIndex;

            if (!prompt) return;

            document.getElementById('wbap-prompt-edit-name').value = prompt.name || '';

            document.getElementById('wbap-prompt-edit-version').value = prompt.version || '';

            document.getElementById('wbap-prompt-edit-description').value = prompt.description || '';

            document.getElementById('wbap-prompt-edit-final-directive').value = prompt.finalSystemDirective || '';

            document.getElementById('wbap-prompt-edit-system').value = prompt.systemPrompt || '';

            document.getElementById('wbap-prompt-edit-main').value = prompt.mainPrompt || '';



            // 氓聤聽猫陆陆氓聫聵茅聡聫氓聙录茂录聢氓娄聜忙聻聹忙聹聣茂录聣

            const vars = prompt.variables || {};

            document.getElementById('wbap-edit-var-sulv1').value = vars.sulv1 || '';

            document.getElementById('wbap-edit-var-sulv2').value = vars.sulv2 || '';

            document.getElementById('wbap-edit-var-sulv3').value = vars.sulv3 || '';

            document.getElementById('wbap-edit-var-sulv4').value = vars.sulv4 || '';

            boundIds = getPromptBindingIds(currentConfig, prompt.name);



            editorModal.querySelector('h3').textContent = '莽录聳猫戮聭忙聫聬莽陇潞猫炉聧忙篓隆忙聺?';

        }



        renderPromptBindingList(boundIds);



        // 忙聸麓忙聳掳氓颅聴莽卢娄猫庐隆忙聲掳氓聮聦茅垄聞猫搂?
        updateCharCounts();

        updatePreview();



        editorModal.classList.add('open');

        syncMobileRootFix();



        // 猫聛職莽聞娄氓聢掳氓聬聧莽搂掳猫戮聯氓聟楼忙隆聠

        setTimeout(() => {

            document.getElementById('wbap-prompt-edit-name')?.focus();

        }, 100);

    };

    window.wbapDeletePrompt = (index) => {

        const prompts = WBAP.PromptManager.getCombinedPrompts();

        const promptToDelete = prompts[index];

        if (!promptToDelete) return;



        if (!confirm(`确定删除预设「${target?.name || "未命名"}」？`)) return;

            WBAP.PromptManager.deletePrompt(promptToDelete.name);

            const charConfigs = WBAP.mainConfig?.characterConfigs || {};

            Object.values(charConfigs).forEach(cfg => {

                if (cfg.promptBindings && cfg.promptBindings[promptToDelete.name]) {

                    delete cfg.promptBindings[promptToDelete.name];

                }

            });

            // After deleting, the selected index might be out of bounds.

            const currentConfig = WBAP.CharacterManager ? WBAP.CharacterManager.getCurrentCharacterConfig() : WBAP.config;

            const newPrompts = WBAP.PromptManager.getCombinedPrompts();

            if (currentConfig.selectedPromptIndex >= newPrompts.length) {

                currentConfig.selectedPromptIndex = Math.max(0, newPrompts.length - 1);

                // 氓聬聦忙颅楼忙聸麓忙聳掳氓聟篓氓卤聙 config

                if (WBAP.config !== currentConfig) {

                    WBAP.config.selectedPromptIndex = currentConfig.selectedPromptIndex;

                }

                WBAP.saveConfig();

            }

            refreshPromptList();

        }

    };



    window.wbapDeleteEndpoint = (id) => {

        const pools = getGlobalPools();

        const endpoints = pools.selectiveMode?.apiEndpoints || [];

        const index = endpoints.findIndex(ep => ep.id === id);

        if (index > -1 && confirm('???????API????')) {

            endpoints.splice(index, 1);

            const charConfigs = WBAP.mainConfig?.characterConfigs || {};

            Object.values(charConfigs).forEach(cfg => {

                if (cfg.selectiveMode?.endpointBindings) {

                    delete cfg.selectiveMode.endpointBindings[id];

                }

                if (cfg.promptBindings) {

                    Object.keys(cfg.promptBindings).forEach(key => {

                        const list = cfg.promptBindings[key];

                        if (Array.isArray(list)) {

                            cfg.promptBindings[key] = list.filter(epId => epId !== id);

                        }

                    });

                }

                if (cfg.secondaryPrompt?.boundEndpointIds) {

                    cfg.secondaryPrompt.boundEndpointIds = cfg.secondaryPrompt.boundEndpointIds.filter(epId => epId !== id);

                }

                if (cfg.optimizationApiConfig?.selectedEndpointId === id) {

                    cfg.optimizationApiConfig.selectedEndpointId = null;

                }

                if (cfg.aggregatorMode?.endpointId === id) {

                    cfg.aggregatorMode.endpointId = '';

                }

            });

            WBAP.saveConfig();

            renderApiEndpoints();

            refreshPromptList();

            refreshSecondaryPromptUI();

        }

    };



    // ========== API 氓庐聻盲戮聥莽录聳猫戮聭猫戮聟氓聤漏 ==========

    let currentEditingEndpoint = null;

    let currentEditingBinding = null;



    function normalizeEndpointStructure(endpoint) {

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

        if (endpoint.apiUrl == null && endpoint.url) endpoint.apiUrl = endpoint.url;

        if (endpoint.apiKey == null && endpoint.key) endpoint.apiKey = endpoint.key;

        delete endpoint.url;

        delete endpoint.key;

        delete endpoint.worldBook;

        delete endpoint.worldBooks;

        delete endpoint.assignedEntries;

        delete endpoint.assignedEntriesMap;

    }



    function renderSelectedWorldbooks(binding) {

        const container = document.getElementById('wbap-endpoint-selected-worldbooks');

        if (!container) return;

        const books = Array.isArray(binding?.worldBooks) ? binding.worldBooks : [];

        if (books.length === 0) {

            container.innerHTML = '<small class="wbap-text-muted">???????</small>';

            return;

        }

        container.innerHTML = books.map(name => `

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
        const fallback = '未命名栏位';
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

    async function displayEntriesForBook(bookName, binding) {

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



        entryList.innerHTML = '<p class="wbap-text-muted" style="text-align: center;"><i class="fa-solid fa-spinner fa-spin"></i> ??????...</p>';



        const book = await WBAP.loadWorldBookEntriesByName(bookName);

        if (!book || !book.entries) {

            entryList.innerHTML = `<p style="color: var(--wbap-danger); text-align: center;">????? ${bookName} ??</p>`;

            return;

        }



        const selected = new Set(binding.assignedEntriesMap?.[bookName] || []);

        const entries = Object.entries(book.entries).filter(([uid, entry]) => entry.disable !== true);



        if (entries.length === 0) {

            entryList.innerHTML = '<p class="wbap-text-muted" style="text-align: center; font-size: 12px;">???????????</p>';

            return;

        }



        // Table-style worldbook: show one checkbox per column (????)

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

            const title = entry.comment || `?? ${uid.substring(0, 6)}`;

            const checked = selected.has(uid) ? 'checked' : '';

            return `<label class="wbap-entry-item"><input type="checkbox" data-book="${bookName}" value="${uid}" ${checked}> ${title}</label>`;

        }).join('');



        entryList.innerHTML = items;

    }



    // New function to render the list of worldbooks

    function renderWorldBookList(binding) {

        const bookListContainer = document.getElementById('wbap-endpoint-book-list-container');

        const entryListContainer = document.getElementById('wbap-endpoint-edit-entry-list');



        if (!bookListContainer || !entryListContainer) return;



        bookListContainer.innerHTML = ''; // Clear previous list

        entryListContainer.innerHTML = '<p class="wbap-text-muted" style="text-align: center; font-size: 12px;">???????????</p>'; // Reset entry list



        if (!binding.worldBooks || binding.worldBooks.length === 0) {

            bookListContainer.innerHTML = '<p class="wbap-text-muted" style="padding: 8px; text-align: center; font-size: 12px;">???????</p>';

            return;

        }



        binding.worldBooks.forEach(bookName => {

            const bookItem = document.createElement('div');

            bookItem.className = 'wbap-book-item';

            bookItem.textContent = bookName;

            bookItem.dataset.bookName = bookName;

            bookItem.addEventListener('click', () => displayEntriesForBook(bookName, binding));

            bookListContainer.appendChild(bookItem);

        });



        // Automatically select the first book

        if (binding.worldBooks.length > 0) {

            displayEntriesForBook(binding.worldBooks[0], binding);

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

            resultEl.textContent = '忙碌聥猫炉聲盲赂?..';

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

                resultEl.textContent = `氓陇卤猫麓楼: ${result.message}`;

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

                alert(`猫聨路氓聫聳忙篓隆氓聻聥氓陇卤猫麓楼: ${result.message}`);

            }



            btn.innerHTML = '猫聨路氓聫聳忙篓隆氓聻聥';

            btn.disabled = false;

        });



        document.getElementById('wbap-endpoint-entries-select-all')?.addEventListener('click', () => {

            const checkboxes = document.querySelectorAll('#wbap-endpoint-edit-entry-list input[type="checkbox"]');

            if (checkboxes.length === 0 || !currentEditingBinding) return;



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

                // Add all new IDs to the set (handling potential duplicates if any, though map replace is safer)

                // Since we selected ALL visible entries for this book, and this list usually represents the *entire* list for this book,

                // we can just set the map to these IDs? 

                // Wait, renderWorldBookList filters entries? 

                // Step 346 shows it might filter by columns ("best version of each entry").

                // So we should probably merge with existing if the list is partial, or replace if it's full.

                // But checking line 1562 in Step 346, it iterates `columnBest.entries()`. It seems to show all unique UIDs for the book.

                // So replacing the list for this book with these IDs is correct.

                // BUT, to be safe against partial rendering (if any), let's use a Set merge.



                const currentIds = new Set(currentEditingBinding.assignedEntriesMap[bookName]);

                newIds.forEach(id => currentIds.add(id));

                currentEditingBinding.assignedEntriesMap[bookName] = Array.from(currentIds);

                Logger.log(`氓聟篓茅聙聣氓路虏氓潞聰莽聰篓: 盲赂聳莽聲聦盲鹿?${bookName}, 忙聙禄猫庐隆=${currentEditingBinding.assignedEntriesMap[bookName].length}忙聺隆`);

            }

        });



        document.getElementById('wbap-endpoint-entries-clear')?.addEventListener('click', () => {

            const checkboxes = document.querySelectorAll('#wbap-endpoint-edit-entry-list input[type="checkbox"]');

            if (checkboxes.length === 0 || !currentEditingBinding) return;



            const bookName = checkboxes[0].dataset.book;

            const idsToRemove = new Set();

            checkboxes.forEach(cb => {

                cb.checked = false;

                idsToRemove.add(cb.value);

            });



            if (bookName && currentEditingBinding.assignedEntriesMap[bookName]) {

                currentEditingBinding.assignedEntriesMap[bookName] = currentEditingBinding.assignedEntriesMap[bookName].filter(id => !idsToRemove.has(id));

                Logger.log(`忙赂聟莽漏潞氓路虏氓潞聰莽聰? 盲赂聳莽聲聦盲鹿?${bookName}, 氓聣漏盲陆聶=${currentEditingBinding.assignedEntriesMap[bookName].length}忙聺隆`);

            }

        });



        // Temperature slider

        document.getElementById('wbap-endpoint-edit-temperature').addEventListener('input', (e) => {

            const valueEl = document.getElementById('wbap-endpoint-edit-temperature-value');

            if (valueEl) valueEl.textContent = e.target.value;

        });



        document.getElementById('wbap-endpoint-add-worldbook').addEventListener('click', () => {

            const select = document.getElementById('wbap-endpoint-edit-worldbook-select');

            if (!select || !currentEditingBinding) return;

            const bookName = select.value;

            if (!bookName) {

                alert('猫炉路氓聟聢茅聙聣忙聥漏盲赂聙盲赂陋盲赂聳莽聲聦盲鹿娄');

                return;

            }

            if (!currentEditingBinding.worldBooks.includes(bookName)) {

                currentEditingBinding.worldBooks.push(bookName);

            }

            if (!currentEditingBinding.assignedEntriesMap[bookName]) {

                currentEditingBinding.assignedEntriesMap[bookName] = [];

            }

            renderSelectedWorldbooks(currentEditingBinding);

            renderWorldBookList(currentEditingBinding);

        });



        document.getElementById('wbap-endpoint-selected-worldbooks').addEventListener('click', (e) => {

            const btn = e.target.closest('[data-remove-book]');

            if (!btn || !currentEditingBinding) return;

            const bookName = btn.dataset.removeBook;

            currentEditingBinding.worldBooks = currentEditingBinding.worldBooks.filter(n => n !== bookName);

            delete currentEditingBinding.assignedEntriesMap[bookName];

            renderSelectedWorldbooks(currentEditingBinding);

            renderWorldBookList(currentEditingBinding);

        });



        document.getElementById('wbap-endpoint-edit-entry-list').addEventListener('change', (e) => {

            if (e.target.type === 'checkbox' && currentEditingBinding) {

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

                Logger.log(`忙聺隆莽聸庐茅聙聣忙聥漏氓路虏忙聸麓忙聳? 盲赂聳莽聲聦盲鹿?${bookName}, 茅聙聣盲赂颅=${currentEditingBinding.assignedEntriesMap[bookName].length}忙聺隆`);

            }

        });

    }



    window.wbapEditEndpoint = async (id) => {

        window.wbapCurrentEndpointId = id;

        const modal = document.getElementById('wbap-endpoint-editor-modal');

        if (!modal) return;



        const config = WBAP.CharacterManager.getCurrentCharacterConfig();

        const pools = getGlobalPools();

        if (!pools.selectiveMode) pools.selectiveMode = { apiEndpoints: [] };

        if (!Array.isArray(pools.selectiveMode.apiEndpoints)) pools.selectiveMode.apiEndpoints = [];

        const endpoints = pools.selectiveMode.apiEndpoints;



        let endpoint = endpoints.find(ep => ep.id === id);

        if (!endpoint && endpoints.length > 0) {

            endpoint = endpoints[0];

        }

        if (!endpoint) {

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

                dedupe: true

            };

            endpoints.push(endpoint);

            WBAP.saveConfig();

        }

        normalizeEndpointStructure(endpoint);

        currentEditingEndpoint = endpoint;

        currentEditingBinding = ensureEndpointBinding(config, endpoint.id);



        // Fill base info

        document.getElementById('wbap-endpoint-editor-title').textContent = `?? API: ${endpoint.name}`;

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

        document.getElementById('wbap-endpoint-edit-url').value = endpoint.apiUrl || endpoint.url || '';

        document.getElementById('wbap-endpoint-edit-key').value = endpoint.apiKey || endpoint.key || '';

        const modelSelect = document.getElementById('wbap-endpoint-edit-model');

        modelSelect.innerHTML = '';

        if (endpoint.model) {

            const option = document.createElement('option');

            option.value = endpoint.model;

            option.textContent = endpoint.model;

            option.selected = true;

            modelSelect.appendChild(option);

        } else {

            modelSelect.innerHTML = '<option value="" disabled selected>??????</option>';

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



        const worldbookSelect = document.getElementById('wbap-endpoint-edit-worldbook-select');

        worldbookSelect.innerHTML = '<option value="">-- ??? --</option>';

        const bookNames = await WBAP.getAllWorldBookNames();

        bookNames.forEach(name => {

            const option = document.createElement('option');

            option.value = name;

            option.textContent = name;

            worldbookSelect.appendChild(option);

        });



        renderSelectedWorldbooks(currentEditingBinding);

        renderWorldBookList(currentEditingBinding);



        modal.classList.add('open');

        syncMobileRootFix();

    };



    function saveEndpoint() {

        const id = document.getElementById('wbap-endpoint-edit-id').value;

        const pools = getGlobalPools();

        const endpoints = pools.selectiveMode?.apiEndpoints || [];

        const endpoint = endpoints.find(ep => ep.id === id);

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

        endpoint.dedupe = document.getElementById('wbap-endpoint-edit-dedupe')?.checked !== false;



        if (currentEditingBinding) {

            currentEditingBinding.worldBooks = Array.isArray(currentEditingBinding.worldBooks)

                ? Array.from(new Set(currentEditingBinding.worldBooks))

                : [];

        }



        // Clean up old fields to avoid confusion

        delete endpoint.url;

        delete endpoint.key;

        delete endpoint.worldBook;

        delete endpoint.worldBooks;

        delete endpoint.assignedEntries;

        delete endpoint.assignedEntriesMap;



        WBAP.saveConfig();

        document.getElementById('wbap-endpoint-editor-modal').classList.remove('open');

        WBAP.UI.renderApiEndpoints(); // Refresh the list in the settings view

        syncMobileRootFix();

        Logger.log(`API instance "${endpoint.name}" saved`);

    }



    // 氓聹篓猫聞職忙聹卢氓聤聽猫陆陆氓聬聨莽芦聥氓聧鲁氓掳聺猫炉聲忙鲁篓氓聟楼UI

    // injectUI();



    window.addEventListener('resize', syncMobileRootFix);



})();
