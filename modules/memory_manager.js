// modules/memory_manager.js
(function () {
    'use strict';

    window.WBAP = window.WBAP || {};
    const Logger = WBAP.Logger || console;
    const TAG = '[MemoryModule]';

    const MEMORY_VERSION = 2;
    const DEFAULT_PRESET_ID = 'memory-default';
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
    const DEFAULT_VARIABLES = { sulv1: '0.6', sulv2: '8', sulv3: '6', sulv4: '' };

    const CATEGORY_CACHE = new Map();
    const WORLDBOOK_TYPE_CACHE = new Map(); // 缓存世界书类型检测结果
    let defaultPresetPromise = null;

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

    async function loadDefaultPresetFromFile() {
        try {
            const base = (window.WBAP.MODULE_BASE_PATH || '/scripts/extensions/third-party/writer-brianer/modules/');
            const url = base.replace(/modules\/?$/, 'prompts/memory_source.json');
            const res = await fetch(url);
            if (!res.ok) throw new Error(`fetch failed: ${res.status}`);
            const data = await res.json();
            const first = Array.isArray(data) ? data[0] : data;
            if (!first) return null;
            return {
                id: DEFAULT_PRESET_ID,
                name: first.name || '记忆管理1.13',
                description: first.description || '记忆模块默认提示词',
                systemPrompt: first.systemPrompt || FALLBACK_SYSTEM_PROMPT,
                userPrompt: first.userPrompt || FALLBACK_USER_PROMPT,
                variables: { ...DEFAULT_VARIABLES, ...(first.variables || {}) }
            };
        } catch (e) {
            Logger.warn(TAG, 'default memory preset load failed', e);
            return null;
        }
    }

    async function ensureDefaultPreset(memCfg) {
        const pool = getMemoryPool();
        if (!defaultPresetPromise) defaultPresetPromise = loadDefaultPresetFromFile();
        let preset = await defaultPresetPromise;
        if (!preset) preset = buildFallbackPreset();

        let mutated = false;
        let existing = pool.presets.find(p => p.id === DEFAULT_PRESET_ID);
        if (!existing) {
            pool.presets.unshift(preset);
            existing = preset;
            mutated = true;
        } else if (!existing.systemPrompt && preset.systemPrompt) {
            Object.assign(existing, preset);
            mutated = true;
        }
        if (memCfg) {
            const hasSelected = pool.presets.find(p => p.id === memCfg.selectedPresetId);
            if (!hasSelected) {
                memCfg.selectedPresetId = existing?.id || preset.id;
                mutated = true;
            }
        }
        if (mutated) saveConfig();
        return existing || preset;
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
        if (mem.model === undefined) mem.model = '';
        if (!mem.selectedPresetId) mem.selectedPresetId = DEFAULT_PRESET_ID;
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
        ids.forEach(uid => {
            const entry = book.entries[uid];
            if (entry && entry.content) parts.push(entry.content);
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
  <div class="wbap-modal-header">
    <h3>记忆模块</h3>
    <button id="wbap-memory-close" class="wbap-btn wbap-btn-icon">&times;</button>
  </div>
  <div class="wbap-modal-body" style="overflow:auto;display:flex;flex-direction:column;gap:12px;">
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
        <details class="wbap-collapsible" open>
          <summary class="wbap-collapsible-header">
            <i class="fa-solid fa-table"></i>
            <span>表格书配置</span>
          </summary>
          <div style="padding:8px 0 0 8px;">
            <div id="wbap-memory-selected-tables" class="wbap-tag-list" style="margin-bottom:8px;"></div>
            <div id="wbap-memory-table-config"></div>
          </div>
        </details>
        <details class="wbap-collapsible" open>
          <summary class="wbap-collapsible-header">
            <i class="fa-solid fa-book"></i>
            <span>总结书配置</span>
          </summary>
          <div style="padding:8px 0 0 8px;">
            <div id="wbap-memory-selected-summaries" class="wbap-tag-list" style="margin-bottom:8px;"></div>
            <div id="wbap-memory-summary-config"></div>
          </div>
        </details>
      </div>
    </div>

    <div class="wbap-box" style="padding:12px;">
      <div class="wbap-box-header" style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
        <strong>记忆提示词预设（独立）</strong>
        <select id="wbap-memory-preset-select" style="min-width:200px;"></select>
        <button id="wbap-memory-preset-add" class="wbap-btn wbap-btn-xs">新建</button>
        <button id="wbap-memory-preset-copy" class="wbap-btn wbap-btn-xs">复制</button>
        <button id="wbap-memory-preset-delete" class="wbap-btn wbap-btn-xs wbap-btn-danger">删除</button>
        <button id="wbap-memory-preset-reset" class="wbap-btn wbap-btn-xs">重置默认</button>
        <button id="wbap-memory-prompt-editor-btn" class="wbap-btn wbap-btn-xs wbap-btn-secondary">编辑提示词</button>
      </div>
      <div class="wbap-form-group" style="margin-top:8px;">
        <label>System Prompt</label>
        <textarea id="wbap-memory-system" rows="6" style="width:100%;"></textarea>
      </div>
      <div class="wbap-form-group">
        <label>User Prompt</label>
        <textarea id="wbap-memory-user" rows="6" style="width:100%;"></textarea>
      </div>
    </div>
  </div>
  <div class="wbap-modal-footer" style="display:flex;gap:8px;justify-content:flex-end;">
    <button id="wbap-memory-save" class="wbap-btn wbap-btn-primary">保存</button>
    <button id="wbap-memory-cancel" class="wbap-btn">关闭</button>
  </div>
</div>`;
        document.body.appendChild(modal);
        modal.addEventListener('click', (e) => { if (e.target === modal) modal.classList.remove('open'); });
        modal.querySelector('#wbap-memory-close').onclick = () => modal.classList.remove('open');
        modal.querySelector('#wbap-memory-cancel').onclick = () => modal.classList.remove('open');
    }

    function ensureMemoryApiModal() {
        if (document.getElementById('wbap-memory-api-modal')) return;
        const modal = document.createElement('div');
        modal.id = 'wbap-memory-api-modal';
        modal.className = 'wbap-modal';
        modal.innerHTML = `
<div class="wbap-modal-content" style="width:720px;max-width:95vw;max-height:90vh;display:flex;flex-direction:column;">
  <div class="wbap-modal-header">
    <h3>记忆模块独立 API</h3>
    <button id="wbap-memory-api-close" class="wbap-btn wbap-btn-icon">&times;</button>
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
  <div class="wbap-modal-header">
    <h3>编辑记忆提示词</h3>
    <button id="wbap-memory-prompt-close" class="wbap-btn wbap-btn-icon">&times;</button>
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
        <strong>自定义变量（可选）</strong>
        <button id="wbap-memory-variables-apply" class="wbap-btn wbap-btn-xs wbap-btn-primary">应用变量</button>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:8px;">
        <div>
          <label>sulv1</label>
          <input type="text" id="wbap-memory-var-sulv1" placeholder="变量 sulv1 的默认值">
        </div>
        <div>
          <label>sulv2</label>
          <input type="text" id="wbap-memory-var-sulv2" placeholder="变量 sulv2 的默认值">
        </div>
        <div>
          <label>sulv3</label>
          <input type="text" id="wbap-memory-var-sulv3" placeholder="变量 sulv3 的默认值">
        </div>
        <div>
          <label>sulv4</label>
          <input type="text" id="wbap-memory-var-sulv4" placeholder="变量 sulv4 的默认值">
        </div>
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
        document.getElementById('wbap-memory-var-sulv2').value = preset.variables?.sulv2 ?? '';
        document.getElementById('wbap-memory-var-sulv3').value = preset.variables?.sulv3 ?? '';
        document.getElementById('wbap-memory-var-sulv4').value = preset.variables?.sulv4 ?? '';

        const placeholderList = ['{worldbook_content}', '{table_content}', '{context}', '{user_input}', '{sulv1}', '{sulv2}', '{sulv3}', '{sulv4}'];
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
                preset.variables.sulv2 = document.getElementById('wbap-memory-var-sulv2').value || '';
                preset.variables.sulv3 = document.getElementById('wbap-memory-var-sulv3').value || '';
                preset.variables.sulv4 = document.getElementById('wbap-memory-var-sulv4').value || '';
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
                preset.variables.sulv2 = document.getElementById('wbap-memory-var-sulv2').value || preset.variables.sulv2 || '';
                preset.variables.sulv3 = document.getElementById('wbap-memory-var-sulv3').value || preset.variables.sulv3 || '';
                preset.variables.sulv4 = document.getElementById('wbap-memory-var-sulv4').value || preset.variables.sulv4 || '';
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
                    return `<label class="wbap-list-item"><input type="checkbox" value="${n}" ${checked}> <span>${n}</span></label>`;
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
        const parts = [];
        for (const name of mem.selectedTableBooks) {
            const cats = await loadTableCategories(name);
            if (!cats.length) {
                parts.push(`<div class="wbap-text-muted" style="margin-bottom:8px;">${name} 未检测到分类</div>`);
                continue;
            }
            const rows = cats.map(cat => {
                const selectId = `mem-table-${safeBtoa(name + '::' + cat).replace(/=/g, '')}`;
                return `<div class="wbap-config-row" style="display:flex;align-items:center;gap:8px;margin-bottom:6px;">
                    <div style="flex:1;min-width:140px;">${cat}</div>
                    <select data-type="table" data-book="${name}" data-category="${cat}" id="${selectId}" style="flex:1;min-width:160px;"></select>
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
    }

    function renderSummaryApiConfig() {
        const mem = ensureMemoryConfig();
        const box = document.getElementById('wbap-memory-summary-config');
        if (!box) return;
        if (!mem.selectedSummaryBooks.length) {
            box.innerHTML = '<div class="wbap-text-muted">未选择总结书</div>';
            return;
        }
        const rows = mem.selectedSummaryBooks.map(name => {
            const selectId = `mem-summary-${safeBtoa(name).replace(/=/g, '')}`;
            return `<div class="wbap-config-row" style="display:flex;align-items:center;gap:8px;margin-bottom:6px;">
                <div style="flex:1;min-width:140px;">${name}</div>
                <select data-type="summary" data-book="${name}" id="${selectId}" style="flex:1;min-width:160px;"></select>
            </div>`;
        }).join('');
        box.innerHTML = rows;
        box.querySelectorAll('select[data-type="summary"]').forEach(select => {
            const book = select.dataset.book;
            renderEndpointOptions(select, mem.summaryEndpoints?.[book] || '');
            select.addEventListener('change', (e) => {
                mem.summaryEndpoints[book] = e.target.value || '';
                saveConfig();
            });
        });
    }

    function getSelectedPreset(mem) {
        const pool = getMemoryPool();
        return pool.presets.find(p => p.id === mem.selectedPresetId) || pool.presets?.[0] || buildFallbackPreset();
    }

    function renderPresets() {
        const mem = ensureMemoryConfig();
        const pool = getMemoryPool();
        const select = document.getElementById('wbap-memory-preset-select');
        if (!select) return;
        select.innerHTML = '';
        pool.presets.forEach(preset => {
            const opt = document.createElement('option');
            opt.value = preset.id;
            opt.textContent = preset.name || preset.id;
            if (preset.id === mem.selectedPresetId) opt.selected = true;
            select.appendChild(opt);
        });
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
            const preset = await ensureDefaultPreset(mem);
            const existingIdx = pool.presets.findIndex(p => p.id === DEFAULT_PRESET_ID);
            if (existingIdx >= 0) pool.presets[existingIdx] = preset; else pool.presets.unshift(preset);
            mem.selectedPresetId = preset.id;
            saveConfig();
            renderPresets();
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
        });

        modal.querySelector('#wbap-memory-api-btn')?.addEventListener('click', (e) => {
            e.preventDefault();
            openMemoryApiModal();
        });

        modal.querySelector('#wbap-memory-prompt-editor-btn')?.addEventListener('click', (e) => {
            e.preventDefault();
            openMemoryPromptEditor();
        });

        modal.querySelector('#wbap-memory-save')?.addEventListener('click', () => {
            const mem = ensureMemoryConfig();
            mem.selectedTableBooks = collectSelected('wbap-memory-table-list');
            mem.selectedSummaryBooks = collectSelected('wbap-memory-summary-list');
            mem.model = document.getElementById('wbap-memory-model')?.value.trim() || '';
            mem.selectedPresetId = document.getElementById('wbap-memory-preset-select')?.value || mem.selectedPresetId;
            const preset = getSelectedPreset(mem);
            preset.systemPrompt = document.getElementById('wbap-memory-system')?.value || FALLBACK_SYSTEM_PROMPT;
            preset.userPrompt = document.getElementById('wbap-memory-user')?.value || FALLBACK_USER_PROMPT;
            document.querySelectorAll('#wbap-memory-table-config select[data-type="table"]').forEach(sel => {
                const book = sel.dataset.book;
                const cat = sel.dataset.category;
                if (!mem.tableCategoryEndpoints[book]) mem.tableCategoryEndpoints[book] = {};
                mem.tableCategoryEndpoints[book][cat] = sel.value || '';
            });
            document.querySelectorAll('#wbap-memory-summary-config select[data-type="summary"]').forEach(sel => {
                const book = sel.dataset.book;
                mem.summaryEndpoints[book] = sel.value || '';
            });
            saveConfig();
            renderStatusChip();
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

    function applyVariables(text, vars = {}) {
        let output = text || '';
        Object.entries(vars).forEach(([k, v]) => {
            // 使用占位符格式 {变量名} 进行替换
            output = output.replaceAll(`{${k}}`, v == null ? '' : String(v));
        });
        return output;
    }

    function buildMemoryBlock({ userInput = '', context = '', worldbookContent = '', tableContent = '', preset }) {
        const active = preset || buildFallbackPreset();
        const vars = active.variables || {};

        // 先应用 sulv1-4 变量，再应用内容占位符
        let system = applyVariables(active.systemPrompt || FALLBACK_SYSTEM_PROMPT, vars);
        let user = applyVariables(active.userPrompt || FALLBACK_USER_PROMPT, vars);

        // 应用内容占位符
        user = user
            .replaceAll('{worldbook_content}', worldbookContent || '')
            .replaceAll('{table_content}', tableContent || '')
            .replaceAll('{context}', context || '')
            .replaceAll('{user_input}', userInput || '');

        return { system, user };
    }

    function extractMemoryContent(text = '') {
        const m = text.match(/<memory>([\s\S]*?)<\/memory>/i);
        return (m ? m[1] : text).trim();
    }

    // 智能去重合并结果
    function mergeMemoryResults(pieces) {
        const seen = new Set();
        const uniqueLines = [];

        for (const piece of pieces) {
            const content = extractMemoryContent(piece);
            if (!content) continue;

            const lines = content.split('\n').map(l => l.trim()).filter(Boolean);
            for (const line of lines) {
                // 跳过完全相同的行
                if (seen.has(line)) continue;

                // 检查是否被已有内容包含（子串去重）
                let isDuplicate = false;
                for (const existing of seen) {
                    // 如果新行被已有行包含，跳过
                    if (existing.length > line.length && existing.includes(line)) {
                        isDuplicate = true;
                        break;
                    }
                    // 如果新行包含已有行，移除已有行
                    if (line.length > existing.length && line.includes(existing)) {
                        seen.delete(existing);
                        const idx = uniqueLines.indexOf(existing);
                        if (idx !== -1) uniqueLines.splice(idx, 1);
                    }
                }

                if (!isDuplicate) {
                    seen.add(line);
                    uniqueLines.push(line);
                }
            }
        }

        return uniqueLines.join('\n');
    }

    async function callMemoryEndpoint(block, endpoint, modelOverride = '') {
        if (!WBAP.callAI || !endpoint) return `${block.system}\n\n${block.user}`;
        try {
            return await WBAP.callAI(modelOverride || block.model || endpoint.model || '', block.user, block.system, endpoint);
        } catch (e) {
            Logger.error(TAG, 'memory endpoint failed', e);
            return `${block.system}\n\n${block.user}`;
        }
    }

    async function processMessage(options = {}) {
        const mem = ensureMemoryConfig();
        if (!mem.enabled) return '';

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
                context = WBAP.getRecentContext(WBAP.getCurrentChatContext(), WBAP.config?.contextRounds ?? 5);
            } catch (e) {
                // ignore
            }
        }

        const preset = await ensureDefaultPreset(mem);

        // 收集任务信息（用于进度条显示）
        const taskInfos = [];

        // 收集总结书任务信息
        for (const summaryName of mem.selectedSummaryBooks || []) {
            const ep = findEndpointById(mem.summaryEndpoints?.[summaryName]);
            taskInfos.push({
                id: `memory-summary-${summaryName}`,
                name: `总结: ${summaryName}`,
                type: 'summary',
                bookName: summaryName,
                endpoint: ep
            });
        }

        // 收集表格书任务信息（需要先加载分类）
        for (const bookName of mem.selectedTableBooks || []) {
            const categories = await loadTableCategories(bookName);
            for (const cat of categories) {
                const epId = mem.tableCategoryEndpoints?.[bookName]?.[cat];
                const ep = findEndpointById(epId);
                taskInfos.push({
                    id: `memory-table-${bookName}-${cat}`,
                    name: `表格: ${bookName}/${cat}`,
                    type: 'table',
                    bookName,
                    category: cat,
                    endpoint: ep
                });
            }
        }

        if (!taskInfos.length) {
            const block = buildMemoryBlock({ userInput, context, worldbookContent: '', tableContent: '', preset });
            return `${block.system}\n\n${block.user}`;
        }

        // 检查是否显示进度条
        const config = getCharacterConfig();
        const showProgress = config?.showProgressPanel && WBAP.UI;

        if (showProgress) {
            WBAP.UI.showProgressPanel('记忆模块处理中...', taskInfos.length);
            for (const info of taskInfos) {
                WBAP.UI.addProgressTask(info.id, info.name, '等待中...');
            }
        }

        // 构建并执行任务
        const taskPromises = taskInfos.map(async (info) => {
            try {
                if (showProgress) {
                    WBAP.UI.updateProgressTask(info.id, '处理中...', 10);
                }

                let result = '';
                if (info.type === 'summary') {
                    const content = await buildWorldbookContent([info.bookName]);
                    const block = buildMemoryBlock({ userInput, context, worldbookContent: content, tableContent: '', preset });
                    block.model = mem.model;
                    result = await callMemoryEndpoint(block, info.endpoint, mem.model);
                } else {
                    const tableContent = await loadCategoryContent(info.bookName, info.category);
                    const block = buildMemoryBlock({ userInput, context, worldbookContent: '', tableContent, preset });
                    block.model = mem.model;
                    result = await callMemoryEndpoint(block, info.endpoint, mem.model);
                }

                if (showProgress) {
                    WBAP.UI.updateProgressTask(info.id, '完成', 100);
                }
                return result;
            } catch (e) {
                Logger.error(TAG, 'memory task failed', info.name, e);
                if (showProgress) {
                    WBAP.UI.updateProgressTask(info.id, `失败: ${(e?.message || '').slice(0, 20)}`, 100);
                }
                return '';
            }
        });

        // 并发执行所有任务
        const results = await Promise.all(taskPromises);

        // 隐藏进度条
        if (showProgress) {
            WBAP.UI.hideProgressPanel();
        }

        // 智能去重合并
        const body = mergeMemoryResults(results);
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
