(function() {
    'use strict';

    const Logger = {
        log: console.log.bind(console, '[条目选择]'),
        error: console.error.bind(console, '[条目选择]')
    };

    // 简易条目选择模态框
    const MODAL_HTML = `
    <div id="wbap-entry-modal" class="wbap-modal">
        <div class="wbap-modal-content" style="width:600px;max-width:95vw;max-height:90vh;display:flex;flex-direction:column;">
            <div class="wbap-modal-header">
                <h3 id="wbap-entry-modal-title">选择条目</h3>
                <button id="wbap-entry-close" class="wbap-btn wbap-btn-icon">&times;</button>
            </div>
            <div id="wbap-entry-list" class="wbap-modal-body" style="overflow:auto;padding:12px;"></div>
            <div class="wbap-modal-footer">
                <button id="wbap-entry-select-all" class="wbap-btn wbap-btn-secondary">全选</button>
                <button id="wbap-entry-clear" class="wbap-btn wbap-btn-secondary">清空</button>
                <button id="wbap-entry-confirm" class="wbap-btn wbap-btn-primary">确认</button>
            </div>
        </div>
    </div>`;

    function ensureModal() {
        if (document.getElementById('wbap-entry-modal')) return;
        const div = document.createElement('div');
        div.innerHTML = MODAL_HTML;
        document.body.appendChild(div.firstElementChild);
        document.getElementById('wbap-entry-close').onclick = () => hideModal();
        document.getElementById('wbap-entry-clear').onclick = () => {
            document.querySelectorAll('#wbap-entry-list input[type="checkbox"]').forEach(cb => cb.checked = false);
        };
        document.getElementById('wbap-entry-select-all').onclick = () => {
            document.querySelectorAll('#wbap-entry-list input[type="checkbox"]').forEach(cb => cb.checked = true);
        };
    }

    function hideModal() {
        const m = document.getElementById('wbap-entry-modal');
        if (m) m.classList.remove('open');
        window.WBAP?.syncMobileRootFix?.();
    }

    function getCurrentApiEndpoint() {
        const pools = WBAP.getGlobalPools ? WBAP.getGlobalPools() : (WBAP.mainConfig?.globalPools || {});
        const endpoints = pools?.selectiveMode?.apiEndpoints || [];
        if (!window.wbapCurrentEndpointId) return null;
        return endpoints.find(e => e.id === window.wbapCurrentEndpointId) || null;
    }

    function getSelectedEntryIds(ep, bookName) {
        if (!ep) return [];
        const cfg = WBAP.CharacterManager?.getCurrentCharacterConfig?.() || WBAP.config || {};
        const bindings = cfg.selectiveMode?.endpointBindings || {};
        const binding = bindings[ep.id] || {};
        const map = binding.assignedEntriesMap || {};
        const fromMap = map[bookName];
        if (Array.isArray(fromMap)) return fromMap;
        return [];
    }

    function detectTableWorldBook(entries) {
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
        const tableLike = comments.filter(c => /\bIndex\s+for\s+/i.test(c)).length;
        const hasMarkdownTable = Object.values(entries).some(e => /\|\s*---\s*\|/.test(e?.content || ''));
        return tableLike >= 3 && hasMarkdownTable;
    }

    function getCategoryFromComment(comment = '', uid = '') {
        // 识别插件生成的总结书条目 - 统一归类为大总结或小总结
        // 优先检查comment，如果为空则检查uid
        const text = (comment || '').trim() || uid;

        if (text.endsWith('楼小总结')) {
            return '小总结';
        }
        if (text.endsWith('楼大总结')) {
            return '大总结';
        }

        // 原有的 Amily 总结书和表格书识别逻辑
        const idx = comment.match(/Index\s+for\s+(.+)/i);
        if (idx) return idx[1].trim();
        const det = comment.match(/Detail:\s*([^-]+)\s*-/i);
        if (det) return det[1].trim();
        const old = comment.match(/【([^】]+)】/);
        if (old) return old[1].trim();
        return '未分类';
    }

    function groupEntriesByCategory(entries) {
        const groups = new Map();
        Object.entries(entries || {}).forEach(([uid, entry]) => {
            if (entry.disable === true) return;
            const cat = getCategoryFromComment(entry.comment || '', uid);
            if (!groups.has(cat)) groups.set(cat, []);
            groups.get(cat).push(uid);
        });
        return groups;
    }

    async function showEntrySelector(bookName) {
        ensureModal();
        const modal = document.getElementById('wbap-entry-modal');
        modal.classList.add('open');
        window.WBAP?.syncMobileRootFix?.();
        document.getElementById('wbap-entry-modal-title').textContent = `${bookName} 条目选择`;
        const list = document.getElementById('wbap-entry-list');
        list.innerHTML = '<div style="padding:20px;text-align:center;"><i class="fa-solid fa-spinner fa-spin"></i> 加载中...</div>';
        try {
            const book = await WBAP.loadWorldBookEntriesByName(bookName);
            if (!book || !book.entries) {
                list.textContent = '无法加载世界书';
                return;
            }
            const entries = Object.entries(book.entries).filter(([uid, e]) => e.disable !== true);
            if (entries.length === 0) {
                list.textContent = '无可用条目';
                return;
            }
            const ep = getCurrentApiEndpoint();
            const selected = new Set(getSelectedEntryIds(ep, bookName));

            const isTable = detectTableWorldBook(book.entries);
            if (isTable) {
                const groups = groupEntriesByCategory(book.entries);
                let html = '';
                groups.forEach((uids, cat) => {
                    const allSelected = uids.every(id => selected.has(String(id)));
                    // 对于插件总结书，计算并显示楼层范围
                    let displayText = cat;
                    if (cat === '大总结' || cat === '小总结') {
                        let minFloor = Infinity;
                        let maxFloor = -Infinity;
                        uids.forEach(uid => {
                            const entry = book.entries[uid];
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
                            displayText = `${cat}：${minFloor}-${maxFloor}楼`;
                        } else {
                            displayText = `${cat}（${uids.length} 条）`;
                        }
                    } else {
                        displayText = `${cat}（${uids.length} 条）`;
                    }
                    html += `<label style="display:flex;gap:6px;align-items:center;margin-bottom:6px;"><input type="checkbox" data-ids="${uids.join(',')}" value="${cat}" ${allSelected ? 'checked' : ''}><span>${displayText}</span></label>`;
                });
                list.innerHTML = html || '<div>无可用栏目</div>';
                document.getElementById('wbap-entry-confirm').onclick = () => {
                    const ids = [];
                    list.querySelectorAll('input[type="checkbox"]').forEach(cb => {
                        if (cb.checked) {
                            const raw = cb.dataset.ids || '';
                            ids.push(...raw.split(',').filter(Boolean));
                        }
                    });
                    saveSelectedEntries(bookName, ids);
                    hideModal();
                };
            } else {
                let html = '';
                entries.forEach(([uid, entry]) => {
                    const title = entry.comment || uid;
                    html += `<label style="display:flex;gap:6px;align-items:center;margin-bottom:6px;"><input type="checkbox" value="${uid}" ${selected.has(uid) ? 'checked' : ''}><span>${title}</span></label>`;
                });
                list.innerHTML = html;
                document.getElementById('wbap-entry-confirm').onclick = () => {
                    const ids = [...list.querySelectorAll('input[type="checkbox"]')].filter(cb => cb.checked).map(cb => cb.value);
                    saveSelectedEntries(bookName, ids);
                    hideModal();
                };
            }
        } catch (e) {
            Logger.error(e);
            list.textContent = '加载失败';
        }
    }

    function saveSelectedEntries(bookName, ids) {
        const ep = getCurrentApiEndpoint();
        if (!ep) {
            alert('??????API??');
            return;
        }
        const cfg = WBAP.CharacterManager?.getCurrentCharacterConfig?.() || WBAP.config || {};
        if (!cfg.selectiveMode) cfg.selectiveMode = { endpointBindings: {} };
        if (!cfg.selectiveMode.endpointBindings) cfg.selectiveMode.endpointBindings = {};
        const binding = cfg.selectiveMode.endpointBindings[ep.id] || { worldBooks: [], assignedEntriesMap: {} };
        if (!Array.isArray(binding.worldBooks)) binding.worldBooks = [];
        if (!binding.worldBooks.includes(bookName)) binding.worldBooks.push(bookName);
        if (!binding.assignedEntriesMap) binding.assignedEntriesMap = {};
        binding.assignedEntriesMap[bookName] = ids;
        cfg.selectiveMode.endpointBindings[ep.id] = binding;
        WBAP.saveConfig();
        if (WBAP.UI?.renderApiEndpoints) {
            WBAP.UI.renderApiEndpoints();
        }
        Logger.log(`?????(${bookName})?${ids.length} ?`);
    }

    // 暴露
    window.showEntrySelector = showEntrySelector;
})();
