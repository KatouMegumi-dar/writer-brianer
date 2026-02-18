/**
 * Property 6: 标签提取正确性
 * Property 7: 编辑指令解析正确性
 * Property 8: 编辑指令执行正确性
 * Property 9: 无效指令容错性
 *
 * Feature: table-display-module
 *
 * **Validates: Requirements 6.2, 6.3, 6.4, 6.5, 6.6, 6.7**
 */
import { describe, it, expect, beforeEach } from 'vitest';
import fc from 'fast-check';

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

/** Helper: create a template and table, return table uid */
function setupTable(columns) {
    const tpl = TD.importTemplate(JSON.stringify({ name: 'T', columns }));
    const table = TD.createTable(tpl.uid);
    return table.uid;
}

// ==================== Arbitraries ====================

/** Arbitrary for safe text that won't contain XML-like tags */
const safeTextArb = fc.string({ minLength: 0, maxLength: 80 })
    .map(s => s.replace(/[<>]/g, ''));

/** Arbitrary for tag names (simple alphanumeric) */
const tagNameArb = fc.string({ minLength: 1, maxLength: 12 })
    .map(s => s.replace(/[^a-zA-Z]/g, '') || 'tag');

/** Arbitrary for valid column names */
const columnArb = fc.string({ minLength: 1, maxLength: 15 }).filter(s => s.trim().length > 0);

/** Arbitrary for cell value strings (no special chars that break JSON) */
const cellValueArb = fc.string({ minLength: 0, maxLength: 30 })
    .map(s => s.replace(/["\\\x00-\x1f]/g, ''));

/** Arbitrary for a non-negative small integer (table/row index) */
const smallIndexArb = fc.integer({ min: 0, max: 9 });

/** Arbitrary for row data as Record<number, string> given column count */
function rowDataArb(numCols) {
    return fc.tuple(
        ...Array.from({ length: numCols }, () => cellValueArb)
    ).map(vals => {
        const obj = {};
        vals.forEach((v, i) => { obj[i] = v; });
        return obj;
    });
}

/** Build an insertRow instruction string */
function buildInsertStr(tableIndex, data) {
    return `insertRow(${tableIndex}, ${JSON.stringify(data)})`;
}

/** Build an updateRow instruction string */
function buildUpdateStr(tableIndex, rowIndex, data) {
    return `updateRow(${tableIndex}, ${rowIndex}, ${JSON.stringify(data)})`;
}

/** Build a deleteRow instruction string */
function buildDeleteStr(tableIndex, rowIndex) {
    return `deleteRow(${tableIndex}, ${rowIndex})`;
}

// ==================== Property 6: 标签提取正确性 ====================

describe('Feature: table-display-module, Property 6: 标签提取正确性', () => {
    /**
     * **Validates: Requirements 6.2**
     *
     * For any message containing <tagName>...</tagName> and <tableEdit>...</tableEdit>,
     * the extraction function should correctly separate body content and edit instruction string.
     */
    it('extractTableEditTag correctly separates body and edit content', () => {
        fc.assert(
            fc.property(safeTextArb, safeTextArb, safeTextArb, (before, editContent, after) => {
                const message = `${before}<tableEdit>${editContent}</tableEdit>${after}`;
                const result = TD.extractTableEditTag(message);

                // Edit string should contain the inner content
                expect(result.editString).toBe(editContent);
                // Body content should have the tag removed
                expect(result.content).toBe(`${before}${after}`.trim());
            }),
            { numRuns: 100 }
        );
    });

    /**
     * **Validates: Requirements 6.2**
     *
     * extractContentTag correctly separates <content> body from the rest.
     */
    it('extractContentTag correctly separates content tag body from rest', () => {
        fc.assert(
            fc.property(safeTextArb, safeTextArb, (bodyText, restText) => {
                const message = `<content>${bodyText}</content>${restText}`;
                const result = TD.extractContentTag(message);

                expect(result.content).toBe(bodyText.trim());
                expect(result.rest).toBe(restText.trim());
            }),
            { numRuns: 100 }
        );
    });

    /**
     * **Validates: Requirements 6.2**
     *
     * extractTableEditTag with custom tag name works correctly.
     */
    it('extractTableEditTag works with arbitrary tag names', () => {
        fc.assert(
            fc.property(tagNameArb, safeTextArb, safeTextArb, (tag, editContent, surrounding) => {
                const message = `${surrounding}<${tag}>${editContent}</${tag}>`;
                const result = TD.extractTableEditTag(message, tag);

                expect(result.editString).toBe(editContent);
                expect(result.content).toBe(surrounding.trim());
            }),
            { numRuns: 100 }
        );
    });
});

// ==================== Property 7: 编辑指令解析正确性 ====================

describe('Feature: table-display-module, Property 7: 编辑指令解析正确性', () => {
    /**
     * **Validates: Requirements 6.3**
     *
     * For any valid insertRow instruction string, parseEditInstructions returns
     * a correct instruction object.
     */
    it('parseEditInstructions correctly parses insertRow instructions', () => {
        fc.assert(
            fc.property(
                smallIndexArb,
                fc.integer({ min: 1, max: 5 }),
                (tableIndex, numCols) => {
                    const data = {};
                    for (let i = 0; i < numCols; i++) data[i] = `v${i}`;

                    const editStr = buildInsertStr(tableIndex, data);
                    const result = TD.parseEditInstructions(editStr);

                    expect(result).toHaveLength(1);
                    expect(result[0].type).toBe('insert');
                    expect(result[0].tableIndex).toBe(tableIndex);
                    expect(result[0].data).toEqual(data);
                }
            ),
            { numRuns: 100 }
        );
    });

    /**
     * **Validates: Requirements 6.3**
     *
     * For any valid updateRow instruction string, parseEditInstructions returns
     * a correct instruction object.
     */
    it('parseEditInstructions correctly parses updateRow instructions', () => {
        fc.assert(
            fc.property(
                smallIndexArb,
                smallIndexArb,
                fc.integer({ min: 1, max: 5 }),
                (tableIndex, rowIndex, numCols) => {
                    const data = {};
                    for (let i = 0; i < numCols; i++) data[i] = `u${i}`;

                    const editStr = buildUpdateStr(tableIndex, rowIndex, data);
                    const result = TD.parseEditInstructions(editStr);

                    expect(result).toHaveLength(1);
                    expect(result[0].type).toBe('update');
                    expect(result[0].tableIndex).toBe(tableIndex);
                    expect(result[0].rowIndex).toBe(rowIndex);
                    expect(result[0].data).toEqual(data);
                }
            ),
            { numRuns: 100 }
        );
    });

    /**
     * **Validates: Requirements 6.3**
     *
     * For any valid deleteRow instruction string, parseEditInstructions returns
     * a correct instruction object.
     */
    it('parseEditInstructions correctly parses deleteRow instructions', () => {
        fc.assert(
            fc.property(smallIndexArb, smallIndexArb, (tableIndex, rowIndex) => {
                const editStr = buildDeleteStr(tableIndex, rowIndex);
                const result = TD.parseEditInstructions(editStr);

                expect(result).toHaveLength(1);
                expect(result[0].type).toBe('delete');
                expect(result[0].tableIndex).toBe(tableIndex);
                expect(result[0].rowIndex).toBe(rowIndex);
            }),
            { numRuns: 100 }
        );
    });

    /**
     * **Validates: Requirements 6.3**
     *
     * For any combination of valid instructions wrapped in HTML comments,
     * parseEditInstructions returns the correct count and types.
     */
    it('parseEditInstructions handles mixed instructions in HTML comments', () => {
        fc.assert(
            fc.property(
                fc.array(
                    fc.oneof(
                        fc.constant('insert'),
                        fc.constant('update'),
                        fc.constant('delete')
                    ),
                    { minLength: 1, maxLength: 5 }
                ),
                (types) => {
                    const lines = types.map((t, i) => {
                        if (t === 'insert') return buildInsertStr(0, { '0': `val${i}` });
                        if (t === 'update') return buildUpdateStr(0, i, { '0': `upd${i}` });
                        return buildDeleteStr(0, i);
                    });

                    const editStr = `<!--\n${lines.join('\n')}\n-->`;
                    const result = TD.parseEditInstructions(editStr);

                    expect(result).toHaveLength(types.length);
                    result.forEach((inst, i) => {
                        expect(inst.type).toBe(types[i]);
                    });
                }
            ),
            { numRuns: 100 }
        );
    });
});


// ==================== Property 8: 编辑指令执行正确性 ====================

describe('Feature: table-display-module, Property 8: 编辑指令执行正确性', () => {
    beforeEach(resetStorage);

    /**
     * **Validates: Requirements 6.4**
     *
     * For any valid insertRow instruction and initial table state,
     * after execution the table row count increases by 1 and the new row data matches.
     */
    it('executeInstructions: insertRow increases row count by 1 with correct data', () => {
        fc.assert(
            fc.property(
                fc.array(columnArb, { minLength: 1, maxLength: 5 }),
                (columns) => {
                    resetStorage();
                    const tableUid = setupTable(columns);

                    const data = {};
                    columns.forEach((_, i) => { data[i] = `cell${i}`; });

                    const before = TD.getTable(tableUid).rows.length;
                    const result = TD.executeInstructions([{ type: 'insert', tableIndex: 0, data }]);
                    expect(result).toBe(true);

                    const after = TD.getTable(tableUid);
                    expect(after.rows.length).toBe(before + 1);

                    const lastRow = after.rows[after.rows.length - 1];
                    columns.forEach((_, i) => {
                        expect(lastRow.cells[i]).toBe(data[i]);
                    });
                }
            ),
            { numRuns: 100 }
        );
    });

    /**
     * **Validates: Requirements 6.5**
     *
     * For any valid updateRow instruction, after execution the specified cells
     * are updated and other cells remain unchanged.
     */
    it('executeInstructions: updateRow modifies only specified cells', () => {
        fc.assert(
            fc.property(
                fc.array(columnArb, { minLength: 2, maxLength: 5 }),
                (columns) => {
                    resetStorage();
                    const tableUid = setupTable(columns);

                    // Insert a row with known values
                    const initialData = {};
                    columns.forEach((_, i) => { initialData[i] = `orig${i}`; });
                    TD.insertRow(tableUid, initialData);

                    // Update only column 0
                    const updateData = { '0': 'UPDATED' };
                    const result = TD.executeInstructions([
                        { type: 'update', tableIndex: 0, rowIndex: 0, data: updateData }
                    ]);
                    expect(result).toBe(true);

                    const table = TD.getTable(tableUid);
                    expect(table.rows[0].cells[0]).toBe('UPDATED');
                    // Other cells unchanged
                    for (let i = 1; i < columns.length; i++) {
                        expect(table.rows[0].cells[i]).toBe(`orig${i}`);
                    }
                }
            ),
            { numRuns: 100 }
        );
    });

    /**
     * **Validates: Requirements 6.6**
     *
     * For any valid deleteRow instruction, after execution the table row count
     * decreases by 1 and the specified row is removed.
     */
    it('executeInstructions: deleteRow decreases row count by 1', () => {
        fc.assert(
            fc.property(
                fc.array(columnArb, { minLength: 1, maxLength: 5 }),
                fc.integer({ min: 2, max: 5 }),
                (columns, numRows) => {
                    resetStorage();
                    const tableUid = setupTable(columns);

                    // Insert rows
                    const rowUids = [];
                    for (let r = 0; r < numRows; r++) {
                        const rd = {};
                        columns.forEach((_, c) => { rd[c] = `r${r}c${c}`; });
                        const row = TD.insertRow(tableUid, rd);
                        rowUids.push(row.uid);
                    }

                    // Delete first row
                    const deletedUid = rowUids[0];
                    const result = TD.executeInstructions([
                        { type: 'delete', tableIndex: 0, rowIndex: 0 }
                    ]);
                    expect(result).toBe(true);

                    const table = TD.getTable(tableUid);
                    expect(table.rows.length).toBe(numRows - 1);
                    expect(table.rows.map(r => r.uid)).not.toContain(deletedUid);
                }
            ),
            { numRuns: 100 }
        );
    });
});

// ==================== Property 9: 无效指令容错性 ====================

describe('Feature: table-display-module, Property 9: 无效指令容错性', () => {
    beforeEach(resetStorage);

    /**
     * **Validates: Requirements 6.7**
     *
     * For any invalid edit instruction string, parsing should return an empty array
     * or skip invalid entries without crashing.
     */
    it('parseEditInstructions ignores invalid instruction strings without crashing', () => {
        fc.assert(
            fc.property(
                fc.oneof(
                    fc.constant('notAFunction(1,2)'),
                    fc.constant('insertRow()'),
                    fc.constant('updateRow(abc)'),
                    fc.constant('deleteRow(not_a_number)'),
                    fc.constant('randomGarbage!!!'),
                    fc.constant(''),
                    safeTextArb
                ),
                (invalidStr) => {
                    // Should not throw
                    const result = TD.parseEditInstructions(invalidStr);
                    expect(Array.isArray(result)).toBe(true);
                    // All returned instructions should have valid types
                    result.forEach(inst => {
                        expect(['insert', 'update', 'delete']).toContain(inst.type);
                    });
                }
            ),
            { numRuns: 100 }
        );
    });

    /**
     * **Validates: Requirements 6.7**
     *
     * Invalid instructions mixed with valid ones: valid instructions still execute,
     * invalid ones are skipped, and no crash occurs.
     */
    it('executeInstructions skips invalid instructions without affecting valid ones', () => {
        fc.assert(
            fc.property(
                fc.array(columnArb, { minLength: 1, maxLength: 4 }),
                (columns) => {
                    resetStorage();
                    const tableUid = setupTable(columns);

                    const data = {};
                    columns.forEach((_, i) => { data[i] = `v${i}`; });

                    // Mix valid insert with out-of-range tableIndex
                    const instructions = [
                        { type: 'insert', tableIndex: 0, data },
                        { type: 'insert', tableIndex: 999, data },  // invalid: out of range
                        { type: 'delete', tableIndex: 0, rowIndex: 999 }, // invalid: row out of range
                    ];

                    // Should not throw
                    const result = TD.executeInstructions(instructions);
                    // Partial failure expected
                    expect(result).toBe(false);

                    // The valid insert should have succeeded
                    const table = TD.getTable(tableUid);
                    expect(table.rows.length).toBe(1);
                    columns.forEach((_, i) => {
                        expect(table.rows[0].cells[i]).toBe(`v${i}`);
                    });
                }
            ),
            { numRuns: 100 }
        );
    });

    /**
     * **Validates: Requirements 6.7**
     *
     * executeInstructions with unknown instruction types does not crash.
     */
    it('executeInstructions handles unknown instruction types gracefully', () => {
        fc.assert(
            fc.property(
                fc.string({ minLength: 1, maxLength: 20 }).filter(
                    s => !['insert', 'update', 'delete'].includes(s)
                ),
                (unknownType) => {
                    resetStorage();
                    setupTable(['A']);

                    const instructions = [{ type: unknownType, tableIndex: 0, data: { '0': 'x' } }];
                    // Should not throw
                    const result = TD.executeInstructions(instructions);
                    expect(typeof result).toBe('boolean');
                }
            ),
            { numRuns: 100 }
        );
    });
});
