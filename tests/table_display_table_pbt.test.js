/**
 * Property 5: 表格编辑往返一致性
 * Property 4: 全局表格共享验证
 *
 * Feature: table-display-module
 *
 * **Validates: Requirements 4.3, 5.3, 5.4, 5.5**
 */
import { describe, it, expect, beforeEach } from 'vitest';
import fc from 'fast-check';

// Setup WBAP global before loading module
globalThis.window = globalThis.window || {};
globalThis.window.WBAP = globalThis.window.WBAP || { Logger: console };
globalThis.WBAP = globalThis.window.WBAP;

// Mock storage
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

const TableDisplay = window.WBAP.TableDisplay;

// ==================== Arbitraries ====================

/** Arbitrary for valid template JSON (needed to create tables) */
const validTemplateArb = fc.record({
    name: fc.string({ minLength: 1, maxLength: 30 }).filter(s => s.trim().length > 0),
    columns: fc.array(fc.string({ minLength: 1, maxLength: 20 }), { minLength: 1, maxLength: 8 }),
});

/** Arbitrary for row data keyed by column index */
function rowDataArb(numColumns) {
    // Generate a subset of column indices with string values
    return fc.dictionary(
        fc.integer({ min: 0, max: numColumns - 1 }).map(String),
        fc.string({ minLength: 0, maxLength: 50 }),
        { minKeys: 0, maxKeys: numColumns }
    );
}

/** Arbitrary for a cell value */
const cellValueArb = fc.string({ minLength: 0, maxLength: 50 });

// ==================== Helpers ====================

function resetStorage() {
    mockGlobalPools = {};
    mockCharacterConfig = {};
    WBAP.mainConfig = { globalPools: mockGlobalPools };
    WBAP.config = mockCharacterConfig;
    TableDisplay.ensureTableDisplayConfig();
}

function setupTemplate(templateData) {
    const json = JSON.stringify(templateData);
    return TableDisplay.importTemplate(json);
}


// ==================== Property 5: 表格编辑往返一致性 ====================

describe('Feature: table-display-module, Property 5: 表格编辑往返一致性', () => {
    beforeEach(() => {
        resetStorage();
    });

    /**
     * **Validates: Requirements 5.3, 5.5**
     *
     * For any table and valid insertRow operation, after inserting a row and
     * reloading, the table data should match the post-insert state.
     */
    it('insertRow: row count increases by 1 and cell data matches', () => {
        fc.assert(
            fc.property(validTemplateArb, (templateData) => {
                resetStorage();

                const template = setupTemplate(templateData);
                expect(template).not.toBeNull();

                const table = TableDisplay.createTable(template.uid);
                expect(table).not.toBeNull();

                const numCols = templateData.columns.length;
                const rowData = {};
                // Fill all columns with deterministic values
                for (let i = 0; i < numCols; i++) {
                    rowData[i] = `val_${i}`;
                }

                const initialRowCount = table.rows.length;
                const row = TableDisplay.insertRow(table.uid, rowData);
                expect(row).not.toBeNull();

                // Verify row count increased
                const reloaded = TableDisplay.getTable(table.uid);
                expect(reloaded.rows.length).toBe(initialRowCount + 1);

                // Verify cell data matches
                const lastRow = reloaded.rows[reloaded.rows.length - 1];
                for (let i = 0; i < numCols; i++) {
                    expect(lastRow.cells[i]).toBe(rowData[i]);
                }

                return true;
            }),
            { numRuns: 100 }
        );
    });

    /**
     * **Validates: Requirements 5.4, 5.5**
     *
     * For any table with rows, updateRow should modify only the specified cells
     * and the change should persist on reload.
     */
    it('updateRow: specified cells are updated and persist', () => {
        fc.assert(
            fc.property(
                validTemplateArb,
                fc.integer({ min: 1, max: 5 }),
                (templateData, numRows) => {
                    resetStorage();

                    const template = setupTemplate(templateData);
                    const table = TableDisplay.createTable(template.uid);
                    const numCols = templateData.columns.length;

                    // Insert some rows
                    for (let r = 0; r < numRows; r++) {
                        const rd = {};
                        for (let c = 0; c < numCols; c++) {
                            rd[c] = `r${r}_c${c}`;
                        }
                        TableDisplay.insertRow(table.uid, rd);
                    }

                    // Pick a random row to update (use first row for determinism)
                    const targetRow = 0;
                    const updateData = { 0: 'UPDATED_VALUE' };

                    const result = TableDisplay.updateRow(table.uid, targetRow, updateData);
                    expect(result).toBe(true);

                    // Verify the update persists
                    const reloaded = TableDisplay.getTable(table.uid);
                    expect(reloaded.rows[targetRow].cells[0]).toBe('UPDATED_VALUE');

                    // Verify other cells in the same row are unchanged
                    if (numCols > 1) {
                        expect(reloaded.rows[targetRow].cells[1]).toBe(`r${targetRow}_c1`);
                    }

                    return true;
                }
            ),
            { numRuns: 100 }
        );
    });

    /**
     * **Validates: Requirements 5.4, 5.5**
     *
     * For any table with rows, deleteRow should reduce row count by 1
     * and remove the correct row.
     */
    it('deleteRow: row count decreases by 1 and correct row is removed', () => {
        fc.assert(
            fc.property(
                validTemplateArb,
                fc.integer({ min: 2, max: 5 }),
                (templateData, numRows) => {
                    resetStorage();

                    const template = setupTemplate(templateData);
                    const table = TableDisplay.createTable(template.uid);
                    const numCols = templateData.columns.length;

                    // Insert rows with identifiable data
                    const rowUids = [];
                    for (let r = 0; r < numRows; r++) {
                        const rd = {};
                        for (let c = 0; c < numCols; c++) {
                            rd[c] = `r${r}_c${c}`;
                        }
                        const row = TableDisplay.insertRow(table.uid, rd);
                        rowUids.push(row.uid);
                    }

                    // Delete first row
                    const deleteIndex = 0;
                    const deletedUid = rowUids[deleteIndex];
                    const result = TableDisplay.deleteRow(table.uid, deleteIndex);
                    expect(result).toBe(true);

                    // Verify row count decreased
                    const reloaded = TableDisplay.getTable(table.uid);
                    expect(reloaded.rows.length).toBe(numRows - 1);

                    // Verify the deleted row's uid is gone
                    const remainingUids = reloaded.rows.map(r => r.uid);
                    expect(remainingUids).not.toContain(deletedUid);

                    return true;
                }
            ),
            { numRuns: 100 }
        );
    });

    /**
     * **Validates: Requirements 5.3, 5.5**
     *
     * For any table, updateCell should modify only the targeted cell
     * and the change should persist.
     */
    it('updateCell: only targeted cell is modified and persists', () => {
        fc.assert(
            fc.property(
                validTemplateArb,
                cellValueArb,
                (templateData, newValue) => {
                    resetStorage();

                    const template = setupTemplate(templateData);
                    const table = TableDisplay.createTable(template.uid);
                    const numCols = templateData.columns.length;

                    // Insert a row
                    const rd = {};
                    for (let c = 0; c < numCols; c++) {
                        rd[c] = `original_${c}`;
                    }
                    TableDisplay.insertRow(table.uid, rd);

                    // Update cell at (0, 0)
                    const result = TableDisplay.updateCell(table.uid, 0, 0, newValue);
                    expect(result).toBe(true);

                    // Verify the targeted cell changed
                    const reloaded = TableDisplay.getTable(table.uid);
                    expect(reloaded.rows[0].cells[0]).toBe(newValue);

                    // Verify other cells unchanged
                    for (let c = 1; c < numCols; c++) {
                        expect(reloaded.rows[0].cells[c]).toBe(`original_${c}`);
                    }

                    return true;
                }
            ),
            { numRuns: 100 }
        );
    });
});


// ==================== Property 4: 全局表格共享验证 ====================

describe('Feature: table-display-module, Property 4: 全局表格共享验证', () => {
    beforeEach(() => {
        resetStorage();
    });

    /**
     * **Validates: Requirements 4.3**
     *
     * Tables are stored globally, so switching characters should still
     * show the same tables (they are shared, not per-character).
     */
    it('tables are shared across characters (global storage)', () => {
        fc.assert(
            fc.property(
                validTemplateArb,
                fc.integer({ min: 1, max: 3 }),
                (templateData, numRows) => {
                    // Reset global storage
                    mockGlobalPools = {};
                    WBAP.mainConfig = { globalPools: mockGlobalPools };

                    // === Character A ===
                    const charConfigA = {};
                    mockCharacterConfig = charConfigA;
                    WBAP.config = charConfigA;
                    WBAP.CharacterManager = {
                        getCurrentCharacterConfig: () => mockCharacterConfig
                    };
                    TableDisplay.ensureTableDisplayConfig();

                    // Import template (global, shared)
                    const template = setupTemplate(templateData);
                    expect(template).not.toBeNull();

                    // Create table (now stored globally)
                    const table = TableDisplay.createTable(template.uid);
                    expect(table).not.toBeNull();

                    // Insert rows
                    const numCols = templateData.columns.length;
                    for (let r = 0; r < numRows; r++) {
                        const rd = {};
                        for (let c = 0; c < numCols; c++) {
                            rd[c] = `r${r}_c${c}`;
                        }
                        TableDisplay.insertRow(table.uid, rd);
                    }

                    // Snapshot tables
                    const tablesSnapshot = JSON.parse(JSON.stringify(TableDisplay.getTables()));

                    // === Switch to Character B ===
                    const charConfigB = {};
                    mockCharacterConfig = charConfigB;
                    WBAP.config = charConfigB;
                    WBAP.CharacterManager = {
                        getCurrentCharacterConfig: () => mockCharacterConfig
                    };
                    TableDisplay.ensureTableDisplayConfig();

                    // Verify Character B sees the same tables (global shared)
                    const tablesFromB = TableDisplay.getTables();
                    expect(tablesFromB).toEqual(tablesSnapshot);
                    expect(tablesFromB.length).toBe(1);
                    expect(tablesFromB[0].rows.length).toBe(numRows);

                    return true;
                }
            ),
            { numRuns: 100 }
        );
    });

    /**
     * **Validates: Requirements 4.3**
     *
     * Since tables are global, per-character settings (enabled, extractTag, renderInMessage)
     * should still be independent across characters.
     */
    it('per-character settings remain independent even with shared tables', () => {
        fc.assert(
            fc.property(validTemplateArb, (templateData) => {
                // Reset global storage
                mockGlobalPools = {};
                WBAP.mainConfig = { globalPools: mockGlobalPools };

                // === Setup Character A ===
                const charConfigA = {};
                mockCharacterConfig = charConfigA;
                WBAP.config = charConfigA;
                WBAP.CharacterManager = {
                    getCurrentCharacterConfig: () => mockCharacterConfig
                };
                TableDisplay.ensureTableDisplayConfig();
                TableDisplay.setEnabled(true);

                const template = setupTemplate(templateData);
                const table = TableDisplay.createTable(template.uid);
                const numCols = templateData.columns.length;
                const rd = {};
                for (let c = 0; c < numCols; c++) rd[c] = `val_${c}`;
                TableDisplay.insertRow(table.uid, rd);

                // === Setup Character B with different settings ===
                const charConfigB = {};
                mockCharacterConfig = charConfigB;
                WBAP.config = charConfigB;
                WBAP.CharacterManager = {
                    getCurrentCharacterConfig: () => mockCharacterConfig
                };
                TableDisplay.ensureTableDisplayConfig();
                TableDisplay.setEnabled(false);

                // Verify B sees the same tables (global)
                expect(TableDisplay.getTables().length).toBe(1);

                // But B has different enabled state
                expect(TableDisplay.isEnabled()).toBe(false);

                // Switch back to A
                mockCharacterConfig = charConfigA;
                WBAP.config = charConfigA;
                WBAP.CharacterManager = {
                    getCurrentCharacterConfig: () => mockCharacterConfig
                };

                // A still has its own enabled state
                expect(TableDisplay.isEnabled()).toBe(true);

                // Tables are still the same
                expect(TableDisplay.getTables().length).toBe(1);

                return true;
            }),
            { numRuns: 100 }
        );
    });
});
