/**
 * 编辑指令解析器 - 单元测试
 *
 * Feature: table-display-module
 * Tests for: extractTableEditTag, extractContentTag, parseEditInstructions, executeInstructions
 *
 * **Validates: Requirements 6.1, 6.2, 6.3, 6.4, 6.5, 6.6, 6.7**
 */
import { describe, it, expect, beforeEach } from 'vitest';

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

/** Helper: create a template and table with given columns, return table uid */
function setupTable(columns) {
    const tpl = TD.importTemplate(JSON.stringify({ name: 'T', columns }));
    const table = TD.createTable(tpl.uid);
    return table.uid;
}

// ==================== extractTableEditTag ====================

describe('extractTableEditTag', () => {
    it('extracts tableEdit tag content from message', () => {
        const msg = '正文内容<tableEdit><!--\ninsertRow(0, {"0":"a"})\n--></tableEdit>尾部';
        const result = TD.extractTableEditTag(msg);
        expect(result.editString).toBe('<!--\ninsertRow(0, {"0":"a"})\n-->');
        expect(result.content).toBe('正文内容尾部');
    });

    it('handles multiple tableEdit tags', () => {
        const msg = 'A<tableEdit>edit1</tableEdit>B<tableEdit>edit2</tableEdit>C';
        const result = TD.extractTableEditTag(msg);
        expect(result.editString).toBe('edit1\nedit2');
        expect(result.content).toBe('ABC');
    });

    it('returns original message when no tag found', () => {
        const msg = '没有标签的消息';
        const result = TD.extractTableEditTag(msg);
        expect(result.content).toBe(msg);
        expect(result.editString).toBe('');
    });

    it('handles empty/null input', () => {
        expect(TD.extractTableEditTag('').editString).toBe('');
        expect(TD.extractTableEditTag(null).editString).toBe('');
        expect(TD.extractTableEditTag(undefined).editString).toBe('');
    });

    it('supports custom tag name', () => {
        const msg = 'text<myTag>data</myTag>rest';
        const result = TD.extractTableEditTag(msg, 'myTag');
        expect(result.editString).toBe('data');
        expect(result.content).toBe('textrest');
    });
});

// ==================== extractContentTag ====================

describe('extractContentTag', () => {
    it('extracts content tag', () => {
        const msg = '<content>正文</content><tableEdit>edit</tableEdit>';
        const result = TD.extractContentTag(msg);
        expect(result.content).toBe('正文');
        expect(result.rest).toBe('<tableEdit>edit</tableEdit>');
    });

    it('returns full message as content when no tag', () => {
        const msg = '没有标签';
        const result = TD.extractContentTag(msg);
        expect(result.content).toBe(msg);
        expect(result.rest).toBe('');
    });

    it('supports custom tag name', () => {
        const msg = '<body>内容</body>其他';
        const result = TD.extractContentTag(msg, 'body');
        expect(result.content).toBe('内容');
        expect(result.rest).toBe('其他');
    });

    it('handles empty input', () => {
        expect(TD.extractContentTag('').content).toBe('');
        expect(TD.extractContentTag(null).content).toBe('');
    });
});

// ==================== parseEditInstructions ====================

describe('parseEditInstructions', () => {
    it('parses insertRow instruction', () => {
        const edit = 'insertRow(0, {"0":"角色A","1":"描述"})';
        const result = TD.parseEditInstructions(edit);
        expect(result).toHaveLength(1);
        expect(result[0]).toEqual({
            type: 'insert',
            tableIndex: 0,
            data: { '0': '角色A', '1': '描述' }
        });
    });

    it('parses updateRow instruction', () => {
        const edit = 'updateRow(1, 2, {"1":"更新后"})';
        const result = TD.parseEditInstructions(edit);
        expect(result).toHaveLength(1);
        expect(result[0]).toEqual({
            type: 'update',
            tableIndex: 1,
            rowIndex: 2,
            data: { '1': '更新后' }
        });
    });

    it('parses deleteRow instruction', () => {
        const edit = 'deleteRow(0, 5)';
        const result = TD.parseEditInstructions(edit);
        expect(result).toHaveLength(1);
        expect(result[0]).toEqual({
            type: 'delete',
            tableIndex: 0,
            rowIndex: 5
        });
    });

    it('parses multiple mixed instructions', () => {
        const edit = `<!--
insertRow(0, {"0":"A","1":"B"})
updateRow(1, 0, {"0":"C"})
deleteRow(0, 3)
-->`;
        const result = TD.parseEditInstructions(edit);
        expect(result).toHaveLength(3);
        expect(result[0].type).toBe('insert');
        expect(result[1].type).toBe('update');
        expect(result[2].type).toBe('delete');
    });

    it('skips invalid instructions gracefully', () => {
        const edit = `insertRow(0, {"0":"ok"})
invalidFunc(1,2)
updateRow(bad_args)
deleteRow(0, 1)`;
        const result = TD.parseEditInstructions(edit);
        expect(result).toHaveLength(2);
        expect(result[0].type).toBe('insert');
        expect(result[1].type).toBe('delete');
    });

    it('returns empty array for empty/null input', () => {
        expect(TD.parseEditInstructions('')).toEqual([]);
        expect(TD.parseEditInstructions(null)).toEqual([]);
        expect(TD.parseEditInstructions(undefined)).toEqual([]);
    });
});

// ==================== classifyParams ====================

describe('classifyParams', () => {
    it('splits simple params', () => {
        expect(TD.classifyParams('0, 1')).toEqual(['0', '1']);
    });

    it('keeps JSON objects intact', () => {
        const result = TD.classifyParams('0, {"0":"a","1":"b"}');
        expect(result).toEqual(['0', '{"0":"a","1":"b"}']);
    });

    it('handles three params with JSON', () => {
        const result = TD.classifyParams('1, 2, {"1":"x"}');
        expect(result).toEqual(['1', '2', '{"1":"x"}']);
    });

    it('returns empty for null', () => {
        expect(TD.classifyParams(null)).toEqual([]);
    });
});

// ==================== executeInstructions ====================

describe('executeInstructions', () => {
    beforeEach(resetStorage);

    it('executes insertRow instruction', () => {
        const tableUid = setupTable(['名前', '説明']);
        const instructions = [{ type: 'insert', tableIndex: 0, data: { '0': 'Alice', '1': 'Desc' } }];
        const result = TD.executeInstructions(instructions);
        expect(result).toBe(true);

        const table = TD.getTable(tableUid);
        expect(table.rows).toHaveLength(1);
        expect(table.rows[0].cells).toEqual(['Alice', 'Desc']);
    });

    it('executes updateRow instruction', () => {
        const tableUid = setupTable(['A', 'B']);
        TD.insertRow(tableUid, { '0': 'old', '1': 'val' });

        const instructions = [{ type: 'update', tableIndex: 0, rowIndex: 0, data: { '0': 'new' } }];
        TD.executeInstructions(instructions);

        const table = TD.getTable(tableUid);
        expect(table.rows[0].cells[0]).toBe('new');
        expect(table.rows[0].cells[1]).toBe('val');
    });

    it('executes deleteRow instruction', () => {
        const tableUid = setupTable(['X']);
        TD.insertRow(tableUid, { '0': 'r0' });
        TD.insertRow(tableUid, { '0': 'r1' });

        const instructions = [{ type: 'delete', tableIndex: 0, rowIndex: 0 }];
        TD.executeInstructions(instructions);

        const table = TD.getTable(tableUid);
        expect(table.rows).toHaveLength(1);
        expect(table.rows[0].cells[0]).toBe('r1');
    });

    it('returns false for out-of-range tableIndex', () => {
        setupTable(['A']);
        const result = TD.executeInstructions([{ type: 'insert', tableIndex: 99, data: { '0': 'x' } }]);
        expect(result).toBe(false);
    });

    it('returns true for empty instructions', () => {
        expect(TD.executeInstructions([])).toBe(true);
        expect(TD.executeInstructions(null)).toBe(true);
    });

    it('handles mixed valid and invalid instructions', () => {
        const tableUid = setupTable(['A']);
        TD.insertRow(tableUid, { '0': 'keep' });

        const instructions = [
            { type: 'insert', tableIndex: 0, data: { '0': 'new' } },
            { type: 'delete', tableIndex: 99, rowIndex: 0 } // invalid
        ];
        const result = TD.executeInstructions(instructions);
        expect(result).toBe(false); // partial failure

        const table = TD.getTable(tableUid);
        expect(table.rows).toHaveLength(2); // insert succeeded
    });
});
