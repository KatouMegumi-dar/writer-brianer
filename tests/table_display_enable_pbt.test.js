/**
 * Property 10: 模块禁用数据保留
 *
 * Feature: table-display-module, Property 10: 模块禁用数据保留
 *
 * **Validates: Requirements 8.2, 8.3, 8.4**
 *
 * For any character with existing table data, disabling the module and then
 * re-enabling it should preserve all table data unchanged.
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

// Mock document.querySelectorAll for setEnabled's DOM cleanup
globalThis.document = globalThis.document || {
    querySelectorAll: () => []
};

await import('../modules/table_display.js');

const TableDisplay = window.WBAP.TableDisplay;

// ==================== Arbitraries ====================

const validTemplateArb = fc.record({
    name: fc.string({ minLength: 1, maxLength: 30 }).filter(s => s.trim().length > 0),
    columns: fc.array(fc.string({ minLength: 1, maxLength: 20 }), { minLength: 1, maxLength: 8 }),
});

// ==================== Helpers ====================

function resetStorage() {
    mockGlobalPools = {};
    mockCharacterConfig = {};
    WBAP.mainConfig = { globalPools: mockGlobalPools };
    WBAP.config = mockCharacterConfig;
    WBAP.CharacterManager = {
        getCurrentCharacterConfig: () => mockCharacterConfig
    };
    TableDisplay.ensureTableDisplayConfig();
}

function setupTemplate(templateData) {
    return TableDisplay.importTemplate(JSON.stringify(templateData));
}

// ==================== Property 10: 模块禁用数据保留 ====================

describe('Feature: table-display-module, Property 10: 模块禁用数据保留', () => {
    beforeEach(() => {
        resetStorage();
    });

    /**
     * **Validates: Requirements 8.2, 8.3, 8.4**
     *
     * For any character with table data, disabling and re-enabling the module
     * should preserve all table data (rows, cells) unchanged.
     */
    it('disabling and re-enabling preserves all table data', () => {
        fc.assert(
            fc.property(
                validTemplateArb,
                fc.integer({ min: 1, max: 5 }),
                (templateData, numRows) => {
                    resetStorage();

                    // Enable module and set up data
                    TableDisplay.setEnabled(true);
                    expect(TableDisplay.isEnabled()).toBe(true);

                    const template = setupTemplate(templateData);
                    expect(template).not.toBeNull();

                    const table = TableDisplay.createTable(template.uid);
                    expect(table).not.toBeNull();

                    const numCols = templateData.columns.length;
                    for (let r = 0; r < numRows; r++) {
                        const rd = {};
                        for (let c = 0; c < numCols; c++) {
                            rd[c] = `row${r}_col${c}`;
                        }
                        TableDisplay.insertRow(table.uid, rd);
                    }

                    // Snapshot data before disabling
                    const snapshotBefore = JSON.parse(JSON.stringify(TableDisplay.getTables()));

                    // Disable module
                    TableDisplay.setEnabled(false);
                    expect(TableDisplay.isEnabled()).toBe(false);

                    // Verify data still exists while disabled
                    const tablesWhileDisabled = TableDisplay.getTables();
                    expect(tablesWhileDisabled.length).toBe(snapshotBefore.length);

                    // Re-enable module
                    TableDisplay.setEnabled(true);
                    expect(TableDisplay.isEnabled()).toBe(true);

                    // Verify data is identical after re-enable
                    const tablesAfter = TableDisplay.getTables();
                    expect(tablesAfter).toEqual(snapshotBefore);

                    return true;
                }
            ),
            { numRuns: 100 }
        );
    });

    /**
     * **Validates: Requirements 8.2, 8.3**
     *
     * Disabling the module should only change the enabled flag,
     * not modify tables, extractTag, or renderInMessage settings.
     */
    it('disabling only changes enabled flag, other config fields preserved', () => {
        fc.assert(
            fc.property(
                validTemplateArb,
                fc.integer({ min: 1, max: 3 }),
                (templateData, numRows) => {
                    resetStorage();

                    TableDisplay.setEnabled(true);

                    const template = setupTemplate(templateData);
                    const table = TableDisplay.createTable(template.uid);
                    const numCols = templateData.columns.length;
                    for (let r = 0; r < numRows; r++) {
                        const rd = {};
                        for (let c = 0; c < numCols; c++) rd[c] = `v${r}_${c}`;
                        TableDisplay.insertRow(table.uid, rd);
                    }

                    // Snapshot config fields before disabling
                    const charConfig = TableDisplay.getCharacterTableDisplayConfig();
                    const snapshotTables = JSON.parse(JSON.stringify(TableDisplay.getTables()));
                    const snapshotExtractTag = charConfig.extractTag;
                    const snapshotRenderInMessage = charConfig.renderInMessage;

                    // Disable
                    TableDisplay.setEnabled(false);

                    // Verify only enabled changed
                    const afterDisable = TableDisplay.getCharacterTableDisplayConfig();
                    expect(afterDisable.enabled).toBe(false);
                    expect(TableDisplay.getTables()).toEqual(snapshotTables);
                    expect(afterDisable.extractTag).toBe(snapshotExtractTag);
                    expect(afterDisable.renderInMessage).toBe(snapshotRenderInMessage);

                    return true;
                }
            ),
            { numRuns: 100 }
        );
    });

    /**
     * **Validates: Requirements 8.4**
     *
     * The enabled state should be stored in the character config,
     * so different characters can have independent enable/disable states.
     */
    it('enabled state is stored per-character independently', () => {
        fc.assert(
            fc.property(
                fc.boolean(),
                fc.boolean(),
                (enabledA, enabledB) => {
                    // Setup Character A
                    mockGlobalPools = {};
                    WBAP.mainConfig = { globalPools: mockGlobalPools };
                    const charConfigA = {};
                    mockCharacterConfig = charConfigA;
                    WBAP.config = charConfigA;
                    WBAP.CharacterManager = {
                        getCurrentCharacterConfig: () => mockCharacterConfig
                    };
                    TableDisplay.ensureTableDisplayConfig();
                    TableDisplay.setEnabled(enabledA);

                    // Setup Character B
                    const charConfigB = {};
                    mockCharacterConfig = charConfigB;
                    WBAP.config = charConfigB;
                    WBAP.CharacterManager = {
                        getCurrentCharacterConfig: () => mockCharacterConfig
                    };
                    TableDisplay.ensureTableDisplayConfig();
                    TableDisplay.setEnabled(enabledB);

                    // Switch back to A and verify
                    mockCharacterConfig = charConfigA;
                    WBAP.config = charConfigA;
                    WBAP.CharacterManager = {
                        getCurrentCharacterConfig: () => mockCharacterConfig
                    };
                    expect(TableDisplay.isEnabled()).toBe(enabledA);

                    // Switch back to B and verify
                    mockCharacterConfig = charConfigB;
                    WBAP.config = charConfigB;
                    WBAP.CharacterManager = {
                        getCurrentCharacterConfig: () => mockCharacterConfig
                    };
                    expect(TableDisplay.isEnabled()).toBe(enabledB);

                    return true;
                }
            ),
            { numRuns: 100 }
        );
    });
});
