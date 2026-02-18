// modules/memory_manager.js
(function () {
    'use strict';

    window.WBAP = window.WBAP || {};
    const Logger = WBAP.Logger || console;
    const TAG = '[MemoryModule]';

    const MEMORY_VERSION = 2;
    const DEFAULT_PRESET_ID = 'memory-default';
    // 双提示词默认ID
    const DEFAULT_TABLE_PRESET_ID = 'memory-table-default';
    const DEFAULT_SUMMARY_PRESET_ID = 'memory-summary-default';
    const FALLBACK_SYSTEM_PROMPT = '[记忆模块默认提示词未加载，请检查 prompts/memory_source.json]';
    const FALLBACK_USER_PROMPT = `<数据注入区>
<世界书内容>
{worldbook_content}
</世界书内容>

<表格内容>
{table_content}
</表格内容>

<前文内容>
{context}
</前文内容>

[核心处理内容]
{user_input}
[/核心处理内容]
</数据注入区>`;

    const DEFAULT_VARIABLES = { sulv1: '0.6' };

    // LRU缓存实现 - 防止内存无限增长
    class LRUCache {
        constructor(maxSize = 50) {
            this.cache = new Map();
            this.maxSize = maxSize;
        }

        get(key) {
            if (!this.cache.has(key)) return undefined;
            const value = this.cache.get(key);
            // 移到最后（最近使用）
            this.cache.delete(key);
            this.cache.set(key, value);
            return value;
        }

        set(key, value) {
            if (this.cache.has(key)) {
                this.cache.delete(key);
            } else if (this.cache.size >= this.maxSize) {
                // 删除最旧的项（第一个）
                const firstKey = this.cache.keys().next().value;
                this.cache.delete(firstKey);
            }
            this.cache.set(key, value);
        }

        has(key) {
            return this.cache.has(key);
        }

        clear() {
            this.cache.clear();
        }

        get size() {
            return this.cache.size;
        }
    }

    const CATEGORY_CACHE = new LRUCache(50);  // 最多缓存50个世界书的分类
    const WORLDBOOK_TYPE_CACHE = new LRUCache(100);  // 最多缓存100个世界书的类型检测结果
    let defaultPresetPromise = null;
    let defaultTablePresetPromise = null;
    let defaultSummaryPresetPromise = null;

    function createDefaultMemoryEndpoint() {
        if (WBAP.createDefaultMemoryEndpoint) return WBAP.createDefaultMemoryEndpoint();

        // 计算下一个编号
        const pool = getGlobalPools()?.memory || { apiEndpoints: [] };
        const existingNames = (pool.apiEndpoints || []).map(ep => ep.name || '');
        let nextNum = 1;
        while (existingNames.includes(`记忆API-${nextNum}`)) {
            nextNum++;
        }

        return {
            id: `mem_ep_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
            name: `记忆API-${nextNum}`,
            apiUrl: '',
            apiKey: '',
            model: '',
            maxTokens: 2000,
            temperature: 0.7,
            topP: 1,
            presencePenalty: 0,
            frequencyPenalty: 0,
            timeout: 60
        };
    }

    function getGlobalPools() {
        return WBAP.getGlobalPools ? WBAP.getGlobalPools() : (WBAP.mainConfig?.globalPools || {});
    }

    function getMemoryPool() {
        const pools = getGlobalPools();
        if (!pools.memory) pools.memory = { apiEndpoints: [], presets: [] };
        if (!Array.isArray(pools.memory.apiEndpoints)) pools.memory.apiEndpoints = [];
        if (!Array.isArray(pools.memory.presets)) pools.memory.presets = [];
        if (pools.memory.apiEndpoints.length === 0) {
            pools.memory.apiEndpoints.push(createDefaultMemoryEndpoint());
            saveConfig();
        }
        return pools.memory;
    }

    function safeBtoa(str = '') {
        try {
            return btoa(unescape(encodeURIComponent(str)));
        } catch (e) {
            try {
                const bytes = new TextEncoder().encode(str);
                let binary = '';
                bytes.forEach(b => { binary += String.fromCharCode(b); });
                return btoa(binary);
            } catch (_) {
                return btoa(String(str));
            }
        }
    }

    function getCharacterConfig() {
        return WBAP.CharacterManager?.getCurrentCharacterConfig?.() || WBAP.config || {};
    }

    function saveConfig() {
        if (typeof WBAP.saveConfig === 'function') WBAP.saveConfig();
    }

    function buildFallbackPreset() {
        return {
            id: DEFAULT_PRESET_ID,
            name: '记忆管理1.13',
            description: '记忆模块默认提示词',
            systemPrompt: FALLBACK_SYSTEM_PROMPT,
            userPrompt: FALLBACK_USER_PROMPT,
            variables: { ...DEFAULT_VARIABLES }
        };
    }

    // 构建基础路径
    function getPromptsBasePath() {
        if (window.WBAP && window.WBAP.MODULE_BASE_PATH) {
            return window.WBAP.MODULE_BASE_PATH.replace(/modules\/?$/, 'prompts/');
        }
        const scriptPath = document.currentScript?.src || '';
        if (scriptPath.includes('/modules/')) {
            return scriptPath.substring(0, scriptPath.lastIndexOf('/modules/')) + '/prompts/';
        }
        return '/scripts/extensions/third-party/writer brianer/prompts/';
    }

    // 加载指定的提示词文件
    async function loadPresetFromFile(filename, fallbackId, fallbackName) {
        try {
            const url = getPromptsBasePath() + filename;
            Logger.log(TAG, 'Loading preset from:', url);
            const res = await fetch(url);
            if (!res.ok) throw new Error(`fetch failed: ${res.status}`);
            const data = await res.json();
            const first = Array.isArray(data) ? data[0] : data;
            if (!first) return null;
            return {
                id: first.id || fallbackId,
                name: first.name || fallbackName,
                description: first.description || '',
                systemPrompt: first.systemPrompt || FALLBACK_SYSTEM_PROMPT,
                userPrompt: first.userPrompt || FALLBACK_USER_PROMPT,
                variables: { ...DEFAULT_VARIABLES, ...(first.variables || {}) }
            };
        } catch (e) {
            Logger.warn(TAG, `preset load failed: ${filename}`, e);
            return null;
        }
    }

    // 加载旧版默认提示词（兼容）
    async function loadDefaultPresetFromFile() {
        return loadPresetFromFile('memory_source.json', DEFAULT_PRESET_ID, '记忆管理1.13');
    }

    // 加载表格书默认提示词
    async function loadTablePresetFromFile() {
        return loadPresetFromFile('memory_table.json', DEFAULT_TABLE_PRESET_ID, '表格书提示词 v1.0');
    }

    // 加载总结书默认提示词
    async function loadSummaryPresetFromFile() {
        return loadPresetFromFile('memory_summary.json', DEFAULT_SUMMARY_PRESET_ID, '总结书提示词 v1.0');
    }

    // 确保单个预设存在于池中
    function ensurePresetInPool(pool, preset) {
        if (!preset) return null;
        let existing = pool.presets.find(p => p.id === preset.id);
        if (!existing) {
            pool.presets.push(preset);
            existing = preset;
            return { preset: existing, mutated: true };
        } else if (!existing.systemPrompt && preset.systemPrompt) {
            Object.assign(existing, preset);
            return { preset: existing, mutated: true };
        }
        // 检测默认预设的内容是否已更新（通过比较 systemPrompt 哈希）
        // 仅对内置默认预设生效，不影响用户自定义预设
        const isBuiltinPreset = [DEFAULT_PRESET_ID, DEFAULT_TABLE_PRESET_ID, DEFAULT_SUMMARY_PRESET_ID].includes(preset.id);
        if (isBuiltinPreset && existing.systemPrompt && preset.systemPrompt && existing.systemPrompt !== preset.systemPrompt) {
            Logger.log(TAG, `内置预设 ${preset.id} 内容已更新，自动同步`);
            Object.assign(existing, preset);
            return { preset: existing, mutated: true };
        }
        return { preset: existing, mutated: false };
    }

    async function ensureDefaultPreset(memCfg) {
        const pool = getMemoryPool();
        let mutated = false;

        // 1. 加载旧版默认提示词（兼容）
        if (!defaultPresetPromise) defaultPresetPromise = loadDefaultPresetFromFile();
        let preset = await defaultPresetPromise;
        if (!preset) preset = buildFallbackPreset();
        const oldResult = ensurePresetInPool(pool, preset);
        if (oldResult?.mutated) mutated = true;

        // 2. 加载表格书默认提示词
        if (!defaultTablePresetPromise) defaultTablePresetPromise = loadTablePresetFromFile();
        const tablePreset = await defaultTablePresetPromise;
        if (tablePreset) {
            const tableResult = ensurePresetInPool(pool, tablePreset);
            if (tableResult?.mutated) mutated = true;
        }

        // 3. 加载总结书默认提示词
        if (!defaultSummaryPresetPromise) defaultSummaryPresetPromise = loadSummaryPresetFromFile();
        const summaryPreset = await defaultSummaryPresetPromise;
        if (summaryPreset) {
            const summaryResult = ensurePresetInPool(pool, summaryPreset);
            if (summaryResult?.mutated) mutated = true;
        }

        // 4. 设置默认选中的提示词
        if (memCfg) {
            // 表格书默认使用表格书提示词
            if (!memCfg.tablePresetId || !pool.presets.find(p => p.id === memCfg.tablePresetId)) {
                memCfg.tablePresetId = tablePreset?.id || DEFAULT_TABLE_PRESET_ID;
                mutated = true;
            }
            // 总结书默认使用总结书提示词
            if (!memCfg.summaryPresetId || !pool.presets.find(p => p.id === memCfg.summaryPresetId)) {
                memCfg.summaryPresetId = summaryPreset?.id || DEFAULT_SUMMARY_PRESET_ID;
                mutated = true;
            }
            // 兼容旧版：selectedPresetId 保持不变
            if (!pool.presets.find(p => p.id === memCfg.selectedPresetId)) {
                memCfg.selectedPresetId = oldResult?.preset?.id || preset.id;
                mutated = true;
            }
        }

        if (mutated) saveConfig();
        return oldResult?.preset || preset;
    }

    function ensureMemoryConfig() {
        const cfg = getCharacterConfig();
        if (!cfg.memoryModule || cfg.memoryModule.version !== MEMORY_VERSION) {
            cfg.memoryModule = WBAP.createDefaultMemoryConfig ? WBAP.createDefaultMemoryConfig() : { version: MEMORY_VERSION };
        }
        const mem = cfg.memoryModule;
        mem.version = MEMORY_VERSION;
        if (!Array.isArray(mem.selectedTableBooks)) mem.selectedTableBooks = [];
        if (!Array.isArray(mem.selectedSummaryBooks)) mem.selectedSummaryBooks = [];
        if (!mem.tableCategoryEndpoints) mem.tableCategoryEndpoints = {};
        if (!mem.summaryEndpoints) mem.summaryEndpoints = {};
        if (!mem.tableCategoryLimits) mem.tableCategoryLimits = {};
        if (!mem.summaryCategoryLimits) mem.summaryCategoryLimits = {};
        if (mem.model === undefined) mem.model = '';
        if (!mem.selectedPresetId) mem.selectedPresetId = DEFAULT_PRESET_ID;
        // 双提示词分流：表格书和总结书使用不同的提示词（新用户默认使用专用提示词）
        if (!mem.tablePresetId) mem.tablePresetId = DEFAULT_TABLE_PRESET_ID;
        if (!mem.summaryPresetId) mem.summaryPresetId = DEFAULT_SUMMARY_PRESET_ID;
        cfg.memoryModule = mem;
        return mem;
    }

    function getMemoryEndpoints() {
        const pool = getMemoryPool();
        return Array.isArray(pool.apiEndpoints) ? pool.apiEndpoints : [];
    }

    function findEndpointById(id) {
        if (!id) return null;
        return getMemoryEndpoints().find(ep => ep.id === id) || null;
    }

    async function loadWorldBookMeta(name) {
        try {
            const book = await WBAP.loadWorldBookEntriesByName?.(name);
            return book && book.entries ? book : null;
        } catch (e) {
            Logger.warn(TAG, 'load worldbook meta failed', name, e);
            return null;
        }
    }

    function detectTableWorldBook(entries) {
        if (!entries) return false;
        const contents = Object.values(entries).map(e => e?.content || '').join('\n');
        const hasMarkdownTable = /\|\s*[-:]+\s*\|/.test(contents);
        const hasIndexComment = Object.values(entries).some(e => /Index\s+for\s+/i.test(e?.comment || ''));
        return hasMarkdownTable || hasIndexComment;
    }

    function detectSummaryWorldBook(name = '', entries = {}) {
        if (detectTableWorldBook(entries)) return false;
        const entryList = Object.values(entries || {});
        const keysText = entryList.map(e => Array.isArray(e?.key) ? e.key.join(' ') : '').join(' ');
        const keywordRegex = /summary|记忆|摘要|总结|回顾|总账|总帐|流水|敕史局|memory/i;
        const hasKeywordName = keywordRegex.test(name || '');
        const hasKeywordComment = entryList.some(e => keywordRegex.test(e?.comment || ''));
        const hasKeywordKey = keywordRegex.test(keysText);
        const hasKeyword = hasKeywordName || hasKeywordComment || hasKeywordKey;
        const hasFewEntries = entryList.length > 0 && entryList.length <= 12;
        return hasKeyword && hasFewEntries;
    }

    function getCategoryFromComment(comment = '') {
        // 识别插件生成的总结书条目 - 统一归类为大总结或小总结
        if (comment.endsWith('楼小总结')) {
            return '小总结';
        }
        if (comment.endsWith('楼大总结')) {
            return '大总结';
        }

        // 原有的 Amily 总结书和表格书识别逻辑
        const idx = comment.match(/Index\s+for\s+(.+)/i);
        if (idx) return idx[1].trim();
        const det = comment.match(/Detail:\s*([^-]+)-?/i);
        if (det) return det[1].trim();
        return '未分类';
    }

    function groupEntriesByCategory(entries) {
        const groups = new Map();
        Object.entries(entries || {}).forEach(([uid, entry]) => {
            if (entry?.disable === true) return;
            const cat = getCategoryFromComment(entry?.comment || '');
            if (!groups.has(cat)) groups.set(cat, []);
            groups.get(cat).push(uid);
        });
        return groups;
    }

    async function loadTableCategories(name) {
        if (CATEGORY_CACHE.has(name)) return CATEGORY_CACHE.get(name);
        const book = await loadWorldBookMeta(name);
        if (!book) {
            CATEGORY_CACHE.set(name, []);
            return [];
        }
        const groups = groupEntriesByCategory(book.entries);
        const categories = Array.from(groups.keys());
        CATEGORY_CACHE.set(name, categories);
        return categories;
    }

    async function loadCategoryContent(name, category) {
        const book = await loadWorldBookMeta(name);
        if (!book?.entries) return '';
        const groups = groupEntriesByCategory(book.entries);
        const ids = groups.get(category) || [];
        const parts = [];

        // 对于插件生成的总结书，计算楼层范围
        if (category === '大总结' || category === '小总结') {
            let minFloor = Infinity;
            let maxFloor = -Infinity;
            ids.forEach(uid => {
                const entry = book.entries[uid];
                if (entry && entry.content) {
                    const comment = entry.comment || '';
                    const match = comment.match(/^(\d+)-(\d+)楼/);
                    if (match) {
                        const start = parseInt(match[1]);
                        const end = parseInt(match[2]);
                        minFloor = Math.min(minFloor, start);
                        maxFloor = Math.max(maxFloor, end);
                    }
                    parts.push(entry.content);
                }
            });
            if (parts.length > 0 && minFloor !== Infinity) {
                return `【${category}：${minFloor}-${maxFloor}楼】\n\n${parts.join('\n\n')}`;
            }
            return parts.join('\n\n');
        }

        // 原有逻辑：直接添加内容
        ids.forEach(uid => {
            const entry = book.entries[uid];
            if (entry && entry.content) {
                parts.push(entry.content);
            }
        });
        return parts.join('\n\n');
    }

    async function buildWorldbookContent(names = []) {
        const chunks = [];
        for (const name of names) {
            const book = await WBAP.loadWorldBookByName?.(name);
            if (book?.content) chunks.push(`【${name}】\n${book.content}`);
        }
        return chunks.join('\n\n');
    }

    function renderEndpointOptions(selectEl, selectedId) {
        if (!selectEl) return;
        const endpoints = getMemoryEndpoints();
        const opts = ['<option value="">未配置</option>'];
        endpoints.forEach(ep => opts.push(`<option value="${ep.id}" ${ep.id === selectedId ? 'selected' : ''}>${ep.name || ep.id}</option>`));
        selectEl.innerHTML = opts.join('');
    }

    function ensureMemoryModal() {
        if (document.getElementById('wbap-memory-modal')) return;
        const modal = document.createElement('div');
        modal.id = 'wbap-memory-modal';
        modal.className = 'wbap-modal';
        modal.innerHTML = `
<div class="wbap-modal-content" style="width:980px;max-width:96vw;max-height:92vh;display:flex;flex-direction:column;">
  <div class="wbap-modal-header" style="display:flex;align-items:center;justify-content:space-between;padding-bottom:10px;border-bottom:1px solid var(--smart-theme-border);flex-shrink:0;">
    <h3 style="margin:0;font-size:1.2em;">记忆模块</h3>
    <button id="wbap-memory-close" class="wbap-btn wbap-btn-icon" style="width:36px;height:36px;min-width:36px;border-radius:50%;padding:0;display:flex;align-items:center;justify-content:center;flex-shrink:0;font-size:18px;"><i class="fa-solid fa-xmark"></i></button>
  </div>
  <div class="wbap-modal-body" style="overflow-y:auto;overflow-x:hidden;display:flex;flex-direction:column;gap:12px;flex:1;min-height:0;">
    <div class="wbap-form-group" style="display:flex;gap:12px;align-items:center;flex-wrap:wrap;">
      <label class="wbap-inline"><input type="checkbox" id="wbap-memory-enabled"> 启用记忆注入</label>
      <span id="wbap-memory-chip" class="wbap-badge">未启用</span>
      <div style="flex:1"></div>
      <input type="text" id="wbap-memory-model" placeholder="可选：指定模型" style="min-width:200px;">
      <button id="wbap-memory-api-btn" class="wbap-btn wbap-btn-xs wbap-btn-secondary">独立API配置</button>
    </div>

    <div class="wbap-box" style="padding:12px;">
      <div class="wbap-box-header" style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
        <strong>选择世界书（仅表格书 / 总结书）</strong>
        <span id="wbap-memory-loading" class="wbap-text-muted" style="display:none;"><i class="fa-solid fa-spinner fa-spin"></i> 加载中...</span>
      </div>
      <div style="display:flex;flex-direction:column;gap:8px;margin-top:8px;">
        <details class="wbap-collapsible">
          <summary class="wbap-collapsible-header">
            <i class="fa-solid fa-table"></i>
            <span>表格书</span>
            <span id="wbap-memory-table-count" class="wbap-badge wbap-badge-sm">0</span>
          </summary>
          <div id="wbap-memory-table-list" class="wbap-list" style="padding:8px 0 0 16px;"></div>
        </details>
        <details class="wbap-collapsible">
          <summary class="wbap-collapsible-header">
            <i class="fa-solid fa-book"></i>
            <span>总结书</span>
            <span id="wbap-memory-summary-count" class="wbap-badge wbap-badge-sm">0</span>
          </summary>
          <div id="wbap-memory-summary-list" class="wbap-list" style="padding:8px 0 0 16px;"></div>
        </details>
      </div>
    </div>

    <div class="wbap-box" style="padding:12px;">
      <div class="wbap-box-header" style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
        <strong>已选 & API 配置</strong>
      </div>
      <div style="display:flex;flex-direction:column;gap:12px;margin-top:8px;">
        <details class="wbap-collapsible">
          <summary class="wbap-collapsible-header">
            <i class="fa-solid fa-table"></i>
            <span>表格书配置</span>
          </summary>
          <div style="padding:8px 0 0 8px;max-height:300px;overflow-y:auto;">
            <div id="wbap-memory-selected-tables" class="wbap-tag-list" style="margin-bottom:8px;"></div>
            <div id="wbap-memory-table-config"></div>
          </div>
        </details>
        <details class="wbap-collapsible">
          <summary class="wbap-collapsible-header">
            <i class="fa-solid fa-book"></i>
            <span>总结书配置</span>
          </summary>
          <div style="padding:8px 0 0 8px;max-height:300px;overflow-y:auto;">
            <div id="wbap-memory-selected-summaries" class="wbap-tag-list" style="margin-bottom:8px;"></div>
            <div id="wbap-memory-summary-config"></div>
          </div>
        </details>
      </div>
    </div>

    <div class="wbap-box" style="padding:12px;">
      <div class="wbap-box-header" style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
        <strong>双提示词分流</strong>
        <span class="wbap-text-muted" style="font-size:12px;">表格书和总结书使用不同的提示词处理</span>
      </div>
      <div class="wbap-dual-preset-grid" style="display:grid;grid-template-columns:repeat(auto-fit, minmax(200px, 1fr));gap:12px;margin-top:8px;">
        <div class="wbap-form-group">
          <label><i class="fa-solid fa-table"></i> 表格书提示词</label>
          <select id="wbap-memory-table-preset-select" style="width:100%;"></select>
        </div>
        <div class="wbap-form-group">
          <label><i class="fa-solid fa-book"></i> 总结书提示词</label>
          <select id="wbap-memory-summary-preset-select" style="width:100%;"></select>
        </div>
      </div>
      <div style="display:flex;gap:8px;margin-top:8px;flex-wrap:wrap;">
        <button id="wbap-memory-preset-add" class="wbap-btn wbap-btn-xs">新建</button>
        <button id="wbap-memory-preset-copy" class="wbap-btn wbap-btn-xs">复制</button>
        <button id="wbap-memory-preset-delete" class="wbap-btn wbap-btn-xs wbap-btn-danger">删除</button>
        <button id="wbap-memory-preset-reset" class="wbap-btn wbap-btn-xs">重置默认</button>
        <button id="wbap-memory-preset-import" class="wbap-btn wbap-btn-xs wbap-btn-secondary">导入</button>
        <button id="wbap-memory-preset-export" class="wbap-btn wbap-btn-xs wbap-btn-secondary">导出</button>
        <button id="wbap-memory-prompt-editor-btn" class="wbap-btn wbap-btn-xs wbap-btn-secondary">编辑提示词</button>
      </div>
    </div>

    <div class="wbap-box" style="padding:12px;">
      <div class="wbap-box-header">
        <strong>提示词预览</strong>
        <select id="wbap-memory-preset-select" style="min-width:150px;margin-left:8px;"></select>
      </div>
      <div class="wbap-form-group" style="margin-top:8px;">
        <label>System Prompt</label>
        <textarea id="wbap-memory-system" rows="6" style="width:100%;" readonly></textarea>
      </div>
      <div class="wbap-form-group">
        <label>User Prompt</label>
        <textarea id="wbap-memory-user" rows="6" style="width:100%;" readonly></textarea>
      </div>
    </div>
  </div>
  <div class="wbap-modal-footer" style="display:flex;gap:8px;justify-content:flex-end;flex-shrink:0;padding-top:12px;border-top:1px solid var(--smart-theme-border);">
    <button id="wbap-memory-save" class="wbap-btn wbap-btn-primary">保存</button>
    <button id="wbap-memory-cancel" class="wbap-btn">关闭</button>
  </div>
</div>`;
        document.body.appendChild(modal);
        modal.addEventListener('click', (e) => { if (e.target === modal) modal.classList.remove('open'); });
        modal.querySelector('#wbap-memory-close').onclick = () => {
            modal.classList.remove('open');
            // 返回主面板而不是退出插件
            const mainPanel = document.getElementById('wbap-panel');
            if (mainPanel && !mainPanel.classList.contains('open')) {
                mainPanel.classList.add('open');
            }
        };
        modal.querySelector('#wbap-memory-cancel').onclick = () => {
            modal.classList.remove('open');
            // 返回主面板而不是退出插件
            const mainPanel = document.getElementById('wbap-panel');
            if (mainPanel && !mainPanel.classList.contains('open')) {
                mainPanel.classList.add('open');
            }
        };
    }

    function ensureMemoryApiModal() {
        if (document.getElementById('wbap-memory-api-modal')) return;
        const modal = document.createElement('div');
        modal.id = 'wbap-memory-api-modal';
        modal.className = 'wbap-modal';
        modal.innerHTML = `
<div class="wbap-modal-content" style="width:720px;max-width:95vw;max-height:90vh;display:flex;flex-direction:column;">
  <div class="wbap-modal-header" style="display:flex;align-items:center;justify-content:space-between;padding-bottom:10px;border-bottom:1px solid var(--smart-theme-border);">
    <h3 style="margin:0;font-size:1.2em;">记忆模块独立 API</h3>
    <button id="wbap-memory-api-close" class="wbap-btn wbap-btn-icon" style="width:36px;height:36px;min-width:36px;border-radius:50%;padding:0;display:flex;align-items:center;justify-content:center;flex-shrink:0;font-size:18px;"><i class="fa-solid fa-xmark"></i></button>
  </div>
  <div class="wbap-modal-body" style="overflow:auto;display:flex;flex-direction:column;gap:10px;">
    <div class="wbap-form-group" style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
      <select id="wbap-memory-api-select" style="flex:1;min-width:200px;"></select>
      <button id="wbap-memory-api-add" class="wbap-btn wbap-btn-xs wbap-btn-primary">新建</button>
      <button id="wbap-memory-api-delete" class="wbap-btn wbap-btn-xs wbap-btn-danger">删除</button>
    </div>
    <div class="wbap-form-group">
      <label>名称</label>
      <input type="text" id="wbap-memory-api-name" placeholder="例如：记忆API-1">
    </div>
    <div class="wbap-form-group">
      <label>API URL</label>
      <input type="text" id="wbap-memory-api-url" placeholder="https://api.example.com/v1/chat/completions">
    </div>
    <div class="wbap-form-group">
      <label>API Key</label>
      <input type="text" id="wbap-memory-api-key" placeholder="可留空使用后端默认">
    </div>
    <div class="wbap-form-group">
      <label>模型</label>
      <div style="display:flex;gap:8px;align-items:center;">
        <select id="wbap-memory-api-model" style="flex:1;min-width:200px;">
          <option value="">请先获取模型列表</option>
        </select>
        <button id="wbap-memory-api-fetch-models" class="wbap-btn wbap-btn-xs wbap-btn-primary" title="获取模型列表">
          <i class="fa-solid fa-download"></i> 获取模型
        </button>
      </div>
    </div>
    <div class="wbap-form-group" style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">
      <div>
        <label>最大tokens</label>
        <input type="number" id="wbap-memory-api-max" min="1" max="32000" placeholder="2000">
      </div>
      <div>
        <label>温度</label>
        <input type="number" id="wbap-memory-api-temp" step="0.05" min="0" max="2" placeholder="0.7">
      </div>
      <div>
        <label>Top P</label>
        <input type="number" id="wbap-memory-api-top" step="0.05" min="0" max="1" placeholder="1">
      </div>
      <div>
        <label>存在惩罚</label>
        <input type="number" id="wbap-memory-api-presence" step="0.1" min="-2" max="2" placeholder="0">
      </div>
      <div>
        <label>频率惩罚</label>
        <input type="number" id="wbap-memory-api-frequency" step="0.1" min="-2" max="2" placeholder="0">
      </div>
      <div>
        <label>超时 (秒)</label>
        <input type="number" id="wbap-memory-api-timeout" min="1" max="300" placeholder="60">
      </div>
    </div>
  </div>
  <div class="wbap-modal-footer" style="display:flex;gap:8px;justify-content:flex-end;">
    <button id="wbap-memory-api-save" class="wbap-btn wbap-btn-primary">保存</button>
    <button id="wbap-memory-api-cancel" class="wbap-btn">关闭</button>
  </div>
</div>`;
        document.body.appendChild(modal);
        const close = () => modal.classList.remove('open');
        modal.addEventListener('click', (e) => { if (e.target === modal) close(); });
        modal.querySelector('#wbap-memory-api-close').onclick = close;
        modal.querySelector('#wbap-memory-api-cancel').onclick = close;
    }

    function renderMemoryApiSelect(selectedId) {
        const mem = ensureMemoryConfig();
        const pool = getMemoryPool();
        const select = document.getElementById('wbap-memory-api-select');
        if (!select) return;
        select.innerHTML = '';
        pool.apiEndpoints.forEach(ep => {
            const opt = document.createElement('option');
            opt.value = ep.id;
            opt.textContent = ep.name || ep.id;
            if (ep.id === selectedId) opt.selected = true;
            select.appendChild(opt);
        });
        if (!select.value && pool.apiEndpoints[0]) select.value = pool.apiEndpoints[0].id;
    }

    function loadApiToForm(ep) {
        document.getElementById('wbap-memory-api-name').value = ep?.name || '';
        document.getElementById('wbap-memory-api-url').value = ep?.apiUrl || '';
        document.getElementById('wbap-memory-api-key').value = ep?.apiKey || '';
        // 模型字段现在是 select，需要特殊处理
        const modelSelect = document.getElementById('wbap-memory-api-model');
        if (modelSelect) {
            const currentModel = ep?.model || '';
            // 如果当前模型不在选项中，添加一个选项
            if (currentModel && !Array.from(modelSelect.options).some(opt => opt.value === currentModel)) {
                const opt = document.createElement('option');
                opt.value = currentModel;
                opt.textContent = currentModel;
                modelSelect.appendChild(opt);
            }
            modelSelect.value = currentModel;
        }
        document.getElementById('wbap-memory-api-max').value = ep?.maxTokens ?? '';
        document.getElementById('wbap-memory-api-temp').value = ep?.temperature ?? '';
        document.getElementById('wbap-memory-api-top').value = ep?.topP ?? '';
        document.getElementById('wbap-memory-api-presence').value = ep?.presencePenalty ?? '';
        document.getElementById('wbap-memory-api-frequency').value = ep?.frequencyPenalty ?? '';
        document.getElementById('wbap-memory-api-timeout').value = ep?.timeout ?? '';
    }

    function collectApiFromForm(ep) {
        ep.name = document.getElementById('wbap-memory-api-name').value || ep.name;
        ep.apiUrl = document.getElementById('wbap-memory-api-url').value || '';
        ep.apiKey = document.getElementById('wbap-memory-api-key').value || '';
        ep.model = document.getElementById('wbap-memory-api-model').value || '';
        ep.maxTokens = parseInt(document.getElementById('wbap-memory-api-max').value, 10) || ep.maxTokens || 2000;
        ep.temperature = parseFloat(document.getElementById('wbap-memory-api-temp').value) || ep.temperature || 0.7;
        ep.topP = parseFloat(document.getElementById('wbap-memory-api-top').value) || ep.topP || 1;
        ep.presencePenalty = parseFloat(document.getElementById('wbap-memory-api-presence').value) || 0;
        ep.frequencyPenalty = parseFloat(document.getElementById('wbap-memory-api-frequency').value) || 0;
        ep.timeout = parseInt(document.getElementById('wbap-memory-api-timeout').value, 10) || ep.timeout || 60;
        return ep;
    }

    function bindMemoryApiModalEvents() {
        const modal = document.getElementById('wbap-memory-api-modal');
        if (!modal || modal.dataset.bound === '1') return;
        modal.dataset.bound = '1';
        const mem = ensureMemoryConfig();
        const pool = getMemoryPool();

        const select = modal.querySelector('#wbap-memory-api-select');
        select?.addEventListener('change', () => {
            const ep = findEndpointById(select.value) || pool.apiEndpoints[0];
            loadApiToForm(ep);
        });

        modal.querySelector('#wbap-memory-api-add')?.addEventListener('click', () => {
            const ep = createDefaultMemoryEndpoint();
            pool.apiEndpoints.push(ep);
            renderMemoryApiSelect(ep.id);
            loadApiToForm(ep);
            saveConfig();
        });

        modal.querySelector('#wbap-memory-api-delete')?.addEventListener('click', () => {
            if (!select?.value) return;
            pool.apiEndpoints = pool.apiEndpoints.filter(ep => ep.id !== select.value);
            if (!pool.apiEndpoints.length) pool.apiEndpoints.push(createDefaultMemoryEndpoint());
            renderMemoryApiSelect(pool.apiEndpoints[0].id);
            loadApiToForm(pool.apiEndpoints[0]);
            saveConfig();
            renderTableApiConfig();
            renderSummaryApiConfig();
        });

        modal.querySelector('#wbap-memory-api-save')?.addEventListener('click', () => {
            const ep = findEndpointById(select.value) || pool.apiEndpoints[0];
            if (!ep) return;
            collectApiFromForm(ep);
            saveConfig();
            renderMemoryApiSelect(ep.id);
            renderTableApiConfig();
            renderSummaryApiConfig();
            modal.classList.remove('open');
        });

        // 获取模型按钮事件
        modal.querySelector('#wbap-memory-api-fetch-models')?.addEventListener('click', async (e) => {
            const btn = e.currentTarget;
            const originalContent = btn.innerHTML;
            btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> 获取中...';
            btn.disabled = true;

            try {
                const apiUrl = document.getElementById('wbap-memory-api-url')?.value || '';
                const apiKey = document.getElementById('wbap-memory-api-key')?.value || '';

                if (!apiUrl) {
                    throw new Error('请先填写 API URL');
                }

                const result = await WBAP.fetchEndpointModels({ apiUrl, apiKey });

                if (result.success && result.models?.length) {
                    const modelSelect = document.getElementById('wbap-memory-api-model');
                    const currentModel = modelSelect?.value || '';

                    // 清空并重新填充选项
                    modelSelect.innerHTML = '';
                    result.models.forEach(model => {
                        const opt = document.createElement('option');
                        opt.value = model;
                        opt.textContent = model;
                        if (model === currentModel) opt.selected = true;
                        modelSelect.appendChild(opt);
                    });

                    // 如果之前的模型不在列表中，保留它
                    if (currentModel && !result.models.includes(currentModel)) {
                        const opt = document.createElement('option');
                        opt.value = currentModel;
                        opt.textContent = `${currentModel} (当前)`;
                        opt.selected = true;
                        modelSelect.insertBefore(opt, modelSelect.firstChild);
                    }
                } else {
                    throw new Error(result.message || '获取模型列表失败');
                }
            } catch (err) {
                alert(`获取模型失败: ${err.message}`);
            } finally {
                btn.innerHTML = originalContent;
                btn.disabled = false;
            }
        });
    }

    function openMemoryApiModal() {
        ensureMemoryApiModal();
        const mem = ensureMemoryConfig();
        const pool = getMemoryPool();
        const modal = document.getElementById('wbap-memory-api-modal');
        renderMemoryApiSelect(pool.apiEndpoints?.[0]?.id);
        loadApiToForm(findEndpointById(document.getElementById('wbap-memory-api-select')?.value) || pool.apiEndpoints[0]);
        bindMemoryApiModalEvents();
        modal.classList.add('open');
    }

    function insertAtCursor(el, text) {
        if (!el) return;
        const start = el.selectionStart ?? el.value.length;
        const end = el.selectionEnd ?? el.value.length;
        const before = el.value.slice(0, start);
        const after = el.value.slice(end);
        el.value = `${before}${text}${after}`;
        const pos = start + text.length;
        el.selectionStart = el.selectionEnd = pos;
        el.focus();
    }

    function ensureMemoryPromptEditor() {
        if (document.getElementById('wbap-memory-prompt-editor')) return;
        const modal = document.createElement('div');
        modal.id = 'wbap-memory-prompt-editor';
        modal.className = 'wbap-modal';
        modal.innerHTML = `
<div class="wbap-modal-content" style="width:940px;max-width:96vw;max-height:92vh;display:flex;flex-direction:column;">
  <div class="wbap-modal-header" style="display:flex;align-items:center;justify-content:space-between;padding-bottom:10px;border-bottom:1px solid var(--smart-theme-border);">
    <h3 style="margin:0;font-size:1.2em;">编辑记忆提示词</h3>
    <button id="wbap-memory-prompt-close" class="wbap-btn wbap-btn-icon" style="width:36px;height:36px;min-width:36px;border-radius:50%;padding:0;display:flex;align-items:center;justify-content:center;flex-shrink:0;font-size:18px;"><i class="fa-solid fa-xmark"></i></button>
  </div>
  <div class="wbap-modal-body" style="overflow:auto;display:flex;flex-direction:column;gap:12px;">
    <div class="wbap-form-group">
      <label>模板名称</label>
      <input type="text" id="wbap-memory-prompt-name" placeholder="例如：记忆管理1.13">
    </div>
    <div class="wbap-form-group" style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">
      <div>
        <label>模板描述</label>
        <input type="text" id="wbap-memory-prompt-desc" placeholder="记忆模块提示词描述">
      </div>
      <div>
        <label>模板版本</label>
        <input type="text" id="wbap-memory-prompt-version" placeholder="v1.0">
      </div>
    </div>

    <div class="wbap-box" style="padding:12px;">
      <div class="wbap-box-header" style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
        <strong>System Prompt</strong>
        <div id="wbap-memory-system-placeholders" class="wbap-tag-list" style="display:flex;gap:6px;flex-wrap:wrap;"></div>
      </div>
      <textarea id="wbap-memory-prompt-system" rows="10" style="width:100%; margin-top:8px;"></textarea>
    </div>

    <div class="wbap-box" style="padding:12px;">
      <div class="wbap-box-header" style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
        <strong>User Prompt</strong>
        <div id="wbap-memory-user-placeholders" class="wbap-tag-list" style="display:flex;gap:6px;flex-wrap:wrap;"></div>
      </div>
      <textarea id="wbap-memory-prompt-user" rows="10" style="width:100%; margin-top:8px;"></textarea>
    </div>

    <div class="wbap-box" style="padding:12px;">
      <div class="wbap-box-header" style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
        <strong>全局设置</strong>
        <button id="wbap-memory-variables-apply" class="wbap-btn wbap-btn-xs wbap-btn-primary">应用</button>
      </div>
      <div style="display:flex;align-items:center;gap:8px;margin-top:8px;">
        <label style="min-width:60px;">关联度</label>
        <input type="text" id="wbap-memory-var-sulv1" placeholder="0.1-1.0" style="width:80px;">
        <span class="wbap-text-muted" style="font-size:12px;">数值越小越严格，越大越宽松</span>
      </div>
    </div>
  </div>
  <div class="wbap-modal-footer" style="display:flex;gap:8px;justify-content:flex-end;">
    <button id="wbap-memory-prompt-save" class="wbap-btn wbap-btn-primary">保存</button>
    <button id="wbap-memory-prompt-cancel" class="wbap-btn">关闭</button>
  </div>
</div>`;
        document.body.appendChild(modal);
        const close = () => modal.classList.remove('open');
        modal.addEventListener('click', (e) => { if (e.target === modal) close(); });
        modal.querySelector('#wbap-memory-prompt-close').onclick = close;
        modal.querySelector('#wbap-memory-prompt-cancel').onclick = close;
    }

    function openMemoryPromptEditor() {
        ensureMemoryPromptEditor();
        const mem = ensureMemoryConfig();
        const preset = getSelectedPreset(mem);
        const modal = document.getElementById('wbap-memory-prompt-editor');

        document.getElementById('wbap-memory-prompt-name').value = preset.name || '';
        document.getElementById('wbap-memory-prompt-desc').value = preset.description || '';
        document.getElementById('wbap-memory-prompt-version').value = preset.version || '';
        document.getElementById('wbap-memory-prompt-system').value = preset.systemPrompt || '';
        document.getElementById('wbap-memory-prompt-user').value = preset.userPrompt || '';
        document.getElementById('wbap-memory-var-sulv1').value = preset.variables?.sulv1 ?? '';

        const placeholderList = ['{worldbook_content}', '{table_content}', '{context}', '{user_input}', '{sulv1}', '{limit}'];
        const systemHolder = document.getElementById('wbap-memory-system-placeholders');
        const userHolder = document.getElementById('wbap-memory-user-placeholders');
        const chips = placeholderList.map(p => `<button type="button" class="wbap-btn wbap-btn-xs wbap-memory-placeholder" data-ph="${p}">${p}</button>`).join('');
        if (systemHolder) systemHolder.innerHTML = chips;
        if (userHolder) userHolder.innerHTML = chips;

        let activeTarget = document.getElementById('wbap-memory-prompt-user');
        ['wbap-memory-prompt-system', 'wbap-memory-prompt-user'].forEach(id => {
            const el = document.getElementById(id);
            el?.addEventListener('focus', () => { activeTarget = el; });
        });

        if (modal.dataset.bound !== '1') {
            modal.dataset.bound = '1';
            modal.querySelectorAll('.wbap-memory-placeholder').forEach(btn => {
                btn.addEventListener('click', (e) => {
                    const ph = e.currentTarget.dataset.ph || '';
                    insertAtCursor(activeTarget, ph);
                });
            });

            modal.querySelector('#wbap-memory-variables-apply')?.addEventListener('click', () => {
                preset.variables = preset.variables || {};
                preset.variables.sulv1 = document.getElementById('wbap-memory-var-sulv1').value || '';
                saveConfig();
            });

            modal.querySelector('#wbap-memory-prompt-save')?.addEventListener('click', () => {
                preset.name = document.getElementById('wbap-memory-prompt-name').value || preset.name || '记忆预设';
                preset.description = document.getElementById('wbap-memory-prompt-desc').value || '';
                preset.version = document.getElementById('wbap-memory-prompt-version').value || '';
                const sys = document.getElementById('wbap-memory-prompt-system').value || FALLBACK_SYSTEM_PROMPT;
                const user = document.getElementById('wbap-memory-prompt-user').value || FALLBACK_USER_PROMPT;
                preset.systemPrompt = sys;
                preset.userPrompt = user;
                preset.variables = preset.variables || {};
                preset.variables.sulv1 = document.getElementById('wbap-memory-var-sulv1').value || preset.variables.sulv1 || '';
                const sysMain = document.getElementById('wbap-memory-system');
                const userMain = document.getElementById('wbap-memory-user');
                if (sysMain) sysMain.value = sys;
                if (userMain) userMain.value = user;
                saveConfig();
                modal.classList.remove('open');
                renderPresets();
            });
        }

        modal.classList.add('open');
    }

    function renderStatusChip() {
        const mem = ensureMemoryConfig();
        const chip = document.getElementById('wbap-memory-chip');
        if (chip) {
            chip.textContent = mem.enabled ? '已启用' : '未启用';
            chip.classList.toggle('wbap-badge-success', !!mem.enabled);
        }
    }

    function collectSelected(listId) {
        const list = document.getElementById(listId);
        if (!list) return [];
        return Array.from(list.querySelectorAll('input[type="checkbox"]'))
            .filter(cb => cb.checked)
            .map(cb => cb.value);
    }

    function renderSelectedTags() {
        const mem = ensureMemoryConfig();
        const tablesEl = document.getElementById('wbap-memory-selected-tables');
        const summariesEl = document.getElementById('wbap-memory-selected-summaries');
        if (tablesEl) {
            tablesEl.innerHTML = mem.selectedTableBooks.length
                ? mem.selectedTableBooks.map(n => `<span class="wbap-tag">${n}</span>`).join('')
                : '<span class="wbap-text-muted">未选择表格书</span>';
        }
        if (summariesEl) {
            summariesEl.innerHTML = mem.selectedSummaryBooks.length
                ? mem.selectedSummaryBooks.map(n => `<span class="wbap-tag">${n}</span>`).join('')
                : '<span class="wbap-text-muted">未选择总结书</span>';
        }
    }

    // 检测并缓存世界书类型
    async function detectAndCacheWorldBookType(name) {
        // 检查缓存
        if (WORLDBOOK_TYPE_CACHE.has(name)) {
            return WORLDBOOK_TYPE_CACHE.get(name);
        }

        try {
            const meta = await loadWorldBookMeta(name);
            if (!meta) {
                WORLDBOOK_TYPE_CACHE.set(name, { type: 'unknown', name });
                return { type: 'unknown', name };
            }

            let type = 'unknown';
            if (detectTableWorldBook(meta.entries)) {
                type = 'table';
            } else if (detectSummaryWorldBook(name, meta.entries)) {
                type = 'summary';
            }

            const result = { type, name };
            WORLDBOOK_TYPE_CACHE.set(name, result);
            return result;
        } catch (e) {
            Logger.warn(TAG, 'detectAndCacheWorldBookType failed', name, e);
            return { type: 'unknown', name };
        }
    }

    function formatWorldBookName(name) {
        if (!name) return { display: '', suffix: '' };

        let display = name;
        let suffix = '';

        if (name.startsWith('Amily2_Memory_')) {
            display = name.replace(/^Amily2_Memory_/, '');
            suffix = '<span class="wbap-badge wbap-badge-xs" style="background:rgba(var(--smart-theme-color-rgb), 0.2);color:var(--smart-theme-color);">表格</span>';
            if (display === 'Global') display = '全局共享记忆 (Global)';
        } else if (name.startsWith('Amily2-Lore-char-')) {
            display = name.replace(/^Amily2-Lore-char-/, '');
            suffix = '<span class="wbap-badge wbap-badge-xs" style="background:rgba(var(--smart-theme-color-rgb), 0.2);color:var(--smart-theme-color);">总结</span>';
        }

        // 截断太长的名字
        if (display.length > 30) {
            display = display.substring(0, 28) + '...';
        }

        return { display, suffix };
    }

    async function renderWorldBookSelectors() {
        const mem = ensureMemoryConfig();
        const loading = document.getElementById('wbap-memory-loading');
        const tableListEl = document.getElementById('wbap-memory-table-list');
        const summaryListEl = document.getElementById('wbap-memory-summary-list');
        if (!tableListEl || !summaryListEl) return;
        tableListEl.innerHTML = '<div class="wbap-text-muted">加载中...</div>';
        summaryListEl.innerHTML = '<div class="wbap-text-muted">加载中...</div>';
        if (loading) loading.style.display = 'inline-flex';

        try {
            const names = await WBAP.getAllWorldBookNames?.() || [];

            // 并发检测所有世界书类型
            const typeResults = await Promise.all(
                names.map(name => detectAndCacheWorldBookType(name))
            );

            // 分类
            const tableBooks = typeResults.filter(r => r.type === 'table').map(r => r.name);
            const summaryBooks = typeResults.filter(r => r.type === 'summary').map(r => r.name);

            // 排序：已选中的排前面，然后按名称排序
            const sortBooks = (books, selected) => {
                const selectedSet = new Set(selected);
                return books.sort((a, b) => {
                    const aSel = selectedSet.has(a);
                    const bSel = selectedSet.has(b);
                    if (aSel && !bSel) return -1;
                    if (!aSel && bSel) return 1;
                    return a.localeCompare(b);
                });
            };

            const sortedTableBooks = sortBooks(tableBooks, mem.selectedTableBooks);
            const sortedSummaryBooks = sortBooks(summaryBooks, mem.selectedSummaryBooks);

            const updateSelection = (type, selectedSet) => {
                mem.selectedTableBooks = mem.selectedTableBooks.filter(n => tableBooks.includes(n));
                mem.selectedSummaryBooks = mem.selectedSummaryBooks.filter(n => summaryBooks.includes(n));
                if (type === 'table') {
                    mem.selectedTableBooks = Array.from(selectedSet);
                } else {
                    mem.selectedSummaryBooks = Array.from(selectedSet);
                }
                saveConfig();
                renderSelectedTags();
                renderTableApiConfig();
                renderSummaryApiConfig();
                updateWorldBookCounts();
            };

            const updateWorldBookCounts = () => {
                const tableCount = document.getElementById('wbap-memory-table-count');
                const summaryCount = document.getElementById('wbap-memory-summary-count');
                if (tableCount) tableCount.textContent = mem.selectedTableBooks.length;
                if (summaryCount) summaryCount.textContent = mem.selectedSummaryBooks.length;
            };

            const buildList = (items, selected, target, type) => {
                if (!items.length) {
                    target.innerHTML = '<div class="wbap-text-muted">无可用</div>';
                    return;
                }
                target.innerHTML = items.map(n => {
                    const checked = selected.has(n) ? 'checked' : '';
                    const info = formatWorldBookName(n);
                    return `<label class="wbap-list-item" title="${n}" style="display:flex !important;align-items:center;justify-content:space-between;padding-right:8px;">
                        <div style="display:flex;align-items:center;gap:8px;overflow:hidden;flex:1;">
                            <input type="checkbox" value="${n}" ${checked} style="flex-shrink:0;"> 
                            <span style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${info.display}</span>
                        </div>
                        ${info.suffix}
                    </label>`;
                }).join('');
                target.querySelectorAll('input[type="checkbox"]').forEach(cb => {
                    cb.addEventListener('change', () => {
                        if (cb.checked) selected.add(cb.value); else selected.delete(cb.value);
                        updateSelection(type, selected);
                    });
                });
            };
            buildList(tableBooks, new Set(mem.selectedTableBooks), tableListEl, 'table');
            buildList(summaryBooks, new Set(mem.selectedSummaryBooks), summaryListEl, 'summary');
            updateWorldBookCounts();
        } catch (e) {
            tableListEl.innerHTML = '<div class="wbap-text-muted">加载失败</div>';
            summaryListEl.innerHTML = '<div class="wbap-text-muted">加载失败</div>';
        } finally {
            if (loading) loading.style.display = 'none';
        }
    }

    async function renderTableApiConfig() {
        const mem = ensureMemoryConfig();
        const box = document.getElementById('wbap-memory-table-config');
        if (!box) return;
        if (!mem.selectedTableBooks.length) {
            box.innerHTML = '<div class="wbap-text-muted">未选择表格书</div>';
            return;
        }
        box.innerHTML = '<div class="wbap-text-muted"><i class="fa-solid fa-spinner fa-spin"></i> 加载分类...</div>';

        // 优化：并发加载所有世界书的分类，而不是顺序加载
        const loadPromises = mem.selectedTableBooks.map(name =>
            loadTableCategories(name).then(cats => ({ name, cats }))
        );

        const results = await Promise.all(loadPromises);

        const parts = [];
        for (const { name, cats } of results) {
            if (!cats.length) {
                parts.push(`<div class="wbap-text-muted" style="margin-bottom:8px;">${name} 未检测到分类</div>`);
                continue;
            }
            const rows = cats.map(cat => {
                const selectId = `mem-table-${safeBtoa(name + '::' + cat).replace(/=/g, '')}`;
                const limitId = `mem-table-limit-${safeBtoa(name + '::' + cat).replace(/=/g, '')}`;
                return `<div class="wbap-config-row" style="display:flex;align-items:center;gap:8px;margin-bottom:6px;">
                    <div style="flex:1;min-width:100px;">${cat}</div>
                    <select data-type="table" data-book="${name}" data-category="${cat}" id="${selectId}" style="flex:1;min-width:120px;"></select>
                    <input type="number" data-type="table-limit" data-book="${name}" data-category="${cat}" id="${limitId}" min="1" max="50" placeholder="数量" style="width:60px;padding:6px 8px;background:var(--wbap-bg-input);border:1px solid var(--wbap-border-color);border-radius:4px;color:var(--wbap-text);text-align:center;" title="最大返回条目数">
                </div>`;
            }).join('');
            parts.push(`<div class="wbap-config-block" style="margin-bottom:10px;"><div style="font-weight:bold;margin-bottom:4px;">${name}</div>${rows}</div>`);
        }
        box.innerHTML = parts.join('');
        box.querySelectorAll('select[data-type="table"]').forEach(select => {
            const book = select.dataset.book;
            const cat = select.dataset.category;
            const selectedId = mem.tableCategoryEndpoints?.[book]?.[cat] || '';
            renderEndpointOptions(select, selectedId);
            select.addEventListener('change', (e) => {
                if (!mem.tableCategoryEndpoints[book]) mem.tableCategoryEndpoints[book] = {};
                mem.tableCategoryEndpoints[book][cat] = e.target.value || '';
                saveConfig();
            });
        });
        box.querySelectorAll('input[data-type="table-limit"]').forEach(input => {
            const book = input.dataset.book;
            const cat = input.dataset.category;
            const savedLimit = mem.tableCategoryLimits?.[book]?.[cat];
            input.value = savedLimit ?? 6;
            input.addEventListener('change', (e) => {
                if (!mem.tableCategoryLimits[book]) mem.tableCategoryLimits[book] = {};
                mem.tableCategoryLimits[book][cat] = parseInt(e.target.value) || 6;
                saveConfig();
            });
        });
    }

    async function renderSummaryApiConfig() {
        const mem = ensureMemoryConfig();
        const box = document.getElementById('wbap-memory-summary-config');
        if (!box) return;
        if (!mem.selectedSummaryBooks.length) {
            box.innerHTML = '<div class="wbap-text-muted">未选择总结书</div>';
            return;
        }
        box.innerHTML = '<div class="wbap-text-muted"><i class="fa-solid fa-spinner fa-spin"></i> 加载分类...</div>';

        // 并发加载所有总结书的分类
        const loadPromises = mem.selectedSummaryBooks.map(name =>
            loadTableCategories(name).then(cats => ({ name, cats }))
        );

        const results = await Promise.all(loadPromises);

        const parts = [];
        for (const { name, cats } of results) {
            // 过滤出大总结和小总结分类
            const summaryCategories = cats.filter(cat => cat === '大总结' || cat === '小总结');

            if (summaryCategories.length > 0) {
                // 插件式总结书：有大总结/小总结分类，按分类显示
                const rows = summaryCategories.map(cat => {
                    const selectId = `mem-summary-${safeBtoa(name + '::' + cat).replace(/=/g, '')}`;
                    const limitId = `mem-summary-limit-${safeBtoa(name + '::' + cat).replace(/=/g, '')}`;
                    return `<div class="wbap-config-row" style="display:flex;align-items:center;gap:8px;margin-bottom:6px;">
                        <div style="flex:1;min-width:100px;">${cat}</div>
                        <select data-type="summary" data-book="${name}" data-category="${cat}" id="${selectId}" style="flex:1;min-width:120px;"></select>
                        <input type="number" data-type="summary-limit" data-book="${name}" data-category="${cat}" id="${limitId}" min="1" max="50" placeholder="数量" style="width:60px;padding:6px 8px;background:var(--wbap-bg-input);border:1px solid var(--wbap-border-color);border-radius:4px;color:var(--wbap-text);text-align:center;" title="最大返回条目数">
                    </div>`;
                }).join('');
                parts.push(`<div class="wbap-config-block" style="margin-bottom:10px;"><div style="font-weight:bold;margin-bottom:4px;">${name}</div>${rows}</div>`);
            } else {
                // Amily式总结书：无分类，按整个世界书显示
                const selectId = `mem-summary-${safeBtoa(name).replace(/=/g, '')}`;
                const limitId = `mem-summary-limit-${safeBtoa(name).replace(/=/g, '')}`;
                const row = `<div class="wbap-config-row" style="display:flex;align-items:center;gap:8px;margin-bottom:6px;">
                    <div style="flex:1;min-width:100px;">${name}</div>
                    <select data-type="summary" data-book="${name}" id="${selectId}" style="flex:1;min-width:120px;"></select>
                    <input type="number" data-type="summary-limit" data-book="${name}" id="${limitId}" min="1" max="50" placeholder="数量" style="width:60px;padding:6px 8px;background:var(--wbap-bg-input);border:1px solid var(--wbap-border-color);border-radius:4px;color:var(--wbap-text);text-align:center;" title="最大返回条目数">
                </div>`;
                parts.push(row);
            }
        }
        box.innerHTML = parts.join('');

        // 绑定事件
        box.querySelectorAll('select[data-type="summary"]').forEach(select => {
            const book = select.dataset.book;
            const cat = select.dataset.category;

            // 确保配置结构存在
            if (!mem.summaryEndpoints) mem.summaryEndpoints = {};

            if (cat) {
                // 插件式总结书：有分类
                if (!mem.summaryEndpoints[book]) mem.summaryEndpoints[book] = {};
                const selectedId = mem.summaryEndpoints[book][cat] || '';
                renderEndpointOptions(select, selectedId);

                select.addEventListener('change', (e) => {
                    if (!mem.summaryEndpoints[book]) mem.summaryEndpoints[book] = {};
                    mem.summaryEndpoints[book][cat] = e.target.value || '';
                    saveConfig();
                });
            } else {
                // Amily式总结书：无分类
                const selectedId = typeof mem.summaryEndpoints[book] === 'string' ? mem.summaryEndpoints[book] : '';
                renderEndpointOptions(select, selectedId);

                select.addEventListener('change', (e) => {
                    mem.summaryEndpoints[book] = e.target.value || '';
                    saveConfig();
                });
            }
        });

        // 绑定数量输入框事件
        box.querySelectorAll('input[data-type="summary-limit"]').forEach(input => {
            const book = input.dataset.book;
            const cat = input.dataset.category;

            if (cat) {
                // 插件式总结书：有分类
                const savedLimit = mem.summaryCategoryLimits?.[book]?.[cat];
                input.value = savedLimit ?? 6;
                input.addEventListener('change', (e) => {
                    if (!mem.summaryCategoryLimits[book]) mem.summaryCategoryLimits[book] = {};
                    mem.summaryCategoryLimits[book][cat] = parseInt(e.target.value) || 6;
                    saveConfig();
                });
            } else {
                // Amily式总结书：无分类
                const savedLimit = typeof mem.summaryCategoryLimits?.[book] === 'number' ? mem.summaryCategoryLimits[book] : null;
                input.value = savedLimit ?? 6;
                input.addEventListener('change', (e) => {
                    mem.summaryCategoryLimits[book] = parseInt(e.target.value) || 6;
                    saveConfig();
                });
            }
        });
    }

    function getSelectedPreset(mem) {
        const pool = getMemoryPool();
        return pool.presets.find(p => p.id === mem.selectedPresetId) || pool.presets?.[0] || buildFallbackPreset();
    }

    // 根据任务类型获取对应的提示词预设
    function getPresetByType(mem, taskType) {
        const pool = getMemoryPool();
        let presetId;
        if (taskType === 'table') {
            presetId = mem.tablePresetId || mem.selectedPresetId;
        } else if (taskType === 'summary') {
            presetId = mem.summaryPresetId || mem.selectedPresetId;
        } else {
            // snapshot 或其他类型使用默认
            presetId = mem.selectedPresetId;
        }
        return pool.presets.find(p => p.id === presetId) || pool.presets?.[0] || buildFallbackPreset();
    }

    function renderPresets() {
        const mem = ensureMemoryConfig();
        const pool = getMemoryPool();
        
        // 渲染表格书提示词下拉框
        const tableSelect = document.getElementById('wbap-memory-table-preset-select');
        if (tableSelect) {
            tableSelect.innerHTML = '';
            pool.presets.forEach(preset => {
                const opt = document.createElement('option');
                opt.value = preset.id;
                opt.textContent = preset.name || preset.id;
                if (preset.id === mem.tablePresetId) opt.selected = true;
                tableSelect.appendChild(opt);
            });
        }
        
        // 渲染总结书提示词下拉框
        const summarySelect = document.getElementById('wbap-memory-summary-preset-select');
        if (summarySelect) {
            summarySelect.innerHTML = '';
            pool.presets.forEach(preset => {
                const opt = document.createElement('option');
                opt.value = preset.id;
                opt.textContent = preset.name || preset.id;
                if (preset.id === mem.summaryPresetId) opt.selected = true;
                summarySelect.appendChild(opt);
            });
        }
        
        // 渲染预览下拉框（用于查看和编辑）
        const previewSelect = document.getElementById('wbap-memory-preset-select');
        if (previewSelect) {
            previewSelect.innerHTML = '';
            pool.presets.forEach(preset => {
                const opt = document.createElement('option');
                opt.value = preset.id;
                opt.textContent = preset.name || preset.id;
                if (preset.id === mem.selectedPresetId) opt.selected = true;
                previewSelect.appendChild(opt);
            });
        }
        
        // 更新预览区域
        const preset = getSelectedPreset(mem);
        const sys = document.getElementById('wbap-memory-system');
        const user = document.getElementById('wbap-memory-user');
        if (sys) sys.value = preset.systemPrompt || '';
        if (user) user.value = preset.userPrompt || '';
    }

    function bindPresetEvents() {
        const modal = document.getElementById('wbap-memory-modal');
        if (!modal || modal.dataset.presetBound === '1') return;
        modal.dataset.presetBound = '1';
        const mem = ensureMemoryConfig();
        const pool = getMemoryPool();

        // 表格书提示词选择
        modal.querySelector('#wbap-memory-table-preset-select')?.addEventListener('change', (e) => {
            mem.tablePresetId = e.target.value || mem.tablePresetId;
            saveConfig();
        });

        // 总结书提示词选择
        modal.querySelector('#wbap-memory-summary-preset-select')?.addEventListener('change', (e) => {
            mem.summaryPresetId = e.target.value || mem.summaryPresetId;
            saveConfig();
        });

        // 预览下拉框（用于查看和编辑）
        modal.querySelector('#wbap-memory-preset-select')?.addEventListener('change', (e) => {
            mem.selectedPresetId = e.target.value || mem.selectedPresetId;
            saveConfig();
            renderPresets();
        });

        modal.querySelector('#wbap-memory-preset-add')?.addEventListener('click', () => {
            const name = prompt('新预设名称', `记忆预设${(pool.presets?.length || 0) + 1}`);
            if (!name) return;
            const sys = document.getElementById('wbap-memory-system')?.value || FALLBACK_SYSTEM_PROMPT;
            const user = document.getElementById('wbap-memory-user')?.value || FALLBACK_USER_PROMPT;
            const id = `${DEFAULT_PRESET_ID}-${Date.now()}`;
            pool.presets.push({ id, name, description: '自定义提示词', systemPrompt: sys, userPrompt: user, variables: { ...DEFAULT_VARIABLES } });
            mem.selectedPresetId = id;
            saveConfig();
            renderPresets();
        });

        modal.querySelector('#wbap-memory-preset-copy')?.addEventListener('click', () => {
            const preset = getSelectedPreset(mem);
            const id = `${preset.id}-copy-${Date.now()}`;
            pool.presets.push({ ...preset, id, name: `${preset.name || '预设'} 副本` });
            mem.selectedPresetId = id;
            saveConfig();
            renderPresets();
        });

        modal.querySelector('#wbap-memory-preset-delete')?.addEventListener('click', () => {
            if (!pool.presets || pool.presets.length <= 1) {
                alert('至少保留一个预设');
                return;
            }
            pool.presets = pool.presets.filter(p => p.id !== mem.selectedPresetId);
            mem.selectedPresetId = pool.presets[0].id;
            saveConfig();
            renderPresets();
        });

        modal.querySelector('#wbap-memory-preset-reset')?.addEventListener('click', async () => {
            // 清除缓存，强制重新加载所有默认提示词
            defaultPresetPromise = null;
            defaultTablePresetPromise = null;
            defaultSummaryPresetPromise = null;
            const [preset, tablePresetFile, summaryPresetFile] = await Promise.all([
                loadDefaultPresetFromFile(),
                loadTablePresetFromFile(),
                loadSummaryPresetFromFile()
            ]);
            if (!preset) {
                if (window.toastr) toastr.error('无法加载默认提示词文件', '重置失败');
                return;
            }
            // 重置旧版默认提示词
            const existingIdx = pool.presets.findIndex(p => p.id === DEFAULT_PRESET_ID);
            if (existingIdx >= 0) {
                pool.presets[existingIdx] = preset;
            } else {
                pool.presets.unshift(preset);
            }
            mem.selectedPresetId = preset.id;
            // 重置表格书提示词
            if (tablePresetFile) {
                const tableIdx = pool.presets.findIndex(p => p.id === DEFAULT_TABLE_PRESET_ID);
                if (tableIdx >= 0) {
                    pool.presets[tableIdx] = tablePresetFile;
                } else {
                    pool.presets.push(tablePresetFile);
                }
                mem.tablePresetId = tablePresetFile.id;
            }
            // 重置总结书提示词
            if (summaryPresetFile) {
                const summaryIdx = pool.presets.findIndex(p => p.id === DEFAULT_SUMMARY_PRESET_ID);
                if (summaryIdx >= 0) {
                    pool.presets[summaryIdx] = summaryPresetFile;
                } else {
                    pool.presets.push(summaryPresetFile);
                }
                mem.summaryPresetId = summaryPresetFile.id;
            }
            saveConfig();
            renderPresets();
            if (window.toastr) toastr.success('已恢复所有内置默认提示词（旧版/表格书/总结书）', '重置成功');
        });

        modal.querySelector('#wbap-memory-preset-import')?.addEventListener('click', () => {
            const input = document.createElement('input');
            input.type = 'file';
            input.accept = '.json';
            input.onchange = async (e) => {
                const file = e.target.files[0];
                if (!file) return;
                try {
                    const text = await file.text();
                    const data = JSON.parse(text);

                    // 验证数据格式
                    if (!data.name || !data.systemPrompt || !data.userPrompt) {
                        throw new Error('无效的提示词格式');
                    }

                    // 生成新的ID
                    const id = `imported-${Date.now()}`;
                    const newPreset = {
                        id,
                        name: data.name || '导入的预设',
                        description: data.description || '从文件导入',
                        systemPrompt: data.systemPrompt,
                        userPrompt: data.userPrompt,
                        variables: data.variables || { ...DEFAULT_VARIABLES }
                    };

                    pool.presets.push(newPreset);
                    mem.selectedPresetId = id;
                    saveConfig();
                    renderPresets();
                    if (window.toastr) toastr.success(`已导入提示词: ${newPreset.name}`, '导入成功');
                } catch (err) {
                    Logger.error(TAG, 'import preset failed', err);
                    if (window.toastr) toastr.error(`导入失败: ${err.message}`, '错误');
                }
            };
            input.click();
        });

        modal.querySelector('#wbap-memory-preset-export')?.addEventListener('click', () => {
            const preset = getSelectedPreset(mem);
            if (!preset) {
                if (window.toastr) toastr.error('没有选中的预设', '导出失败');
                return;
            }

            const exportData = {
                name: preset.name,
                description: preset.description,
                systemPrompt: preset.systemPrompt,
                userPrompt: preset.userPrompt,
                variables: preset.variables
            };

            const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `memory_preset_${preset.name.replace(/[^a-zA-Z0-9_\u4e00-\u9fa5]/g, '_')}_${Date.now()}.json`;
            a.click();
            URL.revokeObjectURL(url);
            if (window.toastr) toastr.success(`已导出提示词: ${preset.name}`, '导出成功');
        });
    }

    function bindMemoryModalEvents() {
        const modal = document.getElementById('wbap-memory-modal');
        if (!modal || modal.dataset.bound === '1') return;
        modal.dataset.bound = '1';

        modal.querySelector('#wbap-memory-enabled')?.addEventListener('change', (e) => {
            const mem = ensureMemoryConfig();
            mem.enabled = !!e.target.checked;
            saveConfig();
            renderStatusChip();
            // 更新首页面板的记忆状态徽章
            if (typeof WBAP.UI?.updateMemoryStatus === 'function') {
                WBAP.UI.updateMemoryStatus();
            }
        });

        const apiBtn = modal.querySelector('#wbap-memory-api-btn');
        if (apiBtn) {
            apiBtn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                Logger.log('[MemoryModule] API配置按钮被点击');
                openMemoryApiModal();
            });
        }

        const promptEditorBtn = modal.querySelector('#wbap-memory-prompt-editor-btn');
        if (promptEditorBtn) {
            promptEditorBtn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                Logger.log('[MemoryModule] 编辑提示词按钮被点击');
                openMemoryPromptEditor();
            });
        }

        modal.querySelector('#wbap-memory-save')?.addEventListener('click', () => {
            const mem = ensureMemoryConfig();
            mem.selectedTableBooks = collectSelected('wbap-memory-table-list');
            mem.selectedSummaryBooks = collectSelected('wbap-memory-summary-list');
            mem.model = document.getElementById('wbap-memory-model')?.value.trim() || '';
            // 保存双提示词选择
            mem.tablePresetId = document.getElementById('wbap-memory-table-preset-select')?.value || mem.tablePresetId;
            mem.summaryPresetId = document.getElementById('wbap-memory-summary-preset-select')?.value || mem.summaryPresetId;
            mem.selectedPresetId = document.getElementById('wbap-memory-preset-select')?.value || mem.selectedPresetId;
            document.querySelectorAll('#wbap-memory-table-config select[data-type="table"]').forEach(sel => {
                const book = sel.dataset.book;
                const cat = sel.dataset.category;
                if (!mem.tableCategoryEndpoints[book]) mem.tableCategoryEndpoints[book] = {};
                mem.tableCategoryEndpoints[book][cat] = sel.value || '';
            });
            document.querySelectorAll('#wbap-memory-summary-config select[data-type="summary"]').forEach(sel => {
                const book = sel.dataset.book;
                const cat = sel.dataset.category;
                if (cat) {
                    // 插件式总结书：有分类
                    if (!mem.summaryEndpoints[book]) mem.summaryEndpoints[book] = {};
                    mem.summaryEndpoints[book][cat] = sel.value || '';
                } else {
                    // Amily式总结书：无分类
                    mem.summaryEndpoints[book] = sel.value || '';
                }
            });
            saveConfig();
            renderStatusChip();
            // 更新首页面板的记忆状态徽章
            if (typeof WBAP.UI?.updateMemoryStatus === 'function') {
                WBAP.UI.updateMemoryStatus();
            }
            modal.classList.remove('open');
        });

        bindPresetEvents();
    }

    async function openMemoryModal() {
        ensureMemoryModal();
        const mem = ensureMemoryConfig();
        await ensureDefaultPreset(mem);
        const modal = document.getElementById('wbap-memory-modal');
        modal.querySelector('#wbap-memory-enabled').checked = !!mem.enabled;
        modal.querySelector('#wbap-memory-model').value = mem.model || '';
        renderStatusChip();
        renderPresets();
        renderSelectedTags();
        bindMemoryModalEvents();
        await renderWorldBookSelectors();
        await renderTableApiConfig();
        renderSummaryApiConfig();

        // 隐藏主面板
        const mainPanel = document.getElementById('wbap-panel');
        if (mainPanel) {
            mainPanel.classList.remove('open');
        }

        modal.classList.add('open');
    }

    function attachHeaderButton() {
        const panel = document.getElementById('wbap-panel');
        const btnId = 'wbap-memory-btn';
        if (panel && !document.getElementById(btnId)) {
            const actions = panel.querySelector('.wbap-panel-actions');
            if (actions) {
                const btn = document.createElement('button');
                btn.id = btnId;
                btn.className = 'wbap-btn wbap-btn-icon';
                btn.title = '记忆配置';
                btn.innerHTML = '<i class="fa-solid fa-brain"></i>';
                btn.onclick = openMemoryModal;
                actions.insertBefore(btn, actions.firstChild);
            }
        }
    }

    function escapeRegex(str) {
        return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }

    /**
     * 验证记忆模块配置
     * @param {Object} mem - 记忆配置对象
     * @returns {Object} { valid: boolean, errors: string[], warnings: string[] }
     */
    function validateMemoryConfig(mem) {
        const errors = [];
        const warnings = [];

        if (!mem) {
            errors.push('记忆配置对象不存在');
            return { valid: false, errors, warnings };
        }

        // 如果未启用，跳过验证
        if (!mem.enabled) {
            return { valid: true, errors: [], warnings: [] };
        }

        // 检查是否选择了世界书
        const hasTableBooks = mem.selectedTableBooks && mem.selectedTableBooks.length > 0;
        const hasSummaryBooks = mem.selectedSummaryBooks && mem.selectedSummaryBooks.length > 0;

        if (!hasTableBooks && !hasSummaryBooks) {
            errors.push('请至少选择一个世界书（表格书或总结书）');
        }

        // 检查API端点配置
        const pool = getMemoryPool();
        if (!pool.apiEndpoints || pool.apiEndpoints.length === 0) {
            errors.push('请至少配置一个记忆API端点');
        } else {
            // 检查是否有完整配置的端点
            const validEndpoints = pool.apiEndpoints.filter(ep =>
                ep.apiUrl && ep.apiUrl.trim() && ep.model && ep.model.trim()
            );

            if (validEndpoints.length === 0) {
                errors.push('请完整配置至少一个API端点（URL和模型不能为空）');
            } else if (validEndpoints.length < pool.apiEndpoints.length) {
                warnings.push(`有 ${pool.apiEndpoints.length - validEndpoints.length} 个API端点配置不完整`);
            }
        }

        // 检查预设
        if (!mem.selectedPresetId) {
            warnings.push('未选择记忆预设，将使用默认预设');
        } else {
            const presets = pool.presets || [];
            const presetExists = presets.some(p => p.id === mem.selectedPresetId);
            if (!presetExists && mem.selectedPresetId !== DEFAULT_PRESET_ID) {
                warnings.push(`选择的预设 "${mem.selectedPresetId}" 不存在，将使用默认预设`);
            }
        }

        // 检查表格书的端点配置
        if (hasTableBooks) {
            const unconfiguredBooks = [];
            for (const bookName of mem.selectedTableBooks) {
                const endpoints = mem.tableCategoryEndpoints?.[bookName];
                if (!endpoints || Object.keys(endpoints).length === 0) {
                    unconfiguredBooks.push(bookName);
                }
            }
            if (unconfiguredBooks.length > 0) {
                warnings.push(`以下表格书未配置API端点: ${unconfiguredBooks.join(', ')}`);
            }
        }

        // 检查总结书的端点配置
        if (hasSummaryBooks) {
            const unconfiguredBooks = [];
            for (const bookName of mem.selectedSummaryBooks) {
                const endpointConfig = mem.summaryEndpoints?.[bookName];
                // 支持两种格式：
                // 1. Amily式总结书：直接是字符串 endpointId
                // 2. 插件式总结书：是对象 { '大总结': endpointId, '小总结': endpointId }
                const hasEndpoint = typeof endpointConfig === 'string'
                    ? !!endpointConfig
                    : (typeof endpointConfig === 'object' && endpointConfig !== null && Object.keys(endpointConfig).length > 0);
                if (!hasEndpoint) {
                    unconfiguredBooks.push(bookName);
                }
            }
            if (unconfiguredBooks.length > 0) {
                warnings.push(`以下总结书未配置API端点: ${unconfiguredBooks.join(', ')}`);
            }
        }

        return {
            valid: errors.length === 0,
            errors,
            warnings
        };
    }

    function applyVariables(text, vars = {}) {
        if (!text || Object.keys(vars).length === 0) return text || '';

        // 优化：使用正则表达式一次性替换所有变量，而不是多次遍历字符串
        const keys = Object.keys(vars);
        if (keys.length === 0) return text;

        const pattern = new RegExp(
            keys.map(k => `\\{${escapeRegex(k)}\\}`).join('|'),
            'g'
        );

        return text.replace(pattern, match => {
            const key = match.slice(1, -1);  // 移除 { 和 }
            const value = vars[key];
            return value == null ? '' : String(value);
        });
    }

    function buildMemoryBlock({ userInput = '', context = '', worldbookContent = '', tableContent = '', preset, limit = 6 }) {
        const active = preset || buildFallbackPreset();
        const vars = active.variables || {};

        // 先应用 sulv1 变量，再应用内容占位符
        let system = applyVariables(active.systemPrompt || FALLBACK_SYSTEM_PROMPT, vars);
        let user = applyVariables(active.userPrompt || FALLBACK_USER_PROMPT, vars);

        // 应用内容占位符
        user = user
            .replaceAll('{worldbook_content}', worldbookContent || '')
            .replaceAll('{table_content}', tableContent || '')
            .replaceAll('{context}', context || '')
            .replaceAll('{user_input}', userInput || '');

        // 应用 limit 占位符到 system 和 user
        system = system.replaceAll('{limit}', String(limit));
        user = user.replaceAll('{limit}', String(limit));

        return { system, user };
    }

    function extractMemoryContent(text = '') {
        const m = text.match(/<memory>([\s\S]*?)<\/memory>/i);
        return (m ? m[1] : text).trim();
    }

    // 占位符文本，用于过滤无效内容
    const PLACEHOLDER_TEXTS = [
        '未勾选总结世界书或未启用世界书',
        '未检索出历史事件回忆',
        '记忆管理未启用表格',
        '未检索出表格总结',
        '当前无明确人物状态信息',
        '当前无明确未竟之事'
    ];

    // 从输出中提取特定标签的内容
    function extractTagContent(text, tagName) {
        let input = text;

        // 预处理：剥离 markdown 代码块包裹（```xml ... ``` 或 ``` ... ```）
        // 模型经常把 XML 输出包在代码块里，导致正则匹配失败
        input = input.replace(/```(?:xml|html|text)?\s*\n?([\s\S]*?)```/gi, '$1');

        // 1. 标准匹配：<TagName>...</TagName>
        let regex = new RegExp(`<${tagName}>([\\s\\S]*?)<\\/${tagName}>`, 'i');
        let match = input.match(regex);

        // 2. 带属性的标签匹配：<TagName type="...">...</TagName>
        if (!match) {
            regex = new RegExp(`<${tagName}\\s+[^>]*>([\\s\\S]*?)<\\/${tagName}>`, 'i');
            match = input.match(regex);
        }

        // 3. 下划线/连字符互换容错：Summary_Reasoning vs Summary-Reasoning
        if (!match) {
            const altName = tagName.includes('_') ? tagName.replace(/_/g, '-') : tagName.replace(/-/g, '_');
            if (altName !== tagName) {
                regex = new RegExp(`<${altName}(?:\\s+[^>]*)?>([\\s\\S]*?)<\\/${altName}>`, 'i');
                match = input.match(regex);
            }
        }

        if (!match) {
            Logger.log?.(TAG, `extractTagContent: 未匹配到标签 <${tagName}>，输出前200字: ${input.slice(0, 200)}`);
            return null;
        }

        let content = match[1].trim();
        // 移除固定输出字段前缀
        content = content.replace(/^以下是[^：:]+[：:]\s*/i, '').trim();

        // 检查是否为占位符文本
        for (const placeholder of PLACEHOLDER_TEXTS) {
            if (content === placeholder || content.includes(placeholder)) {
                // 如果只有占位符，返回 null
                const withoutPlaceholder = content.replace(placeholder, '').trim();
                if (!withoutPlaceholder) return null;
                content = withoutPlaceholder;
            }
        }

        return content || null;
    }

    // 提取推理说明（memory 块开头的 1-2 句话）
    function extractReasoning(text) {
        const content = extractMemoryContent(text);
        if (!content) return null;

        // 推理说明在 <Historical_Occurrences> 之前
        const beforeHistory = content.split(/<Historical_Occurrences>/i)[0];
        if (!beforeHistory) return null;

        // 移除【注意】提示
        let reasoning = beforeHistory.replace(/【注意】[^】]*。?/g, '').trim();
        // 只取第一段（1-2句话）
        const lines = reasoning.split('\n').filter(l => l.trim());
        return lines[0]?.trim() || null;
    }

    // 提取近期剧情末尾片段（在 </Short_Term_Recall> 之后，</memory> 之前）
    function extractRecentPlot(text) {
        const content = extractMemoryContent(text);
        if (!content) return null;

        // 在 </Short_Term_Recall> 之后的内容
        const afterRecall = content.split(/<\/Short_Term_Recall>/i)[1];
        if (!afterRecall) return null;

        let plot = afterRecall.trim();
        // 移除固定输出字段
        plot = plot.replace(/^以下是近期剧情末尾片段[：:]\s*/i, '').trim();
        plot = plot.replace(/【注意】后续剧情应衔接开始而非复述。?\s*$/i, '').trim();

        return plot || null;
    }

    // 结构化提取单个任务的输出
    function extractStructuredContent(text, taskType) {
        const result = {
            reasoning: null,
            summaryReasoning: null,
            tableReasoning: null,
            historicalOccurrences: null,
            tableSummary: null,
            characterSnapshot: null,
            shortTermRecall: null,
            recentPlot: null
        };

        if (!text) {
            Logger.warn(TAG, `extractStructuredContent(${taskType}): 输入文本为空`);
            return result;
        }

        // 诊断：记录原始返回长度
        Logger.log(TAG, `extractStructuredContent(${taskType}): 输入长度=${text.length}`);

        // 根据任务类型提取对应部分
        if (taskType === 'snapshot') {
            // 快照任务：提取高维快照、短期记忆、近期片段、推理说明（兼容旧格式）
            result.reasoning = extractReasoning(text);
            result.characterSnapshot = extractTagContent(text, 'Character_Snapshot');
            result.shortTermRecall = extractTagContent(text, 'Short_Term_Recall');
            result.recentPlot = extractRecentPlot(text);
        } else if (taskType === 'summary') {
            // 总结书任务：提取历史事件回忆 + 高维快照 + 短期记忆 + 推理说明
            // 新格式：<summary_memory> 包裹
            result.summaryReasoning = extractTagContent(text, 'Summary_Reasoning');
            result.historicalOccurrences = extractTagContent(text, 'Historical_Occurrences');
            result.characterSnapshot = extractTagContent(text, 'Character_Snapshot');
            result.shortTermRecall = extractTagContent(text, 'Short_Term_Recall');
        } else if (taskType === 'table') {
            // 表格书任务：提取表格总结 + 近期剧情片段 + 推理说明
            // 新格式：<table_memory> 包裹
            result.tableReasoning = extractTagContent(text, 'Table_Reasoning');
            result.tableSummary = extractTagContent(text, 'Table_Summary');
            result.recentPlot = extractTagContent(text, 'Recent_Plot');
        }

        // 诊断：记录提取结果
        const extracted = Object.entries(result).filter(([_, v]) => v !== null).map(([k]) => k);
        if (extracted.length === 0) {
            Logger.warn(TAG, `extractStructuredContent(${taskType}): 所有字段提取为空！AI原始输出前500字: ${text.slice(0, 500)}`);
        } else {
            Logger.log(TAG, `extractStructuredContent(${taskType}): 成功提取字段: ${extracted.join(', ')}`);
        }

        return result;
    }

    // 合并多个历史事件回忆，去重并按楼层排序
    function mergeHistoricalOccurrences(items) {
        if (!items || !items.length) return null;

        const seen = new Set();
        const records = [];

        for (const item of items) {
            if (!item) continue;
            const lines = item.split('\n').filter(l => l.trim());
            for (const line of lines) {
                const trimmed = line.trim();
                if (!trimmed || seen.has(trimmed)) continue;

                // 提取楼层号用于排序
                const floorMatch = trimmed.match(/【(\d+)楼】/);
                const floor = floorMatch ? parseInt(floorMatch[1], 10) : 9999;

                seen.add(trimmed);
                records.push({ floor, text: trimmed });
            }
        }

        // 按楼层排序
        records.sort((a, b) => a.floor - b.floor);

        // 重新编号
        return records.map((r, i) => {
            // 替换原有的 T-X 编号
            return r.text.replace(/^T-\d+[：:]\s*/, `T-${i + 1}: `);
        }).join('\n');
    }

    // 合并多个表格总结，去重
    function mergeTableSummaries(items) {
        if (!items || !items.length) return null;

        const seen = new Set();
        const records = [];

        for (const item of items) {
            if (!item) continue;
            const lines = item.split('\n').filter(l => l.trim());
            for (const line of lines) {
                const trimmed = line.trim();
                if (!trimmed || seen.has(trimmed)) continue;

                seen.add(trimmed);
                records.push(trimmed);
            }
        }

        // 重新编号
        return records.map((r, i) => {
            return r.replace(/^H-\d+[：:]\s*/, `H-${i + 1}: `);
        }).join('\n');
    }

    // 结构化合并所有任务结果
    function mergeMemoryResults(snapshotResult, summaryResults, tableResults) {
        // 从快照任务提取（兼容旧格式）
        const snapshot = extractStructuredContent(snapshotResult, 'snapshot');

        // 从总结书任务提取
        const summaryExtracted = summaryResults.map(r => extractStructuredContent(r, 'summary'));
        const historicalItems = summaryExtracted.map(e => e.historicalOccurrences).filter(Boolean);
        const summaryReasonings = summaryExtracted.map(e => e.summaryReasoning).filter(Boolean);
        const characterSnapshots = summaryExtracted.map(e => e.characterSnapshot).filter(Boolean);
        const shortTermRecalls = summaryExtracted.map(e => e.shortTermRecall).filter(Boolean);

        // 从表格书任务提取
        const tableExtracted = tableResults.map(r => extractStructuredContent(r, 'table'));
        const tableItems = tableExtracted.map(e => e.tableSummary).filter(Boolean);
        const tableReasonings = tableExtracted.map(e => e.tableReasoning).filter(Boolean);
        const recentPlots = tableExtracted.map(e => e.recentPlot).filter(Boolean);

        // 合并历史事件和表格总结
        const mergedHistory = mergeHistoricalOccurrences(historicalItems);
        const mergedTable = mergeTableSummaries(tableItems);

        // 合并高维快照（优先使用总结书的，其次快照任务的）
        const finalSnapshot = characterSnapshots[0] || snapshot.characterSnapshot;
        // 合并短期记忆（优先使用总结书的，其次快照任务的）
        const finalRecall = shortTermRecalls[0] || snapshot.shortTermRecall;
        // 合并近期剧情片段（优先使用表格书的，其次快照任务的）
        const finalRecentPlot = recentPlots[0] || snapshot.recentPlot;

        // 构建最终输出
        const parts = [];

        // 开始 details/summary 包裹
        parts.push('<details>');
        parts.push('<summary>记忆召回</summary>');

        // 总结书推理说明
        // 总结书推理说明（只保留第一条，避免多分类重复）
        if (summaryReasonings.length > 0) {
            parts.push('<Summary_Reasoning>');
            parts.push(summaryReasonings[0]);
            parts.push('</Summary_Reasoning>');
        }

        // 表格书推理说明（只保留第一条，避免多分类重复）
        if (tableReasonings.length > 0) {
            parts.push('<Table_Reasoning>');
            parts.push(tableReasonings[0]);
            parts.push('</Table_Reasoning>');
        }

        // 兼容旧格式：如果没有新格式的推理说明，使用快照任务的
        if (summaryReasonings.length === 0 && tableReasonings.length === 0 && snapshot.reasoning) {
            parts.push(snapshot.reasoning);
        }

        // 注意提示
        parts.push('【注意】所有回忆为过去式，请勿将回忆中的任何状态理解为当前状态，仅作剧情参考。');

        // 历史事件回忆
        parts.push('<Historical_Occurrences>');
        parts.push('以下是历史事件回忆：');
        parts.push(mergedHistory || '未勾选总结世界书或未启用世界书');
        parts.push('</Historical_Occurrences>');

        // 表格总结
        parts.push('<Table_Summary>');
        parts.push('以下是表格总结：');
        parts.push(mergedTable || '记忆管理未启用表格');
        parts.push('</Table_Summary>');

        // 高维快照
        parts.push('<Character_Snapshot>');
        parts.push('以下是高维快照：');
        parts.push(finalSnapshot || '当前无明确人物状态信息');
        parts.push('</Character_Snapshot>');

        // 短期记忆召回
        parts.push('<Short_Term_Recall>');
        parts.push('以下是短期记忆召回：');
        parts.push(finalRecall || '当前无明确未竟之事');
        parts.push('</Short_Term_Recall>');

        // 近期剧情末尾片段
        parts.push('以下是近期剧情末尾片段：');
        parts.push(finalRecentPlot || '');
        parts.push('【注意】后续剧情应衔接开始而非复述。');

        // 结束 details 包裹
        parts.push('</details>');

        return parts.join('\n');
    }

    async function callMemoryEndpoint(block, endpoint, modelOverride = '', signal = null, retries = 2) {
        if (!WBAP.callAI) {
            Logger.warn(TAG, 'callAI 不可用，跳过记忆端点调用');
            return '';
        }
        if (!endpoint) {
            Logger.warn(TAG, '记忆端点未配置（endpoint 为 null），请在记忆模块中配置 API');
            return '';
        }

        for (let attempt = 0; attempt <= retries; attempt++) {
            try {
                // 检查是否已取消
                if (signal?.aborted) {
                    throw new Error('Task cancelled');
                }

                // 创建API配置并传递signal
                const apiConfig = {
                    ...endpoint,
                    signal: signal
                };

                return await WBAP.callAI(
                    modelOverride || block.model || endpoint.model || '',
                    block.user,
                    block.system,
                    apiConfig
                );
            } catch (e) {
                // 检查是否是取消错误 - 不重试
                if (e.name === 'AbortError' || e.message === 'Task cancelled') {
                    Logger.log(TAG, 'memory endpoint cancelled');
                    throw e;  // 重新抛出取消错误
                }

                // 如果还有重试次数，继续重试
                if (attempt < retries) {
                    const delay = 1000 * (attempt + 1);  // 递增延迟：1s, 2s
                    Logger.log(TAG, `memory endpoint failed, retrying in ${delay}ms (${attempt + 1}/${retries})`, e.message);
                    await new Promise(resolve => setTimeout(resolve, delay));
                    continue;
                }

                // 所有重试都失败
                Logger.error(TAG, 'memory endpoint failed after retries', e);
                return '';
            }
        }
    }

    async function processMessage(options = {}) {
        const mem = ensureMemoryConfig();
        if (!mem.enabled) return '';

        // 验证配置
        const validation = validateMemoryConfig(mem);

        // 如果有错误，记录并提示用户
        if (!validation.valid) {
            Logger.error(TAG, '记忆模块配置无效:', validation.errors);
            if (window.toastr) {
                toastr.error(
                    validation.errors.join('\n'),
                    '记忆模块配置错误',
                    { timeOut: 5000 }
                );
            }
            return '';
        }

        // 如果有警告，记录但继续执行
        if (validation.warnings.length > 0) {
            Logger.warn(TAG, '记忆模块配置警告:', validation.warnings);
            // 只在第一次显示警告
            if (!mem._warningShown) {
                if (window.toastr) {
                    toastr.warning(
                        validation.warnings.join('\n'),
                        '记忆模块配置提示',
                        { timeOut: 4000 }
                    );
                }
                mem._warningShown = true;  // 标记已显示，避免重复提示
            }
        }

        let userInput = '';
        let context = '';
        if (typeof options === 'string') {
            userInput = options;
        } else {
            userInput = options.userInput || '';
            context = options.context || '';
        }
        if (!context && WBAP.getRecentContext && WBAP.getCurrentChatContext) {
            try {
                // 【关键修复】使用 getCharacterConfig() 获取最新配置
                const charCfg = getCharacterConfig();
                context = WBAP.getRecentContext(WBAP.getCurrentChatContext(), charCfg?.contextRounds ?? 5);
            } catch (e) {
                // ignore
            }
        }

        // 【修复前文污染】过滤前文中的历史记忆块，防止记忆LLM从中复制条目导致重复输出
        if (context) {
            context = context
                .replace(/<memory>[\s\S]*?<\/memory>/gi, '')
                .replace(/<details[^>]*>\s*<summary>\s*记忆召回\s*<\/summary>[\s\S]*?<\/details>/gi, '')
                .replace(/<table_memory>[\s\S]*?<\/table_memory>/gi, '')
                .replace(/<summary_memory>[\s\S]*?<\/summary_memory>/gi, '')
                .trim();
        }

        const preset = await ensureDefaultPreset(mem);
        const config = getCharacterConfig();
        const showProgress = config?.showProgressPanel && WBAP.UI;

        // 创建AbortController用于取消任务
        const abortControllers = new Map();
        let abortAllRequested = false;

        // 取消全部任务的函数
        const abortAll = () => {
            abortAllRequested = true;
            Logger.log(TAG, '取消全部记忆模块任务');
            abortControllers.forEach((controller, taskId) => {
                controller.abort();
                if (showProgress) {
                    WBAP.UI.updateProgressTask(taskId, '已取消', 100);
                }
            });
        };

        // 取消单个任务的函数
        const cancelSingleTask = (taskId) => {
            const controller = abortControllers.get(taskId);
            if (controller) {
                Logger.log(TAG, `取消记忆模块任务: ${taskId}`);
                controller.abort();
                if (showProgress) {
                    WBAP.UI.updateProgressTask(taskId, '已取消', 100);
                }
            }
        };

        // 收集任务信息
        const summaryTasks = [];
        const tableTasks = [];

        // 获取双提示词预设
        const tablePreset = getPresetByType(mem, 'table');
        const summaryPreset = getPresetByType(mem, 'summary');

        // 收集总结书任务
        for (const summaryName of mem.selectedSummaryBooks || []) {
            const categories = await loadTableCategories(summaryName);
            // 只处理大总结和小总结分类
            const summaryCategories = categories.filter(cat => cat === '大总结' || cat === '小总结');

            if (summaryCategories.length > 0) {
                // 插件式总结书：有分类，按分类创建任务
                for (const cat of summaryCategories) {
                    const epId = mem.summaryEndpoints?.[summaryName]?.[cat];
                    const ep = findEndpointById(epId);
                    const limit = mem.summaryCategoryLimits?.[summaryName]?.[cat] || 6;
                    const bookDisplayName = WBAP.UI?.getWorldBookDisplayName?.(summaryName) || summaryName;
                    summaryTasks.push({
                        id: `memory-summary-${summaryName}-${cat}`,
                        name: `${bookDisplayName} / ${cat}`,
                        bookName: summaryName,
                        category: cat,
                        endpoint: ep,
                        limit,
                        preset: summaryPreset  // 使用总结书专用提示词
                    });
                }
            } else {
                // Amily式总结书：无分类，按整个世界书创建任务
                const epId = typeof mem.summaryEndpoints?.[summaryName] === 'string' ? mem.summaryEndpoints[summaryName] : '';
                const ep = findEndpointById(epId);
                const limit = typeof mem.summaryCategoryLimits?.[summaryName] === 'number' ? mem.summaryCategoryLimits[summaryName] : 6;
                summaryTasks.push({
                    id: `memory-summary-${summaryName}`,
                    name: `${WBAP.UI?.getWorldBookDisplayName?.(summaryName) || summaryName}`,
                    bookName: summaryName,
                    category: null,
                    endpoint: ep,
                    limit,
                    preset: summaryPreset  // 使用总结书专用提示词
                });
            }
        }

        // 收集表格书任务
        for (const bookName of mem.selectedTableBooks || []) {
            const categories = await loadTableCategories(bookName);
            for (const cat of categories) {
                const epId = mem.tableCategoryEndpoints?.[bookName]?.[cat];
                const ep = findEndpointById(epId);
                const limit = mem.tableCategoryLimits?.[bookName]?.[cat] || 6;
                const bookDisplayName = WBAP.UI?.getWorldBookDisplayName?.(bookName) || bookName;
                tableTasks.push({
                    id: `memory-table-${bookName}-${cat}`,
                    name: `${bookDisplayName} / ${cat}`,
                    bookName,
                    category: cat,
                    endpoint: ep,
                    limit,
                    preset: tablePreset  // 使用表格书专用提示词
                });
            }
        }

        // 获取默认端点（用于快照任务）
        const defaultEndpoint = findEndpointById(getMemoryPool().apiEndpoints?.[0]?.id);

        // 计算总任务数（快照任务 + 总结书任务 + 表格书任务）
        const totalTasks = 1 + summaryTasks.length + tableTasks.length;

        // 检测进度面板是否已打开（由 interceptor 统一初始化）
        const panelAlreadyOpen = WBAP.UI?.isProgressPanelOpen?.();
        if (showProgress) {
            if (panelAlreadyOpen) {
                // 面板已打开，只增加任务数
                WBAP.UI.addToTotalTaskCount?.(totalTasks);
            } else {
                // 面板未打开，初始化面板
                WBAP.UI.showProgressPanel('记忆模块处理中...', totalTasks);
            }

            // 为快照任务创建AbortController
            const snapshotController = new AbortController();
            abortControllers.set('memory-snapshot', snapshotController);

            // 添加快照任务
            WBAP.UI.addProgressTask('memory-snapshot', '快照: 高维快照/短期记忆', '等待中...');

            // 为总结书任务创建AbortController并添加任务
            for (const task of summaryTasks) {
                const controller = new AbortController();
                abortControllers.set(task.id, controller);
                WBAP.UI.addProgressTask(task.id, task.name, '等待中...');
            }

            // 为表格书任务创建AbortController并添加任务
            for (const task of tableTasks) {
                const controller = new AbortController();
                abortControllers.set(task.id, controller);
                WBAP.UI.addProgressTask(task.id, task.name, '等待中...');
            }

            // 注册取消回调
            if (WBAP.UI.setCancelAllCallback) {
                WBAP.UI.setCancelAllCallback(abortAll);
            }
            if (WBAP.UI.setCancelTaskCallback) {
                // 注册快照任务的取消回调
                WBAP.UI.setCancelTaskCallback('memory-snapshot', cancelSingleTask);
                // 注册总结书任务的取消回调
                summaryTasks.forEach(task => {
                    WBAP.UI.setCancelTaskCallback(task.id, cancelSingleTask);
                });
                // 注册表格书任务的取消回调
                tableTasks.forEach(task => {
                    WBAP.UI.setCancelTaskCallback(task.id, cancelSingleTask);
                });
            }
        }

        // 创建快照任务（不传世界书和表格内容，只提取高维快照、短期记忆、近期片段）
        const snapshotPromise = (async () => {
            const taskId = 'memory-snapshot';
            const controller = abortControllers.get(taskId);
            const signal = controller?.signal;

            try {
                // 检查是否已取消
                if (signal?.aborted) {
                    throw new Error('Task cancelled');
                }

                if (showProgress) {
                    WBAP.UI.updateProgressTask(taskId, '处理中...', 10);
                }

                const block = buildMemoryBlock({
                    userInput,
                    context,
                    worldbookContent: '',  // 不传世界书
                    tableContent: '',       // 不传表格
                    preset
                });
                block.model = mem.model;

                const result = await callMemoryEndpoint(block, defaultEndpoint, mem.model, signal);

                if (showProgress) {
                    WBAP.UI.updateProgressTask(taskId, '完成', 100);
                }
                return result;
            } catch (e) {
                // 检查是否是取消错误
                if (e.name === 'AbortError' || e.message === 'Task cancelled') {
                    Logger.log(TAG, 'snapshot task cancelled');
                    if (showProgress) {
                        WBAP.UI.updateProgressTask(taskId, '已取消', 100);
                    }
                    return '';
                }

                // 处理其他错误
                const errorMsg = e.message || '未知错误';
                Logger.error(TAG, 'snapshot task failed', e);

                if (showProgress) {
                    WBAP.UI.updateProgressTask(taskId, '失败', 100);
                }

                // 显示用户友好的错误提示
                if (window.toastr) {
                    if (errorMsg.includes('timeout') || errorMsg.includes('超时')) {
                        toastr.error('记忆快照请求超时，请检查网络连接', '处理失败', { timeOut: 5000 });
                    } else if (errorMsg.includes('401') || errorMsg.includes('403') || errorMsg.includes('认证')) {
                        toastr.error('API认证失败，请检查密钥配置', '处理失败', { timeOut: 5000 });
                    } else if (errorMsg.includes('429') || errorMsg.includes('rate limit')) {
                        toastr.error('API请求频率超限，请稍后重试', '处理失败', { timeOut: 5000 });
                    } else {
                        toastr.error(`记忆快照失败: ${errorMsg}`, '错误', { timeOut: 5000 });
                    }
                }

                return '';
            }
        })();

        // 创建总结书任务
        const summaryPromises = summaryTasks.map(async (task) => {
            const controller = abortControllers.get(task.id);
            const signal = controller?.signal;

            try {
                // 检查是否已取消
                if (signal?.aborted) {
                    throw new Error('Task cancelled');
                }

                if (showProgress) {
                    WBAP.UI.updateProgressTask(task.id, '处理中...', 10);
                }

                // 根据是否有分类加载内容
                let content;
                if (task.category) {
                    // 插件式总结书：按分类加载内容
                    content = await loadCategoryContent(task.bookName, task.category);
                } else {
                    // Amily式总结书：加载整个世界书内容
                    content = await buildWorldbookContent([task.bookName]);
                }

                // 再次检查是否已取消
                if (signal?.aborted) {
                    throw new Error('Task cancelled');
                }

                const block = buildMemoryBlock({
                    userInput,
                    context,
                    worldbookContent: content,
                    tableContent: '',
                    preset: task.preset,  // 使用任务自带的总结书专用提示词
                    limit: task.limit || 6
                });
                block.model = mem.model;

                const result = await callMemoryEndpoint(block, task.endpoint || defaultEndpoint, mem.model, signal);

                if (showProgress) {
                    WBAP.UI.updateProgressTask(task.id, '完成', 100);
                }
                return result;
            } catch (e) {
                // 检查是否是取消错误
                if (e.name === 'AbortError' || e.message === 'Task cancelled') {
                    Logger.log(TAG, 'summary task cancelled', task.name);
                    if (showProgress) {
                        WBAP.UI.updateProgressTask(task.id, '已取消', 100);
                    }
                    return '';
                }

                // 处理其他错误
                const errorMsg = e.message || '未知错误';
                Logger.error(TAG, 'summary task failed', task.name, e);

                if (showProgress) {
                    WBAP.UI.updateProgressTask(task.id, '失败', 100);
                }

                // 显示用户友好的错误提示（只对第一个失败的任务显示，避免过多提示）
                if (window.toastr && summaryPromises.indexOf(task) === 0) {
                    if (errorMsg.includes('timeout') || errorMsg.includes('超时')) {
                        toastr.error('总结书处理超时，请检查网络连接', '处理失败', { timeOut: 5000 });
                    } else if (errorMsg.includes('401') || errorMsg.includes('403')) {
                        toastr.error('API认证失败，请检查密钥配置', '处理失败', { timeOut: 5000 });
                    } else {
                        toastr.error(`总结书处理失败: ${errorMsg}`, '错误', { timeOut: 5000 });
                    }
                }

                return '';
            }
        });

        // 创建表格书任务
        const tablePromises = tableTasks.map(async (task) => {
            const controller = abortControllers.get(task.id);
            const signal = controller?.signal;

            try {
                // 检查是否已取消
                if (signal?.aborted) {
                    throw new Error('Task cancelled');
                }

                if (showProgress) {
                    WBAP.UI.updateProgressTask(task.id, '处理中...', 10);
                }

                const tableContent = await loadCategoryContent(task.bookName, task.category);

                // 再次检查是否已取消
                if (signal?.aborted) {
                    throw new Error('Task cancelled');
                }

                const block = buildMemoryBlock({
                    userInput,
                    context,
                    worldbookContent: '',
                    tableContent,
                    preset: task.preset,  // 使用任务自带的表格书专用提示词
                    limit: task.limit || 6
                });
                block.model = mem.model;

                const result = await callMemoryEndpoint(block, task.endpoint || defaultEndpoint, mem.model, signal);

                if (showProgress) {
                    WBAP.UI.updateProgressTask(task.id, '完成', 100);
                }
                return result;
            } catch (e) {
                // 检查是否是取消错误
                if (e.name === 'AbortError' || e.message === 'Task cancelled') {
                    Logger.log(TAG, 'table task cancelled', task.name);
                    if (showProgress) {
                        WBAP.UI.updateProgressTask(task.id, '已取消', 100);
                    }
                    return '';
                }

                // 处理其他错误
                const errorMsg = e.message || '未知错误';
                Logger.error(TAG, 'table task failed', task.name, e);

                if (showProgress) {
                    WBAP.UI.updateProgressTask(task.id, '失败', 100);
                }

                // 显示用户友好的错误提示（只对第一个失败的任务显示）
                if (window.toastr && tablePromises.indexOf(task) === 0) {
                    if (errorMsg.includes('timeout') || errorMsg.includes('超时')) {
                        toastr.error('表格书处理超时，请检查网络连接', '处理失败', { timeOut: 5000 });
                    } else if (errorMsg.includes('401') || errorMsg.includes('403')) {
                        toastr.error('API认证失败，请检查密钥配置', '处理失败', { timeOut: 5000 });
                    } else {
                        toastr.error(`表格书处理失败: ${errorMsg}`, '错误', { timeOut: 5000 });
                    }
                }

                return '';
            }
        });

        // 并发执行所有任务 - 使用 Promise.allSettled 处理部分失败
        const results = await Promise.allSettled([
            snapshotPromise,
            Promise.all(summaryPromises),
            Promise.all(tablePromises)
        ]);

        // 提取结果，即使部分任务失败也能继续
        const snapshotResult = results[0].status === 'fulfilled' ? results[0].value : '';
        const summaryResults = results[1].status === 'fulfilled' ? results[1].value : [];
        const tableResults = results[2].status === 'fulfilled' ? results[2].value : [];

        // 记录失败的任务
        if (results[0].status === 'rejected') {
            Logger.error(TAG, '快照任务失败', results[0].reason);
        }
        if (results[1].status === 'rejected') {
            Logger.error(TAG, '总结书任务失败', results[1].reason);
        }
        if (results[2].status === 'rejected') {
            Logger.error(TAG, '表格书任务失败', results[2].reason);
        }

        // 清理 AbortController - 防止内存泄漏
        abortControllers.clear();

        // 注意：���在这里隐藏进度面板，由 interceptor 统一管理
        // 如果是独立调用（面板由本模块打开），则隐藏
        if (showProgress && !panelAlreadyOpen) {
            WBAP.UI.hideProgressPanel();
        }

        // 结构化合并结果
        const body = mergeMemoryResults(snapshotResult, summaryResults, tableResults);
        if (!body) return '';

        return `<memory>\n${body}\n</memory>`;
    }

    function init() {
        const mem = ensureMemoryConfig();
        ensureMemoryModal();
        ensureDefaultPreset(mem);
        attachHeaderButton();
    }

    window.WBAP.MemoryModule = {
        init,
        openMemoryModal,
        processMessage,
        buildMemoryBlock,
        detectTableWorldBook,
        detectSummaryWorldBook,
        loadTableCategories,
        loadCategoryContent
    };
})();
