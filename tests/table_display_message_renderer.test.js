/**
 * 消息渲染器 - 单元测试
 *
 * Feature: table-display-module
 * Tests for: renderTableContent, renderTableArea, renderTableInMessage
 *
 * **Validates: Requirements 7.1, 7.2, 7.3, 7.4, 7.5, 7.6, 7.7**
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { JSDOM } from 'jsdom';

// Setup minimal DOM
const dom = new JSDOM('<!DOCTYPE html><html><body><div id="chat"></div></body></html>');
globalThis.document = dom.window.document;
globalThis.HTMLElement = dom.window.HTMLElement;
globalThis.MouseEvent = dom.window.MouseEvent;
globalThis.MutationObserver = dom.window.MutationObserver;

// Setup WBAP global before loading module
globalThis.window = globalThis.window || {};
globalThis.window.WBAP = globalThis.window.WBAP || { Logger: console };
globalThis.WBAP = globalThis.window.WBAP;

let mockGlobalPools = {};
let mockCharacterConfig = {};

WBAP.getGlobalPools = () => mockGlobalPools;
WBAP.mainConfig = { globalPools: mockGlobalPools };
WBAP.CharacterManager = {
    getCurrentCharacterConfig: () => mockCharacterConfig
};
WBAP.config = mockCharacterConfig;
WBAP.saveConfig = async () => {};

await import('../modules/table_display.js');

const TD = window.WBAP.TableDisplay;

function resetStorage() {
    mockGlobalPools = {};
    mockCharacterConfig = {};
    WBAP.mainConfig = { globalPools: mockGlobalPools };
    WBAP.config = mockCharacterConfig;
    TD.ensureTableDisplayConfig();
}

/** Helper: create a template and table with rows */
function setupTableWithRows(columns, rows) {
    const tpl = TD.importTemplate(JSON.stringify({ name: 'TestTable', columns }));
    const table = TD.createTable(tpl.uid);
    for (const row of rows) {
        const data = {};
        row.forEach((val, i) => { data[i] = val; });
        TD.insertRow(table.uid, data);
    }
    return table.uid;
}

/** Helper: create a fake message element in #chat */
function createMessageElement(messageId, isUser = false) {
    const chat = document.getElementById('chat');
    chat.innerHTML = '';
    const mes = document.createElement('div');
    mes.className = isUser ? 'mes mes_user' : 'mes';
    mes.setAttribute('mesid', String(messageId));
    const mesText = document.createElement('div');
    mesText.className = 'mes_text';
    mesText.textContent = 'Hello world';
    mes.appendChild(mesText);
    chat.appendChild(mes);
    return mes;
}

// ==================== renderTableContent ====================

describe('renderTableContent', () => {
    beforeEach(() => resetStorage());

    it('renders empty state for null data', () => {
        const el = TD.renderTableContent(null);
        expect(el.textContent).toContain('无数据');
    });

    it('renders table with headers and rows', () => {
        const tableUid = setupTableWithRows(['Name', 'Value'], [['Alice', '100'], ['Bob', '200']]);
        const tableData = TD.getTable(tableUid);
        const el = TD.renderTableContent(tableData);

        const ths = el.querySelectorAll('th');
        expect(ths.length).toBe(2);
        expect(ths[0].textContent).toBe('Name');
        expect(ths[1].textContent).toBe('Value');

        const tds = el.querySelectorAll('td');
        expect(tds.length).toBe(4);
        expect(tds[0].textContent).toBe('Alice');
        expect(tds[3].textContent).toBe('200');
    });

    it('renders table with no rows', () => {
        const tpl = TD.importTemplate(JSON.stringify({ name: 'Empty', columns: ['A', 'B'] }));
        const table = TD.createTable(tpl.uid);
        const el = TD.renderTableContent(table);

        expect(el.querySelectorAll('th').length).toBe(2);
        expect(el.querySelectorAll('td').length).toBe(0);
    });
});

// ==================== renderTableArea ====================

describe('renderTableArea', () => {
    beforeEach(() => resetStorage());

    it('returns null when no tables exist', () => {
        const result = TD.renderTableArea(1);
        expect(result).toBeNull();
    });

    it('renders area with header and tabs for tables', () => {
        setupTableWithRows(['Col1'], [['val1']]);
<<<<<<< HEAD
        TD.setEnabled(true);
=======
>>>>>>> dae4bfa60fca13428926bfd24c57114d55975830
        const area = TD.renderTableArea(1);

        expect(area).not.toBeNull();
        expect(area.classList.contains('wbap-td-area')).toBe(true);

        // Header exists
        const header = area.querySelector('.wbap-td-header');
        expect(header).not.toBeNull();

        // Body is collapsed by default
        const body = area.querySelector('.wbap-td-body');
        expect(body.style.display).toBe('none');

        // Tab exists
        const tabs = area.querySelectorAll('.wbap-td-tab');
        expect(tabs.length).toBe(1);
    });

    it('toggles collapse on header click', () => {
        setupTableWithRows(['A'], [['1']]);
<<<<<<< HEAD
        TD.setEnabled(true);
=======
>>>>>>> dae4bfa60fca13428926bfd24c57114d55975830
        const area = TD.renderTableArea(1);
        const header = area.querySelector('.wbap-td-header');
        const body = area.querySelector('.wbap-td-body');

        // Click to expand
        header.click();
        expect(body.style.display).toBe('block');

        // Click to collapse
        header.click();
        expect(body.style.display).toBe('none');
    });

    it('switches tabs on click', () => {
        // Create two tables
        setupTableWithRows(['A'], [['1']]);
        setupTableWithRows(['B'], [['2']]);
<<<<<<< HEAD
        TD.setEnabled(true);
=======

>>>>>>> dae4bfa60fca13428926bfd24c57114d55975830
        const area = TD.renderTableArea(1);
        const tabs = area.querySelectorAll('.wbap-td-tab');
        const panels = area.querySelectorAll('.wbap-td-panel');

        expect(tabs.length).toBe(2);

        // First tab active by default
        expect(panels[0].style.display).toBe('block');
        expect(panels[1].style.display).toBe('none');

        // Click second tab
        tabs[1].click();
        expect(panels[0].style.display).toBe('none');
        expect(panels[1].style.display).toBe('block');
    });
});

// ==================== renderTableInMessage ====================

describe('renderTableInMessage', () => {
    beforeEach(() => {
        resetStorage();
        document.getElementById('chat').innerHTML = '';
    });

    it('does nothing when module is disabled', () => {
        setupTableWithRows(['A'], [['1']]);
        TD.setEnabled(false);
        createMessageElement(1);

        TD.renderTableInMessage(1);
        expect(document.querySelector('.wbap-td-area')).toBeNull();
    });

    it('does nothing when renderInMessage is false', () => {
        setupTableWithRows(['A'], [['1']]);
        TD.setEnabled(true);
        const charConfig = TD.getCharacterTableDisplayConfig();
        charConfig.renderInMessage = false;
        createMessageElement(1);

        TD.renderTableInMessage(1);
        expect(document.querySelector('.wbap-td-area')).toBeNull();
    });

    it('injects table area into AI message', () => {
        setupTableWithRows(['A'], [['1']]);
        TD.setEnabled(true);
        const charConfig = TD.getCharacterTableDisplayConfig();
        charConfig.renderInMessage = true;
        createMessageElement(1);

        TD.renderTableInMessage(1);
        const area = document.querySelector('.wbap-td-area');
        expect(area).not.toBeNull();
    });

    it('skips user messages', () => {
        setupTableWithRows(['A'], [['1']]);
        TD.setEnabled(true);
        const charConfig = TD.getCharacterTableDisplayConfig();
        charConfig.renderInMessage = true;
        createMessageElement(1, true);

        TD.renderTableInMessage(1);
        expect(document.querySelector('.wbap-td-area')).toBeNull();
    });

    it('does not inject twice', () => {
        setupTableWithRows(['A'], [['1']]);
        TD.setEnabled(true);
        const charConfig = TD.getCharacterTableDisplayConfig();
        charConfig.renderInMessage = true;
        createMessageElement(1);

        TD.renderTableInMessage(1);
        TD.renderTableInMessage(1);
        const areas = document.querySelectorAll('.wbap-td-area');
        expect(areas.length).toBe(1);
    });
});
