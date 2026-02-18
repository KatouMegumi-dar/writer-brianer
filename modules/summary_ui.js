// modules/summary_ui.js
// 大小总结UI交互逻辑

(function () {
    'use strict';

    window.WBAP = window.WBAP || {};
    const Logger = WBAP.Logger;

    // ========== 状态管理 ==========
    // 全局配置（所有角色共享）
    let summaryConfig = {
        enabled: true, // 大小总结功能总开关
        apiChannel: 'direct', // 新增：API通道选择 ('direct' 或 'st-backend')
        apiUrl: '',
        apiKey: '',
        model: '',
        maxTokens: 2048,
        temperature: 0.7,
        timeout: 120,
        topP: 1.0,
        maxRetries: 3,
        presencePenalty: 0,
        frequencyPenalty: 0,
        smallPrompt: '',
        largePrompt: '',
        tagsEnabled: false,
        tags: '',
        // 内容排除规则
        exclusionRulesEnabled: false,
        exclusionRules: [
            // 示例规则
            // { pattern: '<system>.*?</system>', flags: 'gs', replacement: '' },
            // { pattern: '\\[OOC:.*?\\]', flags: 'g', replacement: '' }
        ],
        // 自动总结配置
        autoSummaryEnabled: false,
        autoSummaryThreshold: 20,
        autoSummaryRetention: 5,
        autoSummaryAutoExecute: true,
        autoHideEnabled: false, // 自动隐藏已总结消息
        // 大总结自动触发配置
        largeSummaryAutoEnabled: false,
        largeSummaryAutoThreshold: 300, // 触发阈值（基于小总结维护的楼层数）
        largeSummaryAutoRetention: 50,  // 保留层数
        largeSummaryBatchSize: 50,      // 单次批量处理楼层数
        largeSummaryDataSource: 'small-summary', // 数据源：'floor' 或 'small-summary'
        // 世界书配置
        bookScanDepth: 0, // 0=绿灯, 1=蓝灯
        bookInsertionOrder: 4, // 0-4: 角色定义前/后, 作者注释前/后, @D注入
        bookDepth: 10 // @D注入模式的深度
    };

    // 角色配置（每个角色独立）
    let characterProgress = {}; // { characterName: { lastSummarizedFloor: 0 } }

    let isProcessing = false;
    let stopRequested = false; // 全局停止标志

    // ========== 初始化 ==========
    async function initSummaryUI() {
        // 注入HTML
        injectSummaryPanels();

        // 绑定事件
        bindSummaryEvents();

        // 加载配置
        loadSummaryConfig();

        // 同步主面板切换开关状态
        const enabledToggle = document.getElementById('wbap-summary-enabled');
        if (enabledToggle) {
            enabledToggle.checked = summaryConfig.enabled !== false; // 默认启用
        }

        // 更新状态显示
        updateSummaryStatus();

        // 初始化时重新计算已总结楼层，确保数据准确
        await recalculateLastSummarizedFloor();

        Logger.log('Summary UI 已初始化');
    }

    function injectSummaryPanels() {
        const templates = WBAP.UI_TEMPLATES;
        if (!templates) {
            Logger.error('UI_TEMPLATES 未加载');
            return;
        }

        // 注入总结面板
        if (templates.SUMMARY_PANEL_HTML && !document.getElementById('wbap-summary-panel')) {
            document.body.insertAdjacentHTML('beforeend', templates.SUMMARY_PANEL_HTML);
        }
    }

    function bindSummaryEvents() {
        // 启用开关（主面板）
        const enabledToggle = document.getElementById('wbap-summary-enabled');
        if (enabledToggle) {
            enabledToggle.addEventListener('change', (e) => {
                summaryConfig.enabled = e.target.checked;
                saveSummaryConfig();
                updateSummaryStatus();
                Logger.log(`[大小总结] 功能${e.target.checked ? '已启用' : '已禁用'}`);
            });
        }

        // 打开面板按钮（底部区域）
        const openBtn = document.getElementById('wbap-summary-open-btn');
        if (openBtn) {
            openBtn.addEventListener('click', openSummaryPanel);
            Logger.log('Summary: 打开按钮事件已绑定');
        }

        // 打开面板按钮（顶部图标）
        const topBtn = document.getElementById('wbap-summary-top-btn');
        if (topBtn) {
            topBtn.addEventListener('click', openSummaryPanel);
            Logger.log('Summary: 顶部按钮事件已绑定');
        }

        // 关闭面板按钮
        const closeBtn = document.getElementById('wbap-summary-close');
        if (closeBtn) {
            closeBtn.addEventListener('click', closeSummaryPanel);
        }

        // 小总结按钮
        const smallBtn = document.getElementById('wbap-small-summary-btn');
        if (smallBtn) {
            smallBtn.addEventListener('click', handleSmallSummary);
        }

        // 大总结按钮
        const largeBtn = document.getElementById('wbap-large-summary-btn');
        if (largeBtn) {
            largeBtn.addEventListener('click', handleLargeSummary);
        }

        // 刷新列表按钮
        const refreshBtn = document.getElementById('wbap-summary-refresh-btn');
        if (refreshBtn) {
            refreshBtn.addEventListener('click', refreshSummaryList);
        }

        // 停止按钮 (单次总结用)
        const stopBtn = document.getElementById('wbap-summary-stop-btn');
        if (stopBtn) {
            stopBtn.addEventListener('click', stopCurrentProcess);
        }

        // 停止按钮 (批量总结专用)
        const batchStopBtn = document.getElementById('wbap-batch-summary-stop-btn');
        if (batchStopBtn) {
            batchStopBtn.addEventListener('click', stopBatchSummary);
        }

        // API测试按钮
        const apiTestBtn = document.getElementById('wbap-summary-api-test-btn');
        if (apiTestBtn) {
            apiTestBtn.addEventListener('click', testApiConnection);
        }

        // 获取模型按钮
        const fetchModelsBtn = document.getElementById('wbap-summary-fetch-models');
        if (fetchModelsBtn) {
            fetchModelsBtn.addEventListener('click', fetchSummaryModels);
        }

        // API设置输入框变化时保存
        const apiChannelInput = document.getElementById('wbap-summary-api-channel');
        if (apiChannelInput) {
            apiChannelInput.addEventListener('change', saveApiConfig);
        }

        const apiUrlInput = document.getElementById('wbap-summary-api-url');
        if (apiUrlInput) {
            apiUrlInput.addEventListener('change', saveApiConfig);
        }

        const apiKeyInput = document.getElementById('wbap-summary-api-key');
        if (apiKeyInput) {
            apiKeyInput.addEventListener('change', saveApiConfig);
        }

        const modelInput = document.getElementById('wbap-summary-model');
        if (modelInput) {
            modelInput.addEventListener('change', saveApiConfig);
        }

        const maxTokensInput = document.getElementById('wbap-summary-max-tokens');
        if (maxTokensInput) {
            maxTokensInput.addEventListener('change', saveApiConfig);
        }

        // 高级参数
        const temperatureInput = document.getElementById('wbap-summary-temperature');
        if (temperatureInput) {
            temperatureInput.addEventListener('change', saveApiConfig);
        }

        const timeoutInput = document.getElementById('wbap-summary-timeout');
        if (timeoutInput) {
            timeoutInput.addEventListener('change', saveApiConfig);
        }

        const topPInput = document.getElementById('wbap-summary-top-p');
        if (topPInput) {
            topPInput.addEventListener('change', saveApiConfig);
        }

        const maxRetriesInput = document.getElementById('wbap-summary-max-retries');
        if (maxRetriesInput) {
            maxRetriesInput.addEventListener('change', saveApiConfig);
        }

        const presencePenaltyInput = document.getElementById('wbap-summary-presence-penalty');
        if (presencePenaltyInput) {
            presencePenaltyInput.addEventListener('change', saveApiConfig);
        }

        const frequencyPenaltyInput = document.getElementById('wbap-summary-frequency-penalty');
        if (frequencyPenaltyInput) {
            frequencyPenaltyInput.addEventListener('change', saveApiConfig);
        }

        // 提示词输入框变化时保存
        const smallPromptInput = document.getElementById('wbap-small-summary-prompt-inline');
        if (smallPromptInput) {
            smallPromptInput.addEventListener('change', savePromptConfig);
        }

        const largePromptInput = document.getElementById('wbap-large-summary-prompt-inline');
        if (largePromptInput) {
            largePromptInput.addEventListener('change', savePromptConfig);
        }

        // 标签提取开关
        const tagToggle = document.getElementById('wbap-summary-tag-enabled');
        if (tagToggle) {
            tagToggle.addEventListener('change', (e) => {
                summaryConfig.tagsEnabled = e.target.checked;
                saveSummaryConfig();
            });
        }

        // 标签输入
        const tagsInput = document.getElementById('wbap-summary-tags');
        if (tagsInput) {
            tagsInput.addEventListener('change', (e) => {
                summaryConfig.tags = e.target.value;
                saveSummaryConfig();
            });
        }

        // 世界书激活模式
        const bookScanDepthSelect = document.getElementById('wbap-summary-book-scan-depth');
        if (bookScanDepthSelect) {
            bookScanDepthSelect.addEventListener('change', (e) => {
                const value = parseInt(e.target.value, 10);
                summaryConfig.bookScanDepth = value;
                saveSummaryConfig();
                Logger.log(`[世界书] 激活模式设置为: ${value === 0 ? '绿灯' : '蓝灯'}`);
            });
        }

        // 世界书插入位置
        const bookInsertionOrderSelect = document.getElementById('wbap-summary-book-insertion-order');
        if (bookInsertionOrderSelect) {
            bookInsertionOrderSelect.addEventListener('change', (e) => {
                const value = parseInt(e.target.value, 10);
                summaryConfig.bookInsertionOrder = value;
                saveSummaryConfig();

                // 显示/隐藏深度输入框
                const depthContainer = document.getElementById('wbap-summary-depth-container');
                if (depthContainer) {
                    depthContainer.style.display = value === 4 ? 'block' : 'none';
                }

                const positions = ['角色定义之前', '角色定义之后', '作者注释之前', '作者注释之后', '@D注入'];
                Logger.log(`[世界书] 插入位置设置为: ${positions[value]}`);
            });
        }

        // 世界书注入深度
        const bookDepthInput = document.getElementById('wbap-summary-book-depth');
        if (bookDepthInput) {
            bookDepthInput.addEventListener('change', (e) => {
                const value = parseInt(e.target.value, 10);
                if (value >= 0 && value <= 100) {
                    summaryConfig.bookDepth = value;
                    saveSummaryConfig();
                    Logger.log(`[世界书] 注入深度设置为: ${value}`);
                } else {
                    e.target.value = summaryConfig.bookDepth || 10;
                    showToast('深度必须在0-100之间', 'warning');
                }
            });
        }

        // 自动总结开关
        const autoSummaryToggle = document.getElementById('wbap-auto-summary-enabled');
        if (autoSummaryToggle) {
            autoSummaryToggle.addEventListener('change', (e) => {
                summaryConfig.autoSummaryEnabled = e.target.checked;
                saveSummaryConfig();
                Logger.log(`[自动总结] 已${e.target.checked ? '启用' : '禁用'}`);
            });
        }

        // 触发阈值
        const autoSummaryThreshold = document.getElementById('wbap-auto-summary-threshold');
        if (autoSummaryThreshold) {
            autoSummaryThreshold.addEventListener('change', (e) => {
                const value = parseInt(e.target.value, 10);
                if (value >= 5) {
                    summaryConfig.autoSummaryThreshold = value;
                    saveSummaryConfig();
                    Logger.log(`[自动总结] 阈值设置为: ${value}`);
                } else {
                    e.target.value = summaryConfig.autoSummaryThreshold || 20;
                    showToast('阈值必须大于等于5', 'warning');
                }
            });
        }

        // 保留层数
        const autoSummaryRetention = document.getElementById('wbap-auto-summary-retention');
        if (autoSummaryRetention) {
            autoSummaryRetention.addEventListener('change', (e) => {
                const value = parseInt(e.target.value, 10);
                if (value >= 0) {
                    summaryConfig.autoSummaryRetention = value;
                    saveSummaryConfig();
                    Logger.log(`[自动总结] 保留层数设置为: ${value}`);
                } else {
                    e.target.value = summaryConfig.autoSummaryRetention || 5;
                    showToast('保留层数必须大于等于0', 'warning');
                }
            });
        }

        // 自动执行开关
        const autoSummaryAutoExecute = document.getElementById('wbap-auto-summary-auto-execute');
        if (autoSummaryAutoExecute) {
            autoSummaryAutoExecute.addEventListener('change', (e) => {
                summaryConfig.autoSummaryAutoExecute = e.target.checked;
                saveSummaryConfig();
                Logger.log(`[自动总结] 自动执行: ${e.target.checked}`);
            });
        }

        // 大总结自动触发开关
        const largeSummaryAutoEnabled = document.getElementById('wbap-large-summary-auto-enabled');
        if (largeSummaryAutoEnabled) {
            largeSummaryAutoEnabled.addEventListener('change', (e) => {
                summaryConfig.largeSummaryAutoEnabled = e.target.checked;
                saveSummaryConfig();
                Logger.log(`[大总结自动触发] 已${e.target.checked ? '启用' : '禁用'}`);
            });
        }

        // 大总结触发阈值
        const largeSummaryAutoThreshold = document.getElementById('wbap-large-summary-auto-threshold');
        if (largeSummaryAutoThreshold) {
            largeSummaryAutoThreshold.addEventListener('change', (e) => {
                const value = parseInt(e.target.value, 10);
                if (value >= 50) {
                    summaryConfig.largeSummaryAutoThreshold = value;
                    saveSummaryConfig();
                    Logger.log(`[大总结自动触发] 阈值设置为: ${value}`);
                } else {
                    e.target.value = summaryConfig.largeSummaryAutoThreshold || 300;
                    showToast('阈值必须大于等于50', 'warning');
                }
            });
        }

        // 大总结保留层数
        const largeSummaryAutoRetention = document.getElementById('wbap-large-summary-auto-retention');
        if (largeSummaryAutoRetention) {
            largeSummaryAutoRetention.addEventListener('change', (e) => {
                const value = parseInt(e.target.value, 10);
                if (value >= 0) {
                    summaryConfig.largeSummaryAutoRetention = value;
                    saveSummaryConfig();
                    Logger.log(`[大总结自动触发] 保留层数设置为: ${value}`);
                } else {
                    e.target.value = summaryConfig.largeSummaryAutoRetention || 50;
                    showToast('保留层数必须大于等于0', 'warning');
                }
            });
        }

        // 大总结单次批量
        const largeSummaryBatchSize = document.getElementById('wbap-large-summary-batch-size');
        if (largeSummaryBatchSize) {
            largeSummaryBatchSize.addEventListener('change', (e) => {
                const value = parseInt(e.target.value, 10);
                if (value >= 10) {
                    summaryConfig.largeSummaryBatchSize = value;
                    saveSummaryConfig();
                    Logger.log(`[大总结自动触发] 单次批量设置为: ${value}`);
                } else {
                    e.target.value = summaryConfig.largeSummaryBatchSize || 50;
                    showToast('单次批量必须大于等于10', 'warning');
                }
            });
        }

        // 大总结数据源选择
        const largeSummaryDataSource = document.getElementById('wbap-large-summary-data-source');
        if (largeSummaryDataSource) {
            largeSummaryDataSource.addEventListener('change', (e) => {
                summaryConfig.largeSummaryDataSource = e.target.value;
                saveSummaryConfig();
                Logger.log(`[大总结自动触发] 数据源设置为: ${e.target.value}`);
            });
        }

        // 远征按钮
        const expeditionBtn = document.getElementById('wbap-expedition-btn');
        if (expeditionBtn) {
            expeditionBtn.addEventListener('click', () => {
                const state = expeditionBtn.dataset.state || 'idle';
                if (state === 'running') {
                    WBAP.summary.stopExpedition();
                } else {
                    WBAP.summary.executeExpedition();
                }
            });
        }

        // 批量总结按钮
        const batchSummaryBtn = document.getElementById('wbap-batch-summary-btn');
        if (batchSummaryBtn) {
            batchSummaryBtn.addEventListener('click', handleBatchSummary);
        }

        // 监听远征状态变化
        document.addEventListener('wbap-expedition-state-change', (e) => {
            const { isRunning, manualStop } = e.detail;
            updateExpeditionButtonUI(isRunning, manualStop);
        });

        // 调试按钮
        const debugBtn = document.getElementById('wbap-debug-config-btn');
        if (debugBtn) {
            debugBtn.addEventListener('click', () => {
                const config = getConfig();
                const totalFloors = WBAP.summary?.getTotalFloors?.() || 0;
                const characterName = WBAP.summary?.getCurrentCharacterName?.() || '未知角色';
                const debugInfo = {
                    '当前角色': characterName,
                    '当前配置': config,
                    '总楼层数': totalFloors,
                    '已总结楼层': config.lastSummarizedFloor || 0,
                    '保留层数': config.autoSummaryRetention || 5,
                    '可总结楼层': totalFloors - (config.autoSummaryRetention || 5),
                    '未总结楼层': (totalFloors - (config.autoSummaryRetention || 5)) - (config.lastSummarizedFloor || 0),
                    '触发阈值': config.autoSummaryThreshold || 20,
                    '自动执行': config.autoSummaryAutoExecute !== false,
                    '全局配置': localStorage.getItem('wbap_summary_config'),
                    '角色进度': localStorage.getItem('wbap_character_progress')
                };
                console.log('[调试] 自动总结配置:', debugInfo);
                alert('配置信息已输出到控制台（F12）\n\n' + JSON.stringify(debugInfo, null, 2));
            });
        }
    }

    // ========== 面板操作 ==========
    async function openSummaryPanel() {
        Logger.log('Summary: openSummaryPanel 被调用');
        const panel = document.getElementById('wbap-summary-panel');
        if (panel) {
            panel.classList.remove('wbap-hidden');
            panel.classList.add('open');

            // 隐藏主面板，降低内存占用
            const mainPanel = document.getElementById('wbap-panel');
            if (mainPanel) {
                mainPanel.classList.add('wbap-hidden-by-summary');
                Logger.log('Summary: 主面板已隐藏');
            }

            Logger.log('Summary: 面板已显示');

            // 绑定归档管理事件（如果还没有）
            bindArchiveManagementEvents();

            // 重新计算已总结楼层，确保显示最新状态
            await recalculateLastSummarizedFloor();
            updatePanelInfo();
            loadConfigToUI();
            refreshSummaryList();

            // 刷新归档列表
            await refreshArchiveList();
        } else {
            Logger.error('Summary: 未找到面板 #wbap-summary-panel');
        }
    }

    function closeSummaryPanel() {
        const panel = document.getElementById('wbap-summary-panel');
        if (panel) {
            panel.classList.remove('open');
            panel.classList.add('wbap-hidden');

            // 恢复主面板显示
            const mainPanel = document.getElementById('wbap-panel');
            if (mainPanel) {
                mainPanel.classList.remove('wbap-hidden-by-summary');
                Logger.log('Summary: 主面板已恢复显示');
            }
        }
    }

    function updateSummaryStatus() {
        const statusBadge = document.getElementById('wbap-summary-status');
        if (statusBadge) {
            if (summaryConfig.enabled !== false) {
                statusBadge.textContent = '就绪';
                statusBadge.style.background = 'rgba(74, 222, 128, 0.15)';
                statusBadge.style.color = '#4ade80';
                statusBadge.style.border = '1px solid rgba(74, 222, 128, 0.3)';
            } else {
                statusBadge.textContent = '已禁用';
                statusBadge.style.background = 'rgba(156, 163, 175, 0.15)';
                statusBadge.style.color = '#9ca3af';
                statusBadge.style.border = '1px solid rgba(156, 163, 175, 0.3)';
            }
        }
    }

    function updatePanelInfo() {
        const summary = WBAP.summary;
        if (!summary) return;

        const characterName = summary.getCurrentCharacterName();

        // 更新角色名称
        const charNameEl = document.getElementById('wbap-summary-char-name');
        if (charNameEl) {
            charNameEl.textContent = characterName || '未选择';
        }

        // 更新总楼层
        const totalFloorsEl = document.getElementById('wbap-summary-total-floors');
        if (totalFloorsEl) {
            totalFloorsEl.textContent = summary.getTotalFloors();
        }

        // 更新标题栏的上次总结楼层（按角色获取）
        const headerLastFloorEl = document.getElementById('wbap-summary-header-last-floor');
        if (headerLastFloorEl) {
            const lastFloor = getLastSummarizedFloor(characterName);
            headerLastFloorEl.textContent = lastFloor;
        }

        // 更新总结书状态
        updateBookStatus();
    }

    async function updateBookStatus() {
        const summary = WBAP.summary;
        if (!summary) return;

        const bookStatusEl = document.getElementById('wbap-summary-book-status');
        if (!bookStatusEl) return;

        const charName = summary.getCurrentCharacterName();
        if (!charName || charName === '未知角色') {
            bookStatusEl.textContent = '未选择角色';
            return;
        }

        const bookName = summary.getSummaryBookName(charName);
        const allBooks = await WBAP.getAllWorldBookNames();

        if (allBooks.includes(bookName)) {
            bookStatusEl.textContent = '已创建';
            bookStatusEl.style.color = '#4ade80';
        } else {
            bookStatusEl.textContent = '未创建';
            bookStatusEl.style.color = '';
        }
    }

    function loadConfigToUI() {
        // 加载启用状态到主面板开关
        const enabledToggle = document.getElementById('wbap-summary-enabled');
        if (enabledToggle) {
            enabledToggle.checked = summaryConfig.enabled !== false; // 默认启用
        }

        // API设置
        const apiChannelInput = document.getElementById('wbap-summary-api-channel');
        if (apiChannelInput) apiChannelInput.value = summaryConfig.apiChannel || 'direct';

        const apiUrlInput = document.getElementById('wbap-summary-api-url');
        if (apiUrlInput) apiUrlInput.value = summaryConfig.apiUrl || '';

        const apiKeyInput = document.getElementById('wbap-summary-api-key');
        if (apiKeyInput) apiKeyInput.value = summaryConfig.apiKey || '';

        const modelSelect = document.getElementById('wbap-summary-model');
        if (modelSelect) {
            const currentModel = summaryConfig.model || '';

            // 初始化模型下拉框
            modelSelect.innerHTML = '<option value="">请先获取模型列表</option>';

            // 如果有当前模型，添加到列表
            if (currentModel) {
                const opt = document.createElement('option');
                opt.value = currentModel;
                opt.textContent = currentModel;
                opt.selected = true;
                modelSelect.appendChild(opt);
            }
        }

        const maxTokensInput = document.getElementById('wbap-summary-max-tokens');
        if (maxTokensInput) maxTokensInput.value = summaryConfig.maxTokens || 2048;

        // 高级参数
        const temperatureInput = document.getElementById('wbap-summary-temperature');
        if (temperatureInput) temperatureInput.value = summaryConfig.temperature !== undefined ? summaryConfig.temperature : 0.7;

        const timeoutInput = document.getElementById('wbap-summary-timeout');
        if (timeoutInput) timeoutInput.value = summaryConfig.timeout || 120;

        const topPInput = document.getElementById('wbap-summary-top-p');
        if (topPInput) topPInput.value = summaryConfig.topP !== undefined ? summaryConfig.topP : 1.0;

        const maxRetriesInput = document.getElementById('wbap-summary-max-retries');
        if (maxRetriesInput) maxRetriesInput.value = summaryConfig.maxRetries !== undefined ? summaryConfig.maxRetries : 3;

        const presencePenaltyInput = document.getElementById('wbap-summary-presence-penalty');
        if (presencePenaltyInput) presencePenaltyInput.value = summaryConfig.presencePenalty || 0;

        const frequencyPenaltyInput = document.getElementById('wbap-summary-frequency-penalty');
        if (frequencyPenaltyInput) frequencyPenaltyInput.value = summaryConfig.frequencyPenalty || 0;

        // 提示词
        const smallPromptInput = document.getElementById('wbap-small-summary-prompt-inline');
        if (smallPromptInput) {
            smallPromptInput.value = summaryConfig.smallPrompt || WBAP.summary?.DEFAULT_SMALL_SUMMARY_PROMPT || '';
        }

        const largePromptInput = document.getElementById('wbap-large-summary-prompt-inline');
        if (largePromptInput) {
            largePromptInput.value = summaryConfig.largePrompt || WBAP.summary?.DEFAULT_LARGE_SUMMARY_PROMPT || '';
        }

        // 标签设置
        const tagToggle = document.getElementById('wbap-summary-tag-enabled');
        if (tagToggle) tagToggle.checked = summaryConfig.tagsEnabled;

        const tagsInput = document.getElementById('wbap-summary-tags');
        if (tagsInput) tagsInput.value = summaryConfig.tags || '';

        // 自动总结配置
        const autoSummaryToggle = document.getElementById('wbap-auto-summary-enabled');
        if (autoSummaryToggle) autoSummaryToggle.checked = summaryConfig.autoSummaryEnabled;

        const autoSummaryThreshold = document.getElementById('wbap-auto-summary-threshold');
        if (autoSummaryThreshold) autoSummaryThreshold.value = summaryConfig.autoSummaryThreshold || 20;

        const autoSummaryRetention = document.getElementById('wbap-auto-summary-retention');
        if (autoSummaryRetention) autoSummaryRetention.value = summaryConfig.autoSummaryRetention || 5;

        const autoSummaryAutoExecute = document.getElementById('wbap-auto-summary-auto-execute');
        if (autoSummaryAutoExecute) autoSummaryAutoExecute.checked = summaryConfig.autoSummaryAutoExecute !== false;

        const lastFloorEl = document.getElementById('wbap-auto-summary-last-floor');
        if (lastFloorEl) {
            const characterName = WBAP.summary?.getCurrentCharacterName?.() || '未知角色';
            lastFloorEl.textContent = getLastSummarizedFloor(characterName);
        }

        // 大总结自动触发配置
        const largeSummaryAutoEnabled = document.getElementById('wbap-large-summary-auto-enabled');
        if (largeSummaryAutoEnabled) largeSummaryAutoEnabled.checked = summaryConfig.largeSummaryAutoEnabled || false;

        const largeSummaryAutoThreshold = document.getElementById('wbap-large-summary-auto-threshold');
        if (largeSummaryAutoThreshold) largeSummaryAutoThreshold.value = summaryConfig.largeSummaryAutoThreshold || 300;

        const largeSummaryAutoRetention = document.getElementById('wbap-large-summary-auto-retention');
        if (largeSummaryAutoRetention) largeSummaryAutoRetention.value = summaryConfig.largeSummaryAutoRetention || 50;

        const largeSummaryBatchSize = document.getElementById('wbap-large-summary-batch-size');
        if (largeSummaryBatchSize) largeSummaryBatchSize.value = summaryConfig.largeSummaryBatchSize || 50;

        const largeSummaryDataSource = document.getElementById('wbap-large-summary-data-source');
        if (largeSummaryDataSource) largeSummaryDataSource.value = summaryConfig.largeSummaryDataSource || 'small-summary';

        // 世界书设置
        const bookScanDepthSelect = document.getElementById('wbap-summary-book-scan-depth');
        if (bookScanDepthSelect) {
            bookScanDepthSelect.value = summaryConfig.bookScanDepth || 0;
        }

        const bookInsertionOrderSelect = document.getElementById('wbap-summary-book-insertion-order');
        if (bookInsertionOrderSelect) {
            bookInsertionOrderSelect.value = summaryConfig.bookInsertionOrder !== undefined ? summaryConfig.bookInsertionOrder : 4;
        }

        const bookDepthInput = document.getElementById('wbap-summary-book-depth');
        if (bookDepthInput) {
            bookDepthInput.value = summaryConfig.bookDepth || 10;
        }

        // 显示/隐藏深度输入框
        const depthContainer = document.getElementById('wbap-summary-depth-container');
        if (depthContainer) {
            depthContainer.style.display = (summaryConfig.bookInsertionOrder === 4) ? 'block' : 'none';
        }
    }

    // ========== API配置 ==========
    function saveApiConfig() {
        const apiChannelInput = document.getElementById('wbap-summary-api-channel');
        const apiUrlInput = document.getElementById('wbap-summary-api-url');
        const apiKeyInput = document.getElementById('wbap-summary-api-key');
        const modelInput = document.getElementById('wbap-summary-model');
        const maxTokensInput = document.getElementById('wbap-summary-max-tokens');
        const temperatureInput = document.getElementById('wbap-summary-temperature');
        const timeoutInput = document.getElementById('wbap-summary-timeout');
        const topPInput = document.getElementById('wbap-summary-top-p');
        const maxRetriesInput = document.getElementById('wbap-summary-max-retries');
        const presencePenaltyInput = document.getElementById('wbap-summary-presence-penalty');
        const frequencyPenaltyInput = document.getElementById('wbap-summary-frequency-penalty');

        summaryConfig.apiChannel = apiChannelInput?.value || 'direct';
        summaryConfig.apiUrl = apiUrlInput?.value || '';
        summaryConfig.apiKey = apiKeyInput?.value || '';
        summaryConfig.model = modelInput?.value || '';
        summaryConfig.maxTokens = parseInt(maxTokensInput?.value, 10) || 2048;
        summaryConfig.temperature = parseFloat(temperatureInput?.value) || 0.7;
        summaryConfig.timeout = parseInt(timeoutInput?.value, 10) || 120;
        summaryConfig.topP = parseFloat(topPInput?.value) || 1.0;
        summaryConfig.maxRetries = parseInt(maxRetriesInput?.value, 10) || 3;
        summaryConfig.presencePenalty = parseFloat(presencePenaltyInput?.value) || 0;
        summaryConfig.frequencyPenalty = parseFloat(frequencyPenaltyInput?.value) || 0;

        saveSummaryConfig();
    }

    function savePromptConfig() {
        const smallPromptInput = document.getElementById('wbap-small-summary-prompt-inline');
        const largePromptInput = document.getElementById('wbap-large-summary-prompt-inline');

        summaryConfig.smallPrompt = smallPromptInput?.value || '';
        summaryConfig.largePrompt = largePromptInput?.value || '';

        saveSummaryConfig();
    }

    async function testApiConnection() {
        const apiUrl = document.getElementById('wbap-summary-api-url')?.value;
        const apiKey = document.getElementById('wbap-summary-api-key')?.value;
        const model = document.getElementById('wbap-summary-model')?.value;

        if (!apiUrl) {
            showToast('请先填写 API URL', 'warning');
            return;
        }
        if (!apiKey) {
            showToast('请先填写 API Key', 'warning');
            return;
        }
        if (!model) {
            showToast('请先填写模型名称', 'warning');
            return;
        }

        showToast('正在测试连接...', 'info');

        try {
            const result = await WBAP.testEndpointConnection({
                apiUrl,
                apiKey,
                model,
                maxTokens: 100,
                timeout: 30
            });

            if (result.success) {
                showToast('连接成功！', 'success');
            } else {
                showToast(`连接失败: ${result.message}`, 'error');
            }
        } catch (e) {
            showToast(`测试失败: ${e.message}`, 'error');
        }
    }

    async function fetchSummaryModels() {
        const btn = document.getElementById('wbap-summary-fetch-models');
        const originalContent = btn.innerHTML;
        btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> 获取中...';
        btn.disabled = true;

        try {
            const apiUrl = document.getElementById('wbap-summary-api-url')?.value;
            const apiKey = document.getElementById('wbap-summary-api-key')?.value;

            Logger.log('[Summary] 获取模型 - API URL:', apiUrl);
            Logger.log('[Summary] 获取模型 - API Key:', apiKey ? '已设置' : '未设置');

            if (!apiUrl) {
                throw new Error('请先填写 API URL');
            }
            if (!apiKey) {
                throw new Error('请先填写 API Key');
            }

            Logger.log('[Summary] 调用 WBAP.fetchEndpointModels...');
            const result = await WBAP.fetchEndpointModels({
                apiUrl,
                apiKey
            });

            Logger.log('[Summary] fetchEndpointModels 返回结果:', result);

            if (result.success && result.models) {
                const modelSelect = document.getElementById('wbap-summary-model');
                const currentModel = modelSelect.value;

                Logger.log('[Summary] 成功获取模型列表，共', result.models.length, '个模型');

                // 清空并重新填充
                modelSelect.innerHTML = '';

                // 添加空选项
                const emptyOpt = document.createElement('option');
                emptyOpt.value = '';
                emptyOpt.textContent = '-- 请选择模型 --';
                modelSelect.appendChild(emptyOpt);

                // 添加模型列表
                result.models.forEach(model => {
                    const opt = document.createElement('option');
                    opt.value = model;
                    opt.textContent = model;
                    if (model === currentModel) {
                        opt.selected = true;
                    }
                    modelSelect.appendChild(opt);
                });

                // 如果当前模型不在列表中，添加它
                if (currentModel && !result.models.includes(currentModel)) {
                    const opt = document.createElement('option');
                    opt.value = currentModel;
                    opt.textContent = `${currentModel} (当前)`;
                    opt.selected = true;
                    modelSelect.insertBefore(opt, modelSelect.children[1]);
                }

                showToast(`成功获取 ${result.models.length} 个模型`, 'success');
            } else {
                Logger.error('[Summary] 获取模型失败:', result.message);
                throw new Error(result.message || '获取模型列表失败');
            }
        } catch (err) {
            Logger.error('[Summary] 获取模型异常:', err);
            showToast(`获取模型失败: ${err.message}`, 'error');
        } finally {
            btn.innerHTML = originalContent;
            btn.disabled = false;
        }
    }

    // ========== 总结执行 ==========
    async function handleSmallSummary() {
        // 检查功能是否启用
        if (summaryConfig.enabled === false) {
            showToast('大小总结功能已禁用，请先在主面板启用', 'warning');
            return;
        }

        if (isProcessing) {
            showToast('正在处理中，请稍候', 'warning');
            return;
        }

        const startFloor = parseInt(document.getElementById('wbap-small-start-floor')?.value, 10);
        const endFloor = parseInt(document.getElementById('wbap-small-end-floor')?.value, 10);

        Logger.log(`[小总结] 开始执行: ${startFloor}-${endFloor} 楼`);

        if (!validateFloorRange(startFloor, endFloor)) return;

        // 验证API配置
        const apiConfig = getApiConfig();
        Logger.log('[小总结] API配置:', apiConfig);

        if (!apiConfig.apiUrl || !apiConfig.apiKey || !apiConfig.model) {
            showToast('请先配置API设置', 'error');
            return;
        }

        // 检查是否需要交互式预览
        const autoExecute = summaryConfig.autoSummaryAutoExecute !== false;
        Logger.log(`[小总结] 自动执行模式: ${autoExecute}`);

        if (!autoExecute) {
            // 弹出交互式预览
            const editedMessages = await WBAP.summary.showInteractivePreview(startFloor, endFloor);

            if (!editedMessages) {
                // 用户取消
                return;
            }

            isProcessing = true;
            stopRequested = false; // 重置停止标志
            showProgress(true);
            updateProgressText('正在生成小总结...');

            try {
                // 获取提示词
                const smallPromptInput = document.getElementById('wbap-small-summary-prompt-inline');
                const userPrompt = smallPromptInput?.value || WBAP.summary.DEFAULT_SMALL_SUMMARY_PROMPT;

                // 使用编辑后的消息
                const chatContent = WBAP.summary.formatMessagesAsText(editedMessages);
                const prompt = userPrompt.replace('{chat_content}', chatContent);

                // 调用AI生成总结
                const summary = await WBAP.callAI(
                    apiConfig?.model,
                    prompt,
                    '',
                    apiConfig
                );

                if (!summary) {
                    showToast('小总结失败: AI返回空结果', 'error');
                    return;
                }

                // 显示总结结果预览面板
                showProgress(false);
                isProcessing = false;

                showSummaryResultModal(startFloor, endFloor, summary, editedMessages, async (confirmed, finalSummary) => {
                    if (!confirmed) {
                        showToast('已取消保存', 'info');
                        return;
                    }

                    // 用户确认，保存总结
                    const characterName = WBAP.summary.getCurrentCharacterName();
                    const bookName = WBAP.summary.getSummaryBookName(characterName);
                    await WBAP.summary.ensureSummaryBook(characterName);
                    const entryResult = await WBAP.summary.createSmallSummaryEntry(bookName, startFloor, endFloor, finalSummary);

                    if (entryResult.success) {
                        showToast(`小总结已创建: ${entryResult.entryName}`, 'success');
                        // 更新已总结楼层
                        updateLastSummarizedFloor(endFloor);
                        refreshSummaryList();

                        // 自动隐藏已总结消息
                        if (summaryConfig.autoHideEnabled) {
                            const hideResult = await WBAP.summary.autoHideSummarizedMessages(endFloor);
                            if (hideResult.success) {
                                Logger.log(`[自动隐藏] 已隐藏 ${hideResult.hiddenCount} 条消息`);
                            }
                        }

                        // 检查是否需要触发大总结
                        if (summaryConfig.largeSummaryAutoEnabled) {
                            Logger.log('[小总结] 检查是否需要触发大总结...');
                            const largeSummaryResult = await WBAP.summary.checkAndTriggerLargeSummary();
                            if (largeSummaryResult.triggered) {
                                Logger.log('[小总结] 大总结已触发');
                            }
                        }
                    } else {
                        showToast(`小总结失败: ${entryResult.reason}`, 'error');
                    }
                });

            } catch (e) {
                Logger.error('小总结执行失败:', e);
                showToast(`执行失败: ${e.message}`, 'error');
            } finally {
                isProcessing = false;
                stopRequested = false; // 重置停止标志
                showProgress(false);
            }
        } else {
            // 自动执行模式（也使用结果预览）
            isProcessing = true;
            stopRequested = false;
            showProgress(true);
            updateProgressText('正在生成小总结...');

            try {
                // 获取提示词
                const smallPromptInput = document.getElementById('wbap-small-summary-prompt-inline');
                const userPrompt = smallPromptInput?.value || WBAP.summary.DEFAULT_SMALL_SUMMARY_PROMPT;

                const options = {
                    apiConfig,
                    systemPrompt: '',
                    userPrompt,
                    tagsToExtract: summaryConfig.tagsEnabled ? parseTags(summaryConfig.tags) : [],
                    exclusionRules: summaryConfig.exclusionRulesEnabled ? summaryConfig.exclusionRules : [],
                    onProgress: updateProgress
                };

                const result = await WBAP.summary.executeSmallSummary(startFloor, endFloor, options);

                if (!result.success) {
                    showToast(`小总结失败: ${result.reason}`, 'error');
                    return;
                }

                // 显示总结结果预览面板
                showProgress(false);
                isProcessing = false;

                Logger.log('[总结结果] 准备显示预览面板，summary长度:', result.summary?.length);

                // 获取原始消息用于重新生成
                const messages = WBAP.summary.extractMessagesByFloor(startFloor, endFloor);

                Logger.log('[总结结果] 调用 showSummaryResultModal');
                showSummaryResultModal(startFloor, endFloor, result.summary, messages, async (confirmed, finalSummary) => {
                    if (!confirmed) {
                        showToast('已取消保存', 'info');
                        return;
                    }

                    // 用户确认，保存总结
                    const characterName = WBAP.summary.getCurrentCharacterName();
                    const bookName = WBAP.summary.getSummaryBookName(characterName);
                    await WBAP.summary.ensureSummaryBook(characterName);
                    const entryResult = await WBAP.summary.createSmallSummaryEntry(bookName, startFloor, endFloor, finalSummary);

                    if (entryResult.success) {
                        showToast(`小总结已创建: ${entryResult.entryName}`, 'success');
                        // 更新已总结楼层
                        updateLastSummarizedFloor(endFloor);
                        refreshSummaryList();

                        // 自动隐藏已总结消息
                        if (summaryConfig.autoHideEnabled) {
                            const hideResult = await WBAP.summary.autoHideSummarizedMessages(endFloor);
                            if (hideResult.success) {
                                Logger.log(`[自动隐藏] 已隐藏 ${hideResult.hiddenCount} 条消息`);
                            }
                        }

                        // 检查是否需要触发大总结
                        if (summaryConfig.largeSummaryAutoEnabled) {
                            Logger.log('[小总结] 检查是否需要触发大总结...');
                            const largeSummaryResult = await WBAP.summary.checkAndTriggerLargeSummary();
                            if (largeSummaryResult.triggered) {
                                Logger.log('[小总结] 大总结已触发');
                            }
                        }
                    } else {
                        showToast(`小总结失败: ${entryResult.reason}`, 'error');
                    }
                });

            } catch (e) {
                Logger.error('小总结执行失败:', e);
                showToast(`执行失败: ${e.message}`, 'error');
            } finally {
                isProcessing = false;
                stopRequested = false; // 重置停止标志
                showProgress(false);
            }
        }
    }

    async function handleLargeSummary() {
        // 检查功能是否启用
        if (summaryConfig.enabled === false) {
            showToast('大小总结功能已禁用，请先在主面板启用', 'warning');
            return;
        }

        if (isProcessing) {
            showToast('正在处理中，请稍候', 'warning');
            return;
        }

        const startFloor = parseInt(document.getElementById('wbap-large-start-floor')?.value, 10);
        const endFloor = parseInt(document.getElementById('wbap-large-end-floor')?.value, 10);
        const deleteSmall = document.getElementById('wbap-delete-small-summaries')?.checked ?? true;

        if (!validateFloorRange(startFloor, endFloor)) return;

        // 验证API配置
        const apiConfig = getApiConfig();
        if (!apiConfig.apiUrl || !apiConfig.apiKey || !apiConfig.model) {
            showToast('请先配置API设置', 'error');
            return;
        }

        // 获取数据源配置
        const dataSource = summaryConfig.largeSummaryDataSource || 'small-summary';
        const characterName = WBAP.summary.getCurrentCharacterName();
        const bookName = WBAP.summary.getSummaryBookName(characterName);

        Logger.log(`[手动大总结] 数据源模式: ${dataSource}`);

        isProcessing = true;
        stopRequested = false;
        showProgress(true);
        updateProgressText('正在生成大总结...');

        try {
            let summary;
            let editedMessages;

            if (dataSource === 'floor') {
                // 模式1：处理原始楼层数据
                Logger.log(`[手动大总结] 处理原始楼层数据: ${startFloor}-${endFloor}`);

                // 获取原始消息
                const messages = WBAP.summary.extractMessagesByFloor(startFloor, endFloor);

                // 检查是否需要消息预览
                const autoExecute = summaryConfig.autoSummaryAutoExecute !== false;

                if (!autoExecute) {
                    // 弹出消息预览面板
                    editedMessages = await WBAP.summary.showInteractivePreview(startFloor, endFloor);

                    if (!editedMessages) {
                        // 用户取消
                        showProgress(false);
                        isProcessing = false;
                        return;
                    }
                } else {
                    editedMessages = messages;
                }

                // 格式化消息并生成总结
                const chatContent = WBAP.summary.formatMessagesAsText(editedMessages);
                const largePromptInput = document.getElementById('wbap-large-summary-prompt-inline');
                const userPrompt = largePromptInput?.value || WBAP.summary.DEFAULT_LARGE_SUMMARY_PROMPT;
                const prompt = userPrompt.replace('{chat_content}', chatContent);

                summary = await WBAP.callAI(
                    apiConfig?.model,
                    prompt,
                    '',
                    apiConfig
                );

                if (!summary) {
                    showToast('大总结失败: AI返回空结果', 'error');
                    return;
                }

            } else {
                // 模式2：处理小总结数据
                Logger.log(`[手动大总结] 处理小总结数据: ${startFloor}-${endFloor}`);

                // 获取范围内的所有小总结条目
                const entries = await WBAP.summary.findSmallSummariesInRange(bookName, startFloor, endFloor);

                if (entries.length === 0) {
                    showToast('范围内没有小总结条目', 'warning');
                    return;
                }

                Logger.log(`[手动大总结] 找到 ${entries.length} 个小总结条目`);

                // 合并所有小总结内容
                let combinedContent = '';
                entries.forEach(entry => {
                    const comment = entry.comment || '';
                    const content = entry.content || '';
                    // 移除元数据标记
                    const cleanContent = content.replace(/<!-- WBAP_META:.*?-->/g, '').trim();
                    combinedContent += `[${comment}]\n${cleanContent}\n\n`;
                });

                // 使用大总结提示词处理合并内容
                const largePromptInput = document.getElementById('wbap-large-summary-prompt-inline');
                const userPrompt = largePromptInput?.value || WBAP.summary.DEFAULT_LARGE_SUMMARY_PROMPT;
                const prompt = userPrompt.replace('{chat_content}', combinedContent);

                // 调用AI生成大总结
                summary = await WBAP.callAI(
                    apiConfig?.model,
                    prompt,
                    '',
                    apiConfig
                );

                if (!summary) {
                    showToast('大总结失败: AI返回空结果', 'error');
                    return;
                }

                // 获取原始消息用于重新生成（结果预览面板需要）
                editedMessages = WBAP.summary.extractMessagesByFloor(startFloor, endFloor);
            }

            // 显示结果预览面板（两种模式都需要）
            showProgress(false);
            isProcessing = false;

            showSummaryResultModal(startFloor, endFloor, summary, editedMessages, async (confirmed, finalSummary) => {
                if (!confirmed) {
                    showToast('已取消保存', 'info');
                    return;
                }

                // 用户确认，保存总结
                await WBAP.summary.ensureSummaryBook(characterName);
                const entryResult = await WBAP.summary.createLargeSummaryEntry(bookName, startFloor, endFloor, finalSummary);

                if (entryResult.success) {
                    let msg = `大总结已创建: ${entryResult.entryName}`;

                    // 删除范围内的小总结
                    if (deleteSmall) {
                        const deleteResult = await WBAP.summary.deleteSmallSummariesInRange(bookName, startFloor, endFloor);
                        if (deleteResult.deletedCount > 0) {
                            msg += ` (已删除 ${deleteResult.deletedCount} 个小总结)`;
                        }
                    }

                    showToast(msg, 'success');
                    refreshSummaryList();

                    // 自动隐藏已总结消息
                    if (summaryConfig.autoHideEnabled) {
                        const hideResult = await WBAP.summary.autoHideSummarizedMessages(endFloor);
                        if (hideResult.success) {
                            Logger.log(`[自动隐藏] 已隐藏 ${hideResult.hiddenCount} 条消息`);
                        }
                    }
                } else {
                    showToast(`大总结失败: ${entryResult.reason}`, 'error');
                }
            });

        } catch (e) {
            Logger.error('大总结执行失败:', e);
            showToast(`执行失败: ${e.message}`, 'error');
        } finally {
            isProcessing = false;
            stopRequested = false;
            showProgress(false);
        }
    }

    /**
     * 批量总结处理函数（带结果预览）
     */
    async function handleBatchSummary() {
        // 检查功能是否启用
        if (summaryConfig.enabled === false) {
            showToast('大小总结功能已禁用，请先在主面板启用', 'warning');
            return;
        }

        if (isProcessing) {
            showToast('正在处理中，请稍候', 'warning');
            return;
        }

        // 获取输入值
        const startFloorInput = document.getElementById('wbap-batch-start-floor');
        const endFloorInput = document.getElementById('wbap-batch-end-floor');
        const batchSizeInput = document.getElementById('wbap-batch-size');
        const progressDiv = document.getElementById('wbap-batch-summary-progress');
        const progressText = document.getElementById('wbap-batch-summary-progress-text');
        const btn = document.getElementById('wbap-batch-summary-btn');

        const startFloor = parseInt(startFloorInput?.value, 10);
        const endFloor = parseInt(endFloorInput?.value, 10);
        const batchSize = parseInt(batchSizeInput?.value, 10);

        // 验证输入
        if (!validateFloorRange(startFloor, endFloor)) {
            return;
        }

        if (isNaN(batchSize) || batchSize < 1) {
            showToast('请输入有效的批次大小', 'error');
            return;
        }

        // 计算批次
        const totalFloors = endFloor - startFloor + 1;
        const batches = [];
        let currentStart = startFloor;

        while (currentStart <= endFloor) {
            const currentEnd = Math.min(currentStart + batchSize - 1, endFloor);
            batches.push({ start: currentStart, end: currentEnd });
            currentStart = currentEnd + 1;
        }

        // 确认执行
        const confirmMsg = `将分 ${batches.length} 批次总结 ${startFloor}-${endFloor} 楼（共 ${totalFloors} 层）\n\n` +
            batches.map((b, i) => `第 ${i + 1} 批: ${b.start}-${b.end} 楼`).join('\n') +
            '\n\n每批总结完成后会弹出预览面板供您确认。\n确定开始批量总结吗？';

        if (!confirm(confirmMsg)) {
            return;
        }

        // 获取API配置
        const apiConfig = getApiConfig();
        if (!apiConfig.apiUrl || !apiConfig.apiKey || !apiConfig.model) {
            showToast('请先配置API设置', 'error');
            return;
        }

        // 开始批量处理
        isProcessing = true;
        stopRequested = false;
        btn.disabled = true;
        btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> <span>处理中...</span>';
        progressDiv.style.display = 'block';

        let successCount = 0;
        let failCount = 0;
        let cancelledByUser = false;

        try {
            for (let i = 0; i < batches.length; i++) {
                // 检查是否请求停止
                if (stopRequested) {
                    showToast('批量总结已停止', 'warning');
                    break;
                }

                const batch = batches[i];
                const spanEl = progressText.querySelector('span');
                if (spanEl) {
                    spanEl.textContent = `正在生成第 ${i + 1}/${batches.length} 批总结: ${batch.start}-${batch.end} 楼...`;
                } else {
                    progressText.textContent = `正在生成第 ${i + 1}/${batches.length} 批总结: ${batch.start}-${batch.end} 楼...`;
                }

                try {
                    // 获取提示词
                    const smallPromptInput = document.getElementById('wbap-small-summary-prompt-inline');
                    const userPrompt = smallPromptInput?.value || WBAP.summary.DEFAULT_SMALL_SUMMARY_PROMPT;

                    // 获取原始消息用于预览
                    const messages = WBAP.summary.extractMessagesByFloor(batch.start, batch.end);
                    let editedMessages = messages;

                    // 检查是否需要消息预览（根据 autoSummaryAutoExecute 配置）
                    const autoExecute = summaryConfig.autoSummaryAutoExecute !== false;
                    if (!autoExecute) {
                        // 弹出消息预览面板
                        editedMessages = await WBAP.summary.showInteractivePreview(batch.start, batch.end);

                        if (!editedMessages) {
                            // 用户取消，询问是否继续
                            const shouldContinue = confirm(`第 ${i + 1} 批消息预览已取消。\n\n是否继续处理剩余批次？`);
                            if (!shouldContinue) {
                                cancelledByUser = true;
                                break;
                            }
                            failCount++;
                            continue; // 跳过当前批次
                        }
                    }

                    // 格式化内容并调用AI
                    const chatContent = WBAP.summary.formatMessagesAsText(editedMessages);
                    const prompt = userPrompt.replace('{chat_content}', chatContent);

                    const summary = await WBAP.callAI(
                        apiConfig?.model,
                        prompt,
                        '',
                        apiConfig
                    );

                    if (!summary) {
                        failCount++;
                        Logger.error(`[批量总结] 第 ${i + 1} 批失败: AI返回空结果`);
                        showToast(`第 ${i + 1} 批总结失败: AI返回空结果`, 'error');

                        // 询问是否继续
                        const shouldContinue = confirm(`第 ${i + 1} 批生成失败。\n\n是否继续处理剩余批次？`);
                        if (!shouldContinue) {
                            cancelledByUser = true;
                            break;
                        }
                        continue;
                    }

                    // 显示结果预览面板，等待用户确认
                    const userConfirmed = await new Promise((resolve) => {
                        showSummaryResultModal(batch.start, batch.end, summary, editedMessages, async (confirmed, finalSummary) => {
                            if (!confirmed) {
                                resolve(false);
                                return;
                            }

                            // 用户确认，保存总结
                            const characterName = WBAP.summary.getCurrentCharacterName();
                            const bookName = WBAP.summary.getSummaryBookName(characterName);
                            await WBAP.summary.ensureSummaryBook(characterName);
                            const entryResult = await WBAP.summary.createSmallSummaryEntry(bookName, batch.start, batch.end, finalSummary);

                            if (entryResult.success) {
                                Logger.log(`[批量总结] 第 ${i + 1} 批已保存: ${batch.start}-${batch.end}`);
                                // 立即更新已总结楼层
                                updateLastSummarizedFloor(batch.end);
                                resolve(true);
                            } else {
                                showToast(`保存失败: ${entryResult.reason}`, 'error');
                                resolve(false);
                            }
                        });
                    });

                    if (userConfirmed) {
                        successCount++;
                    } else {
                        // 用户取消，询问是否继续
                        const shouldContinue = confirm(`第 ${i + 1} 批已取消。\n\n是否继续处理剩余批次？`);
                        if (!shouldContinue) {
                            cancelledByUser = true;
                            break;
                        }
                        failCount++;
                    }

                } catch (error) {
                    if (error.name === 'AbortError') {
                        Logger.log(`[批量总结] 第 ${i + 1} 批被用户中止`);
                        stopRequested = true;
                        break;
                    }
                    failCount++;
                    Logger.error(`[批量总结] 第 ${i + 1} 批异常:`, error);
                    showToast(`第 ${i + 1} 批异常: ${error.message}`, 'error');
                }
            }

            // 完成提示
            if (cancelledByUser) {
                const resultMsg = `批量总结已取消\n已完成: ${successCount} 批\n失败/跳过: ${failCount} 批`;
                showToast(resultMsg, 'info');
            } else if (stopRequested) {
                const resultMsg = `批量总结已停止\n已完成: ${successCount} 批\n失败: ${failCount} 批`;
                showToast(resultMsg, 'warning');
            } else {
                const resultMsg = `批量总结完成！\n成功: ${successCount} 批\n失败: ${failCount} 批`;
                showToast(resultMsg, failCount === 0 ? 'success' : 'warning');
            }

            // 刷新列表
            await refreshSummaryList();

            // 更新已总结楼层
            if (successCount > 0) {
                await recalculateLastSummarizedFloor();
                updatePanelInfo();

                // 检查是否需要触发大总结
                if (summaryConfig.largeSummaryAutoEnabled) {
                    Logger.log('[批量总结] 检查是否需要触发大总结...');
                    const largeSummaryResult = await WBAP.summary.checkAndTriggerLargeSummary();
                    if (largeSummaryResult.triggered) {
                        Logger.log('[批量总结] 大总结已触发');
                        // 刷新列表以显示新的大总结
                        await refreshSummaryList();
                        await recalculateLastSummarizedFloor();
                        updatePanelInfo();
                    }
                }
            }

        } catch (error) {
            Logger.error('[批量总结] 执行失败:', error);
            showToast(`批量总结失败: ${error.message}`, 'error');
        } finally {
            isProcessing = false;
            stopRequested = false;
            btn.disabled = false;
            btn.innerHTML = '<i class="fa-solid fa-rocket"></i> <span>开始批量总结</span>';
            progressDiv.style.display = 'none';
        }
    }

    function validateFloorRange(start, end) {
        const totalFloors = WBAP.summary?.getTotalFloors() || 0;

        if (isNaN(start) || isNaN(end)) {
            showToast('请输入有效的楼层范围', 'error');
            return false;
        }

        if (start < 1 || end < 1) {
            showToast('楼层必须大于0', 'error');
            return false;
        }

        if (start > end) {
            showToast('起始楼层不能大于结束楼层', 'error');
            return false;
        }

        if (end > totalFloors) {
            showToast(`结束楼层超出范围（最大: ${totalFloors}）`, 'error');
            return false;
        }

        return true;
    }

    function parseTags(tagsStr) {
        if (!tagsStr) return [];
        return tagsStr.split(/[,，、]/).map(t => t.trim()).filter(Boolean);
    }

    // ========== 总结列表 ==========
    async function refreshSummaryList() {
        const listEl = document.getElementById('wbap-summary-list');
        if (!listEl) return;

        const summary = WBAP.summary;
        if (!summary) {
            listEl.innerHTML = '<div class="wbap-summary-list-empty">模块未加载</div>';
            return;
        }

        const charName = summary.getCurrentCharacterName();
        if (!charName || charName === '未知角色') {
            listEl.innerHTML = '<div class="wbap-summary-list-empty">请先选择角色</div>';
            return;
        }

        try {
            const entries = await summary.getSummaryEntries(charName);
            const allEntries = [...entries.small, ...entries.large];

            if (allEntries.length === 0) {
                listEl.innerHTML = '<div class="wbap-summary-list-empty">暂无总结</div>';
                return;
            }

            listEl.innerHTML = allEntries.map(entry => {
                const isSmall = (entry.comment || '').endsWith(summary.SMALL_SUMMARY_SUFFIX);
                const typeClass = isSmall ? 'small' : 'large';
                const typeText = isSmall ? '小' : '大';

                return `
                    <div class="wbap-summary-list-item" data-uid="${entry.uid}">
                        <div class="wbap-summary-list-item-info">
                            <span class="wbap-summary-list-item-type ${typeClass}">${typeText}</span>
                            <span class="wbap-summary-list-item-name">${entry.comment || '未命名'}</span>
                        </div>
                        <div class="wbap-summary-list-item-actions">
                            <button class="wbap-summary-list-item-btn view" data-uid="${entry.uid}" title="查看">
                                <i class="fa-solid fa-eye"></i>
                            </button>
                            <button class="wbap-summary-list-item-btn delete" data-uid="${entry.uid}" title="删除">
                                <i class="fa-solid fa-trash"></i>
                            </button>
                        </div>
                    </div>
                `;
            }).join('');

            // 绑定列表项事件
            bindListItemEvents();

        } catch (e) {
            Logger.error('刷新总结列表失败:', e);
            listEl.innerHTML = '<div class="wbap-summary-list-empty">加载失败</div>';
        }
    }

    function bindListItemEvents() {
        // 查看按钮
        document.querySelectorAll('.wbap-summary-list-item-btn.view').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                const uid = e.currentTarget.dataset.uid;
                await viewSummaryEntry(uid);
            });
        });

        // 删除按钮
        document.querySelectorAll('.wbap-summary-list-item-btn.delete').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                const uid = e.currentTarget.dataset.uid;
                await deleteSummaryEntry(uid);
            });
        });
    }

    async function viewSummaryEntry(uid) {
        const summary = WBAP.summary;
        if (!summary) return;

        const charName = summary.getCurrentCharacterName();
        const bookName = summary.getSummaryBookName(charName);
        const bookData = await WBAP.loadWorldBookEntriesByName(bookName);

        if (!bookData || !bookData.entries) return;

        const entry = bookData.entries[String(uid)];
        if (!entry) {
            showToast('条目不存在', 'error');
            return;
        }

        // 简单弹窗显示内容
        const content = entry.content || '(空)';
        alert(`${entry.comment || '总结内容'}\n\n${content}`);
    }

    async function deleteSummaryEntry(uid) {
        if (!confirm('确定要删除这个总结吗？')) return;

        const summary = WBAP.summary;
        if (!summary) return;

        const charName = summary.getCurrentCharacterName();
        const bookName = summary.getSummaryBookName(charName);

        const result = await WBAP.deleteWorldBookEntries(bookName, [parseInt(uid, 10)]);

        if (result.success) {
            showToast('已删除', 'success');
            // 重新计算已总结楼层
            await recalculateLastSummarizedFloor();
            refreshSummaryList();
        } else {
            showToast(`删除失败: ${result.reason}`, 'error');
        }
    }

    /**
     * 重新计算已总结的最大楼层
     */
    async function recalculateLastSummarizedFloor() {
        try {
            const summary = WBAP.summary;
            if (!summary) return;

            const charName = summary.getCurrentCharacterName();
            if (!charName || charName === '未知角色') {
                updateLastSummarizedFloor(0);
                return;
            }

            // 获取所有总结条目
            const entries = await summary.getSummaryEntries(charName);
            const allEntries = [...entries.small, ...entries.large];

            if (allEntries.length === 0) {
                // 没有任何总结条目，重置为0
                updateLastSummarizedFloor(0);
                Logger.log('[重新计算] 无总结条目，已重置为 0');
                return;
            }

            // 找到最大的结束楼层
            let maxEndFloor = 0;
            allEntries.forEach(entry => {
                // 优先从元数据中提取
                const metadata = WBAP.summary.extractMetadataFromContent?.(entry.content);
                if (metadata && metadata.endFloor) {
                    if (metadata.endFloor > maxEndFloor) {
                        maxEndFloor = metadata.endFloor;
                    }
                    return;
                }

                // 回退到注释解析
                const comment = entry.comment || '';
                // 匹配 "X-Y楼小总结" 或 "X-Y楼大总结" 格式
                const match = comment.match(/^(\d+)-(\d+)楼(小|大)总结$/);
                if (match) {
                    const endFloor = parseInt(match[2], 10);
                    if (endFloor > maxEndFloor) {
                        maxEndFloor = endFloor;
                    }
                }
            });

            updateLastSummarizedFloor(maxEndFloor);
            Logger.log(`[重新计算] 已总结楼层更新为: ${maxEndFloor}`);

        } catch (e) {
            Logger.error('[重新计算] 计算已总结楼层失败:', e);
        }
    }

    // ========== 进度显示 ==========
    function showProgress(show) {
        const progressEl = document.getElementById('wbap-summary-progress');
        if (progressEl) {
            progressEl.classList.toggle('wbap-hidden', !show);
        }
        if (show) {
            updateProgress(0);
        }
    }

    function updateProgress(percent) {
        const fillEl = document.getElementById('wbap-summary-progress-fill');
        if (fillEl) {
            fillEl.style.width = `${percent}%`;
        }
    }

    function updateProgressText(text) {
        const textEl = document.getElementById('wbap-summary-progress-text');
        if (textEl) {
            textEl.textContent = text;
        }
    }

    /**
     * 停止批量总结
     */
    function stopBatchSummary() {
        if (isProcessing) {
            stopRequested = true;
            showToast('正在停止批量总结...', 'info');
            updateProgressText('正在停止，请稍候...');
            Logger.log('[批量总结] 用户请求停止');
        } else {
            showToast('当前没有正在运行的批量总结任务', 'warning');
        }
    }

    /**
     * 停止当前处理（保留用于单次总结）
     */
    function stopCurrentProcess() {
        // 只停止单次总结
        if (isProcessing) {
            stopRequested = true;
            showToast('正在停止任务...', 'info');
            updateProgressText('正在停止，请稍候...');
            Logger.log('[总结] 用户请求停止');
        } else {
            showToast('当前没有正在运行的任务', 'warning');
        }
    }

    // ========== 配置持久化 ==========
    const CONFIG_KEY = 'wbap_summary_config';
    const PROGRESS_KEY = 'wbap_character_progress';

    function loadSummaryConfig() {
        try {
            // 加载全局配置
            const saved = localStorage.getItem(CONFIG_KEY);
            if (saved) {
                const parsed = JSON.parse(saved);
                // 移除旧的 lastSummarizedFloor（如果存在）
                delete parsed.lastSummarizedFloor;
                summaryConfig = { ...summaryConfig, ...parsed };
            }

            // 加载角色进度
            const progressSaved = localStorage.getItem(PROGRESS_KEY);
            if (progressSaved) {
                characterProgress = JSON.parse(progressSaved);
            }
        } catch (e) {
            Logger.warn('加载总结配置失败:', e);
        }
    }

    function saveSummaryConfig() {
        try {
            // 保存全局配置（不包含 lastSummarizedFloor）
            const configToSave = { ...summaryConfig };
            delete configToSave.lastSummarizedFloor;
            localStorage.setItem(CONFIG_KEY, JSON.stringify(configToSave));
        } catch (e) {
            Logger.warn('保存总结配置失败:', e);
        }
    }

    function saveCharacterProgress() {
        try {
            localStorage.setItem(PROGRESS_KEY, JSON.stringify(characterProgress));
        } catch (e) {
            Logger.warn('保存角色进度失败:', e);
        }
    }

    function getLastSummarizedFloor(characterName) {
        if (!characterName || characterName === '未知角色') return 0;
        return characterProgress[characterName]?.lastSummarizedFloor || 0;
    }

    function setLastSummarizedFloor(characterName, floor) {
        if (!characterName || characterName === '未知角色') return;
        if (!characterProgress[characterName]) {
            characterProgress[characterName] = {};
        }
        characterProgress[characterName].lastSummarizedFloor = floor;
        saveCharacterProgress();
    }

    // ========== Toast 通知 ==========
    function showToast(message, type = 'info') {
        if (typeof toastr !== 'undefined') {
            toastr[type](message, '大小总结');
        } else {
            console.log(`[${type}] ${message}`);
        }
    }

    // ========== 配置获取 ==========
    function getConfig() {
        const characterName = WBAP.summary?.getCurrentCharacterName?.() || '未知角色';
        return {
            ...summaryConfig,
            lastSummarizedFloor: getLastSummarizedFloor(characterName)
        };
    }

    function getApiConfig() {
        return {
            apiChannel: summaryConfig.apiChannel || 'direct', // 新增：传递API通道配置
            apiUrl: summaryConfig.apiUrl,
            apiKey: summaryConfig.apiKey,
            model: summaryConfig.model,
            maxTokens: summaryConfig.maxTokens || 2048,
            temperature: summaryConfig.temperature !== undefined ? summaryConfig.temperature : 0.7,
            timeout: summaryConfig.timeout || 120,
            topP: summaryConfig.topP,
            maxRetries: summaryConfig.maxRetries !== undefined ? summaryConfig.maxRetries : 3,
            presencePenalty: summaryConfig.presencePenalty,
            frequencyPenalty: summaryConfig.frequencyPenalty
        };
    }

    function updateLastSummarizedFloor(floor) {
        const characterName = WBAP.summary?.getCurrentCharacterName?.() || '未知角色';
        setLastSummarizedFloor(characterName, floor);

        const lastFloorEl = document.getElementById('wbap-auto-summary-last-floor');
        if (lastFloorEl) {
            lastFloorEl.textContent = floor;
        }

        // 同时更新标题栏的显示
        const headerLastFloorEl = document.getElementById('wbap-summary-header-last-floor');
        if (headerLastFloorEl) {
            headerLastFloorEl.textContent = floor;
        }

        Logger.log(`[自动总结] 角色 ${characterName} 进度已更新到第 ${floor} 楼`);
        Logger.log(`[自动总结] 当前角色进度:`, JSON.stringify(characterProgress[characterName], null, 2));
    }

    /**
     * 更新远征按钮状态
     */
    function updateExpeditionButtonUI(isRunning, isPaused) {
        const btn = document.getElementById('wbap-expedition-btn');
        if (!btn) return;

        if (isRunning) {
            btn.dataset.state = 'running';
            btn.innerHTML = '<i class="fa-solid fa-stop-circle"></i><span>停止远征</span>';
        } else if (isPaused) {
            btn.dataset.state = 'paused';
            btn.innerHTML = '<i class="fa-solid fa-play-circle"></i><span>继续远征</span>';
        } else {
            btn.dataset.state = 'idle';
            btn.innerHTML = '<i class="fa-solid fa-flag-checkered"></i><span>开始远征</span>';
        }
    }

    /**
     * 显示预览模态框
     */
    function showPreviewModal(startFloor, endFloor, messages, callback) {
        Logger.log('[预览模态框] 开始显示预览');
        const modal = document.getElementById('wbap-summary-preview-modal');
        if (!modal) {
            Logger.error('[预览模态框] 未找到模态框元素 #wbap-summary-preview-modal');
            return;
        }
        Logger.log('[预览模态框] 找到模态框元素');

        // 更新楼层范围
        const rangeEl = document.getElementById('wbap-preview-range');
        if (rangeEl) rangeEl.textContent = `${startFloor}-${endFloor}`;

        // 更新用户/角色标签
        const context = SillyTavern.getContext();
        const userLabel = document.getElementById('wbap-preview-user-label');
        const charLabel = document.getElementById('wbap-preview-char-label');
        if (userLabel) userLabel.textContent = context.name1 || '用户消息';
        if (charLabel) charLabel.textContent = context.name2 || 'AI 回复';

        // 生成消息列表（默认折叠）
        const messagesContainer = document.getElementById('wbap-preview-messages');
        if (messagesContainer) {
            messagesContainer.innerHTML = messages.map(msg => `
                <details class="wbap-preview-message" data-author-type="${msg.authorType}">
                    <summary>【第 ${msg.floor} 楼】 ${escapeHtml(msg.author)}</summary>
                    <div class="wbap-preview-message-content">
                        <textarea data-floor="${msg.floor}">${escapeHtml(msg.content)}</textarea>
                    </div>
                </details>
            `).join('');
        }

        // 添加全部展开/折叠按钮
        const expandAllBtn = document.getElementById('wbap-preview-expand-all');
        const collapseAllBtn = document.getElementById('wbap-preview-collapse-all');

        if (expandAllBtn) {
            expandAllBtn.onclick = () => {
                messagesContainer.querySelectorAll('details').forEach(detail => detail.open = true);
            };
        }

        if (collapseAllBtn) {
            collapseAllBtn.onclick = () => {
                messagesContainer.querySelectorAll('details').forEach(detail => detail.open = false);
            };
        }

        // 绑定过滤事件
        const userCheckbox = document.getElementById('wbap-preview-include-user');
        const charCheckbox = document.getElementById('wbap-preview-include-char');

        const updateVisibility = () => {
            const includeUser = userCheckbox?.checked ?? true;
            const includeChar = charCheckbox?.checked ?? true;
            messagesContainer.querySelectorAll('.wbap-preview-message').forEach(item => {
                const authorType = item.dataset.authorType;
                const shouldHide = (authorType === 'user' && !includeUser) || (authorType === 'char' && !includeChar);
                item.hidden = shouldHide;
            });
        };

        if (userCheckbox) userCheckbox.onchange = updateVisibility;
        if (charCheckbox) charCheckbox.onchange = updateVisibility;

        // 绑定按钮事件
        const confirmBtn = document.getElementById('wbap-preview-confirm');
        const cancelBtn = document.getElementById('wbap-preview-cancel');
        const closeBtn = document.getElementById('wbap-preview-close');

        const closeModal = () => {
            modal.classList.add('wbap-hidden');
        };

        const handleConfirm = () => {
            // 收集编辑后的消息
            const editedMessages = Array.from(messagesContainer.querySelectorAll('textarea')).map(textarea => {
                const floor = parseInt(textarea.dataset.floor, 10);
                const originalMsg = messages.find(m => m.floor === floor);
                return {
                    ...originalMsg,
                    content: textarea.value
                };
            });
            closeModal(); // 关闭消息预览面板
            callback(true, editedMessages);
        };

        const handleCancel = () => {
            closeModal();
            callback(false, null);
        };

        if (confirmBtn) {
            confirmBtn.onclick = handleConfirm;
        }
        if (cancelBtn) {
            cancelBtn.onclick = handleCancel;
        }
        if (closeBtn) {
            closeBtn.onclick = handleCancel;
        }

        // 显示模态框
        Logger.log('[预览模态框] 移除 wbap-hidden 类，显示模态框');
        modal.classList.remove('wbap-hidden');

        // 强制重绘，确保显示
        modal.style.display = 'flex';
        modal.style.visibility = 'visible';
        modal.style.opacity = '1';
        modal.style.pointerEvents = 'auto';
        modal.style.zIndex = '2147483647';

        Logger.log('[预览模态框] 模态框已显示，display:', modal.style.display, 'visibility:', modal.style.visibility, 'opacity:', modal.style.opacity);
    }

    function escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    /**
     * 显示总结结果预览面板
     */
    function showSummaryResultModal(startFloor, endFloor, summary, editedMessages, callback) {
        Logger.log('[总结结果] 显示预览面板');
        const modal = document.getElementById('wbap-summary-result-modal');
        if (!modal) {
            Logger.error('[总结结果] 未找到模态框元素');
            return;
        }

        // 更新楼层范围
        const rangeEl = document.getElementById('wbap-result-range');
        if (rangeEl) rangeEl.textContent = `${startFloor}-${endFloor}`;

        // 显示总结内容
        const summaryTextarea = document.getElementById('wbap-result-summary');
        if (summaryTextarea) summaryTextarea.value = summary;

        // 绑定按钮事件
        const confirmBtn = document.getElementById('wbap-result-confirm');
        const regenerateBtn = document.getElementById('wbap-result-regenerate');
        const cancelBtn = document.getElementById('wbap-result-cancel');
        const closeBtn = document.getElementById('wbap-result-close');

        const closeModal = () => {
            modal.classList.add('wbap-hidden');
        };

        const handleConfirm = () => {
            const finalSummary = summaryTextarea.value;
            closeModal(); // 关闭总结结果面板
            callback(true, finalSummary);
        };

        const handleRegenerate = async () => {
            // 禁用按钮和文本框
            if (regenerateBtn) {
                regenerateBtn.disabled = true;
                regenerateBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> 重新生成中...';
            }
            if (summaryTextarea) {
                summaryTextarea.disabled = true;
                summaryTextarea.value = '正在重新生成，请稍候...';
            }

            try {
                // 使用编辑后的消息重新生成
                const chatContent = WBAP.summary.formatMessagesAsText(editedMessages);
                const config = WBAP.summaryUI.getConfig();
                const apiConfig = WBAP.summaryUI.getApiConfig();
                const userPrompt = config.smallPrompt || WBAP.summary.DEFAULT_SMALL_SUMMARY_PROMPT;
                const prompt = userPrompt.replace('{chat_content}', chatContent);

                const newSummary = await WBAP.callAI(
                    apiConfig?.model,
                    prompt,
                    '',
                    apiConfig
                );

                if (newSummary) {
                    if (summaryTextarea) summaryTextarea.value = newSummary;
                    showToast('重新生成成功！', 'success');
                } else {
                    if (summaryTextarea) summaryTextarea.value = summary; // 恢复原内容
                    showToast('重新生成失败：AI返回空结果', 'error');
                }
            } catch (e) {
                Logger.error('[总结结果] 重新生成失败:', e);
                if (summaryTextarea) summaryTextarea.value = summary; // 恢复原内容
                showToast(`重新生成失败: ${e.message}`, 'error');
            } finally {
                // 恢复按钮状态
                if (regenerateBtn) {
                    regenerateBtn.disabled = false;
                    regenerateBtn.innerHTML = '<i class="fa-solid fa-rotate"></i> 重新生成';
                }
                if (summaryTextarea) {
                    summaryTextarea.disabled = false;
                }
                // 面板保持打开，用户可以继续编辑或再次重新生成
            }
        };

        const handleCancel = () => {
            closeModal();
            callback(false, null);
        };

        if (confirmBtn) {
            confirmBtn.onclick = handleConfirm;
        }
        if (regenerateBtn) {
            regenerateBtn.onclick = handleRegenerate;
        }
        if (cancelBtn) {
            cancelBtn.onclick = handleCancel;
        }
        if (closeBtn) {
            closeBtn.onclick = handleCancel;
        }

        // 显示模态框
        Logger.log('[总结结果] 移除 wbap-hidden 类，显示模态框');
        modal.classList.remove('wbap-hidden');

        // 强制设置显示样式
        modal.style.display = 'flex';
        modal.style.visibility = 'visible';
        modal.style.opacity = '1';
        modal.style.pointerEvents = 'auto';
        modal.style.zIndex = '2147483647';

        Logger.log('[总结结果] 模态框已显示，display:', modal.style.display, 'visibility:', modal.style.visibility);
    }

    // ========== 归档管理 ==========

    /**
     * 处理归档当前总结
     */
    async function handleArchiveCurrent() {
        if (!confirm('确定要归档当前所有大小总结条目吗？\n\n归档后，所有条目将合并为一个归档条目并禁用。\n您可以随时回溯到此归档。')) {
            return;
        }

        const btn = document.getElementById('wbap-archive-current-btn');
        if (btn) {
            btn.disabled = true;
            btn.textContent = '归档中...';
        }

        try {
            const result = await WBAP.summary.archiveCurrentSummaries();
            if (result.success) {
                await refreshArchiveList();
                await refreshSummaryList();
            }
        } catch (error) {
            Logger.error('[归档管理] 归档失败:', error);
            showToast(`归档失败: ${error.message}`, 'error');
        } finally {
            if (btn) {
                btn.disabled = false;
                btn.innerHTML = '<i class="fa-solid fa-archive"></i> 归档当前';
            }
        }
    }

    /**
     * 处理回溯归档
     */
    async function handleRestoreArchive() {
        const selector = document.getElementById('wbap-archive-selector');
        if (!selector || !selector.value) {
            showToast('请先选择要回溯的归档', 'warning');
            return;
        }

        const archiveUid = parseInt(selector.value, 10);
        const selectedOption = selector.options[selector.selectedIndex];
        const archiveName = selectedOption.text;

        if (!confirm(`确定要回溯到以下归档吗？\n\n${archiveName}\n\n当前的总结条目（如果有）将被自动归档。`)) {
            return;
        }

        const btn = document.getElementById('wbap-restore-archive-btn');
        if (btn) {
            btn.disabled = true;
            btn.textContent = '回溯中...';
        }

        try {
            const result = await WBAP.summary.restoreArchivedSummaries(archiveUid);
            if (result.success) {
                await refreshArchiveList();
                await refreshSummaryList();
                await recalculateLastSummarizedFloor();
                updatePanelInfo();
            }
        } catch (error) {
            Logger.error('[归档管理] 回溯失败:', error);
            showToast(`回溯失败: ${error.message}`, 'error');
        } finally {
            if (btn) {
                btn.disabled = false;
                btn.innerHTML = '<i class="fa-solid fa-clock-rotate-left"></i> 回溯选中';
            }
        }
    }

    /**
     * 刷新归档列表
     */
    async function refreshArchiveList() {
        const selector = document.getElementById('wbap-archive-selector');
        if (!selector) {
            Logger.warn('[归档管理] 未找到归档选择器');
            return;
        }

        try {
            const archives = await WBAP.summary.getArchivedSummaries();

            selector.innerHTML = '';

            if (archives.length === 0) {
                const option = document.createElement('option');
                option.value = '';
                option.textContent = '暂无归档';
                selector.appendChild(option);
                selector.disabled = true;
            } else {
                const placeholder = document.createElement('option');
                placeholder.value = '';
                placeholder.textContent = '请选择归档...';
                selector.appendChild(placeholder);

                archives.forEach(archive => {
                    const option = document.createElement('option');
                    option.value = archive.uid;
                    option.textContent = archive.displayName;
                    selector.appendChild(option);
                });

                selector.disabled = false;
            }

            Logger.log(`[归档管理] 已加载 ${archives.length} 个归档`);
        } catch (error) {
            Logger.error('[归档管理] 刷新归档列表失败:', error);
            selector.innerHTML = '<option value="">加载失败</option>';
            selector.disabled = true;
        }
    }

    /**
     * 绑定归档管理事件
     */
    function bindArchiveManagementEvents() {
        // 检查是否已经绑定过
        const archiveBtn = document.getElementById('wbap-archive-current-btn');
        if (!archiveBtn) {
            Logger.warn('[归档管理] 未找到归档按钮');
            return;
        }

        // 避免重复绑定
        if (archiveBtn.dataset.bound === 'true') {
            return;
        }

        // 归档当前按钮
        archiveBtn.addEventListener('click', handleArchiveCurrent);
        archiveBtn.dataset.bound = 'true';

        // 回溯按钮
        const restoreBtn = document.getElementById('wbap-restore-archive-btn');
        if (restoreBtn) {
            restoreBtn.addEventListener('click', handleRestoreArchive);
            restoreBtn.dataset.bound = 'true';
        }

        // 刷新归档列表按钮
        const refreshBtn = document.getElementById('wbap-refresh-archive-list-btn');
        if (refreshBtn) {
            refreshBtn.addEventListener('click', refreshArchiveList);
            refreshBtn.dataset.bound = 'true';
        }

        Logger.log('[归档管理] 事件已绑定');
    }

    // ========== 导出 ==========
    window.WBAP.summaryUI = {
        init: initSummaryUI,
        open: openSummaryPanel,
        close: closeSummaryPanel,
        refresh: refreshSummaryList,
        getConfig: getConfig,
        getApiConfig: getApiConfig,
        updateLastSummarizedFloor: updateLastSummarizedFloor,
        showPreviewModal: showPreviewModal,
        showSummaryResultModal: showSummaryResultModal,
        getBookConfig: () => ({
            scanDepth: summaryConfig.bookScanDepth || 0,
            insertionOrder: summaryConfig.bookInsertionOrder !== undefined ? summaryConfig.bookInsertionOrder : 4,
            depth: summaryConfig.bookDepth || 10
        })
    };

    Logger.log('Summary UI 模块已加载');

})();
