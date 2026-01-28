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
    document.documentElement.classList.add('wbap-no-overflow');
    document.body.classList.add('wbap-no-overflow');
    document.documentElement.style.overflowX = 'hidden';
    document.body.style.overflowX = 'hidden';

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
        'config.js',
        'ui_templates.js',
        'api.js',
        'stream_utils.js',
        'prompt_manager.js',
        'processing.js',
        'dom_utils.js', // 通用工具模块
        'event_manager.js',
        'ui_logic.js',
        'optimization.js',
        'tiangang.js',
        'memory_manager.js',
        'cabinet.js',
        'entry_selector.js',
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

        // 预连接和延迟测量
        const endpoints = WBAP.config?.selectiveMode?.apiEndpoints || [];
        if (WBAP.setupPreconnect) WBAP.setupPreconnect(endpoints);
        if (WBAP.refreshAllLatencies) WBAP.refreshAllLatencies(endpoints);

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
