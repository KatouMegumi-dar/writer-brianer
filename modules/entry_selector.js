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
        const endpoints = WBAP.config?.selectiveMode?.apiEndpoints || [];
        if (!window.wbapCurrentEndpointId) return null;
        return endpoints.find(e => e.id === window.wbapCurrentEndpointId) || null;
    }

    function getSelectedEntryIds(ep, bookName) {
        if (!ep) return [];
        const map = ep.assignedEntriesMap || {};
        const fromMap = map[bookName];
        if (Array.isArray(fromMap)) return fromMap;

        // 兼容旧字段
        if (ep.worldBook === bookName && Array.isArray(ep.assignedEntries)) {
            return ep.assignedEntries;
        }
        return [];
    }

    function detectTableWorldBook(entries) {
        if (!entries) return false;
        const comments = Object.values(entries).map(e => e?.comment || '');
        const tableLike = comments.filter(c => /\bIndex\s+for\s+/i.test(c)).length;
        const hasMarkdownTable = Object.values(entries).some(e => /\|\s*---\s*\|/.test(e?.content || ''));
        return tableLike >= 3 && hasMarkdownTable;
    }

    function getCategoryFromComment(comment = '') {
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
            const cat = getCategoryFromComment(entry.comment || '');
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
                    html += `<label style="display:flex;gap:6px;align-items:center;margin-bottom:6px;"><input type="checkbox" data-ids="${uids.join(',')}" value="${cat}" ${allSelected ? 'checked' : ''}><span>${cat}（${uids.length} 条）</span></label>`;
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
            alert('请先选择一个 API 实例');
            return;
        }
        if (!Array.isArray(ep.worldBooks)) ep.worldBooks = [];
        if (!ep.worldBooks.includes(bookName)) ep.worldBooks.push(bookName);
        if (!ep.assignedEntriesMap) ep.assignedEntriesMap = {};
        ep.assignedEntriesMap[bookName] = ids;
        delete ep.worldBook;
        delete ep.assignedEntries;
        WBAP.saveConfig();
        if (WBAP.UI?.renderApiEndpoints) {
            WBAP.UI.renderApiEndpoints();
        }
        Logger.log(`已保存条目(${bookName})：${ids.length} 条`);
    }

    // 暴露
    window.showEntrySelector = showEntrySelector;
})();
