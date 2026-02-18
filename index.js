/**
 * 笔者之脑 - 主入口（模块化版）
 * @version 1.4.0
 * @author 加藤惠哒！/可乐，
 */

(() => {
    'use strict';

    // 1. 创建全局命名空间 + Logger
    window.WBAP = window.WBAP || {};

    const Logger = {
        prefix: '[世界书AI处理器]',
        log: (...args) => console.log(Logger.prefix, ...args),
        debug: (...args) => console.debug(Logger.prefix, ...args),
        warn: (...args) => console.warn(Logger.prefix, ...args),
        error: (...args) => console.error(Logger.prefix, ...args)
    };
    window.WBAP.Logger = Logger;

    Logger.log('主脚本 index.js 开始执行');

    // 0. 确保移动端视口正确（移动浏览器未必默认提供）
    function ensureViewportMeta() {
        const existing = document.querySelector('meta[name="viewport"]');
        const desired = 'width=device-width, initial-scale=1, maximum-scale=1, viewport-fit=cover';
        if (!existing) {
            const meta = document.createElement('meta');
            meta.name = 'viewport';
            meta.content = desired;
            document.head.appendChild(meta);
            Logger.log('已注入 viewport meta 以适配移动端');
        } else if (!/width\s*=\s*device-width/i.test(existing.content)) {
            existing.content = desired;
            Logger.log('已修正 viewport meta 以适配移动端');
        }
    }
    ensureViewportMeta();
    // 移除全局overflow限制 - 不应该影响整个页面
    // document.documentElement.classList.add('wbap-no-overflow');
    // document.body.classList.add('wbap-no-overflow');
    // document.documentElement.style.overflowX = 'hidden';
    // document.body.style.overflowX = 'hidden';

    // 2. 自动获取插件的基路径（兼容空格/编码变体）
    function getBasePath() {
        const normalize = (src) => {
            if (!src) return null;
            if (src.includes('/scripts/extensions/third-party/writer-brianer/')) {
                return '/scripts/extensions/third-party/writer-brianer/modules/';
            }
            if (src.includes('/scripts/extensions/third-party/writer%20brianer/')) {
                return '/scripts/extensions/third-party/writer%20brianer/modules/';
            }
            if (src.includes('/scripts/extensions/third-party/writer brianer/')) {
                return '/scripts/extensions/third-party/writer brianer/modules/';
            }
            return null;
        };

        // 优先使用当前脚本标签，避免重复扫描 DOM
        const currentPath = normalize(document.currentScript?.src);
        if (currentPath) return currentPath;

        const scriptTags = document.getElementsByTagName('script');
        for (let i = 0; i < scriptTags.length; i++) {
            const detected = normalize(scriptTags[i].src);
            if (detected) return detected;
        }

        Logger.warn('无法通过 script 标签自动检测路径，将使用默认路径');
        return '/scripts/extensions/third-party/writer-brianer/modules/';
    }

    const EXTENSION_BASE_PATH = getBasePath();
    // 让后续模块可获取已探测的模块路径，避免重复推测
    window.WBAP.MODULE_BASE_PATH = EXTENSION_BASE_PATH;
    Logger.log(`插件模块基路径 ${EXTENSION_BASE_PATH}`);

    // 3. 要加载的脚本（顺序很重要）
    const SCRIPTS_TO_LOAD = [
        'character_manager.js', // 必须最先加载
        'config.js', // config.js 必须在 persistent_storage.js 之前，因为后者依赖 createDefaultMainConfig
        'persistent_storage.js', // 持久化存储模块
        'storage_ui.js', // 存储管理UI
        'diagnostic.js', // 诊断工具
        'ui_templates.js',
        'api.js',
        'stream_utils.js',
        'prompt_manager.js',
        'processing.js',
        'dom_utils.js', // 通用工具模块
        'event_manager.js',
        'graph_engine.js',
        'multi_dim_graph.js', // 多维知识图谱引擎
        'graph_view.js',
        'ui_logic.js',
        'optimization.js',
        'tiangang.js',
        'memory_manager.js',
        // 表格模块已废除
        // 'table_manager.js',
        // 'table_lorebook_sync.js',
        // 'table_ai.js',
        // 'table_ui.js',
        'cabinet.js',
        'entry_selector.js',
        'response_optimizer.js', // 正文优化模块
        'pedsa_engine.js', // PEDSA-JS 纯JS引擎（一阶段）
        'pedsa_wasm_adapter.js', // PEDSA WASM适配器（二阶段，替代Rust服务）
        'super_memory.js', // 超级记忆模块
        'table_display.js', // 表格展示模块
        'function_calling.js', // 函数调用模块（PEDSA AI工具）
        'summary.js', // 大小总结模块
        'summary_ui.js', // 大小总结UI
        'interceptor.js'
    ];

    // 4. 动态、顺序加载脚本
    function loadScripts(scripts, basePath, callback) {
        let index = 0;
        function loadNext() {
            if (index >= scripts.length) {
                if (callback) callback();
                return;
            }
            const scriptName = scripts[index];
            const script = document.createElement('script');
            script.src = basePath + scriptName;
            script.onload = () => {
                Logger.log(`脚本 ${scriptName} 加载成功`);
                index++;
                loadNext();
            };
            script.onerror = () => {
                Logger.error(`脚本 ${scriptName} 加载失败，请检查路径 ${script.src}`);
                index++; // 避免因单个模块加载失败导致初始化链路卡死
                loadNext();
            };
            document.body.appendChild(script);
        }
        loadNext();
    }

    // 5. 插件主初始化函数
    async function initPlugin() {
        Logger.log('所有模块加载完毕，开始初始化插件核心...');

        await WBAP.loadConfig(); // loadConfig 会处理角色初始化
        await WBAP.PromptManager.initialize();

        // 【修复】基础提示词加载后，重新验证 selectedPromptIndex
        // 迁移时 basePrompts 尚未加载，索引可能指向 globalMainPrompts 而非 combinedPrompts
        try {
            const combinedPrompts = WBAP.PromptManager.getCombinedPrompts();
            if (combinedPrompts.length > 0 && WBAP.CharacterManager) {
                const cfg = WBAP.CharacterManager.getCurrentCharacterConfig();
                if (cfg && cfg.promptBindings) {
                    const idx = cfg.selectedPromptIndex || 0;
                    const currentPrompt = combinedPrompts[idx];
                    const currentName = currentPrompt?.name || '';
                    const hasBound = Array.isArray(currentPrompt?.boundEndpointIds) && currentPrompt.boundEndpointIds.filter(Boolean).length > 0;
                    const hasConfigBound = currentName && Array.isArray(cfg.promptBindings[currentName]) && cfg.promptBindings[currentName].filter(Boolean).length > 0;

                    if (!hasBound && !hasConfigBound) {
                        // 当前索引指向的提示词没有绑定，尝试找到有绑定的提示词
                        let fixed = false;
                        // 先查 promptBindings
                        for (const [name, ids] of Object.entries(cfg.promptBindings)) {
                            if (Array.isArray(ids) && ids.filter(Boolean).length > 0) {
                                const correctIdx = combinedPrompts.findIndex(p => p.name === name);
                                if (correctIdx >= 0 && correctIdx !== idx) {
                                    Logger.log(`[初始化] 修正 selectedPromptIndex: ${idx} → ${correctIdx} (提示词「${name}」)`);
                                    cfg.selectedPromptIndex = correctIdx;
                                    WBAP.saveConfig();
                                    fixed = true;
                                    break;
                                }
                            }
                        }
                        // 再扫描提示词对象上的 boundEndpointIds
                        if (!fixed) {
                            for (let i = 0; i < combinedPrompts.length; i++) {
                                const p = combinedPrompts[i];
                                if (Array.isArray(p.boundEndpointIds) && p.boundEndpointIds.filter(Boolean).length > 0 && i !== idx) {
                                    Logger.log(`[初始化] 修正 selectedPromptIndex: ${idx} → ${i} (提示词对象「${p.name}」)`);
                                    cfg.selectedPromptIndex = i;
                                    WBAP.saveConfig();
                                    break;
                                }
                            }
                        }
                    }
                }
            }
        } catch (e) {
            Logger.warn('[初始化] selectedPromptIndex 验证失败:', e);
        }

        WBAP.EventManager.initialize();
        if (WBAP.Optimization && typeof WBAP.Optimization.updateFloatingButtonVisibility === 'function') {
            WBAP.Optimization.updateFloatingButtonVisibility(true, 0);
        }

        // 核心模块加载完成后，注入 UI
        if (WBAP.UI && typeof WBAP.UI.injectUI === 'function') {
            WBAP.UI.injectUI();
        }

        // 记忆模块（独立配置）
        if (WBAP.MemoryModule && typeof WBAP.MemoryModule.init === 'function') {
            WBAP.MemoryModule.init();
        }

        // PEDSA WASM 适配器初始化
        if (WBAP.PedsaWasmAdapter && typeof WBAP.PedsaWasmAdapter.init === 'function') {
            await WBAP.PedsaWasmAdapter.init();
        }

        // 注册到 SillyTavern 菜单
        if (typeof registerExtensionHelper === 'function') {
            registerExtensionHelper(WBAP.EXTENSION_NAME, {
                label: '笔者之脑',
                callback: () => {
                    const panel = document.getElementById('wbap-panel');
                    if (panel) panel.classList.toggle('open');
                }
            });
            Logger.log('菜单入口已注册');
        } else {
            Logger.warn('registerExtensionHelper 不可用，使用降级方式添加按钮');
            const extBar = document.querySelector('#extensions_settings .extension_list');
            if (extBar && !extBar.querySelector('.wbap-ext-btn')) {
                const li = document.createElement('li');
                li.textContent = '笔者之脑';
                li.className = 'wbap-ext-btn';
                li.style.cursor = 'pointer';
                li.onclick = () => document.getElementById('wbap-panel')?.classList.toggle('open');
                extBar.appendChild(li);
            }
        }

        // 初始化新的消息拦截器
        WBAP.initializeInterceptor();

        // 更新正文优化悬浮球可见性（配置加载完成后）
        if (WBAP.ResponseOptimizer && typeof WBAP.ResponseOptimizer.updateFloatingButtonVisibility === 'function') {
            WBAP.ResponseOptimizer.updateFloatingButtonVisibility();
        }

        // 预连接和延迟测量
        const endpoints = WBAP.config?.selectiveMode?.apiEndpoints || [];
        if (WBAP.setupPreconnect) WBAP.setupPreconnect(endpoints);
        if (WBAP.refreshAllLatencies) WBAP.refreshAllLatencies(endpoints);

        // 初始化大小总结UI
        if (WBAP.summaryUI && typeof WBAP.summaryUI.init === 'function') {
            WBAP.summaryUI.init();
        }

        // 初始化表格展示模块
        if (WBAP.TableDisplay && typeof WBAP.TableDisplay.init === 'function') {
            WBAP.TableDisplay.init();
        }

        // 全局处理函数（用于面板按钮）
        window.wbapProcessBook = async function (bookName) {
            const { config, runSelectiveModeProcessing } = WBAP;

            // 统一使用自选模式处理，旧的 original 模式已废弃
            if (config.processingMode === 'original') {
                Logger.warn('检测到旧的 original 模式配置，已自动切换为自选模式');
            }

            const userInput = prompt('请输入您想让 AI 分析的意图或问题（将与世界书条目一同处理）', '');
            if (userInput === null) return; // 用户取消

            try {
                const context = WBAP.getRecentContext(WBAP.getCurrentChatContext(), config.contextRounds);
                const analysisResult = await runSelectiveModeProcessing(userInput, bookName, context);

                // 如果启用了剧情优化，结果处理逻辑会在 processing.js 内部转向优化面板，
                // 但如果是 wbapProcessBook 这种旧的手动调用入口，可能需要兼容。
                // 暂时保持原样，如果 processing.js 返回了结果，说明优化被禁用或者是直接返回模式。

                if (analysisResult) {
                    const chatInput = document.getElementById('send_textarea');
                    if (chatInput) {
                        chatInput.value = analysisResult;
                        chatInput.dispatchEvent(new Event('input', { bubbles: true }));
                        alert('处理完成，结果已填入聊天框');
                    }
                }
            } catch (e) {
                Logger.error('自选读取处理失败', e);
                alert('处理失败: ' + e.message);
            }
        };
        Logger.log('插件初始化成功');
    }

    // 6. 等待 DOM 加载完成后，加载所有脚本并启动插件
    function start() {
        loadScripts(SCRIPTS_TO_LOAD, EXTENSION_BASE_PATH, initPlugin);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', start);
    } else {
        start();
    }
})();
